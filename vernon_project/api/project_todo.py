import json

import frappe
from frappe.utils import cint

from vernon_project import coding_brief
from vernon_project.vernon_project.doctype.project.project import get_project_admins


@frappe.whitelist()
def get_notes(todo_id):
	"""Fetch notes for a specific Project Todo. Gated on todo read (same audience
	as list_todo_files/download_todo_file) — whoever can see the todo (assignee,
	project owner/leader/admin, team member, or System Manager), not the
	narrower assignee/owner/leader/creator set save_notes requires to write."""
	if not frappe.has_permission("Project Todo", "read", doc=todo_id):
		frappe.throw("You are not allowed to read this todo.", frappe.PermissionError)
	notes = frappe.db.get_value('Project Todo', todo_id, 'notes')
	return {'notes': notes or ''}


@frappe.whitelist()
def get_group_levels():
	"""Flat scoring catalog for the single-select picker: one row per Group Level.

	Powers the combined "[Group] Type - Level" select in the todo + meeting forms. Each
	row's ``level_id`` fully identifies group + type + level, so the client sends only
	``group`` + ``level_id`` and the controller derives the rest. Read straight off the
	Group Level child table (no client perms on it) joined to each parent Group's name and
	base rate for the points preview.
	"""
	groups = {
		g.name: g
		for g in frappe.get_all('Group', fields=['name', 'group_name', 'base_rate_per_minute', 'group_type'])
	}
	rows = frappe.get_all(
		'Group Level',
		filters={'parenttype': 'Group'},
		fields=['level_id', 'type_name', 'level_name', 'difficulty_percent', 'parent'],
		order_by='parent asc, type_name asc, difficulty_percent asc',
	)
	out = []
	for r in rows:
		g = groups.get(r.parent)
		if not g or not r.level_id:
			continue
		out.append(
			{
				'level_id': r.level_id,
				'type_name': r.type_name,
				'level_name': r.level_name,
				'difficulty_percent': r.difficulty_percent,
				'group': r.parent,
				'group_name': g.group_name,
				'base_rate': g.base_rate_per_minute,
				# k9b82d4lkh: the picker already holds this row, so the todo form knows
				# whether to show the coding brief without a second request.
				'group_type': g.group_type or '',
			}
		)
	return out


@frappe.whitelist()
def get_coding_brief_schema():
	"""The questions a Coding group's todo form asks, straight from the module the
	controller validates and renders with (vernon_project/coding_brief.py) — one
	definition, so the form can never ask for a field the server does not require.

	Static, so it is not per-group: which groups are Coding is already on every row
	get_group_levels returns. Read-only and harmless, hence no extra gate beyond
	being a logged-in call.
	"""
	return {'fields': [dict(f) for f in coding_brief.FIELDS], 'heading': coding_brief.HEADING}

def _auto_advance(todo, project_leader, project_owner, project_auto_approve=0):
	"""Collapse redundant self-approval gates in place (mutates todo, no save).

	Two review gates exist: 🟠 Done → 🔷 Checked By PL (Leader approves) and
	🔷 Checked By PL → ✅ Completed (Owner approves). A gate is pointless when the
	approver already effectively signed off:
	  - assignee IS the leader -> the Leader gate is the assignee approving their
	    own work; skip it.
	  - leader IS the owner    -> the Owner gate is the same person who just
	    cleared the Leader gate; skip it.

	Auto-approve also clears the Owner gate. It resolves per-todo over the
	project-wide default: a todo may force it ON (auto_approve) or force it OFF
	(auto_approve_opt_out); otherwise it inherits project_auto_approve.

	Sequential ifs (not elif) so assignee==leader==owner completes in one hop.
	Truthiness guards keep an empty owner (None) from auto-completing.
	"""
	now = frappe.utils.now()
	if todo.status == "🟠 Done" and todo.assigned_to and todo.assigned_to == project_leader:
		todo.status = "🔷 Checked By PL"
		todo.tested_at = now
		todo.tested_by = project_leader
	effective = bool(todo.auto_approve) or (
		not getattr(todo, "auto_approve_opt_out", 0) and bool(project_auto_approve)
	)
	if todo.status == "🔷 Checked By PL" and project_owner and (effective or project_leader == project_owner):
		todo.status = "✅ Completed"
		todo.completed_at = now
		todo.completed_by = project_owner

@frappe.whitelist()
def update_status(todo_id):
	"""
	Approves a project todo item by setting its status to 'Approved'.

	Args:
			todo_id (str): The ID of the project todo item to approve.

	Returns:
			dict: A dictionary containing the status of the operation.
	"""
	from vernon_project.api.mobile import _can_advance, _status_key, NEXT_LABEL
	try:
		# Get Todo, Detail, and Project
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		# Get user
		user = frappe.session.user
		project_leader = project.project_leader
		project_owner = project.project_owner

		# Validasi: Project Admin TIDAK boleh update status — kecuali todo yang
		# ditugaskan ke dirinya sendiri (dia boleh menandainya selesai; gate
		# leader/owner di bawah tetap menghalangi approve pekerjaan sendiri).
		if user in get_project_admins(project) and user != todo.assigned_to:
			return {"status": "error", "message": f"Project Admin tidak memiliki izin untuk mengupdate status todo. Silakan hubungi Project Owner atau Project Leader."}

		# Check if todo is in 'Scheduled' status
		if todo.status == "⚪️ Planned":
			# Validasi: user = project leader atau user == project owner atau user == todo.assigned_to
			if user in [project_leader, project_owner, todo.assigned_to]:
				# Update status to 'Approved'
				todo.status = "🟠 Done"
				todo.developed_at = frappe.utils.now()
				todo.developed_by = user
				todo.to_check = 0  # marking done clears the "To Check" reminder (mirrors Focus drop)
			else:
				return {"status": "error", "message": f"You do not have permission to approve this todo {todo.to_do} (Yg bisa hanya Project Owner {project_owner}, Project Leader {project_leader} atau Assigned To {todo.assigned_to})."}
		elif todo.status == "🟠 Done":
			# Leader gate: only the Project Leader may approve here. The Owner
			# may approve only when they are also the leader. Owner-fallback when
			# no leader is set (legacy rows) so the todo can't get stuck.
			if user == project_leader or (not project_leader and user == project_owner):
				# Update status to 'Approved'
				todo.status = "🔷 Checked By PL"
				todo.tested_at = frappe.utils.now()
				todo.tested_by = user
			else:
				return {"status": "error", "message": f"You do not have permission to approve this todo {todo.to_do} (Yg bisa hanya Project Leader {project_leader})."}
		elif todo.status == "🔷 Checked By PL":
			if user in [project_owner]:
				# Update status to 'Approved'
				todo.status = "✅ Completed"
				todo.completed_at = frappe.utils.now()
				todo.completed_by = user
			else:
				return {"status": "error", "message": f"You do not have permission to approve this todo {todo.to_do} (Yg bisa hanya Project Owner {project_owner}."}
		elif todo.status == "✅ Completed":
			return {"status": "info", "message": f"Todo {todo.to_do} is already completed."}

		# Skip redundant self-review gates: assignee==leader auto-clears the Leader
		# gate; leader==owner auto-clears the Owner gate. One atomic save, so points
		# still mint once at ✅ Completed and only the final-status notification fires.
		_auto_advance(todo, project_leader, project_owner, project.auto_approve)

		# Save and ignore permission
		todo.save(ignore_permissions=True)

		new_key = _status_key(todo.status)
		return {
			"status": "info",
			"message": f"Todo {todo.to_do} is updated to {todo.status}.",
			"status_key": new_key,
			"can_advance": new_key != "completed" and _can_advance(new_key, project, user, todo.assigned_to),
			"next_status_label": NEXT_LABEL.get(new_key),
		}

	except frappe.DoesNotExistError:
			return {"status": "error", "message": f"Todo {todo_id} does not exist."}
	except Exception as e:
			return {"status": "error", "message": str(e)}

