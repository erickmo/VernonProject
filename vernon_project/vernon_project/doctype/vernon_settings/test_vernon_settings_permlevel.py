# Copyright (c) 2026, Vernon and contributors
# See license.txt

import json
import os
import unittest

import frappe

# Reachable ONLY through Desk or a generic /api/resource save -- none of these is a
# parameter of api/mobile.save_app_settings, and none appears in either frontend.
# midtrans_server_key is the sole gate on the allow_guest midtrans_notify webhook;
# the four point fields set the rates that mint wallet points.
RESTRICTED = (
	"midtrans_server_key",
	"midtrans_client_key",
	"recognition_points",
	"feedback_points",
	"recognition_weekly_cap",
	"intern_point_target_per_month",
)

# Deliberately Group-Manager-editable through save_app_settings, which saves with
# ignore_permissions=True -- so permlevel would be theatre on these and they are NOT
# in RESTRICTED. Whether a Group Manager should set penalty rates is a product call.
APP_EDITABLE_SAMPLE = "attendance_grace_minutes"

DOCTYPE = "Vernon Settings"
_JSON = os.path.join(os.path.dirname(__file__), "vernon_settings.json")


def _group_manager():
	for u in frappe.get_all("Has Role", filters={"role": "Group Manager"}, pluck="parent"):
		if u != "Administrator" and "System Manager" not in frappe.get_roles(u):
			return u
	return None


class TestVernonSettingsPermlevel(unittest.TestCase):
	"""Vernon Settings is the control plane for payments, points and leave accrual, and
	every field sat at permlevel 0 with Group Manager holding write. Proven before this
	(rolled back): a Group Manager could save the singleton directly.

	The schema half is inert until migrate, so the runtime test below does not rely on
	it: it applies the shipped permlevel to the in-process meta if the migrate has not
	run yet, which makes the assertion true both before and after deployment.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self.gm = _group_manager()
		if not self.gm:
			self.skipTest("no Group Manager without System Manager on this site")
		self._patched = []

	def tearDown(self):
		for df in self._patched:
			df.permlevel = 0
		frappe.clear_cache(doctype=DOCTYPE)
		frappe.db.rollback()
		frappe.set_user("Administrator")

	def _apply_shipped_permlevel(self, doc):
		"""Make the meta match what the JSON SHIPS, whether or not migrate has run.

		It reads the permlevel out of the json rather than off the RESTRICTED list on
		purpose. Taking it from the constant would manufacture the very condition under
		test, so the assertion below would pass against an unrestricted schema too --
		green for the wrong reason. Reading the file means this test fails if the
		permlevel is ever dropped from the doctype, and is a no-op once migrate has
		applied it.
		"""
		shipped = {f["fieldname"]: f.get("permlevel", 0)
			for f in json.load(open(_JSON))["fields"]}
		for df in doc.meta.fields:
			want = shipped.get(df.fieldname, 0)
			if want and not df.permlevel:
				df.permlevel = want
				self._patched.append(df)
		if hasattr(doc.meta, "high_permlevel_fields"):
			del doc.meta.high_permlevel_fields

	# --- the shipped schema -------------------------------------------------------
	def test_the_restricted_fields_ship_at_permlevel_1(self):
		fields = {f["fieldname"]: f for f in json.load(open(_JSON))["fields"]}
		for name in RESTRICTED:
			self.assertEqual(fields[name].get("permlevel"), 1, f"{name} is not restricted")

	def test_a_permlevel_1_access_row_exists_for_system_manager(self):
		"""Without a row AT permlevel 1, frappe strips those fields for EVERY role --
		System Manager included -- and the six become unconfigurable by anyone. Easy to
		miss, because permlevel 1 on the field alone looks like it did the job."""
		perms = json.load(open(_JSON))["permissions"]
		rows = [p for p in perms if p.get("permlevel") == 1 and p.get("write")]
		self.assertTrue(rows, "no permlevel-1 write row: nobody could set these fields")
		self.assertEqual([p["role"] for p in rows], ["System Manager"])

	def test_the_app_editable_fields_are_NOT_restricted(self):
		"""save_app_settings saves with ignore_permissions=True, so permlevel cannot
		gate what it exposes. Restricting those would be a false sense of security."""
		fields = {f["fieldname"]: f for f in json.load(open(_JSON))["fields"]}
		self.assertFalse(fields[APP_EDITABLE_SAMPLE].get("permlevel"))

	# --- the runtime refusal ------------------------------------------------------
	def test_a_group_manager_cannot_change_a_restricted_field_by_a_generic_save(self):
		"""The door the fix closes. Uses recognition_points, a non-secret member of the
		same restricted set -- the Midtrans key's value is never read or written here."""
		before = frappe.db.get_single_value(DOCTYPE, "recognition_points")
		frappe.set_user(self.gm)
		doc = frappe.get_doc(DOCTYPE)
		self._apply_shipped_permlevel(doc)
		doc.recognition_points = (before or 0) + 500
		doc.save()  # the real role path: no ignore_permissions
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_single_value(DOCTYPE, "recognition_points"), before,
			"a Group Manager minted a new recognition rate through a generic save",
		)

	def test_a_group_manager_can_still_save_the_fields_the_app_gives_them(self):
		"""The pin: save_app_settings must keep working for the ten policy fields it
		legitimately owns, or the settings screen breaks for every Group Manager."""
		from vernon_project.api.mobile import save_app_settings

		before = frappe.db.get_single_value(DOCTYPE, APP_EDITABLE_SAMPLE)
		frappe.set_user(self.gm)
		save_app_settings(**{APP_EDITABLE_SAMPLE: int(before or 0) + 1})
		frappe.set_user("Administrator")
		self.assertEqual(
			int(frappe.db.get_single_value(DOCTYPE, APP_EDITABLE_SAMPLE)), int(before or 0) + 1
		)
		frappe.db.set_single_value(DOCTYPE, APP_EDITABLE_SAMPLE, before)
		frappe.db.commit()  # save_app_settings commits, so the restore must too


if __name__ == "__main__":
	unittest.main()
