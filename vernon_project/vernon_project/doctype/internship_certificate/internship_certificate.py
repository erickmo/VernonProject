# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from vernon_project.api.certificate_rules import DRAFT, PUBLISHED, REVOKED, is_hr, validate_period


class InternshipCertificate(Document):
	def validate(self):
		problem = validate_period(self.period_start, self.period_end)
		if problem:
			frappe.throw(problem)

		# The desk is a back door around api/certificate.py. Everything below is
		# enforced there too; repeating it here means a hand-edit cannot forge a
		# certificate that the public verify page would then confirm.
		if self.status in (PUBLISHED, REVOKED) and not (self.cert_no and self.verify_code):
			frappe.throw("Sertifikat terbit wajib punya nomor dan kode verifikasi. "
				"Gunakan tombol Terbitkan, jangan ubah status langsung.")

		if self.status == REVOKED and not self.revoke_reason:
			frappe.throw("Alasan pencabutan wajib diisi.")

		self.validate_generic_save()

	def validate_generic_save(self):
		"""A published certificate is public (/verify renders it live) and frozen by
		design, and status moves only through set_certificate_status's transition rules.
		api/certificate.py saves with ignore_permissions after its own gates; any other
		save (/api/resource, frappe.client, Desk) runs on role write, which every Project
		Leader holds on every certificate. So outside HR, that path may neither touch a
		published or revoked certificate nor change any status."""
		if self.flags.ignore_permissions or is_hr(frappe.get_roles()):
			return
		old = None if self.is_new() else self.get_doc_before_save()
		before = old.status if old else DRAFT
		if before in (PUBLISHED, REVOKED) or self.status != before:
			frappe.throw("Sertifikat hanya bisa diubah lewat layar sertifikat.", frappe.PermissionError)
