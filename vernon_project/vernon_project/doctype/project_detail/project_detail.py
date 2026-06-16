# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class ProjectDetail(Document):

	def before_validate(self):
		# --------------------------------------------------------------------------
		# Set Todo Count from length of todo child table
		# --------------------------------------------------------------------------
		self.todo_count = len(self.todo) if self.todo else 0

		# --------------------------------------------------------------------------
		# Calculate total
		# --------------------------------------------------------------------------
		# set latest deadline from latest in todo
		price = self.price if self.price else 0
		discount = self.discount if self.discount else 0
		self.total = price - discount

		# --------------------------------------------------------------------------
		# Set latest todo
		# --------------------------------------------------------------------------
		if self.todo:
			latest_todo = max(
				(getdate(todo.deadline) for todo in self.todo if todo.deadline),
				default=None
			)
			self.latest_todo = latest_todo
		else:
			self.latest_todo = None

		# --------------------------------------------------------------------------
		# Calculate Statistics & Status
		# --------------------------------------------------------------------------
		self.recalculate_totals()

		

	def validate(self):
		# --------------------------------------------------------------------------
		# Run controller validation on each child Project Todo row.
		# Frappe does not call a child doctype's controller validate() during a
		# parent save, so the parent must delegate explicitly. Without this the
		# Project Todo guards (create permission, done-field locking, phase
		# tracking) never run when todos are saved through Project Detail.
		# --------------------------------------------------------------------------
		for todo in self.todo:
			todo.validate()

		# --------------------------------------------------------------------------
		# grouping must be part of project
		# --------------------------------------------------------------------------
		if not self.grouping:
			frappe.throw("Grouping is required.")

		if not self.project:
			frappe.throw("Project is required.")

		grouping_doc = frappe.get_doc("Glossary", self.grouping)
		if grouping_doc.project != self.project:
			frappe.throw("Grouping must be part of the selected Project.")

		# --------------------------------------------------------------------------
		# glossaries must be part of grouping
		# --------------------------------------------------------------------------
		if self.glossaries:
			for glossary in self.glossaries:
				glossary_doc = frappe.get_doc("Glossary", glossary.glossary)
				if glossary_doc.project != self.project:
					frappe.throw(f"Glossary {glossary.glossary} must be part of the selected Project.")

		# --------------------------------------------------------------------------
		# price ≥ total_discount
		# --------------------------------------------------------------------------
		if self.price and self.discount:
			if self.price < self.discount:
				frappe.throw("Total SOW RP cannot be less than Total Discount.")

		# --------------------------------------------------------------------------
		# Validate latest_todo <= latest_deadline
		# --------------------------------------------------------------------------
		# if self.latest_todo and self.latest_deadline:
		# 	if getdate(self.latest_todo) > getdate(self.latest_deadline):
		# 		frappe.msgprint(f"Ada Todo yg deadlinenya setelah deadline project detail '{self.latest_deadline}'.")

		# --------------------------------------------------------------------------
		# Cannot Save if there's deleted todo items that are not in 'Scheduled' status
		# --------------------------------------------------------------------------
		#1 Get Doc Before Updated
		if not self.is_new():
			previous_doc = frappe.get_doc("Project Detail", self.name)
			previous_todo_names = {todo.name for todo in previous_doc.todo}
			current_todo_names = {todo.name for todo in self.todo}
			deleted_todo_names = previous_todo_names - current_todo_names

			for todo_name in deleted_todo_names:
				todo_doc = frappe.get_doc("Project Todo", todo_name)
				if todo_doc.status != "⚪️ Planned":
					# Restore deleted todo items
					self.append("todo", {
						"todo": todo_doc.name,
						"to_do": todo_doc.to_do,
						"assigned_to": todo_doc.assigned_to,
						"deadline": todo_doc.deadline,
						"status": todo_doc.status
					})
					frappe.throw(f"Cannot delete Project Todo '{todo_doc.to_do}' unless its status is 'Scheduled'.")
		
	def on_trash(self):
		# Cannot delete a work item that still has tasks.
		if self.todo:
			frappe.throw("Cannot delete a work item that has tasks.")

	# --------------------------------------------------------------------------
	# Validate 
	# --------------------------------------------------------------------------
	def validate_assigned_to_team_member(self, team_member):
		# 1 - Get Team Member from project
		project_doc = frappe.get_doc("Project", self.project)
		team_members = [member.user for member in project_doc.team_members]
		
		# 2 - Check if assigned_to is in team members
		for todo in self.todo:
			if todo.assigned_to and todo.assigned_to not in team_members:
				frappe.throw(f"Assigned To '{todo.assigned_to}' in ToDo '{todo.to_do}' is not a member of the Project Team.")
		
	# --------------------------------------------------------------------------
	# Action
	# --------------------------------------------------------------------------
	def recalculate_totals(self):
		# --------------------------------------------------------------------------
		# Update Statistics in Project
		# --------------------------------------------------------------------------
		self.todo_without_estimation = 0
		self.total_estimated = 0
		self.total_remaining_estimated = 0

		for x in self.todo:
			est = x.estimated or 0
			self.todo_without_estimation += 0 if est > 0 else 1
			self.total_estimated += est
			self.total_remaining_estimated += est if x.status == "⚪️ Planned" else 0

		# Update Project Detail Status
		if self.total_remaining_estimated == 0 and self.todo_count > 0:
			self.status = "Completed"
		elif self.is_pending == 1:
			self.status = "Pending"
		else:
			self.status = "Ongoing"


# --------------------------------------------------------------------------------
# PERMISSIONS
# --------------------------------------------------------------------------------

def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""

	if "System Manager" in frappe.get_roles(user):
		return ""

	user_esc = frappe.db.escape(user)

	# Hanya tampilkan Project Detail yang project-nya:
	# - project_owner = user
	# - project_leader = user
	# - project_admin = user
	# - ATAU user ada di Project Team
	return f"""
		EXISTS (
			SELECT 1
			FROM `tabProject` p
			WHERE p.name = `tabProject Detail`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
					OR EXISTS (
						SELECT 1
						FROM `tabProject Team` pt
						WHERE pt.parent = p.name
							AND pt.user = {user_esc}
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

	if user == project.project_owner:
		return True

	if user == project.project_leader:
		return True

	if user == project.project_admin:
		return True

	if any(t.user == user for t in project.team_members):
		return True

	return False