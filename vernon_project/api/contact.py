"""Email-only contact endpoint for the VernonCorp marketing site.

No persistence: a valid inquiry is emailed and forgotten. Public trust
boundary, so validation is not skipped.
"""

import re

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import escape_html

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Override at runtime with site_config key: vernoncorp_contact_email
FALLBACK_INBOX = "hello@vernon.id"

_NAME_MAX = 140
_EMAIL_MAX = 140
_MESSAGE_MAX = 4000


def _validate(name, email, message, honeypot):
    """Return None on success, else a short reason string. Pure — unit-testable."""
    if honeypot:
        return "bot"
    if not name or not email or not message:
        return "missing"
    if len(name) > _NAME_MAX or len(email) > _EMAIL_MAX or len(message) > _MESSAGE_MAX:
        return "too_long"
    if not _EMAIL_RE.match(email):
        return "bad_email"
    return None


_ERROR_MESSAGES = {
    "missing": {
        "id": "Mohon lengkapi nama, email, dan pesan Anda.",
        "en": "Please fill in your name, email, and message.",
    },
    "too_long": {
        "id": "Isian terlalu panjang. Mohon persingkat pesan Anda.",
        "en": "That is a little too long. Please shorten your message.",
    },
    "bad_email": {
        "id": "Alamat email sepertinya belum benar. Mohon periksa kembali.",
        "en": "That email address doesn't look right. Please check it.",
    },
}


@frappe.whitelist(allow_guest=True)
@rate_limit(key="contact", limit=5, seconds=3600)
def submit_inquiry(name=None, email=None, message=None, company_website=None, lang="id"):
    name = " ".join((name or "").split())  # collapse newlines/whitespace (subject-header safety)
    email = (email or "").strip()
    message = (message or "").strip()
    honeypot = (company_website or "").strip()  # bots fill this hidden field
    lang = lang if lang in ("id", "en") else "id"

    reason = _validate(name, email, message, honeypot)
    if reason == "bot":
        return {"ok": True}  # silently drop
    if reason:
        msg = _ERROR_MESSAGES.get(reason, _ERROR_MESSAGES["missing"])
        frappe.throw(msg.get(lang) or msg["id"])

    inbox = frappe.conf.get("vernoncorp_contact_email") or FALLBACK_INBOX
    body = (
        "<h3>New VernonCorp inquiry</h3>"
        "<p><b>Name:</b> {n}</p>"
        "<p><b>Email:</b> {e}</p>"
        "<p><b>Message:</b></p><p>{m}</p>"
    ).format(
        n=escape_html(name),
        e=escape_html(email),
        m=escape_html(message).replace("\n", "<br>"),
    )

    try:
        frappe.sendmail(
            recipients=[inbox],
            subject="[VernonCorp] Inquiry from {n}".format(n=escape_html(name)),
            message=body,
            reply_to=email,
        )
    except Exception:
        frappe.log_error(title="VernonCorp contact sendmail failed")

    return {"ok": True}


def _selfcheck():
    assert _validate("", "", "", "") == "missing"
    assert _validate("Ana", "a@b.co", "hi", "iamabot") == "bot"
    assert _validate("Ana", "not-an-email", "hi", "") == "bad_email"
    assert _validate("x" * 200, "a@b.co", "hi", "") == "too_long"
    assert _validate("Ana", "a@b.co", "x" * 5000, "") == "too_long"
    assert _validate("Ana", "a@b.co", "Halo!", "") is None
    print("contact _validate selfcheck ok")


if __name__ == "__main__":
    _selfcheck()
