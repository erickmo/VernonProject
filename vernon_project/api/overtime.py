"""Overtime Entry API — HR assigns extra hours, a System Manager approves.

CRUD only; the leave-quota effect (Overtime Bonus rows) is reconciled by the
Overtime Entry controller's on_update / after_delete, so nothing is minted here.
"""

import frappe
from frappe.utils import nowdate

_FIELDS = ["name", "employee", "date", "minutes", "reason", "status",
           "assigned_by", "approved_by", "approved_on"]


def _is_manager():
    return bool({"HR Manager", "System Manager"} & set(frappe.get_roles()))


def _require_manager():
    if not _is_manager():
        frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def list_overtime(employee=None, status=None, year=None):
    """Own entries for anyone; any employee's for HR / System Manager.

    Scope is implicit and silent. An HR Manager or System Manager may pass
    `employee` to read someone else's entries, or omit it to read EVERYONE's.
    Anyone else is forced to their own rows; passing an `employee` other than
    themselves is REFUSED with frappe.PermissionError, not silently answered with
    their own entries.

    Returns a BARE LIST ordered by date desc, with no paging and no total.

    Optional arguments:

    * `employee` — a User id; manager-only in effect, see above.
    * `status` — one exact value: "Pending", "Approved" or "Rejected". An unknown
      value matches nothing rather than raising.
    * `year` — a four-digit year, filtering on the entry date. It is passed through
      int(), so a non-numeric value raises rather than being ignored."""
    filters = {}
    if _is_manager():
        if employee:
            filters["employee"] = employee
    else:
        if employee and employee != frappe.session.user:
            frappe.throw(frappe._("Kamu hanya boleh membaca lembur milikmu sendiri."), frappe.PermissionError)
        filters["employee"] = frappe.session.user
    if status:
        filters["status"] = status
    if year:
        filters["date"] = ["between", [f"{int(year)}-01-01", f"{int(year)}-12-31"]]
    return frappe.get_all("Overtime Entry", filters=filters, fields=_FIELDS,
                          order_by="date desc")


@frappe.whitelist()
def create_overtime(employee, date, minutes, reason=None):
    _require_manager()
    minutes = int(minutes)
    if minutes <= 0:
        frappe.throw("Extra minutes must be positive.")
    if not (reason or "").strip():
        frappe.throw("Reason is required.")
    doc = frappe.get_doc({
        "doctype": "Overtime Entry", "employee": employee, "date": date,
        "minutes": minutes, "reason": reason.strip(), "status": "Pending",
    }).insert()
    return doc.name


@frappe.whitelist()
def set_status(name, status):
    """Set Pending / Approved / Rejected. Approved is gated to System Manager
    by the controller's validate()."""
    _require_manager()
    if status not in ("Pending", "Approved", "Rejected"):
        frappe.throw("Invalid status.")
    doc = frappe.get_doc("Overtime Entry", name)
    doc.status = status
    doc.save()
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def delete_overtime(name):
    _require_manager()
    frappe.delete_doc("Overtime Entry", name)
    return {"ok": True}
