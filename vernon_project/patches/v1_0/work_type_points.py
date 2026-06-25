import frappe


def execute():
	"""Backfill defaults for the work-type/time-based points model.

	Column defaults already cover rows created during migrate, but set values
	explicitly so any pre-existing NULLs are deterministic. Existing Project
	Todo rows keep their already-snapshotted `point` — not recomputed here.
	"""
	# The `= 0` clause intentionally treats legacy NULL-equivalent zero rows as needing
	# the default. This one-shot patch is not re-run after users start editing.
	frappe.db.sql(
		"UPDATE `tabGroup` SET base_rate_per_minute = 1 "
		"WHERE base_rate_per_minute IS NULL OR base_rate_per_minute = 0"
	)
	frappe.db.sql(
		"UPDATE `tabGroup Level` SET difficulty_percent = 100 "
		"WHERE difficulty_percent IS NULL OR difficulty_percent = 0"
	)

	if "point" in frappe.db.get_table_columns("Group Level"):
		frappe.db.sql_ddl("ALTER TABLE `tabGroup Level` DROP COLUMN `point`")
