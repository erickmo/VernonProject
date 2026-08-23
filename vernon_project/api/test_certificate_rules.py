# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure-function tests for the certificate state machine, the published snapshot and the
# public verification payload. No DB: every function under test takes plain dicts.

import unittest

from vernon_project.api.certificate_rules import (
	DRAFT, PENDING, PUBLISHED, REVOKED,
	build_snapshot, build_verify_payload, can_transition, make_cert_no,
	make_verify_code, next_actions, validate_period,
)

HR = ["HR Manager", "All"]
SYSMGR = ["System Manager", "All"]
LEADER = ["Project Leader", "All"]
NOBODY = ["All"]


def check(current, target, roles=LEADER, is_leader=True):
	return can_transition(current, target, roles=roles, is_leader=is_leader)


class TestTransitions(unittest.TestCase):
	def test_leader_submits_a_draft(self):
		self.assertTrue(check(DRAFT, PENDING).ok)

	def test_leader_cannot_publish_their_own_certificate(self):
		out = check(DRAFT, PUBLISHED)
		self.assertFalse(out.ok)
		self.assertIn("HR", out.reason)

	def test_leader_cannot_publish_even_from_pending(self):
		self.assertFalse(check(PENDING, PUBLISHED).ok)

	def test_hr_publishes_from_pending(self):
		self.assertTrue(check(PENDING, PUBLISHED, roles=HR, is_leader=False).ok)

	def test_hr_can_publish_a_draft_directly(self):
		# HR owns the outcome; forcing a pointless round trip helps nobody.
		self.assertTrue(check(DRAFT, PUBLISHED, roles=HR, is_leader=False).ok)

	def test_system_manager_counts_as_hr(self):
		self.assertTrue(check(PENDING, PUBLISHED, roles=SYSMGR, is_leader=False).ok)

	def test_hr_sends_back_to_draft(self):
		self.assertTrue(check(PENDING, DRAFT, roles=HR, is_leader=False).ok)

	def test_leader_withdraws_their_own_submission(self):
		self.assertTrue(check(PENDING, DRAFT).ok)

	def test_hr_revokes_a_published_certificate(self):
		self.assertTrue(check(PUBLISHED, REVOKED, roles=HR, is_leader=False).ok)

	def test_leader_cannot_revoke(self):
		self.assertFalse(check(PUBLISHED, REVOKED).ok)

	def test_a_stranger_can_do_nothing(self):
		for target in (PENDING, PUBLISHED, REVOKED, DRAFT):
			self.assertFalse(check(DRAFT, target, roles=NOBODY, is_leader=False).ok)


class TestTerminalAndIllegalTransitions(unittest.TestCase):
	def test_revoked_is_one_way(self):
		for target in (DRAFT, PENDING, PUBLISHED):
			out = check(REVOKED, target, roles=SYSMGR, is_leader=False)
			self.assertFalse(out.ok, target)
			self.assertIn("dicabut", out.reason.lower())

	def test_published_cannot_go_back_to_draft(self):
		# An issued certificate is a historical record. Editing it would let the paper
		# in someone's hand disagree with the QR they scan.
		self.assertFalse(check(PUBLISHED, DRAFT, roles=SYSMGR, is_leader=False).ok)

	def test_published_cannot_go_back_to_pending(self):
		self.assertFalse(check(PUBLISHED, PENDING, roles=SYSMGR, is_leader=False).ok)

	def test_publishing_twice_is_refused(self):
		self.assertFalse(check(PUBLISHED, PUBLISHED, roles=HR, is_leader=False).ok)

	def test_unknown_status_is_refused_not_crashed(self):
		self.assertFalse(check("Sideways", PUBLISHED, roles=SYSMGR, is_leader=False).ok)
		self.assertFalse(check(DRAFT, "Sideways", roles=SYSMGR, is_leader=False).ok)

	def test_no_op_transition_is_refused(self):
		self.assertFalse(check(DRAFT, DRAFT).ok)


