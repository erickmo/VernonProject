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


def _mask_key(key):
	"""Existence + a short trailing hint — never enough on its own to
	authenticate with (the secret, never returned here, is also required)."""
	return key[-4:] if key else None


@frappe.whitelist()
def get_api_token_status():
	"""Whether the caller has a personal API token, plus an admin-only MCP URL.

	Always about frappe.session.user's own token; Guest gets
	frappe.AuthenticationError. Pure read — `generate_api_token` is what creates or
	rotates one.

	Returns `{"has_token", "masked_key", "mcp_connector_url"}`. `masked_key` is the
	last 4 characters of the API key and nothing more; the secret is never returned
	by this endpoint, so what comes back cannot be used to authenticate.

	`can_reveal_mcp` is true only for a System Manager; the admin-only connector URL
	itself is NOT returned here — call `reveal_mcp_connector_url` for it, so the live
	server-key token never sits in a status payload fetched on page load."""
	key = frappe.db.get_value("User", _self(), "api_key")
	return {
		"has_token": bool(key),
		"masked_key": _mask_key(key),
		# 5acr99ev9t hardening: the admin-equivalent connector URL no longer rides in
		# this status payload (fetched on every profile load). We return only whether
		# the caller MAY reveal it; the URL itself comes from reveal_mcp_connector_url
		# on a deliberate call.
		"can_reveal_mcp": "System Manager" in frappe.get_roles(),
	}


@frappe.whitelist(methods=["POST"])
def reveal_mcp_connector_url():
	"""The admin-only MCP connector URL — System Manager only, deliberate action.

	Split out of get_api_token_status so the live server-key token (admin-equivalent
	access; the remote MCP server runs every call as its OWN API key) is never in a
	status payload fetched on page load. Returns `{"url": <str|None>}`; None if the
	server's .env.http is unreadable. Anyone but a System Manager gets
	frappe.PermissionError. Treat the URL as a credential: never log or forward it."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(frappe._("System Manager only."), frappe.PermissionError)
	return {"url": _mcp_connector_url()}


@frappe.whitelist(methods=["POST"])
def generate_api_token():
	doc = frappe.get_doc("User", _self())
	if not doc.api_key:
		doc.api_key = frappe.generate_hash(length=15)
	# Capture the plaintext BEFORE save(): Frappe's own BaseDocument._save_passwords()
	# overwrites any Password-fieldtype attribute (api_secret) on the in-memory doc
	# with a dummy "***...*" placeholder right after persisting it (see
	# frappe/model/base_document.py) — reading doc.api_secret after save() here
	# returned that placeholder, never the real secret, since this was written.
	api_secret = frappe.generate_hash(length=15)
	doc.api_secret = api_secret
	doc.save(ignore_permissions=True)
	return {"api_key": doc.api_key, "api_secret": api_secret}


@frappe.whitelist(methods=["POST"])
def revoke_api_token():
	doc = frappe.get_doc("User", _self())
	doc.api_key = ""
	doc.api_secret = ""
	doc.save(ignore_permissions=True)
	return {"ok": True}
