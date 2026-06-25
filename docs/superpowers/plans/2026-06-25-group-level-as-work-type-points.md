# Work-Type + Time-Based Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each Group's numeric difficulty "levels" into named work-types carrying a difficulty %, and derive a todo's points from `base_rate_per_minute × estimated_minutes × difficulty%` instead of a hand-set value.

**Architecture:** Repurpose the existing `Group Level` child doctype in place — keep fieldnames (`level_name`, `level_id`, `level`) to avoid churn across todos/ledger/endpoints; relabel UI to "Type". Replace the type's static `point` field with `difficulty_percent`. Add per-Group `base_rate_per_minute`. The todo's `point` is computed server-side at validate; `_compute_earned()` and the point ledger are unchanged. Both React frontends fetch the Group doc directly via Frappe's resource API, so they compute a live point preview client-side.

**Tech Stack:** Frappe (Python doctypes + JS desk form), two React/TypeScript frontends (`frontend/` mobile PWA, `frontend-web/` web), Frappe resource API for reads/writes.

## Global Constraints

- LIVE site (project.vernon.id), no test DB. Defer automated tests to a final phase — each task verifies manually/via `bench` console instead of pytest.
- Deploy mechanics: schema change → `bench --site project.vernon.id migrate`; Python change → `bench restart`; frontend change → `npm run build` in the relevant frontend dir.
- Never use native `alert`/`confirm`/`prompt` — use the app's dialog/toast.
- Group save goes through the generic Frappe resource API, so **frontend payload keys must exactly match doctype fieldnames** (`base_rate_per_minute`, `difficulty_percent`).
- Point formula, used everywhere (server + both clients): `point = base_rate_per_minute × estimated_minutes × (difficulty_percent / 100)`. `estimated` is already in minutes.
- Difficulty % is free entry per type (guideline ~5 tiers; not enforced).

---

### Task 1: Group Level schema — replace `point` with `difficulty_percent`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/group_level/group_level.json`

**Interfaces:**
- Produces: child field `difficulty_percent` (Percent) on `Group Level`; `level_name` relabeled "Type". Removes `point`.

- [ ] **Step 1: Edit the JSON**

Replace `field_order` and the `point` field block. New file content for the `field_order` + `fields` arrays:

```json
 "field_order": ["level_name", "level_id", "difficulty_percent"],
 "fields": [
  {
   "fieldname": "level_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Type",
   "reqd": 1,
   "columns": 6
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
   "columns": 4
  }
 ],
```

- [ ] **Step 2: Migrate**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes; `point` column dropped from `tabGroup Level`, `difficulty_percent` added.

- [ ] **Step 3: Verify the column**

Run: `bench --site project.vernon.id console` then:
```python
import frappe; print(frappe.db.get_table_columns("Group Level"))
```
Expected: list includes `difficulty_percent`, excludes `point`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/group_level/group_level.json
git commit -m "feat(group): work-type difficulty_percent replaces static point"
```

---

### Task 2: Group schema — add `base_rate_per_minute`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/group/group.json`

**Interfaces:**
- Produces: Group field `base_rate_per_minute` (Float, default 1).

- [ ] **Step 1: Edit the JSON**

In `field_order`, insert `"base_rate_per_minute"` right after `"description"`:
```json
  "group_name",
  "description",
  "base_rate_per_minute",
  "weights_section",
```

In `fields`, add after the `description` field object:
```json
  {"fieldname": "base_rate_per_minute", "fieldtype": "Float", "label": "Base Rate (points / minute)", "default": "1", "non_negative": 1, "description": "Points per estimated minute, before difficulty %"},
```

- [ ] **Step 2: Migrate**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes; `base_rate_per_minute` column added to `tabGroup`.

- [ ] **Step 3: Verify**

`bench --site project.vernon.id console`:
```python
import frappe; print("base_rate_per_minute" in frappe.db.get_table_columns("Group"))
```
Expected: `True`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/group/group.json
git commit -m "feat(group): add per-group base_rate_per_minute"
```

---

### Task 3: Backend — compute todo point from time × difficulty

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py:48-89`

