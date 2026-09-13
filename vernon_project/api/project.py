import frappe

@frappe.whitelist()
def get_project_team_members(project_name):
	"""
	Retrieves the team members associated with a given project.

	Args:
			project_name (str): The name of the project.

	Returns:
			list: A list of team member names associated with the project.

	Gated on Project read (2026-09-08 permission sweep) -- previously any
	caller-supplied project_name returned its roster with no check at all.
	"""
	try:
		# Get Project
		project = frappe.get_doc("Project", project_name)
		if not frappe.has_permission("Project", "read", doc=project):
			return []

		# Extract team member names
		member_names = [member.user for member in project.team_members]

		return member_names

	except frappe.DoesNotExistError:
			return []


# 2026-09-08 permission sweep: this used to be a BLOCKLIST (_PROTECTED_FIELDS —
# identity/audit fields only), which admits every future field by default and
# stays that way until someone notices it shouldn't. It missed project_owner/
# project_leader entirely, so a Project LEADER (who legitimately passes
# _gate_project's owner-OR-leader check) could call update_project(project,
# {"project_owner": "<self>"}) and self-promote to Owner — a strictly more
# powerful role (only the Owner may delete the project or reassign owner/
# leader afterward). Project.validate_edit_permission() already encodes the
# right rule for this ("only the Owner may change owner/leader"), but its
# first line is `if self.flags.get("ignore_permissions"): return` — it never
# runs here because _apply_fields saves with ignore_permissions=True.
#
# Now an ALLOWLIST: only fields that are safe for the doc's own owner/leader
# to set directly are admitted; everything else is refused by default rather
# than by remembering to list it.
#
# Decision on project_owner/project_leader specifically, since there were two
# ways to close this and leaving it ambiguous would just move the bug: REFUSE
# them here, don't re-derive the Owner-only check inline. Reassigning a
# project's owner is not left unreachable — Frappe's own generic REST
# resource API (`PUT /api/resource/Project/<name>`, what the real frontend
# actually calls for "edit project" — confirmed neither update_project nor
# update_project_detail has any caller in either frontend) already exposes
# it, is already permission-checked through the registered has_permission
# hook, and does NOT set ignore_permissions, so
# Project.validate_edit_permission()'s real "only the Owner may change owner/
# leader" rule runs there normally. Re-deriving that same rule a second time
# in this function would be a second definition of the same check that can
# drift from the first — refusing here and pointing at the one real
# enforcement point is the same principle as the reports/bulk_assign_
# project_roles fixes earlier tonight. project_admins is refused too, for the
# same reason: bulk_assign_project_roles is its dedicated, properly-gated
# path. team_members/glossaries/grouping-adjacent structural fields and every
# computed rollup are refused as well — none of them belong in a generic
# content-field editor.
#
# Neither update_project nor update_project_detail has any real caller in
# either frontend (confirmed: frontend's actual "edit project" UI goes
# through Frappe's own generic REST resource API instead, which is properly
# permission-checked and does let validate_edit_permission() run) — these
# two whitelisted functions were reachable only by a direct API call, not
# through normal app usage. Still fixed: unreachable from the UI is not the
# same as unexploitable.
_PROJECT_ALLOWED_FIELDS = {
	"project_name", "start_date", "deadline", "goal", "success_condition",
	"failure_condition", "context", "brand", "status", "auto_approve",
	"blocked_by", "reward_type", "bonus_amount", "discount",
	"is_ai_managed", "ai_device", "ai_session_name",
}
_PROJECT_DETAIL_ALLOWED_FIELDS = {
	"title", "project_deadline", "current_condition", "expected_outcome",
	"goal", "success_condition", "failure_condition", "context",
	"keterangan_di_sow", "grouping", "status",
	"is_ai_managed", "ai_device", "ai_session_name",
}


def _apply_fields(doc, fields, allowed_fields):
	"""Set caller-given fields onto `doc`, restricted to `allowed_fields`, and save."""
	fields = frappe.parse_json(fields) if isinstance(fields, str) else fields
	if not isinstance(fields, dict):
		frappe.throw("fields must be an object.")
	rejected = set(fields) - allowed_fields
	if rejected:
		frappe.throw(f"Cannot set: {', '.join(sorted(rejected))}.", frappe.PermissionError)
	doc.update({k: v for k, v in fields.items() if k in allowed_fields})
	doc.save(ignore_permissions=True)
	return doc


