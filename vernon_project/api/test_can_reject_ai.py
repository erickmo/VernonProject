# Copyright (c) 2026, Vernon and Contributors
# Pure-function tests for the AI-tagged-todo reject block (ujkfag8r5v).
# _can_reject takes no DB dependency, so this needs no fixtures/transaction.

import unittest
from vernon_project.api.mobile import _can_reject

PROJECT = {"project_owner": "owner@x.com", "project_leader": "leader@x.com", "admins": ["admin@x.com"]}


class TestCanRejectAi(unittest.TestCase):
	def test_ai_todo_not_rejectable_by_owner(self):
		self.assertFalse(_can_reject("done", PROJECT, "owner@x.com", "AI"))

	def test_both_todo_not_rejectable_by_leader(self):
		self.assertFalse(_can_reject("checked", PROJECT, "leader@x.com", "Both"))

	def test_human_todo_still_rejectable(self):
		self.assertTrue(_can_reject("done", PROJECT, "owner@x.com", "Human"))

	def test_untagged_todo_still_rejectable(self):
		self.assertTrue(_can_reject("done", PROJECT, "leader@x.com", ""))
		self.assertTrue(_can_reject("done", PROJECT, "leader@x.com", None))

	def test_admin_still_blocked_regardless_of_tag(self):
		self.assertFalse(_can_reject("done", PROJECT, "admin@x.com", "Human"))
		self.assertFalse(_can_reject("done", PROJECT, "admin@x.com", "AI"))

	def test_non_owner_leader_still_blocked_regardless_of_tag(self):
		self.assertFalse(_can_reject("done", PROJECT, "someone@x.com", "Human"))

	def test_wrong_status_still_blocked_regardless_of_tag(self):
		self.assertFalse(_can_reject("planned", PROJECT, "owner@x.com", "Human"))
		self.assertFalse(_can_reject("completed", PROJECT, "owner@x.com", "Human"))


if __name__ == "__main__":
	unittest.main()
