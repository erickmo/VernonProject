import frappe


def execute():
	"""Reward moved from Project Detail -> Project (reward_type/bonus_amount/discount/total).

	Carry existing per-detail values up: per project, sum bonus_amount + discount
	across its details, keep a reward_type, and recompute total. Reads the old
	Project Detail columns via raw SQL (Frappe leaves removed fields as orphan
	columns, so the data survives the doctype change). Idempotent: skips projects
	that already carry a bonus, so re-running never double-counts.

	ponytail: mixed Rupiah/Point details in one project are summed naively (rare);
	fix such a project by hand if it existed.
	"""
	if "bonus_amount" not in frappe.db.get_table_columns("Project Detail"):
		return

	rows = frappe.db.sql(
		"""
		SELECT project,
		       SUM(COALESCE(bonus_amount, 0)) AS bonus,
		       SUM(COALESCE(discount, 0))     AS discount,
		       MAX(reward_type)               AS reward_type
		FROM `tabProject Detail`
		WHERE COALESCE(bonus_amount, 0) > 0 OR COALESCE(discount, 0) > 0
		GROUP BY project
		""",
		as_dict=True,
	)
	for r in rows:
		if not r.project or not frappe.db.exists("Project", r.project):
			continue
		if frappe.db.get_value("Project", r.project, "bonus_amount"):
			continue  # already carried up on an earlier run
		reward_type = r.reward_type or "Rupiah"
		bonus = r.bonus or 0
		discount = r.discount or 0
		total = bonus if reward_type == "Point" else bonus - discount
		frappe.db.set_value(
			"Project",
			r.project,
			{"reward_type": reward_type, "bonus_amount": bonus, "discount": discount, "total": total},
			update_modified=False,
		)
	frappe.db.commit()
