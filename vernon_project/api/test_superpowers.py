# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Superpowers — live-site tests. Rows self-clean in tearDown. Settings knobs are
# forced in setUp (prior_mean=5, K=3, standard bands) so the confidence-weighted
# formula is pinned regardless of any admin edits on the live Single doc.

import frappe
import unittest
from frappe.utils import cint
from vernon_project.api.superpowers import (
	cast_vote,
	remove_vote,
	set_my_superpowers,
	get_user_superpowers,
)

RATEE = "sp_ratee@example.com"
# Standard leveling bands (== seed defaults) — pinned so tests are deterministic.
BANDS = [("Emerging", 0), ("Capable", 4), ("Strong", 6), ("Expert", 8), ("Master", 9)]


class TestSuperpowers(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.emails = set()
		self.created_sps = set()
		self._ensure_user(RATEE, "Ratee")
		self.SPA = self._ensure_sp("SPTEST Alpha")
		self.SPB = self._ensure_sp("SPTEST Beta")
		# Snapshot the live Single so tearDown can restore it exactly (live DB —
		# no test DB), then force deterministic knobs/bands for the run.
		s = frappe.get_single("Superpower Settings")
		self._orig_settings = {
			"prior_mean": s.prior_mean,
			"confidence_k": s.confidence_k,
			"vote_points": s.vote_points,
			"levels": [
				{"level_name": lv.level_name, "min_score": lv.min_score, "color": lv.color, "icon": lv.icon}
				for lv in s.levels
			],
		}
		s.prior_mean = 5
		s.confidence_k = 3
		s.vote_points = 0
		s.set("levels", [])
		for level_name, min_score in BANDS:
			s.append("levels", {"level_name": level_name, "min_score": min_score, "color": "#ccc", "icon": "star"})
		s.save(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for email in self.emails:
			frappe.db.delete("Superpower Vote", {"ratee": email})
			frappe.db.delete("Superpower Vote", {"voter": email})
			frappe.db.delete("User Superpower", {"user": email})
			frappe.db.delete("Point Ledger", {"user": email, "source": "Recognition"})
		for name in self.created_sps:
			if frappe.db.exists("Superpower", name):
				frappe.delete_doc("Superpower", name, ignore_permissions=True, force=1)
		for email in self.emails:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		# Restore the live Single exactly as it was before the test.
		s = frappe.get_single("Superpower Settings")
		s.prior_mean = self._orig_settings["prior_mean"]
		s.confidence_k = self._orig_settings["confidence_k"]
		s.vote_points = self._orig_settings["vote_points"]
		s.set("levels", [])
		for lv in self._orig_settings["levels"]:
			s.append("levels", lv)
		s.save(ignore_permissions=True)
		frappe.db.commit()

	# --- helpers ---

	def _ensure_user(self, email, name):
		if not frappe.db.exists("User", email):
			frappe.get_doc({
				"doctype": "User", "email": email, "first_name": name,
				"send_welcome_email": 0, "enabled": 1,
			}).insert(ignore_permissions=True)
		self.emails.add(email)

	def _ensure_sp(self, name):
		if not frappe.db.exists("Superpower", name):
			frappe.get_doc({
				"doctype": "Superpower", "superpower_name": name,
				"category": "Craft", "icon": "star", "color": "#000000", "enabled": 1,
			}).insert(ignore_permissions=True)
			self.created_sps.add(name)
		return name

	def _voter(self, i):
		email = f"sp_voter{i}@example.com"
		self._ensure_user(email, f"Voter {i}")
		return email

	def _set_vote_points(self, pts):
		s = frappe.get_single("Superpower Settings")
		s.vote_points = pts
		s.save(ignore_permissions=True)
		frappe.db.commit()

	def _rec_count(self):
		return frappe.db.count("Point Ledger", {"user": RATEE, "source": "Recognition"})

	def _cast_n(self, sp, n, score=10):
		agg = None
		for i in range(n):
			frappe.set_user(self._voter(i))
			agg = cast_vote(RATEE, sp, score)
		frappe.set_user("Administrator")
		return agg

	# --- leveling formula ---

	def test_one_vote_weighted_strong(self):
		# n=1, S=10 → W = (10 + 5*3)/(1+3) = 6.25 → Strong band (min 6).
		agg = self._cast_n(self.SPA, 1)
		self.assertEqual(agg["count"], 1)
		self.assertEqual(agg["weighted"], 6.25)
		self.assertEqual(agg["level"]["level_name"], "Strong")

	def test_four_votes_weighted_strong(self):
		# n=4, S=40 → W = (40+15)/7 = 55/7 ≈ 7.8571 → still Strong (Expert is 8).
		agg = self._cast_n(self.SPA, 4)
		self.assertEqual(agg["count"], 4)
		self.assertEqual(agg["weighted"], round(55 / 7, 4))
		self.assertEqual(agg["weighted"], 7.8571)
		self.assertEqual(agg["level"]["level_name"], "Strong")

	def test_many_votes_master_and_achievement(self):
		# n=20, S=200 → W = 215/23 ≈ 9.3478 → Master (top band) → achievement.
		agg = self._cast_n(self.SPA, 20)
		self.assertEqual(agg["count"], 20)
		self.assertEqual(agg["weighted"], round(215 / 23, 4))
		self.assertEqual(agg["level"]["level_name"], "Master")
		prof = get_user_superpowers(RATEE)
		self.assertTrue(prof["achievement"])
		self.assertIsNotNone(prof["signature"])
		self.assertEqual(prof["signature"]["superpower"], self.SPA)

	# --- voting mechanics ---

	def test_cast_vote_upsert(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, 3)
		agg = cast_vote(RATEE, self.SPA, 8)
		frappe.set_user("Administrator")
		self.assertEqual(agg["count"], 1)
		self.assertEqual(agg["my_vote"], 8)
		self.assertEqual(
			frappe.db.count("Superpower Vote", {"ratee": RATEE, "voter": voter, "superpower": self.SPA}), 1
		)

	def test_cast_vote_validation(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		with self.assertRaises(frappe.ValidationError):
			cast_vote(voter, self.SPA, 5)  # self-vote
		with self.assertRaises(frappe.ValidationError):
			cast_vote(RATEE, self.SPA, 11)  # too high
		with self.assertRaises(frappe.ValidationError):
			cast_vote(RATEE, self.SPA, -1)  # too low
		frappe.set_user("Administrator")

	def test_remove_vote(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, 7)
		self.assertEqual(remove_vote(RATEE, self.SPA)["superpower"], self.SPA)
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.count("Superpower Vote", {"ratee": RATEE, "voter": voter, "superpower": self.SPA}), 0
		)

	# --- my superpowers ---

	def test_set_my_superpowers_replace_dedup(self):
		frappe.set_user(RATEE)
		mine = set_my_superpowers(RATEE, [self.SPA, self.SPA, self.SPB, "", "no_such_sp"])
		self.assertEqual({m["superpower"] for m in mine}, {self.SPA, self.SPB})
		self.assertEqual(len(mine), 2)
		# replacement, not accumulation
		mine = set_my_superpowers(RATEE, [self.SPB])
		self.assertEqual({m["superpower"] for m in mine}, {self.SPB})
		frappe.set_user("Administrator")

	def test_set_my_superpowers_gate(self):
		other = self._voter(0)
		frappe.set_user(other)
		with self.assertRaises(frappe.PermissionError):
			set_my_superpowers(RATEE, [self.SPA])
		frappe.set_user("Administrator")

	# --- recognition minting ---

	def test_recognition_minting_inert_then_idempotent(self):
		voter = self._voter(0)
		# default vote_points = 0 → mints nothing.
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, 8)
		frappe.set_user("Administrator")
		self.assertEqual(self._rec_count(), 0)
		# enable points → one row per (voter, ratee, superpower).
		self._set_vote_points(2)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, 9)  # upsert score + mint one
		self.assertEqual(self._rec_count(), 1)
		cast_vote(RATEE, self.SPA, 4)  # re-vote → no extra mint
		frappe.set_user("Administrator")
		self.assertEqual(self._rec_count(), 1)
