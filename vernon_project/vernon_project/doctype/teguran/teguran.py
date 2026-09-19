# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import datetime

import frappe
from frappe.model.document import Document

# Content fields are immutable once issued (see validate_content_immutable) — only
# api.teguran.akui_teguran / batalkan_teguran may move `status` afterward, and
# sp_eligible is stamped via frappe.db.set_value from the escalation counter, not
# through save(), so it never appears in this list.
PROTECTED_FIELDS = {
	"karyawan": "Karyawan",
	"tanggal": "Tanggal",
	"kategori_pelanggaran": "Kategori Pelanggaran",
	"deskripsi": "Deskripsi",
	"bukti": "Bukti",
	"diberikan_oleh": "Diberikan Oleh",
}


def _comparable(value):
	"""One shape for a value however it arrived, so only a REAL change is refused.

	The two sides of this comparison reach it differently. The stored row gives a
	Date as a `datetime.date` and an empty optional field as NULL; a JSON payload —
	an `/api/resource` PUT, `frappe.client.save`, anything posting the doc back —
	gives the same day as the string "2026-09-19" and the same emptiness as "".
	Comparing those raw made a save that changed NOTHING read as tampering with the
	Tanggal, and refused it.

	Only the representation is normalised. A different day, or filling in a field
	that was blank, still differs here and is still refused.

	Project Todo hit this exact bug first and solved it in `ProjectTodo._field_changed`,
	whose docstring describes the same "2026-09-14" != date(2026, 9, 14) failure. That
	version is meta-driven because its protected list includes Datetime and Table
	fields; this one is deliberately value-driven so the guard stays testable without a
	registered meta, which is what the mocked tests in this folder rely on. If a third
	doctype needs it, promote one of the two into a shared helper rather than writing a
	third.
	"""
	if value is None or value == "":
		return ""
	if isinstance(value, (datetime.date, datetime.datetime)):
		return str(value)
	return str(value).strip()


class Teguran(Document):
	def validate(self):
		self.validate_content_immutable()

	def get_old_doc(self):
		"""Return the previously-saved version, or None for new docs. Mirrors
		Project Todo's helper of the same name — get_doc_before_save() isn't always
		populated, so fall back to a fresh read."""
		old_doc = self.get_doc_before_save()
		if old_doc:
			return old_doc
		if self.is_new() or not self.name:
			return None
		if not frappe.db.exists("Teguran", self.name):
			return None
		return frappe.get_doc("Teguran", self.name)

	def validate_content_immutable(self):
		"""A Teguran is a record of what was said, when — editing it after the fact
		would let it be rewritten after the employee has already read it. is_new()
		and no-old-doc both no-op, so this only ever fires on an actual edit of an
		existing row."""
		if self.is_new():
			return
		old_doc = self.get_old_doc()
		if not old_doc:
			return
		changed = [
			label for field, label in PROTECTED_FIELDS.items()
			if _comparable(self.get(field)) != _comparable(old_doc.get(field))
		]
		if changed:
			frappe.throw(
				f"Tidak bisa mengubah {', '.join(changed)} setelah Teguran diterbitkan.",
				title="Teguran Tidak Bisa Diubah",
			)