@frappe.whitelist()
def set_auto_approve(todo_id, mode):
	"""Set a todo's auto-approve override: "on" (force skip Owner gate), "off"
	(force wait, opt out of the project default), or "inherit" (follow the
	project-wide default).

	Trust boundary: only the Project Owner who also holds the "Partner" role may
	set it.
	"""
	try:
		if mode not in ("on", "off", "inherit"):
			return {"status": "error", "message": f"Invalid mode {mode!r}."}
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		if not (user == project.project_owner and "Partner" in frappe.get_roles(user)):
			return {"status": "error", "message": "Hanya Project Owner dengan role Partner yang bisa mengatur auto-approve."}

		todo.auto_approve = 1 if mode == "on" else 0
		todo.auto_approve_opt_out = 1 if mode == "off" else 0
		todo.save(ignore_permissions=True)
		return {"status": "info", "mode": mode}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def set_project_auto_approve(project, enabled):
	"""Set the project-wide auto-approve default. Every todo inherits this unless
	it overrides via set_auto_approve.

	Trust boundary: only the Project Owner who also holds the "Partner" role.
	"""
	try:
		doc = frappe.get_doc("Project", project)
		user = frappe.session.user
		if not (user == doc.project_owner and "Partner" in frappe.get_roles(user)):
			return {"status": "error", "message": "Hanya Project Owner dengan role Partner yang bisa mengatur auto-approve."}
		value = frappe.utils.cint(enabled)
		doc.auto_approve = value
		doc.save(ignore_permissions=True)
		return {"status": "info", "auto_approve": value}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Project {project} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}

@frappe.whitelist()
def reject_status(todo_id, reason=None):
	"""
	Reject a project todo that is under review, bouncing it back to
	"⚪️ Planned" so the assignee revises and resubmits.

	Only Project Owner or Project Leader may reject, and only while the todo is
	awaiting approval ("🟠 Done" or "🔷 Checked By PL"). A reason is required and
	is surfaced to the assignee via notification. No points change hands: points
	only mint at "✅ Completed", which a reject never reaches — so the assignee
	and leader simply never earn them.

	Args:
		todo_id (str): The Project Todo to reject.
		reason (str): Why it was rejected (required, non-empty).
	"""
	from vernon_project.api.mobile import _status_key

	try:
		reason = (reason or "").strip()
		if not reason:
			return {"status": "error", "message": "Alasan penolakan wajib diisi."}

		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		project_leader = project.project_leader
		project_owner = project.project_owner

		# Project Admin cannot change status (mirrors update_status).
		if user in get_project_admins(project):
			return {"status": "error", "message": "Project Admin tidak memiliki izin untuk menolak todo."}

		# Reject is only meaningful at the review stages.
		if todo.status not in ("🟠 Done", "🔷 Checked By PL"):
			return {"status": "error", "message": f"Todo {todo.to_do} tidak sedang direview, tidak bisa ditolak."}

		if user not in [project_leader, project_owner]:
			return {"status": "error", "message": f"You do not have permission to reject this todo (only Project Owner {project_owner} or Project Leader {project_leader})."}

		# AI-tagged work isn't rejected — raise a follow-up todo instead (ujkfag8r5v).
		# Checked after the permission gate so an unauthorised user still gets that
		# message, not this one.
		if todo.work_mode in AI_WORK_MODES:
			return {
				"status": "error",
				"message": "Todo bertanda AI tidak bisa ditolak — buat Follow Up.",
			}

		todo.status = "⚪️ Planned"
		todo.rejection_reason = reason
		todo.rejected_by = user
		todo.rejected_at = frappe.utils.now()
		# Back to square one: clear the review-stage audit stamps so the timeline
		# doesn't show a stale "Marked Done / Approved by Leader" on a task that
		# was just bounced back. They get re-stamped when the assignee resubmits.
		todo.developed_at = None
		todo.developed_by = None
		todo.tested_at = None
		todo.tested_by = None
		# Notification to the assignee is fired from the controller's on_change.
		todo.save(ignore_permissions=True)

		new_key = _status_key(todo.status)
		return {
			"status": "info",
			"message": f"Todo {todo.to_do} ditolak dan dikembalikan ke Planned.",
			"status_key": new_key,
		}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


def _undo_recurring_followup(todo, since):
	"""Delete the next recurrence occurrence a just-undone Completion auto-generated
	(on_change's generate_next(force=True)) — but ONLY if it is still exactly as
	generated: still Planned, never marked Done. Best-effort cleanup; a next
	occurrence someone has already started on is left alone. Returns the deleted
	todo's name, or None if nothing matched."""
	if not todo.is_recurring or not since:
		return None
	from vernon_project.vernon_project.doctype.project_todo.project_todo import series_root

	root = series_root(todo.name, todo.original_todo)
	candidates = frappe.get_all(
		"Project Todo",
		filters={
			"original_todo": root,
			"status": "⚪️ Planned",
			"developed_at": ["is", "not set"],
			"creation": [">=", since],
		},
		fields=["name"],
		order_by="creation desc",
		limit_page_length=1,
	)
	if not candidates:
		return None
	frappe.delete_doc("Project Todo", candidates[0]["name"], ignore_permissions=True)
	return candidates[0]["name"]


@frappe.whitelist()
def undo_approval(todo_id):
	"""Undo the most recent approval gate the CURRENT user personally cleared on
	this todo — Leader's Done->Checked or Owner's Checked->Completed — one step
	back. Self-service only, and only while the todo is still exactly where that
	action left it, so a leader/owner can never undo out from under someone who
	already advanced past them.

	Reverting away from "✅ Completed" re-triggers the controller's own
	prev_state handling (on_change -> _remove_ledger), so any Point Ledger rows
	minted on approval un-mint for free. If that Completion had auto-generated
	the next recurrence, it is deleted too — but only while still untouched (see
	_undo_recurring_followup); one someone has already started on is left alone.
	"""
	from vernon_project.api.mobile import _status_key

	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		user = frappe.session.user

		if todo.status == "🔷 Checked By PL" and todo.tested_by == user:
			target_status, clear_fields, since = "🟠 Done", ("tested_at", "tested_by"), None
		elif todo.status == "✅ Completed" and todo.completed_by == user:
			target_status, clear_fields, since = "🔷 Checked By PL", ("completed_at", "completed_by"), todo.completed_at
		else:
			return {"status": "error", "message": "Tidak ada approval milik Anda yang bisa dibatalkan pada todo ini."}

		todo.status = target_status
		for f in clear_fields:
			todo.set(f, None)
		# Notification to the relevant party is fired from the controller's on_change,
		# same mechanism reject_status relies on.
		todo.save(ignore_permissions=True)

		removed_next = _undo_recurring_followup(todo, since)

		new_key = _status_key(todo.status)
		message = f"Approval dibatalkan, {todo.to_do} kembali ke {todo.status}."
		if removed_next:
			message += " Kejadian berulang berikutnya (belum disentuh) ikut dihapus."
		return {"status": "info", "message": message, "status_key": new_key}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def get_my_approvals():
	"""Every Project Todo the current user has personally approved — Leader's
	Done->Checked or Owner's Checked->Completed — newest approval first. Powers
	the "My Approvals" history screen. Each row carries can_undo (see
	undo_approval) so the UI only offers Undo while it is still valid.

	Scoped to the Checked/Completed statuses only (mirrors get_dashboard's
	backlog-avoidance) — a todo that was rejected has its tested_by/at cleared by
	reject_status, so it can never appear here; that's the desired behavior.
	"""
	from vernon_project.api.mobile import (
		STATUS_CHECKED,
		STATUS_COMPLETED,
		_admins_by_project,
		_allocations_map,
		_fetch_todos,
		_shape_todo,
		_user_name_map,
		_visible_projects,
	)

	user = frappe.session.user
	rows = _fetch_todos(_visible_projects(), statuses=[STATUS_CHECKED, STATUS_COMPLETED])
	mine = [r for r in rows if r.get("tested_by") == user or r.get("completed_by") == user]
	if not mine:
		return []

	emails = {r["assigned_to"] for r in mine}
	for r in mine:
		emails.update([r["project_owner"], r["project_leader"]])
	name_map = _user_name_map(emails)
	alloc_map = _allocations_map([r["name"] for r in mine])
	admins_map = _admins_by_project(mine)

	out = []
	for r in mine:
		shaped = _shape_todo(r, user, name_map, alloc_map=alloc_map, admins=admins_map.get(r["project"], []))
		if r.get("completed_by") == user:
			shaped["approved_at"] = str(r["completed_at"]) if r.get("completed_at") else None
			shaped["approval_role"] = "Owner"
		else:
			shaped["approved_at"] = str(r["tested_at"]) if r.get("tested_at") else None
			shaped["approval_role"] = "Leader"
		out.append(shaped)

	out.sort(key=lambda t: t["approved_at"] or "", reverse=True)
	return out


