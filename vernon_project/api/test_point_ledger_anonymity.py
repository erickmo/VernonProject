# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import unittest

import frappe
from frappe.utils import now_datetime

from vernon_project.fixtures_for_tests import ensure_user


class TestPointLedgerGrantorHidden(unittest.TestCase):
	"""Votes and reactions are anonymous, but Point Ledger rows carry granted_by=<voter>
	and every project role holds read on the doctype, so /api/resource handed the voter
	to anyone — including the ratee reading their own row. granted_by is permlevel 1
	(System Manager only); server code reads it through get_all, which ignores perms.

	Needs `bench migrate` after merge: permlevel lives in tabDocField, not the JSON."""

	RATEE = "pl_anon_ratee@example.com"
	VOTER = "pl_anon_voter@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_user(self.RATEE, "PLR", roles=("Project Team",))
		ensure_user(self.VOTER, "PLV", roles=("Project Team",))
		frappe.db.commit()
		# Never committed: tearDown rolls it back.
		self.row = frappe.get_doc({
			"doctype": "Point Ledger", "user": self.RATEE, "points_earned": 1,
			"source": "Recognition", "granted_by": self.VOTER, "note": "anon-test",
			"credited_on": now_datetime(),
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_schema_hides_granted_by(self):
		self.assertGreaterEqual(frappe.get_meta("Point Ledger").get_field("granted_by").permlevel, 1)

	def test_ratee_cannot_read_voter_over_rest(self):
		frappe.set_user(self.RATEE)
		try:
			rows = frappe.get_list("Point Ledger", filters={"name": self.row.name}, fields=["name", "granted_by"])
			doc = frappe.client.get("Point Ledger", self.row.name)
			server = frappe.get_all("Point Ledger", filters={"name": self.row.name}, fields=["granted_by"])
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(rows), 1)
		self.assertFalse(rows[0].get("granted_by"))
		self.assertFalse(doc.get("granted_by"))
		# get_wallet_log / recognition caps still see it server-side.
		self.assertEqual(server[0]["granted_by"], self.VOTER)

	def test_system_manager_still_reads_it(self):
		rows = frappe.get_list("Point Ledger", filters={"name": self.row.name}, fields=["granted_by"])
		self.assertEqual(rows[0]["granted_by"], self.VOTER)
