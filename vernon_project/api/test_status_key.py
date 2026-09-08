# Copyright (c) 2026, Vernon and Contributors
# Enum-drift audit finding #4: _status_key must fail closed (unknown), not
# open (planned), on a status it doesn't recognize.

import unittest
from unittest.mock import patch
from vernon_project.api.mobile import _status_key, STATUS_KEY


class TestStatusKeyFallback(unittest.TestCase):
	def test_every_known_status_maps_correctly(self):
		for raw, key in STATUS_KEY.items():
			self.assertEqual(_status_key(raw), key)

	def test_unrecognized_status_returns_unknown_not_planned(self):
		with patch("vernon_project.api.mobile.frappe.log_error") as mock_log:
			result = _status_key("some future status nobody has added yet")
			self.assertEqual(result, "unknown")
			self.assertNotEqual(result, "planned")
			mock_log.assert_called_once()

	def test_unknown_key_denies_can_advance_and_can_reject(self):
		"""The whole point of returning "unknown" instead of "planned": every
		consumer's exact-match gate denies by default rather than granting
		Planned-level permissions to a status it has never seen."""
		from vernon_project.api.mobile import _can_advance, _can_reject
		project = {"project_owner": "owner@x.com", "project_leader": "leader@x.com", "admins": []}
		with patch("vernon_project.api.mobile.frappe.log_error"):
			key = _status_key("bogus")
		self.assertFalse(_can_advance(key, project, "owner@x.com", "owner@x.com"))
		self.assertFalse(_can_reject(key, project, "owner@x.com"))


if __name__ == "__main__":
	unittest.main()
