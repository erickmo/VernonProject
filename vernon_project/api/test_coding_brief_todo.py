# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""k9b82d4lkh — a Coding group's todo must carry the structured brief, and its
note is rendered from it.

Every creation case drives ``frappe.client.insert`` on purpose. That is the path
the app actually uses (frontend/src/lib/api.ts `createTask`), and it is generic:
a test that called a helper in api/ would pass while the real door stayed open.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project import coding_brief
from vernon_project.api.project_todo import get_coding_brief_schema

CODING_GROUP = "Test Coding Group"
PLAIN_GROUP = "Test Plain Group"
FULL_BRIEF = {
	"goal": "Inline images in the composer",
	"surface": "frontend/src/components/MarkdownEditor.tsx",
	"acceptance": "image renders as a picture\nmention renders as a chip",
	"constraints": "existing comments keep rendering",
	"verify": "npm test in frontend/",
}


def _ensure_group(name, group_type, level_id):
	if not frappe.db.exists("Group", name):
		frappe.get_doc({
			"doctype": "Group", "group_name": name, "base_rate_per_minute": 1,
			"group_type": group_type,
			"levels": [{"type_name": "General", "level_name": "L1",
			            "level_id": level_id, "difficulty_percent": 100}],
		}).insert(ignore_permissions=True)
	elif frappe.db.get_value("Group", name, "group_type") != group_type:
		frappe.db.set_value("Group", name, "group_type", group_type)
	frappe.clear_cache(doctype="Group")
	return name, level_id


class TestCodingBriefTodo(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.coding_group, self.coding_level = _ensure_group(CODING_GROUP, "Coding", "TESTCODE1")
		self.plain_group, self.plain_level = _ensure_group(PLAIN_GROUP, "", "TESTPLAIN1")
		suffix = frappe.generate_hash(length=8)
		if not frappe.db.exists("Brand", "Test Coding Brief Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Coding Brief Brand",
			                "company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": f"Test Coding Brief Project {suffix}",
			"brand": "Test Coding Brief Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": f"Test Coding Brief Grouping {suffix}",
			"project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "title": f"Test Coding Brief Detail {suffix}",
			"project": self.project.name, "grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)

	def _payload(self, group, level_id, **over):
		doc = {
			"doctype": "Project Todo", "status": "⚪️ Planned",
			"project_detail": self.detail.name, "to_do": "Build the thing",
			"assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 2), "estimated": 60,
			"group": group, "level_id": level_id,
		}
		doc.update(over)
		return doc

	def _insert_as_person(self, group, level_id, **over):
		"""The real create path the app uses — generic, permission-checked."""
		return frappe.client.insert(json.dumps(self._payload(group, level_id, **over)))

	# --- creation ------------------------------------------------------------

	def test_coding_todo_with_a_complete_brief_is_created_and_renders_its_note(self):
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(FULL_BRIEF))
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.notes, coding_brief.render_note(coding_brief.parse(json.dumps(FULL_BRIEF))))
		for value in FULL_BRIEF.values():
			self.assertIn(value, doc.notes)

	def test_coding_todo_missing_a_required_answer_is_rejected_by_the_generic_create(self):
		for drop in coding_brief.REQUIRED_KEYS:
			partial = {k: v for k, v in FULL_BRIEF.items() if k != drop}
			label = next(f["label"] for f in coding_brief.FIELDS if f["key"] == drop)
			with self.subTest(missing=drop):
				with self.assertRaises(frappe.MandatoryError) as cm:
					self._insert_as_person(self.coding_group, self.coding_level,
					                       coding_brief=json.dumps(partial))
				self.assertIn(label, str(cm.exception))

	def test_the_optional_answer_is_not_required(self):
		brief = {**FULL_BRIEF, "constraints": ""}
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(brief))
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertNotIn("Constraints", doc.notes)

	def test_a_coding_todo_with_no_brief_at_all_is_rejected(self):
		with self.assertRaises(frappe.MandatoryError):
			self._insert_as_person(self.coding_group, self.coding_level, notes="just some text")

	def test_a_client_supplied_note_never_survives_on_a_coding_todo(self):
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(FULL_BRIEF),
		                             notes="attacker supplied note")
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertNotIn("attacker supplied note", doc.notes)
		self.assertTrue(doc.notes.startswith(coding_brief.HEADING))

	# --- everything else keeps working ---------------------------------------

	def test_a_non_coding_group_keeps_its_free_form_note_untouched(self):
		res = self._insert_as_person(self.plain_group, self.plain_level, notes="free form, mine")
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.notes, "free form, mine")
		self.assertFalse(doc.get("coding_brief"))

	def test_a_non_coding_group_needs_no_brief(self):
		res = self._insert_as_person(self.plain_group, self.plain_level)
		self.assertTrue(res["name"])

	def test_an_engine_created_todo_in_a_coding_group_is_not_blocked(self):
		"""follow_up_check's check todo and the recurring generator insert with
		ignore_permissions and carry no brief; a form's requirement must not stop them."""
		doc = frappe.get_doc(self._payload(self.coding_group, self.coding_level,
		                                   notes="raised by the checker")).insert(ignore_permissions=True)
		self.assertEqual(doc.notes, "raised by the checker")

	# --- editing --------------------------------------------------------------

	def test_editing_the_brief_re_renders_the_note(self):
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(FULL_BRIEF))
		doc = frappe.get_doc("Project Todo", res["name"])
		doc.coding_brief = json.dumps({**FULL_BRIEF, "goal": "a different goal"})
		doc.save(ignore_permissions=True)
		doc.reload()
		self.assertIn("a different goal", doc.notes)
		self.assertNotIn(FULL_BRIEF["goal"], doc.notes)

	def test_the_stored_brief_is_canonical_so_a_key_reorder_is_not_an_edit(self):
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(FULL_BRIEF))
		first = frappe.db.get_value("Project Todo", res["name"], "coding_brief")
		doc = frappe.get_doc("Project Todo", res["name"])
		doc.coding_brief = json.dumps(dict(reversed(list(FULL_BRIEF.items()))))
		doc.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Project Todo", res["name"], "coding_brief"), first)

	# --- one definition, not two ---------------------------------------------

	def test_the_form_schema_and_the_controller_agree_on_what_is_required(self):
		schema = get_coding_brief_schema()
		self.assertEqual(
			tuple(f["key"] for f in schema["fields"] if f["required"]),
			coding_brief.REQUIRED_KEYS,
		)
