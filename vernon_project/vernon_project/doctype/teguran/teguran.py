# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

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
			if self.get(field) != old_doc.get(field)
		]
		if changed:
			frappe.throw(
				f"Tidak bisa mengubah {', '.join(changed)} setelah Teguran diterbitkan.",
				title="Teguran Tidak Bisa Diubah",
			)
