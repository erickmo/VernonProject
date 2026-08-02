"""Plain-python unit test (no bench): python3 vernon_project/tests/test_offboarding_plan.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from vernon_project.offboarding_plan import plan_lead_reassignments

U = "u@x"  # the disabled user


def test_leader_reassigns_to_owner():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P1", "project_owner": "o@x", "project_leader": U}], U, {"o@x"})
    assert blockers == []
    assert plan == [{"project": "P1", "field": "project_leader",
                     "new_value": "o@x", "grant_role": "Project Leader"}]


def test_owner_reassigns_to_leader():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P2", "project_owner": U, "project_leader": "l@x"}], U, {"l@x"})
    assert blockers == []
    assert plan == [{"project": "P2", "field": "project_owner",
                     "new_value": "l@x", "grant_role": "Project Owner"}]


def test_block_when_owner_equals_leader_equals_user():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P3", "project_owner": U, "project_leader": U}], U, set())
    assert blockers == ["P3"]
    assert plan == []


def test_block_when_counterpart_disabled():
    # user is owner; leader exists but is NOT in enabled_users
    plan, blockers = plan_lead_reassignments(
        [{"name": "P4", "project_owner": U, "project_leader": "l@x"}], U, set())
    assert blockers == ["P4"]
    assert plan == []


def test_block_when_counterpart_missing():
    # user is owner, no leader set at all -> reqd field can't be blanked
    plan, blockers = plan_lead_reassignments(
        [{"name": "P5", "project_owner": U, "project_leader": None}], U, set())
    assert blockers == ["P5"]


def test_unrelated_project_ignored():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P6", "project_owner": "x@x", "project_leader": "y@x"}], U, {"x@x", "y@x"})
    assert plan == [] and blockers == []


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
    print("ALL PASS")
