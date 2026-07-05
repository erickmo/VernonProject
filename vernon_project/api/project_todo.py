import frappe

@frappe.whitelist()
def get_notes(todo_id):
	"""Fetch notes for a specific Project Todo (accessible by all logged-in users)."""
	notes = frappe.db.get_value('Project Todo', todo_id, 'notes')
	return {'notes': notes or ''}

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

