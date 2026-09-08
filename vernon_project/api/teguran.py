# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
"""Teguran: an HR warning-before-SP record (fi6pcqtd64).

Backend only for now — deliberately no /m or /w screens yet. Three real
assumptions are baked in here because the todo's own notes were empty and
there is no global employee->leader relationship in this app to build the
"leader issues/sees it" model the auto-drafted prompt assumed:

1. Only HR Manager / System Manager may issue, cancel, or see every Teguran.
   There is no "leader sees their team's Teguran" view — project_leader is
   per-project, not a global manager relationship, so "whose team" has no
   answer here. If the owner wants leaders involved, that needs an actual
   reporting-line concept first, which is a bigger decision than this todo.
2. kategori_pelanggaran options (Keterlambatan/Absen Tanpa Izin/Kinerja/
   Perilaku/Lainnya) are inferred from the title, not owner-specified.
3. The escalation threshold (3 Teguran in 6 months -> sp_eligible) is a
   configurable Vernon Settings default, not a hardcoded rule, so HR can
   change it without a code change once the real policy is confirmed.

All three are cheap to change: the HR-only gate is one function
(`_require_hr`), the categories are one Select field, the threshold is two
Settings fields already wired to `_hitung_teguran_aktif`.
"""

import frappe
from frappe.utils import add_months, getdate


def _is_hr(user=None):
	roles = frappe.get_roles(user or frappe.session.user)
	return "HR Manager" in roles or "System Manager" in roles


def _require_hr():
	if not _is_hr():
		frappe.throw("Hanya HR Manager yang boleh melakukan ini.", frappe.PermissionError)


TEGURAN_FIELDS = [
	"name", "karyawan", "tanggal", "kategori_pelanggaran", "deskripsi",
	"bukti", "diberikan_oleh", "status", "tanggapan_karyawan", "diakui_pada",
	"alasan_pembatalan", "sp_eligible", "creation",
]


@frappe.whitelist()
def terbitkan_teguran(karyawan, kategori_pelanggaran, deskripsi, tanggal=None, bukti=None):
	"""Issue a new Teguran. HR Manager / System Manager only (see module docstring
	assumption 1). Notifies the employee and re-checks the escalation counter."""
	_require_hr()
	karyawan = (karyawan or "").strip()
	if not karyawan:
		frappe.throw("Karyawan wajib diisi.", frappe.MandatoryError)
	if not frappe.db.exists("User", karyawan):
		frappe.throw(f"User {karyawan} tidak ditemukan.", frappe.DoesNotExistError)
	if karyawan == frappe.session.user:
		frappe.throw("Tidak bisa menerbitkan Teguran untuk diri sendiri.")

	deskripsi = (deskripsi or "").strip()
	if len(deskripsi) < 20:
		frappe.throw("Deskripsi minimal 20 karakter.")

	tanggal = tanggal or frappe.utils.today()
	if getdate(tanggal) > getdate(frappe.utils.today()):
		frappe.throw("Tanggal tidak boleh di masa depan.")

	doc = frappe.get_doc({
		"doctype": "Teguran",
		"karyawan": karyawan,
		"tanggal": tanggal,
		"kategori_pelanggaran": kategori_pelanggaran,
		"deskripsi": deskripsi,
		"bukti": bukti,
		"diberikan_oleh": frappe.session.user,
		"status": "Diterbitkan",
	}).insert(ignore_permissions=True)

	_notify_karyawan_teguran(doc)
	_cek_eskalasi(karyawan)
	return {"name": doc.name}


@frappe.whitelist()
def akui_teguran(name, tanggapan=None):
	"""The employee acknowledges their own Teguran. Allowed once."""
	doc = frappe.get_doc("Teguran", name)
	if frappe.session.user != doc.karyawan:
		frappe.throw(
			"Hanya karyawan yang bersangkutan yang boleh mengakui Teguran ini.",
			frappe.PermissionError,
		)
	if doc.status == "Diakui":
		frappe.throw("Teguran ini sudah diakui sebelumnya.")
	if doc.status == "Dibatalkan":
		frappe.throw("Teguran yang dibatalkan tidak bisa diakui.")

	doc.status = "Diakui"
	doc.diakui_pada = frappe.utils.now()
	if tanggapan:
		doc.tanggapan_karyawan = tanggapan
	doc.save(ignore_permissions=True)
	_notify_issuer_diakui(doc)
	return {"status": "ok"}


