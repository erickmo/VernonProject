# Copyright (c) 2026, Vernon and contributors
# See license.txt

import json
import os
import unittest

import frappe

from vernon_project.fixtures_for_tests import ensure_brand, ensure_user

PROJECT_JSON = os.path.join(os.path.dirname(__file__), "project.json")
DETAIL_JSON = os.path.join(
	os.path.dirname(os.path.dirname(__file__)), "project_detail", "project_detail.json"
)
AI_FIELDS = ("is_ai_managed", "ai_device", "ai_session_name")
TITLE = "ZZ ai-management probe"


class TestProjectAIManagement(unittest.TestCase):
	"""A Project / Project Detail can be tagged as handled by an AI session, recording
	WHICH device and session. Deliberately separate from a Project Todo's work_mode AI
	ladder.

	Enforcement is in the controller, not the schema. The fields carry
	mandatory_depends_on so the Desk form marks them required, but frappe evaluates
	that ONLY in client JS (public/js/frappe/form/layout.js) -- there is no python
	evaluator, and _get_missing_mandatory_fields looks at reqd=1 alone. Both frontends
	save a Project through the generic /api/resource PUT (useUpdateProject ->
	resource.update), so a form-level rule would bind nothing that matters.
	"""

	@classmethod
	def setUpClass(cls):
		frappe.set_user("Administrator")
		if not frappe.db.has_column("Project", "is_ai_managed"):
			raise unittest.SkipTest("doctype reload has not run yet on this site")

	def setUp(self):
		frappe.set_user("Administrator")
		self._clean()
		ensure_brand("Test Customer")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": TITLE, "brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": frappe.utils.nowdate(),
			"deadline": frappe.utils.add_days(frappe.utils.nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)

	def tearDown(self):
		self._clean()

	def _clean(self):
		frappe.db.rollback()
		for name in frappe.get_all("Project", filters={"project_name": TITLE}, pluck="name"):
			frappe.delete_doc("Project", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	# --- the controller -----------------------------------------------------------
	def test_an_existing_untagged_project_still_saves(self):
		"""The trap this design exists to avoid: a new required field turning every
		pre-existing row unsaveable."""
		doc = frappe.get_doc("Project", self.project.name)
		doc.goal = "untouched save"
		doc.save(ignore_permissions=True)
		self.assertFalse(frappe.db.get_value("Project", doc.name, "is_ai_managed"))

	def test_tagging_without_a_device_or_session_is_refused(self):
		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 1
		with self.assertRaises(frappe.MandatoryError):
			doc.save(ignore_permissions=True)

		frappe.db.rollback()
		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 1
		doc.ai_device = "box-1"
		with self.assertRaises(frappe.MandatoryError):
			doc.save(ignore_permissions=True)  # session still missing

	def test_tagging_with_both_is_accepted_and_trimmed(self):
		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 1
		doc.ai_device = "  box-1  "
		doc.ai_session_name = "  worker-a  "
		doc.save(ignore_permissions=True)
		row = frappe.db.get_value(
			"Project", doc.name, ["ai_device", "ai_session_name"], as_dict=True)
		self.assertEqual(row.ai_device, "box-1")
		self.assertEqual(row.ai_session_name, "worker-a")

	def test_untagging_clears_the_device_and_session(self):
		"""A stale device/session left behind would read as live to a consumer."""
		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 1
		doc.ai_device = "box-1"
		doc.ai_session_name = "worker-a"
		doc.save(ignore_permissions=True)

		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 0
		doc.save(ignore_permissions=True)
		row = frappe.db.get_value(
			"Project", doc.name, ["ai_device", "ai_session_name"], as_dict=True)
		self.assertIsNone(row.ai_device)
		self.assertIsNone(row.ai_session_name)

	# --- the write door + the readers ---------------------------------------------
	def test_update_project_accepts_the_fields(self):
		from vernon_project.api.project import _PROJECT_ALLOWED_FIELDS, update_project

		for field in AI_FIELDS:
			self.assertIn(field, _PROJECT_ALLOWED_FIELDS)
		update_project(self.project.name, {
			"is_ai_managed": 1, "ai_device": "box-2", "ai_session_name": "worker-b"})
		self.assertEqual(
			frappe.db.get_value("Project", self.project.name, "ai_device"), "box-2")

	def test_get_project_exposes_them(self):
		from vernon_project.api.mobile import get_project

		doc = frappe.get_doc("Project", self.project.name)
		doc.is_ai_managed = 1
		doc.ai_device = "box-3"
		doc.ai_session_name = "worker-c"
		doc.save(ignore_permissions=True)
		out = get_project(self.project.name)
		self.assertTrue(out["is_ai_managed"])
		self.assertEqual(out["ai_device"], "box-3")
		self.assertEqual(out["ai_session_name"], "worker-c")


class TestAIManagementRules(unittest.TestCase):
	"""The rules, without the schema. These run green BEFORE the doctype reload, which
	is what makes the branch verifiable ahead of the deploy -- the doc-level class above
	can only run once the reload has added the columns.

	validate_ai_management takes a doc-like object and reads through .get(), so a plain
	_dict exercises exactly the code the controller runs.
	"""

	def _doc(self, **fields):
		doc = frappe._dict(fields)
		doc.get = lambda key, default=None: fields.get(key, default)
		return doc

	def test_an_untagged_doc_is_left_alone_and_cleared(self):
		from vernon_project.vernon_project.doctype.project.project import (
			validate_ai_management,
		)

		doc = self._doc(is_ai_managed=0, ai_device="stale", ai_session_name="stale")
		validate_ai_management(doc)
		self.assertIsNone(doc.ai_device)
		self.assertIsNone(doc.ai_session_name)

	def test_a_tagged_doc_without_both_values_is_refused(self):
		from vernon_project.vernon_project.doctype.project.project import (
			validate_ai_management,
		)

		for device, session in (("", ""), ("box-1", ""), ("", "worker-a"), ("  ", " ")):
			with self.assertRaises(frappe.MandatoryError):
				validate_ai_management(
					self._doc(is_ai_managed=1, ai_device=device, ai_session_name=session)
				)

	def test_a_tagged_doc_is_trimmed_and_capped(self):
		from vernon_project.vernon_project.doctype.project.project import (
			AI_FIELD_MAX,
			validate_ai_management,
		)

		doc = self._doc(
			is_ai_managed=1, ai_device="  box-1  ", ai_session_name="x" * (AI_FIELD_MAX + 50)
		)
		validate_ai_management(doc)
		self.assertEqual(doc.ai_device, "box-1")
		self.assertEqual(len(doc.ai_session_name), AI_FIELD_MAX)


	# --- the schema ships what the controller expects ----------------------------
	def test_both_doctypes_ship_the_three_fields(self):
		for path in (PROJECT_JSON, DETAIL_JSON):
			names = {f["fieldname"] for f in json.load(open(path))["fields"]}
			for field in AI_FIELDS:
				self.assertIn(field, names, f"{field} missing from {os.path.basename(path)}")

	def test_the_fields_are_never_reqd_1(self):
		"""reqd:1 applies to EVERY row, so it would have made every existing untagged
		Project unsaveable the moment the schema landed. mandatory_depends_on is the
		form affordance; the controller is the enforcement."""
		for path in (PROJECT_JSON, DETAIL_JSON):
			for f in json.load(open(path))["fields"]:
				if f["fieldname"] in ("ai_device", "ai_session_name"):
					self.assertFalse(f.get("reqd"), f"{f['fieldname']} is reqd:1 in {path}")
					self.assertTrue(f.get("mandatory_depends_on"), f["fieldname"])

	def test_it_never_touches_a_todo_s_own_ai_tag(self):
		"""The scope guard: project-level AI management and the todo AI ladder are two
		different things and must not leak into each other."""
		import inspect

		from vernon_project.vernon_project.doctype.project.project import (
			validate_ai_management,
		)

		src = inspect.getsource(validate_ai_management)
		for leaked in ("work_mode", "ai_prompt", "ai_prompt_confirmed"):
			self.assertNotIn(leaked, src, f"AI management reads/writes {leaked}")

	def test_the_project_detail_controller_reuses_the_same_implementation(self):
		from vernon_project.vernon_project.doctype.project.project import (
			validate_ai_management as a,
		)
		from vernon_project.vernon_project.doctype.project_detail.project_detail import (
			validate_ai_management as b,
		)

		self.assertIs(a, b, "the two doctypes forked the validation")


if __name__ == "__main__":
	unittest.main()
