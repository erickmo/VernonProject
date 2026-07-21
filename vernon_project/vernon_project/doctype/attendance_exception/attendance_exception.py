# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from vernon_project.attendance.cuti_ledger import remaining as ledger_remaining
from vernon_project.attendance.leave_quota import (
	default_annual_type,
	working_days,
	year_slices,
)


class AttendanceException(Document):
	def validate(self):
		self._check_leave_quota()

	def _check_leave_quota(self):
		# Only gate a default-annual-pool Leave that is (becoming) Approved. Per-Event /
		# Documented types are ceilinged at request time (leave_quota.check_request); they
		# have no running balance, so there is nothing to check here.
		if self.status != "Approved" or self.exception_type != "Leave":
			return
		if not self.leave_type or self.leave_type != default_annual_type():
			return
		# Balance is the ledger SUM. The debit for THIS exception is minted on_update
		# (after this save), so exclude_exception matters only on an edit of an already
		# -approved cuti — there we must add its own stale debit back before comparing.
		# No System Manager bypass: to allow an over-quota leave, raise the employee's
		# annual_leave_quota (an honest record) — a silent override left none.
		for (year, start, end) in year_slices(self.from_date, self.to_date):
			req = working_days(self.employee, start, end)
			if req <= 0:
				continue
			avail = ledger_remaining(self.employee, year, exclude_exception=self.name)
			if req > avail:
				frappe.throw(
					_("Kuota cuti {0} tidak cukup: sisa {1} hari, diminta {2} hari.").format(
						year, max(0, round(avail)), req
					)
				)
