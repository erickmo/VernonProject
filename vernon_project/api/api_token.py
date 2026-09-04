# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Self-service API key/secret for the logged-in user. Same mechanism Frappe
# uses for `Authorization: token <key>:<secret>` auth (see
# frappe.core.doctype.user.user.generate_keys) — that endpoint is
# System-Manager-only, this is the self-scoped version so anyone can mint
# their own token, mainly to point mcp_server/.env at their own account.

import frappe


def _self():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


@frappe.whitelist()
def get_api_token_status():
	return {"api_key": frappe.db.get_value("User", _self(), "api_key")}


@frappe.whitelist(methods=["POST"])
def generate_api_token():
	doc = frappe.get_doc("User", _self())
	if not doc.api_key:
		doc.api_key = frappe.generate_hash(length=15)
	doc.api_secret = frappe.generate_hash(length=15)
	doc.save(ignore_permissions=True)
	return {"api_key": doc.api_key, "api_secret": doc.api_secret}


@frappe.whitelist(methods=["POST"])
def revoke_api_token():
	doc = frappe.get_doc("User", _self())
	doc.api_key = ""
	doc.api_secret = ""
	doc.save(ignore_permissions=True)
	return {"ok": True}
