import frappe

@frappe.whitelist()
def get_project_team_members(project_name):
	"""
	Retrieves the team members associated with a given project.
	
	Args:
			project_name (str): The name of the project.
			
	Returns:
			list: A list of team member names associated with the project.
	"""
	try:
		# Get Project
		project = frappe.get_doc("Project", project_name)
		
		# Extract team member names
		member_names = [member.user for member in project.team_members]
		
		return member_names

	except frappe.DoesNotExistError:
			return []

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


def _create_todo(project, detail_name, td, defaults):
	"""Insert one Project Todo from a reviewed draft. Returns True if inserted,
	False if skipped (blank). Throws if a non-blank todo lacks group/level."""
	if not (td.get("to_do") or "").strip():
		return False
	if not td.get("group") or not td.get("level"):
		frappe.throw(f"Todo {td.get('to_do')!r} needs a group and level before it can be saved.")
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
		# Drafts rarely carry an estimate; the controller floors at 5 min, so default
		# to 30m (the app's "unestimated task plans as 30m" convention).
		"estimated": int(td.get("estimated") or 30),
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
			if _create_todo(doc.name, target, td, defaults):
				created_todos += 1

	return {"project": doc.name, "created_details": created_details, "created_todos": created_todos}
