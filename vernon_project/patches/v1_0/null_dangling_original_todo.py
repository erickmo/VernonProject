# Null any original_todo that doesn't resolve to an existing Project Todo, so the
# Data->Link conversion never fails link validation on a later save.
import frappe


def execute():
    frappe.db.sql(
        """
        UPDATE `tabProject Todo` t
        LEFT JOIN `tabProject Todo` r ON r.name = t.original_todo
        SET t.original_todo = NULL
        WHERE t.original_todo IS NOT NULL AND t.original_todo != '' AND r.name IS NULL
        """
    )
