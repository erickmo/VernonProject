# Project Todo → Standalone DocType Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `Project Todo` from a child table (`istable: 1`) embedded in `Project Detail` into a standalone DocType linked back to `Project Detail` by a `project_detail` Link field, preserving all existing data, workflow, recurring logic, reports, mobile PWA, and rollup statistics.

**Architecture:** `Project Todo` becomes a normal document. The implicit `parent`/`parenttype` coupling is replaced by an explicit `project_detail` Link field. Rollup fields on `Project Detail` (`todo_count`, `latest_todo`, `total_estimated`, `status`, etc.) are no longer computed from an in-memory child list during parent save; instead a single module function `recompute_detail_rollups(detail_name)` queries `tabProject Todo` and writes the rollups via `frappe.db.set_value` (no full parent save, no recursion). `Project Todo` controller hooks (`after_insert`, `on_update`, `on_trash`) call that function so the parent stays in sync whenever a task changes. The Desk grid is replaced by a dashboard "connections" link; the mobile PWA switches from child-row inserts to standalone inserts.

**Tech Stack:** Frappe Framework (Python controllers, DocType JSON, patches), MariaDB, React + Vite PWA (`frontend/`), Frappe query reports.

## Global Constraints

- App path: `/home/frappe/frappe-bench/apps/vernon_project`. All paths below are relative to it.
- Bench root: `/home/frappe/frappe-bench`. Run bench commands from there.
- Site name: discover once with `bench --site all list-apps` or use the bench default site; commands below use `$SITE` — set it first: `SITE=$(ls /home/frappe/frappe-bench/sites | grep -v assets | grep -v apps.txt | grep -v common_site_config.json | head -1)`.
- Status option strings are emoji-prefixed and MUST match exactly: `⚪️ Planned`, `🟠 Done`, `🔷 Checked By PL`, `✅ Completed`.
- **Preserve existing row names.** `Project Todo` currently uses `hash` naming for child rows. Keep `hash` autoname so existing row names stay valid — `original_todo` (recurring series) and any external reference rely on them.
- Run a single test with: `cd /home/frappe/frappe-bench && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
- Apply schema/patch changes with: `cd /home/frappe/frappe-bench && bench --site $SITE migrate`
- Commit after each task. Conventional Commits. Co-author trailer per repo convention.

---

## File Structure

**Modified:**
- `vernon_project/vernon_project/doctype/project_todo/project_todo.json` — flip `istable`, add `project_detail` Link, set autoname.
- `vernon_project/vernon_project/doctype/project_todo/project_todo.py` — `parent` → `project_detail`; rollup triggers; standalone permission query.
- `vernon_project/vernon_project/doctype/project_detail/project_detail.py` — query-based rollups; drop child delegation/restore; module-level `recompute_detail_rollups`.
- `vernon_project/vernon_project/doctype/project_detail/project_detail.json` — remove `todo` Table field.
- `vernon_project/vernon_project/doctype/project_detail/project_detail.js` — remove todo-grid customizations.
- `vernon_project/tasks.py` — recurring scheduler creates standalone docs.
- `vernon_project/api/project_todo.py` — `todo.parent` → `todo.project_detail`.
- `vernon_project/api/mobile.py` — SQL JOIN + filters `parent` → `project_detail`.
- `vernon_project/hooks.py` — register `permission_query_conditions` for `Project Todo`.
- 5 reports — JOIN `parent` → `project_detail`.
- `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts` — standalone insert.

**Created:**
- `vernon_project/patches/v1_0/migrate_project_todo_to_standalone.py` — backfill `project_detail` from `parent`.
- `vernon_project/patches/v1_0/__init__.py`, `vernon_project/patches/__init__.py` — patch packages.
- `vernon_project/vernon_project/doctype/project_detail/project_detail_dashboard.py` — connection to Project Todo.
- `vernon_project/vernon_project/doctype/project_todo/project_todo.js` — form: `project_detail` filter + `assigned_to` query.

---

## Task 1: Flip schema to standalone

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json`

**Interfaces:**
- Produces: DocType `Project Todo` with `istable: 0`, `autoname: "hash"`, and a new reqd Link field `project_detail` (options `Project Detail`) inserted first in `field_order`.

- [ ] **Step 1: Add `project_detail` field and flip flags**

In `project_todo.json`, add `"project_detail"` as the FIRST entry of `field_order` (before `"ongoing"`), and add this field object as the first element of `fields`:

```json
      {
         "fieldname": "project_detail",
         "fieldtype": "Link",
         "label": "Work Item",
         "options": "Project Detail",
         "reqd": 1,
         "in_standard_filter": 1,
         "search_index": 1
      },
```

