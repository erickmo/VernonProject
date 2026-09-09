# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe


class TestVernonSettingsValidation(unittest.TestCase):
	"""2026-09-09 permission sweep: Vernon Settings (the site-wide config
	singleton, incl. midtrans_server_key and every penalty/threshold rate)
	had a stub controller and no validation at any layer. Most numeric
	fields already carry non_negative:1 (real server-side enforcement) --
	this covers the 5 that were missing it, and adds the one guard a field
	constraint can't express: production payment mode can't go live with an
	empty client/server key. Vernon Settings is a global singleton, so this
	test snapshots and restores the real values rather than creating a
	throwaway doc."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.before = frappe.get_single("Vernon Settings").as_dict()

	def tearDown(self):
		frappe.set_user("Administrator")
		doc = frappe.get_single("Vernon Settings")
		for f in ("priority_miss_penalty", "daily_priority_slots", "max_project_priorities_per_day",
				"teguran_batas_sebelum_sp", "teguran_jendela_bulan", "midtrans_is_production",
				"midtrans_client_key", "midtrans_server_key"):
			doc.set(f, self.before.get(f))
		doc.save(ignore_permissions=True)
		frappe.db.commit()

	def test_negative_priority_miss_penalty_rejected(self):
		doc = frappe.get_single("Vernon Settings")
		doc.priority_miss_penalty = -5
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_negative_teguran_batas_rejected(self):
		doc = frappe.get_single("Vernon Settings")
		doc.teguran_batas_sebelum_sp = -1
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_production_mode_needs_both_midtrans_keys(self):
		doc = frappe.get_single("Vernon Settings")
		doc.midtrans_is_production = 1
		doc.midtrans_client_key = ""
		doc.midtrans_server_key = ""
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_production_mode_with_both_keys_saves(self):
		doc = frappe.get_single("Vernon Settings")
		doc.midtrans_is_production = 1
		doc.midtrans_client_key = "SB-Mid-client-test"
		doc.midtrans_server_key = "SB-Mid-server-test"
		doc.save()  # should not raise
