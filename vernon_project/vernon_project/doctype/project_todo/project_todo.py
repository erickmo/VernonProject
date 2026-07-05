# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, add_months, getdate, nowdate, now_datetime, get_datetime
from datetime import datetime


class ProjectTodo(Document):

	def validate(self):
		self.sync_project_from_detail()
		self.snapshot_point_from_level()
		self.validate_create_permission()
		self.validate_assigned_to_team_member()
		self.validate_start_date()
		self.validate_done_todo_fields()
		self.validate_estimated_max()
		self.validate_project_admin_status_update()
		self.calculate_total_estimated_hours()
		self.track_phase_changes()
		self.track_waiting()
		self.validate_block_links()
		self.validate_recurrence_rule()

	def validate_block_links(self):
		"""A task can't block or depend on itself; drop duplicate rows."""
		for fieldname in ("blocking", "blocked_by"):
			seen = set()
			rows = []
			for row in self.get(fieldname):
				if not row.todo or row.todo == self.name or row.todo in seen:
					continue
				seen.add(row.todo)
				rows.append(row)
			self.set(fieldname, rows)

	def sync_project_from_detail(self):
		"""Keep the denormalized `project` in sync with the linked Project Detail.

		`project` is a form helper that scopes the Project Detail (project_detail)
		searchable select; it must always match project_detail.project so it is
		correct for docs created via API/mobile (which only set project_detail).
		"""
		if self.project_detail:
			self.project = frappe.get_value("Project Detail", self.project_detail, "project")

	def snapshot_point_from_level(self):
		"""Resolve the chosen type+level and compute `point` from time × difficulty.

		Truth is `level_id` (unique per level row). `level` caches the level name,
		`level_type` caches the type name. Point is derived:
		    point = group.base_rate_per_minute × estimated_minutes × difficulty%

		- No group / nothing chosen: clear point to 0.
		- level_id resolves: refresh level + level_type, recompute point.
		- level_id stale (row deleted): keep cached level/level_type/point, no throw.
		- Legacy level name without level_id: name is not unique across types, so this
		  is a last-resort match (level_id was backfilled for all todos previously);
		  take the first match, backfill level_id, recompute. No match: keep, no throw.
		"""
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
			# Points are always whole numbers.
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
			# else: row deleted — keep cached level/level_type/point untouched
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

	def validate_start_date(self):
		"""Start date must be on or before the deadline."""
		if self.start_date and self.deadline and getdate(self.start_date) > getdate(self.deadline):
			frappe.throw(_("Start Date cannot be after the Deadline."))

	def validate_assigned_to_team_member(self):
		if not self.assigned_to or not self.project_detail:
			return
		project_name = frappe.get_value("Project Detail", self.project_detail, "project")
		if not project_name:
			return
		team = frappe.get_all(
			"Project Team",
			filters={"parent": project_name, "parenttype": "Project"},
			pluck="user",
		)
		if self.assigned_to not in team:
			frappe.throw(
				f"Assigned To '{self.assigned_to}' in ToDo '{self.to_do}' "
				"is not a member of the Project Team."
			)

	def get_old_doc(self):
		"""Return the previously-saved version, or None for new docs."""
		old_doc = self.get_doc_before_save()
		if old_doc:
			return old_doc
		if self.is_new() or not self.name:
			return None
		if not frappe.db.exists("Project Todo", self.name):
			return None
		return frappe.get_doc("Project Todo", self.name)

	def validate_create_permission(self):
		"""Only the Project Owner or Project Leader may create a task (new row)."""
		if not self.is_new():
			return
		user = frappe.session.user
		if "System Manager" in frappe.get_roles(user):
			return
		if not self.project_detail:
			frappe.throw(_("Task must belong to a project detail"), frappe.PermissionError)
		project_name = frappe.get_value("Project Detail", self.project_detail, "project")
		if not project_name:
			frappe.throw(_("Project detail has no project"), frappe.PermissionError)
		owner, leader = frappe.get_value(
			"Project", project_name, ["project_owner", "project_leader"]
		)
		if user not in (owner, leader):
			frappe.throw(
				_("Only the Project Owner or Project Leader can create tasks."),
				frappe.PermissionError,
			)

	def validate_project_admin_status_update(self):
		"""Prevent Project Admin from updating todo status"""
		# Skip validation for new documents
		if self.is_new():
			return

		# Get current user
		user = frappe.session.user

		# Skip validation for System Manager
		if "System Manager" in frappe.get_roles(user):
			return

		# Get the previous version of the document
		old_doc = self.get_old_doc()
		if not old_doc:
			return

		# Check if status has been modified
		if self.status == old_doc.status:
			return

		# Get project to check if user is project_admin
		if not self.project_detail:
			return

		parent_detail = frappe.get_doc("Project Detail", self.project_detail)
		if not parent_detail.project:
			return

		project = frappe.get_doc("Project", parent_detail.project)

		# If user is project_admin, prevent status update
		if project.project_admin and user == project.project_admin:
			frappe.throw(
				"Project Admin tidak memiliki izin untuk mengupdate status todo. "
				"Silakan hubungi Project Owner atau Project Leader.",
				title="Permission Denied"
			)

	def validate_estimated_max(self):
		mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0
		if mx and self.estimated and float(self.estimated) > mx:
			frappe.throw(
				f"Estimated minutes ({int(float(self.estimated))}) exceeds the maximum ({int(mx)})."
			)

	def validate_done_todo_fields(self):
		"""Prevent editing assigned_to, estimated, and deadline when status is Done or Completed"""
		# Skip validation for new documents
		if self.is_new():
			return

		# Check if status is Done or Completed
		if self.status not in ["🟠 Done", "✅ Completed"]:
			return

		# Get the previous version of the document
		old_doc = self.get_old_doc()
		if not old_doc:
			return

		# Check if protected fields have been modified
		protected_fields = {
			"assigned_to": "Assigned To",
			"estimated": "Estimated (minutes)",
			"start_date": "Start Date",
			"deadline": "Deadline"
		}

		modified_fields = []
		for field, label in protected_fields.items():
			if self.get(field) != old_doc.get(field):
				modified_fields.append(label)

		if modified_fields:
			frappe.throw(
				f"Cannot modify {', '.join(modified_fields)} when Todo status is '{self.status}'. "
				"These fields are locked once the todo is marked as Done or Completed.",
				title="Cannot Edit Completed Todo"
			)

	def _compute_earned(self):
		"""Return (assignee_earned, leader_earned, mentor_earned, late_days, early_days).

		Uses phase_completed_at (fallback completed_at, then now) vs deadline.
		Weights are percentages. No flooring; negatives allowed.
		"""
		grp = frappe.get_doc("Group", self.group) if self.group else None
		point = float(self.point or 0)
		if not grp:
			return 0.0, 0.0, 0.0, 0, 0

		completed = self.phase_completed_at or self.completed_at or now_datetime()
		completed_date = getdate(completed)
		deadline = getdate(self.deadline) if self.deadline else completed_date
		delta = (completed_date - deadline).days
		late_days = max(0, delta)
		early_days = max(0, -delta)

		# Assignee earns the level's point directly (no per-group weight multiplier),
		# adjusted only for timing: late days subtract, early days add.
		lp = float(grp.late_penalty or 0) / 100.0
		eb = float(grp.early_bonus or 0) / 100.0
		assignee = point - late_days * lp * point + early_days * eb * point

		# Leader earns a % of the assignee's ACTUAL earned points, sharing the
		# assignee's fate (timing is already baked into `assignee`). The weight
		# switches on lateness: leader_weight for on-time/early todos,
		# leader_late_weight for late ones. So assignee 100 on-time -> leader 10
		# at 10%; assignee -50 late -> leader -55 at a 110% late weight.
		lw = float(grp.leader_weight or 0) / 100.0
		llw = float(grp.leader_late_weight or 0) / 100.0
		leader = assignee * (llw if late_days > 0 else lw)
		# Mentor earns a flat share of assignee_earned (timing already baked into
		# assignee); no separate mentor late/early knobs.
		mw = float(grp.mentor_weight or 0) / 100.0
		mentor = assignee * mw
		# Earned points are always whole numbers.
		return round(assignee), round(leader), round(mentor), late_days, early_days

	def _upsert_ledger_row(self, role, user, points, late_days, early_days, source="Todo"):
		if not user:
			return
		existing = frappe.db.exists(
			"Point Ledger", {"todo": self.name, "role": role}
		)
		values = {
			"user": user,
			"role": role,
			"todo": self.name,
			"group": self.group,
			"project": self.project,
			"level_name": self.level,
			"point": self.point,
			"late_days": late_days,
			"early_days": early_days,
			"points_earned": points,
			"source": source,
			"credited_on": now_datetime(),
		}
		if existing:
			doc = frappe.get_doc("Point Ledger", existing)
			doc.update(values)
			doc.save(ignore_permissions=True)
		else:
			doc = frappe.get_doc({"doctype": "Point Ledger", **values})
			doc.insert(ignore_permissions=True)

	def _set_earned(self, field, value):
		"""Persist an earned-snapshot field without re-running document hooks.

		This runs from on_change; self.db_set() would re-trigger on_change and
		recurse infinitely, so write straight to the DB and keep the in-memory
		value in sync.
		"""
		self.set(field, value)
		frappe.db.set_value(
			"Project Todo", self.name, field, value, update_modified=False
		)

	def sync_point_ledger(self):
		"""Credit assignee + leader (+ optional mentor). Idempotent on (todo, role)."""
		assignee_earned, leader_earned, mentor_earned, late_days, early_days = self._compute_earned()
		self._set_earned("assignee_earned", assignee_earned)

		self._upsert_ledger_row(
			"Assignee", self.assigned_to, assignee_earned, late_days, early_days
		)
		leader = None
		if self.project:
			leader = frappe.get_value("Project", self.project, "project_leader")
		if not leader:
			leader_earned = 0.0
		self._set_earned("leader_earned", leader_earned)
		self._upsert_ledger_row(
			"Leader", leader, leader_earned, late_days, early_days
		)

		# Mentor credit: whoever coached the assignee on this todo earns a share
		# (Group.mentor_weight). source='Mentoring' keeps it off the productivity
		# leaderboard. Must differ from assignee and leader to avoid double-pay.
		mentor = self.mentor if self.mentor not in (None, "", self.assigned_to, leader) else None
		if mentor:
			self._upsert_ledger_row(
				"Mentor", mentor, mentor_earned, late_days, early_days, source="Mentoring"
			)
		else:
			# Mentor cleared/invalid: drop any stale Mentor row so credit never lingers.
			stale = frappe.db.exists("Point Ledger", {"todo": self.name, "role": "Mentor"})
			if stale:
				frappe.delete_doc("Point Ledger", stale, ignore_permissions=True, force=True)

	def _remove_ledger(self):
		"""Delete this todo's ledger rows and clear earned snapshots."""
		for name in frappe.get_all(
			"Point Ledger", filters={"todo": self.name}, pluck="name"
		):
			frappe.delete_doc("Point Ledger", name, ignore_permissions=True, force=True)
		self._set_earned("assignee_earned", 0)
		self._set_earned("leader_earned", 0)

	def after_insert(self):
		self._recompute_parent()

	def on_change(self):
		old = self.get_doc_before_save()
		prev_state = old.status if old else None
		if prev_state != self.status:
			self._recompute_parent()
			if self.status == "✅ Completed":
				self.sync_point_ledger()
				if self.is_recurring:
					self.create_next_occurrence()
			elif prev_state == "✅ Completed":
				self._remove_ledger()
			self._notify_status_change(prev_state)

	def _notify_status_change(self, prev_state):
		"""Best-effort approval-queue notifications. Never raises into the save.
		done   -> Leader approval queue (notify project_leader)
		checked-> Owner approval queue  (notify project_owner)
		Completed -> notify the assignee their work was approved."""
		try:
			from vernon_project.api.mobile import _notify

			actor = frappe.session.user
			project = frappe.get_value(
				"Project", self.project, ["project_owner", "project_leader"], as_dict=True
			) or {}

			# Done By PL? -> awaiting Leader. Checked By PL -> awaiting Owner.
			PLANNED = "⚪️ Planned"
			DONE = "\U0001f7e0 Done"
			CHECKED = "\U0001f537 Checked By PL"
			COMPLETED = "✅ Completed"

			# Reject: a review-stage todo bounced back to Planned. Tell the
			# assignee why so they can revise. (Normal Planned transitions —
			# e.g. brand-new todos — come from prev_state None and are skipped.)
			if self.status == PLANNED and prev_state in (DONE, CHECKED):
				_notify(
					recipient=self.assigned_to,
					type="Approval",
					title="Your task was rejected",
					body=f"“{self.to_do}” was sent back: {self.rejection_reason or '—'}. Please revise and resubmit.",
					reference_doctype="Project Todo",
					reference_name=self.name,
					actor=actor,
				)
			elif self.status == DONE:
				_notify(
					recipient=project.get("project_leader"),
					type="Approval",
					title="Task awaiting your approval",
					body=f"“{self.to_do}” is ready for Leader approval.",
					reference_doctype="Project Todo",
					reference_name=self.name,
					actor=actor,
				)
			elif self.status == CHECKED:
				_notify(
					recipient=project.get("project_owner"),
					type="Approval",
					title="Task awaiting your approval",
					body=f"“{self.to_do}” is ready for Owner approval.",
					reference_doctype="Project Todo",
					reference_name=self.name,
					actor=actor,
				)
			elif self.status == COMPLETED:
				_notify(
					recipient=self.assigned_to,
					type="Approval",
					title="Your task was approved",
					body=f"“{self.to_do}” is now Completed.",
					reference_doctype="Project Todo",
					reference_name=self.name,
					actor=actor,
				)
		except Exception:
			frappe.log_error(title="_notify_status_change failed")

	def on_update(self):
		self.sync_block_links()

	# --- Bidirectional blocking / blocked-by sync -----------------------------
	# "blocking" and "blocked_by" are mirror sides of one dependency edge: if A
	# lists B under blocking, B must list A under blocked_by, and vice versa.
	# We reconcile the other side here whenever either field changes.

	def sync_block_links(self):
		if self.flags.get("skip_block_sync"):
			return

		blocking_now = {r.todo for r in self.blocking if r.todo}
		blocked_by_now = {r.todo for r in self.blocked_by if r.todo}
		old = self.get_doc_before_save()
		blocking_old = {r.todo for r in old.blocking if r.todo} if old else set()
		blocked_by_old = {r.todo for r in old.blocked_by if r.todo} if old else set()

		# Each task this one blocks must list this one as blocked_by (mirror).
		for other in blocking_now - blocking_old:
			self._add_block_link(other, "blocked_by")
		for other in blocking_old - blocking_now:
			self._remove_block_link(other, "blocked_by")
		# Each task that blocks this one must list this one under blocking (mirror).
		for other in blocked_by_now - blocked_by_old:
			self._add_block_link(other, "blocking")
		for other in blocked_by_old - blocked_by_now:
			self._remove_block_link(other, "blocking")

	def _add_block_link(self, other_name, fieldname):
		if not other_name or not frappe.db.exists("Project Todo", other_name):
			return
		other = frappe.get_doc("Project Todo", other_name)
		if any(r.todo == self.name for r in other.get(fieldname)):
			return
		other.append(fieldname, {"todo": self.name})
		other.flags.skip_block_sync = True
		other.save(ignore_permissions=True)

	def _remove_block_link(self, other_name, fieldname):
		if not other_name or not frappe.db.exists("Project Todo", other_name):
			return
		other = frappe.get_doc("Project Todo", other_name)
		kept = [r for r in other.get(fieldname) if r.todo != self.name]
		if len(kept) == len(other.get(fieldname)):
			return
		other.set(fieldname, kept)
		other.flags.skip_block_sync = True
		other.save(ignore_permissions=True)

	def on_trash(self):
		# Deletable only while Planned ("Scheduled") or Cancelled — never once it has
		# progressed (Done/Checked) or earned points (Completed).
		if self.status not in ("⚪️ Planned", "🚫 Cancelled"):
			frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled' or 'Cancelled'.")
		# Drop mirror references from the other side so no dangling links remain.
		for r in self.blocking:
			self._remove_block_link(r.todo, "blocked_by")
		for r in self.blocked_by:
			self._remove_block_link(r.todo, "blocking")

	def after_delete(self):
		self._recompute_parent()

	def _recompute_parent(self):
		from vernon_project.vernon_project.doctype.project_detail.project_detail import (
			recompute_detail_rollups,
		)
		recompute_detail_rollups(self.project_detail)

	def calculate_total_estimated_hours(self):
		"""Total estimated time in MINUTES across all phases.

		Planned→Done is the main `estimated` field (team member's work).
		Done→Checked and Checked→Completed are the Leader/Owner approval phases.
		(field name kept as total_estimated_hours for column stability; unit is minutes.)
		"""
		total = 0
		total += int(self.estimated or 0)
		total += int(self.estimated_done_to_checked or 0)
		total += int(self.estimated_checked_to_completed or 0)
		self.total_estimated_hours = total

	def track_phase_changes(self):
		"""Track timestamp changes when status changes and calculate actual times"""
		# Skip for new documents
		if self.is_new():
			# Set planned_started_at for new todos
			if not self.planned_started_at and self.status == "⚪️ Planned":
				self.planned_started_at = now_datetime()
			return

		# Get previous status
		old_doc = self.get_old_doc()
		if not old_doc:
			return

		# Check if status changed
		if old_doc.status == self.status:
			return

		# Track timestamps based on new status
		current_time = now_datetime()

		# When moving to Done
		if self.status == "🟠 Done" and not self.done_started_at:
			self.done_started_at = current_time
			# Calculate actual time from Planned to Done
			if self.planned_started_at:
				self.actual_planned_to_done = self.calculate_hours_diff(
					self.planned_started_at,
					self.done_started_at
				)

		# When moving to Checked By PL
		if self.status == "🔷 Checked By PL" and not self.checked_started_at:
			self.checked_started_at = current_time
			# Calculate actual time from Done to Checked
			if self.done_started_at:
				self.actual_done_to_checked = self.calculate_hours_diff(
					self.done_started_at,
					self.checked_started_at
				)

		# When moving to Completed
		if self.status == "✅ Completed" and not self.phase_completed_at:
			self.phase_completed_at = current_time
			# Calculate actual time from Checked to Completed
			if self.checked_started_at:
				self.actual_checked_to_completed = self.calculate_hours_diff(
					self.checked_started_at,
					self.phase_completed_at
				)

		# Calculate total actual hours
		self.calculate_total_actual_hours()

	def track_waiting(self):
		"""Manual 'parked / waiting on external' flag. Only valid while the todo is
		still Planned (a todo, not done). Advancing the status force-clears it. A
		reason is required while waiting; clearing wipes the reason + audit so
		nothing stale lingers."""
		if self.status != "⚪️ Planned":
			self.is_waiting = 0

		if self.is_waiting:
			if not (self.waiting_reason and self.waiting_reason.strip()):
				frappe.throw(_("Please add a reason before marking this todo as waiting."))
			if not self.waiting_since:
				self.waiting_since = now_datetime()
				self.waiting_by = frappe.session.user
		else:
			self.waiting_since = None
			self.waiting_by = None
			self.waiting_reason = None

	def calculate_hours_diff(self, start_time, end_time):
		"""Calculate difference between two timestamps in hours"""
		if not start_time or not end_time:
			return 0.0

		start_dt = get_datetime(start_time)
		end_dt = get_datetime(end_time)

		diff = end_dt - start_dt
		hours = diff.total_seconds() / 3600.0

		return round(hours, 2)

	def calculate_total_actual_hours(self):
		"""Calculate total actual hours from all phases"""
		total = 0.0

		if self.actual_planned_to_done:
			total += float(self.actual_planned_to_done)

		if self.actual_done_to_checked:
			total += float(self.actual_done_to_checked)

		if self.actual_checked_to_completed:
			total += float(self.actual_checked_to_completed)

		self.total_actual_hours = total

	def _rule(self):
		from .recurrence import Rule, parse_weekdays
		return Rule(
			frequency=self.recurring_frequency,
			interval=self.recurring_interval or 1,
			weekdays=tuple(parse_weekdays(self.recurring_weekdays)),
			monthly_mode=self.recurring_monthly_mode or "Day of Month",
			day_of_month=int(self.recurring_day_of_month) if self.recurring_day_of_month else None,
			nth=self.recurring_nth or "First",
		)

	def calculate_next_occurrence(self, from_date):
		"""Next occurrence date from `from_date` using this todo's rule. None if not recurring."""
		from .recurrence import next_occurrence
		if not from_date or not self.recurring_frequency:
			return None
		return next_occurrence(getdate(from_date), self._rule())

	def validate_recurrence_rule(self):
		if not self.is_recurring:
			return
		from .recurrence import parse_weekdays, format_weekdays
		self.recurring_interval = max(1, int(self.recurring_interval or 1))
		idxs = parse_weekdays(self.recurring_weekdays)  # raises on bad token
		self.recurring_weekdays = format_weekdays(idxs)
		if self.recurring_day_of_month:
			d = int(self.recurring_day_of_month)
			if d < 1 or d > 31:
				frappe.throw(_("Day of month must be between 1 and 31."))
		if self.recurring_frequency == "Monthly" and self.recurring_monthly_mode == "Nth Weekday" and len(idxs) != 1:
			frappe.throw(_("Nth-weekday recurrence needs exactly one weekday."))

	def create_next_occurrence(self):
		"""Create next recurring todo when current one is completed"""
		if not self.is_recurring or not self.recurring_frequency:
			return

		# Calculate next occurrence date
		next_date = self.calculate_next_occurrence(self.deadline)

		if not next_date:
			return

		# Check if next occurrence is beyond recurring_until
		if self.recurring_until and getdate(next_date) > getdate(self.recurring_until):
			return

		# Dedup against the scheduler path (create_recurring_todos): both paths target
		# the same next_date, so if that occurrence already exists, don't create a
		# second one — whichever path ran first wins, the other no-ops.
		if frappe.db.exists("Project Todo", {
			"project_detail": self.project_detail,
			"to_do": self.to_do,
			"deadline": next_date,
			"assigned_to": self.assigned_to,
		}):
			frappe.db.set_value("Project Todo", self.name, "next_occurrence", None, update_modified=False)
			return

		frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.project_detail,
			"to_do": self.to_do,
			"assigned_to": self.assigned_to,
			# Shift the start date forward by the same gap, keeping start→deadline span.
			"start_date": (
				add_days(getdate(self.start_date), (getdate(next_date) - getdate(self.deadline)).days)
				if self.start_date and self.deadline
				else next_date
			),
			"deadline": next_date,
			"estimated": self.estimated,
			"notes": self.notes,
			"group": self.group,
			"level": self.level,
			"level_id": self.level_id,
			"is_recurring": 1,
			"recurring_frequency": self.recurring_frequency,
			"recurring_until": self.recurring_until,
			"next_occurrence": self.calculate_next_occurrence(next_date),
			"original_todo": self.original_todo or self.name,
			"status": "⚪️ Planned",
		}).insert(ignore_permissions=True)

		frappe.db.set_value("Project Todo", self.name, "next_occurrence", None, update_modified=False)
		frappe.msgprint(f"Next recurring todo created with deadline: {next_date}")


