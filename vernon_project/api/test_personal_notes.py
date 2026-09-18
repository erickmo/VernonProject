# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""get_personal_notes is a plain read screen, and it loaded every note as a full
document — parent plus both child tables — and then resolved the same user names
again for each one. The cost tracked how many notes a person had written.
"""

import unittest

import frappe

from vernon_project.api.mobile import get_personal_notes
from vernon_project.tests.no_leak import NoLeakMixin

OWNER = "personal-notes-owner@test.local"
FRIEND = "personal-notes-friend@test.local"


class TestPersonalNotesQueryCost(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, first in ((OWNER, "Notes"), (FRIEND, "Friend")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": first,
				                "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.made = []

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in self.made:
			if frappe.db.exists("Personal Note", name):
				frappe.delete_doc("Personal Note", name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def _note(self, title, shared_with=None, items=2):
		doc = frappe.get_doc({
			"doctype": "Personal Note", "user": OWNER, "title": title, "body": f"body of {title}",
			"items": [{"label": f"item {i}", "checked": i % 2} for i in range(items)],
			"shares": [{"shared_user": shared_with}] if shared_with else [],
		}).insert(ignore_permissions=True)
		self.made.append(doc.name)
		return doc

	@staticmethod
	def _capture(fn):
		seen = []
		original = frappe.db.sql

		def capturing(query, *args, **kwargs):
			seen.append(str(query))
			return original(query, *args, **kwargs)

		frappe.db.sql = capturing
		try:
			result = fn()
		finally:
			frappe.db.sql = original
		return seen, result

	def test_the_cost_does_not_grow_with_the_number_of_notes(self):
		for i in range(4):
			self._note(f"note {i}")
		frappe.set_user(OWNER)
		# Warm the doctype caches: the first touch of a doctype in a process costs an
		# extra `SELECT is_virtual`, which is unrelated to row count and would read as
		# scaling.
		frappe.get_all("Personal Note", limit=1)
		frappe.get_all("Personal Note Share", limit=1)
		get_personal_notes()

		few, res_few = self._capture(get_personal_notes)
		frappe.set_user("Administrator")
		for i in range(4, 12):
			self._note(f"note {i}")
		frappe.set_user(OWNER)
		many, res_many = self._capture(get_personal_notes)

		self.assertGreater(len(few), 0, "the counter is not observing anything — the test would be vacuous")
		self.assertEqual(len(res_few["owned"]), 4)
		self.assertEqual(len(res_many["owned"]), 12)
		self.assertEqual(
			len(few), len(many),
			f"get_personal_notes must not query per note: 4 notes cost {len(few)}, 12 cost {len(many)}",
		)

	def test_a_note_still_carries_its_items_shares_and_owner(self):
		"""The batching must not change the payload. Same fields, same order of items."""
		self._note("plain")
		shared = self._note("shared one", shared_with=FRIEND, items=3)
		frappe.set_user(OWNER)
		owned = get_personal_notes()["owned"]
		by_title = {n["title"]: n for n in owned}

		self.assertEqual(len(owned), 2)
		got = by_title["shared one"]
		self.assertEqual(got["name"], shared.name)
		self.assertEqual(got["body"], "body of shared one")
		self.assertEqual([i["label"] for i in got["items"]], ["item 0", "item 1", "item 2"])
		self.assertEqual([i["checked"] for i in got["items"]], [0, 1, 0])
		self.assertEqual([s["user"] for s in got["shares"]], [FRIEND])
		self.assertTrue(got["is_owner"] and got["can_edit"])
		self.assertEqual(got["owner_user"], OWNER)
		self.assertEqual(by_title["plain"]["shares"], [], "an unshared note has no shares")

	def test_a_note_shared_with_me_is_read_only_and_hides_its_share_list(self):
		self._note("for the friend", shared_with=FRIEND)
		frappe.set_user(FRIEND)
		res = get_personal_notes()
		self.assertEqual(len(res["owned"]), 0, "a shared note is not owned")
		self.assertEqual(len(res["shared"]), 1)
		got = res["shared"][0]
		self.assertFalse(got["is_owner"])
		self.assertFalse(got["can_edit"], "a viewer may not edit")
		self.assertEqual(got["shares"], [], "a viewer never sees who else it is shared with")
		self.assertEqual(got["owner_user"], OWNER)

	def test_notes_come_back_newest_first(self):
		for i in range(3):
			self._note(f"ordered {i}")
		frappe.set_user(OWNER)
		owned = get_personal_notes()["owned"]
		self.assertEqual(
			[n["modified"] for n in owned], sorted((n["modified"] for n in owned), reverse=True),
			"owned notes are ordered newest-first",
		)