def _done_time(row):
	"""When the todo was actually marked 🟠 Done -- NOT when a leader/owner later
	approved it.

	developed_at is stamped at ⚪️ Planned → 🟠 Done by update_status and is present on
	every Completed row today. done_started_at is the controller's phase stamp, which
	is NULL on rows that auto-advanced past Done inside a single save, so it can only
	be a fallback. completed_at (owner approval) is the last-resort anchor for legacy
	rows carrying neither -- on 37% of Completed rows it lands on a different day than
	the todo was actually finished, which is exactly the ordering this avoids.
	"""
	return row.get("developed_at") or row.get("done_started_at") or row.get("completed_at")


# Home "Done" tab = everything the assignee finished today and the 2 days before,
# however many (owner, 8ek4eg7j87 — it used to stop at 30).
DONE_WINDOW_DAYS = 3


def _done_since(today=None):
	"""First day of the Done tab's window: DONE_WINDOW_DAYS calendar days ending today."""
	return frappe.utils.add_days(frappe.utils.getdate(today or frappe.utils.nowdate()), -(DONE_WINDOW_DAYS - 1))


def _sort_recently_done(rows, limit=None):
	"""Newest-done first, capped at `limit` (None = all).

	Tie-break modified desc then name desc so two todos finished in the same second
	keep one fixed order across refetches. A row with no done time at all sorts last
	("" is below every timestamp under reverse) rather than being dropped.
	"""
	return sorted(
		rows,
		key=lambda r: (str(_done_time(r) or ""), str(r.get("modified") or ""), str(r.get("name") or "")),
		reverse=True,
	)[:limit]


@frappe.whitelist()
def get_recently_done(limit=None):
	"""The current user's own todos completed in the last DONE_WINDOW_DAYS days
	(assignee's Done list), newest DONE time first, all of them unless a caller
	passes `limit`. Powers the Home 'Done' tab. The window is a SQL filter on the
	Done time, so the user's whole completed history is never pulled to slice.

	Ordered on when the assignee actually marked the todo Done (see _done_time),
	not on the later owner approval -- a batch of old todos approved this morning
	must not push aside a todo finished an hour ago.

	Scoped to assigned_to == me in SQL (not the get_my_approvals broad-fetch-then-
	filter pattern) — this endpoint runs on the Home landing page on every mount
	and window focus, so an org-wide backlog scan here is the same cost
	get_dashboard deliberately avoids (see its docstring). Sort+slice happens
	before shaping so only the rows actually returned get the expensive
	name_map/alloc_map/admins_map treatment.
	"""
	from vernon_project.api.mobile import (
		STATUS_COMPLETED,
		_admins_by_project,
		_allocations_map,
		_fetch_todos,
		_shape_todo,
		_user_name_map,
		_visible_projects,
	)
	from frappe.utils import pretty_date, get_datetime, cint

	user = frappe.session.user
	rows = _fetch_todos(
		_visible_projects(), statuses=[STATUS_COMPLETED], assigned_to=user, done_since=_done_since()
	)
	if not rows:
		return []

	mine = _sort_recently_done(rows, cint(limit) or None)

	emails = {r["assigned_to"] for r in mine}
	for r in mine:
		emails.update([r["project_owner"], r["project_leader"]])
	name_map = _user_name_map(emails)
	alloc_map = _allocations_map([r["name"] for r in mine])
	admins_map = _admins_by_project(mine)

	out = []
	for r in mine:
		shaped = _shape_todo(r, user, name_map, alloc_map=alloc_map, admins=admins_map.get(r["project"], []))
		done = _done_time(r)
		shaped["done_at"] = str(done) if done else None
		shaped["done_at_human"] = pretty_date(get_datetime(done)) if done else None
		out.append(shaped)

	return out


@frappe.whitelist()
def save_notes(todo_id, notes, coding_brief=None):
	"""
	Save notes for a project todo item.
	Only assigned_to, project_owner, project_leader, or the todo creator
	(todo.owner) can save.

	``coding_brief`` (k9b82d4lkh) is the structured answers for a todo in a Coding
	group. It rides along here rather than on its own endpoint because the gate is
	identical — whoever may write the note may write the brief the note is rendered
	from. The controller regenerates ``notes`` from it on save, so ``notes`` is
	ignored for such a todo whatever the caller sends.
	"""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		allowed = [todo.assigned_to, project.project_owner, project.project_leader, todo.owner]

		if user not in allowed:
			return {
				"status": "error",
				"message": f"Anda tidak punya izin mengubah catatan ini. Yang boleh: Assigned To ({todo.assigned_to}), Project Owner ({project.project_owner}), Project Leader ({project.project_leader}), atau pembuat todo ({todo.owner})."
			}

		todo.notes = notes
		if coding_brief is not None:
			todo.coding_brief = coding_brief
		todo.save(ignore_permissions=True)
		return {"status": "ok", "message": "Catatan berhasil disimpan."}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


AI_WORK_MODES = ("AI", "Both")
# The AI tag is a 3-phase ladder. Phase is DERIVED (see ai_phase) from work_mode +
# whether a prompt exists + the ai_prompt_confirmed flag, so the only stored state
# is that one checkbox. Names are the Bahasa labels the frontends show.
AI_PHASE_NAMES = {
	0: "Non-AI",
	1: "Ditandai AI",
	2: "Prompt Draf",
	3: "Prompt Terkonfirmasi",
}


def can_use_ai(user=None):
	"""Whether `user` may tag a todo as AI work. Granted by the "AI User" role
	(assignable from the user form in both frontends); System Manager always may."""
	roles = frappe.get_roles(user or frappe.session.user)
	return "AI User" in roles or "System Manager" in roles


def ai_phase(work_mode, has_prompt, confirmed):
	"""Derive the AI phase (0-3) from the three inputs. Pure — the single source of
	truth for the ladder, used by both the list shape and the phase queues.

	0 not tagged AI / 1 tagged, awaiting a generated prompt / 2 prompt written but not
	yet confirmed by a human / 3 confirmed, an AI agent may pick it up."""
	if work_mode not in AI_WORK_MODES:
		return 0
	if not has_prompt:
		return 1
	return 3 if confirmed else 2


def _can_touch_prompt(todo, project):
	"""Who may write/confirm the prompt: System Manager, the project owner or leader,
	or the assignee (they confirm the generated prompt before an agent runs it)."""
	user = frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return user in (project.project_owner, project.project_leader, todo.assigned_to)


def parse_ai_prompts(raw):
	"""Normalize the stored AI prompts into a clean list. Safe on None / malformed
	JSON / legacy plain-string values. Each item is {"name": str, "prompt": str};
	rows with an empty prompt are dropped. Accepts a JSON string, a list, or a
	legacy single-prompt plain string (-> one unnamed item)."""
	if not raw:
		return []
	data = raw
	if isinstance(raw, str):
		try:
			data = json.loads(raw)
		except (ValueError, TypeError):
			# Legacy: a single plain-text prompt saved before the list existed.
			txt = raw.strip()
			return [{"name": "", "prompt": txt}] if txt else []
	if not isinstance(data, list):
		return []
	out = []
	for it in data:
		if not isinstance(it, dict):
			continue
		prompt = str(it.get("prompt") or "").strip()
		if not prompt:
			continue
		out.append({"name": str(it.get("name") or "").strip(), "prompt": prompt})
	return out


