# Copyright (c) 2026, Vernon and Contributors
"""Make a module's bare `def test_*()` functions collectible by the test runner.

Frappe 15's runner (frappe/test_runner.py) loads a module with
`unittest.TestLoader().loadTestsFromModule`, and that collects TestCase subclasses
only -- a plain `def test_x()` at module level is skipped in silence. Seven files in
this app were written pytest-style, and pytest is not installed in the bench env, so
122 assertions across 43 functions had never run.

Re-indenting every function into a class would fix those seven files and re-break the
moment someone adds another bare function -- which is exactly how this happened. So
each such module ends with one line instead:

    TestRecurrenceMath = collect_module_tests(globals(), "TestRecurrenceMath")

Every current `test_*` function becomes a method, and one added later is picked up
with no further edit.

Only functions defined IN the calling module are taken: a test helper imported from
somewhere else would otherwise be collected twice, once per importer.
"""

import unittest


def collect_module_tests(namespace, class_name):
	"""Build a TestCase subclass from `namespace`'s own `test_*` functions."""
	own = namespace.get("__name__")
	methods = {
		name: staticmethod(fn)
		for name, fn in list(namespace.items())
		if name.startswith("test_")
		and callable(fn)
		and getattr(fn, "__module__", None) == own
	}
	if not methods:
		raise RuntimeError(f"{own}: collect_module_tests found no test_* functions")
	cls = type(class_name, (unittest.TestCase,), methods)
	# type() would otherwise stamp this module's name on the class, so a failure
	# would report as coming from vernon_project.tests.collect rather than from the
	# file that owns the test.
	cls.__module__ = own
	return cls
