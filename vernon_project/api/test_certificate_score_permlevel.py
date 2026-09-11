# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate


class TestCertificateScorePermlevel(unittest.TestCase):
	"""2026-09-09 permission sweep: Internship Certificate's validate() only
	checked cert_no/verify_code are non-empty when Published/Revoked -- never
	that they were system-generated. cert_no/verify_code/auto_score/auto_grade/
	rubric_score/rubric_grade/breakdown_json/published_by were read_only:1
	(form-only) but NOT permlevel-protected, so a Project Leader could set
	them directly via generic REST and forge a publicly-verifiable
	certificate with fabricated scores, bypassing the real publish flow in
	api/certificate.py's _publish() (which server-computes every one of
	these fields, then saves with ignore_permissions=True -- unaffected by
	permlevel). Fixed by moving those 8 fields to permlevel: 1, granted only
	to System Manager and HR Manager."""

	LEADER = "csp_leader@example.com"
	INTERN = "csp_intern@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (self.LEADER, self.INTERN):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		if not any(r.role == "Project Leader" for r in u.roles):
			u.append("roles", {"role": "Project Leader"})
			u.save(ignore_permissions=True)
		self.cert = frappe.get_doc({
			"doctype": "Internship Certificate", "intern": self.INTERN,
			"period_start": add_days(nowdate(), -30), "period_end": nowdate(),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Internship Certificate", self.cert.name):
			frappe.delete_doc("Internship Certificate", self.cert.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_project_leader_cannot_set_cert_no_or_verify_code_directly(self):
		# Frappe's permlevel write-guard doesn't raise on save() -- it silently
		# resets any permlevel-1 field a permlevel-0-only user tried to change
		# back to its stored value. Proving the RESET (not an exception) is
		# what actually confirms the protection is live.
		frappe.set_user(self.LEADER)
		try:
			doc = frappe.get_doc("Internship Certificate", self.cert.name)
			doc.cert_no = "FORGED-001"
			doc.verify_code = "forged-verify-code"
			doc.save()  # no exception -- Frappe quietly drops the permlevel-1 edits
		finally:
			frappe.set_user("Administrator")
		reloaded = frappe.get_doc("Internship Certificate", self.cert.name)
		self.assertFalse(reloaded.cert_no)
		self.assertFalse(reloaded.verify_code)

	def test_project_leader_cannot_forge_scores(self):
		frappe.set_user(self.LEADER)
		try:
			doc = frappe.get_doc("Internship Certificate", self.cert.name)
			doc.auto_score = 100
			doc.rubric_score = 100
			doc.save()  # silently reset, not an exception -- see note above
		finally:
			frappe.set_user("Administrator")
		reloaded = frappe.get_doc("Internship Certificate", self.cert.name)
		self.assertNotEqual(reloaded.auto_score, 100)
		self.assertNotEqual(reloaded.rubric_score, 100)

	def test_project_leader_can_still_edit_non_score_fields(self):
		frappe.set_user(self.LEADER)
		try:
			doc = frappe.get_doc("Internship Certificate", self.cert.name)
			doc.period_end = add_days(nowdate(), 1)
			doc.save()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(str(frappe.db.get_value("Internship Certificate", self.cert.name, "period_end")),
			add_days(nowdate(), 1))

	def test_hr_manager_and_system_manager_can_still_set_score_fields(self):
		# The real publish flow (api/certificate.py _publish) saves with
		# ignore_permissions=True, so it's unaffected regardless -- this just
		# confirms the permlevel grant itself is correct for the trusted roles.
		doc = frappe.get_doc("Internship Certificate", self.cert.name)
		doc.cert_no = "CERT-0001"
		doc.verify_code = "abc123"
		doc.save()
		self.assertEqual(frappe.db.get_value("Internship Certificate", self.cert.name, "cert_no"), "CERT-0001")

	def test_project_leader_cannot_touch_a_published_certificate_or_any_status(self):
		"""/verify renders a published certificate live and the app freezes it, and
		status moves only through set_certificate_status. The generic save gives every
		Project Leader write on every certificate (no permission hook), which could
		rewrite who a published certificate names, or quietly un-publish it (a draft
		verifies as not found)."""
		frappe.db.set_value("Internship Certificate", self.cert.name,
			{"status": "Published", "cert_no": "CSP-1", "verify_code": "csp-verify-1"})
		frappe.set_user(self.LEADER)
		try:
			for field, value in (("position", "Chief Executive"), ("intern", self.LEADER), ("status", "Draft")):
				with self.assertRaises(frappe.PermissionError, msg=field):
					frappe.client.set_value("Internship Certificate", self.cert.name, field, value)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Internship Certificate", self.cert.name, ["status", "intern", "position"]),
			("Published", self.INTERN, None))

	def test_project_leader_cannot_move_a_draft_through_the_workflow(self):
		frappe.set_user(self.LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				frappe.client.set_value("Internship Certificate", self.cert.name, "status", "Pending HR")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Internship Certificate", self.cert.name, "status"), "Draft")
		# The certificate screen's own path (api/certificate.py gates the caller, then
		# saves with ignore_permissions) still moves it.
		frappe.set_user(self.LEADER)
		try:
			doc = frappe.get_doc("Internship Certificate", self.cert.name)
			doc.status = "Pending HR"
			doc.save(ignore_permissions=True)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Internship Certificate", self.cert.name, "status"), "Pending HR")
