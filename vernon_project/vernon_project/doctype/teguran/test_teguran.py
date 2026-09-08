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
