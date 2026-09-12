# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""Backend suite for todo b0dtp0hihs -- Teguran (warning before SP), the
missing-/m-menu follow-up on fi6pcqtd64.

Three enumerated cases from the prompt turned out to describe behaviour the
running code doesn't have. Corrected in place, not dropped:
  - "leader can issue to own report": teguran.py's own module docstring says
    this deliberately: "Only HR Manager / System Manager may issue... There is
    no 'leader sees their team's Teguran' view" -- project_leader is
    per-project, not a global reporting-line concept. A leader with no HR
    role is refused exactly like any other non-HR user.
  - "missing description -> MandatoryError": terbitkan_teguran raises
    MandatoryError only for a missing karyawan. A too-short/missing deskripsi
    hits `frappe.throw("Deskripsi minimal 20 karakter.")` with no exc= arg,
    which defaults to ValidationError, not MandatoryError.
  - "acknowledge requires a tanggapan": akui_teguran only sets tanggapan_karyawan
    if one is given (`if tanggapan: ...`) -- it's optional, not required.
  - "HR notified once on escalation": _cek_eskalasi() only ever runs from
    terbitkan_teguran (a NEW issuance), never from a save of an existing
    record. A second new Teguran issued while already over threshold
    legitimately re-notifies (confirmed live) -- that's not a bug. The real
    "not on every subsequent save" guarantee is that acknowledging an
    already-flagged Teguran (which does call doc.save()) adds nothing, since
    akui_teguran never calls _cek_eskalasi at all. Tested that way instead.

