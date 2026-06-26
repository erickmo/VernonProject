import frappe

# Canonical economy taxonomy. See
# docs/superpowers/specs/2026-06-26-fair-economy-calibration-design.md
# Per group: base_rate_per_minute + { type_name: [(level_name, difficulty_percent), ...] }
TAXONOMY = {
    "Engineering": {
        "base_rate": 1.5,
        "types": {
            "Backend Development": [("Bugfix", 60), ("Feature", 120), ("System/Architecture", 200)],
            "Frontend / Web": [("Tweak", 50), ("Component", 100), ("Full Flow", 160)],
            "Mobile App": [("Tweak", 60), ("Feature", 120), ("Module", 180)],
            "Module Build (VEdu)": [("Standard", 80), ("Complex", 130)],
            "Integration / API": [("Simple", 90), ("Complex", 170)],
            "Bugfix / Maintenance": [("Minor", 50), ("Major", 110)],
        },
    },
    "Sales & Marketing": {
        "base_rate": 1.4,
        "types": {
            "Proposal Writing": [("Standard", 110), ("Full-System/ERP", 200)],
            "SEO": [("Maintenance", 80), ("Optimization", 140)],
            "Content / Influencer": [("Standard", 80), ("Campaign", 140)],
            "Sales Analysis (CAC)": [("Standard", 100), ("Deep", 160)],
            "Lead Outreach": [("Standard", 70), ("Key Account", 130)],
        },
    },
    "Partnerships": {
        "base_rate": 1.3,
        "types": {
            "Outreach / Follow-up": [("Standard", 70), ("Key Partner", 130)],
            "Meeting": [("Setup", 60), ("Lead", 120)],
            "MoU / Agreement": [("Draft", 110), ("Negotiate & Close", 190)],
            "Program Setup": [("Standard", 100), ("Full Program", 160)],
            "Training Delivery": [("Session", 90), ("Full Curriculum", 160)],
        },
    },
    "Creative & Design": {
        "base_rate": 1.1,
        "types": {
            "Image": [("Template-based", 50), ("Custom", 100)],
            "Carousel": [("Standard", 80), ("Premium", 130)],
            "Video Editing": [("Short", 100), ("Long/Complex", 180)],
            "Take Content": [("Standard", 90), ("Production", 150)],
            "Template": [("Standard", 70), ("System", 120)],
        },
    },
    "Operations": {
        "base_rate": 1.0,
        "types": {
            "Warehouse & Inventory": [("Routine", 60), ("Opname/Audit", 110)],
            "Procurement / Sourcing": [("Standard", 90), ("Negotiation", 150)],
            "Legal / Agreement": [("Draft", 100), ("Full Contract", 160)],
            "Service & Catalog Setup": [("Standard", 80), ("Complex", 130)],
            "System / Portal Ops": [("Config", 80), ("Build", 150)],
        },
    },
    "Documentation": {
        "base_rate": 0.9,
        "types": {
            "SOP Writing": [("Standard", 80), ("Comprehensive", 130)],
            "Brand Guideline": [("Section", 90), ("Full", 150)],
            "Technical Docs": [("Standard", 80), ("System", 140)],
            "Process Mapping": [("Standard", 90), ("Complex", 140)],
        },
    },
    "Administration": {
        "base_rate": 0.8,
        "types": {
            "Input Data": [("Standard", 60), ("Bulk/Complex", 90)],
            "Check Data": [("Standard", 70), ("Audit", 100)],
            "Arsip Data": [("Standard", 50), ("Organize", 80)],
        },
    },
    "Misc": {
        "base_rate": 0.7,
        "types": {
            "General Task": [("Standard", 70), ("Complex", 110)],
        },
    },
}

# In-flight statuses whose stale type/level link is blanked so assignees re-pick.
# Completed (points already in Point Ledger) and Cancelled are left untouched.
INFLIGHT_STATUSES = ["⚪️ Planned", "🟠 Done", "🔷 Checked By PL"]


def build_rows(types):
    """Flatten {type: [(level, pct)]} into ordered Group Level row dicts."""
    rows = []
    for type_name, levels in types.items():
        for level_name, pct in levels:
            rows.append(
                {
                    "type_name": type_name,
                    "level_name": level_name,
                    "difficulty_percent": pct,
                }
            )
    return rows


def execute():
    for group_name, cfg in TAXONOMY.items():
        if not frappe.db.exists("Group", group_name):
            continue
        grp = frappe.get_doc("Group", group_name)
        grp.base_rate_per_minute = cfg["base_rate"]
        grp.set("levels", [])
        for row in build_rows(cfg["types"]):
            grp.append("levels", row)  # level_id auto-generated in Group.validate
        grp.save(ignore_permissions=True)

    # Blank stale type/level link on in-flight todos so assignees re-pick.
    frappe.db.sql(
        """
        UPDATE `tabProject Todo`
        SET level = NULL, level_id = NULL, level_type = NULL
        WHERE status IN (%s, %s, %s)
        """,
        tuple(INFLIGHT_STATUSES),
    )
