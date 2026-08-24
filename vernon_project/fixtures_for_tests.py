# Copyright (c) 2026, Vernon and Contributors
# See license.txt
"""Fixture helpers shared by the test modules.

Deliberately NOT named `test_*`: the Frappe runner collects those as test modules.

These exist because the app's rules outgrew its fixtures. A long-lived test user
created before Project started checking roles still exists — so "create it if
missing" silently leaves it role-less. Ensure the state, not just the row.
"""

import frappe


def ensure_user(email, first_name=None, roles=()):
	"""A test User that exists AND holds `roles`.

	Project validates that its owner/leader carry the matching role, and reading a
	Project Todo needs one of the project roles at all — so a bare user fails in
	ways that look like permission bugs.
	"""
	if not frappe.db.exists("User", email):
		try:
			frappe.get_doc({
				"doctype": "User",
				"email": email,
				"first_name": first_name or email.split("@")[0],
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		except frappe.DuplicateEntryError:
			# These suites run against the live DB with no rollback: a sibling test
			# whose tearDown died leaves the row behind while the cache says it is
			# gone. The row is what we wanted anyway.
			frappe.db.rollback()
	if roles:
		doc = frappe.get_doc("User", email)
		missing = [r for r in roles if r not in {x.role for x in doc.roles}]
		if missing:
			for role in missing:
				doc.append("roles", {"role": role})
			doc.save(ignore_permissions=True)
	return email


def ensure_brand(name):
	"""A test Brand. `company` is mandatory now — borrow whichever the site has."""
	if not frappe.db.exists("Brand", name):
		frappe.get_doc({
			"doctype": "Brand",
			"brand_name": name,
			"company": frappe.db.get_value("Company", {}, "name"),
		}).insert(ignore_permissions=True)
	return name


def ensure_group(name, level_id, base_rate=1, difficulty=100, type_name="General", level_name="L1"):
	"""A test Group with one level. Project Todo and Meeting both need group + level
	to score: point = base_rate × minutes × difficulty%."""
	if not frappe.db.exists("Group", name):
		frappe.get_doc({
			"doctype": "Group",
			"group_name": name,
			"base_rate_per_minute": base_rate,
			"levels": [{
				"type_name": type_name, "level_name": level_name,
				"level_id": level_id, "difficulty_percent": difficulty,
			}],
		}).insert(ignore_permissions=True)
	return name
