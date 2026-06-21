import frappe


def execute():
	"""Set up the Group/points feature on existing data.

	1. Create the Group Manager role and assign mo@vernon.id.
	2. Seed one global Group per distinct Glossary grouping used by details.
	3. Backfill Project Todo.group from each todo's Project Detail.grouping.
	Idempotent.
	"""
	_ensure_role()
	name_map = _seed_groups()
	_backfill_todos(name_map)
	frappe.db.commit()


def _ensure_role():
	if not frappe.db.exists("Role", "Group Manager"):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": "Group Manager",
			"desk_access": 1,
		}).insert(ignore_permissions=True)
	user = "mo@vernon.id"
	if frappe.db.exists("User", user):
		existing = frappe.get_all(
			"Has Role",
			filters={"parent": user, "parenttype": "User", "role": "Group Manager"},
		)
		if not existing:
			u = frappe.get_doc("User", user)
			u.append("roles", {"role": "Group Manager"})
			u.save(ignore_permissions=True)


def _seed_groups():
	"""Return {glossary_name: group_name} for distinct groupings."""
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT pd.grouping AS grouping, g.glossary AS label
		FROM `tabProject Detail` pd
		LEFT JOIN `tabGlossary` g ON g.name = pd.grouping
		WHERE pd.grouping IS NOT NULL AND pd.grouping != ''
		""",
		as_dict=True,
	)
	name_map = {}
	for r in rows:
		# Merge duplicates: the global Group name is the human label (glossary
		# text), so the same logical group across projects collapses into one.
		group_name = (r.label or r.grouping).strip()
		if not group_name:
			continue
		if not frappe.db.exists("Group", group_name):
			frappe.get_doc({
				"doctype": "Group",
				"group_name": group_name,
			}).insert(ignore_permissions=True)
		name_map[r.grouping] = group_name
	return name_map


def _backfill_todos(name_map):
	if not frappe.db.has_column("Project Todo", "group"):
		return
	todos = frappe.db.sql(
		"""
		SELECT pt.name AS todo, pd.grouping AS grouping
		FROM `tabProject Todo` pt
		JOIN `tabProject Detail` pd ON pd.name = pt.project_detail
		WHERE (pt.`group` IS NULL OR pt.`group` = '')
		  AND pd.grouping IS NOT NULL AND pd.grouping != ''
		""",
		as_dict=True,
	)
	for t in todos:
		group_name = name_map.get(t.grouping)
		if group_name:
			frappe.db.set_value(
				"Project Todo", t.todo, "group", group_name, update_modified=False
			)
