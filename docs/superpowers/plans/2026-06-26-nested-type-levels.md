# Nested Work-Type → Difficulty Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each work-type hold multiple difficulty levels (each its own %), so a todo picks type + level; points stay derived from `base_rate × estimated_minutes × difficulty%`.

**Architecture:** Keep the flat `Group Level` child table; add a `type_name` grouping column so one row = one level within a type. A todo still snapshots one row's `difficulty_percent` via `level_id`. Both React frontends share types via the `@/` alias (web `@/` → ../frontend/src). Heaviest work = the nested GroupForm editor and the two-step todo picker, mirrored across mobile + web.

**Tech Stack:** Frappe (doctype JSON, Python controller, desk JS), two React/TS frontends (`frontend/` mobile, `frontend-web/` web sharing `@/`), Frappe resource API for group reads/writes.

## Global Constraints

- LIVE single site (project.vernon.id), no test DB. Defer automated tests — verify via `bench console` + manual UI per task.
- Deploy: schema → `bench --site project.vernon.id migrate`; Python → `bench restart` (interactive sudo — the USER runs it, agents cannot; `bench console` picks up new Python without restart for verification); frontend → `npm run build` (writes live `public/`; defer all builds to the final deploy task).
- Frappe `migrate` ADDS columns but does NOT auto-drop removed ones (not relevant here — all changes additive).
- Group save uses the generic Frappe resource API → frontend payload fieldnames must EXACTLY match doctype fieldnames: child level rows carry `type_name`, `level_name`, `difficulty_percent`, optional `level_id`/`name`.
- Point formula (server + both clients): `point = base_rate_per_minute × estimated_minutes × (difficulty_percent / 100)`; `estimated` is minutes. `_compute_earned()` and Point Ledger are UNCHANGED.
- A todo's chosen level is identified by `level_id` (unique). `level_name` is NOT unique across types — never use it as the picker value or the resolution key.
- No native alert/confirm/prompt in frontends — use existing toast/dialog.

---

### Task 1: Group Level schema — add `type_name`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/group_level/group_level.json`

**Interfaces:**
- Produces: child field `type_name` (Data, reqd, in_list_view) on `Group Level`; `field_order` = `["type_name", "level_name", "level_id", "difficulty_percent"]`.

- [ ] **Step 1: Edit the JSON** — set `field_order` and add the `type_name` field. New `field_order` + `fields`:

```json
 "field_order": ["type_name", "level_name", "level_id", "difficulty_percent"],
 "fields": [
  {
   "fieldname": "type_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Type",
   "reqd": 1,
   "columns": 4
  },
  {
   "fieldname": "level_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Level",
   "reqd": 1,
   "columns": 3
  },
  {
   "fieldname": "level_id",
   "fieldtype": "Data",
   "label": "Level ID",
   "read_only": 1,
   "hidden": 1,
   "no_copy": 1
  },
  {
   "fieldname": "difficulty_percent",
   "fieldtype": "Percent",
   "in_list_view": 1,
   "label": "Difficulty %",
   "non_negative": 1,
   "reqd": 1,
   "default": "100",
   "columns": 3
  }
 ],
```

- [ ] **Step 2: Migrate** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`. Expected: completes; `type_name` column added to `tabGroup Level`.

- [ ] **Step 3: Verify** — `bench --site project.vernon.id console`:
```python
import frappe; print("type_name" in frappe.db.get_table_columns("Group Level"))
```
Expected: `True`.

- [ ] **Step 4: Commit**
```bash
git add vernon_project/vernon_project/doctype/group_level/group_level.json
git commit -m "feat(group): add type_name to Group Level (nested type→levels)"
```

---

### Task 2: Project Todo schema — add `level_type` cache

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json`

**Interfaces:**
- Produces: read-only field `level_type` (Data) on Project Todo, caching the chosen row's `type_name`.

- [ ] **Step 1: Add the field.** Find the existing `level_id` field object in `project_todo.json` (search `"fieldname": "level_id"`). Immediately after it, add:
```json
  {"fieldname": "level_type", "fieldtype": "Data", "label": "Type", "read_only": 1},
```
And add `"level_type"` to `field_order` immediately after the existing `"level_id"` entry.

- [ ] **Step 2: Migrate** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`. Expected: `level_type` column added to `tabProject Todo`.

- [ ] **Step 3: Verify** — console: `print("level_type" in frappe.db.get_table_columns("Project Todo"))` → `True`.

- [ ] **Step 4: Commit**
```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json
git commit -m "feat(todo): add level_type cache field"
```

---

### Task 3: Backend — resolve type + level, cache level_type

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py` (the `snapshot_point_from_level` method)

