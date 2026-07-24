"""Clone one user's project-team memberships onto another.

Onboarding helper: put new employee A on every project template employee B is
already on, in one action, instead of editing each project's team by hand.

One-time and additive — it only ADDS A to teams. It never removes A from a
project, never touches B, never changes owner/leader/admin. Re-running is a
no-op (A already on → skipped). System Manager only.
"""

import frappe

from vernon_project.api.mobile import (
	PROTECTED_USERS,
	_project_team,
	_require_system_manager,
)


def _b_project_names(from_user):
	"""Projects `from_user` (B) belongs to — every Project Team row naming B.

	Owner/leader/admin are auto-appended to Project Team by Project.validate, so
	B appears here for projects B merely leads too; those are included on purpose.
	"""
	return sorted(
		set(
			frappe.get_all(
				"Project Team",
				filters={"user": from_user, "parenttype": "Project"},
				pluck="parent",
			)
		)
	)


@frappe.whitelist()
def clone_memberships(from_user, to_user, dry_run=0):
	"""Add `to_user` (A) to every project `from_user` (B) is on that A isn't.

	dry_run truthy → write nothing, return {to_add:[{project,title}],
	skipped_existing:int}. dry_run falsy → do it, return {added:[names],
	skipped_existing:int}. Idempotent.
	"""
	_require_system_manager()
	from_user = (from_user or "").strip()
	to_user = (to_user or "").strip()

	if from_user in PROTECTED_USERS or not frappe.db.exists("User", from_user):
		frappe.throw("Unknown template user")
	if to_user in PROTECTED_USERS or not frappe.db.exists("User", to_user):
		frappe.throw("Unknown target user")
	if from_user == to_user:
		frappe.throw("Template and target user must differ")
	# A must be enabled — no point onboarding a disabled account. B may be
	# disabled (an offboarded colleague is a valid template).
	if not frappe.db.get_value("User", to_user, "enabled"):
		frappe.throw("Target user is disabled")

	to_add = []
	skipped_existing = 0
	for project in _b_project_names(from_user):
		if not frappe.db.exists("Project", project):
			continue  # orphaned team row — defensive
		if to_user in _project_team(project):
			skipped_existing += 1
			continue
		to_add.append(
			{"project": project, "title": frappe.db.get_value("Project", project, "project_name") or project}
		)

	if int(dry_run or 0):
		return {"to_add": to_add, "skipped_existing": skipped_existing}

	added = []
	for row in to_add:
		doc = frappe.get_doc("Project", row["project"])
		doc.append("team_members", {"user": to_user})
		doc.save()  # validate() de-dups + re-appends owner/leader (idempotent)
		added.append(row["project"])
	frappe.db.commit()
	return {"added": added, "skipped_existing": skipped_existing}