class TestNextActions(unittest.TestCase):
	def test_leader_sees_submit_on_a_draft(self):
		self.assertEqual(next_actions(DRAFT, roles=LEADER, is_leader=True), [PENDING])

	def test_hr_sees_publish_and_send_back_on_pending(self):
		self.assertEqual(
			sorted(next_actions(PENDING, roles=HR, is_leader=False)), sorted([PUBLISHED, DRAFT]))

	def test_nothing_to_do_on_a_revoked_certificate(self):
		self.assertEqual(next_actions(REVOKED, roles=SYSMGR, is_leader=False), [])

	def test_stranger_sees_no_actions(self):
		self.assertEqual(next_actions(DRAFT, roles=NOBODY, is_leader=False), [])


class TestValidatePeriod(unittest.TestCase):
	def test_normal_period_passes(self):
		self.assertIsNone(validate_period("2026-01-01", "2026-06-30"))

	def test_single_day_period_is_allowed(self):
		self.assertIsNone(validate_period("2026-01-01", "2026-01-01"))

	def test_end_before_start_is_refused(self):
		self.assertIsNotNone(validate_period("2026-06-30", "2026-01-01"))

	def test_missing_dates_are_refused(self):
		self.assertIsNotNone(validate_period(None, "2026-01-01"))
		self.assertIsNotNone(validate_period("2026-01-01", None))
		self.assertIsNotNone(validate_period(None, None))

	def test_datetime_values_are_accepted(self):
		self.assertIsNone(validate_period("2026-01-01 08:00:00", "2026-01-02 17:00:00"))


class TestCertNo(unittest.TestCase):
	def test_format_is_padded_and_year_scoped(self):
		self.assertEqual(make_cert_no(2026, 1), "VRN/CERT/2026/0001")
		self.assertEqual(make_cert_no(2026, 42), "VRN/CERT/2026/0042")

	def test_four_digits_is_a_floor_not_a_ceiling(self):
		self.assertEqual(make_cert_no(2026, 12345), "VRN/CERT/2026/12345")

	def test_sequence_starts_at_one(self):
		self.assertTrue(make_cert_no(2026, 1).endswith("0001"))