**Interfaces:**
- Consumes: `Group.base_rate_per_minute`, `Group Level.difficulty_percent`, `self.estimated` (minutes).
- Produces: `self.point` computed; `self.level`/`self.level_id` resolution unchanged. `_compute_earned()` (line 214) consumes `self.point` as before — do not change it.

- [ ] **Step 1: Rewrite `snapshot_point_from_level`**

Replace the whole method (lines 48-89) with:

```python
	def snapshot_point_from_level(self):
		"""Resolve the chosen work-type and compute `point` from time × difficulty.

		Truth is `level_id`; `level` is a display cache. The type carries a
		`difficulty_percent`; the todo's points are derived, not picked:

		    point = group.base_rate_per_minute × estimated_minutes × difficulty%

		Resolution rules mirror the previous behaviour:
		- No group / no type chosen: clear point to 0.
		- Have level_id and it resolves: refresh level name, recompute point.
		- Have level_id but it no longer resolves (type deleted): keep the cached
		  level/point untouched (do NOT throw) so deleting a type can't break
		  active or historical todos.
		- Legacy: have a level name but no level_id: match by name, backfill
		  level_id, recompute. No match: keep existing point, do not throw.
		"""
		if not self.group:
			self.point = 0
			self.level = None
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
				["level_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level = row.level_name
				self.point = _compute(row.difficulty_percent)
			# else: type deleted — keep cached level/point untouched
			return
		if self.level:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_name": self.level},
				["name", "level_id", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level_id = row.level_id
				self.point = _compute(row.difficulty_percent)
			return
		self.point = 0
```

- [ ] **Step 2: Restart**

Run: `cd /home/frappe/frappe-bench && bench restart`
Expected: completes.

- [ ] **Step 3: Verify the computation**

`bench --site project.vernon.id console`:
```python
import frappe
# pick a group with a type, set a known base rate + difficulty, then:
g = frappe.get_doc("Group", "<some group>")
g.base_rate_per_minute = 2
g.levels[0].difficulty_percent = 50
g.save(); frappe.db.commit()
t = frappe.get_doc("Project Todo", "<some planned todo in that group>")
t.estimated = 30; t.level_id = g.levels[0].level_id; t.level = None
t.snapshot_point_from_level()
print(t.point)   # expect 2 * 30 * 0.50 = 30.0
```
Expected: `30.0`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(todo): compute point = base_rate × estimated_minutes × difficulty%"
```

---

### Task 4: Migration patch — backfill defaults

**Files:**
- Create: `vernon_project/patches/v1_0/work_type_points.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Consumes: nothing. Produces: every Group has `base_rate_per_minute` (default 1), every Group Level has `difficulty_percent` (default 100). Existing Project Todo rows untouched.

- [ ] **Step 1: Write the patch**

Create `vernon_project/patches/v1_0/work_type_points.py`:
```python
import frappe


def execute():
	"""Backfill defaults for the work-type/time-based points model.

	Column defaults already cover rows created during migrate, but set values
	explicitly so any pre-existing NULLs are deterministic. Existing Project
	Todo rows keep their already-snapshotted `point` — not recomputed here.
	"""
	frappe.db.sql(
		"UPDATE `tabGroup` SET base_rate_per_minute = 1 "
		"WHERE base_rate_per_minute IS NULL OR base_rate_per_minute = 0"
	)
	frappe.db.sql(
		"UPDATE `tabGroup Level` SET difficulty_percent = 100 "
		"WHERE difficulty_percent IS NULL OR difficulty_percent = 0"
	)
```

- [ ] **Step 2: Register the patch**

Append to `vernon_project/patches.txt` (under the `vernon_project.patches.v1_0` section, after the last existing v1_0 entry):
```
vernon_project.patches.v1_0.work_type_points
```

- [ ] **Step 3: Run the patch**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: patch `work_type_points` executes once, no error.

- [ ] **Step 4: Verify**