@frappe.whitelist()
def get_ai_managed():
	"""Which Projects and Project Details an AI session is responsible for.

	Answers "what am I supposed to be handling, and from which device and session"
	for an agent reading through the MCP connector. The connector finds this method
	with its own list_api_methods scan, so nothing about the MCP protocol, schema or
	capabilities changes to make it reachable -- the docstring you are reading IS the
	contract the client discovers.

	Separate from a Project Todo's AI tag, and deliberately so: this says WHO RUNS a
	project or a sub-goal, while the todo ladder says whether one task is meant for an
	AI. Nothing here reads work_mode, ai_phase, a prompt, or ai_in_progress. A Project
	Detail's tag is independent of its parent Project's, so an untagged project can
	hold a tagged sub-goal and is not reported as managed.

	Scoped with _visible_projects(), the same helper the dashboards use, because
	frappe.get_all does NOT apply permissions -- without that scope this would hand
	every caller the device and session name of every project on the site. System
	Managers see all, everyone else sees the projects they are involved in.

	Two queries plus the scope lookup, whatever the number of mappings.

	Returns {"projects": [{name, project_name, ai_device, ai_session_name}],
	         "details":  [{name, title, project, ai_device, ai_session_name}]}.
	"""
	from vernon_project.api.mobile import _visible_projects

	empty = {"projects": [], "details": []}
	# Same deploy-order guard the rest of these fields use: readable before the
	# doctype reload lands, rather than a hard "Unknown column".
	if not (
		frappe.db.has_column("Project", "is_ai_managed")
		and frappe.db.has_column("Project Detail", "is_ai_managed")
	):
		return empty
	names = _visible_projects()
	if not names:
		return empty
	return {
		"projects": frappe.get_all(
			"Project",
			filters={"name": ["in", names], "is_ai_managed": 1},
			fields=["name", "project_name", "ai_device", "ai_session_name"],
			order_by="project_name",
			limit_page_length=0,
		),
		"details": frappe.get_all(
			"Project Detail",
			filters={"project": ["in", names], "is_ai_managed": 1},
			fields=["name", "title", "project", "ai_device", "ai_session_name"],
			order_by="title",
			limit_page_length=0,
		),
	}


@frappe.whitelist()
def update_project(project, fields):
	"""Update a Project's own content fields (not its team/details/todos, which
	have their own endpoints, and not owner/leader/admins — see
	bulk_assign_project_roles). Owner/leader/SM only — same gate as the AI
	breakdown endpoints below. `fields` = {fieldname: value}."""
	doc = _gate_project(project)
	_apply_fields(doc, fields, _PROJECT_ALLOWED_FIELDS)
	return {"name": doc.name}


@frappe.whitelist()
def update_project_detail(project_detail, fields):
	"""Update a Project Detail's own content fields. Gated on its PARENT project's
	owner/leader/SM — the parent is read from the detail itself, not a
	caller-supplied id, so there's nothing to spoof. `fields` = {fieldname: value}.

	Does not accept `project`: moving a detail between projects is
	move_project_detail's job, not this one — that endpoint already gates on
	owning BOTH the source and destination project, checks the destination
	team can actually take the detail's assigned todos, and clears the
	grouping/glossaries that belong to the old project. Duplicating a partial
	version of that here would either miss those checks or fork the logic;
	reusing the one real implementation is the same principle as the
	Project Owner/Leader picker fix earlier tonight."""
	if not frappe.db.exists("Project Detail", project_detail):
		frappe.throw("Project Detail not found.", frappe.DoesNotExistError)
	detail = frappe.get_doc("Project Detail", project_detail)
	_gate_project(detail.project)
	_apply_fields(detail, fields, _PROJECT_DETAIL_ALLOWED_FIELDS)
	return {"name": detail.name}


# ================================================================================
# AI project breakdown — deterministic template that drafts subgoals (Project
# Details) and draft todos (Project Todos) from a Project's goal/success/failure/
# context fields. No LLM: this app has no model client; "AI" here means a
# structured draft a human reviews, edits, then persists. See test_project_breakdown.py.
# ================================================================================

from frappe.utils import nowdate  # noqa: E402

_CTX_FIELDS = ("goal", "success_condition", "failure_condition", "context")
_MAX_LEN = 4000          # per context field, on persist (sanitise + length-limit)
_MAX_SUBGOALS = 20       # cap the draft/persist fan-out (perf + abuse guard)
_MAX_TODOS = 30          # per subgoal


def _clip(text, n=_MAX_LEN):
	"""Trim to a plain, length-limited string. None -> ''."""
	s = (text or "")
	if not isinstance(s, str):
		s = str(s)
	s = s.strip()
	return s[:n]


