import frappe

ROLE = "AI User"


def execute():
	"""Create the AI User role — holders may tag a todo as AI work. Idempotent."""
	if not frappe.db.exists("Role", ROLE):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": ROLE,
			"desk_access": 0,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