Then change the top-level keys: set `"istable": 0`, and add `"autoname": "hash"` and `"naming_rule": "Random"` near the top-level keys (alongside `"allow_rename": 1`). Add a title for usability: `"title_field": "to_do"`.

- [ ] **Step 2: Apply migration**

Run:
```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE migrate
```
Expected: migrate completes; `Project Todo` is now a standalone DocType (no error about istable change).

- [ ] **Step 3: Verify schema in DB**

Run:
```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE console <<'PY'
import frappe
m = frappe.get_meta("Project Todo")
print("istable:", m.istable)
print("has project_detail:", bool(m.get_field("project_detail")))
PY
```
Expected: `istable: 0` and `has project_detail: True`.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json
git commit -m "feat: make Project Todo a standalone doctype (schema)"
```

---

## Task 2: Backfill `project_detail` from `parent`

After Task 1 the `parent`/`parenttype` columns still hold the old linkage for existing rows; `project_detail` is empty. This patch copies it over.

**Files:**
- Create: `vernon_project/patches/__init__.py` (empty)
- Create: `vernon_project/patches/v1_0/__init__.py` (empty)
- Create: `vernon_project/patches/v1_0/migrate_project_todo_to_standalone.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Produces: every existing `Project Todo` row has `project_detail` set to its former `parent`.

- [ ] **Step 1: Write the patch**

Create `vernon_project/patches/v1_0/migrate_project_todo_to_standalone.py`:

```python
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
```

- [ ] **Step 2: Register the patch**

In `vernon_project/patches.txt`, under the `[post_model_sync]` section, add a line at the end:

```
vernon_project.patches.v1_0.migrate_project_todo_to_standalone
```

Create the two empty `__init__.py` files (`vernon_project/patches/__init__.py` and `vernon_project/patches/v1_0/__init__.py`).

- [ ] **Step 3: Run the patch**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE migrate
```
Expected: patch runs without error.

- [ ] **Step 4: Verify backfill**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE console <<'PY'
import frappe
orphans = frappe.db.count("Project Todo", {"project_detail": ["in", [None, ""]]})
total = frappe.db.count("Project Todo")
print("total:", total, "without project_detail:", orphans)
PY
```
Expected: `without project_detail: 0` (any non-zero means rows that never had a Project Detail parent — inspect manually before proceeding).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/patches.txt vernon_project/patches/
git commit -m "feat: backfill Project Todo.project_detail from legacy parent"
```

---

## Task 3: Rewrite `Project Detail` rollups (query-based)

This task adds the module-level `recompute_detail_rollups()` that everything else will call, and rewrites `ProjectDetail` to stop iterating an in-memory child list.

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_detail/project_detail.py`
- Test: `vernon_project/vernon_project/doctype/project_detail/test_project_detail.py`

**Interfaces:**
- Produces: `recompute_detail_rollups(detail_name: str) -> None` — module function in `project_detail.py`. Queries `tabProject Todo` filtered by `project_detail = detail_name` and writes `todo_count`, `latest_todo`, `todo_without_estimation`, `total_estimated`, `total_remaining_estimated`, `status` onto the Project Detail via `frappe.db.set_value` (single call, `update_modified=False`).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

In `test_project_detail.py`, add (adapt imports at top: `import frappe`, `from vernon_project.vernon_project.doctype.project_detail.project_detail import recompute_detail_rollups`):

```python
def test_recompute_rollups_counts_standalone_todos(self):
    detail = self.make_detail()  # existing helper that creates a saved Project Detail
    for i in range(3):
        frappe.get_doc({
            "doctype": "Project Todo",
            "project_detail": detail.name,
            "to_do": f"task {i}",
            "assigned_to": self.team_user,
            "deadline": "2026-12-31",
            "estimated": 60,
            "status": "⚪️ Planned",
        }).insert(ignore_permissions=True)

    recompute_detail_rollups(detail.name)
    detail.reload()
    self.assertEqual(detail.todo_count, 3)
    self.assertEqual(detail.total_estimated, 180)
    self.assertEqual(detail.total_remaining_estimated, 180)
```