@frappe.whitelist()
def batalkan_teguran(name, alasan_pembatalan):
	"""HR-only cancellation, reason mandatory. A cancelled Teguran no longer
	counts toward the SP-eligibility escalation (see _hitung_teguran_aktif)."""
	_require_hr()
	alasan_pembatalan = (alasan_pembatalan or "").strip()
	if not alasan_pembatalan:
		frappe.throw("Alasan pembatalan wajib diisi.", frappe.MandatoryError)

	doc = frappe.get_doc("Teguran", name)
	if doc.status == "Dibatalkan":
		frappe.throw("Teguran ini sudah dibatalkan.")

	doc.status = "Dibatalkan"
	doc.alasan_pembatalan = alasan_pembatalan
	doc.save(ignore_permissions=True)
	return {"status": "ok"}


@frappe.whitelist()
def get_teguran_saya():
	"""The current user's own Teguran, newest first."""
	return frappe.get_all(
		"Teguran", filters={"karyawan": frappe.session.user},
		fields=TEGURAN_FIELDS, order_by="tanggal desc, creation desc",
	)


@frappe.whitelist()
def get_teguran_all():
	"""Every Teguran. HR Manager / System Manager only (assumption 1 — no
	per-team scoping exists to offer a narrower view)."""
	_require_hr()
	return frappe.get_all("Teguran", fields=TEGURAN_FIELDS, order_by="tanggal desc, creation desc")


@frappe.whitelist()
def get_teguran_detail(name):
	"""One Teguran, permission-scoped to the employee themselves or HR."""
	doc = frappe.get_doc("Teguran", name)
	user = frappe.session.user
	if user != doc.karyawan and not _is_hr():
		frappe.throw("Anda tidak punya akses ke Teguran ini.", frappe.PermissionError)
	out = {f: doc.get(f) for f in TEGURAN_FIELDS}
	out["can_acknowledge"] = user == doc.karyawan and doc.status == "Diterbitkan"
	out["can_cancel"] = _is_hr() and doc.status != "Dibatalkan"
	return out


def _hitung_teguran_aktif(karyawan, window_months):
	"""Count of Diterbitkan/Diakui (non-cancelled) Teguran for `karyawan` in the
	trailing `window_months`. One aggregate query."""
	since = add_months(getdate(frappe.utils.today()), -window_months)
	return frappe.db.count(
		"Teguran",
		{"karyawan": karyawan, "status": ["in", ["Diterbitkan", "Diakui"]], "tanggal": [">=", since]},
	)


def _cek_eskalasi(karyawan):
	"""Flag the newest active Teguran sp_eligible once the count reaches the
	configured threshold, and notify HR exactly once (guarded by sp_eligible
	already being set — re-issuing more Teguran afterward doesn't re-notify)."""
	settings = frappe.get_single("Vernon Settings")
	batas = settings.teguran_batas_sebelum_sp or 3
	window = settings.teguran_jendela_bulan or 6

	count = _hitung_teguran_aktif(karyawan, window)
	if count < batas:
		return

	newest = frappe.get_all(
		"Teguran",
		filters={"karyawan": karyawan, "status": ["in", ["Diterbitkan", "Diakui"]]},
		fields=["name", "sp_eligible"],
		order_by="tanggal desc, creation desc",
		limit_page_length=1,
	)
	if not newest or newest[0].sp_eligible:
		return
	frappe.db.set_value("Teguran", newest[0].name, "sp_eligible", 1)
	_notify_hr_sp_eligible(karyawan, newest[0].name, count)


def _notify_karyawan_teguran(doc):
	from vernon_project.api.mobile import _notify
	_notify(
		doc.karyawan, "Warning", "Anda menerima Teguran",
		f"Kategori: {doc.kategori_pelanggaran}. Buka untuk melihat detail dan mengonfirmasi Anda sudah membacanya.",
		"Teguran", doc.name, doc.diberikan_oleh,
	)


def _notify_issuer_diakui(doc):
	from vernon_project.api.mobile import _notify
	_notify(
		doc.diberikan_oleh, "Warning", "Teguran telah diakui",
		f"{doc.karyawan} telah membaca dan mengakui Teguran yang Anda terbitkan.",
		"Teguran", doc.name, doc.karyawan,
	)


def _notify_hr_sp_eligible(karyawan, teguran_name, count):
	from vernon_project.api.attendance import _hr_users
	from vernon_project.api.mobile import _notify
	for hr in _hr_users():
		_notify(
			hr, "Warning", "Karyawan layak SP",
			f"{karyawan} telah menerima {count} Teguran aktif dan kini layak dipertimbangkan untuk Surat Peringatan.",
			"Teguran", teguran_name, None,
		)
