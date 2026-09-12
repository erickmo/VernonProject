# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project import update_project, update_project_detail
from vernon_project.tests.no_leak import NoLeakMixin


class TestUpdateProjectAllowlist(NoLeakMixin, unittest.TestCase):
	"""Regression for the 2026-09-08 permission sweep: update_project's field
	filter was a blocklist (identity/audit fields only) that missed
	project_owner/project_leader/project_admins entirely -- a Project Leader
	could self-promote to Owner by passing project_owner in fields. Now an
	allowlist: those three, plus update_project_detail's `project` (re-parenting
	is move_project_detail's job), are refused outright, not re-derived,
	because the real "only the Owner may change owner/leader" enforcement
	already exists and runs on Frappe's own generic REST resource API path,
	which this custom endpoint isn't."""

	LEADER = "upa_leader@example.com"
	OTHER = "upa_other@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.OTHER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
					"roles": [{"role": "Project Owner"}, {"role": "Project Leader"}],
				}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "UPA Project", "brand": "Test Customer",
			"project_owner": self.OTHER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		self.other_project = frappe.get_doc({
			"doctype": "Project", "project_name": "UPA Other Project", "brand": "Test Customer",
			"project_owner": self.OTHER, "project_leader": self.OTHER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "UPA Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "UPA Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		for p in (self.project, self.other_project):
			if frappe.db.exists("Project", p.name):
				frappe.delete_doc("Project", p.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_leader_cannot_self_promote_to_owner(self):
		frappe.set_user(self.LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				update_project(self.project.name, {"project_owner": self.LEADER})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Project", self.project.name, "project_owner"), self.OTHER,
		)

	def test_project_admins_also_refused_here(self):
		frappe.set_user(self.LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				update_project(self.project.name, {"project_admins": [{"user": self.LEADER}]})
		finally:
			frappe.set_user("Administrator")

	def test_leader_can_still_edit_allowed_content_fields(self):
		frappe.set_user(self.LEADER)
		try:
			r = update_project(self.project.name, {"goal": "Updated goal text"})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["name"], self.project.name)
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "goal"), "Updated goal text")

	def test_reparenting_project_detail_is_refused_use_move_project_detail_instead(self):
		frappe.set_user(self.LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				update_project_detail(self.detail.name, {"project": self.other_project.name})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Project Detail", self.detail.name, "project"), self.project.name,
		)

	def test_leader_can_still_edit_allowed_detail_content_fields(self):
		frappe.set_user(self.LEADER)
		try:
			r = update_project_detail(self.detail.name, {"title": "Updated title"})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["name"], self.detail.name)
		self.assertEqual(frappe.db.get_value("Project Detail", self.detail.name, "title"), "Updated title")