def _todo(text, focus):
	"""One draft todo carrying a ready-to-use AI prompt built from the focus text."""
	return {
		"to_do": _clip(text, 200),
		"work_mode": "Both",
		"ai_prompt": _clip(f"{text}\n\nContext: {focus}", 1000),
	}


def _build_breakdown(fields):
	"""Pure, deterministic: a Project's context fields -> draft subgoals + todos.

	No DB, no randomness — same input always yields the same output, so it is
	unit-testable without a site. Each subgoal maps to a future Project Detail;
	each todo to a future Project Todo. Nothing here is persisted.
	"""
	goal = _clip(fields.get("goal"), 500)
	success = _clip(fields.get("success_condition"), 500)
	failure = _clip(fields.get("failure_condition"), 500)
	context = _clip(fields.get("context"), 500)
	focus = goal or success or "the project"

	subgoals = []
	if success:
		subgoals.append({
			"title": "Reach success", "goal": success,
			"success_condition": success, "failure_condition": failure, "context": context,
			"todos": [
				_todo(f"Define what 'done' means for: {success}", focus),
				_todo(f"Build the core work toward: {success}", focus),
				_todo(f"Verify success: {success}", focus),
			],
		})
	if failure:
		subgoals.append({
			"title": "Prevent failure", "goal": failure,
			"success_condition": success, "failure_condition": failure, "context": context,
			"todos": [
				_todo(f"Identify risks that lead to: {failure}", focus),
				_todo(f"Add safeguards against: {failure}", focus),
			],
		})
	if context:
		subgoals.append({
			"title": "Handle context", "goal": context,
			"success_condition": success, "failure_condition": failure, "context": context,
			"todos": [_todo(f"Plan around the context: {context}", focus)],
		})
	# Always at least one subgoal so an under-filled project still gets a starting point.
	if not subgoals:
		subgoals.append({
			"title": "Kickoff", "goal": goal,
			"success_condition": success, "failure_condition": failure, "context": context,
			"todos": [_todo(f"Break down the goal into tasks: {focus}", focus)],
		})
	return subgoals[:_MAX_SUBGOALS]


def _gate_project(project):
	"""Load the Project (one query) and enforce owner/leader/SM. Raises PermissionError
	for anyone else, so no other project's data can leak. Returns the loaded doc."""
	if not project or not frappe.db.exists("Project", project):
		frappe.throw("Project not found.", frappe.DoesNotExistError)
	doc = frappe.get_doc("Project", project)
	user = frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return doc
	if user not in (doc.project_owner, doc.project_leader):
		frappe.throw(
			"Only the project owner or leader can use AI breakdown here.",
			frappe.PermissionError,
		)
	return doc


def _gate_detail(project, project_detail):
	"""Load a Project Detail that belongs to `project`, after gating the project.
	Guards against a detail from another project leaking in via a mismatched id."""
	doc = _gate_project(project)
	if not frappe.db.exists("Project Detail", project_detail):
		frappe.throw("Project Detail not found.", frappe.DoesNotExistError)
	detail = frappe.get_doc("Project Detail", project_detail)
	if detail.project != doc.name:
		frappe.throw("Project Detail does not belong to this project.", frappe.PermissionError)
	return doc, detail


@frappe.whitelist()
def generate_project_breakdown(project, project_detail=None):
	"""Draft subgoals + todos from AI-context fields. READ-ONLY: creates nothing.
	Owner/leader/SM only. With `project_detail`, drafts todos for that one subgoal
	(built from the detail's own fields); otherwise drafts subgoals for the project."""
	if project_detail:
		doc, detail = _gate_detail(project, project_detail)
		subgoals = _build_breakdown({f: detail.get(f) for f in _CTX_FIELDS})
		# Fold to one subgoal representing this detail so the review UI is identical.
		todos = [t for sg in subgoals for t in sg["todos"]][:_MAX_TODOS]
		return {
			"project": doc.name,
			"project_detail": detail.name,
			"subgoals": [{
				"title": detail.title,
				**{f: detail.get(f) for f in _CTX_FIELDS},
				"todos": todos,
			}],
		}
	doc = _gate_project(project)
	subgoals = _build_breakdown({f: doc.get(f) for f in _CTX_FIELDS})
	return {
		"project": doc.name,
		"project_detail": None,
		**{f: doc.get(f) for f in _CTX_FIELDS},
		"subgoals": subgoals,
	}


def _allowed_work_mode(mode):
	"""Sanitise a drafted work_mode, dropping the AI tag when the caller lacks AI access."""
	from vernon_project.api.project_todo import AI_WORK_MODES, can_use_ai

	if mode not in ("Human", "AI", "Both"):
		return None
	if mode in AI_WORK_MODES and not can_use_ai():
		return None
	return mode


