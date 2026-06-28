# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# WebAuthn passkey ("fingerprint") login
# --------------------------------------
# Lets users sign in with a platform authenticator (Touch ID / Face ID /
# Android fingerprint) instead of typing a password. All cryptographic
# verification happens server-side via py_webauthn; the browser only ferries
# bytes. Credentials are stored one-row-per-device in the `User Passkey` doctype.
#
# Flow:
#   enroll (logged in):  register_begin -> navigator.credentials.create -> register_complete
#   login  (guest):      login_begin    -> navigator.credentials.get    -> login_complete
#
# rpId / origin default to the request host but can be pinned per-site via
# site_config keys `webauthn_rp_id` / `webauthn_origin` (needed for the
# *.vernon.id subdomains so each site only honours its own origin).

import hashlib
import json

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, now_datetime

import webauthn
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url, options_to_json
from webauthn.helpers.structs import (
	AuthenticatorSelectionCriteria,
	PublicKeyCredentialDescriptor,
	ResidentKeyRequirement,
	UserVerificationRequirement,
)

RP_NAME = "Vernon"
CHALLENGE_TTL_SEC = 300


# --------------------------------------------------------------------------------
# Config helpers
# --------------------------------------------------------------------------------
def _rp_id() -> str:
	configured = frappe.conf.get("webauthn_rp_id")
	if configured:
		return configured
	host = frappe.utils.get_url().split("://", 1)[-1].split("/", 1)[0]
	return host.split(":", 1)[0]


def _origin() -> str:
	configured = frappe.conf.get("webauthn_origin")
	if configured:
		return configured
	return frappe.utils.get_url().rstrip("/")


def _user_handle(user: str) -> bytes:
	# Stable, opaque per-user handle (not reversible to the email). Used as the
	# WebAuthn user.id and cross-checked against the assertion's userHandle.
	return hashlib.sha256(f"vernon-webauthn:{user}".encode()).digest()[:16]


def _challenge_key(scope: str, handle: str) -> str:
	return f"webauthn:{scope}:{handle}"


def _store_challenge(scope: str, handle: str, challenge: bytes) -> None:
	frappe.cache.set_value(
		_challenge_key(scope, handle),
		bytes_to_base64url(challenge),
		expires_in_sec=CHALLENGE_TTL_SEC,
	)


def _pop_challenge(scope: str, handle: str) -> bytes:
	key = _challenge_key(scope, handle)
	value = frappe.cache.get_value(key)
	frappe.cache.delete_value(key)
	if not value:
		frappe.throw("Passkey challenge expired — please try again.", frappe.ValidationError)
	return base64url_to_bytes(value)


def _as_dict(credential):
	return json.loads(credential) if isinstance(credential, str) else credential


# --------------------------------------------------------------------------------
# Enrollment (authenticated user adds a passkey for the current device)
# --------------------------------------------------------------------------------
@frappe.whitelist()
def register_begin():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)

	existing = frappe.get_all("User Passkey", filters={"user": user}, pluck="credential_id")
	exclude = [PublicKeyCredentialDescriptor(id=base64url_to_bytes(c)) for c in existing]
	full_name = frappe.db.get_value("User", user, "full_name") or user

	options = webauthn.generate_registration_options(
		rp_id=_rp_id(),
		rp_name=RP_NAME,
		user_id=_user_handle(user),
		user_name=user,
		user_display_name=full_name,
		authenticator_selection=AuthenticatorSelectionCriteria(
			resident_key=ResidentKeyRequirement.REQUIRED,
			user_verification=UserVerificationRequirement.REQUIRED,
		),
		exclude_credentials=exclude or None,
	)
	_store_challenge("reg", user, options.challenge)
	return json.loads(options_to_json(options))


