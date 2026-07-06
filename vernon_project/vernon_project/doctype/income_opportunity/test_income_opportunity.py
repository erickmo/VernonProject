# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.vernon_project.doctype.income_opportunity.income_opportunity import (
	is_effectively_closed,
)


class TestIncomeOpportunity(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Income Opportunity", pluck="name"):
			frappe.delete_doc("Income Opportunity", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make(self, **kw):
		doc = frappe.get_doc({
			"doctype": "Income Opportunity",
			"title": kw.get("title", "Lead Reward"),
			"reward": kw.get("reward", "Bonus for a software-project lead"),
			"period_start": kw.get("period_start", nowdate()),
			"period_end": kw.get("period_end"),
			"status": kw.get("status", "Open"),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		return doc

	def test_open_is_not_closed(self):
		doc = self._make(status="Open", period_end=None)
		self.assertFalse(is_effectively_closed(doc.name))

	def test_manual_closed(self):
		doc = self._make(status="Closed")
		self.assertTrue(is_effectively_closed(doc.name))

	def test_past_period_end_is_closed(self):
		doc = self._make(status="Open", period_end=add_days(nowdate(), -1))
		self.assertTrue(is_effectively_closed(doc.name))

	def test_future_period_end_is_open(self):
		doc = self._make(status="Open", period_end=add_days(nowdate(), 5))
		self.assertFalse(is_effectively_closed(doc.name))

	def test_period_end_today_is_open(self):
		# Boundary: rule is `period_end < today` (strict), so ending today is open.
		doc = self._make(status="Open", period_end=nowdate())
		self.assertFalse(is_effectively_closed(doc.name))

	def test_missing_is_closed(self):
		self.assertTrue(is_effectively_closed("does-not-exist"))
