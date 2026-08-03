# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import json
from datetime import datetime, time

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, get_datetime, getdate, now_datetime, nowdate
from vernon_project.vernon_project.doctype.project.project import get_project_admins

MEETING_SCHEDULED = "⚪️ Scheduled"
MEETING_DONE = "✅ Done"


class Meeting(Document):
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		self.snapshot_point_from_level()
		self.validate_has_participant()
		self.validate_participants_in_team()
		self.validate_recurrence_rule()

	# ---- Recurrence (mirrors Project Todo; reuses the pure recurrence engine) ----
	def _rule(self):
		from vernon_project.vernon_project.doctype.project_todo.recurrence import Rule, parse_weekdays
		return Rule(
			frequency=self.recurring_frequency,
			interval=self.recurring_interval or 1,
			weekdays=tuple(parse_weekdays(self.recurring_weekdays)),
			monthly_mode=self.recurring_monthly_mode or "Day of Month",
			day_of_month=int(self.recurring_day_of_month) if self.recurring_day_of_month else None,
			nth=self.recurring_nth or "First",
		)

	def _exceptions(self):
		from vernon_project.vernon_project.doctype.project_todo.recurrence import (
			Exceptions, parse_weekdays, parse_monthdays, parse_ranges,
		)
		return Exceptions(
			weekdays=tuple(parse_weekdays(self.recurring_exception_weekdays)),
			monthdays=tuple(parse_monthdays(self.recurring_exception_monthdays)),
			ranges=tuple(parse_ranges(self.recurring_exception_dates)),
			behavior=self.recurring_exception_behavior or "Skip",
		)

	def calculate_next_occurrence(self, from_date):
		"""Next occurrence date from `from_date` using this meeting's rule. None if not recurring."""
		from vernon_project.vernon_project.doctype.project_todo.recurrence import next_occurrence
		if not from_date or not self.recurring_frequency:
			return None
		return next_occurrence(getdate(from_date), self._rule())

	def validate_recurrence_rule(self):
		if not self.is_recurring:
			return
		from vernon_project.vernon_project.doctype.project_todo.recurrence import (
			parse_weekdays, format_weekdays, parse_monthdays, parse_ranges,
		)
		if not self.scheduled_at:
			frappe.throw(_("A recurring meeting needs a scheduled date and time."))
		if not self.recurring_frequency:
			frappe.throw(_("Pick a recurring frequency."))
		self.recurring_interval = max(1, int(self.recurring_interval or 1))
		idxs = parse_weekdays(self.recurring_weekdays)  # raises on bad token
		self.recurring_weekdays = format_weekdays(idxs)
		if self.recurring_day_of_month:
			d = int(self.recurring_day_of_month)
			if d < 1 or d > 31:
				frappe.throw(_("Day of month must be between 1 and 31."))
		if self.recurring_frequency == "Monthly" and self.recurring_monthly_mode == "Nth Weekday" and len(idxs) != 1:
			frappe.throw(_("Nth-weekday recurrence needs exactly one weekday."))
		# Exceptions: normalize each field; canonicalize the dates JSON.
		ex_idxs = parse_weekdays(self.recurring_exception_weekdays)  # raises on bad token
		if len(ex_idxs) >= 7:
			frappe.throw(_("Exception weekdays cannot cover all 7 days — the series would never occur."))
		self.recurring_exception_weekdays = format_weekdays(ex_idxs)
		self.recurring_exception_monthdays = ",".join(
			str(n) for n in parse_monthdays(self.recurring_exception_monthdays)
		)
		ranges = parse_ranges(self.recurring_exception_dates)  # raises on bad ISO date
		self.recurring_exception_dates = (
			json.dumps([{"from": str(a), "to": str(b)} for a, b in ranges]) if ranges else ""
		)
		if not self.recurring_exception_behavior:
			self.recurring_exception_behavior = "Skip"
		# Anchor the series rhythm to the first scheduled date (un-shifted rule date).
		if not self.recurring_anchor_date:
			self.recurring_anchor_date = getdate(self.scheduled_at)

	def validate_has_participant(self):
		# ponytail: escape hatch for the recurrence generator — when every invitee
		# left the team build_occurrence produces a 0-participant successor, and
		# blocking it would silently stall the whole series (see build_occurrence).
		if self.flags.ignore_participant_check:
			return
		if not [row for row in self.participants if row.user]:
			frappe.throw(_("A meeting must have at least one participant."))

	def validate_participants_in_team(self):
		if not self.project:
			return
		team = set(frappe.get_all(
			"Project Team",
			filters={"parent": self.project, "parenttype": "Project"},
			pluck="user",
		))
		for row in self.participants:
			if row.user and row.user not in team:
				frappe.throw(_("Participant '{0}' is not a member of the Project Team.").format(row.user))

	def snapshot_point_from_level(self):
		"""point = group.base_rate_per_minute × estimated × difficulty%.
		Mirrors Project Todo.snapshot_point_from_level (flat, no timing)."""
		if not self.group:
			self.point = 0
			self.level = None
			self.level_type = None
			self.level_id = None
			return

		def _compute(difficulty_percent):
			base_rate = frappe.db.get_value("Group", self.group, "base_rate_per_minute") or 0
			minutes = float(self.estimated or 0)
			pct = float(difficulty_percent or 0)
			return round(float(base_rate) * minutes * (pct / 100.0))

		if self.level_id:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_id": self.level_id},
				["type_name", "level_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level = row.level_name
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			return
		if self.level:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_name": self.level},
				["name", "level_id", "type_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level_id = row.level_id
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			return
		self.point = 0

	DONE = MEETING_DONE

	def on_change(self):
		old = self.get_doc_before_save()
		prev = old.status if old else None
		if prev == self.status:
			return
		if self.status == self.DONE:
			self.sync_point_ledger()
			# A done meeting queues its successor immediately (the scheduler also
			# catches series whose current occurrence is never marked done).
			if self.is_recurring:
				try:
					generate_next(self, force=True)
				except Exception:
					frappe.log_error(title="recurring meeting generate_next on done failed")
		elif prev == self.DONE:
			self.remove_ledger()

	def sync_point_ledger(self):
		"""Credit each attendee once. Idempotent on (meeting, user).

		Attendees default to the full participant list, but mark_meeting_done can
		pass an explicit `award_users` set via flags — so no-shows are skipped and
		people who turned up without an invite can still be credited."""
		users = self.flags.get("award_users")
		if users is None:
			users = [row.user for row in self.participants]
		for user in users:
			self._upsert_ledger_row(user)
			self._notify_award(user)

	def _upsert_ledger_row(self, user):
		if not user:
			return
		existing = frappe.db.exists("Point Ledger", {"meeting": self.name, "user": user})
		values = {
			"user": user,
			"role": "Participant",
			"source": "Meeting",
			"meeting": self.name,
			"group": self.group,
			"project": self.project,
			"level_name": self.level,
			"point": self.point,
			"points_earned": self.point,
			"credited_on": now_datetime(),
		}
		if existing:
			doc = frappe.get_doc("Point Ledger", existing)
			doc.update(values)
			doc.save(ignore_permissions=True)
		else:
			frappe.get_doc({"doctype": "Point Ledger", **values}).insert(ignore_permissions=True)

	def remove_ledger(self):
		for name in frappe.get_all("Point Ledger", filters={"meeting": self.name}, pluck="name"):
			frappe.delete_doc("Point Ledger", name, ignore_permissions=True, force=True)

	def on_trash(self):
		# Deleting a done meeting must claw back its awarded points, else the
		# Point Ledger rows dangle (and block the delete via link constraint).
		self.remove_ledger()

	def _notify_award(self, user):
		"""Best-effort in-app + push notification; never breaks the save."""
		try:
			from vernon_project.api.mobile import _notify
			_notify(
				recipient=user,
				type="Points",
				title="You earned points",
				body=f'"{self.title}" meeting completed: +{int(self.point or 0)} points.',
				reference_doctype="Meeting",
				reference_name=self.name,
				actor=frappe.session.user,
			)
		except Exception:
			frappe.log_error(title="Meeting _notify_award failed")


def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	user_esc = frappe.db.escape(user)
	return f"""
		EXISTS (
			SELECT 1 FROM `tabProject` p
			WHERE p.name = `tabMeeting`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR EXISTS (
						SELECT 1 FROM `tabProject Admin User` pa
						WHERE pa.parent = p.name AND pa.parentfield = 'project_admins' AND pa.user = {user_esc}
					)
					OR EXISTS (
						SELECT 1 FROM `tabProject Team` pt
						WHERE pt.parent = p.name AND pt.user = {user_esc}
					)
				)
		)
	"""


def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True
	if not doc.project:
		return False
	project = frappe.get_doc("Project", doc.project)
	if user == project.project_owner or user == project.project_leader or user in get_project_admins(project):
		return True
	if any(t.user == user for t in project.team_members):
		return True
	return False


# --------------------------------------------------------------------------------
# RECURRENCE  (series roll-forward — mirrors Project Todo, base date = scheduled_at)
# --------------------------------------------------------------------------------
_ROLL = ("name, project, title, organizer, scheduled_at, estimated, notes, `group`, "
         "level_id, status, is_recurring, recurring_frequency, recurring_interval, "
         "recurring_weekdays, recurring_monthly_mode, recurring_day_of_month, recurring_nth, "
         "recurring_until, recurring_exception_weekdays, recurring_exception_monthdays, "
         "recurring_exception_dates, recurring_exception_behavior, recurring_anchor_date, "
         "original_meeting")


def series_root(name, original_meeting):
	return original_meeting or name


def latest_occurrence(root):
	rows = frappe.db.sql(
		f"SELECT {_ROLL} FROM `tabMeeting` WHERE name=%(r)s OR original_meeting=%(r)s "
		"ORDER BY scheduled_at DESC, creation DESC LIMIT 1",
		{"r": root}, as_dict=True,
	)
	return rows[0] if rows else None


def occurrence_exists(root, day):
	return bool(frappe.db.sql(
		"SELECT 1 FROM `tabMeeting` WHERE (name=%(r)s OR original_meeting=%(r)s) "
		"AND DATE(scheduled_at)=%(d)s LIMIT 1",
		{"r": root, "d": day},
	))


def build_occurrence(anchor, next_date, anchor_date=None):
	"""Insert the successor meeting on `next_date`, keeping the anchor's time-of-day,
	invitees, group/level and recurrence config. Returns the new doc."""
	old_dt = get_datetime(anchor.scheduled_at) if anchor.scheduled_at else None
	tod = old_dt.time() if old_dt else time(9, 0)
	new_scheduled = datetime.combine(getdate(next_date), tod)
	users = frappe.get_all(
		"Meeting Participant",
		filters={"parent": anchor.name, "parenttype": "Meeting"},
		pluck="user",
	)
	# Keep only invitees still on the project team — a member who left would make the
	# successor fail validate_participants_in_team and silently stall the whole series.
	if users:
		team = set(frappe.get_all(
			"Project Team", filters={"parent": anchor.project, "parenttype": "Project"}, pluck="user",
		))
		users = [u for u in users if u in team]
	doc = frappe.get_doc({
		"doctype": "Meeting",
		"project": anchor.project,
		"title": anchor.title,
		"organizer": anchor.organizer,
		"scheduled_at": new_scheduled,
		"estimated": anchor.estimated,
		"group": anchor.get("group"),
		"level_id": anchor.level_id,
		"notes": anchor.notes,
		"status": MEETING_SCHEDULED,
		"participants": [{"user": u} for u in users if u],
		"is_recurring": 1,
		"recurring_frequency": anchor.recurring_frequency,
		"recurring_interval": anchor.recurring_interval,
		"recurring_weekdays": anchor.recurring_weekdays,
		"recurring_monthly_mode": anchor.recurring_monthly_mode,
		"recurring_day_of_month": anchor.recurring_day_of_month,
		"recurring_nth": anchor.recurring_nth,
		"recurring_until": anchor.recurring_until,
		"recurring_exception_weekdays": anchor.recurring_exception_weekdays,
		"recurring_exception_monthdays": anchor.recurring_exception_monthdays,
		"recurring_exception_dates": anchor.recurring_exception_dates,
		"recurring_exception_behavior": anchor.recurring_exception_behavior,
		# anchor_date is the un-shifted rule date so the next occurrence computes from
		# rhythm, not a shifted date — the series never drifts.
		"recurring_anchor_date": anchor_date or next_date,
		"original_meeting": series_root(anchor.name, anchor.original_meeting),
	})
	doc.flags.ignore_participant_check = True
	doc.insert(ignore_permissions=True)
	return doc


def generate_next(anchor, force=False):
	"""Idempotent single-step roll-forward for a meeting series. Returns the new doc or None.

	force=True (on-done): queue the successor immediately.
	force=False (scheduler): only once the computed date has arrived (<= today), so a
	still-open future occurrence is never pre-generated.
	"""
	if not anchor or not anchor.is_recurring or not anchor.recurring_frequency:
		return None
	root = series_root(anchor.name, anchor.original_meeting)
	if frappe.db.get_value("Meeting", root, "recurring_paused"):
		return None
	head = frappe.get_doc("Meeting", anchor.name)
	# Basis is the un-shifted rule date so a prior Shift never drifts the series rhythm.
	basis = anchor.recurring_anchor_date or (getdate(anchor.scheduled_at) if anchor.scheduled_at else None)
	if not basis:
		return None
	next_date = head.calculate_next_occurrence(basis)
	if not next_date:
		return None
	next_date = getdate(next_date)
	today = getdate(nowdate())
	if next_date < today:  # long gap / resume: skip the missed window, don't backfill
		from vernon_project.vernon_project.doctype.project_todo.recurrence import first_on_or_after
		next_date = getdate(first_on_or_after(today, head._rule()))
	from vernon_project.vernon_project.doctype.project_todo.recurrence import (
		advance_while_blocked, next_occurrence,
	)
	rule = head._rule()
	until = getdate(anchor.recurring_until) if anchor.recurring_until else None
	exc = head._exceptions()
	blocked = lambda d: exc.blocks(d)
	rule_date = next_date
	if exc.behavior == "Shift":
		next_date = advance_while_blocked(
			rule_date, lambda d: getdate(add_days(d, 1)), blocked, until=until
		)
		anchor_date = rule_date
	else:
		next_date = advance_while_blocked(
			rule_date, lambda d: getdate(next_occurrence(d, rule)), blocked, until=until
		)
		anchor_date = next_date
	if next_date is None:
		return None
	if not force and next_date > today:
		return None
	# Serialize the on-done txn and the scheduler txn on the series root, then dedup.
	frappe.db.sql("SELECT name FROM `tabMeeting` WHERE name=%s FOR UPDATE", root)
	if occurrence_exists(root, next_date):
		return None
	return build_occurrence(anchor, next_date, anchor_date)
