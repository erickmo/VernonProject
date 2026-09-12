# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe

from vernon_project.api.mobile import upload_comment_image


class TestCommentImageGate(unittest.TestCase):
	"""upload_comment_image's visibility gate used to be optional — both reference
	params defaulted to None and `if reference_doctype and reference_name` skipped
	the check when they were absent, while its docstring and the frontend wrapper
	both stated that access was gated by comment visibility.

	Both tests call it with NO file attached. That is deliberate: the point is
	which check fires FIRST. The reference check must reject the call before the
	function ever looks at the upload, so an unreferenced upload cannot happen at
	all. Against the unfixed code these reach `frappe.request.files` instead and
	fail differently.
	"""

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")

	def test_a_call_with_no_reference_is_rejected(self):
		with self.assertRaises(frappe.ValidationError) as ctx:
			upload_comment_image()
		self.assertIn("must name the record", str(ctx.exception))

	def test_a_half_specified_reference_is_rejected(self):
		# the old condition was an AND, so one arg alone also skipped the check
		with self.assertRaises(frappe.ValidationError) as ctx:
			upload_comment_image(reference_doctype="Project Todo")
		self.assertIn("must name the record", str(ctx.exception))

	def test_an_unsupported_reference_doctype_is_still_rejected(self):
		# _assert_comment_visible's own COMMENTABLE check, reached because the
		# gate now always runs
		with self.assertRaises(Exception) as ctx:
			upload_comment_image(reference_doctype="User", reference_name="Administrator")
		self.assertNotIsInstance(
			ctx.exception, AttributeError,
			"the gate must run before the function touches frappe.request.files",
		)
		self.assertIn("Comments are not available", str(ctx.exception))
