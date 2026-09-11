# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.fixtures_for_tests import ensure_brand, ensure_group, ensure_user

# Rewritten 2026-09-10. The previous version of this file had ten tests that each
# built a Project Todo object by hand, patched `frappe.throw`, called
# `todo.validate_done_todo_fields()` DIRECTLY, and asserted that the mock had been
# called with a message mentioning a field label. There was not one `.save()` in
# the file.
#
# That suite could not fail for the thing that actually matters. The guard only
# protects anything because project_todo.py's validate() calls it; delete that one
# line and all ten tests stayed green while protected-field enforcement disappeared
# from production. It was a test suite reporting on a method nobody calls, and it
# asserted the mechanism (we called frappe.throw) rather than the outcome (the write
# was refused and the stored value did not change).
#
# Every test here goes through the real save path and asserts the stored value.
# ponytail: one fixture, no mocks at all -- there is nothing here worth faking.

DONE = "🟠 Done"
PLANNED = "⚪️ Planned"


class TestDoneTodoFieldsLockedOnSave(unittest.TestCase):
    """Once a todo leaves Planned, assigned_to / estimated / start_date / deadline
    and the AI tag+prompt fields are frozen -- enforced in validate(), so every write
    path that ends in doc.save() is covered."""

    def setUp(self):
        frappe.set_user("Administrator")
        self.other_user = ensure_user("dtv_other@example.com", "DTV")
        brand = ensure_brand("Test Customer")
        self.level_id = "DTV-L1"
        self.group = ensure_group("DTV Group", self.level_id)

        self.project = frappe.get_doc({
            "doctype": "Project",
            "project_name": "DTV Project",
            "brand": brand,
            "project_owner": "Administrator",
            "project_leader": "Administrator",
            "status": "Ongoing",
            "start_date": nowdate(),
            "deadline": add_days(nowdate(), 30),
            "team_members": [{"user": "Administrator"}, {"user": self.other_user}],
        }).insert(ignore_permissions=True)

        self.grouping = frappe.get_doc({
            "doctype": "Glossary", "glossary": "DTV Grouping", "project": self.project.name,
        }).insert(ignore_permissions=True).name

        self.detail = frappe.get_doc({
            "doctype": "Project Detail",
            "project": self.project.name,
            "title": "DTV Detail",
            "grouping": self.grouping,
            "project_deadline": add_days(nowdate(), 30),
            "estimated": 100,
        }).insert(ignore_permissions=True)
        frappe.db.commit()

    def tearDown(self):
        frappe.set_user("Administrator")
        for name in frappe.get_all(
            "Project Todo", filters={"project_detail": self.detail.name}, pluck="name"
        ):
            # on_trash refuses to delete a todo that has left Planned.
            frappe.db.set_value("Project Todo", name, "status", PLANNED, update_modified=False)
            frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
        for dt, name in (
            ("Project Detail", self.detail.name),
            ("Glossary", self.grouping),
            ("Project", self.project.name),
        ):
            try:
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
            except Exception:
                pass
        frappe.db.commit()

    # ------------------------------------------------------------------ helpers

    def _done_todo(self, **overrides):
        """A saved todo that has left Planned -- built the way the app builds one."""
        fields = {
            "doctype": "Project Todo",
            "project_detail": self.detail.name,
            "to_do": "protected field probe",
            "assigned_to": "Administrator",
            "start_date": nowdate(),
            "deadline": add_days(nowdate(), 5),
            "estimated": 60,
            "status": PLANNED,
            "group": self.group,
            "level_id": self.level_id,
        }
        fields.update(overrides)
        name = frappe.get_doc(fields).insert(ignore_permissions=True).name
        # Re-load before touching status. The doc returned by insert() still holds the
        # raw strings this fixture passed in, while get_old_doc() returns typed values
        # (date objects), so the protected-field diff sees "2026-09-15" != date(2026,9,15)
        # and refuses a save that changed nothing. Every real write path reloads first,
        # so the fixture has to as well or it is testing a state no caller produces.
        todo = frappe.get_doc("Project Todo", name)
        todo.status = DONE
        todo.save(ignore_permissions=True)
        frappe.db.commit()
        return frappe.get_doc("Project Todo", name)

    def _assert_frozen(self, field, new_value):
        """Mutating `field` on a non-Planned todo must be refused by save(), and the
        stored value must be untouched afterwards."""
        todo = self._done_todo()
        before = frappe.db.get_value("Project Todo", todo.name, field)
        self.assertNotEqual(
            before, new_value, f"{field}: probe value must actually differ, or this proves nothing"
        )

        todo.set(field, new_value)
        with self.assertRaises(frappe.ValidationError) as caught:
            todo.save(ignore_permissions=True)
        self.assertIn("locked once the todo leaves Planned", str(caught.exception))

        frappe.db.rollback()
        after = frappe.db.get_value("Project Todo", todo.name, field)
        self.assertEqual(after, before, f"{field} was changed on a non-Planned todo")

    # ------------------------------------------------------- the wiring test

    def test_the_guard_runs_on_save_not_just_when_called_by_hand(self):
        """THE point of this file. Everything else asserts WHAT is frozen; this asserts
        the guard is actually reached through the ordinary save path.

        Delete `self.validate_done_todo_fields()` from validate() in project_todo.py
        and this test goes red. The suite this file replaced stayed green, because
        every one of its tests invoked the method directly.
        """
        todo = self._done_todo()
        stored = frappe.db.get_value("Project Todo", todo.name, "deadline")

        todo.deadline = add_days(nowdate(), 99)
        with self.assertRaises(frappe.ValidationError):
            todo.save(ignore_permissions=True)  # no direct call to the validator anywhere

        frappe.db.rollback()
        self.assertEqual(frappe.db.get_value("Project Todo", todo.name, "deadline"), stored)

    # ------------------------------------------------------- per-field freezes

    def test_assigned_to_is_frozen(self):
        self._assert_frozen("assigned_to", self.other_user)

    def test_estimated_is_frozen(self):
        self._assert_frozen("estimated", 999)

    def test_start_date_is_frozen(self):
        self._assert_frozen("start_date", add_days(nowdate(), 3))

    def test_deadline_is_frozen(self):
        self._assert_frozen("deadline", add_days(nowdate(), 42))

    def test_ai_tag_is_frozen(self):
        self._assert_frozen("work_mode", "AI")

    def test_ai_prompt_is_frozen(self):
        self._assert_frozen("ai_prompt", '[{"name": "p1", "prompt": "x"}]')

    def test_ai_prompt_confirmed_is_frozen(self):
        self._assert_frozen("ai_prompt_confirmed", 1)

    # ------------------------------------------------------- the allowed cases

    def test_a_planned_todo_is_still_editable(self):
        """The freeze is scoped to non-Planned. If this ever fails the guard has
        stopped being a status rule and started being a blanket lock."""
        todo = self._done_todo()
        frappe.db.set_value("Project Todo", todo.name, "status", PLANNED, update_modified=False)
        frappe.db.commit()

        todo = frappe.get_doc("Project Todo", todo.name)
        todo.deadline = add_days(nowdate(), 12)
        todo.save(ignore_permissions=True)
        frappe.db.commit()

        self.assertEqual(
            str(frappe.db.get_value("Project Todo", todo.name, "deadline")),
            str(add_days(nowdate(), 12)),
        )

    def test_saving_a_done_todo_with_no_protected_change_is_allowed(self):
        """A done todo still saves when nothing a person typed changed (e.g. a workflow
        step). Since 52r6l30cs4 its title IS locked: the owner froze all of a done
        todo's information except comments (this test used to rename it)."""
        todo = self._done_todo()
        todo.save(ignore_permissions=True)  # no-change save: fine
        todo.reload()
        todo.to_do = "renamed while done"
        with self.assertRaises(frappe.ValidationError):
            todo.save(ignore_permissions=True)


if __name__ == "__main__":
    unittest.main()