`bench --site project.vernon.id console`:
```python
import frappe
print(frappe.db.sql("SELECT COUNT(*) FROM `tabGroup` WHERE base_rate_per_minute IS NULL"))
print(frappe.db.sql("SELECT COUNT(*) FROM `tabGroup Level` WHERE difficulty_percent IS NULL"))
```
Expected: both `((0,),)`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/patches/v1_0/work_type_points.py vernon_project/patches.txt
git commit -m "chore(patch): backfill base_rate_per_minute and difficulty_percent"
```

---

### Task 5: Desk form JS — stop client-side point-setting

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.js:52-68,107-120`

**Interfaces:**
- Consumes: `Group.levels[].difficulty_percent`. Produces: desk form no longer writes `point` directly; server computes it on save.

- [ ] **Step 1: Replace the `group`/`level` handlers (lines 52-68)**

```javascript
	async group(frm) {
		await set_level_options(frm);
		// Clear the type if the previous one no longer belongs to this group.
		if (frm.doc.level && !(frm._group_levels || {}).hasOwnProperty(frm.doc.level)) {
			frm.set_value("level", null);
		}
	},

	level(frm) {
		// Point is computed server-side from estimated minutes × difficulty %.
		// Nothing to set here; the value refreshes on save.
	},
```

- [ ] **Step 2: Replace `set_level_options` (lines 107-120)**

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
		frm._group_levels[row.level_name] = row.difficulty_percent;
		names.push(row.level_name);
	});
	frm.set_df_property("level", "options", names);
}
```

- [ ] **Step 3: Verify in desk**

Reload a Project Todo in Frappe desk, pick group + type, save. Expected: no JS error; `point` populated by server after save matches the formula.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.js
git commit -m "feat(desk): type picker no longer sets point client-side"
```

---

### Task 6: Shared client point helper + mobile types

**Files:**
- Create: `frontend/src/lib/points.ts`
- Modify: `frontend/src/lib/types.ts:309-346`
- Modify: `frontend/src/hooks/useData.ts:449-457`

**Interfaces:**
- Produces: `computeTodoPoints(baseRatePerMinute, estimatedMinutes, difficultyPercent): number`; `GroupLevel.difficulty_percent`; `ScoringGroup.base_rate_per_minute`; `ScoringGroupPayload.base_rate_per_minute` + level `difficulty_percent`.

- [ ] **Step 1: Create the helper**

`frontend/src/lib/points.ts`:
```typescript
// point = base_rate_per_minute × estimated_minutes × (difficulty_percent / 100)
export function computeTodoPoints(
  baseRatePerMinute: number | null | undefined,
  estimatedMinutes: number | null | undefined,
  difficultyPercent: number | null | undefined,
): number {
  const base = Number(baseRatePerMinute) || 0
  const minutes = Number(estimatedMinutes) || 0
  const pct = Number(difficultyPercent) || 0
  return Math.round(base * minutes * (pct / 100) * 10000) / 10000
}
```

- [ ] **Step 2: Update types (`types.ts`)**

In `GroupLevel` replace `point: number` with `difficulty_percent: number`.
In `ScoringGroup` add `base_rate_per_minute: number`.
In `ScoringGroupPayload` add `base_rate_per_minute: number` and change the `levels` element type `point: number` → `difficulty_percent: number`:
```typescript
  levels: { name?: string; level_id?: string; level_name: string; difficulty_percent: number }[]
```

- [ ] **Step 3: Fetch base rate in the group list (`useData.ts:454`)**

