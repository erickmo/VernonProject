import unittest

import frappe

from vernon_project.api.external_calendar import sync_events

SITE = "vedu-be.vernon.id"
NOBODY = "calsync-nobody@test.local"


def _event(key, **overrides):
	e = {
		"external_key": key,
		"source_doctype": "Cohort",
		"source_name": "CS101-BatchA",
		"title": "BatchA",
		"category": "batch",
		"starts_on": "2026-09-10",
		"ends_on": "2026-09-24",
		"all_day": 1,
		"location": None,
		"url": "/list/Cohort/CS101-BatchA",
		"department": "Engineering",
		"cancelled": 0,
	}
	e.update(overrides)
	return e


class TestSyncEventsPermission(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", NOBODY):
			frappe.get_doc({
				"doctype": "User", "email": NOBODY, "first_name": "No Body", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_a_user_without_a_permitted_role_is_rejected(self):
		frappe.set_user(NOBODY)
		with self.assertRaises(frappe.PermissionError):
			sync_events(SITE, [_event("TEST:perm-check")])


class TestSyncEventsUpsert(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.db.delete("External Calendar Event", {"external_key": ["like", "TEST:%"]})
		frappe.db.commit()

	def test_first_sync_creates_the_row_named_after_its_external_key(self):
		res = sync_events(SITE, [_event("TEST:create-1")])
		self.assertEqual(res["synced"], 1)
		self.assertEqual(res["failed"], 0)
		doc = frappe.get_doc("External Calendar Event", "TEST:create-1")
		self.assertEqual(doc.source_site, SITE)
		self.assertEqual(doc.title, "BatchA")
		self.assertEqual(doc.cancelled, 0)

	def test_resync_with_the_same_key_updates_in_place_not_duplicates(self):
		sync_events(SITE, [_event("TEST:idem-1", title="Original")])
		sync_events(SITE, [_event("TEST:idem-1", title="Renamed")])
		matches = frappe.get_all("External Calendar Event", {"external_key": "TEST:idem-1"})
		self.assertEqual(len(matches), 1)
		self.assertEqual(frappe.get_doc("External Calendar Event", "TEST:idem-1").title, "Renamed")

	def test_cancelled_flag_round_trips(self):
		sync_events(SITE, [_event("TEST:cancel-1", cancelled=1)])
		self.assertEqual(frappe.get_doc("External Calendar Event", "TEST:cancel-1").cancelled, 1)

	def test_a_batch_is_processed_together_in_one_call(self):
		res = sync_events(SITE, [_event("TEST:batch-1"), _event("TEST:batch-2")])
		self.assertEqual(res["synced"], 2)
		self.assertTrue(frappe.db.exists("External Calendar Event", "TEST:batch-1"))
		self.assertTrue(frappe.db.exists("External Calendar Event", "TEST:batch-2"))

	def test_one_malformed_event_in_a_batch_is_reported_not_raised(self):
		good = _event("TEST:mixed-good")
		bad = _event("TEST:mixed-bad", title=None)
		res = sync_events(SITE, [good, bad])
		self.assertEqual(res["synced"], 1)
		self.assertEqual(res["failed"], 1)
		self.assertTrue(frappe.db.exists("External Calendar Event", "TEST:mixed-good"))
		self.assertFalse(frappe.db.exists("External Calendar Event", "TEST:mixed-bad"))
		bad_result = next(r for r in res["results"] if r["external_key"] == "TEST:mixed-bad")
		self.assertFalse(bad_result["ok"])
		self.assertIn("title", bad_result["error"])


class TestGetCalendarMerge(unittest.TestCase):
	"""get_calendar (api/mobile.py) carries a 9.2s -> 1.2s N+1 scar from a
	per-row call in a loop. The merge must add exactly one query, pinned here
	so the next person to touch it gets a red test, not a slow prod page."""

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.db.delete("External Calendar Event", {"external_key": ["like", "TEST:%"]})
		frappe.db.commit()

	def test_get_calendar_merges_synced_events_via_exactly_one_extra_query(self):
		from vernon_project.api.mobile import get_calendar

		sync_events(SITE, [_event("TEST:merge-1"), _event("TEST:merge-2", cancelled=1)])

		calls = {"external": 0}
		orig_get_all = frappe.get_all

		def counting_get_all(doctype, *args, **kwargs):
			if doctype == "External Calendar Event":
				calls["external"] += 1
			return orig_get_all(doctype, *args, **kwargs)

		frappe.get_all = counting_get_all
		try:
			result = get_calendar()
		finally:
			frappe.get_all = orig_get_all

		self.assertEqual(calls["external"], 1)
		self.assertIn("external_events", result)
		keys = {e["name"] for e in result["external_events"]}
		self.assertIn("TEST:merge-1", keys)
		self.assertNotIn("TEST:merge-2", keys)


class TestGenericWritesAreRefused(unittest.TestCase):
	"""Only sync_events writes these (System Manager; it saves with ignore_permissions).
	The role grid also gave every Project Owner and Leader write/create/delete, which no
	flow uses: a generic save could plant a company-wide calendar event with a link, or
	rewrite or cancel a mirrored class session."""

	LEADER = "calsync-leader@test.local"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.LEADER):
			frappe.get_doc({
				"doctype": "User", "email": self.LEADER, "first_name": "Cal Leader", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.get_doc("User", self.LEADER).add_roles("Project Leader")
		sync_events(SITE, [_event("TEST:real-1")])

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.get_doc("User", self.LEADER).remove_roles("Project Leader")
		frappe.db.delete("External Calendar Event", {"external_key": ["like", "TEST:%"]})
		frappe.db.commit()

	def test_a_project_leader_cannot_plant_edit_or_delete_events(self):
		frappe.set_user(self.LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				frappe.client.insert({"doctype": "External Calendar Event", **_event("TEST:planted"),
					"source_site": SITE, "url": "https://example.invalid/login"})
			with self.assertRaises(frappe.PermissionError):
				frappe.client.set_value("External Calendar Event", "TEST:real-1", "cancelled", 1)
			with self.assertRaises(frappe.PermissionError):
				frappe.client.delete("External Calendar Event", "TEST:real-1")
		finally:
			frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("External Calendar Event", "TEST:planted"))
		self.assertEqual(frappe.db.get_value("External Calendar Event", "TEST:real-1", "cancelled"), 0)
