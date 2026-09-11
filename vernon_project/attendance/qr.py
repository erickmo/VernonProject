# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import hmac
import ipaddress
import time

import frappe
from frappe.utils import cint

# Cloudflare edge ranges, https://www.cloudflare.com/ips/ (fetched 2026-09-11).
# ponytail: hardcoded list; if Cloudflare adds a range, scans via it fall back to the
# edge IP and fail the network gate (fail closed). Upgrade path: nginx real_ip module.
_CLOUDFLARE = [ipaddress.ip_network(n) for n in (
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)]


def _ip(value):
	try:
		return ipaddress.ip_address((value or "").strip())
	except ValueError:
		return None


def real_ip(forwarded_for, cf_connecting_ip, fallback=None):
	"""The caller's real public IP from the proxy headers.

	frappe.local.request_ip is the FIRST X-Forwarded-For entry: client-controlled on
	vhosts that append, and a Cloudflare edge on this site. The LAST entry is the TCP
	peer our own nginx wrote (gunicorn listens on 127.0.0.1 only). CF-Connecting-IP is
	trusted only when that peer really is Cloudflare, which overwrites the header."""
	peer = _ip((forwarded_for or "").split(",")[-1]) or _ip(fallback)
	if peer and any(peer in net for net in _CLOUDFLARE):
		return str(_ip(cf_connecting_ip) or peer)
	return str(peer) if peer else None


def client_ip():
	if not getattr(frappe.local, "request", None):
		return None  # bench execute / tests: no network to vouch for
	h = frappe.get_request_header
	return real_ip(h("X-Forwarded-For"), h("CF-Connecting-IP"), getattr(frappe.local, "request_ip", None))


def parse_networks(text):
	"""One IP or CIDR per line -> list of networks. Raises ValueError on a bad line."""
	return [ipaddress.ip_network(line.strip(), strict=False) for line in (text or "").splitlines() if line.strip()]


def on_network(allowed_text, ip):
	"""True when the station has no network list, or `ip` is inside one of them."""
	nets = parse_networks(allowed_text)
	if not nets:
		return True
	addr = _ip(ip)
	return bool(addr) and any(addr in net for net in nets)


def _window():
	return cint(frappe.db.get_single_value("Vernon Settings", "qr_validity_seconds")) or 30


def _token(secret, counter):
	return hmac.new(secret.encode(), str(counter).encode(), hashlib.sha256).hexdigest()[:8]


def current_payload(station_name):
	"""Live rotating QR payload for a station's kiosk display."""
	secret = frappe.db.get_value("Attendance Station", station_name, "secret_key")
	if not secret:
		frappe.throw(f"Station {station_name!r} has no secret_key configured")
	counter = int(time.time()) // _window()
	return {"station": station_name, "counter": counter, "token": _token(secret, counter)}


def verify(station_name, counter, token):
	"""True if token matches the current or immediately-previous window."""
	secret = frappe.db.get_value("Attendance Station", station_name, "secret_key")
	if not secret:
		return False
	try:
		counter = int(counter)
	except (TypeError, ValueError):
		return False
	now_counter = int(time.time()) // _window()
	if counter not in (now_counter, now_counter - 1):
		return False
	return hmac.compare_digest(str(token), _token(secret, counter))