@frappe.whitelist()
def save_ai_prompt(todo_id, ai_prompt, return_prompts=1):
	"""Save the AI prompts (JSON list) for a project todo. Leader/owner action only
	(System Manager, project_owner, project_leader) — assignees can't set it.

	``return_prompts=0`` skips echoing the ~20 KB prompt set back and returns
	{status, message, count, names} instead — storage, validation and permissions
	are identical either way. Comes in as a string over the whitelisted HTTP path,
	so it's coerced with cint()."""
	return_prompts = cint(return_prompts)
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		if not _can_touch_prompt(todo, project):
			return {
				"status": "error",
				"message": f"Hanya Project Leader ({project.project_leader}), Project Owner ({project.project_owner}) atau yang ditugaskan ({todo.assigned_to}) yang boleh mengubah prompt.",
			}

		clean = parse_ai_prompts(ai_prompt)
		todo.ai_prompt = json.dumps(clean) if clean else None
		# Editing the text drops it back to phase 2: an agent must never run a prompt
		# no human has signed off in its current wording.
		todo.ai_prompt_confirmed = 0
		todo.save(ignore_permissions=True)
		if not return_prompts:
			return {
				"status": "ok",
				"message": "Prompt berhasil disimpan.",
				"count": len(clean),
				"names": [p["name"] for p in clean],
			}
		return {
			"status": "ok",
			"message": "Prompt berhasil disimpan.",
			"ai_prompts": clean,
			"ai_phase": ai_phase(todo.work_mode, bool(clean), 0),
		}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def delete_ai_prompt(todo_id, name=None):
	"""Delete AI prompt(s) from a project todo. Same leader/owner gate as save_ai_prompt.

	``name`` given -> removes the prompt(s) whose name matches it (returns an error if
	none match). ``name`` omitted/empty -> clears ALL prompts on the todo. Returns the
	remaining prompts."""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		if not _can_touch_prompt(todo, project):
			return {
				"status": "error",
				"message": f"Hanya Project Leader ({project.project_leader}), Project Owner ({project.project_owner}) atau yang ditugaskan ({todo.assigned_to}) yang boleh menghapus prompt.",
			}

		current = parse_ai_prompts(todo.ai_prompt)
		if name:
			remaining = [p for p in current if p["name"] != name]
			if len(remaining) == len(current):
				return {"status": "error", "message": f"Prompt bernama {name!r} tidak ditemukan."}
		else:
			remaining = []

		todo.ai_prompt = json.dumps(remaining) if remaining else None
		todo.ai_prompt_confirmed = 0  # same reason as save_ai_prompt: re-confirm after any edit
		todo.save(ignore_permissions=True)
		return {
			"status": "ok",
			"message": "Prompt berhasil dihapus.",
			"ai_prompts": remaining,
			"ai_phase": ai_phase(todo.work_mode, bool(remaining), 0),
		}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def confirm_ai_prompt(todo_id, confirmed=1):
	"""Phase 2 -> 3: a human signs off the generated prompt so an AI agent may run it.

	Gate is the same as editing the prompt (SM / project owner / leader / assignee).
	Confirming REQUIRES at least one saved prompt — phase 2 cannot be skipped.
	Pass ``confirmed=0`` to pull it back to phase 2."""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		if not _can_touch_prompt(todo, project):
			return {
				"status": "error",
				"message": f"Hanya Project Leader ({project.project_leader}), Project Owner ({project.project_owner}) atau yang ditugaskan ({todo.assigned_to}) yang boleh konfirmasi prompt.",
			}

		want = 1 if str(confirmed) in ("1", "true", "True") else 0
		prompts = parse_ai_prompts(todo.ai_prompt)
		if want and todo.work_mode not in AI_WORK_MODES:
			return {"status": "error", "message": "Todo ini belum ditandai kerja AI."}
		if want and not prompts:
			return {"status": "error", "message": "Belum ada prompt untuk dikonfirmasi (Fase 2 belum selesai)."}

		todo.ai_prompt_confirmed = want
		todo.save(ignore_permissions=True)
		phase = ai_phase(todo.work_mode, bool(prompts), want)
		return {
			"status": "ok",
			"message": "Prompt dikonfirmasi. AI Agent siap mengerjakan." if want else "Konfirmasi dibatalkan.",
			"ai_prompt_confirmed": want,
			"ai_phase": phase,
			"ai_phase_name": AI_PHASE_NAMES[phase],
		}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def get_confirmed_ai_todos(lean=0):
	"""Phase 3 queue: Planned AI todos assigned to the caller whose prompt a human has
	confirmed, i.e. the work an AI agent may pick up right now.

	The mirror of ``get_ai_todos_needing_prompt`` (phase 1). By default it carries the
	prompts so the agent needs no second round-trip. When the agent finishes it should
	raise its own "Ask other to check" todo — nothing here does that for it.

	``lean=1`` (152j8iaa6j) returns the SAME todos, filtered, ordered and permitted
	identically, with the prompt bodies replaced by ``ai_prompts_count`` and a handful
	of naming fields added — the shape a caller needs to CHOOSE a todo, before fetching
	the one it picked with ``get_ai_todo_context``. On a real board that is 215 KB down
	to about 5 KB, and this endpoint is polled on a loop.

	The lean fields are a different projection, not a subset: project_name,
	project_detail_title, ai_phase, group and level_type are added. The two titles come
	from ``_batch_field_map`` — one query per doctype however many todos there are,
	never one per todo.

	Comes in as a string over the whitelisted HTTP path, so ``lean`` is coerced with
	cint(): "0" must read as falsy, not as a truthy non-empty string.
	"""
	user = frappe.session.user
	rows = frappe.get_all(
		"Project Todo",
		filters={
			"assigned_to": user,
			"work_mode": ["in", list(AI_WORK_MODES)],
			"status": "⚪️ Planned",
			"ai_prompt_confirmed": 1,
		},
		# group/level_type are selected always (two more columns on one query) but
		# emitted only when lean — the default response must not change shape.
		fields=[
			"name", "to_do", "project", "project_detail", "status", "work_mode", "deadline",
			"ai_prompt", "group", "level_type",
		],
		order_by="deadline asc",
	)
	kept = []
	for r in rows:
		prompts = parse_ai_prompts(r.ai_prompt)
		if not prompts:
			continue  # confirmed but emptied out of band — not runnable
		kept.append((r, prompts))

	if not cint(lean):
		return [
			{k: r[k] for k in _AI_QUEUE_BASE_FIELDS} | {"ai_prompts": prompts}
			for r, prompts in kept
		]

	projects = _batch_field_map("Project", [r.project for r, _ in kept], ["project_name"])
	details = _batch_field_map("Project Detail", [r.project_detail for r, _ in kept], ["title"])
	return [
		{k: r[k] for k in _AI_QUEUE_BASE_FIELDS}
		| {
			"project_name": (projects.get(r.project) or {}).get("project_name"),
			"project_detail_title": (details.get(r.project_detail) or {}).get("title"),
			"group": r.get("group"),
			"level_type": r.get("level_type"),
			# Every row here is confirmed and has a prompt by the filter above, so this
			# is 3 — derived rather than hardcoded so it follows if the filter changes.
			"ai_phase": ai_phase(r.work_mode, True, True),
			"ai_prompts_count": len(prompts),
		}
		for r, prompts in kept
	]


_AI_QUEUE_BASE_FIELDS = ("name", "to_do", "project", "project_detail", "status", "work_mode", "deadline")
_AI_QUEUE_CONTEXT_COLUMNS = ("notes", "level_type", "group", "estimated", "owner", "is_follow_up", "issue_of")
_AI_QUEUE_LIMIT_MAX = 200


def _shape_ai_queue_row(r):
	"""The compact shape get_ai_todos_needing_prompt has always returned. Kept as
	one helper so the context-adding pass (below) and any future caller build on
	the exact same base instead of two copies drifting apart."""
	return {k: r[k] for k in _AI_QUEUE_BASE_FIELDS}


def _batch_field_map(doctype, ids, fields):
	"""{id: {field: value, ...}} for the given ids, in ONE query. Empty/falsy
	`ids` skips the query entirely rather than issuing a pointless `IN ()`.
	Shared by every AI-context endpoint so a new lookup is one call here
	instead of a hand-rolled frappe.get_all at each call site."""
	ids = [i for i in ids if i]
	if not ids:
		return {}
	return {
		r.name: r
		for r in frappe.get_all(doctype, filters={"name": ["in", ids]}, fields=["name", *fields])
	}


def _batch_dependency_rows(todo_names):
	"""Raw {parent, parentfield, todo} rows from Project Todo Dependency for the
	given todos, both directions, in ONE query. Callers group/shape as they need —
	the AI queue only wants bare ids, get_ai_todo_context wants {name, to_do}."""
	todo_names = [n for n in todo_names if n]
	if not todo_names:
		return []
	return frappe.get_all(
		"Project Todo Dependency",
		filters={"parent": ["in", todo_names], "parentfield": ["in", ["blocked_by", "blocking"]]},
		fields=["parent", "parentfield", "todo"],
	)


def _attach_ai_queue_context(todos, rows):
	"""Mutates `todos` in place, adding the include_context=1 fields. Batched:
	fixed number of queries no matter how many rows are in play (A4) — one for
	Project Detail titles, one for issue-of titles, one for blocked_by/blocking."""
	detail_titles = _batch_field_map("Project Detail", (r.project_detail for r in rows), ["title"])
	issue_titles = _batch_field_map("Project Todo", (r.issue_of for r in rows), ["to_do"])

	blocked_by_map = {}
	blocking_map = {}
	for d in _batch_dependency_rows(r.name for r in rows):
		target = blocked_by_map if d.parentfield == "blocked_by" else blocking_map
		target.setdefault(d.parent, []).append(d.todo)

	for r, t in zip(rows, todos):
		t["notes"] = r.notes
		t["project_detail_title"] = (detail_titles.get(r.project_detail) or {}).get("title")
		t["level_type"] = r.level_type
		t["group"] = r.group
		t["estimated"] = r.estimated
		t["creator"] = r.owner
		t["is_follow_up"] = bool(r.is_follow_up)
		t["issue_of"] = r.issue_of
		t["issue_of_title"] = (issue_titles.get(r.issue_of) or {}).get("to_do") if r.issue_of else None
		t["blocked_by"] = blocked_by_map.get(r.name, [])
		t["blocking"] = blocking_map.get(r.name, [])


