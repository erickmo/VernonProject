import frappe


def execute():
	# 1. Stable id for every existing Group Level row.
	rows = frappe.get_all(
		"Group Level",
		filters={"level_id": ["in", ["", None]]},
		pluck="name",
	)
	for name in rows:
		frappe.db.set_value(
			"Group Level", name, "level_id",
			frappe.generate_hash(length=10), update_modified=False,
		)

	# 2. Point existing todos at their level row by name -> level_id.
	todos = frappe.get_all(
		"Project Todo",
		filters={"level_id": ["in", ["", None]], "level": ["is", "set"]},
		fields=["name", "group", "level"],
	)
	unmatched = 0
	for t in todos:
		lid = frappe.db.get_value(
			"Group Level",
			{"parent": t.group, "parenttype": "Group", "level_name": t.level},
			"level_id",
		)
		if lid:
			frappe.db.set_value(
				"Project Todo", t.name, "level_id", lid, update_modified=False,
			)
		else:
			unmatched += 1

	if unmatched:
		frappe.log_error(
			f"backfill_level_id: {unmatched} todos had no matching Group Level "
			"(group/level since deleted); left level_id empty.",
			"backfill_level_id",
		)
