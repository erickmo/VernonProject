# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class CutiLedger(Document):
    # Append-only. All minting / summing logic lives in
    # vernon_project.attendance.cuti_ledger — this controller stays empty,
    # exactly like Point Ledger.
    pass