If `make_detail`/`team_user` helpers do not exist, reuse the setup already present in `test_project_detail.py` (it constructs Project + Project Detail in `setUp`); name the variables to match that file.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_detail.test_project_detail
```
Expected: FAIL — `ImportError: cannot import name 'recompute_detail_rollups'`.

- [ ] **Step 3: Add the rollup function and rewrite the controller**

Replace the body of `project_detail.py` from the class definition through `recalculate_totals` with the following. Keep the existing `get_permission_query_conditions` and `has_permission` functions at the bottom unchanged.

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class ProjectDetail(Document):

    def before_validate(self):
        # Total = price - discount
        price = self.price if self.price else 0
        discount = self.discount if self.discount else 0
        self.total = price - discount

        # Rollups from the (now standalone) Project Todo rows.
        self._apply_rollups()

    def validate(self):
        # grouping must be part of project
        if not self.grouping:
            frappe.throw("Grouping is required.")

        if not self.project:
            frappe.throw("Project is required.")

        grouping_doc = frappe.get_doc("Glossary", self.grouping)
        if grouping_doc.project != self.project:
            frappe.throw("Grouping must be part of the selected Project.")

        # glossaries must be part of grouping
        if self.glossaries:
            for glossary in self.glossaries:
                glossary_doc = frappe.get_doc("Glossary", glossary.glossary)
                if glossary_doc.project != self.project:
                    frappe.throw(
                        f"Glossary {glossary.glossary} must be part of the selected Project."
                    )

        # price >= discount
        if self.price and self.discount:
            if self.price < self.discount:
                frappe.throw("Total SOW RP cannot be less than Total Discount.")

    def on_trash(self):
        # Cannot delete a work item that still has tasks.
        if frappe.db.count("Project Todo", {"project_detail": self.name}) > 0:
            frappe.throw("Cannot delete a work item that has tasks.")

    def _apply_rollups(self):
        """Compute rollup fields onto self (in-memory) from linked Project Todos.

        Used during the Project Detail's own save. The standalone equivalent for
        out-of-band recompute (triggered by a Project Todo change) is the module
        function ``recompute_detail_rollups`` below.
        """
        stats = _todo_stats(self.name)
        self.todo_count = stats["count"]
        self.latest_todo = stats["latest_deadline"]
        self.todo_without_estimation = stats["without_estimation"]
        self.total_estimated = stats["total_estimated"]
        self.total_remaining_estimated = stats["total_remaining"]
        self.status = _derive_status(stats, self.is_pending)


def _todo_stats(detail_name):
    """Aggregate Project Todo rows for one Project Detail."""
    rows = frappe.get_all(
        "Project Todo",
        filters={"project_detail": detail_name},
        fields=["estimated", "status", "deadline"],
    )
    count = len(rows)
    total_estimated = 0
    without_estimation = 0
    total_remaining = 0
    deadlines = []
    for r in rows:
        est = r.estimated or 0
        total_estimated += est
        without_estimation += 0 if est > 0 else 1
        if r.status == "⚪️ Planned":
            total_remaining += est
        if r.deadline:
            deadlines.append(getdate(r.deadline))
    return {
        "count": count,
        "total_estimated": total_estimated,
        "without_estimation": without_estimation,
        "total_remaining": total_remaining,
        "latest_deadline": max(deadlines, default=None),
    }


def _derive_status(stats, is_pending):
    if stats["total_remaining"] == 0 and stats["count"] > 0:
        return "Completed"
    if is_pending == 1:
        return "Pending"
    return "Ongoing"


def recompute_detail_rollups(detail_name):
    """Recompute and persist Project Detail rollups from its Project Todos.

    Called by Project Todo controller hooks (after_insert / on_update / on_trash)
    so the parent stays in sync without a full parent save. Writes via a single
    db.set_value with update_modified=False to avoid touching the modified stamp
    and to avoid re-entering the Project Detail save cycle.
    """
    if not detail_name or not frappe.db.exists("Project Detail", detail_name):
        return
    stats = _todo_stats(detail_name)
    is_pending = frappe.db.get_value("Project Detail", detail_name, "is_pending")
    frappe.db.set_value(
        "Project Detail",
        detail_name,
        {
            "todo_count": stats["count"],
            "latest_todo": stats["latest_deadline"],
            "todo_without_estimation": stats["without_estimation"],
            "total_estimated": stats["total_estimated"],
            "total_remaining_estimated": stats["total_remaining"],
            "status": _derive_status(stats, is_pending),
        },
        update_modified=False,
    )
```

Note: the old `validate_assigned_to_team_member` method is dropped — assignee-to-team validation now lives on the standalone Project Todo (Task 4). The deleted-todo "restore" block and the `todo.validate()` delegation loop are removed: standalone Project Todos validate themselves and guard their own deletion.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_detail.test_project_detail
```
Expected: the new test passes. Pre-existing tests that referenced `d.todo = []` or `detail.todo[0]` will FAIL — those are rewritten in Task 5/Task 4; if a pre-existing test blocks this run, comment it with a `# TODO(standalone): rewritten in Task N` marker and note it.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_detail/project_detail.py vernon_project/vernon_project/doctype/project_detail/test_project_detail.py
git commit -m "feat: query-based rollups for Project Detail (recompute_detail_rollups)"
```

---

## Task 4: Rewrite `Project Todo` controller for standalone

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`
- Create: `vernon_project/vernon_project/doctype/project_todo/project_todo.js`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

