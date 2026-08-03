import frappe


def execute():
	"""Backfill the new multi-admin child table from the old scalar `project_admin`.

	Project.project_admin (single Link -> User) became project_admins (Table
	MultiSelect -> Project Admin User) so a project can have many admins. Frappe
	leaves the removed field as an orphan column, so read the old value raw and seed
	one child row per project that had an admin. Idempotent: skips a project that
	already has admin rows, so re-running never duplicates.
	"""
	if "project_admin" not in frappe.db.get_table_columns("Project"):
		return

	rows = frappe.db.sql(
		"""
		SELECT name, project_admin
		FROM `tabProject`
		WHERE project_admin IS NOT NULL AND project_admin != ''
		""",
		as_dict=True,
	)
	for r in rows:
		if not frappe.db.exists("User", r.project_admin):
			continue  # admin user was deleted since — nothing to carry
		if frappe.db.exists(
			"Project Admin User",
			{"parent": r.name, "parenttype": "Project", "parentfield": "project_admins"},
		):
			continue  # already backfilled on an earlier run
		frappe.get_doc({
			"doctype": "Project Admin User",
			"parenttype": "Project",
			"parent": r.name,
			"parentfield": "project_admins",
			"user": r.project_admin,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