@frappe.whitelist()
def get_ai_todos_needing_prompt(envelope=0, include_context=0, limit=None):
	"""Planned AI todos assigned to the caller that still need an AI prompt written.

	Filters: ``work_mode`` in (AI, Both), ``assigned_to`` == current user, ``status`` ==
	⚪️ Planned (not yet started — excludes Done, Checked By PL, Completed, Cancelled),
	and no AI prompt saved yet (ai_prompt empty once normalized — covers NULL, "", "[]",
	and rows whose prompts are all blank).

	Returns a compact list ordered by deadline (soonest first), so a caller deciding
	which todo to apply a prompt to doesn't have to fetch and scan every todo:
	[{name, to_do, project, project_detail, status, work_mode, deadline}].

	``envelope=1`` wraps the list as {ok, count, server_time, user, todos} — an empty
	queue then reads as count:0 instead of a blank body a caller can't tell apart from
	a broken call.

	``include_context=1`` adds, per row: notes, project_detail_title, level_type, group,
	estimated, creator, is_follow_up, issue_of, issue_of_title, blocked_by, blocking —
	enough that a caller no longer needs a get_project_item round-trip per todo just to
	read the notes.

	``limit`` caps the number of rows returned (hard max 200).

	Args arrive as strings over the whitelisted HTTP path, so every flag is coerced
	with cint() — "0" must behave as falsy, not as a truthy non-empty string."""
	envelope = cint(envelope)
	include_context = cint(include_context)
	lim = cint(limit) if limit not in (None, "") else None
	if lim is not None:
		lim = max(0, min(lim, _AI_QUEUE_LIMIT_MAX))

	user = frappe.session.user
	fields = list(_AI_QUEUE_BASE_FIELDS) + ["ai_prompt"]
	if include_context:
		fields += list(_AI_QUEUE_CONTEXT_COLUMNS)
	cand = frappe.get_all(
		"Project Todo",
		filters={
			"assigned_to": user,
			"work_mode": ["in", list(AI_WORK_MODES)],
			"status": "⚪️ Planned",
		},
		fields=fields,
		order_by="deadline asc",
	)
	rows = [r for r in cand if not parse_ai_prompts(r.ai_prompt)]
	if lim is not None:
		rows = rows[:lim]

	todos = [_shape_ai_queue_row(r) for r in rows]
	if include_context:
		_attach_ai_queue_context(todos, rows)

	if envelope:
		return {
			"ok": True,
			"count": len(todos),
			"server_time": frappe.utils.now(),
			"user": user,
			"todos": todos,
		}
	return todos


@frappe.whitelist()
def get_ai_todo_context(todo_id):
	"""Lean replacement for get_project_item when an agent is writing an AI prompt.

	get_project_item returns ~80,000 characters for a todo whose actually-useful
	content is under 2,000 — the rest is 100+ sibling detail_todos, team avatar
	configs, timeline and allocations the agent never reads, plus the full text of
	every saved ai_prompt (which this never returns — ``ai_prompts_count`` is an
	int, never the prompt bodies).

	Same read gate as get_project_item: ``frappe.has_permission("Project Todo",
	"read", ...)`` — not a second copy, so the two never drift apart. Existence is
	checked first so an unknown id raises DoesNotExistError rather than being
	reported as a permission refusal.

	Batched throughout (see _batch_field_map / _batch_dependency_rows, shared with
	get_ai_todos_needing_prompt's include_context) — a todo with many blocked_by/
	blocking links or a project with many sibling details costs the same handful
	of queries as one with none."""
	if not frappe.db.exists("Project Todo", todo_id):
		frappe.throw("Not found", frappe.DoesNotExistError)
	if not frappe.has_permission("Project Todo", "read", doc=todo_id):
		frappe.throw("Not permitted", frappe.PermissionError)

	todo = frappe.db.get_value(
		"Project Todo",
		todo_id,
		[
			"name", "to_do", "status", "work_mode", "ai_prompt", "ai_prompt_confirmed",
			"deadline", "estimated", "group", "level_type", "owner", "assigned_to",
			"project", "project_detail", "notes", "is_follow_up", "issue_of",
		],
		as_dict=True,
	)

	project = frappe.db.get_value("Project", todo.project, ["project_name", "brand"], as_dict=True) or {}
	detail_titles = _batch_field_map("Project Detail", [todo.project_detail], ["title"])
	siblings = frappe.get_all(
		"Project Detail",
		filters={"project": todo.project, "name": ["!=", todo.project_detail]},
		pluck="title",
	)

	issue = _batch_field_map("Project Todo", [todo.issue_of], ["to_do", "notes"]) if todo.issue_of else {}
	issue_row = issue.get(todo.issue_of) or {}

	dep_rows = _batch_dependency_rows([todo.name])
	dep_todo_titles = _batch_field_map("Project Todo", (d.todo for d in dep_rows), ["to_do"])
	blocked_by, blocking = [], []
	for d in dep_rows:
		title = (dep_todo_titles.get(d.todo) or {}).get("to_do")
		entry = {"name": d.todo, "to_do": title}
		(blocked_by if d.parentfield == "blocked_by" else blocking).append(entry)

	prompts_count = len(parse_ai_prompts(todo.ai_prompt))

	return {
		"name": todo.name,
		"to_do": todo.to_do,
		"status": todo.status,
		"work_mode": todo.work_mode,
		"ai_phase": ai_phase(todo.work_mode, bool(prompts_count), todo.ai_prompt_confirmed),
		"ai_prompts_count": prompts_count,
		"deadline": todo.deadline,
		"estimated": todo.estimated,
		"group": todo.group,
		"level_type": todo.level_type,
		"creator": todo.owner,
		"assigned_to": todo.assigned_to,
		"project": todo.project,
		"project_name": project.get("project_name"),
		"brand": project.get("brand"),
		"project_detail": todo.project_detail,
		"project_detail_title": (detail_titles.get(todo.project_detail) or {}).get("title"),
		"notes": todo.notes,
		"is_follow_up": bool(todo.is_follow_up),
		"issue_of": todo.issue_of,
		"issue_of_title": issue_row.get("to_do") if todo.issue_of else None,
		"issue_of_notes": issue_row.get("notes") if todo.issue_of else None,
		"blocked_by": blocked_by,
		"blocking": blocking,
		"sibling_detail_titles": sorted({t for t in siblings if t}),
	}


@frappe.whitelist()
def get_ai_project_context(project):
	"""Lean replacement for get_project when an agent is writing an AI prompt.

	No team roster, no todo rollups, no counts — just the project's own
	descriptive fields plus its groupings and sub-module titles.

	Same read gate as get_project: the project must be in ``_visible_projects()``
	(reused, not re-implemented). Existence is checked first so an unknown name
	raises DoesNotExistError rather than a bare permission refusal."""
	if not frappe.db.exists("Project", project):
		frappe.throw("Not found", frappe.DoesNotExistError)
	from vernon_project.api.mobile import _visible_projects

	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	doc = frappe.db.get_value(
		"Project",
		project,
		["name", "project_name", "brand", "goal", "context", "success_condition", "failure_condition"],
		as_dict=True,
	)
	groupings = frappe.get_all("Glossary", filters={"project": project}, pluck="glossary")
	project_details = frappe.get_all("Project Detail", filters={"project": project}, fields=["name", "title"])

	return {
		"name": doc.name,
		"project_name": doc.project_name,
		"brand": doc.brand,
		"goal": doc.goal,
		"context": doc.context,
		"success_condition": doc.success_condition,
		"failure_condition": doc.failure_condition,
		"groupings": groupings,
		"project_details": project_details,
	}