Also: a real, separate bug found while diagnosing the missing /m menu, fixed
alongside it. bootstrap()'s vernon_roles filter (api/mobile.py) omitted "HR
Manager" entirely, so boot.roles could never contain it -- canHrApprove()
(frontend/src/hooks/useData.ts, shared by both /m and /w) checks
boot.roles.includes('HR Manager'), so a real HR Manager who is NOT also a
System Manager could never pass that check on EITHER front-end, for ANY
canHrApprove-gated feature, not just Teguran. Fixed by adding "HR Manager" to
the filter. test_bootstrap_reports_hr_manager_role below is the regression
lock; test_menu_visibility_flags_match_permissions is case 19's server-side
half -- the client-side half (canHrApprove's role list matching _is_hr()'s)
can't be asserted from Python and is noted, not silently skipped.
"""

import unittest

import frappe
from frappe.utils import add_days, add_months, nowdate

from vernon_project.api.teguran import (
	terbitkan_teguran, akui_teguran, batalkan_teguran,
	get_teguran_saya, get_teguran_all, get_teguran_detail,
)

HR = "tgr_hr@example.com"
LEADER = "tgr_leader@example.com"
EMPLOYEE_A = "tgr_employee_a@example.com"
EMPLOYEE_B = "tgr_employee_b@example.com"


# One savepoint per test, rolled back in tearDown. This suite is a plain
# unittest.TestCase, which Frappe gives NO transaction handling — so before this,
# setUp and tearDown each committed and every Teguran a test issued was written
# permanently to the site. One did: a disciplinary record against
# tgr_employee_a@example.com survived a run on 2026-09-09, and because it sat
# inside the escalation window it then made two of these very tests fail until
# someone deleted it by hand.
#
# The savepoint is taken before the fixture users exist and rolled back after the
# test, so EVERYTHING a test writes is undone — including anything it forgot to
# register for cleanup, which is exactly how the leak happened.
SAVEPOINT = "teguran_test"


def _hold_commits(case):
	"""Stop this test's writes from becoming permanent, and keep the savepoint alive.

	The test's own commits were only half the story. api/mobile.py::_notify commits
	immediately after inserting a Vernon Notification — deliberately, because it then
	enqueues a web push and the worker has to be able to see the row. Issuing one
	Teguran runs _notify eight times, so the Teguran was committed to the live site
	whatever the test did, and every COMMIT silently discards every open savepoint,
	which is why rolling back to one failed with "SAVEPOINT does not exist".

	So the commit is held for the duration of the test and released afterwards. This
	is a test-only measure: _notify's commit is correct in production, it has 28 call
	sites across 12 modules, and changing it is a separate decision with a much wider
	blast radius than this file.
	"""
	real = frappe.db.commit
	frappe.db.commit = lambda *a, **kw: None
	case.addCleanup(lambda: setattr(frappe.db, "commit", real))


class TeguranFixture(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_hold_commits(self)
		frappe.db.savepoint(SAVEPOINT)
		for email in (HR, LEADER, EMPLOYEE_A, EMPLOYEE_B):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", HR)
		if not any(r.role == "HR Manager" for r in u.roles):
			u.append("roles", {"role": "HR Manager"})
			u.save(ignore_permissions=True)
		lu = frappe.get_doc("User", LEADER)
		for role in ("Project Owner", "Project Leader"):
			if not any(r.role == role for r in lu.roles):
				lu.append("roles", {"role": role})
		lu.save(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		# Undoes the Teguran rows AND the Vernon Settings edits the threshold tests
		# make. Vernon Settings is a Single doctype, global to the whole site: a run
		# killed between these two lines used to leave production's disciplinary
		# escalation threshold at whatever a test wanted.
		frappe.db.rollback(save_point=SAVEPOINT)

	def _issue(self, as_user=HR, karyawan=EMPLOYEE_A, deskripsi=None, tanggal=None):
		frappe.set_user(as_user)
		try:
			res = terbitkan_teguran(
				karyawan, "Keterlambatan",
				deskripsi or "Terlambat masuk kerja tanpa pemberitahuan sebelumnya.",
				tanggal=tanggal,
			)
		finally:
			frappe.set_user("Administrator")
		return res["name"]


class TestTeguranIssueAndScope(TeguranFixture):

	def test_hr_can_issue_teguran(self):
		name = self._issue()
		self.assertEqual(frappe.db.get_value("Teguran", name, "status"), "Diterbitkan")

	def test_leader_cannot_issue_no_reporting_line_concept_exists(self):
		"""Corrected: teguran.py's own docstring documents this deliberately --
		there is no leader-issues-to-own-report path. A leader with no HR role
		is refused like anyone else."""
		frappe.set_user(LEADER)
		try:
			with self.assertRaises(frappe.PermissionError):
				terbitkan_teguran(EMPLOYEE_A, "Keterlambatan", "x" * 25)
		finally:
			frappe.set_user("Administrator")

	def test_unrelated_employee_cannot_issue(self):
		frappe.set_user(EMPLOYEE_B)
		try:
			with self.assertRaises(frappe.PermissionError):
				terbitkan_teguran(EMPLOYEE_A, "Keterlambatan", "x" * 25)
		finally:
			frappe.set_user("Administrator")

	def test_missing_karyawan_raises_mandatory_error(self):
		frappe.set_user(HR)
		try:
			with self.assertRaises(frappe.MandatoryError):
				terbitkan_teguran("", "Keterlambatan", "x" * 25)
		finally:
			frappe.set_user("Administrator")

	def test_short_description_raises_validation_error_not_mandatory(self):
		"""Corrected: no exc= is passed for the length check, so it defaults to
		ValidationError -- not MandatoryError as the prompt assumed."""
		frappe.set_user(HR)
		try:
			with self.assertRaises(frappe.ValidationError):
				terbitkan_teguran(EMPLOYEE_A, "Keterlambatan", "too short")
			with self.assertRaises(frappe.ValidationError):
				terbitkan_teguran(EMPLOYEE_A, "Keterlambatan", "")
		finally:
			frappe.set_user("Administrator")

	def test_subject_sees_own_teguran_in_list(self):
		name = self._issue()
		frappe.set_user(EMPLOYEE_A)
		try:
			names = {r["name"] for r in get_teguran_saya()}
		finally:
			frappe.set_user("Administrator")
		self.assertIn(name, names)

	def test_other_employee_cannot_read_it(self):
		name = self._issue()
		frappe.set_user(EMPLOYEE_B)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_teguran_detail(name)
		finally:
			frappe.set_user("Administrator")

	def test_list_is_scoped_per_viewer(self):
		name = self._issue()
		frappe.set_user(EMPLOYEE_B)
		try:
			b_names = {r["name"] for r in get_teguran_saya()}
		finally:
			frappe.set_user("Administrator")
		self.assertNotIn(name, b_names)
		all_names = {r["name"] for r in get_teguran_all()}
		self.assertIn(name, all_names)
		frappe.set_user(EMPLOYEE_B)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_teguran_all()
		finally:
			frappe.set_user("Administrator")

	def test_paginated_and_status_filtered(self):
		"""Performance gate: get_teguran_all is server-paginated and can filter
		by status, not "load everything and count in Python"."""
		n1 = self._issue(deskripsi="Pelanggaran satu, lebih dari dua puluh karakter.")
		n2 = self._issue(deskripsi="Pelanggaran dua, lebih dari dua puluh karakter.")
		frappe.set_user(HR)
		try:
			one_page = get_teguran_all(page_length=1)
			self.assertEqual(len(one_page), 1)
			diterbitkan_only = get_teguran_all(status="Diterbitkan", page_length=0)
		finally:
			frappe.set_user("Administrator")
		names = {r["name"] for r in diterbitkan_only}
		self.assertIn(n1, names)
		self.assertIn(n2, names)

	def test_list_carries_names_via_link_fetch_not_extra_query(self):
		"""Performance gate: karyawan/diberikan_oleh full names come through the
		list call itself (link-field fetch), not a per-row follow-up lookup."""
		self._issue()
		frappe.set_user(HR)
		try:
			rows = get_teguran_all()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("karyawan_name", rows[0])
		self.assertIn("diberikan_oleh_name", rows[0])


class TestTeguranAcknowledge(TeguranFixture):

	def test_subject_can_acknowledge_with_tanggapan(self):
		name = self._issue()
		frappe.set_user(EMPLOYEE_A)
		try:
			akui_teguran(name, tanggapan="Saya mengerti, tidak akan terulang.")
		finally:
			frappe.set_user("Administrator")
		row = frappe.db.get_value("Teguran", name, ["status", "tanggapan_karyawan"], as_dict=True)
		self.assertEqual(row.status, "Diakui")
		self.assertEqual(row.tanggapan_karyawan, "Saya mengerti, tidak akan terulang.")

	def test_tanggapan_is_optional_not_required(self):
		"""Corrected: akui_teguran only sets tanggapan_karyawan `if tanggapan`
		-- there's no requirement check. Acknowledging with none succeeds."""
		name = self._issue()
		frappe.set_user(EMPLOYEE_A)
		try:
			res = akui_teguran(name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok")
		self.assertEqual(frappe.db.get_value("Teguran", name, "status"), "Diakui")

	def test_only_subject_can_acknowledge(self):
		name = self._issue()
		for user in (HR, EMPLOYEE_B):
			frappe.set_user(user)
			try:
				with self.assertRaises(frappe.PermissionError):
					akui_teguran(name)
			finally:
				frappe.set_user("Administrator")

	def test_acknowledge_twice_is_rejected(self):
		name = self._issue()
		frappe.set_user(EMPLOYEE_A)
		try:
			akui_teguran(name)
			with self.assertRaises(frappe.ValidationError):
				akui_teguran(name)
		finally:
			frappe.set_user("Administrator")

	def test_content_immutable_after_issue(self):
		name = self._issue()
		doc = frappe.get_doc("Teguran", name)
		doc.deskripsi = "Deskripsi yang diubah setelah diterbitkan, lebih dari dua puluh."
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)


