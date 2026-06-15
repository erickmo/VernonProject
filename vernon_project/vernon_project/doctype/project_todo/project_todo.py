# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, add_months, getdate, nowdate, now_datetime, get_datetime
from datetime import datetime


class ProjectTodo(Document):

	def validate(self):
		# Only owner/leader may create a new task
		self.validate_create_permission()

		# Prevent editing certain fields when status is Done or Completed
		self.validate_done_todo_fields()

		# Prevent Project Admin from updating status
		self.validate_project_admin_status_update()

		# Calculate total estimated hours from phases
		self.calculate_total_estimated_hours()

		# Track phase timestamps and calculate actual times
		self.track_phase_changes()

		# Set next occurrence for recurring todos
		if self.is_recurring and self.recurring_frequency and not self.next_occurrence:
			self.next_occurrence = self.calculate_next_occurrence(self.deadline)

	def get_old_doc(self):
		"""Return the previously-saved version of this row.

		Project Todo is a child table (istable: 1). When saved through its parent
		(Project Detail), Frappe's ``get_doc_before_save()`` returns ``None`` for
		child rows, so status-change detection must fall back to the DB copy.
		"""
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
		if not self.parent:
			frappe.throw(_("Task must belong to a work item"), frappe.PermissionError)
		project_name = frappe.get_value("Project Detail", self.parent, "project")
		if not project_name:
			frappe.throw(_("Work item has no project"), frappe.PermissionError)
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
		if not self.parent:
			return

		parent_detail = frappe.get_doc("Project Detail", self.parent)
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

	def on_change(self):
		# On status changed
		prev_state = self.get_doc_before_save().status if self.get_doc_before_save() else None
		if prev_state != self.status:
			parent = frappe.get_doc("Project Detail", self.parent)
			parent.save()

			# If completed and is recurring, create next occurrence
			if self.status == "✅ Completed" and self.is_recurring:
				self.create_next_occurrence()

	def on_trash(self):
		# Prevent deletion of Project Todo if it is linked to a Project Detail
		if frappe.db.exists("Project Detail", {"todo": self.name}):
			frappe.throw("Cannot delete Project Todo as it is linked to a Project Detail.")

		# Cannot Delete if status is not 'Scheduled'
		if self.status != "⚪️ Planned":
			frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled'.")

	def calculate_total_estimated_hours(self):
		"""Calculate total estimated hours from all phases"""
		total = 0.0

		if self.estimated_planned_to_done:
			total += float(self.estimated_planned_to_done)

		if self.estimated_done_to_checked:
			total += float(self.estimated_done_to_checked)

		if self.estimated_checked_to_completed:
			total += float(self.estimated_checked_to_completed)

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

	def calculate_next_occurrence(self, from_date):
		"""Calculate next occurrence date based on frequency"""
		if not from_date:
			from_date = nowdate()

		from_date = getdate(from_date)

		if self.recurring_frequency == "Daily":
			return add_days(from_date, 1)
		elif self.recurring_frequency == "Weekly":
			return add_days(from_date, 7)
		elif self.recurring_frequency == "Monthly":
			return add_months(from_date, 1)

		return None

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

		# Create new todo with same details but new deadline
		parent_doc = frappe.get_doc("Project Detail", self.parent)

		new_todo = parent_doc.append("todo", {
			"to_do": self.to_do,
			"assigned_to": self.assigned_to,
			"deadline": next_date,
			"estimated": self.estimated,
			"notes": self.notes,
			"is_recurring": 1,
			"recurring_frequency": self.recurring_frequency,
			"recurring_until": self.recurring_until,
			"next_occurrence": self.calculate_next_occurrence(next_date),
			"original_todo": self.original_todo or self.name,
			"status": "⚪️ Planned"
		})

		parent_doc.save()

		# Clear this (completed) head's next_occurrence so the daily scheduler
		# doesn't try to spawn the same occurrence again.
		frappe.db.set_value("Project Todo", self.name, "next_occurrence", None, update_modified=False)

		frappe.msgprint(f"Next recurring todo created with deadline: {next_date}")


# --------------------------------------------------------------------------------
# PERMISSIONS
# Catatan: Project Todo adalah child table (istable: 1).
# permission_query_conditions tidak berlaku untuk child doctypes.
# has_permission digunakan untuk validasi akses API per-dokumen.
# --------------------------------------------------------------------------------

def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True

	# Project Todo adalah child table, ambil project via parent (Project Detail)
	if not doc.parent:
		return False

	parent_detail = frappe.get_doc("Project Detail", doc.parent)

	if not parent_detail.project:
		return False

	project = frappe.get_doc("Project", parent_detail.project)

	if user == project.project_owner:
		return True

	if user == project.project_leader:
		return True

	if user == project.project_admin:
		return True

	if any(t.user == user for t in project.team_members):
		return True

	return False