**Interfaces:**
- Consumes: `Group Level.type_name/level_name/difficulty_percent`, `Group.base_rate_per_minute`, `self.estimated`.
- Produces: sets `self.level` (level_name), `self.level_type` (type_name), `self.point` (computed). `_compute_earned()` unchanged.

- [ ] **Step 1: Replace `snapshot_point_from_level`** with (read the current method first to match indentation; the method currently selects `["level_name", "difficulty_percent"]`):

```python
	def snapshot_point_from_level(self):
		"""Resolve the chosen type+level and compute `point` from time × difficulty.

		Truth is `level_id` (unique per level row). `level` caches the level name,
		`level_type` caches the type name. Point is derived:
		    point = group.base_rate_per_minute × estimated_minutes × difficulty%

		- No group / nothing chosen: clear point to 0.
		- level_id resolves: refresh level + level_type, recompute point.
		- level_id stale (row deleted): keep cached level/level_type/point, no throw.
		- Legacy level name without level_id: name is not unique across types, so this
		  is a last-resort match (level_id was backfilled for all todos previously);
		  take the first match, backfill level_id, recompute. No match: keep, no throw.
		"""
		if not self.group:
			self.point = 0
			self.level = None
			self.level_type = None
			self.level_id = None
			return

		def _compute(difficulty_percent):
			base_rate = frappe.db.get_value("Group", self.group, "base_rate_per_minute") or 0
			minutes = float(self.estimated or 0)
			pct = float(difficulty_percent or 0)
			return round(float(base_rate) * minutes * (pct / 100.0), 4)

		if self.level_id:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_id": self.level_id},
				["type_name", "level_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level = row.level_name
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			# else: row deleted — keep cached level/level_type/point untouched
			return
		if self.level:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_name": self.level},
				["name", "level_id", "type_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level_id = row.level_id
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			return
		self.point = 0
```

- [ ] **Step 2: Restart not available to agent** — verify via console (fresh console loads new code from disk). `bench --site project.vernon.id console`:
```python
import frappe
g = frappe.get_doc("Group", frappe.get_all("Group", limit=1)[0].name)
g.base_rate_per_minute = 2
# ensure the first level row has a known difficulty + type
g.levels[0].type_name = g.levels[0].type_name or "T"
g.levels[0].difficulty_percent = 50
g.save(ignore_permissions=True)
t = frappe.new_doc("Project Todo")
t.group = g.name; t.estimated = 30; t.level_id = g.levels[0].level_id
t.snapshot_point_from_level()
print(t.point, t.level, t.level_type)   # expect 30.0, <level_name>, <type_name>
frappe.db.rollback()
```
Expected: `30.0` and the level/type names populated. (Rollback — no live writes persisted.)

- [ ] **Step 3: Commit**
```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(todo): snapshot type_name + level from level_id row"
```

---

### Task 4: Migration patch — existing types → type with one default level

**Files:**
- Create: `vernon_project/patches/v1_0/nest_type_levels.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Produces: every existing Group Level row gets `type_name` = its old `level_name`, and `level_name` = `'Standard'`. Idempotent (guarded on `type_name` empty).

- [ ] **Step 1: Write the patch** — `vernon_project/patches/v1_0/nest_type_levels.py`:
```python
import frappe


def execute():
	"""Each pre-existing single-difficulty type becomes a type with one default level.

	Old model: a Group Level row's `level_name` WAS the work-type (one row per type,
	difficulty_percent set). New model: `type_name` is the work-type and `level_name`
	is a difficulty level within it. Convert each old row in place:
	    type_name  <- old level_name
	    level_name <- 'Standard'
	difficulty_percent and level_id are preserved, so existing todos (which reference
	level_id) keep their points. Guarded on empty type_name so re-runs are no-ops.
	"""
	rows = frappe.db.sql(
		"SELECT name, level_name FROM `tabGroup Level` "
		"WHERE type_name IS NULL OR type_name = ''",
		as_dict=True,
	)
	for r in rows:
		frappe.db.set_value(
			"Group Level", r.name,
			{"type_name": r.level_name, "level_name": "Standard"},
			update_modified=False,
		)
```

- [ ] **Step 2: Register** — append to `vernon_project/patches.txt` under the `[post_model_sync]` section, after `vernon_project.patches.v1_0.work_type_points`:
```
vernon_project.patches.v1_0.nest_type_levels
```

- [ ] **Step 3: Run** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`. Expected: patch runs once, no error.

