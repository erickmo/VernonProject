# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from vernon_project.attendance.leave_quota import (
	effective_quota,
	used_including_prior,
	working_days,
	year_slices,
)


class AttendanceException(Document):
	def validate(self):
		self._check_leave_quota()

	def _check_leave_quota(self):
		# Only gate a Leave that is (becoming) Approved.
		if self.status != "Approved" or self.exception_type != "Leave":
			return
		# System Manager override bypasses quota — preserves the deadlock/no-leader
		# escape hatch in api/attendance.py _vote_exception (admin branch).
		if "System Manager" in frappe.get_roles(frappe.session.user):
			return
		quota = effective_quota(self.employee)
		for (year, start, end) in year_slices(self.from_date, self.to_date):
			req = working_days(self.employee, start, end)
			if req <= 0:
				continue
			used = used_including_prior(self.employee, year, exclude=self.name)
			if used + req > quota:
				remaining = max(0, quota - used)
				frappe.throw(
					_("Leave quota exceeded for {0}: {1} day(s) remaining, {2} requested.").format(
						year, remaining, req
					)
				)
