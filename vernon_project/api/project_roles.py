import frappe
from frappe import _
from frappe.utils import cint

from vernon_project.vernon_project.doctype.project.project import get_project_admins


@frappe.whitelist()
def bulk_assign_project_roles(projects, set_leader=0, leader=None, admins=None, admin_mode="add"):
	"""Bulk-set the leader and/or admins across many Projects in one call.

	Gated to System Manager / Project Owner. Each project saves inside its own
	savepoint, so a project that can't be saved (e.g. a leader missing the
	'Project Leader' role) is skipped and reported, not fatal to the batch.

	admin_mode: "add" merges the chosen admins into each project's existing set
	(dedup, order preserved); "replace" sets them to exactly the chosen set.
	Empty admins + "add" leaves admins untouched; empty + "replace" clears them.
	"""
	roles = set(frappe.get_roles())
	if not ({"System Manager", "Project Owner"} & roles):
		frappe.throw(_("Not permitted to bulk-assign project roles"), frappe.PermissionError)

	if isinstance(projects, str):
		projects = frappe.parse_json(projects)
	if isinstance(admins, str):
		admins = frappe.parse_json(admins)
	admins = admins or []

	set_leader = cint(set_leader)
	if set_leader and not leader:
		frappe.throw(_("A leader is required when assigning the leader."))

	updated = []
	skipped = []
	for name in projects or []:
		frappe.db.savepoint("bulk_role")
		try:
			doc = frappe.get_doc("Project", name)
			if set_leader:
				doc.project_leader = leader
			if admins or admin_mode == "replace":
				if admin_mode == "replace":
					target = list(dict.fromkeys(admins))
				else:  # "add": existing first, then chosen, dedup preserving order
					target = list(dict.fromkeys(list(get_project_admins(doc)) + list(admins)))
				doc.set("project_admins", [{"user": u} for u in target])
			doc.save(ignore_permissions=True)
			updated.append(name)
		except Exception as e:
			frappe.db.rollback(save_point="bulk_role")
			skipped.append({"name": name, "reason": str(e)})

	frappe.db.commit()
	return {"updated": updated, "skipped": skipped}
