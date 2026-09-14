import frappe


@frappe.whitelist()
def get_app_releases(platform=None):
    """Published release notes for the What's New screen. Logged-in users only.

    Takes no required arguments and returns a BARE LIST of published releases
    (version, release_date, title, notes, platform), newest release_date first,
    with no paging.

    Optional arguments:

    * `platform` — "Mobile" or "Web". Either one returns the rows targeted at that
      platform PLUS the rows marked "Both". Omitting it (None) returns every
      platform's releases; any OTHER value RAISES rather than silently widening."""
    filters = {"published": 1}
    if platform is not None and platform not in ("Mobile", "Web"):
        frappe.throw(frappe._("Platform tidak dikenal: {0}").format(platform))
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
