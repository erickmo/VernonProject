# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Self-service API key/secret for the logged-in user. Same mechanism Frappe
# uses for `Authorization: token <key>:<secret>` auth (see
# frappe.core.doctype.user.user.generate_keys) — that endpoint is
# System-Manager-only, this is the self-scoped version so anyone can mint
# their own token, mainly to point mcp_server/.env at their own account.

from pathlib import Path

import frappe


def _self():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


def mcp_token_from_env(text):
	"""VERNON_MCP_TOKEN + VERNON_MCP_HOST out of a dotenv blob. Pure, so it's testable."""
	env = {}
	for line in text.splitlines():
		line = line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		k, _, v = line.partition("=")
		env[k.strip()] = v.strip().strip("\"'")
	return env.get("VERNON_MCP_TOKEN"), env.get("VERNON_MCP_HOST") or "mcp.vernon.id"


def _mcp_connector_url():
	"""Paste-ready claude.ai Connector URL — System Managers only.

	The remote MCP server takes ONE static token and runs every call as the
	server's own API key, not the caller's (mcp_server/server.py::_run_http),
	so this URL is admin-equivalent access and must never reach a normal user.
	Read from the same .env.http the running server loads — one source of
	truth, nothing to keep in sync. Without it the UI showed a
	`?token=<VERNON_MCP_TOKEN>` placeholder right above the user's own API
	key, and people pasted the key (which 401s).
	"""
	if "System Manager" not in frappe.get_roles():
		return None
	env_file = Path(frappe.get_app_path("vernon_project")).parent / "mcp_server" / ".env.http"
	try:
		token, host = mcp_token_from_env(env_file.read_text())
	except OSError:
		return None
	return f"https://{host}/mcp?token={token}" if token else None


@frappe.whitelist()
def get_api_token_status():
	return {
		"api_key": frappe.db.get_value("User", _self(), "api_key"),
		"mcp_connector_url": _mcp_connector_url(),
	}


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
