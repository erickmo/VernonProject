# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from vernon_project.api.certificate_rules import PUBLISHED, REVOKED, validate_period


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
