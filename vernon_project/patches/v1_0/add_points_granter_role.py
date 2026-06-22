import frappe

GRANTER = "Points Granter"


def execute():
	"""Create the Points Granter role (mobile-only). Idempotent."""
	if not frappe.db.exists("Role", GRANTER):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": GRANTER,
			"desk_access": 0,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
