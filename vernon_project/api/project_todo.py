import frappe

@frappe.whitelist()
def get_notes(todo_id):
	"""Fetch notes for a specific Project Todo (accessible by all logged-in users)."""
	notes = frappe.db.get_value('Project Todo', todo_id, 'notes')
	return {'notes': notes or ''}

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
		project_admin = project.project_admin

		# Validasi: Project Admin TIDAK boleh update status
		if project_admin and user == project_admin:
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
			if user in [project_leader, project_owner]:
				# Update status to 'Approved'
				todo.status = "🔷 Checked By PL"
				todo.tested_at = frappe.utils.now()
				todo.tested_by = user
			else:
				return {"status": "error", "message": f"You do not have permission to approve this todo {todo.to_do} (Yg bisa hanya Project Owner {project_owner}, Project Leader {project_leader})."}
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
def set_auto_approve(todo_id, enabled):
	"""Toggle a todo's auto_approve flag (skips the Owner review gate on advance).

	Trust boundary: only the Project Owner who also holds the "Partner" role may
	set it, so an owner opts into auto-approving their own project's todos.
	"""
	try:
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		if not (user == project.project_owner and "Partner" in frappe.get_roles(user)):
			return {"status": "error", "message": "Hanya Project Owner dengan role Partner yang bisa mengatur auto-approve."}

		value = frappe.utils.cint(enabled)
		todo.auto_approve = value
		todo.save(ignore_permissions=True)
		return {"status": "info", "auto_approve": value}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} does not exist."}
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
		project_admin = project.project_admin

		# Project Admin cannot change status (mirrors update_status).
		if project_admin and user == project_admin:
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

