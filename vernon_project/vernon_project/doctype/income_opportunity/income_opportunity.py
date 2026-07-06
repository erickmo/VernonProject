# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, nowdate


class IncomeOpportunity(Document):
	pass


def is_effectively_closed(name, today=None):
	"""True when a posting no longer accepts claims: status Closed, or a
	period_end that has passed. A missing/deleted posting counts as closed."""
	opp = frappe.db.get_value(
		"Income Opportunity", name, ["status", "period_end"], as_dict=True
	)
	if not opp:
		return True
	if opp.status == "Closed":
		return True
	if opp.period_end and getdate(opp.period_end) < getdate(today or nowdate()):
		return True
	return False
