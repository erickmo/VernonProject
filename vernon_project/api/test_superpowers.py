# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Superpowers — live-site tests. Rows self-clean in tearDown. Settings knobs are
# forced in setUp (prior_mean, K, bands) so the confidence-weighted formula is pinned
# regardless of any admin edits on the live Single doc.
#
# Every number here lives on the 1..4 vote scale (VOTE_MIN..VOTE_MAX in
# api/superpowers.py, mirrored by frontend/src/lib/voteScale.ts). The bands and the
# prior below are scaled to it; the expectations are spelled out as arithmetic rather
# than memorised constants so a scale change fails loudly in one place.

import frappe
import unittest
from frappe.utils import cint, add_days, nowdate
from vernon_project.api.superpowers import (
	cast_vote,
	remove_vote,
	set_my_superpowers,
	get_user_superpowers,
	_score_ontime,
	_score_beat_deadline,
	_score_finisher,
	_STATUS_COMPLETED,
	VOTE_MAX,
	VOTE_MIN,
)

RATEE = "sp_ratee@example.com"
PRIOR_MEAN = 2.5   # midpoint of the 1..4 scale
CONFIDENCE_K = 3
# Leveling bands on the 1..4 scale — pinned so tests are deterministic.
BANDS = [("Emerging", 0), ("Capable", 2), ("Strong", 2.8), ("Expert", 3.2), ("Master", 3.5)]


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
		s.prior_mean = PRIOR_MEAN
		s.confidence_k = CONFIDENCE_K
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
			frappe.db.delete("Point Ledger", {"user": email})
			frappe.db.delete("Point Ledger", {"granted_by": email})
			frappe.db.delete("Daily Attendance", {"employee": email})
			frappe.db.delete("Project Todo", {"assigned_to": email})
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

	def _cast_n(self, sp, n, score=VOTE_MAX):
		for i in range(n):
			frappe.set_user(self._voter(i))
			cast_vote(RATEE, sp, score)
		frappe.set_user("Administrator")
		return self._agg(sp)

	def _agg(self, sp):
		"""The ratee's aggregate for one trait.

		cast_vote deliberately does NOT echo it back — received scores are private to
		the ratee (and HR), so the voter only gets their own vote returned. Read it as
		the ratee, which is the only view that carries counts/weighted/level.
		"""
		frappe.set_user(RATEE)
		try:
			prof = get_user_superpowers(RATEE)
		finally:
			frappe.set_user("Administrator")
		return next(it for it in prof["voted"] if it["superpower"] == sp)

	# --- leveling formula ---

	def test_one_vote_weighted_strong(self):
		# n=1, S=4 → W = (4 + 2.5*3)/(1+3) = 11.5/4 = 2.875 → Strong band (min 2.8).
		agg = self._cast_n(self.SPA, 1)
		self.assertEqual(agg["count"], 1)
		self.assertEqual(agg["weighted"], 2.875)
		self.assertEqual(agg["level"]["level_name"], "Strong")

	def test_four_votes_weighted_expert(self):
		# n=4, S=16 → W = (16 + 7.5)/7 = 23.5/7 ≈ 3.3571 → Expert (min 3.2).
		agg = self._cast_n(self.SPA, 4)
		self.assertEqual(agg["count"], 4)
		self.assertEqual(agg["weighted"], round(23.5 / 7, 4))
		self.assertEqual(agg["weighted"], 3.3571)
		self.assertEqual(agg["level"]["level_name"], "Expert")

	def test_many_votes_master_and_achievement(self):
		# n=20, S=80 → W = (80 + 7.5)/23 = 87.5/23 ≈ 3.8043 → Master (top band).
		agg = self._cast_n(self.SPA, 20)
		self.assertEqual(agg["count"], 20)
		self.assertEqual(agg["weighted"], round(87.5 / 23, 4))
		self.assertEqual(agg["level"]["level_name"], "Master")
		frappe.set_user(RATEE)
		prof = get_user_superpowers(RATEE)
		frappe.set_user("Administrator")
		self.assertTrue(prof["achievement"])
		self.assertIsNotNone(prof["signature"])
		self.assertEqual(prof["signature"]["superpower"], self.SPA)

	# --- voting mechanics ---

	def test_cast_vote_upsert(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, VOTE_MIN)
		echo = cast_vote(RATEE, self.SPA, VOTE_MAX)
		frappe.set_user("Administrator")
		# The voter gets only their own vote echoed back, never the ratee's aggregate.
		self.assertEqual(echo, {"superpower": self.SPA, "my_vote": VOTE_MAX})
		self.assertEqual(self._agg(self.SPA)["count"], 1)
		self.assertEqual(
			frappe.db.count("Superpower Vote", {"ratee": RATEE, "voter": voter, "superpower": self.SPA}), 1
		)

	def test_cast_vote_validation(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		with self.assertRaises(frappe.ValidationError):
			cast_vote(voter, self.SPA, VOTE_MAX)  # self-vote
		with self.assertRaises(frappe.ValidationError):
			cast_vote(RATEE, self.SPA, VOTE_MAX + 1)  # too high
		with self.assertRaises(frappe.ValidationError):
			cast_vote(RATEE, self.SPA, VOTE_MIN - 1)  # too low
		frappe.set_user("Administrator")

	def test_remove_vote(self):
		voter = self._voter(0)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, 3)
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
		cast_vote(RATEE, self.SPA, 3)
		frappe.set_user("Administrator")
		self.assertEqual(self._rec_count(), 0)
		# enable points → one row per (voter, ratee, superpower).
		self._set_vote_points(2)
		frappe.set_user(voter)
		cast_vote(RATEE, self.SPA, VOTE_MAX)  # upsert score + mint one
		self.assertEqual(self._rec_count(), 1)
		cast_vote(RATEE, self.SPA, 2)  # re-vote → no extra mint
		frappe.set_user("Administrator")
		self.assertEqual(self._rec_count(), 1)

	# --- performance-earned superpowers ---

	def _attend(self, user, days_ago, status):
		frappe.get_doc({
			"doctype": "Daily Attendance", "employee": user,
			"attendance_date": add_days(nowdate(), -days_ago), "status": status,
		}).insert(ignore_permissions=True)

	def _todo(self, user, completed_days_ago, deadline_days_ago):
		t = frappe.get_doc({
			"doctype": "Project Todo", "assigned_to": user, "status": _STATUS_COMPLETED,
			"completed_at": add_days(nowdate(), -completed_days_ago),
			"deadline": add_days(nowdate(), -deadline_days_ago),
		})
		t.flags.ignore_validate = True
		t.insert(ignore_permissions=True, ignore_mandatory=True)

	def test_ontime_score(self):
		u = self._voter(7)
		for d in range(1, 9):
			self._attend(u, d, "Present")   # 8 on-time
		for d in (9, 10):
			self._attend(u, d, "Late")       # 2 late
		frappe.db.commit()
		score, _ = _score_ontime(u, add_days(nowdate(), -30))
		self.assertEqual(round(score, 4), 3.4)  # 1 + 8/10 * 3

	def test_beat_deadline_score(self):
		u = self._voter(8)
		self._todo(u, 5, 3)   # completed before deadline -> on-time
		self._todo(u, 5, 4)   # on-time
		self._todo(u, 5, 5)   # exactly on deadline -> on-time
		self._todo(u, 3, 5)   # completed after deadline -> late
		frappe.db.commit()
		score, _ = _score_beat_deadline(u, add_days(nowdate(), -30))
		self.assertEqual(round(score, 4), 3.25)  # 1 + 3/4 * 3

	def test_finisher_score(self):
		u = self._voter(9)
		for d in range(1, 7):
			self._todo(u, d, d)   # 6 completed todos on distinct days
		frappe.db.commit()
		score, _ = _score_finisher(u, add_days(nowdate(), -30), 30)
		self.assertEqual(round(score, 4), 1.6)  # 1 + 6/30 * 3

	def test_performance_not_votable_or_claimable(self):
		perf = frappe.get_all("Superpower", filters={"kind": "Performance"}, pluck="name")
		self.assertTrue(perf, "seed performance traits missing")
		p = perf[0]
		frappe.set_user(self._voter(10))
		with self.assertRaises(frappe.ValidationError):
			cast_vote(RATEE, p, VOTE_MAX)
		frappe.set_user(RATEE)
		set_my_superpowers(RATEE, [p, self.SPA])
		mine = {m["superpower"] for m in get_user_superpowers(RATEE)["mine"]}
		self.assertIn(self.SPA, mine)
		self.assertNotIn(p, mine)  # performance trait dropped from self-claim
		frappe.set_user("Administrator")

	def test_get_user_superpowers_has_performance(self):
		v = get_user_superpowers(RATEE)
		metrics = {p["metric"] for p in v["performance"]}
		self.assertTrue({"ontime", "beat_deadline", "streak", "finisher"} <= metrics)
