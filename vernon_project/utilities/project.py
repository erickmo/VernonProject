import frappe

from vernon_project.vernon_project.doctype.project_detail.project_detail import (
	recompute_detail_rollups,
)


# Recalculate rollup stats (todo_count, latest_todo, totals, status) on every
# Project Detail from its linked Project Todos. Maintenance helper, run via:
#   bench --site <site> execute vernon_project.utilities.project.recalculate_project_detail
#
# Project Todo is now a standalone doctype (no longer a child of Project Detail),
# so rollups are derived by querying tabProject Todo via recompute_detail_rollups
# rather than iterating an in-memory child table.
def recalculate_project_detail():
	for detail in frappe.get_all("Project Detail", pluck="name"):
		recompute_detail_rollups(detail)
	frappe.db.commit()
