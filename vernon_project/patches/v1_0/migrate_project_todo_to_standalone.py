import frappe


def execute():
    """Backfill Project Todo.project_detail from the legacy child-table parent.

    Project Todo was converted from a child table (istable: 1) to a standalone
    doctype. Existing rows still carry the old `parent`/`parenttype` columns;
    copy `parent` into the new `project_detail` Link field for rows that were
    parented to a Project Detail and do not yet have project_detail set.
    """
    if not frappe.db.has_column("Project Todo", "project_detail"):
        return

    frappe.db.sql(
        """
        UPDATE `tabProject Todo`
        SET project_detail = parent
        WHERE parenttype = 'Project Detail'
          AND (project_detail IS NULL OR project_detail = '')
          AND parent IS NOT NULL
          AND parent != ''
        """
    )
    frappe.db.commit()