- [ ] **Step 4: Verify** — console:
```python
import frappe
print(frappe.db.sql("SELECT COUNT(*) FROM `tabGroup Level` WHERE type_name IS NULL OR type_name=''"))
print(frappe.db.sql("SELECT type_name, level_name, difficulty_percent FROM `tabGroup Level` LIMIT 3", as_dict=True))
```
Expected: first count `((0,),)`; sample rows show `level_name='Standard'`, `type_name` = a real work-type, difficulty preserved.

- [ ] **Step 5: Commit**
```bash
git add vernon_project/patches/v1_0/nest_type_levels.py vernon_project/patches.txt
git commit -m "chore(patch): migrate existing types to type→one default level"
```

---

### Task 5: Desk JS — two-step type·level picker mapped to level_id

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.js`

**Interfaces:**
- Consumes: `Group.levels[]` with `type_name/level_name/difficulty_percent/level_id`.
- Produces: the desk `level` select lists `${type_name} · ${level_name}` options; selecting one sets `level_id` (+ `level`, `level_type`). Server computes point.

- [ ] **Step 1: Replace the `group`/`level` handlers and `set_level_options`.** Read the current file first. The `level` field options become combined labels; keep an in-memory map from label → row. Replace the `group(frm)` and `level(frm)` handlers with:

```javascript
	async group(frm) {
		await set_level_options(frm);
		// Clear the chosen level if it no longer belongs to this group.
		if (frm.doc.level_id && !(frm._level_by_label || {})[label_of_selected(frm)]) {
			frm.set_value("level", null);
			frm.set_value("level_id", null);
			frm.set_value("level_type", null);
		}
	},

	level(frm) {
		// `level` holds the combined "Type · Level" label; resolve it to the row.
		const row = (frm._level_by_label || {})[frm.doc.level];
		if (row) {
			frm.set_value("level_id", row.level_id);
			frm.set_value("level_type", row.type_name);
		} else {
			frm.set_value("level_id", null);
			frm.set_value("level_type", null);
		}
	},
```

And replace `set_level_options` with:
```javascript
function label_of_selected(frm) {
	return frm.doc.level || "";
}

async function set_level_options(frm) {
	frm._level_by_label = {};
	if (!frm.doc.group) {
		frm.set_df_property("level", "options", [""]);
		return;
	}
	const grp = await frappe.db.get_doc("Group", frm.doc.group);
	const labels = [""];
	(grp.levels || []).forEach((row) => {
		const label = `${row.type_name} · ${row.level_name}`;
		frm._level_by_label[label] = row;
		labels.push(label);
	});
	frm.set_df_property("level", "options", labels);
}
```

- [ ] **Step 2: Static verify** — `node --check vernon_project/vernon_project/doctype/project_todo/project_todo.js` → passes. (Desk UI is verified at the final deploy task.)

- [ ] **Step 3: Commit**
```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.js
git commit -m "feat(desk): two-step type·level picker resolves to level_id"
```

---

### Task 6: Shared TS types — `type_name` on levels

**Files:**
- Modify: `frontend/src/lib/types.ts` (shared by both apps via `@/`)

**Interfaces:**
- Produces: `GroupLevel.type_name: string`; `ScoringGroupPayload` levels element gains `type_name: string`. (`GroupTodo`/detail types add `level_type?` only if a touched file needs it — see Tasks 8/10.)

- [ ] **Step 1: Edit `types.ts`.** In `interface GroupLevel` add `type_name: string` (above `level_name`). In `ScoringGroupPayload.levels` element add `type_name: string`:
```typescript
  levels: { name?: string; level_id?: string; type_name: string; level_name: string; difficulty_percent: number }[]
```
Also add `level_type?: string` to the Project-Todo detail interface used by ProjectItem screens (search for the interface carrying `point?: number` and `level?: string`; add `level_type?: string` beside `level`).

- [ ] **Step 2: Typecheck** — `cd frontend && npx tsc --noEmit`. EXPECTED: errors ONLY in the GroupForm + todo-picker files updated in Tasks 7-8 (they still reference the flat shape). Confirm `types.ts` itself has no error.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/lib/types.ts
git commit -m "feat(types): type_name on GroupLevel + payload; level_type on todo detail"
```

---

### Task 7: Mobile GroupForm — nested type→levels editor

**Files:**
- Modify: `frontend/src/pages/GroupFormScreen.tsx`

**Interfaces:**
- Consumes: shared `GroupLevel.type_name`, `ScoringGroupPayload`. Produces a nested editor: types, each with its own level rows.