# --------------------------------------------------------------------------------
# PERMISSIONS  (Project Todo is now a standalone doctype.)
# --------------------------------------------------------------------------------

def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	user_esc = frappe.db.escape(user)
	return f"""
		EXISTS (
			SELECT 1
			FROM `tabProject Detail` pd
			JOIN `tabProject` p ON p.name = pd.project
			WHERE pd.name = `tabProject Todo`.project_detail
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
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
	if not doc.project_detail:
		return False
	parent_detail = frappe.get_doc("Project Detail", doc.project_detail)
	if not parent_detail.project:
		return False
	project = frappe.get_doc("Project", parent_detail.project)
	if user in (project.project_owner, project.project_leader, project.project_admin):
		return True
	if any(t.user == user for t in project.team_members):
		return True
	return False


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def assignable_users(doctype, txt, searchfield, start, page_len, filters):
	project_detail = filters.get("project_detail")
	if not project_detail:
		return []
	project = frappe.get_value("Project Detail", project_detail, "project")
	if not project:
		return []
	users = frappe.get_all(
		"Project Team",
		filters={"parent": project, "parenttype": "Project"},
		pluck="user",
	)
	if not users:
		return []
	like = f"%{txt}%"
	return frappe.db.sql(
		"""SELECT name, full_name FROM `tabUser`
		   WHERE name IN %(users)s AND (name LIKE %(like)s OR full_name LIKE %(like)s)
		   LIMIT %(start)s, %(page_len)s""",
		{"users": tuple(users), "like": like, "start": start, "page_len": page_len},
	)
