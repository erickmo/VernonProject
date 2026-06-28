# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class Meeting(Document):
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		self.snapshot_point_from_level()
		self.validate_participants_in_team()

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

	DONE = "✅ Done"

	def on_change(self):
		old = self.get_doc_before_save()
		prev = old.status if old else None
		if prev == self.status:
			return
		if self.status == self.DONE:
			self.sync_point_ledger()
		elif prev == self.DONE:
			self.remove_ledger()

	def on_trash(self):
		# A Done meeting has credited points; deleting it would orphan/duplicate
		# ledger rows. Require reopening (which clears the award) before deletion.
		if self.status == self.DONE:
			frappe.throw(_("A Done meeting cannot be deleted. Reopen it first."))

	def sync_point_ledger(self):
		"""Credit each participant once. Idempotent on (meeting, user)."""
		for row in self.participants:
			self._upsert_ledger_row(row.user)
			self._notify_award(row.user)

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
	if not doc.project:
		return False
	project = frappe.get_doc("Project", doc.project)
	if user in (project.project_owner, project.project_leader, project.project_admin):
		return True
	if any(t.user == user for t in project.team_members):
		return True
	return False
