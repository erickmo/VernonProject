# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""`update_user` / `save_user_with_profile` / `save_announcement` must treat an
omitted argument as "leave as is".

They did not. `roles` parsed to the empty list, so omitting it removed every
VERNON_ROLE the user had — Project Owner, Project Leader, Project Admin, Project
Team, Points Granter, HR Manager, AI User — and `enabled` defaulted to 1 and was
written on every call, so a profile-only edit re-enabled a disabled account.
`save_announcement.published` defaulted to 0 the same way and unpublished a live
banner on any edit that omitted it.

Both in-app callers happen to send the full payload every time (api.ts's wrapper
forces `roles` and both user forms seed from the saved record), which is why this
never showed up in the UI. It is reachable from the whitelisted endpoint, which is
what the MCP and any direct API caller use.
"""
import unittest

import frappe

from vernon_project.api.announcement import save_announcement
from vernon_project.api.mobile import update_user
from vernon_project.tests.no_leak import NoLeakMixin


class TestOmittedArgsLeaveStateAlone(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.user = frappe.get_doc({
			"doctype": "User",
			"email": "omitted-args-probe@example.com",
			"first_name": "Omitted Args Probe",
			"enabled": 1,
		}).insert(ignore_permissions=True)
		self.user.add_roles("Project Leader", "AI User")

	def _vernon_roles(self):
		from vernon_project.api.mobile import VERNON_ROLES
		doc = frappe.get_doc("User", self.user.name)
		return {r.role for r in doc.get("roles") if r.role in VERNON_ROLES}

	def test_omitting_roles_does_not_strip_them(self):
		# The regression: a job-title-only edit used to remove every Vernon role.
		update_user(self.user.name, full_name="Renamed Probe")
		self.assertEqual(self._vernon_roles(), {"Project Leader", "AI User"})

	def test_an_explicit_empty_list_still_clears_them(self):
		# Clearing must stay POSSIBLE — api.ts sends [] for a user with no roles,
		# so a guard that ignored [] too would break the real admin form.
		update_user(self.user.name, roles=[])
		self.assertEqual(self._vernon_roles(), set())

	def test_an_explicit_list_still_replaces_the_set(self):
		update_user(self.user.name, roles=["Project Team"])
		self.assertEqual(self._vernon_roles(), {"Project Team"})

	def test_omitting_enabled_does_not_reenable_a_disabled_account(self):
		frappe.db.set_value("User", self.user.name, "enabled", 0)
		update_user(self.user.name, full_name="Still Disabled")
		self.assertEqual(frappe.db.get_value("User", self.user.name, "enabled"), 0)

	def test_enabled_zero_still_disables(self):
		update_user(self.user.name, enabled=0)
		self.assertEqual(frappe.db.get_value("User", self.user.name, "enabled"), 0)


class TestAnnouncementPublishedIsNotClobbered(NoLeakMixin, unittest.TestCase):
	"""save_announcement calls frappe.db.commit() itself, so NoLeakMixin's rollback
	CANNOT undo what these tests write — every row created here is a real row on the
	site. Hence the explicit tearDown. It deletes by the exact names this class
	created, never by a time window, so it can never eat a row it did not make."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.created = []
		self.name = self._make(published=1)

	def _make(self, **kw):
		name = save_announcement(
			message="Probe announcement",
			start_date="2026-01-01",
			end_date="2026-12-31",
			**kw,
		)["name"]
		self.created.append(name)
		return name

	def tearDown(self):
		for name in self.created:
			if frappe.db.exists("Announcement", name):
				frappe.delete_doc("Announcement", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_editing_without_published_leaves_it_published(self):
		save_announcement(
			message="Probe announcement edited",
			start_date="2026-01-01",
			end_date="2026-12-31",
			name=self.name,
		)
		self.assertEqual(frappe.db.get_value("Announcement", self.name, "published"), 1)

	def test_a_new_announcement_without_published_is_a_draft(self):
		other = self._make()
		self.assertEqual(frappe.db.get_value("Announcement", other, "published"), 0)

	def test_published_zero_still_unpublishes(self):
		save_announcement(
			message="Probe announcement",
			start_date="2026-01-01",
			end_date="2026-12-31",
			name=self.name,
			published=0,
		)
		self.assertEqual(frappe.db.get_value("Announcement", self.name, "published"), 0)