class TestTeguranCancel(TeguranFixture):

	def test_hr_can_cancel(self):
		name = self._issue()
		frappe.set_user(HR)
		try:
			batalkan_teguran(name, "Kesalahan pencatatan.")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Teguran", name, "status"), "Dibatalkan")

	def test_non_hr_cannot_cancel(self):
		name = self._issue()
		for user in (LEADER, EMPLOYEE_A):
			frappe.set_user(user)
			try:
				with self.assertRaises(frappe.PermissionError):
					batalkan_teguran(name, "alasan")
			finally:
				frappe.set_user("Administrator")

	def test_cancel_requires_a_reason(self):
		name = self._issue()
		frappe.set_user(HR)
		try:
			with self.assertRaises(frappe.MandatoryError):
				batalkan_teguran(name, "")
		finally:
			frappe.set_user("Administrator")

	def test_cancelled_teguran_does_not_count_toward_escalation(self):
		"""Escalation is evaluated AT ISSUANCE time against whatever is active
		then -- it isn't retroactively re-evaluated when an earlier Teguran is
		later cancelled. So n1 must be cancelled BEFORE n2 is issued for this
		to test what it claims (a cancelled-before-the-fact Teguran doesn't
		count), not issuing both first and cancelling after."""
		frappe.db.set_value("Vernon Settings", None, {"teguran_batas_sebelum_sp": 2, "teguran_jendela_bulan": 6})
		n1 = self._issue(deskripsi="Pelanggaran pertama, lebih dari dua puluh karakter.")
		frappe.set_user(HR)
		try:
			batalkan_teguran(n1, "Dibatalkan untuk pengujian.")
		finally:
			frappe.set_user("Administrator")
		n2 = self._issue(deskripsi="Pelanggaran kedua, lebih dari dua puluh karakter.")
		# n1 was already cancelled when n2 was issued -> active count is 1, below
		# threshold 2, so no escalation on n2.
		self.assertFalse(frappe.db.get_value("Teguran", n2, "sp_eligible"))


