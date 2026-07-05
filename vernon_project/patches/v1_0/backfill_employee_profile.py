# Copyright (c) 2026, Vernon and contributors
import frappe

from vernon_project.vernon_project.doctype.employee_profile.employee_profile import (
	_ensure_employee_profile,
)


def execute():
	"""Provision an empty Employee Profile for every enabled human User. Idempotent."""
	for u in frappe.get_all("User", filters={"enabled": 1}, pluck="name"):
		if u in ("Administrator", "Guest"):
			continue
		if not frappe.db.exists("Employee Profile", {"user": u}):
			_ensure_employee_profile(u)
	frappe.db.commit()
