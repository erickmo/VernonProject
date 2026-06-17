# Group Points & Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Group doctype with point-scoring rules (weights, levels, late/early adjustments) and credit points to the todo assignee and project leader when a todo is completed, recorded in a Point Ledger.

**Architecture:** New Frappe doctypes (`Group`, child `Group Level`, `Point Ledger`) under the existing `vernon_project` module. `Project Todo` gains group/level/point fields and a client script to populate level options. Server-side controller logic computes earned points on the status→Completed transition and upserts ledger rows (idempotent, reversible). A post-model-sync patch creates the `Group Manager` role, seeds Groups from existing Glossary groupings, and backfills todos.

**Tech Stack:** Frappe Framework (Python controllers, DocType JSON, client-side `frappe.ui.form.on` JS), MariaDB.

## Global Constraints

- App module: `Vernon Project`; everything lives under `vernon_project/vernon_project/doctype/...`.
- This is a LIVE site, code-first. Automated tests deferred to the final phase (per project memory). Each task verifies via `bench --site project.vernon.id migrate` + manual check, not unit tests.
- Status values are exact emoji strings: `⚪️ Planned`, `🟠 Done`, `🔷 Checked By PL`, `✅ Completed`.
- All weights are **percentages** (stored as numbers; divide by 100 in math). Defaults: `weight=100`, all penalties/bonuses `=0`, `leader_weight=0`.
- **No flooring** of earned points — negative values recorded as-is.
- Leader = the todo's `project.project_leader`. Completion timestamp = `phase_completed_at` (fallback `completed_at`, then `now_datetime()`).
- Late/early in **whole days**: `late_days = max(0, completed_date − deadline)`, `early_days = max(0, deadline − completed_date)`; never both nonzero.
- `Project Detail.grouping` stays a `Glossary` link (reports join on it). Migration only backfills `Project Todo.group`.
- Bench commands assume cwd `/home/frappe/frappe-bench`. Replace site name if different.

---

### Task 1: `Group Level` child doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/group_level/group_level.json`
- Create: `vernon_project/vernon_project/doctype/group_level/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/group_level/group_level.py`

**Interfaces:**
- Produces: child table doctype `Group Level` with fields `level_name` (Data), `point` (Float). Used as the `levels` table in `Group` (Task 2) and read by Todo controller (Task 5).

- [ ] **Step 1: Create the child doctype JSON**

`vernon_project/vernon_project/doctype/group_level/group_level.json`:
```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-06-17 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["level_name", "point"],
 "fields": [
  {
   "fieldname": "level_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Level Name",
   "reqd": 1,
   "columns": 6
  },
  {
   "fieldname": "point",
   "fieldtype": "Float",
   "in_list_view": 1,
   "label": "Point",
   "non_negative": 1,
   "reqd": 1,
   "columns": 4
  }
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-06-17 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Group Level",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 2: Create empty `__init__.py`**

`vernon_project/vernon_project/doctype/group_level/__init__.py` — empty file.

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/group_level/group_level.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class GroupLevel(Document):
	pass
```

- [ ] **Step 4: Commit (defer migrate to Task 2 — child table needs a parent)**

```bash
git add vernon_project/vernon_project/doctype/group_level
git commit -m "feat: add Group Level child doctype"
```

---

### Task 2: `Group` doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/group/group.json`
- Create: `vernon_project/vernon_project/doctype/group/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/group/group.py`

**Interfaces:**
- Consumes: `Group Level` (Task 1) as the `levels` child table.
- Produces: doctype `Group`, name = `group_name` (unique). Fields: `group_name`, `description`, `weight`, `late_penalty`, `early_bonus`, `leader_weight`, `leader_late_penalty`, `leader_early_bonus` (all Percent), `levels` (Table → Group Level). Permissions grant full rights to `System Manager` and `Group Manager`; read+select to `Project Owner`, `Project Leader`, `Project Team`.

- [ ] **Step 1: Create the doctype JSON**

