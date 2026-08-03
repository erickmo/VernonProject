import frappe

# Two composite indexes for the app's hottest full-scan queries. These live in
# on_doctype_update() on the Vernon Notification / Project Todo controllers so
# FRESH INSTALLS index automatically (patches are skipped on install). This patch
# is the other half: on_doctype_update only re-runs when a doctype is re-synced
# (JSON changed), so EXISTING sites need this to pick up the indexes on migrate.
# add_index is idempotent; reverse with frappe.db.drop_index(doctype, name).
# The single-column allocation_date index is declared via "search_index":1 on the
# Project Todo Allocation field, so it needs neither this nor on_doctype_update.


def execute():
	frappe.db.add_index("Vernon Notification", ["recipient", "is_read", "creation"])
	frappe.db.add_index("Project Todo", ["assigned_to", "status"])
