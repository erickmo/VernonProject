import frappe


def execute():
    """Backfill Project Todo.project from the linked Project Detail.

    `project` is a denormalized helper field (added so the Work Item picker on
    the Project Todo form can be scoped to a project). Populate it for existing
    rows from project_detail.project; idempotent.
    """
    if not frappe.db.has_column("Project Todo", "project"):
        return

    frappe.db.sql(
        """
        UPDATE `tabProject Todo` pt
        JOIN `tabProject Detail` pd ON pd.name = pt.project_detail
        SET pt.project = pd.project
        WHERE (pt.project IS NULL OR pt.project = '')
          AND pt.project_detail IS NOT NULL
          AND pt.project_detail != ''
        """
    )
    frappe.db.commit()
