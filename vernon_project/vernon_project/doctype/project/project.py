# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class Project(Document):
	# --------------------------------------------------------------------------------
	# HOOKS
	# --------------------------------------------------------------------------------
	def validate(self):
		# Start Date < Deadline
		if self.start_date and self.deadline:
			if getdate(self.start_date) > getdate(self.deadline):
				frappe.throw("Start Date cannot be after Deadline.")

		# No circular blocking chains (A blocks B blocks A …)
		self.validate_blocking_chain()

		# Edit scope + owner-only reassignment (updates only)
		self.validate_edit_permission()

	def before_save(self):
		self.add_owner_and_leader_to_team()
		self.remove_duplicate_team_members()

	# --------------------------------------------------------------------------------
	# METHODS
	# --------------------------------------------------------------------------------
	def add_owner_and_leader_to_team(self):
		team_users = [member.user for member in self.team_members]

		if self.project_owner and self.project_owner not in team_users:
			self.append("team_members", {"user": self.project_owner})

		if self.project_leader and self.project_leader not in team_users:
			self.append("team_members", {"user": self.project_leader})

		if self.project_admin and self.project_admin not in team_users:
			self.append("team_members", {"user": self.project_admin})

	def remove_duplicate_team_members(self):
		seen_users = set()
		unique_team_members = []

		for member in self.team_members:
			if member.user not in seen_users:
				seen_users.add(member.user)
				unique_team_members.append(member)

		self.team_members = unique_team_members

	def validate_blocking_chain(self):
		if not self.blocked_by:
			return
		if self.blocked_by == self.name:
			frappe.throw("A project cannot block itself.")
		# Walk the chain from the blocker; if it loops back to this project, reject.
		seen = {self.name}
		current = self.blocked_by
		while current:
			if current in seen:
				frappe.throw(
					f"Circular blocking chain detected (loops back through {frappe.bold(current)})."
				)
			seen.add(current)
			current = frappe.db.get_value("Project", current, "blocked_by")

	def validate_edit_permission(self):
		if self.is_new():
			return
		user = frappe.session.user
		if "System Manager" in frappe.get_roles(user):
			return
		if user not in (self.project_owner, self.project_leader):
			frappe.throw(
				"Only the Project Owner or Project Leader can edit this project.",
				frappe.PermissionError,
			)
		old = self.get_doc_before_save()
		if old and (old.project_owner != self.project_owner or old.project_leader != self.project_leader):
			if user != old.project_owner:
				frappe.throw(
					"Only the Project Owner can change the owner or leader.",
					frappe.PermissionError,
				)

	def on_trash(self):
		user = frappe.session.user
		if "System Manager" not in frappe.get_roles(user):
			if user != self.project_owner:
				frappe.throw(
					"Only the Project Owner can delete this project.",
					frappe.PermissionError,
				)
		if frappe.db.exists("Project Detail", {"project": self.name}):
			frappe.throw("Cannot delete a project that has project details.")


def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""

	# System Managers see every project (mirrors Project Detail).
	if "System Manager" in frappe.get_roles(user):
		return ""

	user_esc = frappe.db.escape(user)

	# Show only projects where the user is the owner, leader, admin, or a team member.
	# (Without this, non-owners fell through to an empty condition and saw ALL projects.)
	return f"""
		(
				`tabProject`.project_owner = {user_esc}
				OR `tabProject`.project_leader = {user_esc}
				OR `tabProject`.project_admin = {user_esc}
				OR EXISTS (
					SELECT 1
					FROM `tabProject Team` pt
					WHERE pt.parent = `tabProject`.name
						AND pt.user = {user_esc}
				)
		)
	"""

def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True

	roles = frappe.get_roles(user)

	if ptype == "create":
		return any(r in roles for r in ("Project Owner", "Project Leader"))

	if user in (doc.project_owner, doc.project_leader, doc.project_admin):
		return True

	if any(t.user == user for t in doc.team_members):
		return True

	return False