def _create_todo(project, detail_name, td, defaults, valid_groups, max_estimated):
	"""Insert one Project Todo from a reviewed draft. Returns True if inserted,
	False if skipped (blank). Throws if a non-blank todo lacks group/level, or
	names a group that doesn't exist (a caller without the review UI's picker —
	e.g. an AI/MCP agent — has no other way to discover valid values; Frappe's
	own Link validation would otherwise throw deep inside insert() with no hint
	of what's actually valid)."""
	if not (td.get("to_do") or "").strip():
		return False
	if not td.get("group") or not td.get("level"):
		frappe.throw(f"Todo {td.get('to_do')!r} needs a group and level before it can be saved.")
	if td["group"] not in valid_groups:
		frappe.throw(
			f"Todo {td.get('to_do')!r}: group {td['group']!r} does not exist. "
			f"Valid groups: {', '.join(sorted(valid_groups))}."
		)
	# Drafts rarely carry an estimate; the controller floors at 5 min, so default
	# to 30m (the app's "unestimated task plans as 30m" convention).
	estimated = int(td.get("estimated") or 30)
	# Same check + message the doctype's own validate_estimated_max makes, just named to
	# the offending todo — a fan-out of N todos needs to say which one, since the
	# doctype-level throw alone doesn't identify it inside this loop.
	if max_estimated and estimated > max_estimated:
		frappe.throw(
			f"Todo {td.get('to_do')!r}: Estimated minutes ({estimated}) exceeds the maximum ({int(max_estimated)})."
		)
	frappe.get_doc({
		"doctype": "Project Todo",
		"project": project,
		"project_detail": detail_name,
		"to_do": _clip(td.get("to_do"), 500),
		"assigned_to": td.get("assigned_to") or defaults["assignee"],
		"start_date": td.get("start_date") or defaults["start"],
		"deadline": td.get("deadline") or defaults["deadline"],
		"group": td.get("group"),
		"level": td.get("level"),
		"level_id": td.get("level_id"),
		# AI tag is role-gated the same way as tagging by hand: a user without AI access
		# gets the drafted todo, just not marked as AI work (its prompt still rides along
		# so an enabled leader can tag it later).
		"work_mode": _allowed_work_mode(td.get("work_mode")),
		"ai_prompt": _clip(td.get("ai_prompt"), 4000) or None,
		"estimated": estimated,
		# Same field save_notes(todo_id, notes) writes — notes set at creation and
		# notes set later must be the same field, not a lookalike.
		"notes": td.get("notes") or None,
	}).insert(ignore_permissions=True)
	return True


@frappe.whitelist()
def persist_project_breakdown(project, subgoals, project_detail=None):
	"""Create the reviewed drafts. Owner/leader/SM only; context fields sanitised +
	length-limited; each todo needs a group+level (the review UI's picker supplies
	them). Without `project_detail`: a Project Detail per subgoal + its todos. With
	`project_detail`: append the todos to that existing subgoal, create no new detail."""
	if project_detail:
		doc, detail = _gate_detail(project, project_detail)
	else:
		doc = _gate_project(project)
	rows = frappe.parse_json(subgoals) or []
	if not isinstance(rows, list):
		frappe.throw("subgoals must be a list.")
	rows = rows[:_MAX_SUBGOALS]

	defaults = {
		"assignee": doc.project_leader or frappe.session.user,
		"start": doc.start_date or nowdate(),
		"deadline": doc.deadline or nowdate(),
	}
	valid_groups = set(frappe.get_all("Group", pluck="name"))
	max_estimated = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0

	created_details, created_todos = [], 0
	for sg in rows:
		if project_detail:
			target = project_detail            # append to the existing subgoal
		else:
			target = frappe.get_doc({
				"doctype": "Project Detail",
				"project": doc.name,
				"title": _clip(sg.get("title") or "Untitled subgoal", 140),
				"project_deadline": defaults["deadline"],
				"goal": _clip(sg.get("goal")),
				"success_condition": _clip(sg.get("success_condition")),
				"failure_condition": _clip(sg.get("failure_condition")),
				"context": _clip(sg.get("context")),
			}).insert(ignore_permissions=True).name
			created_details.append(target)

		for td in (sg.get("todos") or [])[:_MAX_TODOS]:
			if _create_todo(doc.name, target, td, defaults, valid_groups, max_estimated):
				created_todos += 1

	return {"project": doc.name, "created_details": created_details, "created_todos": created_todos}
