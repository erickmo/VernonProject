# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.events import get_event
from vernon_project.api.events_admin import save_event
from vernon_project.tests.no_leak import NoLeakMixin

ORGANIZER = "event-parent-a@test.local"
VICTIM = "event-parent-b@test.local"


class TestParentEventNeedsTheParentsPermission(NoLeakMixin, unittest.TestCase):
	"""save_event gated the event being EDITED and never the parent it was being
	attached to, while EDITABLE includes parent_event and events.get_event renders
	every Published child as a sub_event of the parent. A note in the module
	deferred that check on the grounds that "all organizers are trusted staff" —
	but save_event stamps organizer = session user on create with no role check at
	all, so any authenticated account is an organizer on its first call. The probe
	that found this used an account whose roles were literally ['All', 'Guest'].

	What made it worth fixing rather than filing as spam is that the victim had no
	remedy: the injected event does not appear in their manage_list_events (it
	filters by organizer) and _can_manage refuses their attempt to cancel it, so
	only a System Manager could remove it from their page.

	The two regression tests pin what must NOT change — creating a top-level event
	is untouched (whether that should need a role at all is a separate product
	question), and attaching to an event you do manage still works.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (ORGANIZER, VICTIM):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		frappe.set_user(VICTIM)
		self.victim_event = self._event("Victim Summit")
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _event(self, title, parent=None, start="2027-01-01 09:00:00"):
		payload = {
			"title": title, "status": "Published",
			"start_datetime": start, "pricing": "Free",
		}
		if parent:
			payload["parent_event"] = parent
		return save_event(payload)["name"]

	def test_you_cannot_hang_your_event_off_someone_elses(self):
		frappe.set_user(ORGANIZER)
		with self.assertRaises(frappe.PermissionError):
			self._event("FREE IPHONE CLICK HERE", parent=self.victim_event)
		frappe.set_user("Administrator")

	def test_nothing_lands_on_the_victims_page(self):
		frappe.set_user(ORGANIZER)
		try:
			self._event("FREE IPHONE CLICK HERE", parent=self.victim_event)
		except frappe.PermissionError:
			pass
		frappe.set_user(VICTIM)
		titles = [s["title"] for s in get_event(self.victim_event)["sub_events"]]
		frappe.set_user("Administrator")
		self.assertNotIn("FREE IPHONE CLICK HERE", titles)

	# --- REGRESSION -------------------------------------------------------------

	def test_a_top_level_event_is_unaffected(self):
		frappe.set_user(ORGANIZER)
		name = self._event("ordinary top-level event")
		frappe.set_user("Administrator")
		self.assertTrue(frappe.db.exists("Vernon Event", name))

	def test_you_can_still_attach_to_an_event_you_manage(self):
		frappe.set_user(ORGANIZER)
		parent = self._event("my conference")
		child = self._event("my breakout session", parent=parent, start="2027-01-01 11:00:00")
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Vernon Event", child, "parent_event"), parent)
