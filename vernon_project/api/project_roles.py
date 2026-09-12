import frappe
from frappe import _
from frappe.utils import cint

from vernon_project.vernon_project.doctype.project.project import get_project_admins


@frappe.whitelist()
def bulk_assign_project_roles(projects, set_leader=0, leader=None, admins=None, admin_mode="add"):
	"""Bulk-set the leader and/or admins across many Projects in one call.

	Gated to System Manager / Project Owner *as an entry check* — that only
	proves the caller may use this tool at all, not that they may touch any
	given project, since "Project Owner" is a global role (anyone ever set as
	ANY project's owner holds it, per Project.validate_lead_roles).

	The per-project check below mirrors Project.validate_edit_permission,
	because this function saves with ignore_permissions=True and that is
	precisely the flag validate_edit_permission returns early on — so the
	controller's own "only the Owner may change the owner or leader" rule
	cannot run here and has to be restated at the gate.

	It deliberately does NOT use `frappe.has_permission("Project", "write")`,
	which it used to. That verb does not mean administrative authority here:
	Project's DocPerm row for "Project Leader" is write=1 with no if_owner, so
	holding that global role is write-on-every-project at the role level, and
	Project.has_permission then returns True for anyone in doc.team_members.
	The result was that a plain team member holding Project Owner + Project
	Leader could set themselves as the sole Project Admin of a project they
	neither owned nor led, evicting the real admins (proved live, 2026-09-12).
	A controller hook can only deny, never grant, so the DocPerm table is the
	floor — which is why reading the hook alone made this look safe.

	A project the caller may not administer is skipped and reported, exactly
	like a project that fails to save for any other reason.

	Each project saves inside its own savepoint, so a project that can't be
	saved (permission refused, or e.g. a leader missing the 'Project Leader'
	role) is skipped and reported, not fatal to the batch.

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
			# Per-record check: the entry gate above only proves the caller may
			# use this tool, not that they may touch THIS project. Same rule as
			# Project.validate_edit_permission, which the ignore_permissions
			# save below switches off.
			doc = frappe.get_doc("Project", name)
			if "System Manager" not in roles:
				if frappe.session.user not in (doc.project_owner, doc.project_leader):
					frappe.throw(
						_("Only the Project Owner or Project Leader can edit this project."),
						frappe.PermissionError,
					)
				if set_leader and frappe.session.user != doc.project_owner:
					frappe.throw(
						_("Only the Project Owner can change the owner or leader."),
						frappe.PermissionError,
					)
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
