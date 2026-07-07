# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

# Who may create/close opportunities and review claims. System Manager is the
# doctype-level owner; "Income Manager" is a delegatable role gated here in the
# API (writes use ignore_permissions, so this check is the trust boundary).
MANAGE_ROLES = ("System Manager", "Income Manager")
CLAIM_STATUSES = ("Submitted", "Approved", "Paid", "Rejected")


def _can_manage(user=None):
	return bool(set(MANAGE_ROLES) & set(frappe.get_roles(user or frappe.session.user)))


def _require_manage():
	if not _can_manage():
		frappe.throw(_("You are not allowed to manage extra income."), frappe.PermissionError)


def _full_names(users):
	users = {u for u in users if u}
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", list(users)]}, fields=["name", "full_name"])
	return {r["name"]: r["full_name"] or r["name"] for r in rows}


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


@frappe.whitelist()
def manage_data():
	"""Everything the admin screen needs: all opportunities (any status) and all
	claims with claimant names. Authorized users only."""
	_require_manage()
	opps = frappe.get_all(
		"Income Opportunity",
		fields=["name", "title", "description", "reward", "period_start", "period_end", "status"],
		order_by="modified desc",
	)
	for o in opps:
		o["period_start"] = str(o["period_start"]) if o["period_start"] else None
		o["period_end"] = str(o["period_end"]) if o["period_end"] else None
	titles = {o["name"]: o["title"] for o in opps}

	claims = frappe.get_all(
		"Income Opportunity Claim",
		fields=["name", "opportunity", "claimed_by", "details", "status", "review_note", "creation"],
		order_by="creation desc",
	)
	names = _full_names({c["claimed_by"] for c in claims})
	return {
		"opportunities": opps,
		"claims": [
			{
				"name": c["name"],
				"opportunity": c["opportunity"],
				"opportunity_title": titles.get(c["opportunity"], c["opportunity"]),
				"claimed_by": c["claimed_by"],
				"claimed_by_name": names.get(c["claimed_by"], c["claimed_by"]),
				"details": c["details"],
				"status": c["status"],
				"review_note": c["review_note"],
				"at": str(c["creation"]),
			}
			for c in claims
		],
	}


@frappe.whitelist()
def save_opportunity(title, reward, period_start, name=None, description=None, period_end=None, status="Open"):
	"""Create or update an opportunity. Authorized users only."""
	_require_manage()
	if not (title or "").strip():
		frappe.throw(_("Title is required."))
	if not (reward or "").strip():
		frappe.throw(_("Reward is required."))
	if not period_start:
		frappe.throw(_("Period start is required."))
	if status not in ("Open", "Closed"):
		status = "Open"

	doc = frappe.get_doc("Income Opportunity", name) if name else frappe.new_doc("Income Opportunity")
	doc.title = title.strip()
	doc.description = description
	doc.reward = reward.strip()
	doc.period_start = period_start
	doc.period_end = period_end or None
	doc.status = status
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def review_claim(name, status, review_note=None):
	"""Set a claim's status (Submitted/Approved/Paid/Rejected) + optional note.
	Authorized users only."""
	_require_manage()
	if status not in CLAIM_STATUSES:
		frappe.throw(_("Invalid status."))
	doc = frappe.get_doc("Income Opportunity Claim", name)
	doc.status = status
	doc.review_note = (review_note or "").strip() or None
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
