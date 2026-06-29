import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add the 'Member Type' marking (Internal Team / Intern) to User. Idempotent."""
	create_custom_fields({
		"User": [
			{
				"fieldname": "custom_member_type",
				"label": "Member Type",
				"fieldtype": "Select",
				"options": "\nInternal Team\nIntern",
				"insert_after": "user_type",
				"allow_in_quick_entry": 1,
			}
		]
	})
	frappe.db.commit()
