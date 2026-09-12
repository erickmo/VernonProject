# Copyright (c) 2026, Vernon and contributors
# See license.txt

import json
import os
import unittest

import frappe

JSON_PATH = os.path.join(os.path.dirname(__file__), "project_todo.json")


class TestAiInProgressRules(unittest.TestCase):
	"""`ai_in_progress` means an AI session is working on this task RIGHT NOW.

	The todo's scope note asks first whether this is an existing state, a derived
	value, or new. It is NEW: Project Todo's status has five values (Planned, Done,
	Checked By PL, Completed, Cancelled) and none is "In Progress", and ai_phase is
	derived 0-3 where phase 3 means "an agent MAY pick it up" -- eligible, explicitly
	not running. So it is not derivable from what exists.

	It is a boolean rather than a fourth phase because the ladder is the PROMPT's
	lifecycle and is monotonic, while this is the AGENT's runtime state and comes and
	goes. These call the guard directly, so they run green BEFORE the doctype reload
	adds the column.
	"""

	def _todo(self, status="⚪️ Planned", work_mode="AI", running=1, is_new=True, was_running=0):
		doc = frappe.new_doc("Project Todo")
		doc.status = status
		doc.work_mode = work_mode
		doc.ai_in_progress = running
		doc.is_new = lambda: is_new
		if not is_new:
			before = frappe._dict(ai_in_progress=was_running)
			before.get = lambda key, default=None: {"ai_in_progress": was_running}.get(key, default)
			doc.get_doc_before_save = lambda: before
		return doc

	def test_a_flag_on_an_ai_tagged_task_is_accepted(self):
		for mode in ("AI", "Both"):
			doc = self._todo(work_mode=mode)
			doc.validate_ai_in_progress()
			self.assertEqual(doc.ai_in_progress, 1, mode)

	def test_setting_it_on_a_task_that_was_never_ai_tagged_throws(self):
		"""The conflation the scope note names: in-progress is not the AI tag."""
		for mode in ("Human", "", None):
			with self.assertRaises(frappe.ValidationError):
				self._todo(work_mode=mode).validate_ai_in_progress()

	def test_untagging_a_running_task_clears_it_instead_of_throwing(self):
		"""Stopping AI work is legitimate, so it must not block the save."""
		doc = self._todo(work_mode="Human", is_new=False, was_running=1)
		doc.validate_ai_in_progress()
		self.assertEqual(doc.ai_in_progress, 0)

	def test_a_terminal_status_clears_it(self):
		"""Completing a task must not be blocked because a flag was left on."""
		for status in ("✅ Completed", "🚫 Cancelled"):
			doc = self._todo(status=status, work_mode="AI", running=1)
			doc.validate_ai_in_progress()
			self.assertEqual(doc.ai_in_progress, 0, status)

	def test_pending_approval_statuses_do_NOT_clear_it(self):
		"""Done / Checked By PL are awaiting approval, and a rework there may still
		have an agent on it -- so they are deliberately not terminal."""
		for status in ("🟠 Done", "🔷 Checked By PL"):
			doc = self._todo(status=status, work_mode="AI", running=1)
			doc.validate_ai_in_progress()
			self.assertEqual(doc.ai_in_progress, 1, status)

	def test_an_unset_flag_is_left_alone_on_a_human_task(self):
		doc = self._todo(work_mode="Human", running=0)
		doc.validate_ai_in_progress()  # must not throw
		self.assertFalse(doc.ai_in_progress)

	# --- the schema + the orthogonality ------------------------------------------
	def test_the_field_ships_and_is_not_required(self):
		fields = {f["fieldname"]: f for f in json.load(open(JSON_PATH))["fields"]}
		self.assertIn("ai_in_progress", fields)
		self.assertEqual(fields["ai_in_progress"]["fieldtype"], "Check")
		self.assertFalse(fields["ai_in_progress"].get("reqd"))
		self.assertFalse(fields["ai_in_progress"].get("permlevel"))

	def test_it_does_not_touch_the_phase_ladder(self):
		"""The orthogonality is the point, and it is what protects the dispatch queue:
		get_confirmed_ai_todos filters on ai_prompt_confirmed, and ai_phase is derived
		from work_mode + prompt + confirmed. Neither may learn about this flag."""
		import ast
		import inspect
		import textwrap

		from vernon_project.api.project_todo import ai_phase
		from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo

		def code_only(fn):
			"""Executable code, with comments and the docstring stripped.

			A plain source grep matches the guard's OWN docstring, which names
			ai_prompt_confirmed precisely to say it is never conflated -- so the naive
			version of this test failed on its own prose. ast.unparse drops comments
			and docstrings, leaving only what actually runs.
			"""
			tree = ast.parse(textwrap.dedent(inspect.getsource(fn)))
			body = tree.body[0].body
			if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
				body.pop(0)
			return ast.unparse(tree)

		self.assertNotIn("ai_in_progress", code_only(ai_phase))
		guard = code_only(ProjectTodo.validate_ai_in_progress)
		for other in ("ai_prompt_confirmed", "ai_prompt"):
			self.assertNotIn(other, guard, f"the guard reads {other}")

	def test_the_phase_for_a_running_task_is_still_3(self):
		from vernon_project.api.project_todo import ai_phase

		self.assertEqual(ai_phase("AI", True, True), 3)


if __name__ == "__main__":
	unittest.main()
