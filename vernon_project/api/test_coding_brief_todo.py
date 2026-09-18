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
from vernon_project.api.project_todo import get_coding_brief_schema, get_group_levels

CODING_GROUP = "Test Coding Group"
PLAIN_GROUP = "Test Plain Group"
# A group that is NOT wholly a Coding group, but whose levels are tagged one by one.
# This is the shape the owner asked for: the tag sits on each type and level, so one
# group can hold both coding and non-coding work.
MIXED_GROUP = "Test Mixed Level Group"
MIXED_CODING_LEVEL = "TESTMIXCODE1"
MIXED_PLAIN_LEVEL = "TESTMIXPLAIN1"
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


def _ensure_mixed_group():
	"""A plain group holding one coding-tagged level and one ordinary level, so the
	two can be told apart inside a single group."""
	levels = [
		{"type_name": "Build", "level_name": "L1", "level_id": MIXED_CODING_LEVEL,
		 "difficulty_percent": 100, "is_coding": 1},
		{"type_name": "Admin", "level_name": "L1", "level_id": MIXED_PLAIN_LEVEL,
		 "difficulty_percent": 100, "is_coding": 0},
	]
	if not frappe.db.exists("Group", MIXED_GROUP):
		frappe.get_doc({"doctype": "Group", "group_name": MIXED_GROUP,
		                "base_rate_per_minute": 1, "group_type": "", "levels": levels}).insert(ignore_permissions=True)
	else:
		doc = frappe.get_doc("Group", MIXED_GROUP)
		doc.group_type = ""
		doc.set("levels", [])
		for row in levels:
			doc.append("levels", row)
		doc.save(ignore_permissions=True)
	frappe.clear_cache(doctype="Group")
	return MIXED_GROUP


class TestCodingBriefTodo(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.coding_group, self.coding_level = _ensure_group(CODING_GROUP, "Coding", "TESTCODE1")
		self.plain_group, self.plain_level = _ensure_group(PLAIN_GROUP, "", "TESTPLAIN1")
		self.mixed_group = _ensure_mixed_group()
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

	# --- the picker's metadata cost ------------------------------------------

	@staticmethod
	def _capture_queries(fn):
		"""The SQL `fn` issues. frappe.get_all runs through frappe.db.sql, so
		patching there sees it."""
		seen = []
		original = frappe.db.sql

		def capturing(query, *args, **kwargs):
			seen.append(str(query))
			return original(query, *args, **kwargs)

		frappe.db.sql = capturing
		try:
			fn()
		finally:
			frappe.db.sql = original
		return seen

	def test_the_group_catalog_costs_the_same_however_many_levels_exist(self):
		"""The performance gate. Every todo form loads this catalog to know which
		types and levels are coding work, so it must be a fixed number of queries,
		not one per group or per level.

		Frappe asks `SELECT is_virtual FROM tabDocType` the first time a process
		touches a doctype and then caches it, so warm both doctypes first — otherwise
		the first measurement carries a one-off that has nothing to do with row count.
		"""
		frappe.get_all("Group", limit=1)
		frappe.get_all("Group Level", limit=1)
		before = len(self._capture_queries(get_group_levels))
		self.assertGreater(before, 0, "the counter is not observing anything — the test would be vacuous")

		frappe.get_doc({
			"doctype": "Group", "group_name": f"Test Catalog Cost {frappe.generate_hash(length=6)}",
			"base_rate_per_minute": 1, "group_type": "",
			"levels": [{"type_name": f"T{i}", "level_name": "L1", "difficulty_percent": 100,
			            "is_coding": i % 2} for i in range(6)],
		}).insert(ignore_permissions=True)
		frappe.clear_cache(doctype="Group")

		after = len(self._capture_queries(get_group_levels))
		self.assertEqual(before, after,
			"get_group_levels must not issue more queries just because more levels exist")

	# --- the tag on each type and level --------------------------------------

	def test_a_level_tagged_coding_needs_the_brief_even_when_its_group_is_not(self):
		"""The owner's ask: the tag lives on each type and level, not only on the whole
		group. A todo on a tagged level behaves exactly like one in a Coding group."""
		with self.assertRaises(frappe.MandatoryError):
			self._insert_as_person(self.mixed_group, MIXED_CODING_LEVEL)

		res = self._insert_as_person(self.mixed_group, MIXED_CODING_LEVEL,
		                             coding_brief=json.dumps(FULL_BRIEF))
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.notes, coding_brief.render_note(coding_brief.parse(json.dumps(FULL_BRIEF))))

	def test_an_untagged_level_in_the_same_group_is_left_alone(self):
		"""Criterion 4, at the grain that matters: two levels of ONE group must not
		behave the same. The untagged one takes a free-form note and no brief."""
		res = self._insert_as_person(self.mixed_group, MIXED_PLAIN_LEVEL, notes="just a plain note")
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.notes, "just a plain note", "an untagged level keeps the note as typed")
		self.assertFalse(coding_brief.parse(doc.get("coding_brief")).get("goal"))

	def test_a_coding_group_still_applies_when_no_level_is_tagged(self):
		"""Backward compatibility. The group-wide flag is what ships today and some
		groups may only ever use it, so widening to levels must not retire it."""
		res = self._insert_as_person(self.coding_group, self.coding_level,
		                             coding_brief=json.dumps(FULL_BRIEF))
		self.assertIn(FULL_BRIEF["goal"], frappe.get_doc("Project Todo", res["name"]).notes)

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
