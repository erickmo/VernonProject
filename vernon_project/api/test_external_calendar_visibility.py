# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.external_calendar import visible_events
from vernon_project.tests.no_leak import NoLeakMixin

NO_READ = "calvis-noread@test.local"
TEAM = "calvis-team@test.local"


class TestExternalCalendarVisibility(NoLeakMixin, unittest.TestCase):
	"""visible_events claimed to respect the caller's doctype permissions but used
	frappe.get_all, so any logged-in user, whatever their roles, got every synced
	event through get_calendar."""

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (NO_READ, TEAM):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", TEAM).add_roles("Project Team")
		self.event = frappe.get_doc({
			"doctype": "External Calendar Event", "external_key": "calvis-probe-1", "source_site": "calvis.test",
			"source_doctype": "Cohort", "source_name": "Probe", "title": "Calendar visibility probe",
			"category": "batch", "starts_on": "2026-09-10", "ends_on": "2026-09-11", "all_day": 1, "cancelled": 0,
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")

	def _visible_to(self, user):
		frappe.set_user(user)
		try:
			return [e["name"] for e in visible_events()]
		finally:
			frappe.set_user("Administrator")

	def test_a_user_without_read_permission_sees_no_events(self):
		self.assertNotIn(self.event, self._visible_to(NO_READ))

	def test_project_team_still_sees_events(self):
		self.assertIn(self.event, self._visible_to(TEAM))