class TestVerifyCode(unittest.TestCase):
	def test_length_and_alphabet(self):
		code = make_verify_code()
		self.assertEqual(len(code), 22)
		self.assertTrue(code.isalnum() or set(code) <= set(
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"))

	def test_codes_do_not_repeat(self):
		# The code IS the access control on the public page, so collisions and
		# predictability are the whole threat model.
		self.assertEqual(len({make_verify_code() for _ in range(500)}), 500)

	def test_url_safe(self):
		for _ in range(50):
			code = make_verify_code()
			self.assertNotIn("/", code)
			self.assertNotIn("+", code)
			self.assertNotIn("=", code)


CERT = {
	"name": "abc123", "cert_no": "VRN/CERT/2026/0007", "verify_code": "s" * 22,
	"status": PUBLISHED, "intern_name": "Budi Santoso", "position": "Frontend Intern",
	"project_name": "Website Revamp", "period_start": "2026-01-06", "period_end": "2026-06-30",
	"issued_on": "2026-07-01", "auto_score": 88.0, "rubric_score": 91.0,
	"summary": "Kerja rapi.",
	"breakdown_json": '{"components": [{"key": "completion", "label": "Penyelesaian Tugas",'
		' "weight": 30, "value": 90.0, "points": 27.0, "detail": "9/10"}]}',
	"rubric": [{"label": "Kualitas Kerja", "weight": 30, "score": 95, "comment": "bagus"}],
}


def payload(**over):
	c = dict(CERT)
	c.update(over)
	return build_verify_payload(c)


class TestVerifyPayload(unittest.TestCase):
	def test_published_certificate_is_valid(self):
		out = payload()
		self.assertEqual(out["state"], "valid")
		self.assertEqual(out["cert_no"], "VRN/CERT/2026/0007")
		self.assertEqual(out["intern_name"], "Budi Santoso")
		self.assertEqual(out["auto_score"], 88.0)
		self.assertEqual(out["rubric_score"], 91.0)

	def test_breakdown_and_rubric_are_exposed(self):
		out = payload()
		self.assertEqual(out["components"][0]["label"], "Penyelesaian Tugas")
		self.assertEqual(out["rubric"][0]["label"], "Kualitas Kerja")

	def test_revoked_certificate_says_revoked_and_keeps_identity(self):
		# Never a 404: "we revoked this" and "we have never heard of this" are opposite
		# answers to whoever is holding the paper.
		out = payload(status=REVOKED, revoked_on="2026-08-01", revoke_reason="Diterbitkan keliru")
		self.assertEqual(out["state"], "revoked")
		self.assertEqual(out["cert_no"], "VRN/CERT/2026/0007")
		self.assertEqual(out["revoked_on"], "2026-08-01")
		self.assertEqual(out["revoke_reason"], "Diterbitkan keliru")

	def test_revoked_certificate_hides_the_scores(self):
		out = payload(status=REVOKED)
		self.assertIsNone(out["auto_score"])
		self.assertIsNone(out["rubric_score"])
		self.assertEqual(out["components"], [])

	def test_unpublished_certificate_is_indistinguishable_from_unknown(self):
		# A draft must never leak through the public page, not even as "exists".
		for status in (DRAFT, PENDING):
			out = payload(status=status)
			self.assertEqual(out["state"], "not_found")
			self.assertIsNone(out["intern_name"])
			self.assertIsNone(out["cert_no"])

	def test_missing_certificate_is_not_found(self):
		out = build_verify_payload(None)
		self.assertEqual(out["state"], "not_found")
		self.assertIsNone(out["intern_name"])

	def test_broken_breakdown_json_degrades_quietly(self):
		out = payload(breakdown_json="{not json")
		self.assertEqual(out["state"], "valid")
		self.assertEqual(out["components"], [])

	def test_empty_breakdown_json_is_fine(self):
		self.assertEqual(payload(breakdown_json=None)["components"], [])

	def test_internal_fields_never_reach_the_public_page(self):
		out = payload()
		for leaked in ("intern", "name", "published_by", "verify_code", "breakdown_json"):
			self.assertNotIn(leaked, out)


class TestSnapshot(unittest.TestCase):
	def _snap(self, **over):
		kw = dict(
			auto={"auto_score": 88.0, "grade": "A", "components": [
				{"key": "completion", "label": "Penyelesaian Tugas", "weight": 30,
					"value": 90.0, "points": 27.0, "detail": "9/10"}]},
			rubric_rows=[{"label": "Kualitas Kerja", "weight": 30, "score": 95, "comment": ""}],
		)
		kw.update(over)
		return build_snapshot(**kw)

	def test_freezes_both_scores_and_both_grades(self):
		out = self._snap()
		self.assertEqual(out["auto_score"], 88.0)
		self.assertEqual(out["rubric_score"], 95.0)
		self.assertEqual(out["auto_grade"], "A")
		self.assertEqual(out["rubric_grade"], "A")

	def test_breakdown_json_round_trips(self):
		import json
		out = self._snap()
		back = json.loads(out["breakdown_json"])
		self.assertEqual(back["components"][0]["detail"], "9/10")
		self.assertEqual(back["auto_score"], 88.0)

	def test_no_combined_score_is_invented(self):
		self.assertNotIn("final_score", self._snap())
		self.assertNotIn("combined_score", self._snap())

	def test_unscorable_intern_freezes_none_not_zero(self):
		out = self._snap(auto={"auto_score": None, "grade": None, "components": []},
			rubric_rows=[])
		self.assertIsNone(out["auto_score"])
		self.assertIsNone(out["rubric_score"])
		self.assertIsNone(out["auto_grade"])

	def test_snapshot_is_independent_of_later_edits(self):
		components = [{"key": "completion", "label": "x", "weight": 30, "value": 90.0,
			"points": 27.0, "detail": "9/10"}]
		out = build_snapshot(auto={"auto_score": 88.0, "grade": "A", "components": components},
			rubric_rows=[])
		components[0]["value"] = 0.0        # the live data moves on...
		import json
		self.assertEqual(json.loads(out["breakdown_json"])["components"][0]["value"], 90.0)


if __name__ == "__main__":
	unittest.main()