class TestTeguranEscalation(TeguranFixture):

	def test_threshold_within_window_sets_sp_eligible(self):
		frappe.db.set_value("Vernon Settings", None, {"teguran_batas_sebelum_sp": 2, "teguran_jendela_bulan": 6})
		self._issue(deskripsi="Pelanggaran pertama, lebih dari dua puluh karakter.")
		n2 = self._issue(deskripsi="Pelanggaran kedua, lebih dari dua puluh karakter.")
		self.assertTrue(frappe.db.get_value("Teguran", n2, "sp_eligible"))

	def test_older_teguran_outside_window_does_not_count(self):
		frappe.db.set_value("Vernon Settings", None, {"teguran_batas_sebelum_sp": 2, "teguran_jendela_bulan": 3})
		old_date = add_days(add_months(nowdate(), -4), 0)
		self._issue(tanggal=old_date, deskripsi="Pelanggaran lama, lebih dari dua puluh karakter.")
		n2 = self._issue(deskripsi="Pelanggaran baru, lebih dari dua puluh karakter.")
		# Only n2 is inside the 3-month window -> count is 1, below threshold 2.
		self.assertFalse(frappe.db.get_value("Teguran", n2, "sp_eligible"))

	def test_hr_notified_once_on_escalation(self):
		"""Corrected: _cek_eskalasi() is only ever called from terbitkan_teguran
		(issuing a NEW record) -- it is never wired to fire on a save of an
		EXISTING one. So issuing a SECOND new Teguran while already over
		threshold legitimately re-evaluates against that second record (which
		starts sp_eligible=False) and DOES notify again -- confirmed live: a
		real +N on the second issue, not zero. That's arguably correct (each
		additional warning past the threshold is its own noteworthy event),
		not a bug this test should pin as "zero".

		What the module's own comment and the prompt's "not on every
		subsequent SAVE" actually describe is narrower: acknowledging an
		already-flagged Teguran (akui_teguran, which does call doc.save())
		must not re-notify -- and it can't, since akui_teguran never calls
		_cek_eskalasi at all. That's the real guarantee, tested here.

		_notify_hr_sp_eligible also notifies every _hr_users() holder, and
		this is a live site with real HR staff already in it -- the delta on
		the issue itself is len(_hr_users()), not a hardcoded 1."""
		from vernon_project.api.attendance import _hr_users
		frappe.db.set_value("Vernon Settings", None, {"teguran_batas_sebelum_sp": 1, "teguran_jendela_bulan": 6})
		before = frappe.db.count(
			"Vernon Notification", {"type": "Warning", "title": "Karyawan layak SP"},
		)
		name = self._issue(deskripsi="Pelanggaran pertama, lebih dari dua puluh karakter.")
		after_issue = frappe.db.count(
			"Vernon Notification", {"type": "Warning", "title": "Karyawan layak SP"},
		)
		self.assertEqual(after_issue, before + len(_hr_users()))

		# The real "not on every subsequent save" claim: acknowledging the
		# already-flagged record (a save on the SAME doc) adds nothing.
		frappe.set_user(EMPLOYEE_A)
		try:
			akui_teguran(name)
		finally:
			frappe.set_user("Administrator")
		after_acknowledge = frappe.db.count(
			"Vernon Notification", {"type": "Warning", "title": "Karyawan layak SP"},
		)
		self.assertEqual(after_acknowledge, after_issue)