def _parse_checklist(raw):
	"""Normalize the stored checklist JSON into a clean list. Safe on None /
	malformed JSON -> []. Each item is {"t": str, "d": bool}; empty-text rows
	are dropped. Accepts either a JSON string (from the DB / client) or a list."""
	if not raw:
		return []
	try:
		data = json.loads(raw) if isinstance(raw, str) else raw
	except (ValueError, TypeError):
		return []
	if not isinstance(data, list):
		return []
	out = []
	for it in data:
		if not isinstance(it, dict):
			continue
		t = str(it.get("t") or "").strip()
		if not t:
			continue
		out.append({"t": t, "d": bool(it.get("d"))})
	return out


@frappe.whitelist()
def save_checklist(todo_id, checklist):
	"""Save the checklist for a project todo. Gate mirrors the detail screen's
	`can_edit_notes`: assignee, project owner/leader, project admins, or System
	Manager. `checklist` is a JSON string from the client; it is re-validated
	and re-serialized server-side."""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		allowed = (
			user in (todo.assigned_to, project.project_owner, project.project_leader, todo.owner)
			or user in get_project_admins(project)
			or "System Manager" in frappe.get_roles(user)
		)
		if not allowed:
			return {"status": "error", "message": "Anda tidak punya izin mengubah checklist ini."}

		clean = _parse_checklist(checklist)
		todo.checklist = json.dumps(clean, ensure_ascii=False)
		todo.save(ignore_permissions=True)
		return {"status": "ok", "message": "Checklist tersimpan.", "checklist": clean}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


# --------------------------------------------------------------------------------
# File attachments — a Project Todo can hold multiple uploaded files, stored as
# native private Frappe File docs (attached_to the todo). Kept private so
# arbitrary file types are never served publicly. Upload/delete are gated to the
# same people who may edit the todo (mirrors save_notes): assignee, project
# owner, project leader, or System Manager. Frappe cascades File deletion when
# the todo is deleted, so nothing extra is needed on trash.
# --------------------------------------------------------------------------------

MAX_TODO_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
_FILE_FIELDS = ["name", "file_name", "file_url", "file_size", "is_private", "owner", "creation"]


def _assert_can_edit_todo(todo_id):
	"""Gate mirroring save_notes. Returns nothing; raises PermissionError if the
	current user is not the assignee, project owner, project leader, or a System
	Manager."""
	todo = frappe.get_doc("Project Todo", todo_id)
	detail = frappe.get_doc("Project Detail", todo.project_detail)
	project = frappe.get_doc("Project", detail.project)
	user = frappe.session.user
	allowed = {todo.assigned_to, project.project_owner, project.project_leader}
	if user not in allowed and "System Manager" not in frappe.get_roles(user):
		frappe.throw(
			"You are not allowed to change files on this todo.",
			frappe.PermissionError,
		)
	# 52r6l30cs4: a done todo's information is frozen except comments, and its files
	# are part of that. Files live in their own doctype, so the todo's validate()
	# never sees them: gate here, where every upload/delete goes.
	if todo.status != "⚪️ Planned":
		frappe.throw("Files can't be changed: this todo is already marked done. Only comments can still be added.")


# Not whitelisted: files reach both frontends inside get_project_item.
def list_todo_files(todo_id):
	"""Files attached to a Project Todo, oldest first. A user who can open the
	todo can list its files; downloading a private file is separately enforced by
	Frappe via attached_to permissions."""
	frappe.get_doc("Project Todo", todo_id)  # 404 if the todo is gone
	if not frappe.has_permission("Project Todo", "read", doc=todo_id):
		frappe.throw("You are not allowed to read this todo.", frappe.PermissionError)
	return frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Project Todo", "attached_to_name": todo_id},
		fields=_FILE_FIELDS,
		order_by="creation asc",
	)


def _attach_file_to_todo(todo_id, filename, content):
	"""Core attach: gate, size-check, save a private File linked to the todo, and
	return its row. Split from the request handler so it is unit-testable without
	a multipart request. save_file bypasses File-level permissions internally, so
	the gate above is the real access control."""
	_assert_can_edit_todo(todo_id)
	if not filename:
		frappe.throw("Missing file name.")
	if len(content) > MAX_TODO_FILE_BYTES:
		frappe.throw("File too large (max 25 MB).")
	from frappe.utils.file_manager import save_file

	f = save_file(filename, content, "Project Todo", todo_id, is_private=1)
	return {k: f.get(k) for k in _FILE_FIELDS}


@frappe.whitelist()
def upload_todo_file(todo_id):
	"""Attach an uploaded file (multipart `file`) to a Project Todo. Edit-gated;
	stored private. Returns the saved file row."""
	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")
	row = _attach_file_to_todo(todo_id, f.filename, f.stream.read())
	frappe.db.commit()
	return row


