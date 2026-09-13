# Copyright (c) 2026, Vernon and contributors
"""Every `validate_*` guard on ProjectTodo is actually called by `validate()`.

Several guards are unit-tested by calling them directly -- deliberately, since that
is what let `validate_ai_in_progress` be verified before its column existed. The gap
that leaves is the call site: delete `self.validate_reject_authorized()` from
`validate()` and every one of its tests still passes, because none of them saves a
document.

This pins the wiring and nothing else, so it stays true as guards are added: it does
not carry a list to keep up to date, it reads the class.

Source-level (ast) rather than a save, because a save would need a real Project +
Project Detail on the live site for what is a structural question.
"""

import ast
import os
import unittest

SOURCE = os.path.join(os.path.dirname(__file__), "project_todo.py")


def _project_todo_class():
	tree = ast.parse(open(SOURCE).read())
	for node in tree.body:
		if isinstance(node, ast.ClassDef) and node.name == "ProjectTodo":
			return node
	raise AssertionError("ProjectTodo class not found in project_todo.py")


class TestValidateWiring(unittest.TestCase):
	def setUp(self):
		self.cls = _project_todo_class()
		self.methods = {n.name for n in self.cls.body if isinstance(n, ast.FunctionDef)}

	def _calls_in(self, method_name):
		fn = next(
			n for n in self.cls.body
			if isinstance(n, ast.FunctionDef) and n.name == method_name
		)
		return {
			n.func.attr
			for n in ast.walk(fn)
			if isinstance(n, ast.Call)
			and isinstance(n.func, ast.Attribute)
			and isinstance(n.func.value, ast.Name)
			and n.func.value.id == "self"
		}

	def test_every_validate_guard_is_wired_into_validate(self):
		guards = {m for m in self.methods if m.startswith("validate_")}
		self.assertGreater(len(guards), 10, "found suspiciously few guards -- parse broken?")
		unwired = sorted(guards - self._calls_in("validate"))
		self.assertEqual(
			unwired, [],
			"defined on ProjectTodo but never called by validate(): " + ", ".join(unwired),
		)
