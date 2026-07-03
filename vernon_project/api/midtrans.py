# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import hmac

import frappe
import requests


def _settings():
	return frappe.get_single("Vernon Settings")


def snap_base_url():
	if _settings().midtrans_is_production:
		return "https://app.midtrans.com"
	return "https://app.sandbox.midtrans.com"


def _snap_js_url():
	if _settings().midtrans_is_production:
		return "https://app.midtrans.com/snap/snap.js"
	return "https://app.sandbox.midtrans.com/snap/snap.js"


def _server_key():
	key = _settings().get_password("midtrans_server_key", raise_exception=False)
	if not key:
		frappe.throw("Payments are not configured.", frappe.ValidationError)
	return key


def verify_signature(payload, server_key):
	raw = (
		str(payload.get("order_id", ""))
		+ str(payload.get("status_code", ""))
		+ str(payload.get("gross_amount", ""))
		+ server_key
	)
	expected = hashlib.sha512(raw.encode()).hexdigest()
	return hmac.compare_digest(expected, str(payload.get("signature_key") or ""))


def snap_create(order_id, gross_amount, customer, items):
	resp = requests.post(
		f"{snap_base_url()}/snap/v1/transactions",
		json={
			"transaction_details": {"order_id": order_id, "gross_amount": int(gross_amount)},
			"customer_details": customer,
			"item_details": items,
		},
		auth=(_server_key(), ""),
		timeout=30,
	)
	if resp.status_code != 201:
		frappe.log_error(f"Snap {resp.status_code}: {resp.text[:500]}", "Midtrans Snap")
		frappe.throw("Payment gateway error, try again", frappe.ValidationError)
	return resp.json()


@frappe.whitelist(allow_guest=True)
def pay_config():
	s = _settings()
	return {"client_key": s.midtrans_client_key or "", "snap_js": _snap_js_url()}