**Interfaces:**
- Consumes: `recompute_detail_rollups` from `project_detail.py` (Task 3).
- Produces: standalone `ProjectTodo` whose `validate`/`on_change`/`on_trash`/recurring logic uses `self.project_detail` (not `self.parent`); module functions `get_permission_query_conditions(user)` and updated `has_permission(doc, ptype, user)`.

- [ ] **Step 1: Write the failing test**

In `test_project_todo.py`, the existing tests reference `self.project_detail.todo[0]`. Add a new standalone-oriented test and a helper that creates a Project Todo directly:

```python
def _make_todo(self, **overrides):
    fields = {
        "doctype": "Project Todo",
        "project_detail": self.project_detail.name,
        "to_do": "standalone task",
        "assigned_to": self.owner_user,
        "deadline": add_days(nowdate(), 5),
        "estimated": 60,
        "status": "⚪️ Planned",
    }
    fields.update(overrides)
    return frappe.get_doc(fields).insert(ignore_permissions=True)

def test_standalone_insert_links_to_detail(self):
    todo = self._make_todo()
    self.assertEqual(todo.project_detail, self.project_detail.name)
    self.assertFalse(todo.parent)  # no child linkage

def test_insert_recomputes_parent_rollup(self):
    self._make_todo(estimated=120)
    self.project_detail.reload()
    self.assertGreaterEqual(self.project_detail.total_estimated, 120)
```

