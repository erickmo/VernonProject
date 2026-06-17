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

		return {"status": "info", "message": f"Todo {todo.to_do} is updated to {todo.status}."}

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

