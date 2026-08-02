# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Pure decision logic for offboarding a disabled user's lead roles.

No frappe import: unit-testable under plain python. Given the projects a user
owns or leads, decide the cross-fill replacement (leader->owner, owner->leader)
or mark the project as a blocker when the required, role-gated lead field has no
eligible enabled replacement.
"""


def plan_lead_reassignments(projects, user, enabled_users):
    """Return (plan, blockers). See the module/plan docstring for shapes."""
    plan, blockers = [], []
    for p in projects:
        name = p["name"]
        owner = p.get("project_owner")
        leader = p.get("project_leader")
        blocked = False

        if leader == user:
            cand = owner  # leader -> owner
            if cand and cand != user and cand in enabled_users:
                plan.append({"project": name, "field": "project_leader",
                             "new_value": cand, "grant_role": "Project Leader"})
            else:
                blocked = True

        if owner == user:
            cand = leader  # owner -> leader
            if cand and cand != user and cand in enabled_users:
                plan.append({"project": name, "field": "project_owner",
                             "new_value": cand, "grant_role": "Project Owner"})
            else:
                blocked = True

        if blocked:
            blockers.append(name)

    blockers = sorted(set(blockers))
    # Never half-apply a project that also blocks on its other lead field.
    blocked_set = set(blockers)
    plan = [x for x in plan if x["project"] not in blocked_set]
    return plan, blockers
