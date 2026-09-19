# Copyright (c) 2026, Vernon and contributors
"""Every `validate_*` guard on EVERY doctype is actually reached when a document saves.

Guards get unit-tested by calling them directly — deliberately, since that is what
let `validate_ai_in_progress` be verified before its column existed, and what lets
Teguran's guard be checked against a stand-in with no registered meta. The gap that
leaves is the call site: delete `self.validate_reject_authorized()` from `validate()`
and every one of its own tests still passes, because none of them saves a document.

This started as a Project Todo test and stayed one while five other doctypes grew
guards of their own. That is the same shape that let Teguran reintroduce a bug
Project Todo had already fixed — a lesson learned in one place and not carried
across — so it now reads the whole doctype folder instead of a single file.

It pins the wiring and nothing else, so it stays true as guards are added: it carries
no list to keep up to date. Source-level (ast) rather than a save, because a save
would need real fixtures on the live site for what is a structural question.
"""

import ast
import os
import unittest

DOCTYPE_ROOT = os.path.join(
	os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vernon_project", "doctype"
)

# A guard is "wired" if a save can reach it. Frappe calls these itself; anything one
# of them calls, directly or through another method, counts as reached.
LIFECYCLE_HOOKS = {
	"before_validate", "validate", "before_save", "before_insert", "after_insert",
	"on_update", "before_submit", "on_submit", "before_cancel", "on_cancel",
	"on_trash", "after_delete", "on_update_after_submit", "before_naming", "autoname",
}


def _self_calls(fn):
	return {
		n.func.attr
		for n in ast.walk(fn)
		if isinstance(n, ast.Call)
		and isinstance(n.func, ast.Attribute)
		and isinstance(n.func.value, ast.Name)
		and n.func.value.id == "self"
	}


def _reachable(methods):
	"""Every method a save can get to, following self-calls from the hooks outward."""
	seen, stack = set(), [h for h in LIFECYCLE_HOOKS if h in methods]
	while stack:
		for callee in _self_calls(methods[stack.pop()]):
			if callee not in seen:
				seen.add(callee)
				if callee in methods:
					stack.append(callee)
	return seen


def _controllers():
	"""(doctype folder, class node, {method name: node}) for every doctype controller."""
	out = []
	for folder in sorted(os.listdir(DOCTYPE_ROOT)):
		source = os.path.join(DOCTYPE_ROOT, folder, f"{folder}.py")
		if not os.path.exists(source):
			continue
		tree = ast.parse(open(source, encoding="utf-8").read())
		for cls in [n for n in tree.body if isinstance(n, ast.ClassDef)]:
			methods = {n.name: n for n in cls.body if isinstance(n, ast.FunctionDef)}
			out.append((folder, cls.name, methods))
	return out


class TestValidateWiring(unittest.TestCase):
	def setUp(self):
		self.controllers = _controllers()

	def test_the_doctype_folder_is_actually_being_read(self):
		"""Guards the guard: if this walk silently found nothing, every assertion
		below would pass while checking no code at all."""
		self.assertGreater(len(self.controllers), 20, "found suspiciously few controllers — parse broken?")
		with_guards = [c for c in self.controllers if any(m.startswith("validate_") for m in c[2])]
		self.assertGreaterEqual(
			len(with_guards), 5, "found suspiciously few doctypes with guards — parse broken?"
		)

	def test_every_validate_guard_is_reachable_from_a_save(self):
		unwired = []
		for folder, class_name, methods in self.controllers:
			guards = {m for m in methods if m.startswith("validate_")}
			if not guards:
				continue
			for guard in sorted(guards - _reachable(methods)):
				unwired.append(f"{folder}.{class_name}.{guard}")
		self.assertEqual(
			unwired, [],
			"defined but never reached from a lifecycle hook: " + ", ".join(unwired),
		)

	def test_project_todos_guards_are_all_wired(self):
		"""The case this test was originally written for, kept explicit so a
		regression there names Project Todo rather than appearing in a list."""
		methods = next(m for folder, _, m in self.controllers if folder == "project_todo")
		guards = {m for m in methods if m.startswith("validate_")}
		self.assertGreater(len(guards), 10, "found suspiciously few guards — parse broken?")
		self.assertEqual(sorted(guards - _reachable(methods)), [])
