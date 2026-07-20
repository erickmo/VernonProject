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
	vals = {f: int(frappe.db.get_single_value("Vernon Settings", f) or 0) for f in _FIELDS}
	if not any(vals.values()):
		return  # globals never configured -> Brands keep their 0 defaults
	for name in frappe.get_all("Brand", pluck="name"):
		frappe.db.set_value("Brand", name, vals, update_modified=False)
