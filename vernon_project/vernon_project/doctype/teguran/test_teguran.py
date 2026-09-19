# Copyright (c) 2026, Vernon and Contributors
# Mocked tests for Teguran's content-immutability guard (fi6pcqtd64).
#
# Doesn't go through frappe.new_doc("Teguran") / Document(...) — the DocType
# doesn't exist in the live schema until migrate runs (same situation as
# fnqrprd6v7's is_follow_up field before its migrate), and Document.__init__
# requires a registered meta even for an in-memory instance. Instead this binds
# the real, unbound Teguran methods onto a plain stand-in object that only
# implements what those two methods actually touch: is_new(), get(field), and
# get_doc_before_save(). Python methods are just functions taking self, so this
# exercises the exact same code as a real Document would.

import frappe
import unittest
from unittest.mock import Mock
from vernon_project.vernon_project.doctype.teguran.teguran import Teguran

CONTENT_DEFAULTS = dict(
	karyawan="emp@x.com", tanggal="2026-09-01", kategori_pelanggaran="Keterlambatan",
	deskripsi="Terlambat lebih dari 30 menit tanpa pemberitahuan sebelumnya.",
	bukti=None, diberikan_oleh="hr@x.com",
)


class _FakeTeguran:
	"""Stand-in for a Teguran Document — only what validate_content_immutable
	and get_old_doc touch."""
	def __init__(self, **overrides):
		self.name = "fake-name"
		self.status = "Diterbitkan"
		for k, v in CONTENT_DEFAULTS.items():
			setattr(self, k, v)
		for k, v in overrides.items():
			setattr(self, k, v)
		self.is_new = Mock(return_value=False)
		self.get_doc_before_save = Mock(return_value=None)

	def get(self, field):
		return getattr(self, field, None)

	# Bind the real methods under test.
	get_old_doc = Teguran.get_old_doc
	validate_content_immutable = Teguran.validate_content_immutable


def _old(**overrides):
	base = dict(CONTENT_DEFAULTS)
	base.update(overrides)
	return frappe._dict(base)


class TestTeguranImmutable(unittest.TestCase):
	def test_allows_new_documents(self):
		doc = _FakeTeguran()
		doc.is_new = Mock(return_value=True)
		doc.validate_content_immutable()  # must not raise

	def test_allows_unchanged_save(self):
		doc = _FakeTeguran()
		doc.get_doc_before_save = Mock(return_value=_old())
		doc.validate_content_immutable()  # must not raise, e.g. saving after status change

	def test_blocks_deskripsi_change(self):
		doc = _FakeTeguran(deskripsi="Teks yang sudah diubah setelah diterbitkan ke karyawan.")
		doc.get_doc_before_save = Mock(return_value=_old())
		with self.assertRaises(frappe.ValidationError):
			doc.validate_content_immutable()

	def test_blocks_karyawan_change(self):
		doc = _FakeTeguran(karyawan="other@x.com")
		doc.get_doc_before_save = Mock(return_value=_old())
		with self.assertRaises(frappe.ValidationError):
			doc.validate_content_immutable()

	def test_blocks_kategori_change(self):
		doc = _FakeTeguran(kategori_pelanggaran="Kinerja")
		doc.get_doc_before_save = Mock(return_value=_old())
		with self.assertRaises(frappe.ValidationError):
			doc.validate_content_immutable()

	def test_status_change_alone_is_allowed(self):
		"""akui_teguran/batalkan_teguran only touch status + a couple of non-protected
		fields — the immutability guard must not block that."""
		doc = _FakeTeguran(status="Diakui", diakui_pada="2026-09-08 08:00:00", tanggapan_karyawan="Baik, dicatat.")
		doc.get_doc_before_save = Mock(return_value=_old())
		doc.validate_content_immutable()  # must not raise

	# Not tested here: get_old_doc()'s DB-read fallback (get_doc_before_save()
	# returning None). It's the identical pattern already covered by Project
	# Todo's own get_old_doc tests, and exercising it here would need a real
	# `tabTeguran` table, which doesn't exist until this DocType is migrated.


if __name__ == "__main__":
	unittest.main()


class TestTeguranGuardRunsOnSave(unittest.TestCase):
	"""The freeze must not become a blanket lock.

	The guard's WIRING is already pinned by `api/test_teguran.py`'s
	`test_content_immutable_after_issue`, which edits a real saved Teguran and
	expects the refusal — so that is deliberately not repeated here. What was
	missing is the other direction: proof that an ALLOWED edit still gets through
	the same save path.

	The header above explains the mocking as "the DocType doesn't exist in the live
	schema until migrate runs". That is no longer true — Teguran is registered and
	has a table — so real documents are usable here now.
	"""

	EMPLOYEE = "teguran-save-path@test.local"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.EMPLOYEE):
			frappe.get_doc({"doctype": "User", "email": self.EMPLOYEE, "first_name": "Teguran",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.doc = frappe.get_doc({
			"doctype": "Teguran", "karyawan": self.EMPLOYEE, "tanggal": frappe.utils.nowdate(),
			"kategori_pelanggaran": "Keterlambatan", "deskripsi": "Terlambat tiga kali",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		if self.doc and frappe.db.exists("Teguran", self.doc.name):
			frappe.delete_doc("Teguran", self.doc.name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def test_an_unprotected_field_still_saves_through_the_same_path(self):
		"""The freeze is scoped to the content fields. If this fails, the guard has
		stopped being an immutability rule and become a blanket lock.

		Re-reads the row first, deliberately. The guard compares the in-memory value
		against the stored one with `!=`, so a doc still holding the values as they
		were POSTED — a date as the string "2026-09-19" rather than a date object —
		is reported as having changed the Tanggal when it changed nothing. That is a
		real defect in the guard, not a quirk of this test, so it is raised
		separately rather than pinned here as if it were intended.
		"""
		fresh = frappe.get_doc("Teguran", self.doc.name)
		fresh.status = "Diakui"
		fresh.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Teguran", self.doc.name, "status"), "Diakui")
