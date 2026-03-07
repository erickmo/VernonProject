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

	def remove_duplicate_team_members(self):
		seen_users = set()
		unique_team_members = []

		for member in self.team_members:
			if member.user not in seen_users:
				seen_users.add(member.user)
				unique_team_members.append(member)

		self.team_members = unique_team_members
@staticmethod
def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""

	# optional: batasi hanya untuk role tertentu
	if "Project Owner" not in frappe.get_roles(user):
		return ""

	user_esc = frappe.db.escape(user)

	# Hanya tampilkan project:
	# - yang dia create (owner)
	# - ATAU dia ada di Project Team
	return f"""
		(
				`tabProject`.project_owner = {user_esc}
				OR EXISTS (
					SELECT 1
					FROM `tabProject Team` pt
					WHERE pt.parent = `tabProject`.name
						AND pt.user = {user_esc}
				)
		)
	"""

def has_permission(doc, ptype, user):
	# Admin/full role bisa bypass kalau mau
	if "System Manager" in frappe.get_roles(user):
		return True

	# Project Owner: boleh create, dan akses yg dia owner / jadi team
	if "Project Owner" in frappe.get_roles(user):

		# Create: cukup role permission di Role Permissions Manager
		if ptype == "create":
			return True

		# Read/Write/Delete: owner atau anggota team
		if user == doc.owner:
			return True

		if any(t.user == user for t in doc.team_members):
			return True

	return False