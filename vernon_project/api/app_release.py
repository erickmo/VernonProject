import frappe


@frappe.whitelist()
def get_app_releases(platform=None):
    """Published release notes for the What's New screen. Logged-in users only."""
    filters = {"published": 1}
    if platform in ("Mobile", "Web"):
        # rows targeted at this platform OR at Both
        rows = frappe.get_all(
            "App Release",
            filters=[["published", "=", 1], ["platform", "in", ["Both", platform]]],
            fields=["version", "release_date", "title", "notes", "platform"],
            order_by="release_date desc, creation desc",
        )
    else:
        rows = frappe.get_all(
            "App Release",
            filters=filters,
            fields=["version", "release_date", "title", "notes", "platform"],
            order_by="release_date desc, creation desc",
        )
    return rows
