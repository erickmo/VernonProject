import frappe

# Existing-site half of the two indexes the recognition-race fix needs.
# on_doctype_update() only re-runs when a doctype is re-synced, and patches are
# skipped on fresh installs -- so each index is declared in both places. Both calls
# are idempotent.


def execute():
	# Backstop for the duplicate-vote race in api/superpowers.py::_upsert_vote.
	# Checked against live data before shipping: 0 duplicate
	# (ratee, voter, superpower, quarter) groups and 0 blank quarters over 9,975 rows,
	# so the constraint applies cleanly. If a future site IS dirty this raises rather
	# than silently skipping -- dedupe, then re-run.
	frappe.db.add_unique(
		"Superpower Vote",
		["ratee", "voter", "superpower", "quarter"],
		constraint_name="unique_vote_per_quarter",
	)
	# Scopes the recognition cap's locking read to one giver. Without it,
	# `where granted_by=%s ... for update` scans and locks every Point Ledger row,
	# serialising every point write on the site. Declared as search_index in
	# point_ledger.json too; this is the belt for sites whose sync already ran.
	frappe.db.add_index("Point Ledger", ["granted_by"])