(`owner_user` / `self.project_detail` come from the existing `setUp`; if `setUp` builds the detail with embedded `todo` rows, change it to insert standalone Project Todos via `_make_todo` instead.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: FAIL (rollup not triggered / `parent` assertions).

- [ ] **Step 3: Rewrite the controller**

Apply these edits to `project_todo.py`:

(a) Replace the `get_old_doc` docstring/body — `get_doc_before_save()` now works normally for standalone docs, so simplify:

```python
    def get_old_doc(self):
        """Return the previously-saved version, or None for new docs."""
        old_doc = self.get_doc_before_save()
        if old_doc:
            return old_doc
        if self.is_new() or not self.name:
            return None
        if not frappe.db.exists("Project Todo", self.name):
            return None
        return frappe.get_doc("Project Todo", self.name)
```

(b) In `validate_create_permission`, replace the `parent` lookups:

```python
        if not self.project_detail:
            frappe.throw(_("Task must belong to a work item"), frappe.PermissionError)
        project_name = frappe.get_value("Project Detail", self.project_detail, "project")
```

(c) Add assignee-to-team validation into `validate()` (it moved off Project Detail). Add a new method and call it from `validate`:

```python
    def validate(self):
        self.validate_create_permission()
        self.validate_assigned_to_team_member()
        self.validate_done_todo_fields()
        self.validate_project_admin_status_update()
        self.calculate_total_estimated_hours()
        self.track_phase_changes()
        if self.is_recurring and self.recurring_frequency and not self.next_occurrence:
            self.next_occurrence = self.calculate_next_occurrence(self.deadline)

    def validate_assigned_to_team_member(self):
        if not self.assigned_to or not self.project_detail:
            return
        project_name = frappe.get_value("Project Detail", self.project_detail, "project")
        if not project_name:
            return
        team = frappe.get_all(
            "Project Team",
            filters={"parent": project_name, "parenttype": "Project"},
            pluck="user",
        )
        if self.assigned_to not in team:
            frappe.throw(
                f"Assigned To '{self.assigned_to}' in ToDo '{self.to_do}' "
                "is not a member of the Project Team."
            )
```

(d) In `validate_project_admin_status_update`, replace the `self.parent` block:

```python
        if not self.project_detail:
            return
        parent_detail = frappe.get_doc("Project Detail", self.project_detail)
```

(e) Replace `on_change`, `on_trash`, and add rollup hooks:

```python
    def after_insert(self):
        self._recompute_parent()

    def on_change(self):
        old = self.get_doc_before_save()
        prev_state = old.status if old else None
        if prev_state != self.status:
            self._recompute_parent()
            if self.status == "✅ Completed" and self.is_recurring:
                self.create_next_occurrence()

    def on_trash(self):
        # Cannot delete unless status is Planned ("Scheduled").
        if self.status != "⚪️ Planned":
            frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled'.")

    def after_delete(self):
        self._recompute_parent()

    def _recompute_parent(self):
        from vernon_project.vernon_project.doctype.project_detail.project_detail import (
            recompute_detail_rollups,
        )
        recompute_detail_rollups(self.project_detail)
```

Note: the old `on_change` did `parent.save()` to recompute rollups — that whole-parent save is replaced by `_recompute_parent()`. The old `on_trash` guard that blocked deletion when "linked to a Project Detail" is removed (every todo is now linked; the meaningful guard is the status check).

(f) In `create_next_occurrence`, replace the parent-append block (lines that did `parent_doc = frappe.get_doc("Project Detail", self.parent)` / `parent_doc.append(...)` / `parent_doc.save()`) with a standalone insert:

```python
        frappe.get_doc({
            "doctype": "Project Todo",
            "project_detail": self.project_detail,
            "to_do": self.to_do,
            "assigned_to": self.assigned_to,
            "deadline": next_date,
            "estimated": self.estimated,
            "notes": self.notes,
            "is_recurring": 1,
            "recurring_frequency": self.recurring_frequency,
            "recurring_until": self.recurring_until,
            "next_occurrence": self.calculate_next_occurrence(next_date),
            "original_todo": self.original_todo or self.name,
            "status": "⚪️ Planned",
        }).insert(ignore_permissions=True)

        frappe.db.set_value("Project Todo", self.name, "next_occurrence", None, update_modified=False)
        frappe.msgprint(f"Next recurring todo created with deadline: {next_date}")
```

(g) Replace the permissions section at the bottom with a standalone permission query plus updated `has_permission`:

```python
# --------------------------------------------------------------------------------
# PERMISSIONS  (Project Todo is now a standalone doctype.)
# --------------------------------------------------------------------------------

def get_permission_query_conditions(user):
    if not user or user == "Guest":
        return ""
    if "System Manager" in frappe.get_roles(user):
        return ""
    user_esc = frappe.db.escape(user)
    return f"""
        EXISTS (
            SELECT 1
            FROM `tabProject Detail` pd
            JOIN `tabProject` p ON p.name = pd.project
            WHERE pd.name = `tabProject Todo`.project_detail
                AND (
                    p.project_owner = {user_esc}
                    OR p.project_leader = {user_esc}
                    OR p.project_admin = {user_esc}
                    OR EXISTS (
                        SELECT 1 FROM `tabProject Team` pt
                        WHERE pt.parent = p.name AND pt.user = {user_esc}
                    )
                )
        )
    """


def has_permission(doc, ptype, user):
    if "System Manager" in frappe.get_roles(user):
        return True
    if not doc.project_detail:
        return False
    parent_detail = frappe.get_doc("Project Detail", doc.project_detail)
    if not parent_detail.project:
        return False
    project = frappe.get_doc("Project", parent_detail.project)
    if user in (project.project_owner, project.project_leader, project.project_admin):
        return True
    if any(t.user == user for t in project.team_members):
        return True
    return False
```

- [ ] **Step 4: Add form JS**

Create `vernon_project/vernon_project/doctype/project_todo/project_todo.js`:

```javascript
// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Todo", {
	refresh(frm) {
		// Limit assigned_to to members of the work item's project team.
		frm.set_query("assigned_to", function () {
			if (!frm.doc.project_detail) {
				return {};
			}
			return {
				query: "vernon_project.vernon_project.doctype.project_todo.project_todo.assignable_users",
				filters: { project_detail: frm.doc.project_detail },
			};
		});
	},
});
```

And append a whitelisted query helper to `project_todo.py`:

```python
@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def assignable_users(doctype, txt, searchfield, start, page_len, filters):
    project_detail = filters.get("project_detail")
    if not project_detail:
        return []
    project = frappe.get_value("Project Detail", project_detail, "project")
    if not project:
        return []
    users = frappe.get_all(
        "Project Team",
        filters={"parent": project, "parenttype": "Project"},
        pluck="user",
    )
    if not users:
        return []
    like = f"%{txt}%"
    return frappe.db.sql(
        """SELECT name, full_name FROM `tabUser`
           WHERE name IN %(users)s AND (name LIKE %(like)s OR full_name LIKE %(like)s)
           LIMIT %(start)s, %(page_len)s""",
        {"users": tuple(users), "like": like, "start": start, "page_len": page_len},
    )
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: new tests pass. Rewrite any remaining `self.project_detail.todo[0]` references in this file to use `_make_todo` + `frappe.db.set_value`/`todo.save()` on the standalone doc; status-advance tests now load the Project Todo by name and save it directly.

- [ ] **Step 6: Register the permission query in hooks**

In `hooks.py`, add to the `permission_query_conditions` dict:

```python
    "Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.get_permission_query_conditions",
```

(The existing `has_permission` entry for `Project Todo` stays.)

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_todo/ vernon_project/hooks.py
git commit -m "feat: Project Todo standalone controller (project_detail link, rollup hooks, perms)"
```

---

## Task 5: Remove the `todo` Table field + Desk UX

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_detail/project_detail.json`
- Modify: `vernon_project/vernon_project/doctype/project_detail/project_detail.js`
- Create: `vernon_project/vernon_project/doctype/project_detail/project_detail_dashboard.py`
- Test: `vernon_project/vernon_project/doctype/project_detail/test_project_detail.py`

**Interfaces:**
- Produces: Project Detail Desk form no longer embeds a todo grid; it shows a "Project Todo" connection (count badge + New button filtered by `project_detail`).

- [ ] **Step 1: Remove the Table field**

In `project_detail.json`, remove `"todo"` from `field_order` and delete the field object:

```json
   {
      "fieldname": "todo",
      "fieldtype": "Table",
      "options": "Project Todo"
   }
```

Keep `todo_section`, `todo_tab`, and the rollup fields (`todo_count`, etc.) — they still display. (Optionally relabel the now-empty tab; not required.)

- [ ] **Step 2: Add the dashboard connection**

Create `vernon_project/vernon_project/doctype/project_detail/project_detail_dashboard.py`:

```python
from frappe import _


def get_data():
    return {
        "fieldname": "project_detail",
        "transactions": [
            {"label": _("Tasks"), "items": ["Project Todo"]},
        ],
    }
```

- [ ] **Step 3: Strip todo-grid JS**

In `project_detail.js`, remove the `grid-row-render` handler block (the `frm.fields_dict["todo"].grid...` section ~lines 22-29), the `frm.doc.todo.sort(...)` / `frm.refresh_field("todo")` block (~lines 41-55), and the `frm.set_query("assigned_to", "todo", ...)` block (~line 86). These all reference the removed child grid. Leave any non-todo form logic intact.

- [ ] **Step 4: Migrate + manual verify**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE migrate && bench --site $SITE clear-cache
```
Expected: migrate ok. Open a Project Detail in Desk → no todo grid; a "Tasks" connection appears showing the linked Project Todos with a count and a `+ New` button. Creating one there prefills `project_detail`.

- [ ] **Step 5: Fix any pre-existing test that set `doc.todo`**

In `test_project_detail.py`, replace constructions that did `d.todo = [...]` / `d.append("todo", ...)` with standalone `frappe.get_doc({"doctype": "Project Todo", "project_detail": d.name, ...}).insert(...)`. Run:

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_detail.test_project_detail
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_detail/
git commit -m "feat: replace Project Detail todo grid with Project Todo connection"
```

---

## Task 6: Recurring scheduler creates standalone docs

**Files:**
- Modify: `vernon_project/tasks.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` (add scheduler test)

**Interfaces:**
- Consumes: standalone `Project Todo` (Task 4).
- Produces: `create_recurring_todos()` rewritten to query and insert standalone docs (no parent doc).

- [ ] **Step 1: Write the failing test**

Add to `test_project_todo.py`:

```python
def test_scheduler_spawns_standalone_occurrence(self):
    from vernon_project.tasks import create_recurring_todos
    head = self._make_todo(
        is_recurring=1,
        recurring_frequency="Daily",
        deadline=add_days(nowdate(), -1),
    )
    frappe.db.set_value("Project Todo", head.name, "next_occurrence", nowdate())
    before = frappe.db.count("Project Todo", {"project_detail": self.project_detail.name})
    create_recurring_todos()
    after = frappe.db.count("Project Todo", {"project_detail": self.project_detail.name})
    self.assertEqual(after, before + 1)
    self.assertIsNone(frappe.db.get_value("Project Todo", head.name, "next_occurrence"))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: FAIL (old scheduler reads `pt.parent` / appends to parent doc).

- [ ] **Step 3: Rewrite `tasks.py`**

Replace the body of `create_recurring_todos` with:

```python
import frappe
from frappe.utils import getdate, nowdate


def create_recurring_todos():
    """Daily: roll recurring Project Todos forward (standalone doctype).

    When a recurring todo's `next_occurrence` has arrived, create the next
    occurrence regardless of the current one's status, then clear the head's
    next_occurrence so it processes exactly once.
    """
    today = nowdate()

    heads = frappe.db.sql(
        """
        SELECT name, project_detail, to_do, assigned_to, deadline, estimated,
               notes, recurring_frequency, recurring_until, next_occurrence,
               original_todo, status
        FROM `tabProject Todo`
        WHERE is_recurring = 1
          AND recurring_frequency IS NOT NULL
          AND recurring_frequency != ''
          AND next_occurrence IS NOT NULL
          AND next_occurrence <= %s
        """,
        (today,),
        as_dict=True,
    )

    created_count = 0

    for h in heads:
        try:
            next_date = h.next_occurrence

            if h.recurring_until and getdate(next_date) > getdate(h.recurring_until):
                frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)
                continue

            exists = frappe.db.exists("Project Todo", {
                "project_detail": h.project_detail,
                "to_do": h.to_do,
                "deadline": next_date,
                "assigned_to": h.assigned_to,
            })

            if not exists:
                head_doc = frappe.get_doc("Project Todo", h.name)
                following = head_doc.calculate_next_occurrence(next_date)
                frappe.get_doc({
                    "doctype": "Project Todo",
                    "project_detail": h.project_detail,
                    "to_do": h.to_do,
                    "assigned_to": h.assigned_to,
                    "deadline": next_date,
                    "estimated": h.estimated,
                    "notes": h.notes,
                    "is_recurring": 1,
                    "recurring_frequency": h.recurring_frequency,
                    "recurring_until": h.recurring_until,
                    "next_occurrence": following,
                    "original_todo": h.original_todo or h.name,
                    "status": "⚪️ Planned",
                }).insert(ignore_permissions=True)
                created_count += 1

            frappe.db.set_value("Project Todo", h.name, "next_occurrence", None, update_modified=False)

        except Exception as e:
            frappe.log_error(f"Error creating recurring todo: {str(e)}", "Recurring Todo Error")
            continue

    if created_count > 0:
        frappe.db.commit()
        frappe.logger().info(f"Created {created_count} recurring todos")

    return created_count
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/tasks.py vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat: recurring scheduler inserts standalone Project Todos"
```

---

## Task 7: Fix API endpoints

**Files:**
- Modify: `vernon_project/api/project_todo.py`
- Modify: `vernon_project/api/mobile.py`

**Interfaces:**
- Consumes: standalone `Project Todo` with `project_detail` (Tasks 1-4).
- Produces: `update_status`, `save_notes`, mobile `_fetch_todos` and assignee filters all resolve the work item via `project_detail`.

- [ ] **Step 1: Fix `api/project_todo.py`**

In both `update_status` and `save_notes`, replace:

```python
		project_detail = frappe.get_doc("Project Detail", todo.parent)
```
with:
```python
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
```

- [ ] **Step 2: Fix `api/mobile.py` JOIN**

In `_fetch_todos`, change the JOIN condition:

```python
		JOIN `tabProject Detail` pd
			ON t.project_detail = pd.name
```
(removing the `AND t.parenttype = 'Project Detail'` clause).

- [ ] **Step 3: Fix `api/mobile.py` assignee filter**

At the assignee-by-project query (~line 326) change the filter key and pluck:

```python
			filters={"project_detail": ["in", names], "user": user},
			pluck="project_detail",
```
Then audit the rest of `mobile.py` for any other `"parent"` filter / `t.parent` / `parenttype` referencing Project Todo and switch to `project_detail`:

```bash
grep -n "parent\|parenttype" vernon_project/api/mobile.py
```
Fix each Project-Todo-related hit (leave Project Team `parent` joins alone).

- [ ] **Step 4: Smoke-test the mobile dashboard endpoint**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE execute vernon_project.api.mobile._fetch_todos --kwargs "{'project_names': []}"
```
Expected: returns `[]` (no SQL error). Then run the existing mobile test module:
```bash
bench --site $SITE run-tests --module vernon_project.api.test_mobile
```
Expected: PASS (fix any residual `parent` references the failures surface).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/project_todo.py vernon_project/api/mobile.py
git commit -m "fix: API resolves Project Todo work item via project_detail"
```

---

## Task 8: Fix reports

**Files:**
- Modify: `vernon_project/vernon_project/report/daily_assignment_report/daily_assignment_report.py`
- Modify: `vernon_project/vernon_project/report/daily_performance_report/daily_performance_report.py`
- Modify: `vernon_project/vernon_project/report/progress_report/progress_report.py`
- Modify: `vernon_project/vernon_project/report/project_todo_deadline_report/project_todo_deadline_report.py`
- Modify: `vernon_project/vernon_project/report/todo_report/todo_report.py`

**Interfaces:**
- Consumes: `project_detail` column on `tabProject Todo`.

- [ ] **Step 1: Replace each parent JOIN**

In `daily_assignment_report.py`, `daily_performance_report.py`, `project_todo_deadline_report.py` replace:
```sql
JOIN `tabProject Detail` AS detail ON todo.parent = detail.name
```
with:
```sql
JOIN `tabProject Detail` AS detail ON todo.project_detail = detail.name
```

In `progress_report.py` and `todo_report.py` replace:
```sql
`tabProject Detail` pd on pt.parent = pd.name
```
with:
```sql
`tabProject Detail` pd on pt.project_detail = pd.name
```

- [ ] **Step 2: Run each report once**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1)
for r in "Daily Assignment Report" "Daily Performance Report" "Progress Report" "Project Todo Deadline Report" "Todo Report"; do
  bench --site $SITE execute frappe.desk.query_report.run --kwargs "{'report_name': '$r', 'filters': {}}" >/dev/null && echo "OK: $r" || echo "FAIL: $r"