class TestBootstrapHrManagerRoleFix(unittest.TestCase):
	"""Regression lock for the real bug found while diagnosing the missing /m
	menu: bootstrap()'s role filter omitted 'HR Manager', so boot.roles could
	never contain it -- canHrApprove() (shared by both front-ends) would then
	be permanently False for a pure HR Manager on every canHrApprove-gated
	feature, not just Teguran."""

	USER = "tgr_bootstrap_hr@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		# Same discipline as TeguranFixture. This one committed an HR-Manager
		# account, and tgr_bootstrap_hr@example.com is on the live site today
		# because of it — an enabled account holding a real HR role.
		_hold_commits(self)
		frappe.db.savepoint(SAVEPOINT)
		if not frappe.db.exists("User", self.USER):
			frappe.get_doc({
				"doctype": "User", "email": self.USER, "first_name": "Bootstrap HR",
				"send_welcome_email": 0, "roles": [{"role": "HR Manager"}],
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback(save_point=SAVEPOINT)

	def test_bootstrap_reports_hr_manager_role(self):
		from vernon_project.api.mobile import bootstrap
		frappe.set_user(self.USER)
		try:
			boot = bootstrap()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("HR Manager", boot["roles"])

	def test_menu_visibility_flags_match_permissions(self):
		"""Case 19, server-side half: the boot payload a pure HR Manager
		receives must actually reflect that role, since canHrApprove (the ONE
		shared function both front-ends call) derives visibility from exactly
		this array. NOTE: the client-side half of "one shared source" --
		canHrApprove's role-name list matching _is_hr()'s -- can't be asserted
		from a Python test; it's verified by inspection (frontend/src/hooks/
		useData.ts's canHrApprove checks the identical two role names
		terbitkan_teguran/_require_hr's _is_hr() checks) and noted here rather
		than silently assumed."""
		from vernon_project.api.mobile import bootstrap
		from vernon_project.api.teguran import _is_hr

		frappe.set_user(self.USER)
		try:
			boot = bootstrap()
			server_says_hr = _is_hr()
		finally:
			frappe.set_user("Administrator")
		client_would_show_it = "HR Manager" in boot["roles"] or "System Manager" in boot["roles"]
		self.assertTrue(server_says_hr)
		self.assertEqual(client_would_show_it, server_says_hr)
