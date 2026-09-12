# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.mobile import _has_claim, _record_claim

USER = "claim-naming@test.local"
DOCTYPE = "Avatar Reward Claim"


class TestRewardClaimNaming(unittest.TestCase):
	"""Avatar Reward Claim's docname IS its natural key (user|claim_type|claim_ref),
	set by the controller's autoname(), and that primary key is the only thing
	stopping a reward being claimed twice — there is no unique index, and the
	callers' `_has_claim` + advisory lock provably does not hold under this bench's
	REPEATABLE READ (verified live: the loser's _has_claim returned False).

	Its JSON used to ALSO declare `autoname: "hash"`, which was never true and
	quietly broke the error path: frappe/model/base_document.py treats a
	primary-key violation on a hash-named doctype as a hash collision, so it
	retried 5x regenerating the identical deterministic name and then re-raised
	the RAW pymysql IntegrityError — never the DuplicateEntryError that
	_record_claim catches. The loser got a 500 instead of a graceful skip, which
	in claim_daily aborts the whole loop over the remaining rewards.

	`meta.autoname` is read from the DATABASE, not from the JSON file, so these
	tests set it explicitly rather than depending on whether `reload_doc` has run
	on this site yet. That is also why the deploy needs reload_doc: the JSON change
	is inert until then.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", USER):
			frappe.get_doc({
				"doctype": "User", "email": USER, "first_name": "claim naming",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		self.meta = frappe.get_meta(DOCTYPE)
		self._autoname = self.meta.autoname

	def tearDown(self):
		self.meta.autoname = self._autoname
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.db.delete(DOCTYPE, {"user": USER})
		frappe.db.commit()

	def test_this_site_is_not_declaring_autoname_hash(self):
		"""The one test that reads the LIVE meta instead of forcing it.

		The fix is a doctype-JSON change, so it is inert until `reload_doc` runs on
		the site — until then `meta.autoname` is still "hash" and a duplicate claim
		still escapes as a raw IntegrityError. This test is therefore RED on a site
		where the reload has not happened yet, which is deliberate: it is how a
		half-applied deploy gets noticed instead of passing quietly.
		"""
		self.assertNotEqual(
			frappe.get_meta(DOCTYPE).autoname, "hash",
			"Avatar Reward Claim still declares autoname 'hash' on this site — run "
			"frappe.reload_doc('vernon_project', 'doctype', 'avatar_reward_claim'). "
			"Until then a duplicate claim raises a raw IntegrityError instead of a "
			"catchable DuplicateEntryError, and claim_daily aborts mid-loop.",
		)
		# and with the real meta, the duplicate really is handled gracefully
		self.assertTrue(_record_claim(USER, "achievement", "ZZ-live"))
		self.assertFalse(_record_claim(USER, "achievement", "ZZ-live"))

	def test_the_controller_still_names_the_row_after_the_json_change(self):
		"""The JSON no longer declares an autoname — the controller must still win,
		or existing rows stop matching new ones and the guard silently dies."""
		self.meta.autoname = ""  # what the JSON change yields after reload_doc
		doc = frappe.get_doc({
			"doctype": DOCTYPE, "user": USER, "claim_type": "achievement",
			"claim_ref": "ZZ-naming",
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.name, f"{USER}|achievement|ZZ-naming")

	def test_a_duplicate_claim_returns_false_instead_of_raising(self):
		self.meta.autoname = ""
		self.assertTrue(_record_claim(USER, "achievement", "ZZ-dup"))
		self.assertFalse(
			_record_claim(USER, "achievement", "ZZ-dup"),
			"losing the race must return False, not raise — the caller is mid-loop "
			"over the user's other rewards",
		)
		self.assertTrue(_has_claim(USER, "achievement", "ZZ-dup"))
		self.assertEqual(
			frappe.db.count(DOCTYPE, {"user": USER, "claim_ref": "ZZ-dup"}), 1,
			"and exactly one claim row, so the reward is granted once",
		)

	def test_a_losing_claim_does_not_abort_the_callers_loop(self):
		"""claim_daily iterates a user's rewards and calls _record_claim per row.
		One already-claimed row must not stop the rest being processed."""
		self.meta.autoname = ""
		_record_claim(USER, "achievement", "first")
		granted = []
		for ref in ("first", "second", "third"):  # 'first' is already claimed
			if _record_claim(USER, "achievement", ref):
				granted.append(ref)
		self.assertEqual(granted, ["second", "third"])

	def test_declaring_autoname_hash_is_what_broke_it(self):
		"""Pins the hazard. If anyone puts `autoname: "hash"` back on this doctype
		while the controller keeps naming it deterministically, the duplicate stops
		being a catchable DuplicateEntryError and escapes as a raw IntegrityError.
		"""
		self.meta.autoname = "hash"
		self.assertTrue(_record_claim(USER, "achievement", "ZZ-hash"))
		with self.assertRaises(Exception) as ctx:
			_record_claim(USER, "achievement", "ZZ-hash")
		self.assertNotIsInstance(
			ctx.exception, frappe.exceptions.DuplicateEntryError,
			"under autoname 'hash' frappe never classifies this as a duplicate — "
			"that is the bug this doctype's JSON used to carry",
		)
