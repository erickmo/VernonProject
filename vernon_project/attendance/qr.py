# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import hmac
import time

import frappe
from frappe.utils import cint


def _window():
	return cint(frappe.db.get_single_value("Vernon Settings", "qr_validity_seconds")) or 30


def _token(secret, counter):
	return hmac.new(secret.encode(), str(counter).encode(), hashlib.sha256).hexdigest()[:8]


def current_payload(station_name):
	"""Live rotating QR payload for a station's kiosk display."""
	secret = frappe.db.get_value("Attendance Station", station_name, "secret_key")
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
