import frappe

from vernon_project.vernon_project.doctype.project.project import get_project_admins


@frappe.whitelist()
def get_notes(todo_id):
	"""Fetch notes for a specific Project Todo (accessible by all logged-in users)."""
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
		for g in frappe.get_all('Group', fields=['name', 'group_name', 'base_rate_per_minute'])
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
			}
		)
	return out

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
def bulk_update_status(todo_ids):
	"""Advance many Project Todos one step each — bulk approve from the review queue.

	Reuses the per-todo, permission-checked update_status so every item obeys the same
	gates and mints points exactly as a single approve would. Never aborts the batch on
	one failure: collects a per-id result and returns approved/failed counts.
	"""
	import json
	ids = todo_ids if isinstance(todo_ids, (list, tuple)) else json.loads(todo_ids or "[]")
	results = []
	approved = 0
	for tid in ids:
		res = update_status(tid)
		ok = res.get("status") != "error"
		if ok:
			approved += 1
		results.append({"todo_id": tid, "ok": ok, "message": res.get("message")})
	return {"status": "ok", "approved": approved, "failed": len(ids) - approved, "results": results}

@frappe.whitelist()
def bulk_reject_status(todo_ids, reason=None):
	"""Reject many Project Todos with ONE shared reason — bulk reject from the review queue.

	Reuses the per-todo, permission-checked reject_status so every item obeys the same
	gates (owner/leader only, review stages only) and the assignee gets notified. Never
	aborts the batch on one failure: collects a per-id result and returns rejected/failed
	counts. Reason is validated once up front (reject_status re-validates per item anyway).
	"""
	import json
	reason = (reason or "").strip()
	if not reason:
		return {"status": "error", "message": "Alasan penolakan wajib diisi."}
	ids = todo_ids if isinstance(todo_ids, (list, tuple)) else json.loads(todo_ids or "[]")
	results = []
	rejected = 0
	for tid in ids:
		res = reject_status(tid, reason)
		ok = res.get("status") != "error"
		if ok:
			rejected += 1
		results.append({"todo_id": tid, "ok": ok, "message": res.get("message")})
	return {"status": "ok", "rejected": rejected, "failed": len(ids) - rejected, "results": results}

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


@frappe.whitelist()
def get_recently_done(limit=30):
	"""The current user's own recently-completed todos (assignee's Done list),
	newest completed_at first, capped at `limit`. Powers the Home 'Done' tab.

	Scoped to assigned_to == me (not tested_by/completed_by like get_my_approvals —
	this is "what I finished," not "what I approved for someone else") and to the
	final Completed status only (mirrors the completed_today aggregate in
	get_dashboard, which already treats Completed as "done" in the Home UI).
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
	from frappe.utils import pretty_date, get_datetime

	user = frappe.session.user
	rows = _fetch_todos(_visible_projects(), statuses=[STATUS_COMPLETED])
	mine = [r for r in rows if r.get("assigned_to") == user]
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
		shaped["done_at"] = str(r["completed_at"]) if r.get("completed_at") else None
		shaped["done_at_human"] = pretty_date(get_datetime(r["completed_at"])) if r.get("completed_at") else None
		out.append(shaped)

	out.sort(key=lambda t: t["done_at"] or "", reverse=True)
	return out[: int(limit)]


@frappe.whitelist()
def save_notes(todo_id, notes):
	"""
	Save notes for a project todo item.
	Only assigned_to, project_owner, or project_leader can save.
	"""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		allowed = [todo.assigned_to, project.project_owner, project.project_leader]
		allowed += list(get_project_admins(project))

		if user not in allowed:
			return {
				"status": "error",
				"message": f"Anda tidak punya izin mengubah catatan ini. Yang boleh: Assigned To ({todo.assigned_to}), Project Owner ({project.project_owner}), atau Project Leader ({project.project_leader})."
			}

		todo.notes = notes
		todo.save(ignore_permissions=True)
		return {"status": "ok", "message": "Catatan berhasil disimpan."}

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


@frappe.whitelist()
def list_todo_files(todo_id):
	"""Files attached to a Project Todo, oldest first. A user who can open the
	todo can list its files; downloading a private file is separately enforced by
	Frappe via attached_to permissions."""
	frappe.get_doc("Project Todo", todo_id)  # 404 if the todo is gone
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