`vernon_project/vernon_project/doctype/group/group.json`:
```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:group_name",
 "creation": "2026-06-17 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "group_name",
  "description",
  "weights_section",
  "weight",
  "late_penalty",
  "early_bonus",
  "column_break_leader",
  "leader_weight",
  "leader_late_penalty",
  "leader_early_bonus",
  "levels_section",
  "levels"
 ],
 "fields": [
  {"fieldname": "group_name", "fieldtype": "Data", "label": "Group Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "description", "fieldtype": "Small Text", "label": "Description"},
  {"fieldname": "weights_section", "fieldtype": "Section Break", "label": "Point Weights (%)"},
  {"fieldname": "weight", "fieldtype": "Percent", "label": "Weight", "default": "100", "description": "Assignee point multiplier"},
  {"fieldname": "late_penalty", "fieldtype": "Percent", "label": "Late Penalty (per day)", "default": "0"},
  {"fieldname": "early_bonus", "fieldtype": "Percent", "label": "Early Bonus (per day)", "default": "0"},
  {"fieldname": "column_break_leader", "fieldtype": "Column Break"},
  {"fieldname": "leader_weight", "fieldtype": "Percent", "label": "Leader Weight", "default": "0", "description": "Multiplier of assignee earned"},
  {"fieldname": "leader_late_penalty", "fieldtype": "Percent", "label": "Leader Late Penalty (per day)", "default": "0"},
  {"fieldname": "leader_early_bonus", "fieldtype": "Percent", "label": "Leader Early Bonus (per day)", "default": "0"},
  {"fieldname": "levels_section", "fieldtype": "Section Break", "label": "Levels"},
  {"fieldname": "levels", "fieldtype": "Table", "label": "Levels", "options": "Group Level"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-17 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Group",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Group Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Project Owner", "read": 1, "select": 1, "report": 1, "export": 1, "print": 1},
  {"role": "Project Leader", "read": 1, "select": 1, "report": 1, "export": 1, "print": 1},
  {"role": "Project Team", "read": 1, "select": 1, "report": 1, "export": 1, "print": 1}
 ],
 "row_format": "Dynamic",
 "show_title_field_in_link": 1,
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "title_field": "group_name",
 "track_changes": 1
}
```

Note: the `Group Manager` role is referenced here but created by the patch in Task 6. Frappe tolerates a permission row for a not-yet-existing role during sync; the patch creating the role runs in the same `migrate`. If sync errors on the missing role, run Task 6's role-creation snippet first via `bench console`, then re-migrate.

- [ ] **Step 2: Create empty `__init__.py`**

`vernon_project/vernon_project/doctype/group/__init__.py` — empty file.

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/group/group.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class Group(Document):
	pass
```

- [ ] **Step 4: Migrate and verify the doctype installs**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: migrate completes without error; `Group` and `Group Level` listed in DocType.

- [ ] **Step 5: Manual smoke test**

In the desk UI (as Administrator), create a Group named `Test`, add two levels (`L1`=10, `L2`=20), save. Confirm it saves and `name` == `Test`. Then delete it.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/group
git commit -m "feat: add Group doctype with weights and levels"
```

---

### Task 3: `Point Ledger` doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`
- Create: `vernon_project/vernon_project/doctype/point_ledger/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.py`

**Interfaces:**
- Produces: doctype `Point Ledger` (autoname hash) with fields `user` (Link User), `role` (Select Assignee/Leader), `todo` (Link Project Todo), `group` (Link Group), `project` (Link Project), `level_name` (Data), `point` (Float), `late_days` (Int), `early_days` (Int), `points_earned` (Float), `credited_on` (Datetime). Written/updated by Todo controller (Task 5).

- [ ] **Step 1: Create the doctype JSON**

`vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-17 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "user", "role", "todo", "column_break_a",
  "group", "project", "level_name", "section_break_b",
  "point", "late_days", "early_days", "column_break_c",
  "points_earned", "credited_on"
 ],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "role", "fieldtype": "Select", "label": "Role", "options": "Assignee\nLeader", "reqd": 1, "in_list_view": 1},
  {"fieldname": "todo", "fieldtype": "Link", "label": "Todo", "options": "Project Todo", "reqd": 1, "search_index": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "group", "fieldtype": "Link", "label": "Group", "options": "Group"},
  {"fieldname": "project", "fieldtype": "Link", "label": "Project", "options": "Project", "search_index": 1},
  {"fieldname": "level_name", "fieldtype": "Data", "label": "Level"},
  {"fieldname": "section_break_b", "fieldtype": "Section Break"},
  {"fieldname": "point", "fieldtype": "Float", "label": "Base Point"},
  {"fieldname": "late_days", "fieldtype": "Int", "label": "Late Days"},
  {"fieldname": "early_days", "fieldtype": "Int", "label": "Early Days"},
  {"fieldname": "column_break_c", "fieldtype": "Column Break"},
  {"fieldname": "points_earned", "fieldtype": "Float", "label": "Points Earned", "in_list_view": 1},
  {"fieldname": "credited_on", "fieldtype": "Datetime", "label": "Credited On"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-17 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Point Ledger",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Group Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Project Owner", "read": 1, "report": 1, "export": 1, "print": 1},
  {"role": "Project Leader", "read": 1, "report": 1, "export": 1, "print": 1},
  {"role": "Project Team", "read": 1, "report": 1, "export": 1, "print": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 2: Create empty `__init__.py`**

`vernon_project/vernon_project/doctype/point_ledger/__init__.py` — empty file.

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/point_ledger/point_ledger.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class PointLedger(Document):
	pass
```

