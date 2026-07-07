# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, nowdate


@frappe.whitelist()
def get_income():
	"""Open extra-income opportunities the caller can still claim, plus the
	caller's own claims. Opportunities whose period_end has passed are hidden
	(they no longer accept claims)."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)

	today = getdate(nowdate())
	opps = frappe.get_all(
		"Income Opportunity",
		filters={"status": "Open"},
		fields=["name", "title", "description", "reward", "period_start", "period_end"],
		order_by="period_start desc",
	)
	opps = [
		o for o in opps
		if not (o.get("period_end") and getdate(o["period_end"]) < today)
	]

	claims = frappe.get_all(
		"Income Opportunity Claim",
		filters={"claimed_by": user},
		fields=["name", "opportunity", "details", "status", "review_note", "creation"],
		order_by="creation desc",
	)
	# Newest claim per opportunity → drives the "already claimed" badge on the list.
	latest_for_opp = {}
	for c in claims:
		latest_for_opp.setdefault(c["opportunity"], c["status"])

	# Titles for claims whose opportunity is closed/hidden (not in the open list).
	titles = {o["name"]: o["title"] for o in opps}
	missing = {c["opportunity"] for c in claims} - set(titles)
	if missing:
		for row in frappe.get_all(
			"Income Opportunity", filters={"name": ["in", list(missing)]},
			fields=["name", "title"],
		):
			titles[row["name"]] = row["title"]

	return {
		"opportunities": [
			{
				"name": o["name"],
				"title": o["title"],
				"description": o["description"],
				"reward": o["reward"],
				"period_start": str(o["period_start"]) if o["period_start"] else None,
				"period_end": str(o["period_end"]) if o["period_end"] else None,
				"my_claim_status": latest_for_opp.get(o["name"]),
			}
			for o in opps
		],
		"claims": [
			{
				"name": c["name"],
				"opportunity": c["opportunity"],
				"opportunity_title": titles.get(c["opportunity"], c["opportunity"]),
				"details": c["details"],
				"status": c["status"],
				"review_note": c["review_note"],
				"at": str(c["creation"]),
			}
			for c in claims
		],
	}


@frappe.whitelist()
def submit_claim(opportunity, details):
	"""Submit a claim against an opportunity. The doctype's validate() is the
	trust boundary: it forces claimed_by = session user, status = Submitted, and
	rejects claims on closed/expired opportunities. Role-level create perms
	(role 'All') govern who may insert — no ignore_permissions here."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	details = (details or "").strip()
	if not details:
		frappe.throw(_("Please describe your claim."))

	doc = frappe.get_doc(
		{
			"doctype": "Income Opportunity Claim",
			"opportunity": opportunity,
			"details": details,
		}
	)
	doc.insert()
	frappe.db.commit()
	return {"ok": True, "name": doc.name}
