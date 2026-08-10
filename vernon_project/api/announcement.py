# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

# System Manager owns the doctype; HR Manager is granted here too. Writes use
# ignore_permissions, so this tuple is the trust boundary for management.
MANAGE_ROLES = ("System Manager", "HR Manager")


def _require_manage():
	if not (set(MANAGE_ROLES) & set(frappe.get_roles(frappe.session.user))):
		frappe.throw(_("You are not allowed to manage announcements."), frappe.PermissionError)


def _clean_link(link):
	"""Only http(s) or site-relative links. The link becomes an <a href> shown to
	EVERY user, so reject javascript:/data: and other XSS-carrying schemes."""
	link = (link or "").strip()
	if not link:
		return None
	if link.startswith(("http://", "https://", "/")):
		return link
	frappe.throw(_("Link must start with http://, https:// or /"))


@frappe.whitelist()
def get_active_announcements():
	"""Published announcements whose date window covers today. Any logged-in user."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Not logged in"), frappe.AuthenticationError)
	today = nowdate()
	return frappe.get_all(
		"Announcement",
		filters=[
			["published", "=", 1],
			["start_date", "<=", today],
			["end_date", ">=", today],
		],
		fields=["name", "message", "link"],
		order_by="creation desc",
	)


@frappe.whitelist()
def list_announcements():
	"""Every announcement (active/scheduled/expired) for the admin screen."""
	_require_manage()
	return frappe.get_all(
		"Announcement",
		fields=["name", "message", "link", "start_date", "end_date", "published"],
		order_by="start_date desc, creation desc",
	)


@frappe.whitelist()
def save_announcement(message, start_date, end_date, name=None, link=None, published=0):
	_require_manage()
	message = (message or "").strip()
	if not message:
		frappe.throw(_("Message is required."))
	if not start_date or not end_date:
		frappe.throw(_("Start and end date are required."))
	if getdate(end_date) < getdate(start_date):
		frappe.throw(_("End date cannot be before start date."))

	doc = frappe.get_doc("Announcement", name) if name else frappe.new_doc("Announcement")
	doc.message = message
	doc.link = _clean_link(link)
	doc.start_date = start_date
	doc.end_date = end_date
	doc.published = 1 if int(published or 0) else 0
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def delete_announcement(name):
	_require_manage()
	frappe.delete_doc("Announcement", name, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