- [ ] **Step 4: Migrate and verify**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: completes; `Point Ledger` exists in DocType list.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/point_ledger
git commit -m "feat: add Point Ledger doctype"
```

---

### Task 4: Add point fields to `Project Todo` + level client script

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (add fields + section in `field_order`)
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.js` (populate `level` options from group)

**Interfaces:**
- Produces: Project Todo fields `group` (Link Group, reqd), `level` (Select), `point` (Float, read-only), `assignee_earned` (Float, read-only), `leader_earned` (Float, read-only). Consumed by Task 5 controller.

- [ ] **Step 1: Add a "Points" section to `field_order`**

In `project_todo.json`, in the `field_order` array, insert immediately after `"notes"`:
```json
      "points_section",
      "group",
      "level",
      "point",
      "column_break_points",
      "assignee_earned",
      "leader_earned",
```

- [ ] **Step 2: Add the field definitions**

In `project_todo.json`, add these objects to the `fields` array (anywhere; order is driven by `field_order`):
```json
      {
         "fieldname": "points_section",
         "fieldtype": "Section Break",
         "label": "Points"
      },
      {
         "fieldname": "group",
         "fieldtype": "Link",
         "label": "Group",
         "options": "Group",
         "reqd": 1,
         "in_standard_filter": 1,
         "search_index": 1
      },
      {
         "fieldname": "level",
         "fieldtype": "Select",
         "label": "Level",
         "description": "Levels come from the selected Group."
      },
      {
         "fieldname": "point",
         "fieldtype": "Float",
         "label": "Point",
         "read_only": 1,
         "description": "Base point from the chosen level."
      },
      {
         "fieldname": "column_break_points",
         "fieldtype": "Column Break"
      },
      {
         "fieldname": "assignee_earned",
         "fieldtype": "Float",
         "label": "Assignee Earned",
         "read_only": 1
      },
      {
         "fieldname": "leader_earned",
         "fieldtype": "Float",
         "label": "Leader Earned",
         "read_only": 1
      },
```

- [ ] **Step 3: Add client script to populate `level` options from the group**

In `project_todo.js`, add these handlers to the `frappe.ui.form.on("Project Todo", {...})` object. Add a helper and a `group` handler; extend `refresh` to set options on load:
```javascript
	async group(frm) {
		await set_level_options(frm);
		// Clear level/point if the previous level no longer belongs to this group.
		if (frm.doc.level && !(frm._group_levels || {}).hasOwnProperty(frm.doc.level)) {
			frm.set_value("level", null);
			frm.set_value("point", 0);
		}
	},

	level(frm) {
		const map = frm._group_levels || {};
		if (frm.doc.level && map.hasOwnProperty(frm.doc.level)) {
			frm.set_value("point", map[frm.doc.level]);
		} else {
			frm.set_value("point", 0);
		}
	},
```

At the end of the existing `refresh(frm)` body, add:
```javascript
		set_level_options(frm);
```

After the `frappe.ui.form.on(...)` block, add the helper:
```javascript
async function set_level_options(frm) {
	frm._group_levels = {};
	if (!frm.doc.group) {
		frm.set_df_property("level", "options", [""]);
		return;
	}
	const grp = await frappe.db.get_doc("Group", frm.doc.group);
	const names = [""];
	(grp.levels || []).forEach((row) => {
		frm._group_levels[row.level_name] = row.point;
		names.push(row.level_name);
	});
	frm.set_df_property("level", "options", names);
}
```

- [ ] **Step 4: Migrate so the new fields install**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: completes; new fields exist on Project Todo.

- [ ] **Step 5: Manual smoke test**