done
```
Expected: `OK:` for all five (no SQL "unknown column parent" error). Some reports may require filters — if one errors on a *missing filter* rather than SQL, that is acceptable; confirm the error is not about `parent`.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/report/
git commit -m "fix: reports join Project Todo via project_detail"
```

---

## Task 9: Fix mobile PWA task creation + rebuild bundle

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Consumes: standalone `Project Todo` insert (no parent context).

- [ ] **Step 1: Fix `createTask` payload**

In `frontend/src/lib/api.ts`, change `createTask`:

```typescript
  createTask: (fields: Record<string, unknown>) =>
    api.post('frappe.client.insert', {
      doc: JSON.stringify({
        doctype: 'Project Todo',
        status: '⚪️ Planned',
        ...fields,
      }),
    }),
```
(remove `parenttype` and `parentfield`).

- [ ] **Step 2: Fix the caller**

In `frontend/src/hooks/useData.ts:149`, change:
```typescript
      mobileApi.createTask({ parent: workItem, ...fields }),
```
to:
```typescript
      mobileApi.createTask({ project_detail: workItem, ...fields }),
```

- [ ] **Step 3: Build the bundle**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds; new hashed `index-*.js` written to `vernon_project/public/frontend/assets/`, and `m.html` copied. Then:
```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE clear-cache && bench build --app vernon_project
```