@frappe.whitelist()
def delete_todo_file(todo_id, file_name):
	"""Detach + delete a File from a Project Todo. Edit-gated. Verifies the File
	is actually attached to THIS todo first, so a caller cannot delete an
	unrelated File by name."""
	_assert_can_edit_todo(todo_id)
	ref = frappe.db.get_value(
		"File", file_name, ["attached_to_doctype", "attached_to_name"], as_dict=True
	)
	if not ref or ref.attached_to_doctype != "Project Todo" or ref.attached_to_name != todo_id:
		frappe.throw("File is not attached to this todo.")
	frappe.delete_doc("File", file_name, ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def download_todo_file(todo_id, file_name):
	"""Stream a todo's private attachment through this API path instead of the raw
	/private/files/<name> link. Cloudflare runs a site-wide strip-.html redirect
	that rewrites /private/files/*.html → /private/files/* (path mangled), so
	Frappe can't resolve the file and returns 403. Here the extension rides in the
	query string, which Cloudflare leaves alone. Gated on todo read (same audience
	as list_todo_files) and verifies the File really belongs to THIS todo so a
	caller can't pull an unrelated file by name."""
	if not frappe.has_permission("Project Todo", "read", doc=todo_id):
		frappe.throw("You are not allowed to read this todo.", frappe.PermissionError)
	ref = frappe.db.get_value(
		"File", file_name, ["attached_to_doctype", "attached_to_name"], as_dict=True
	)
	if not ref or ref.attached_to_doctype != "Project Todo" or ref.attached_to_name != todo_id:
		frappe.throw("File is not attached to this todo.")
	f = frappe.get_doc("File", file_name)
	frappe.local.response.filename = f.file_name
	frappe.local.response.filecontent = f.get_content()
	frappe.local.response.type = "download"


# Default scoring for a check task: Engineering ▸ Backend Development ▸ Testing (100%).
# The client pre-fills these but the fields are editable, so callers may override.
CHECK_DEFAULT_GROUP = "Engineering"
CHECK_DEFAULT_LEVEL_ID = "eng_be_testing"
CHECK_DEFAULT_ESTIMATED = 10
# Project Todo.to_do is a Data field — Frappe's default DB column length, 140.
# No shared constant existed anywhere in the app; this is now the one place a
# generated title is bounded before insert.
TO_DO_MAX_LENGTH = 140
# Short title marker for a follow-up check todo. `is_follow_up` (not this text) is
# the source of truth for the tag/chip/filter — see validate_follow_up_immutable
# on the doctype. Keep this ≤3 chars: it eats into the 140-char budget below.
FOLLOW_UP_MARKER = "↩ "


def _open_follow_up(source, assignee):
	"""The still-open follow-up (not Completed/Cancelled) of `source` for `assignee`, or None.

	A LOCKING read on purpose: under REPEATABLE READ a plain SELECT answers from this
	transaction's first-read snapshot, so a call that read anything before another session
	committed its follow-up would miss it and insert a twin. Walks the source's own
	`blocking` mirror rows (indexed by parent) — Dependency.todo has no index, so starting
	from it would lock the whole table."""
	rows = frappe.db.sql(
		"""SELECT t.name FROM `tabProject Todo Dependency` d
		JOIN `tabProject Todo` t ON t.name = d.todo
		WHERE d.parent = %s AND d.parenttype = 'Project Todo' AND d.parentfield = 'blocking'
		  AND t.is_follow_up = 1 AND t.assigned_to = %s
		  AND t.status NOT IN ('✅ Completed', '🚫 Cancelled')
		ORDER BY t.creation LIMIT 1 FOR UPDATE""",
		(source, assignee),
	)
	return rows[0][0] if rows else None


@frappe.whitelist()
def follow_up_check(todo_id, assignee, note=None, estimated=None, group=None, level_id=None, deadline=None):
	"""Quick hand-off: spawn a linked follow-up todo for ANOTHER person to check
	this one, then mark the current todo Done for its own assignee.

	The follow-up is tagged `is_follow_up=1` (immutable — see validate_follow_up_immutable
	on the doctype) and blocked_by this one (provenance — it clears at once since we mark
	the source Done). estimate + group/level come from the client
	(defaulting to 10 min and the Testing work-type); the controller derives level name
	and points from level_id. Unlike a plain create, the new assignee is NOTIFIED here:
	the Project Todo controller only fires notifications on STATUS transitions, never on
	first assignment, so the checker would otherwise never hear about the task.
	"""
	from vernon_project.api.mobile import _notify

	todo = frappe.get_doc("Project Todo", todo_id)
	project_detail = frappe.get_doc("Project Detail", todo.project_detail)
	project = frappe.get_doc("Project", project_detail.project)
	user = frappe.session.user

	# Who may hand off: the source assignee, the project leader/owner, or an admin.
	allowed = [todo.assigned_to, project.project_leader, project.project_owner] + list(
		get_project_admins(project)
	)
	if user not in allowed:
		frappe.throw("You are not allowed to follow up on this todo.", frappe.PermissionError)

	assignee = (assignee or "").strip()
	if not assignee:
		frappe.throw("Pilih orang yang akan mengecek.")

	# One open check per (source, checker). A repeat — two sessions closing the same todo,
	# a retry after a lost response — gets the check already open back: no twin row, no
	# second notification (al31hs5kej). Locking the source serialises concurrent calls.
	source_status = frappe.db.sql(
		"SELECT status FROM `tabProject Todo` WHERE name=%s FOR UPDATE", todo.name
	)[0][0]
	existing = _open_follow_up(todo.name, assignee)
	if existing:
		return {"name": existing, "source_status": source_status, "existing": True}

	# Estimate: client default 10, floored at 5 (validate_estimated_min requires ≥5).
	est = max(frappe.utils.cint(estimated) or CHECK_DEFAULT_ESTIMATED, 5)

	# The check-todo. group + level_id come from the client (defaulting to the Testing
	# work-type); the controller derives level name + points from level_id. blocked_by =
	# source → clears on Done. validate_assigned_to_team_member rejects a non-team assignee.
	# FOLLOW_UP_MARKER goes at the FRONT, not appended: a source title near the 140-char
	# cap used to overflow the column and throw a raw DB error on insert once the suffix
	# was added. Leading marker + truncating the source title into what's left means the
	# row always fits and the marker is never the part that gets cut. Strip an existing
	# marker first so following up on a follow-up doesn't stack it.
	source_title = todo.to_do[len(FOLLOW_UP_MARKER):] if todo.to_do.startswith(FOLLOW_UP_MARKER) else todo.to_do
	title = FOLLOW_UP_MARKER + source_title
	if len(title) > TO_DO_MAX_LENGTH:
		title = FOLLOW_UP_MARKER + source_title[: TO_DO_MAX_LENGTH - len(FOLLOW_UP_MARKER)]
	follow = frappe.get_doc(
		{
			"doctype": "Project Todo",
			"project": todo.project,
			"project_detail": todo.project_detail,
			"to_do": title,
			"is_follow_up": 1,
			"assigned_to": assignee,
			"status": "⚪️ Planned",
			"start_date": frappe.utils.today(),
			"estimated": est,
			"deadline": deadline or frappe.utils.add_days(frappe.utils.today(), 1),
			"group": group or CHECK_DEFAULT_GROUP,
			"level_id": level_id or CHECK_DEFAULT_LEVEL_ID,
			"blocked_by": [{"todo": todo.name}],
			"notes": note or "",
		}
	).insert(ignore_permissions=True)

	# Inserting the follow-up with blocked_by=[source] makes the controller mirror a
	# `blocking` row back onto the source row, so our in-memory `todo` is now stale —
	# reload before mutating or the save trips TimestampMismatchError.
	todo.reload()

	# Mark the source Done for its assignee — only from Planned (the sane hand-off
	# point). Reuses the Planned→Done stamps + self-review auto-advance from update_status.
	if todo.status == "⚪️ Planned":
		todo.status = "🟠 Done"
		todo.developed_at = frappe.utils.now()
		todo.developed_by = user
		todo.to_check = 0  # marking done clears the "To Check" reminder (mirrors update_status)
		_auto_advance(todo, project.project_leader, project.project_owner, project.auto_approve)
		todo.save(ignore_permissions=True)

	actor_name = frappe.db.get_value("User", user, "full_name") or user
	_notify(
		recipient=assignee,
		type="Assignment",
		title="Ada tugas untuk kamu cek",
		body=f"{actor_name} minta kamu cek “{todo.to_do}”.",
		reference_doctype="Project Todo",
		reference_name=follow.name,
		actor=user,
	)
	frappe.db.commit()
	return {"name": follow.name, "source_status": todo.status}


SEARCH_TODOS_DEFAULT_LIMIT = 20
SEARCH_TODOS_MAX_LIMIT = 100


def _like_escape(text):
	"""Escape MySQL LIKE's own wildcards (and its escape char) so a caller's
	literal % / _ never behaves as a wildcard. Backslash must be escaped
	FIRST, or escaping % first would double-escape the backslash it adds."""
	return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@frappe.whitelist()
def search_todos(
	query, project=None, project_detail=None, status=None, work_mode=None,
	assigned_to=None, include_done=0, limit=20, offset=0,
):
	"""Find Project Todo rows by exact document id or by a title search — the
	MCP "search / get todo by name" skill (dja50oqf2p). `query` is matched two
	ways: an exact `name` (Frappe's 10-char doc id) is returned first, and a
	case-insensitive substring match against `to_do` (the human title) fills
	the rest — `%`/`_` in `query` are escaped so they match literally, never
	as SQL wildcards.

	Rows are the LIGHT shape `get_ai_todos_needing_prompt` already returns —
	{name, to_do, project, project_detail, status, work_mode, deadline} plus
	project_name/project_detail_title/assigned_to — never the ~80KB
	get_project_item payload (detail_todos, team, notes are never in here).
	Each row also carries `web_url`/`mobile_url` — the todo's `/w` and `/m`
	deep link (`isTodoPath`'s `/project-item/<name>` route) — so an MCP
	caller can hand the user a clickable link straight to it.

	Visibility is `_visible_projects()` — the same rule every other endpoint
	in this app uses (assigned to the caller, or they own/lead/admin/team-
	member the project) — applied to BOTH the exact-id path and the search
	path via the same WHERE clause, so there's one gate, not two. A real id
	in a project the caller can't see comes back as an empty result, never
	the row (not `PermissionError`: `get_project_item`'s equivalent path
	throws for a DIRECT single-item fetch, but this is a multi-row search
	where "you can't see that one" is a normal empty page, not an error).

	`limit` defaults to 20 and is clamped to SEARCH_TODOS_MAX_LIMIT (100)
	server-side regardless of what's requested — this is reachable from an
	MCP client, so nothing here trusts the caller to behave. `include_done=0`
	(the default) drops Done/Checked By PL/Completed/Cancelled; pass 1 to see
	everything. Returns {"total": <count before limit>, "rows": [...]}."""
	from vernon_project.api.mobile import (
		STATUS_CANCELLED,
		STATUS_CHECKED,
		STATUS_COMPLETED,
		STATUS_DONE,
		_visible_projects,
	)

	query = (query or "").strip()
	if len(query) < 2:
		frappe.throw("Search text must be at least 2 characters.", frappe.ValidationError)

	limit = frappe.utils.cint(limit) or SEARCH_TODOS_DEFAULT_LIMIT
	if limit < 0:
		frappe.throw("limit must be zero or a positive integer", frappe.ValidationError)
	limit = min(limit, SEARCH_TODOS_MAX_LIMIT)
	offset = frappe.utils.cint(offset)
	if offset < 0:
		frappe.throw("offset must be zero or a positive integer", frappe.ValidationError)

	projects = _visible_projects()
	if not projects:
		return {"total": 0, "rows": []}

	cond = ""
	params = {
		"projects": tuple(projects),
		"exact": query,
		"exact_lower": query.lower(),
		"sub_pat": f"%{_like_escape(query)}%",
		"prefix_pat": f"{_like_escape(query)}%",
	}
	if project:
		cond += " AND pd.project = %(project)s"
		params["project"] = project
	if project_detail:
		cond += " AND t.project_detail = %(project_detail)s"
		params["project_detail"] = project_detail
	if status:
		cond += " AND t.status = %(status)s"
		params["status"] = status
	if work_mode:
		cond += " AND t.work_mode = %(work_mode)s"
		params["work_mode"] = work_mode
	if assigned_to:
		# Identity narrows, never widens: this ANDs onto the visibility
		# filter already in the WHERE clause below, so a caller can only ever
		# use it to narrow their OWN visible set, not see someone else's rows.
		cond += " AND t.assigned_to = %(assigned_to)s"
		params["assigned_to"] = assigned_to
	if not frappe.utils.cint(include_done):
		cond += " AND t.status NOT IN %(done_statuses)s"
		params["done_statuses"] = (STATUS_DONE, STATUS_CHECKED, STATUS_COMPLETED, STATUS_CANCELLED)

	where = f"""
		FROM `tabProject Todo` t
		JOIN `tabProject Detail` pd ON t.project_detail = pd.name
		JOIN `tabProject` p ON pd.project = p.name
		WHERE pd.project IN %(projects)s {cond}
		AND (t.name = %(exact)s OR LOWER(t.to_do) LIKE LOWER(%(sub_pat)s) ESCAPE '\\\\')
	"""

	total = frappe.db.sql(f"SELECT COUNT(*) {where}", params)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT
			t.name, t.to_do, t.status, t.work_mode, t.deadline, t.assigned_to,
			pd.name AS project_detail, pd.title AS project_detail_title, pd.project,
			p.project_name
		{where}
		ORDER BY
			(t.name = %(exact)s) DESC,
			(LOWER(t.to_do) = %(exact_lower)s) DESC,
			(LOWER(t.to_do) LIKE LOWER(%(prefix_pat)s) ESCAPE '\\\\') DESC,
			(t.deadline IS NULL) ASC,
			t.deadline ASC,
			t.modified DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params | {"limit": limit, "offset": offset},
		as_dict=True,
	)
	site_url = frappe.utils.get_url().rstrip("/")
	for r in rows:
		r["deadline"] = str(r["deadline"]) if r["deadline"] else None
		r["web_url"] = f"{site_url}/w/project-item/{r['name']}"
		r["mobile_url"] = f"{site_url}/m/project-item/{r['name']}"
	return {"total": total, "rows": rows}