The current editor is a flat list of `LevelRow { _key, name?, level_id?, level_name, difficulty_percent }`. Restructure to group by type.

- [ ] **Step 1: Read the file fully.** Note the existing helpers (`patchLevel`, `setLevelName`, `setLevelDifficulty`, `bumpLevelDifficulty`, `addLevel`, `removeLevel`, `applyStepFill`, `validate`, `save` payload, the existing-load `useEffect`, and the Sortable level list JSX).

- [ ] **Step 2: Keep a FLAT `levels` state but add `type_name` per row; render GROUPED by type.** This is the lowest-churn structure (the save payload stays a flat array the resource API expects). Concretely:
  - `LevelRow` type: add `type_name: string` → `{ _key, name?, level_id?, type_name: string, level_name: string, difficulty_percent: number }`.
  - existing-load `useEffect`: map each `l` with `type_name: l.type_name`.
  - `defaultLevels()`: one row `{ _key: tmpKey(), type_name: 'New Type', level_name: 'Standard', difficulty_percent: 100 }`.
  - `validate`: require non-empty `type_name` and `level_name`; difficulty a non-negative number; duplicate check is on the `(type_name, level_name)` PAIR, not level_name alone.
  - `save` payload: each level sends `type_name`, `level_name`, `difficulty_percent`, `name`, `level_id`.

- [ ] **Step 3: Group rendering + handlers.** Derive `const types = useMemo(() => groupByType(form.levels), [form.levels])` where `groupByType` returns an ordered list of `{ type_name, rows: LevelRow[] }` (preserve first-seen order). Render each type as a card: an editable type-name input (renames `type_name` on ALL its rows — `renameType(oldName, newName)`), the type's level rows (each: `level_name` input + `difficulty_percent` input with ± via the existing `bumpLevelDifficulty`/`setLevelDifficulty` keyed by row `_key`), an "Add level" button (`addLevelToType(type_name)` pushes a row with that `type_name`), a remove-level button per row, and a remove-type button (`removeType(type_name)` filters out all its rows). An "Add type" button pushes a row with a fresh `type_name`. Implement the helpers by `_key` (not index) to stay stable across grouping. Relabel section "Types & Levels". Keep the per-group `base_rate_per_minute` input as-is.

- [ ] **Step 4: Typecheck** — `cd frontend && npx tsc --noEmit`. Expected: no errors in `GroupFormScreen.tsx` (remaining errors only in todo-picker files, Task 8).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/GroupFormScreen.tsx
git commit -m "feat(mobile): nested type→levels group editor"
```

---

### Task 8: Mobile todo pickers — two-step Type → Level (value = level_id)

**Files:**
- Modify: `frontend/src/components/CreateProjectItemSheet.tsx`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx`

**Interfaces:**
- Consumes: `groupDoc.levels[].{type_name,level_name,difficulty_percent,level_id}`, `computeTodoPoints`.

- [ ] **Step 1: CreateProjectItemSheet — replace the single level select with two.** Read the file. Current: `level` state = level_name, submit sends `level`, preview finds by level_name. Change to:
  - Add `const [typeName, setTypeName] = useState('')`; change `level` to hold the chosen `level_id` (rename for clarity to `levelId`/`setLevelId`).
  - Reset both on group change.
  - Type select options = distinct `type_name`s: `[...new Set((groupDoc?.levels ?? []).map(l => l.type_name))].map(t => ({ value: t, label: t }))`. On change, set `typeName` and clear `levelId`.
  - Level select (disabled until a type is chosen) options = that type's rows: `(groupDoc?.levels ?? []).filter(l => l.type_name === typeName).map(l => ({ value: l.level_id!, label: \`${l.level_name} (${l.difficulty_percent}%)\` }))`. Value is `level_id`.
  - submit: require `typeName && levelId`; send `level_id: levelId` (NOT `level`). Validation toast: "group, type and level are required".
  - Preview: `const lvl = (groupDoc?.levels ?? []).find(l => l.level_id === levelId)`; `computeTodoPoints(groupDoc?.base_rate_per_minute, Number(estimated), lvl?.difficulty_percent)`.

- [ ] **Step 2: ProjectItemScreen — mirror in edit mode.** It already uses `level_id` for edit. Add a Type select above the Level select; Level select filtered to the chosen type, value = `level_id`, label `${level_name} (${difficulty_percent}%)`. Seed `typeName` from the current level's row (`groupDoc.levels.find(l => l.level_id === level_id)?.type_name`). Keep sending `level_id` on update. In the read-only detail, show `data.level_type` and `data.level` (e.g. `${data.level_type} · ${data.level}`) and keep `data.point` (`!= null`).

