# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import data_health


class TestDataHealthScope(unittest.TestCase):
	"""Regression for the 2026-09-08 permission sweep #4: data_health() was
	role-gated (System Manager/Group Manager/Project Owner) but queried Project
	Todo directly with no project scoping at all -- a Project Owner on one
	small project could see todo titles/status across every project in the
	org. Now scoped through _visible_projects() like everything else in this
	file: System Manager unrestricted, Project Owner sees only their own
	involved projects' data.

	The fix touches EIGHT queries (4 categories x row-fetch + count). The
	failure mode worth guarding against is scoping seven of eight and leaving
	one count (or one row-fetch) unscoped -- a naive "A doesn't see B's
	unmapped todo" test would stay green even if e.g. the "missing" count
	query's JOIN got dropped, because that category was never populated in
	the fixture. So all four categories get their own dedicated fixture row
	and their own per-category assertion here, not just "unmapped"."""

	OWNER_A = "dhs_owner_a@example.com"
	OWNER_B = "dhs_owner_b@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		for email in (self.OWNER_A, self.OWNER_B):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
					"roles": [{"role": "Project Owner"}, {"role": "Project Leader"}],
				}).insert(ignore_permissions=True)

		# max_estimated_minutes on the live site — needed to know whether the
		# "outliers" query branch even runs (data_health skips it entirely when
		# unset/0), and what estimate actually counts as an outlier.
		self.mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0

		self.projects, self.details, self.groupings = [], [], []
		self.todo = {}  # {(owner_label, category): todo doc}
		for owner, label in ((self.OWNER_A, "A"), (self.OWNER_B, "B")):
			p = frappe.get_doc({
				"doctype": "Project", "project_name": f"DHS Project {label}", "brand": "Test Customer",
				"project_owner": owner, "project_leader": owner,
				"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
				"team_members": [{"user": owner}],
			}).insert(ignore_permissions=True)
			self.projects.append(p)
			gl = frappe.get_doc({
				"doctype": "Glossary", "glossary": f"DHS Grouping {label}", "project": p.name,
			}).insert(ignore_permissions=True)
			self.groupings.append(gl.name)
			d = frappe.get_doc({
				"doctype": "Project Detail", "project": p.name, "title": f"DHS Detail {label}",
				"grouping": gl.name, "project_deadline": add_days(nowdate(), 20),
			}).insert(ignore_permissions=True)
			self.details.append(d)

			base = {
				"doctype": "Project Todo", "project_detail": d.name, "assigned_to": owner,
				"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
				"group": "Test Group", "level": "1",
			}
			# "unmapped": level_id stays NULL by default (no fixture in this app
			# ever sets it explicitly), estimated normal, title normal.
			self.todo[(label, "unmapped")] = frappe.get_doc({
				**base, "to_do": f"DHS unmapped {label}", "estimated": 30,
			}).insert(ignore_permissions=True)
			# "missing": estimated<5 is rejected by validate_estimated_min() on
			# INSERT too, not just on change -- that bucket is only reachable on
			# legacy rows that predate the rule (same shape noted in the perf
			# audit). Insert valid, then force it via a direct DB write, same as
			# how such rows actually exist in production.
			missing_todo = frappe.get_doc({
				**base, "to_do": f"DHS missing-estimate {label}", "estimated": 30,
			}).insert(ignore_permissions=True)
			frappe.db.set_value("Project Todo", missing_todo.name, "estimated", 0, update_modified=False)
			self.todo[(label, "missing")] = missing_todo
			# "orphaned": short/junk title, everything else normal.
			self.todo[(label, "orphaned")] = frappe.get_doc({
				**base, "to_do": "x", "estimated": 30,
			}).insert(ignore_permissions=True)
			if self.mx and self.mx > 0:
				# Same shape as "missing": validate_estimated_max() rejects an
				# over-threshold estimate on INSERT too (it uses this same
				# max_estimated_minutes setting), so "outliers" is also only
				# reachable on legacy rows in current practice. Insert valid,
				# force it after, same as production legacy data would exist.
				outlier_todo = frappe.get_doc({
					**base, "to_do": f"DHS outlier {label}", "estimated": self.mx,
				}).insert(ignore_permissions=True)
				frappe.db.set_value(
					"Project Todo", outlier_todo.name, "estimated", self.mx + 60, update_modified=False,
				)
				self.todo[(label, "outliers")] = outlier_todo
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for d in self.details:
			if frappe.db.exists("Project Detail", d.name):
				frappe.db.delete("Project Todo", {"project_detail": d.name})
				frappe.delete_doc("Project Detail", d.name, force=True, ignore_permissions=True)
		for gl in self.groupings:
			if frappe.db.exists("Glossary", gl):
				frappe.delete_doc("Glossary", gl, force=True, ignore_permissions=True)
		for p in self.projects:
			if frappe.db.exists("Project", p.name):
				frappe.delete_doc("Project", p.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_project_owner_sees_own_and_not_the_other_owners_data_per_category(self):
		frappe.set_user(self.OWNER_A)
		try:
			r = data_health()
		finally:
			frappe.set_user("Administrator")

		categories = ["unmapped", "missing", "orphaned"] + (["outliers"] if self.mx and self.mx > 0 else [])
		for cat in categories:
			names = {row["name"] for row in r[cat]}
			self.assertIn(
				self.todo[("A", cat)].name, names,
				f"A's own {cat} row missing from A's {cat} results",
			)
			self.assertNotIn(
				self.todo[("B", cat)].name, names,
				f"B's {cat} row leaked into A's {cat} results",
			)

	def test_system_manager_sees_both_owners_data_per_category(self):
		r = data_health()  # already Administrator/System Manager
		categories = ["unmapped", "missing", "orphaned"] + (["outliers"] if self.mx and self.mx > 0 else [])
		for cat in categories:
			names = {row["name"] for row in r[cat]}
			self.assertIn(self.todo[("A", cat)].name, names, f"SM missing A's {cat} row")
			self.assertIn(self.todo[("B", cat)].name, names, f"SM missing B's {cat} row")

	def test_counts_match_scoped_rows_for_every_category_not_just_the_populated_one(self):
		"""The regression this guards against specifically: scoping the
		row-fetch but not its count twin (or vice versa) for any one of the
		four categories. Compares each category's reported count against an
		independent direct query scoped the same way _visible_projects()
		would scope it, for BOTH owners, so a half-applied fix on any single
		pair is caught regardless of which pair it is."""
		visible_a = set(frappe.get_all(
			"Project", filters={"project_owner": self.OWNER_A}, pluck="name",
		)) | set(frappe.get_all(
			"Project", filters={"project_leader": self.OWNER_A}, pluck="name",
		))
		frappe.set_user(self.OWNER_A)
		try:
			r = data_health()
		finally:
			frappe.set_user("Administrator")

		def real_count(extra_where):
			return frappe.db.sql(f"""
				SELECT COUNT(*) FROM `tabProject Todo` t
				JOIN `tabProject Detail` pd ON t.project_detail = pd.name
				WHERE pd.project IN %(visible)s AND {extra_where}
			""", {"visible": tuple(visible_a)})[0][0]

		self.assertEqual(
			r["counts"]["unmapped"],
			real_count("t.status IN ('⚪️ Planned','🟠 Done','🔷 Checked By PL') AND t.level_id IS NULL"),
		)
		self.assertEqual(
			r["counts"]["missing"],
			real_count(
				"t.status IN ('⚪️ Planned','🟠 Done','🔷 Checked By PL') AND "
				"(t.`group` IS NULL OR t.`group`='' OR t.estimated IS NULL OR t.estimated=0 "
				"OR t.deadline IS NULL OR t.start_date IS NULL)"
			),
		)
		self.assertEqual(
			r["counts"]["orphaned"],
			real_count(
				"t.status IN ('⚪️ Planned','🟠 Done','🔷 Checked By PL') AND "
				"(LOWER(TRIM(t.to_do)) IN ('x','seed','test','testing') OR CHAR_LENGTH(TRIM(t.to_do)) <= 2)"
			),
		)
		if self.mx and self.mx > 0:
			self.assertEqual(
				r["counts"]["outliers"],
				real_count(
					f"t.status IN ('⚪️ Planned','🟠 Done','🔷 Checked By PL') AND t.estimated > {int(self.mx)}"
				),
			)
