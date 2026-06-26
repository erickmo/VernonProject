import frappe


def execute():
    """Backfill Project Todo.start_date for existing rows.

    start_date is a new required field. Existing todos have none, which would
    block their next save. Seed it from the row's creation date, clamped to be
    on or before the deadline (the controller enforces start_date <= deadline).
    Idempotent: only touches rows where start_date is still empty.
    """
    if not frappe.db.has_column("Project Todo", "start_date"):
        return

    frappe.db.sql(
        """
        UPDATE `tabProject Todo`
        SET start_date = CASE
            WHEN deadline IS NOT NULL AND DATE(creation) > deadline THEN deadline
            ELSE DATE(creation)
        END
        WHERE start_date IS NULL
        """
    )
    frappe.db.commit()
