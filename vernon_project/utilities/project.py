import frappe

# Recalculate todo count di project
def recalculate_project_detail():
	# Loop each project detail
	project_details = frappe.get_all("Project Detail", fields=["name"])

	for detail in project_details:
		detail_doc = frappe.get_doc("Project Detail", detail.name)
		# --------------------------------------------------------------------------------
		# TODO COUNT
		# --------------------------------------------------------------------------------
		todo_count = len(detail_doc.todo) if detail_doc.todo else 0
		detail_doc.todo_count = todo_count

		# --------------------------------------------------------------------------------	
		# LATEST TODO
		# --------------------------------------------------------------------------------	
		if detail_doc.todo:
			latest_todo = max(
				(todo.deadline for todo in detail_doc.todo if todo.deadline),
				default=None
			)
			detail_doc.latest_todo = latest_todo
		else:
			detail_doc.latest_todo = None

		# --------------------------------------------------------------------------------	
		# Save
		# --------------------------------------------------------------------------------	
		detail_doc.save(ignore_permissions=True)