@frappe.whitelist()
def register_complete(credential, label=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)

	credential = _as_dict(credential)
	challenge = _pop_challenge("reg", user)

	verification = webauthn.verify_registration_response(
		credential=credential,
		expected_challenge=challenge,
		expected_rp_id=_rp_id(),
		expected_origin=_origin(),
		require_user_verification=True,
	)

	credential_id = bytes_to_base64url(verification.credential_id)
	if frappe.db.exists("User Passkey", {"credential_id": credential_id}):
		frappe.throw("This passkey is already registered.")

	doc = frappe.get_doc(
		{
			"doctype": "User Passkey",
			"user": user,
			"label": (label or "This device")[:140],
			"credential_id": credential_id,
			"public_key": bytes_to_base64url(verification.credential_public_key),
			"sign_count": verification.sign_count,
			"user_handle": bytes_to_base64url(_user_handle(user)),
			"backed_up": 1 if verification.credential_backed_up else 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return {"ok": True, "name": doc.name, "label": doc.label}


# --------------------------------------------------------------------------------
# Login (guest — discoverable credential, no username required)
# --------------------------------------------------------------------------------
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=60)
def login_begin():
	handle = frappe.generate_hash(length=32)
	options = webauthn.generate_authentication_options(
		rp_id=_rp_id(),
		user_verification=UserVerificationRequirement.REQUIRED,
	)
	_store_challenge("auth", handle, options.challenge)
	out = json.loads(options_to_json(options))
	out["_handle"] = handle
	return out


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=60)
def login_complete(credential, handle):
	credential = _as_dict(credential)
	challenge = _pop_challenge("auth", handle)

	credential_id = credential.get("id") or credential.get("rawId")
	if not credential_id:
		frappe.throw("Invalid passkey response.")

	row = frappe.db.get_value(
		"User Passkey",
		{"credential_id": credential_id},
		["name", "user", "public_key", "sign_count", "user_handle"],
		as_dict=True,
	)
	if not row:
		frappe.throw("This passkey isn't recognized — sign in with your password.")

	# Cross-check the authenticator's userHandle against the stored one.
	response_handle = (credential.get("response") or {}).get("userHandle")
	if response_handle and row.user_handle and response_handle != row.user_handle:
		frappe.throw("Passkey does not match its user.")

	# login_as() bypasses the normal credential check, so gate on `enabled` here.
	if not frappe.db.get_value("User", row.user, "enabled"):
		frappe.throw("This account is disabled.")

	verification = webauthn.verify_authentication_response(
		credential=credential,
		expected_challenge=challenge,
		expected_rp_id=_rp_id(),
		expected_origin=_origin(),
		credential_public_key=base64url_to_bytes(row.public_key),
		credential_current_sign_count=cint(row.sign_count),
		require_user_verification=True,
	)

	frappe.db.set_value(
		"User Passkey",
		row.name,
		{"sign_count": verification.new_sign_count, "last_used": now_datetime()},
		update_modified=False,
	)

	# Establish the Frappe session + sid cookie for this user. The client then
	# hard-reloads so the page boots with a fresh csrf_token.
	frappe.local.login_manager.login_as(row.user)
	frappe.local.response["user"] = row.user
	return {"ok": True, "user": row.user}


# --------------------------------------------------------------------------------
# Device management (authenticated user lists / revokes their own passkeys)
# --------------------------------------------------------------------------------
@frappe.whitelist()
def list_passkeys():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	rows = frappe.get_all(
		"User Passkey",
		filters={"user": user},
		fields=["name", "label", "creation", "last_used"],
		order_by="creation desc",
	)
	return {"passkeys": rows}


# DIAGNOSTIC (temporary): the browser's WebAuthn errors are invisible server-side
# and hard to read on mobile. The client posts the exact DOMException here so it
# lands in the Error Log. Safe to delete once the passkey rollout is stable.
@frappe.whitelist(allow_guest=True)
def client_log(detail):
	frappe.log_error(message=str(detail)[:2000], title="Passkey client diagnostic")
	return {"ok": True}


@frappe.whitelist()
def revoke_passkey(name):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	if frappe.db.get_value("User Passkey", name, "user") != user:
		frappe.throw("Not permitted", frappe.PermissionError)
	frappe.delete_doc("User Passkey", name, ignore_permissions=True)
	return {"ok": True}