- [ ] **Step 3: Typecheck** — `cd frontend && npx tsc --noEmit` → 0 errors (whole mobile app clean).

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/CreateProjectItemSheet.tsx frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(mobile): two-step type→level todo picker (value=level_id)"
```

---

### Task 9: Web GroupForm — nested editor (mirror Task 7)

**Files:**
- Modify: `frontend-web/src/pages/GroupForm.tsx`

**Interfaces:** Same as Task 7. The web `GroupForm.tsx` mirrors mobile `GroupFormScreen.tsx`; shared types from `@/lib/types` are already updated (Task 6).

- [ ] **Step 1: Read both** `frontend-web/src/pages/GroupForm.tsx` and the now-complete `frontend/src/pages/GroupFormScreen.tsx`. Apply the equivalent nested-editor restructure (Task 7 Steps 2-3) to the web file, matching its own component/style conventions (`@web/` for web-local UI, `@/` for shared). The local `LevelRow` type, helpers, validate, save payload, and grouped rendering mirror Task 7.

- [ ] **Step 2: Typecheck** — `cd frontend-web && npx tsc --noEmit` → no errors in `GroupForm.tsx` (remaining errors only in web todo-picker files, Task 10).

- [ ] **Step 3: Commit**
```bash
git add frontend-web/src/pages/GroupForm.tsx
git commit -m "feat(web): nested type→levels group editor"
```

---

### Task 10: Web todo pickers — two-step Type → Level (mirror Task 8)

**Files:**
- Modify: `frontend-web/src/components/CreateProjectItemDialog.tsx`
- Modify: `frontend-web/src/pages/ProjectItem.tsx`

**Interfaces:** Same as Task 8.

- [ ] **Step 1: Read** the two web files and the now-complete mobile twins (`CreateProjectItemSheet.tsx`, `ProjectItemScreen.tsx`). Apply Task 8's two-step picker to the web files: add a Type select, filter the Level select by chosen type with value = `level_id` and label `${level_name} (${difficulty_percent}%)`, send `level_id`, preview via `computeTodoPoints`. In `ProjectItem.tsx` read-only detail, show `data.level_type · data.level` and keep `data.point != null`.

- [ ] **Step 2: Typecheck** — `cd frontend-web && npx tsc --noEmit` → 0 errors (whole web app clean).

- [ ] **Step 3: Commit**
```bash
git add frontend-web/src/components/CreateProjectItemDialog.tsx frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(web): two-step type→level todo picker"
```

---

### Task 11: Build, deploy, verify

**Files:** none (build + verify).

- [ ] **Step 1: Build both** —
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both exit 0.

- [ ] **Step 2: Deploy** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate` then the USER runs `bench restart` (sudo). Migrate is idempotent.

- [ ] **Step 3: Commit built assets** —
```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html
git commit -m "build: rebuild assets for nested type→levels"
```

- [ ] **Step 4: Manual E2E (live, after restart + cache refresh).**
  1. Group form: a type with 2 levels at distinct %s (e.g. "Backend Dev": Small 30, Large 100), set group base rate (e.g. 2), save.
  2. Create todo → pick type "Backend Dev" → level "Large (100%)", estimated 30 → preview = `2 × 30 × 100% = 60`.
  3. Save, complete on time → ledger `points_earned` = 60.
  4. A migrated type shows one "Standard" level; an old todo's points unchanged.

---

## Self-Review

- **Spec coverage:** data model — Task 1 (type_name) + Task 2 (level_type); point compute — Task 3; migration — Task 4; desk — Task 5; shared types — Task 6; GroupForm nested editor — Tasks 7 (mobile) + 9 (web); two-step picker — Tasks 8 (mobile) + 10 (web); build/deploy/verify — Task 11. All spec sections mapped.
- **Placeholder scan:** backend/schema/patch/desk/types tasks carry full code. Nested-editor + picker tasks give the exact data-model changes, the grouping transform, the value=level_id rule, and concrete option-building code; the existing files are the base and the mobile twin is the reference for web — no vague "similar to".
- **Type consistency:** `type_name` (string) and `level_type` (string, todo cache) used consistently across JSON, Python, TS types, payloads. Picker value is `level_id` everywhere. `computeTodoPoints(baseRatePerMinute, estimatedMinutes, difficultyPercent)` unchanged and called identically in all four picker sites.