- [ ] **Step 4: Manual verify**

Open `/m` in a browser as a Project Owner/Leader, create a task on a work item. Expected: task is created, appears in the list, and the work item's todo count updates (rollup via `after_insert`).

- [ ] **Step 5: Commit (include built assets per repo convention)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts vernon_project/public/frontend vernon_project/www/m.html
git commit -m "feat: PWA creates standalone Project Todo; rebuild bundle"
```

---

## Task 10: Full regression + cleanup

**Files:**
- Modify: any test file still referencing child-table access (`.todo[`, `add_child`, `append("todo"`).

- [ ] **Step 1: Grep for leftover child-table coupling**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -rn "\.todo\[\|append(\"todo\"\|append('todo'\|parenttype.*Project Todo\|\.parent\b" \
  --include=*.py vernon_project/ | grep -iv "project team\|tabProject Team"
```
Expected: no remaining hits that refer to Project Todo as a child. Fix any that remain (rewrite to standalone query/insert).

- [ ] **Step 2: Run the whole app test suite**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE run-tests --app vernon_project
```
Expected: all tests pass.

- [ ] **Step 3: Full migrate on a clean cache**

```bash
cd /home/frappe/frappe-bench && SITE=$(ls sites | grep -vE 'assets|apps.txt|common_site_config.json' | head -1) && bench --site $SITE migrate && bench --site $SITE clear-cache
```
Expected: clean.

- [ ] **Step 4: Manual end-to-end smoke**

In Desk: create a Project Todo from the work item's "Tasks" connection; advance its status through Planned → Done → Checked By PL → Completed (via the mobile API or the form); confirm phase timestamps populate and the Project Detail rollups (`todo_count`, `total_estimated`, `status`) update. Delete a Planned task → allowed; try deleting a Done task → blocked.

- [ ] **Step 5: Commit any cleanup**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A
git commit -m "test: finish Project Todo standalone migration regression"
```

---

## Self-Review Notes

- **Schema/data:** Task 1 (flip + field) and Task 2 (backfill) cover the DB move; `hash` autoname preserves names so `original_todo` links survive.
- **Rollups:** Task 3 centralizes them in `recompute_detail_rollups`; Task 4 wires the Project Todo hooks to call it. No more whole-parent save on every status change.
- **Workflow/permissions:** Task 4 moves `parent` → `project_detail` across validate/permission code and adds a real `permission_query_conditions` (now possible for a standalone doctype) registered in Task 4 Step 6.
- **Recurring:** Tasks 4(f) and 6 both create standalone occurrences (form-driven completion + daily scheduler).
- **Consumers:** APIs (Task 7), reports (Task 8), PWA (Task 9). `pt.parent` hits in `glossary.py`/`project.py` are Project **Team** joins — intentionally untouched.
- **UX gap closed:** Task 5 removes the grid and adds the dashboard connection so Desk users can still see/add tasks.
- **Type consistency:** `recompute_detail_rollups(detail_name)`, `_todo_stats(detail_name)`, `_derive_status(stats, is_pending)` names are used identically across Tasks 3-6. Field name `project_detail` is used identically everywhere.