```typescript
        fields: ['name', 'group_name', 'description', 'leader_weight', 'base_rate_per_minute'],
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: errors ONLY in files still referencing `.point` on levels (fixed in Tasks 7-8). No errors in `points.ts`/`types.ts`/`useData.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/points.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat(mobile): point helper + difficulty_percent/base_rate types"
```

---

### Task 7: Mobile GroupFormScreen — edit types + base rate

**Files:**
- Modify: `frontend/src/pages/GroupFormScreen.tsx:35-189`

**Interfaces:**
- Consumes: `ScoringGroup.base_rate_per_minute`, `GroupLevel.difficulty_percent`. Produces: a form that edits per-type `difficulty_percent` and per-group `base_rate_per_minute`.

- [ ] **Step 1: Rename `point` → `difficulty_percent` in the level row + helpers**

- `LevelRow` type (line 35): `point: number` → `difficulty_percent: number`.
- `defaultLevels` (41): `{ _key: tmpKey(), level_name: '1', difficulty_percent: 100 }`.
- Form state default (60-70): add `base_rate_per_minute: 1,` to the `useState` object.
- `existing` load (88-94): map `difficulty_percent: l.difficulty_percent,` instead of `point`, and add `base_rate_per_minute: existing.base_rate_per_minute ?? 1,` to the `setForm` object.
- Helpers (122-128): rename `setLevelPoint`→`setLevelDifficulty`, `bumpLevelPoint`→`bumpLevelDifficulty` operating on `difficulty_percent`; `addLevel` new row uses `difficulty_percent: 0`.
- `applyStepFill` (148): set `difficulty_percent: Math.max(0, (i + 1) * step)`.
- `validate` (160-161): check `l.difficulty_percent` instead of `l.point`; message "Difficulty must be a number" / "Difficulty cannot be negative".
- `save` payload (172-181): add `base_rate_per_minute: Number(form.base_rate_per_minute),` and map levels with `difficulty_percent: Number(l.difficulty_percent),` instead of `point`.

- [ ] **Step 2: Add a base-rate input + relabel level UI**

In the JSX where group fields render, add an input bound to `form.base_rate_per_minute` (use the existing `setNum('base_rate_per_minute', v)` pattern), labeled "Base rate (points / minute)". In the levels editor, relabel "Level" → "Type", the point column header → "Difficulty %", and wire the ± buttons / number input to `bumpLevelDifficulty` / `setLevelDifficulty`. The step-fill helper label becomes "Fill difficulty by step".

- [ ] **Step 3: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors in `GroupFormScreen.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/GroupFormScreen.tsx
git commit -m "feat(mobile): group form edits difficulty % and base rate"
```

---

### Task 8: Mobile todo create + edit — type label + live point preview

**Files:**
- Modify: `frontend/src/components/CreateProjectItemSheet.tsx:163-166`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx:302-308,782`

**Interfaces:**
- Consumes: `computeTodoPoints`, `groupDoc.base_rate_per_minute`, level `difficulty_percent`, `estimated`.

- [ ] **Step 1: Fix the create-sheet dropdown (`CreateProjectItemSheet.tsx:163-166`)**

Replace the numeric sort + point label:
```tsx
              options={[...(groupDoc?.levels ?? [])]
                .map((l) => ({
                  value: l.level_name,
                  label: `${l.level_name} (${l.difficulty_percent}%)`,
                }))}
```
Relabel the field "Level" → "Type" (lines 158-159) and the validation/toast text (line 58) "group and level" → "group and type".

- [ ] **Step 2: Add a point preview under the type field**

Below the type `<label>` (after line 169), add a read-only line using the helper:
```tsx
          {group && level && (() => {
            const lvl = (groupDoc?.levels ?? []).find((l) => l.level_name === level)
            const pts = computeTodoPoints(groupDoc?.base_rate_per_minute, Number(estimated), lvl?.difficulty_percent)
            return (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Estimated points: <span className="font-medium">{pts}</span>
                {!estimated && ' (set estimated minutes)'}
              </div>
            )
          })()}
```
Add `import { computeTodoPoints } from '../lib/points'` at the top.

- [ ] **Step 3: Mirror in the edit screen (`ProjectItemScreen.tsx`)**