Create a Group `Smoke` with level `L1`=10. Open a Project Todo, set `group`=`Smoke`; confirm the `Level` dropdown lists `L1`. Pick `L1`; confirm `Point` shows `10`. (Don't rely on it being saved correctly yet — server snapshot is Task 5.)

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/vernon_project/doctype/project_todo/project_todo.js
git commit -m "feat: add group/level/point fields to Project Todo with level picker"
```

---

### Task 5: Point computation + ledger credit in Todo controller

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`

**Interfaces:**
- Consumes: Group weights + `Group Level` points (Tasks 1-2), Point Ledger doctype (Task 3), Todo fields (Task 4).
- Produces: on save, `point`/`assignee_earned`/`leader_earned` snapshots; on status→Completed, two Point Ledger rows (idempotent on `(todo, role)`); on reversal, ledger rows removed. New methods: `snapshot_point_from_level()`, `_compute_earned()`, `sync_point_ledger()`, `_remove_ledger()`.

- [ ] **Step 1: Add the import for the level lookup helper**

At the top of `project_todo.py`, the existing imports already include `frappe`, `_`, `now_datetime`, `getdate`. No new import needed.

- [ ] **Step 2: Snapshot point from the chosen level in `validate`**

In `project_todo.py`, add a call inside `validate(self)` after `self.sync_project_from_detail()`:
```python
		self.snapshot_point_from_level()
```
And add the method to the `ProjectTodo` class:
```python
	def snapshot_point_from_level(self):
		"""Set `point` from the chosen level row of the selected Group.

		Validates that `level` belongs to `group`. Empty level => point 0.
		"""
		if not self.group:
			self.point = 0
			self.level = None
			return
		if not self.level:
			self.point = 0
			return
		levels = frappe.get_all(
			"Group Level",
			filters={"parent": self.group, "parenttype": "Group", "level_name": self.level},
			pluck="point",
		)
		if not levels:
			frappe.throw(
				_("Level '{0}' does not belong to Group '{1}'.").format(self.level, self.group)
			)
		self.point = levels[0]
```

- [ ] **Step 3: Add the earned-points computation helper**

Add to the `ProjectTodo` class:
```python
	def _compute_earned(self):
		"""Return (assignee_earned, leader_earned, late_days, early_days).

		Uses phase_completed_at (fallback completed_at, then now) vs deadline.
		Weights are percentages. No flooring; negatives allowed.
		"""
		grp = frappe.get_doc("Group", self.group) if self.group else None
		point = float(self.point or 0)
		if not grp:
			return 0.0, 0.0, 0, 0

		completed = self.phase_completed_at or self.completed_at or now_datetime()
		completed_date = getdate(completed)
		deadline = getdate(self.deadline) if self.deadline else completed_date
		delta = (completed_date - deadline).days
		late_days = max(0, delta)
		early_days = max(0, -delta)

		w = float(grp.weight or 0) / 100.0
		lp = float(grp.late_penalty or 0) / 100.0
		eb = float(grp.early_bonus or 0) / 100.0
		assignee = point * w - late_days * lp * point + early_days * eb * point

		lw = float(grp.leader_weight or 0) / 100.0
		llp = float(grp.leader_late_penalty or 0) / 100.0
		leb = float(grp.leader_early_bonus or 0) / 100.0
		leader = (
			assignee * lw
			- late_days * llp * assignee
			+ early_days * leb * assignee
		)
		return round(assignee, 4), round(leader, 4), late_days, early_days
```

- [ ] **Step 4: Add the ledger sync + removal helpers**

Add to the `ProjectTodo` class:
```python
	def _upsert_ledger_row(self, role, user, points, late_days, early_days):
		if not user:
			return
		existing = frappe.db.exists(
			"Point Ledger", {"todo": self.name, "role": role}
		)
		values = {
			"user": user,
			"role": role,
			"todo": self.name,
			"group": self.group,
			"project": self.project,
			"level_name": self.level,
			"point": self.point,
			"late_days": late_days,
			"early_days": early_days,
			"points_earned": points,
			"credited_on": now_datetime(),
		}
		if existing:
			doc = frappe.get_doc("Point Ledger", existing)
			doc.update(values)
			doc.save(ignore_permissions=True)
		else:
			doc = frappe.get_doc({"doctype": "Point Ledger", **values})
			doc.insert(ignore_permissions=True)

	def sync_point_ledger(self):
		"""Credit assignee + leader. Idempotent on (todo, role)."""
		assignee_earned, leader_earned, late_days, early_days = self._compute_earned()
		self.db_set("assignee_earned", assignee_earned, update_modified=False)
		self.db_set("leader_earned", leader_earned, update_modified=False)

		self._upsert_ledger_row(
			"Assignee", self.assigned_to, assignee_earned, late_days, early_days
		)
		leader = None
		if self.project:
			leader = frappe.get_value("Project", self.project, "project_leader")
		self._upsert_ledger_row(
			"Leader", leader, leader_earned, late_days, early_days
		)

	def _remove_ledger(self):
		"""Delete this todo's ledger rows and clear earned snapshots."""
		for name in frappe.get_all(
			"Point Ledger", filters={"todo": self.name}, pluck="name"
		):
			frappe.delete_doc("Point Ledger", name, ignore_permissions=True, force=True)
		self.db_set("assignee_earned", 0, update_modified=False)
		self.db_set("leader_earned", 0, update_modified=False)
```

- [ ] **Step 5: Trigger credit/reversal on status change in `on_change`**

In the existing `on_change(self)` method, the block already computes `prev_state`. Extend the status-change branch:
```python
	def on_change(self):
		old = self.get_doc_before_save()
		prev_state = old.status if old else None
		if prev_state != self.status:
			self._recompute_parent()
			if self.status == "✅ Completed":
				self.sync_point_ledger()
				if self.is_recurring:
					self.create_next_occurrence()
			elif prev_state == "✅ Completed":
				self._remove_ledger()
```
(This replaces the existing `if prev_state != self.status:` body. Keep the `_recompute_parent()` call and the recurring branch as shown.)

- [ ] **Step 6: Migrate (no schema change, reloads code) and manual test**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench --site project.vernon.id clear-cache
```
Manual: create a Group `Calc` with `weight=150`, `late_penalty=10`, `early_bonus=5`, `leader_weight=20`, level `L1`=10. Create a todo in a project (note its Project Leader), set group=`Calc`, level=`L1`, deadline = today. Move status Planned→Done→Checked By PL→Completed.
- Expected `point`=10, `assignee_earned`=15 (on-time: 10*1.5), `leader_earned`=3 (15*0.2).
- Check Point Ledger: two rows (Assignee→assigned_to=15, Leader→project_leader=3).
- Revert status to Checked By PL: ledger rows for this todo gone, earned fields 0.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat: compute and credit points to Point Ledger on todo completion"
```

---

### Task 6: Migration patch — role, seed groups, backfill todos

**Files:**
- Create: `vernon_project/patches/v1_0/setup_groups_and_points.py`
- Modify: `vernon_project/patches.txt` (append patch reference)

**Interfaces:**
- Consumes: `Group` (Task 2), `Group Manager` role referenced in permissions (Task 2). 
- Produces: `Group Manager` role + Has Role for `mo@vernon.id`; one global Group per distinct Glossary grouping name; backfilled `Project Todo.group`.

- [ ] **Step 1: Create the patch**

`vernon_project/patches/v1_0/setup_groups_and_points.py`:
```python
import frappe


def execute():
	"""Set up the Group/points feature on existing data.

	1. Create the Group Manager role and assign mo@vernon.id.
	2. Seed one global Group per distinct Glossary grouping used by details.
	3. Backfill Project Todo.group from each todo's Project Detail.grouping.
	Idempotent.
	"""
	_ensure_role()
	name_map = _seed_groups()
	_backfill_todos(name_map)
	frappe.db.commit()


def _ensure_role():
	if not frappe.db.exists("Role", "Group Manager"):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": "Group Manager",
			"desk_access": 1,
		}).insert(ignore_permissions=True)
	user = "mo@vernon.id"
	if frappe.db.exists("User", user):
		existing = frappe.get_all(
			"Has Role",
			filters={"parent": user, "parenttype": "User", "role": "Group Manager"},
		)
		if not existing:
			u = frappe.get_doc("User", user)
			u.append("roles", {"role": "Group Manager"})
			u.save(ignore_permissions=True)


def _seed_groups():
	"""Return {glossary_name: group_name} for distinct groupings."""
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT pd.grouping AS grouping, g.glossary AS label
		FROM `tabProject Detail` pd
		LEFT JOIN `tabGlossary` g ON g.name = pd.grouping
		WHERE pd.grouping IS NOT NULL AND pd.grouping != ''
		""",
		as_dict=True,
	)
	name_map = {}
	for r in rows:
		# Merge duplicates: the global Group name is the human label (glossary
		# text), so the same logical group across projects collapses into one.
		group_name = (r.label or r.grouping).strip()
		if not group_name:
			continue
		if not frappe.db.exists("Group", group_name):
			frappe.get_doc({
				"doctype": "Group",
				"group_name": group_name,
				"weight": 100,
			}).insert(ignore_permissions=True)
		name_map[r.grouping] = group_name
	return name_map


def _backfill_todos(name_map):
	if not frappe.db.has_column("Project Todo", "group"):
		return
	todos = frappe.db.sql(
		"""
		SELECT pt.name AS todo, pd.grouping AS grouping
		FROM `tabProject Todo` pt
		JOIN `tabProject Detail` pd ON pd.name = pt.project_detail
		WHERE (pt.`group` IS NULL OR pt.`group` = '')
		  AND pd.grouping IS NOT NULL AND pd.grouping != ''
		""",
		as_dict=True,
	)
	for t in todos:
		group_name = name_map.get(t.grouping)
		if group_name:
			frappe.db.set_value(
				"Project Todo", t.todo, "group", group_name, update_modified=False
			)
```

- [ ] **Step 2: Register the patch**

In `vernon_project/patches.txt`, under `[post_model_sync]`, append after the last line:
```
vernon_project.patches.v1_0.setup_groups_and_points
```

- [ ] **Step 3: Run the patch**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: patch executes once without error.

- [ ] **Step 4: Verify role + seeded groups + backfill**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console
```
In the console:
```python
import frappe
print("role:", frappe.db.exists("Role", "Group Manager"))
print("mo has role:", bool(frappe.get_all("Has Role", filters={"parent": "mo@vernon.id", "role": "Group Manager"})))
print("groups:", frappe.db.count("Group"))
print("todos still null:", frappe.db.count("Project Todo", {"group": ["in", [None, ""]]}))
```
Expected: role True, mo has role True, groups > 0 (if any groupings existed), null todos limited to those whose detail had no grouping.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/patches/v1_0/setup_groups_and_points.py vernon_project/patches.txt
git commit -m "feat: patch to create Group Manager role, seed groups, backfill todos"
```

---

### Task 7: Group Manager role default permissions sanity + final verification

**Files:**
- No new code (verification + optional fixture). Confirms the end-to-end flow and that non-managers cannot edit Groups.

- [ ] **Step 1: Verify Group Manager can manage, others cannot**

As `mo@vernon.id` (Group Manager): create/edit/delete a Group — allowed.
As a Project Team user (not Group Manager): open Group list — read-only, no New/Save. Confirm.

- [ ] **Step 2: End-to-end formula spot check (late + early)**

Using Group `Calc` (`weight=150, late_penalty=10, early_bonus=5, leader_weight=20`), level `L1`=10:
- Late by 2 days: assignee = 10*1.5 − 2*0.10*10 = 15 − 2 = 13; leader = 13*0.2 = 2.6.
- Early by 3 days: assignee = 10*1.5 + 3*0.05*10 = 15 + 1.5 = 16.5; leader = 16.5*0.2 = 3.3.
Create two todos with matching deadlines/completion dates and confirm ledger values match.

- [ ] **Step 3: Negative-points check**

Group with `weight=100, late_penalty=60`, level=10, complete 2 days late: assignee = 10 − 2*0.6*10 = 10 − 12 = −2. Confirm ledger records `-2` (no flooring).

- [ ] **Step 4: Commit (docs only, if any notes added)**

```bash
git commit --allow-empty -m "chore: verify Group points end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Group doctype global + weights → Task 2. ✓
- Own levels per group, level sets point directly → Tasks 1, 2, 4, 5 (`snapshot_point_from_level`). ✓
- Point Ledger at Completed, two rows, idempotent, reversible → Tasks 3, 5. ✓
- Formula (assignee + leader, percentages, no flooring) → Task 5 `_compute_earned`. ✓
- Leader = project_leader → Task 5 `sync_point_ledger`. ✓
- Late/early days from completion vs deadline → Task 5. ✓
- `group` reqd on todo → Task 4. ✓
- Group Manager role → mo@vernon.id; only manager edits Group → Tasks 2 (perms), 6 (role), 7 (verify). ✓
- Migration: seed from Glossary groupings (merge dupes), backfill todos → Task 6. ✓
- Negative allowed → Tasks 5, 7. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✓

**Type consistency:** `snapshot_point_from_level`, `_compute_earned`, `sync_point_ledger`, `_upsert_ledger_row`, `_remove_ledger` named consistently across Tasks 5 and references. Field names (`group`, `level`, `point`, `assignee_earned`, `leader_earned`, `points_earned`, `late_days`, `early_days`) consistent between JSON (Tasks 3, 4) and controller (Task 5). ✓

**Known follow-ups (out of scope):** leaderboard/aggregate report over Point Ledger; surfacing points on the mobile UI.
