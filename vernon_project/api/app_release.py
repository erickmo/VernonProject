import frappe


@frappe.whitelist()
def get_app_releases(platform=None):
    """Published release notes for the What's New screen. Logged-in users only.

    Takes no required arguments and returns a BARE LIST of published releases
    (version, release_date, title, notes, platform), newest release_date first,
    with no paging.

    Optional arguments:

    * `platform` — "Mobile" or "Web". Either one returns the rows targeted at that
      platform PLUS the rows marked "Both". Any other value, including omitting it,
      is not an error and not a rejection: the filter is simply skipped and every
      published release for every platform comes back. So a typo here silently
      widens the result rather than narrowing it."""
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