# --- stalled recurring series ----------------------------------------------------
# A series stops generating when its assignee is disabled or leaves the project
# team (see project_todo.series_assignee_problem). Offboarding makes that the
# normal outcome, because _transfer_open_todos preserves history by skipping
# TERMINAL_STATUSES and a healthy routine's latest occurrence is ✅ Completed.
# These two endpoints are the lead's way to see and fix it.


def _lead_projects(user=None):
	"""Projects this caller leads or owns — who may see and fix a stalled series.

	Leader-then-owner is the same responsibility order user_offboarding._resolve_target
	uses to rehome a leaver's open tasks, so routines surface to the same desk.
	Project Admins are deliberately NOT included: they can already be granted
	broadly, and this action changes who does recurring work indefinitely.
	"""
	user = user or frappe.session.user
	return set(
		frappe.get_all("Project", filters={"project_leader": user}, pluck="name")
	) | set(frappe.get_all("Project", filters={"project_owner": user}, pluck="name"))


@frappe.whitelist()
def stalled_series():
	"""Recurring series on the caller's projects that have stopped generating.

	Reads the SAME series_assignee_problem the scheduler acts on rather than
	re-deriving "is it stuck?", so this screen and the nightly run can never
	disagree — the divergence risk this app's approval-ladder audit called out.
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	from vernon_project.vernon_project.doctype.project_todo.project_todo import (
		ASSIGNEE_DISABLED, latest_occurrence, series_assignee_problem, series_stand_in,
	)

	projects = _lead_projects()
	if not projects:
		return {"rows": []}
	details = frappe.get_all(
		"Project Detail", filters={"project": ["in", list(projects)]}, pluck="name"
	)
	if not details:
		return {"rows": []}
	roots = frappe.db.sql(
		"""SELECT DISTINCT COALESCE(NULLIF(original_todo,''), name) AS root
		   FROM `tabProject Todo`
		   WHERE is_recurring = 1 AND recurring_frequency IS NOT NULL
		     AND recurring_frequency != '' AND project_detail IN %(d)s""",
		{"d": tuple(details)}, as_dict=True,
	)
	# One team lookup per project, reused by every row on it: the picker needs
	# the same set validate_assigned_to_team_member will enforce on save, so a
	# lead can never pick someone the reassign would then refuse.
	team_cache = {}

	def candidates(project):
		if project not in team_cache:
			members = frappe.get_all(
				"Project Team", filters={"parent": project, "parenttype": "Project"}, pluck="user"
			)
			team_cache[project] = [
				{"user": u["name"], "full_name": u["full_name"] or u["name"]}
				for u in frappe.get_all(
					"User", filters={"name": ["in", members or [""]], "enabled": 1},
					fields=["name", "full_name"], order_by="full_name asc",
				)
			] if members else []
		return team_cache[project]

	rows = []
	for r in roots:
		anchor = latest_occurrence(r.root)
		if not anchor:
			continue
		problem = series_assignee_problem(anchor)
		if not problem:
			continue
		project = frappe.get_value("Project Detail", anchor.project_detail, "project")
		rows.append({
			"series": r.root,
			"latest": anchor.name,
			"to_do": anchor.to_do,
			"frequency": anchor.recurring_frequency,
			"last_deadline": str(anchor.deadline) if anchor.deadline else None,
			"assigned_to": anchor.assigned_to,
			"assigned_to_name": frappe.db.get_value("User", anchor.assigned_to, "full_name")
				or anchor.assigned_to,
			"reason": problem,
			"reason_label": "Akun dinonaktifkan" if problem == ASSIGNEE_DISABLED
				else "Tidak lagi di tim proyek",
			"suggested": series_stand_in(anchor),
			"candidates": candidates(project),
			"paused": cint(frappe.db.get_value("Project Todo", r.root, "recurring_paused")),
		})
	rows.sort(key=lambda x: (x["last_deadline"] or "", x["to_do"]))
	return {"rows": rows}


@frappe.whitelist(methods=["POST"])
def reassign_series(series, to_user):
	"""Hand a stalled series to someone else and restart it.

	Restarting IS the reassignment: the next occurrence is generated now, on the
	new assignee, and becomes the anchor the series continues from. Nothing else
	has to be stored, and — the point — no finished occurrence is rewritten, so
	who actually did past work (and the Point Ledger rows attributed off it)
	stays true. force=True because the whole reason we are here is that the
	series is overdue.
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	from frappe.utils import nowdate
	from vernon_project.vernon_project.doctype.project_todo.project_todo import (
		latest_occurrence, restart_series_on,
	)

	series = frappe.utils.cstr(series)
	to_user = frappe.utils.cstr(to_user)
	anchor = latest_occurrence(series)
	if not anchor:
		frappe.throw("Series not found", frappe.DoesNotExistError)
	project = frappe.get_value("Project Detail", anchor.project_detail, "project")
	if project not in _lead_projects():
		frappe.throw(
			"Only the project leader or owner can reassign a recurring task.",
			frappe.PermissionError,
		)
	if not cint(frappe.db.get_value("User", to_user, "enabled")):
		frappe.throw("Pick an active user.")
	team = frappe.get_all(
		"Project Team", filters={"parent": project, "parenttype": "Project"}, pluck="user"
	)
	if to_user not in team:
		# The same rule validate_assigned_to_team_member would apply, refused up
		# front with a message that says what to do instead of a validation throw.
		frappe.throw("That person is not on this project's team — add them first.")

	created = None
	if anchor.status not in ("✅ Completed", "🚫 Cancelled"):
		# The latest occurrence is still live work, so handing THAT over is the
		# whole fix — the series is no longer stalled and the nightly run rolls it
		# forward from here as usual. Generating a successor as well would put two
		# copies of the routine on the new assignee.
		frappe.db.set_value("Project Todo", anchor.name, "assigned_to", to_user)
		# Day-plan rows belong to the outgoing assignee (see report.py); left in
		# place they would be misattributed, exactly as _transfer_open_todos warns.
		frappe.db.delete(
			"Project Todo Allocation", {"parent": anchor.name, "parenttype": "Project Todo"}
		)
	else:
		# The anchor is finished, so it keeps its real assignee and the successor
		# carries the change forward. Restarting the series IS the reassignment.
		# Dated today rather than the series' own next rule date: the lead is
		# acting because the routine is already overdue, so it should resume now.
		created = restart_series_on(anchor, to_user, on_date=nowdate())
		if not created:
			frappe.throw("This series already has an occurrence for today.")
	frappe.db.commit()
	return {"ok": True, "series": series, "assigned_to": to_user,
		"next": created.name if created else None}
