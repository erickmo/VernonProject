# Copyright (c) 2026, Vernon and Contributors
"""Run named test modules against THIS checkout, without `bench run-tests`.

`bench run-tests` on project.vernon.id has left the scheduler disabled and rows
behind, so the fleet's rule is not to use it. This runs only the modules you name,
in a normal bench process:

    PYTHONPATH=/path/to/your/worktree \\
      bench --site project.vernon.id execute vernon_project.tests.run_modules.run \\
      --kwargs "{'modules':'vernon_project.tests.test_tasks,vernon_project.api.test_x'}"

PYTHONPATH first is what makes a worktree's copy win over the installed app, so a
branch can be verified before it is merged. It prints each module's resolved file
for exactly that reason -- if the path is not your worktree, the run proved nothing
about your branch.

This does NOT isolate writes. Use it for read-only suites, or put NoLeakMixin on the
TestCase (see tests/no_leak.py).
"""

import importlib
import sys
import unittest


def run(modules=""):
	suite = unittest.TestSuite()
	for name in [m.strip() for m in modules.split(",") if m.strip()]:
		module = importlib.import_module(name)
		print(f"LOADED {name} from {module.__file__}")
		suite.addTest(unittest.TestLoader().loadTestsFromModule(module))
	result = unittest.TextTestRunner(verbosity=1, stream=sys.stdout).run(suite)
	print(f"RESULT ran={result.testsRun} failures={len(result.failures)} errors={len(result.errors)}")
	return not (result.failures or result.errors)
