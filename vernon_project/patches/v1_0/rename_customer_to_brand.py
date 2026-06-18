import frappe


def execute():
	"""Rename the Customer doctype + its fields to Brand, before model sync.

	Runs in [pre_model_sync] so the doctype/table and columns are renamed to
	match the new JSON BEFORE Frappe syncs brand.json / project.json. Idempotent.
	"""
	# 1. Rename the doctype (renames tabCustomer -> tabBrand and the DocType record).
	if frappe.db.exists("DocType", "Customer") and not frappe.db.exists("DocType", "Brand"):
		frappe.rename_doc("DocType", "Customer", "Brand", force=True)
		frappe.flags.ignore_route_conflict_validation = True

	# 2. Rename the identity column customer_name -> brand_name on the Brand table.
	if frappe.db.table_exists("Brand") and frappe.db.has_column("Brand", "customer_name") \
			and not frappe.db.has_column("Brand", "brand_name"):
		frappe.db.rename_column("Brand", "customer_name", "brand_name")

	# 3. Rename the Project link column customer -> brand.
	if frappe.db.has_column("Project", "customer") and not frappe.db.has_column("Project", "brand"):
		frappe.db.rename_column("Project", "customer", "brand")

	frappe.db.commit()
