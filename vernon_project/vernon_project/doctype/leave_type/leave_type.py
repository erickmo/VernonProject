# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

# The annual leave pool is identified by a FLAG, not a name: attendance/leave_quota.py
#   default_annual_type() -> get_value("Leave Type", {"is_default_annual": 1, "enabled": 1})
# and cuti_ledger.ensure_grant() stamps that name onto every annual Grant row. So the
# flag is load-bearing for the leave ledger, and three separate edits detach it:
#   * flagging a second type      -> the get_value picks an arbitrary one of the two
#   * disabling the flagged type  -> the enabled=1 filter misses, returns None
#   * clearing the last flag      -> same, returns None
# and a None type makes ensure_grant write a Grant with leave_type NULL (the field is
# not reqd), silently detaching the annual pool. 162 ledger rows depend on it today.
#
# api/attendance.py's save_leave_type / delete_leave_type already enforce most of
# this, but they are one door: a plain Desk save or an /api/resource PUT runs on the
# role grant alone, and HR Manager holds create/write/delete here. These guards live
# in the controller so every door is bound; the API stays the friendly front door.


class LeaveType(Document):
	def validate(self):
		if int(self.is_default_annual or 0):
			if not int(self.enabled or 0):
				frappe.throw(_("Kategori cuti tahunan default tidak dapat dinonaktifkan."))
		elif not self.is_new():
			self._refuse_to_drop_the_last_default()

	def _refuse_to_drop_the_last_default(self):
		"""Clearing the flag on the last default detaches the pool exactly as
		disabling it does. save_leave_type does NOT guard this one -- it only refuses
		default+disabled -- so this is the only place it is caught.
		"""
		was_default = frappe.db.get_value("Leave Type", self.name, "is_default_annual")
		if not was_default:
			return
		if not frappe.db.exists(
			"Leave Type", {"is_default_annual": 1, "enabled": 1, "name": ["!=", self.name]}
		):
			frappe.throw(_("Harus ada satu kategori cuti tahunan default."))

	def on_update(self):
		# At most one default-annual type. Deduped AFTER the save so self.name is
		# final -- the same order, and for the same reason, as save_leave_type.
		if int(self.is_default_annual or 0):
			frappe.db.sql(
				"UPDATE `tabLeave Type` SET is_default_annual = 0 WHERE name != %s", (self.name,)
			)

	def on_trash(self):
		if int(self.is_default_annual or 0):
			frappe.throw(_("Kategori cuti tahunan default tidak dapat dihapus."))
		if frappe.db.exists("Attendance Exception", {"leave_type": self.name}):
			frappe.throw(_("Kategori dipakai pengajuan yang ada; nonaktifkan saja."))
