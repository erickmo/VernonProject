# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from vernon_project.tests.no_leak import NoLeakMixin


class TestJobApplicationScorePermlevel(NoLeakMixin, unittest.TestCase):
	"""2026-09-09 permission sweep: score/disc_fit/personality_fit/overall_fit/
	ketelitian_score/psych_result/test_violations/blacklist_flag were
	read_only:1 (form-only) at permlevel:0 on Job Application, while a
	dangling permlevel:1 grant row for HR Manager already existed in the
	permission table with nothing actually tagged permlevel:1 to use it --
	an earlier pass evidently started this fix and never finished tagging
	the fields. Completed it. This has NO effect on HR Manager's own access
	(they already held the permlevel:1 grant) -- it only closes the gap for
	any role that might someday get base create/write without also getting
	the permlevel:1 grant. This test is a regression guard: confirms HR
	Manager's real access is unchanged."""

	HR_MANAGER = "jasp_hr_manager@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.HR_MANAGER):
			frappe.get_doc({
				"doctype": "User", "email": self.HR_MANAGER, "first_name": "JASP",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.HR_MANAGER)
		if not any(r.role == "HR Manager" for r in u.roles):
			u.append("roles", {"role": "HR Manager"})
			u.save(ignore_permissions=True)
		self.opening = frappe.get_doc({
			"doctype": "Job Opening", "title": "JASP Opening", "slug": "jasp-opening",
			"status": "Open",
		}).insert(ignore_permissions=True)
		self.app = frappe.get_doc({
			"doctype": "Job Application", "job_opening": self.opening.name,
			"full_name": "JASP Applicant", "email": "jasp_applicant@example.com",
			"phone": "0800000000", "nik_ktp": "1111111111111111",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Job Application", self.app.name):
			frappe.delete_doc("Job Application", self.app.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Job Opening", self.opening.name):
			frappe.delete_doc("Job Opening", self.opening.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_hr_manager_retains_full_access_to_score_fields(self):
		frappe.set_user(self.HR_MANAGER)
		try:
			doc = frappe.get_doc("Job Application", self.app.name)
			doc.score = 88
			doc.overall_fit = 75.5
			doc.blacklist_flag = 0
			doc.save()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Job Application", self.app.name, "score"), 88)
