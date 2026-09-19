# Copyright (c) 2026, Vernon and contributors
"""One definition of "did this field really change?", for the guards that freeze
fields once a record is issued.

Those guards compare what the request is holding against what the database has, and
the two arrive in different shapes. A stored Date comes back as a `datetime.date`
and an empty column as NULL; a JSON payload — an `/api/resource` PUT,
`frappe.client.save`, any screen posting the document back — sends the same day as
the string "2026-09-19" and the same emptiness as "". Comparing those raw makes a
save that changed NOTHING look like tampering, and the guard refuses it.

Project Todo hit this first and solved it inline; Teguran, written later,
reintroduced the same raw `!=` and had to be fixed again. Hence one place.

`fieldtype` is optional on purpose. Given one (from `meta`), dates are compared as
dates. Without one, the value's own type is used — which is what lets a controller
whose tests run against a stand-in object, with no registered meta, use the same
rule as one that has the real thing.

Child tables are NOT handled here: comparing them needs to know which of a row's
columns count, which is the owning doctype's business. Callers keep that themselves.
"""

import datetime

from frappe.utils import get_datetime, getdate


def is_blank(value):
	"""NULL and "" are the same absence. Two blanks are not a change — but clearing a
	real value still is, because only one side is blank then."""
	return value is None or value == ""


def _scalar(value):
	if is_blank(value):
		return ""
	if isinstance(value, (datetime.date, datetime.datetime)):
		return str(value)
	return str(value).strip()


def field_changed(new, old, fieldtype=None):
	"""True when `new` really differs from `old`, ignoring how each was represented.

	Only the representation is normalised. A different day, a different string, or
	filling in something that was blank all still count as changes.
	"""
	if is_blank(new) and is_blank(old):
		return False
	if fieldtype == "Date":
		return (getdate(new) if not is_blank(new) else None) != (getdate(old) if not is_blank(old) else None)
	if fieldtype in ("Datetime", "Date and Time"):
		return (get_datetime(new) if not is_blank(new) else None) != (get_datetime(old) if not is_blank(old) else None)
	return _scalar(new) != _scalar(old)
