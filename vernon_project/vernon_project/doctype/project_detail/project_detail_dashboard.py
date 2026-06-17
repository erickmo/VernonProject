from frappe import _


def get_data():
    return {
        "fieldname": "project_detail",
        "transactions": [
            {"label": _("Tasks"), "items": ["Project Todo"]},
        ],
    }