At the type dropdown (302-308) apply the same label change (`${l.level_name} (${l.difficulty_percent}%)`, no numeric sort). At the detail display (782) show difficulty % and the computed point via `computeTodoPoints(groupDoc?.base_rate_per_minute, todo.estimated, <selected level difficulty>)`. Add the `computeTodoPoints` import.

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CreateProjectItemSheet.tsx frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(mobile): type picker shows difficulty % + live point preview"
```

---

### Task 9: Web frontend — mirror Tasks 6-8

**Files:**
- Create: `frontend-web/src/lib/points.ts`
- Modify: `frontend-web/src/lib/types.ts` (GroupLevel/ScoringGroup/ScoringGroupPayload — same edits as Task 6 Step 2)
- Modify: `frontend-web/src/hooks/useData.ts` (`useScoringGroups` fields — add `base_rate_per_minute`)
- Modify: `frontend-web/src/pages/GroupForm.tsx:36-167` (same edits as Task 7)
- Modify: `frontend-web/src/components/CreateProjectItemDialog.tsx:37,57-68,182-189` (same edits as Task 8 Steps 1-2)
- Modify: `frontend-web/src/pages/ProjectItem.tsx:385,407,431,595-601,845` (same edits as Task 8 Step 3)

**Interfaces:**
- Same as mobile. The web app mirrors the mobile structure; apply the identical code from Tasks 6-8 at the web line anchors above.

- [ ] **Step 1: Create `frontend-web/src/lib/points.ts`**

Identical content to Task 6 Step 1.

- [ ] **Step 2: Apply the type + hook edits**

Apply Task 6 Steps 2-3 to `frontend-web/src/lib/types.ts` and `frontend-web/src/hooks/useData.ts`.

- [ ] **Step 3: Apply the GroupForm edits**

Apply Task 7 to `frontend-web/src/pages/GroupForm.tsx` (its helpers live at 134-148, save at 134-167; same renames `point`→`difficulty_percent`, add `base_rate_per_minute`, relabel).

- [ ] **Step 4: Apply the create + edit todo edits**

Apply Task 8 to `frontend-web/src/components/CreateProjectItemDialog.tsx` (dropdown 182-189) and `frontend-web/src/pages/ProjectItem.tsx` (dropdown 595-601, detail display 845), adding the `computeTodoPoints` import to each.

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/lib/points.ts frontend-web/src/lib/types.ts frontend-web/src/hooks/useData.ts frontend-web/src/pages/GroupForm.tsx frontend-web/src/components/CreateProjectItemDialog.tsx frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(web): mirror work-type difficulty % + point preview"
```

---

### Task 10: Build, deploy, and manual end-to-end verification

**Files:** none (build + verify).

- [ ] **Step 1: Build both frontends**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed.

- [ ] **Step 2: Deploy**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench restart`
Expected: completes (migrate is a no-op if Tasks 1-4 already migrated; safe to re-run).

- [ ] **Step 3: Manual E2E on the live site**

1. Open a Group in the web app → set `base_rate_per_minute` (e.g. 2), edit a type to a known difficulty % (e.g. 50), save.
2. Create a Project Todo in that group with that type and `estimated = 30` minutes. Confirm the live preview shows `30` points (2 × 30 × 0.50).
3. Save, then drive it to ✅ Completed on time. In `bench console`, confirm the Point Ledger row `points_earned` for the assignee = `30` (no late/early adjustment).
4. Confirm an existing pre-change completed todo's ledger row is unchanged (historical point preserved).

- [ ] **Step 4: Commit the built assets**

```bash
git add -A
git commit -m "build: rebuild web+mobile assets for work-type points"
```

---

## Self-Review

- **Spec coverage:** Data model (Tasks 1-2), point computation (Task 3), migration/backfill→100% (Task 4), consumers — desk (5), mobile (6-8), web (9), build/deploy/manual test (10). Edge cases (no group/type/estimate → 0; deleted type keeps cache; legacy name match) covered in Task 3. All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; code shown for every code step. Web task references mobile code by exact task+step and exact line anchors (identical files), not vague "similar to".
- **Type consistency:** `difficulty_percent` (Percent/number) and `base_rate_per_minute` (Float/number) used consistently across doctype JSON, Python, TS types, payloads, and helper. `computeTodoPoints(baseRatePerMinute, estimatedMinutes, difficultyPercent)` signature identical in both frontends and at all call sites.
