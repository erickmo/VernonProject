# Copyright (c) 2026, Vernon and contributors
# One-time: move the per-weekday minimums off global Vernon Settings onto every Brand,
# so daily floors don't collapse when the global fields are removed. get_single_value
# still returns the orphaned tabSingles values after the fields leave the DocType meta.
import frappe

_FIELDS = [
	"min_minutes_monday", "min_minutes_tuesday", "min_minutes_wednesday",
	"min_minutes_thursday", "min_minutes_friday", "min_minutes_saturday",
	"min_minutes_sunday",
]


def execute():
	# Read the old globals straight from tabSingles: this patch runs post-model-sync,
	# after Task 5 dropped the fields from Vernon Settings' meta, so get_single_value
	# would raise "Field does not exist". The orphaned tabSingles rows survive field
	# removal, and a raw read bypasses the meta validation.
	stored = dict(frappe.db.sql(
		"SELECT field, value FROM tabSingles WHERE doctype='Vernon Settings' AND field IN %(fields)s",
		{"fields": tuple(_FIELDS)},
	))
	vals = {f: int(stored.get(f) or 0) for f in _FIELDS}
	if not any(vals.values()):
		return  # globals never configured -> Brands keep their 0 defaults
	for name in frappe.get_all("Brand", pluck="name"):
		frappe.db.set_value("Brand", name, vals, update_modified=False)
