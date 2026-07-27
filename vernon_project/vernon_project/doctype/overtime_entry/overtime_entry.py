import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class OvertimeEntry(Document):
    def validate(self):
        # Only a System Manager may move an entry to Approved (HR assigns, SysMgr approves).
        if self.status == "Approved":
            if "System Manager" not in frappe.get_roles():
                frappe.throw("Only a System Manager can approve overtime.")
            self.approved_by = frappe.session.user
            self.approved_on = self.approved_on or now_datetime()
        else:
            self.approved_by = None
            self.approved_on = None
        if not self.assigned_by:
            self.assigned_by = frappe.session.user

    def _reconcile(self):
        from vernon_project.attendance.leave_rules import reconcile_overtime
        reconcile_overtime(self.employee, int(str(self.date)[:4]))

    def on_update(self):
        self._reconcile()

    def after_delete(self):
        # after_delete (not on_trash): the row is gone from the DB, so the
        # overtime sum no longer counts this entry.
        self._reconcile()
