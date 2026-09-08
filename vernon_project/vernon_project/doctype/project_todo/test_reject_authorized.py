# Copyright (c) 2026, Vernon and Contributors
# Guards the reject bypass: rejected_at/rejected_by/rejection_reason can only be
# set together by someone who could have called reject_status() themselves.

import frappe
import unittest
from unittest.mock import Mock, patch
from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo


def _todo(**overrides):
	todo = frappe.new_doc("Project Todo")
	todo.is_new = Mock(return_value=False)
	todo.project_detail = "PD-X"
	todo.status = "⚪️ Planned"
	todo.rejection_reason = "alasan"
	todo.rejected_by = "leader@x.com"
	todo.rejected_at = "2026-09-08 08:00:00"
	todo.work_mode = "Human"
	for k, v in overrides.items():
		setattr(todo, k, v)
	return todo


class TestRejectAuthorized(unittest.TestCase):
	def test_allows_new_documents(self):
		todo = _todo()
		todo.is_new = Mock(return_value=True)
		todo.validate_reject_authorized()  # must not raise

	def test_noop_when_not_a_new_rejection(self):
		"""rejected_at already set on the old doc too -> not a NEW rejection, skip."""
		todo = _todo()
		todo.get_doc_before_save = Mock(return_value=frappe._dict(rejected_at="2026-09-01 00:00:00"))
		todo.validate_reject_authorized()  # must not raise, no lookups needed

	def test_noop_when_rejected_at_not_set(self):
		todo = _todo(rejected_at=None)
		todo.get_doc_before_save = Mock(return_value=frappe._dict(rejected_at=None))
		todo.validate_reject_authorized()  # must not raise

	def test_blocks_empty_reason(self):
		todo = _todo(rejection_reason="  ")
		todo.get_doc_before_save = Mock(
			return_value=frappe._dict(rejected_at=None, status="🟠 Done")
		)
		with self.assertRaises(frappe.ValidationError):
			todo.validate_reject_authorized()

	def test_blocks_when_old_status_not_reviewable(self):
		todo = _todo()
		todo.get_doc_before_save = Mock(
			return_value=frappe._dict(rejected_at=None, status="⚪️ Planned")
		)
		with self.assertRaises(frappe.ValidationError):
			todo.validate_reject_authorized()

	def test_blocks_ai_tagged(self):
		todo = _todo(work_mode="AI")
		todo.get_doc_before_save = Mock(
			return_value=frappe._dict(rejected_at=None, status="🟠 Done")
		)
		with self.assertRaises(frappe.ValidationError):
			todo.validate_reject_authorized()

	def test_blocks_non_owner_non_leader(self):
		todo = _todo()
		todo.get_doc_before_save = Mock(
			return_value=frappe._dict(rejected_at=None, status="🟠 Done")
		)
		original_user = frappe.session.user
		frappe.session.user = "outsider@x.com"
		try:
			with patch("frappe.get_value") as mock_get_value:
				mock_get_value.side_effect = ["PRJ-X", ("owner@x.com", "leader@x.com")]
				with self.assertRaises(frappe.PermissionError):
					todo.validate_reject_authorized()
		finally:
			frappe.session.user = original_user

	def test_allows_real_leader(self):
		todo = _todo()
		todo.get_doc_before_save = Mock(
			return_value=frappe._dict(rejected_at=None, status="🔷 Checked By PL")
		)
		original_user = frappe.session.user
		frappe.session.user = "leader@x.com"
		try:
			with patch("frappe.get_value") as mock_get_value:
				mock_get_value.side_effect = ["PRJ-X", ("owner@x.com", "leader@x.com")]
				todo.validate_reject_authorized()  # must not raise
		finally:
			frappe.session.user = original_user


if __name__ == "__main__":
	unittest.main()
