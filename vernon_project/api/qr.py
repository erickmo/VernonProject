# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# QR codes for internship certificates.
#
# The QR always encodes a URL, never a bare code: a URL resolves in any phone camera
# without an app, which is the whole point of putting it on a piece of paper someone
# will hand to a stranger.

import base64
import io

import segno

# Error correction 'm' (~15%). A certificate gets folded, scanned and photocopied;
# 'l' is too fragile for paper and 'h' makes the symbol denser than it needs to be.
ERROR_LEVEL = "m"


def qr_png_bytes(text, scale=6, border=2):
	buf = io.BytesIO()
	segno.make(text, error=ERROR_LEVEL).save(buf, kind="png", scale=scale, border=border)
	return buf.getvalue()


def qr_data_uri(text, scale=6, border=2):
	"""PNG data URI, ready to drop into an <img src>. Inline rather than a stored File
	so the certificate HTML is self-contained and wkhtmltopdf never has to fetch
	anything (a fetch would need auth and would be a blank square without it)."""
	b64 = base64.b64encode(qr_png_bytes(text, scale=scale, border=border)).decode("ascii")
	return f"data:image/png;base64,{b64}"


def verify_url(verify_code, base_url=None):
	"""Public URL the QR points at.

	Forced to https unless it is a local address. This site has no `host_name` in
	site_config, so frappe.utils.get_url() returns http:// even though the site is only
	reachable over TLS -- and an http URL printed onto a certificate is permanent."""
	if not base_url:
		import frappe
		base_url = frappe.utils.get_url()
	base_url = base_url.rstrip("/")
	if base_url.startswith("http://") and not _is_local(base_url):
		base_url = "https://" + base_url[len("http://"):]
	return f"{base_url}/verify/{verify_code}"


def _is_local(url):
	host = url.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
	return host in ("localhost", "127.0.0.1", "0.0.0.0") or host.endswith(".localhost")
