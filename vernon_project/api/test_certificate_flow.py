# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api import certificate as c

INTERN = "cert-flow-intern@test.local"


class TestCertificateFlow(unittest.TestCase):
	"""tmot7slo7q: "HR cannot find the way to show and display the certificate". The whole
	path had no end-to-end test: pick an intern, save a draft, publish, see it on screen,
	download it, and have the public check confirm it."""

	def setUp(self):
		frappe.set_user("Administrator")  # System Manager counts as HR here
		if not frappe.db.exists("User", INTERN):
			frappe.get_doc({"doctype": "User", "email": INTERN, "first_name": "Cert Flow",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.local.response = frappe._dict(docs=[])

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.db.delete("Internship Certificate", {"intern": INTERN})
		frappe.db.commit()

	def _draft(self):
		return c.save_certificate(intern=INTERN, position="Magang", period_start="2026-08-01",
			period_end="2026-08-31", summary="Rajin dan teliti.", rubric="[]")

	def test_hr_publishes_then_views_downloads_and_verifies(self):
		draft = self._draft()
		self.assertEqual(draft["status"], "Draft")
		self.assertIn("Published", draft["actions"])  # HR may publish straight from a draft

		published = c.set_certificate_status(draft["name"], "Published")
		self.assertEqual(published["status"], "Published")
		self.assertTrue(published["verify_url"])

		c.certificate_pdf(draft["name"], inline=1)  # "Lihat sertifikat": shown in the browser
		self.assertEqual(frappe.local.response.type, "pdf")
		self.assertTrue(frappe.local.response.filecontent.startswith(b"%PDF"))

		frappe.local.response = frappe._dict(docs=[])
		c.certificate_pdf(draft["name"])  # "Unduh PDF": a download
		self.assertEqual(frappe.local.response.type, "download")

		cert_no, code = frappe.db.get_value("Internship Certificate", draft["name"], ["cert_no", "verify_code"])
		verdict = c.lookup_verify(code)
		self.assertEqual(verdict["state"], "valid")
		self.assertEqual(verdict["cert_no"], cert_no)

	def test_a_draft_has_no_pdf_yet(self):
		draft = self._draft()
		with self.assertRaises(frappe.ValidationError):
			c.certificate_pdf(draft["name"], inline=1)
