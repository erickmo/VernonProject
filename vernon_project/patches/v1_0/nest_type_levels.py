import frappe


def execute():
	"""Each pre-existing single-difficulty type becomes a type with one default level.

	Old model: a Group Level row's `level_name` WAS the work-type (one row per type,
	difficulty_percent set). New model: `type_name` is the work-type and `level_name`
	is a difficulty level within it. Convert each old row in place:
	    type_name  <- old level_name
	    level_name <- 'Standard'
	difficulty_percent and level_id are preserved, so existing todos (which reference
	level_id) keep their points. Guarded on empty type_name so re-runs are no-ops.
	"""
	rows = frappe.db.sql(
		"SELECT name, level_name FROM `tabGroup Level` "
		"WHERE type_name IS NULL OR type_name = ''",
		as_dict=True,
	)
	for r in rows:
		frappe.db.set_value(
			"Group Level", r.name,
			{"type_name": r.level_name, "level_name": "Standard"},
			update_modified=False,
		)
