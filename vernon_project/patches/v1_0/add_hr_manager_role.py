import frappe

ROLE = "HR Manager"


def execute():
	"""Create the HR Manager role. Idempotent."""
	if not frappe.db.exists("Role", ROLE):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": ROLE,
			"desk_access": 0,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
