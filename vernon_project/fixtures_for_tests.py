# Copyright (c) 2026, Vernon and Contributors
# See license.txt
"""Fixture helpers shared by the test modules.

Deliberately NOT named `test_*`: the Frappe runner collects those as test modules.

These exist because the app's rules outgrew its fixtures. A long-lived test user
created before Project started checking roles still exists — so "create it if
missing" silently leaves it role-less. Ensure the state, not just the row.
"""

import frappe


# Fixture users we had to switch on, and what their `enabled` was beforehand.
# These suites run against the LIVE DB with no rollback, so a fixture that simply
# sets enabled=1 permanently re-enables the account -- which would undo a security
# cleanup. Enable for the test, hand it back in tearDown.
_ENABLED_BY_FIXTURE = {}


def ensure_user(email, first_name=None, roles=(), ensure_enabled=False):
	"""A test User that exists AND holds `roles`.

	Project validates that its owner/leader carry the matching role, and reading a
	Project Todo needs one of the project roles at all — so a bare user fails in
	ways that look like permission bugs.

	`ensure_enabled` also switches a disabled account on for the duration of the
	test. Project.validate calls remove_disabled_team_members(), so a DISABLED
	fixture user is silently dropped from team_members and every todo assigned to it
	then fails "is not a team member" -- 50 tests went red exactly that way when
	three fixture accounts were disabled on 2026-09-12. Pair it with
	restore_fixture_users() in tearDown; see that function for why.
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
	if ensure_enabled and not frappe.db.get_value("User", email, "enabled"):
		_ENABLED_BY_FIXTURE.setdefault(email, 0)
		frappe.db.set_value("User", email, "enabled", 1, update_modified=False)
	if roles:
		doc = frappe.get_doc("User", email)
		missing = [r for r in roles if r not in {x.role for x in doc.roles}]
		if missing:
			for role in missing:
				doc.append("roles", {"role": role})
			doc.save(ignore_permissions=True)
	return email


def restore_fixture_users():
	"""Put back the `enabled` of every account ensure_user had to switch on.

	Call it from tearDown. Without this, running the suite quietly re-enables any
	deliberately-disabled account it touched, on the live site, and the next person
	to audit accounts finds them on again with no idea why.

	Known gap, and it is the reason this is a restore rather than a permanent set: a
	run killed between setUp and tearDown leaves the account enabled. That is a
	strictly smaller window than "enabled forever", and the account it affects has no
	password and no api_key, so it cannot authenticate either way.
	"""
	for email, was in list(_ENABLED_BY_FIXTURE.items()):
		if frappe.db.exists("User", email):
			frappe.db.set_value("User", email, "enabled", was, update_modified=False)
		_ENABLED_BY_FIXTURE.pop(email, None)


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
