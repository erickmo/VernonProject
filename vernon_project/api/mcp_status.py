# Copyright (c) 2026, Vernon and contributors
"""Is the MCP connector reachable? — the answer behind the navbar indicator.

WHY THE PROBE CARRIES NO TOKEN. The MCP server wraps every request in a token
check (mcp_server/server.py), so an anonymous request is answered `401
unauthorized`. That refusal is itself proof the process is alive and serving — only
a running server turns you away. So this asks anonymously and treats ANY HTTP
answer as "up". Nothing secret is sent, nothing secret comes back, and there is no
token anywhere in this module to leak into a payload, a log line or a diagnostic.

It deliberately does NOT reuse `api_token.mcp_token_from_env`: that returns the
token, and this module should never hold it. It reads the port and nothing else.

WHAT EACH STATE MEANS:
  up       the connector answered (any HTTP status, including 401)
  down     the connector did not answer — refused, unreachable, or slower than the
           timeout. A hung host is down, never a hung Frappe worker.
  unknown  WE could not run the check (no config, unexpected error). Saying "down"
           there would blame the MCP server for a local fault.

The result is cached, which is also the rate limit: every navbar in the window
shares ONE outbound probe, and the target is built from server config, never from a
request argument, so this cannot be used to make the server fetch an arbitrary host.
"""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import frappe

CACHE_KEY = "vernon_mcp_status"
DEFAULT_TTL_SECONDS = 45
DEFAULT_TIMEOUT_SECONDS = 3
DEFAULT_PORT = 8811


def _conf(key, default):
	"""site_config.json overrides, so the timings are tunable without a schema change."""
	value = frappe.conf.get(key)
	return type(default)(value) if value is not None else default


def _mcp_port():
	"""The connector's local port from its own .env.http — the file the running
	server loads, so there is nothing to keep in sync. Reads that key only."""
	env_file = Path(frappe.get_app_path("vernon_project")).parent / "mcp_server" / ".env.http"
	try:
		for line in env_file.read_text().splitlines():
			line = line.strip()
			if line.startswith("VERNON_MCP_PORT") and "=" in line:
				return int(line.partition("=")[2].strip().strip("\"'"))
	except (OSError, ValueError):
		pass
	return _conf("vernon_mcp_status_port", DEFAULT_PORT)


def _probe_target():
	"""Always loopback. The connector listens on 127.0.0.1 and nginx fronts it, so
	this checks the process itself rather than the public route — and there is no
	argument through which a caller could point it somewhere else."""
	return f"http://127.0.0.1:{_mcp_port()}/"


def _probe_once(target, timeout):
	"""(http_status, error, latency_ms). An HTTP status — ANY status — means the
	server answered. Only a transport failure leaves the status None."""
	started = time.monotonic()
	try:
		with urllib.request.urlopen(target, timeout=timeout) as response:
			return response.status, None, round((time.monotonic() - started) * 1000, 1)
	except urllib.error.HTTPError as answered:
		# 401/403/404 are the server TALKING. That is exactly what we are checking for.
		return answered.code, None, round((time.monotonic() - started) * 1000, 1)
	except Exception as unreachable:
		return None, str(unreachable), round((time.monotonic() - started) * 1000, 1)


def _fresh_status():
	"""Probe now and build the full record, detail included. Trimming happens per
	caller on the way out — see get_mcp_status."""
	target = _probe_target()
	timeout = _conf("vernon_mcp_status_timeout", DEFAULT_TIMEOUT_SECONDS)
	http_status, error, latency_ms = _probe_once(target, timeout)
	return {
		"status": "up" if http_status else "down",
		"checked_at": frappe.utils.now(),
		"latency_ms": latency_ms,
		"detail": {
			"target": target,
			"http_status": http_status,
			"error": error,
			"timeout_seconds": timeout,
		},
	}


def clear_cached_status():
	"""Drop the cached probe. Used by the tests and available for an admin forcing a
	re-check. The raw key is passed on purpose — frappe's cache applies its own
	prefix to it."""
	frappe.cache().delete_value(CACHE_KEY)


def _cached_status():
	"""One probe per window, shared by every caller.

	`expires=True` on the read is REQUIRED, not decoration. frappe's cache keeps a
	per-request copy in `frappe.local` alongside redis, and the two halves disagree
	about TTL'd keys: `set_value(..., expires_in_sec=...)` deliberately skips the
	local copy (local has no expiry), while a plain `get_value` MEMOISES whatever it
	found — including a miss. So read-miss, probe, write, read again returned the
	remembered None every time: the probe ran on every call and the cache silently
	did nothing. `expires=True` tells the read to skip the local layer and go to
	redis, which is where a TTL'd value actually lives.
	"""
	raw = frappe.cache().get_value(CACHE_KEY, expires=True)
	if raw:
		return json.loads(raw) if isinstance(raw, (str, bytes)) else raw

	try:
		record = _fresh_status()
	except Exception as local_fault:
		# Our own failure, not the connector's — see the "unknown" note above.
		record = {
			"status": "unknown",
			"checked_at": frappe.utils.now(),
			"latency_ms": None,
			"detail": {"target": None, "http_status": None, "error": str(local_fault)},
		}
	frappe.cache().set_value(
		CACHE_KEY, json.dumps(record), expires_in_sec=_conf("vernon_mcp_status_ttl", DEFAULT_TTL_SECONDS)
	)
	return record


@frappe.whitelist()
def get_mcp_status():
	"""Whether the MCP connector is reachable, for the navbar indicator.

	Takes no arguments — the target is server config only. Everyone signed in gets
	the state; only a System Manager gets `detail` (what was probed, what came back).
	That trim happens HERE, per caller, not when the cache is written: the cache
	holds one shared record, so trimming on the way in would let whoever warmed it
	decide what the next person sees.
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Not logged in", frappe.PermissionError)

	record = _cached_status()
	is_admin = "System Manager" in frappe.get_roles(frappe.session.user)
	return {
		"status": record["status"],
		"checked_at": record["checked_at"],
		"latency_ms": record["latency_ms"],
		"detail": record["detail"] if is_admin else {},
	}
