# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe


class TestBrandCompanyFkSafety(unittest.TestCase):
	"""2026-09-09 permission sweep: Project Owner/Group Manager hold full CRUD
	on Brand/Business Unit/Company with zero controller validation -- unlike
	Glossary, which already guards an "in use" delete for the same shape of
	risk. A Project Owner could delete a Brand or Company referenced by live
	Projects/Job Openings/Attendance Profiles/Business Units with no
	FK-safety check. Business Unit itself has no inbound Link references
	anywhere in the app currently, so it got no guard -- nothing to protect
	against yet."""

	def setUp(self):
		frappe.set_user("Administrator")

	def test_cannot_delete_a_brand_in_use_by_a_job_opening(self):
		company = frappe.get_doc({"doctype": "Company", "company_name": "BCFS Co"}).insert(
			ignore_permissions=True)
		brand = frappe.get_doc({
			"doctype": "Brand", "brand_name": "BCFS Brand", "company": company.name,
		}).insert(ignore_permissions=True)
		opening = frappe.get_doc({
			"doctype": "Job Opening", "title": "BCFS Opening", "slug": "bcfs-opening",
			"status": "Open", "brand": brand.name,
		}).insert(ignore_permissions=True)
		try:
			with self.assertRaises(frappe.ValidationError):
				frappe.delete_doc("Brand", brand.name, ignore_permissions=True)
		finally:
			frappe.delete_doc("Job Opening", opening.name, force=True, ignore_permissions=True)
			frappe.delete_doc("Brand", brand.name, force=True, ignore_permissions=True)
			frappe.delete_doc("Company", company.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_can_delete_an_unused_brand(self):
		company = frappe.get_doc({"doctype": "Company", "company_name": "BCFS Co2"}).insert(
			ignore_permissions=True)
		brand = frappe.get_doc({
			"doctype": "Brand", "brand_name": "BCFS Unused Brand", "company": company.name,
		}).insert(ignore_permissions=True)
		frappe.delete_doc("Brand", brand.name, ignore_permissions=True)
		self.assertFalse(frappe.db.exists("Brand", brand.name))
		frappe.delete_doc("Company", company.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_cannot_delete_a_company_in_use_by_a_business_unit(self):
		company = frappe.get_doc({"doctype": "Company", "company_name": "BCFS Co3"}).insert(
			ignore_permissions=True)
		bu = frappe.get_doc({
			"doctype": "Business Unit", "business_unit_name": "BCFS BU", "company": company.name,
		}).insert(ignore_permissions=True)
		try:
			with self.assertRaises(frappe.ValidationError):
				frappe.delete_doc("Company", company.name, ignore_permissions=True)
		finally:
			frappe.delete_doc("Business Unit", bu.name, force=True, ignore_permissions=True)
			frappe.delete_doc("Company", company.name, force=True, ignore_permissions=True)
			frappe.db.commit()
