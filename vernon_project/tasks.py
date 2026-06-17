# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate, nowdate


def create_recurring_todos():
    """Daily: roll recurring Project Todos forward (standalone doctype).

    When a recurring todo's `next_occurrence` has arrived, create the next
    occurrence regardless of the current one's status, then clear the head's
    next_occurrence so it processes exactly once.
    """
    today = nowdate()

    heads = frappe.db.sql(
        """
        SELECT name, project_detail, to_do, assigned_to, deadline, estimated,
               notes, recurring_frequency, recurring_until, next_occurrence,
               original_todo, status
        FROM `tabProject Todo`
        WHERE is_recurring = 1
          AND recurring_frequency IS NOT NULL
          AND recurring_frequency != ''
          AND next_occurrence IS NOT NULL
          AND next_occurrence <= %s
        """,
        (today,),
        as_dict=True,
    )

    created_count = 0

    for h in heads:
        try:
            next_date = h.next_occurrence

            if h.recurring_until and getdate(next_date) > getdate(h.recurring_until):
                frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)
                continue

            exists = frappe.db.exists("Project Todo", {
                "project_detail": h.project_detail,
                "to_do": h.to_do,
                "deadline": next_date,
                "assigned_to": h.assigned_to,
            })

            if not exists:
                head_doc = frappe.get_doc("Project Todo", h.name)
                following = head_doc.calculate_next_occurrence(next_date)
                frappe.get_doc({
                    "doctype": "Project Todo",
                    "project_detail": h.project_detail,
                    "to_do": h.to_do,
                    "assigned_to": h.assigned_to,
                    "deadline": next_date,
                    "estimated": h.estimated,
                    "notes": h.notes,
                    "is_recurring": 1,
                    "recurring_frequency": h.recurring_frequency,
                    "recurring_until": h.recurring_until,
                    "next_occurrence": following,
                    "original_todo": h.original_todo or h.name,
                    "status": "⚪️ Planned",
                }).insert(ignore_permissions=True)
                created_count += 1

            frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)

        except Exception as e:
            frappe.log_error(f"Error creating recurring todo: {str(e)}", "Recurring Todo Error")
            continue

    if created_count > 0:
        frappe.db.commit()
        frappe.logger().info(f"Created {created_count} recurring todos")

    return created_count
