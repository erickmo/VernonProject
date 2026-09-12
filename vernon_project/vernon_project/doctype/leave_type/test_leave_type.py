# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.attendance.cuti_ledger import ensure_grant
from vernon_project.attendance.leave_quota import default_annual_type


def _flagged():
	return frappe.db.sql(
		"select name from `tabLeave Type` where is_default_annual=1 order by name", pluck=True
	)


class TestLeaveTypeInvariants(unittest.TestCase):
	"""The annual leave pool is found by FLAG, not by name (leave_quota.default_annual_type
	filters is_default_annual=1 AND enabled=1), and cuti_ledger.ensure_grant stamps that
	name onto every annual Grant row. api/attendance.py's save_leave_type and
	delete_leave_type enforced the invariants; the controller was `pass`, so a plain Desk
	save or an /api/resource PUT -- which HR Manager holds the grant for -- skipped all
	of them. Proved live before this fix, rolled back:

	  flagging a second type   -> flagged ['Cuti Duka (Serumah)', 'Cuti Tahunan'],
	                              default_annual_type() flipped to the bereavement type
	  disabling the flagged one -> default_annual_type() None, and ensure_grant wrote a
	                              Grant row with leave_type NULL: the pool detached

	NOTHING here commits. The dedupe in on_update clears the flag on every other row,
	including the real 'Cuti Tahunan', so the rollback in tearDown is the safety net --
	do not add a commit to this file.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		self.default = default_annual_type()
		if not self.default:
			self.skipTest("site has no default annual leave type to probe with")
		self.other = frappe.db.get_value(
			"Leave Type", {"is_default_annual": 0, "enabled": 1}, "name"
		)
		if not self.other:
			self.skipTest("site has no second enabled leave type")
		# save_leave_type COMMITS (api/attendance.py), so the front-door pin below
		# survives tearDown's rollback. Remember what to put back. Caught the hard
		# way: a first run left "ZZ invariant probe" on a real leave type.
		self._other_description = frappe.db.get_value("Leave Type", self.other, "description")

	def tearDown(self):
		frappe.db.rollback()
		if frappe.db.get_value("Leave Type", self.other, "description") != self._other_description:
			frappe.db.set_value("Leave Type", self.other, "description",
				self._other_description, update_modified=False)
			frappe.db.commit()  # the leak it undoes was committed too

	# --- the flag must stay on exactly one enabled type --------------------------
	def test_flagging_a_second_type_leaves_exactly_one_default(self):
		doc = frappe.get_doc("Leave Type", self.other)
		doc.is_default_annual = 1
		doc.save(ignore_permissions=True)
		self.assertEqual(_flagged(), [self.other], "two types carried the flag at once")
		self.assertEqual(default_annual_type(), self.other)

	def test_the_default_annual_type_cannot_be_disabled(self):
		doc = frappe.get_doc("Leave Type", self.default)
		doc.enabled = 0
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)

	def test_the_last_default_flag_cannot_be_cleared(self):
		"""save_leave_type does NOT guard this one -- it only refuses default+disabled --
		so clearing the flag was a second, unguarded route to the same detachment."""
		doc = frappe.get_doc("Leave Type", self.default)
		doc.is_default_annual = 0
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)

	# --- the load-bearing one ----------------------------------------------------
	def test_the_annual_grant_can_no_longer_lose_its_leave_type(self):
		"""Both detach routes refused, and the grant still lands on a real type. This is
		the same ledger as the reconcile race: a NULL leave_type is silent corruption."""
		for field, value in (("enabled", 0), ("is_default_annual", 0)):
			doc = frappe.get_doc("Leave Type", self.default)
			doc.set(field, value)
			with self.assertRaises(frappe.ValidationError):
				doc.save(ignore_permissions=True)
			frappe.db.rollback()

		self.assertEqual(default_annual_type(), self.default)
		employee = frappe.get_all("Employee Profile", pluck="user", limit=1)[0]
		grant = ensure_grant(employee, 2097)
		self.assertEqual(
			frappe.db.get_value("Cuti Ledger", grant, "leave_type"), self.default,
			"the annual Grant detached from the leave pool",
		)

	# --- deletes -----------------------------------------------------------------
	def test_the_default_annual_type_cannot_be_deleted(self):
		"""Asserting the MESSAGE, not just ValidationError: frappe's own
		check_if_doc_is_linked raises LinkExistsError -- a ValidationError subclass --
		for any type with rows against it, so a bare assertRaises passes on the
		unguarded controller too and proves nothing."""
		with self.assertRaises(frappe.ValidationError) as caught:
			frappe.delete_doc("Leave Type", self.default, ignore_permissions=True)
		self.assertIn("tidak dapat dihapus", str(caught.exception))

	def test_a_leave_type_in_use_cannot_be_deleted(self):
		"""on_trash runs BEFORE frappe's own link check (model/delete_doc.py:125 vs 132),
		so this guard is what the user actually sees."""
		in_use = frappe.db.sql(
			"""select e.leave_type from `tabAttendance Exception` e
			join `tabLeave Type` t on t.name = e.leave_type
			where ifnull(t.is_default_annual, 0) = 0 limit 1""", pluck=True
		)
		if not in_use:
			self.skipTest("no non-default leave type is referenced by an Attendance Exception")
		with self.assertRaises(frappe.ValidationError) as caught:
			frappe.delete_doc("Leave Type", in_use[0], ignore_permissions=True)
		self.assertIn("nonaktifkan saja", str(caught.exception))

	# --- the paths that must keep working ----------------------------------------
	def test_the_api_front_door_still_works(self):
		from vernon_project.api.attendance import save_leave_type

		frappe.set_user("Administrator")
		out = save_leave_type(name=self.other, description="ZZ invariant probe")
		self.assertEqual(out.get("status"), "ok", out)

	def test_a_legitimate_plain_save_still_works(self):
		doc = frappe.get_doc("Leave Type", self.other)
		doc.description = "ZZ invariant probe"
		doc.save(ignore_permissions=True)
		self.assertEqual(
			frappe.db.get_value("Leave Type", self.other, "description"), "ZZ invariant probe"
		)


if __name__ == "__main__":
	unittest.main()
