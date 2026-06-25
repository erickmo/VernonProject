# Editable / Reorderable Group Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Group's levels full CRUD (add / rename / edit point / delete) with drag-and-drop reorder, and have todos reference levels by a stable `level_id` so rename/reorder/delete never orphan scoring; the todo level picker follows the group's order.

**Architecture:** Add a stable `level_id` to the `Group Level` child table (auto-assigned, immutable). `Project Todo` gains `level_id` (the source of truth) and keeps `level` as a cached display name. Backend scoring resolves point + refreshes the cached name from `level_id`, degrading gracefully when a level was deleted. Both React apps (web `frontend-web`, mobile `frontend`) share types/hooks/components from `frontend/src`; the level editor becomes an editable, reorderable list via a shared pointer-based `Sortable` component; the pickers iterate the group's `idx` order and store `level_id`.

**Tech Stack:** Frappe (Python doctypes + patches), React 18 + TypeScript + Vite (two apps), TanStack Query, Tailwind, lucide-react. No new dependencies.

## Global Constraints

- **Live site, no test DB.** Tests are deferred to a final phase (project convention). Each task therefore ends with a concrete runtime verification (bench migrate / restart / build / manual check) instead of a unit test. This is a deliberate, documented deviation from default TDD.
- **No native `alert/confirm/prompt`** — use the existing dialog/toast/`useConfirm` primitives.
- **Schema changes require `bench --site project.vernon.id migrate`; Python changes require `bench restart`; frontend changes require `npm run build` per app.**
- **Shared layer lives in `frontend/src`** (`@/` → `frontend/src`, `@web/` → `frontend-web/src`). Types, hooks, and the new `Sortable` go in `frontend/src` and are imported by both apps.
- **Two apps, kept in parity:** every frontend behavior change applies to BOTH `frontend-web/src/pages/GroupForm.tsx` + `frontend-web/src/pages/ProjectItem.tsx` AND `frontend/src/pages/GroupFormScreen.tsx` + `frontend/src/pages/ProjectItemScreen.tsx`.
- **Web layout convention:** `/w` pages use `PageGrid`/`FieldGrid`/`SectionCard` (already in `GroupForm.tsx`); keep it.
- **Build output:** web → `vernon_project/public/frontend_web`, mobile → `vernon_project/public/frontend`; `npm run build` also runs `copy-html` (updates `www/w.html` / `www/m.html` + `public/.../index.html`).

---

### Task 1: Schema — `level_id` on Group Level + Project Todo, auto-assign on Group save

**Files:**
- Modify: `vernon_project/vernon_project/doctype/group_level/group_level.json`
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json:178-185` (the `level` field) — add `level_id`, change `level` fieldtype
- Modify: `vernon_project/vernon_project/doctype/group/group.py`

**Interfaces:**
- Produces: `Group Level.level_id` (Data, stable), `Project Todo.level_id` (Data), `Project Todo.level` (now Data, cached display name). `Group.validate()` fills missing `level_id` on each level row via `frappe.generate_hash(length=10)`.

- [ ] **Step 1: Add `level_id` to Group Level**

In `group_level.json`, add to `field_order` (after `level_name`, before `point` is fine; order only affects desk grid) and to `fields`:

```json
"field_order": ["level_name", "level_id", "point"],
```
```json
{
 "fieldname": "level_id",
 "fieldtype": "Data",
 "label": "Level ID",
 "read_only": 1,
 "hidden": 1,
 "no_copy": 1
}
```

- [ ] **Step 2: Add `level_id` to Project Todo and make `level` a Data cache**

In `project_todo.json`, change the `level` field from `Select` to `Data` and add `level_id` right after it. Add `level_id` to the `field_order` array (insert `"level_id"` immediately after `"level"` near line 24).

Replace the `level` field block (currently lines ~179-185) with:

```json
{
   "fieldname": "level",
   "fieldtype": "Data",
   "label": "Level",
   "reqd": 1,
   "description": "Cached display name of the chosen level (refreshed from the group)."
},
{
   "fieldname": "level_id",
   "fieldtype": "Data",
   "label": "Level ID",
   "read_only": 1,
   "no_copy": 1,
   "in_standard_filter": 1,
   "description": "Stable reference to the chosen Group Level row."
}
```

- [ ] **Step 3: Auto-assign `level_id` in the Group controller**

Replace the body of `group.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Group(Document):
	def validate(self):
		for row in self.levels:
			if not row.level_id:
				row.level_id = frappe.generate_hash(length=10)
```

- [ ] **Step 4: Sync schema**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; new columns exist. Verify:

Run: `bench --site project.vernon.id console`
```python
import frappe
print("level_id" in frappe.get_meta("Group Level").get_valid_columns())
print("level_id" in frappe.get_meta("Project Todo").get_valid_columns())
print(frappe.get_meta("Project Todo").get_field("level").fieldtype)
```
Expected: `True`, `True`, `Data`.

- [ ] **Step 5: Verify auto-assign works**

Run in `bench --site project.vernon.id console`:
```python
import frappe
g = frappe.get_all("Group", limit=1, pluck="name")[0]
doc = frappe.get_doc("Group", g)
doc.save()           # triggers validate(); existing rows still blank until patch, new edits get ids
frappe.db.rollback() # do not persist; just confirm no error
print("ok")
```
Expected: `ok`, no exception.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/group_level/group_level.json vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/vernon_project/doctype/group/group.py
git commit -m "feat(groups): add stable level_id to Group Level and Project Todo"
```

---

### Task 2: Backend scoring — resolve point/name by `level_id`, graceful on delete; recurring clone

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py:48-69` (`snapshot_point_from_level`)
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py:558-572` (recurring clone dict)

**Interfaces:**
- Consumes: `Group Level.level_id` (Task 1).
- Produces: after `validate()`, `self.point` and `self.level` (display name) are derived from `self.level_id`; `Point Ledger.level_name` (set at `:240` from `self.level`) is the freshly-refreshed name.

- [ ] **Step 1: Rewrite `snapshot_point_from_level`**

Replace lines 48-69 with:

```python
	def snapshot_point_from_level(self):
		"""Resolve `point` and refresh the cached `level` name from `level_id`.

		Truth is `level_id`; `level` is a display cache. Resolution rules:
		- No group: clear everything.
		- Have level_id and it resolves: set point + refresh level name.
		- Have level_id but it no longer resolves (level was deleted): keep the
		  existing point/name as-is (do NOT throw) so deleting a level can't
		  break active or historical todos.
		- Legacy: have a level name but no level_id: match by name, backfill
		  level_id, set point. No match: keep existing point, do not throw.
		- Nothing chosen: point 0.
		"""
		if not self.group:
			self.point = 0
			self.level = None
			self.level_id = None
			return
		if self.level_id:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_id": self.level_id},
				["level_name", "point"],
				as_dict=True,
			)
			if row:
				self.level = row.level_name
				self.point = row.point
			# else: level deleted — keep cached level/point untouched
			return
		if self.level:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_name": self.level},
				["name", "level_id", "point"],
				as_dict=True,
			)
			if row:
				self.level_id = row.level_id
				self.point = row.point
			return
		self.point = 0
```

- [ ] **Step 2: Copy `level_id` in the recurring clone**

In the recurring-clone dict (around line 565, where `"level": self.level,` appears), add `level_id`:

```python
			"group": self.group,
			"level": self.level,
			"level_id": self.level_id,
```

- [ ] **Step 3: Apply Python changes**

Run: `bench restart`
Expected: completes without error.

- [ ] **Step 4: Verify scoring resolves by id**

Run in `bench --site project.vernon.id console`:
```python
import frappe
# pick a group with at least one level
g = frappe.get_all("Group", limit=20, pluck="name")
g = next(n for n in g if frappe.get_all("Group Level", filters={"parent": n}, limit=1))
gdoc = frappe.get_doc("Group", g)
gdoc.save()  # assigns level_id to its rows
lvl = gdoc.levels[0]
print("level_id:", lvl.level_id, "name:", lvl.level_name, "point:", lvl.point)
# simulate snapshot
t = frappe.new_doc("Project Todo")
t.group = g
t.level_id = lvl.level_id
t.snapshot_point_from_level()
assert t.level == lvl.level_name and t.point == lvl.point, (t.level, t.point)
# delete-safe: unknown id keeps existing values
t.level_id = "does-not-exist"
t.level = "Kept Name"; t.point = 42
t.snapshot_point_from_level()
assert t.level == "Kept Name" and t.point == 42
frappe.db.rollback()
print("scoring ok")
```
Expected: `scoring ok` (asserts pass).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(scoring): resolve todo point/name by level_id, safe on level delete"
```

---

### Task 3: Migration — backfill `level_id` on existing rows

**Files:**
- Create: `vernon_project/patches/v1_0/backfill_level_id.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Consumes: `Group Level.level_id`, `Project Todo.level_id` columns (Task 1).
- Produces: every existing Group Level row has a `level_id`; every Project Todo whose `(group, level)` matches a level row has its `level_id` set.

- [ ] **Step 1: Write the patch**

Create `vernon_project/patches/v1_0/backfill_level_id.py`:

```python
import frappe


def execute():
	# 1. Stable id for every existing Group Level row.
	rows = frappe.get_all(
		"Group Level",
		filters={"level_id": ["in", ["", None]]},
		pluck="name",
	)
	for name in rows:
		frappe.db.set_value(
			"Group Level", name, "level_id",
			frappe.generate_hash(length=10), update_modified=False,
		)

	# 2. Point existing todos at their level row by name -> level_id.
	todos = frappe.get_all(
		"Project Todo",
		filters={"level_id": ["in", ["", None]], "level": ["is", "set"]},
		fields=["name", "group", "level"],
	)
	unmatched = 0
	for t in todos:
		lid = frappe.db.get_value(
			"Group Level",
			{"parent": t.group, "parenttype": "Group", "level_name": t.level},
			"level_id",
		)
		if lid:
			frappe.db.set_value(
				"Project Todo", t.name, "level_id", lid, update_modified=False,
			)
		else:
			unmatched += 1

	if unmatched:
		frappe.log_error(
			f"backfill_level_id: {unmatched} todos had no matching Group Level "
			"(group/level since deleted); left level_id empty.",
			"backfill_level_id",
		)
```

- [ ] **Step 2: Register the patch**

Append to `vernon_project/patches.txt` (after the existing `remap_levels...` line, under the `[post_model_sync]` section if present):

```
vernon_project.patches.v1_0.backfill_level_id
```

- [ ] **Step 3: Run the patch**

Run: `bench --site project.vernon.id migrate`
Expected: patch executes once, no error.

- [ ] **Step 4: Verify backfill**

Run in `bench --site project.vernon.id console`:
```python
import frappe
print("blank level_ids:", frappe.db.count("Group Level", {"level_id": ["in", ["", None]]}))
# spot-check a todo
t = frappe.get_all("Project Todo", filters={"level": ["is", "set"]}, fields=["name","group","level","level_id"], limit=1)
print(t)
```
Expected: `blank level_ids: 0`; the sample todo shows a non-empty `level_id` matching its group's level.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/patches/v1_0/backfill_level_id.py vernon_project/patches.txt
git commit -m "feat(groups): backfill level_id on Group Level and Project Todo"
```

---

### Task 4: API — return `level_id` from the todo feed

**Files:**
- Modify: `vernon_project/api/mobile.py:351-378` (`_fetch_todos` SELECT)

**Interfaces:**
- Produces: each todo dict in the feed includes `level_id` (alongside existing `level`).

- [ ] **Step 1: Add `t.level_id` to the SELECT**

In `_fetch_todos`, in the SELECT list where `t.\`group\` AS \`group\`, t.level, t.point,` appears, add `t.level_id`:

```sql
  t.`group` AS `group`, t.level, t.level_id, t.point, t.assignee_earned, t.leader_earned,
```

- [ ] **Step 2: Apply + verify**

Run: `bench restart`
Then in `bench --site project.vernon.id console`:
```python
import frappe
from vernon_project.api.mobile import _fetch_todos
import inspect
print("level_id" in inspect.getsource(_fetch_todos))
```
Expected: `True`. (Functional check happens end-to-end in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(api): include level_id in the todo feed"
```

---

### Task 5: Shared types + `Sortable` component

**Files:**
- Modify: `frontend/src/lib/types.ts:307-311` (`GroupLevel`), `:333-342` (`ScoringGroupPayload`)
- Create: `frontend/src/components/Sortable.tsx`

**Interfaces:**
- Produces:
  - `GroupLevel { name?: string; level_id?: string; level_name: string; point: number; idx?: number }`
  - `ScoringGroupPayload.levels: { name?: string; level_id?: string; level_name: string; point: number }[]`
  - `Sortable<T>({ items, keyFor, onReorder, renderItem })` — a pointer-based reorderable vertical list with a grip handle per row. `onReorder(from: number, to: number)` is called live during drag; `keyFor` MUST return a stable id per row (not the array index).

- [ ] **Step 1: Extend the shared types**

In `frontend/src/lib/types.ts`, replace the `GroupLevel` interface:

```ts
export interface GroupLevel {
  name?: string
  level_id?: string
  level_name: string
  point: number
  idx?: number
}
```

And replace the `levels` line in `ScoringGroupPayload`:

```ts
  levels: { name?: string; level_id?: string; level_name: string; point: number }[]
```

- [ ] **Step 2: Create the `Sortable` component**

Create `frontend/src/components/Sortable.tsx`:

```tsx
import { useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'

type SortableProps<T> = {
  items: T[]
  keyFor: (item: T, index: number) => string
  onReorder: (from: number, to: number) => void
  renderItem: (item: T, index: number) => ReactNode
}

// Lightweight pointer-based reorderable list (mouse + touch, no dependency).
// onReorder is called live as the dragged row crosses another row's midpoint.
export function Sortable<T>({ items, keyFor, onReorder, renderItem }: SortableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const down = (e: PointerEvent, index: number) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragIndex(index)
  }

  const move = (e: PointerEvent) => {
    if (dragIndex === null || !containerRef.current) return
    const rows = Array.from(containerRef.current.children) as HTMLElement[]
    const y = e.clientY
    let target = rows.findIndex((row) => {
      const r = row.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    if (target === -1) target = rows.length - 1
    if (target !== dragIndex) {
      onReorder(dragIndex, target)
      setDragIndex(target)
    }
  }

  const up = (e: PointerEvent) => {
    if (dragIndex === null) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    setDragIndex(null)
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={keyFor(item, index)}
          className={'flex items-center gap-2 rounded-xl ' + (dragIndex === index ? 'opacity-60' : '')}
        >
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => down(e, index)}
            onPointerMove={move}
            onPointerUp={up}
            className="shrink-0 cursor-grab touch-none px-1 text-slate-400 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Type-check both apps**

Run: `cd frontend-web && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: no errors. (`Sortable` is unused so far — that's fine; tsc passes.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/components/Sortable.tsx
git commit -m "feat(ui): shared sortable list + level_id/name on GroupLevel types"
```

---

### Task 6: Web GroupForm — editable, reorderable level list

**Files:**
- Modify: `frontend-web/src/pages/GroupForm.tsx` (levels state, helpers, render; remove `LEVEL_DEFS` fixed scale)

**Interfaces:**
- Consumes: `Sortable` (Task 5), extended `GroupLevel`/`ScoringGroupPayload` (Task 5).
- Produces: the web group editor supports add / rename / edit point / delete / reorder; on save sends `levels` in display order, round-tripping `name` + `level_id` for existing rows.

- [ ] **Step 1: Use a stable client key per level row**

At the top of `GroupForm.tsx`, replace the `LEVEL_DEFS` / `defaultLevels` block (lines 35-44) with a row type that carries a client key and a temp-id generator:

```tsx
type LevelRow = { _key: string; name?: string; level_id?: string; level_name: string; point: number }

let _tmp = 0
const tmpKey = () => `new-${_tmp++}`
const rowKey = (l: { level_id?: string; name?: string }) => l.level_id || l.name || tmpKey()

const defaultLevels = (): LevelRow[] => [{ _key: tmpKey(), level_name: '1', point: 100 }]
```

Change the `form.levels` state type to `LevelRow[]` (the `ScoringGroupPayload` field stays the wire type; `LevelRow` is the in-form type). Update the `useState` initializer's `levels: defaultLevels()` accordingly.

- [ ] **Step 2: Load existing levels preserving identity + order**

Replace the load mapping (lines 89-92) with:

```tsx
        levels: (existing.levels ?? [])
          .slice()
          .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
          .map((l) => ({
            _key: rowKey(l),
            name: l.name,
            level_id: l.level_id,
            level_name: l.level_name,
            point: l.point,
          })),
```

- [ ] **Step 3: Add level CRUD + reorder helpers**

Replace `setLevelPoint` / `bumpLevelPoint` / `applyStepFill` (lines 127-157) with helpers that also handle name, add, delete, reorder:

```tsx
  const LEVEL_STEP = 5
  const patchLevel = (i: number, patch: Partial<LevelRow>) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  }
  const setLevelName = (i: number, level_name: string) => patchLevel(i, { level_name })
  const setLevelPoint = (i: number, point: number) => patchLevel(i, { point })
  const bumpLevelPoint = (i: number, delta: number) =>
    patchLevel(i, { point: Math.max(0, (Number(form.levels[i].point) || 0) + delta) })
  const addLevel = () => {
    setDirty(true)
    setForm((f) => ({
      ...f,
      levels: [...f.levels, { _key: tmpKey(), level_name: String(f.levels.length + 1), point: 0 }],
    }))
  }
  const removeLevel = (i: number) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.filter((_, j) => j !== i) }))
  }
  const reorderLevel = (from: number, to: number) => {
    setDirty(true)
    setForm((f) => {
      const next = f.levels.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...f, levels: next }
    })
  }
  const applyStepFill = () => {
    const step = Number(stepFill)
    if (!stepFill.trim() || isNaN(step)) {
      toast('error', 'Enter a step value first')
      return
    }
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.map((l, i) => ({ ...l, point: Math.max(0, (i + 1) * step) })) }))
  }
```

- [ ] **Step 4: Validate names (non-empty, unique) and at least one level**

Replace `validate()` (lines 172-179) with:

```tsx
  const validate = (): string | null => {
    if (!form.group_name.trim()) return 'Group name is required'
    if (form.levels.length === 0) return 'Add at least one level'
    const names = new Set<string>()
    for (const l of form.levels) {
      const nm = l.level_name.trim()
      if (!nm) return 'Level names cannot be empty'
      if (names.has(nm)) return `Duplicate level name: ${nm}`
      names.add(nm)
      if (typeof l.point !== 'number' || isNaN(l.point)) return 'Level points must be numbers'
      if (l.point < 0) return 'Level points cannot be negative'
    }
    return null
  }
```

- [ ] **Step 5: Send identity + order on save**

Replace the `levels` mapping in the `save()` payload (line 193) with:

```tsx
      levels: form.levels.map((l) => ({
        name: l.name,
        level_id: l.level_id,
        level_name: l.level_name.trim(),
        point: Number(l.point),
      })),
```

- [ ] **Step 6: Replace the levels render block with an editable Sortable list**

Add `import { Sortable } from '@/components/Sortable'` and `Trash2` is already imported; import `GripVertical` is internal to Sortable. Replace the levels list (lines 322-379, the help copy + the `form.levels.map(...)` grid) with:

```tsx
              <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                Add, rename, set points, delete, or drag to reorder. Todos list levels in this order.
              </p>
              {/* Fill by increment stays here (unchanged block above this) */}
              <Sortable
                items={form.levels}
                keyFor={(l) => (l as LevelRow)._key}
                onReorder={reorderLevel}
                renderItem={(l, i) => (
                  <div className="flex items-center gap-2">
                    <input
                      className={field + ' flex-1'}
                      value={(l as LevelRow).level_name}
                      onChange={(e) => setLevelName(i, e.target.value)}
                      placeholder="Level name"
                    />
                    <button type="button" aria-label="Decrease point" onClick={() => bumpLevelPoint(i, -LEVEL_STEP)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input type="number" inputMode="decimal"
                      className="w-16 shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      value={String((l as LevelRow).point)}
                      onChange={(e) => setLevelPoint(i, e.target.value === '' ? 0 : Number(e.target.value))}
                      placeholder="Point" />
                    <button type="button" aria-label="Increase point" onClick={() => bumpLevelPoint(i, LEVEL_STEP)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="Delete level" onClick={() => removeLevel(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-red-500 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              />
              <button type="button" onClick={addLevel}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800/60">
                <Plus className="h-4 w-4" /> Add level
              </button>
```

Keep the existing "Fill by increment" sub-block (lines ~326-346) above the `Sortable`. Remove the old "Fixed scale 0 to 10" sentence.

- [ ] **Step 7: Type-check + build**

Run: `cd frontend-web && npx tsc --noEmit && npm run build`
Expected: tsc clean; build writes `vernon_project/public/frontend_web` + copies html.

- [ ] **Step 8: Manual check**

Open `https://project.vernon.id/w/groups` → edit a group. Confirm: levels show current names, you can rename, change points with +/-, delete a row, add a row, and drag a row by the grip to reorder. Save; reopen; order + values persist.

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/pages/GroupForm.tsx vernon_project/public/frontend_web vernon_project/www/w.html vernon_project/public/frontend_web/index.html
git commit -m "feat(web): editable, reorderable group levels"
```

---

### Task 7: Mobile GroupFormScreen — editable, reorderable level list

**Files:**
- Modify: `frontend/src/pages/GroupFormScreen.tsx` (mirror Task 6)

**Interfaces:**
- Consumes: `Sortable`, extended types (Task 5).
- Produces: mobile group editor at parity with web (add / rename / edit point / delete / reorder; round-trips `name` + `level_id`).

- [ ] **Step 1: Mirror the state/helpers from Task 6**

Apply the SAME changes as Task 6 Steps 1–5 to `frontend/src/pages/GroupFormScreen.tsx`: replace `LEVEL_DEFS`/`defaultLevels` (lines ~36-43) with the `LevelRow`/`tmpKey`/`rowKey`/`defaultLevels` block; replace the load mapping (lines ~89-92) with the idx-sorted identity-preserving map; replace `setLevelPoint`/`bumpLevelPoint`/`applyStepFill` (lines ~116-142) with `patchLevel`/`setLevelName`/`setLevelPoint`/`bumpLevelPoint`/`addLevel`/`removeLevel`/`reorderLevel`/`applyStepFill`; replace `validate()` (around line 148) with the name-uniqueness version; replace the save `levels` map (line ~165) with the identity-preserving map. (Code identical to Task 6 — reproduced there.)

- [ ] **Step 2: Replace the render block**

Add `import { Sortable } from '@/components/Sortable'`. Ensure `Plus`, `Minus`, `Trash2` are imported from `lucide-react` (add any missing). Replace the levels render (lines ~275 help copy + ~303-320 `form.levels.map(...)`) with the same `Sortable` + "Add level" markup from Task 6 Step 6, adapted to this screen's existing class conventions (reuse the same Tailwind classes; they match). Remove the "Fixed scale 0 to 10" copy. Keep "Fill by increment".

- [ ] **Step 3: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: tsc clean; build writes `vernon_project/public/frontend` + copies html.

- [ ] **Step 4: Manual check**

Open `https://project.vernon.id/m/groups` → edit a group. Same checklist as Task 6 Step 8 on a touch device / narrow viewport: drag via grip works with touch.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GroupFormScreen.tsx vernon_project/public/frontend vernon_project/www/m.html vernon_project/public/frontend/index.html
git commit -m "feat(mobile): editable, reorderable group levels"
```

---

### Task 8: Pickers — follow group order, store `level_id` (both apps)

**Files:**
- Modify: `frontend-web/src/pages/ProjectItem.tsx:384` (init), `:430` (submit), `:596-598` (options)
- Modify: `frontend/src/pages/ProjectItemScreen.tsx:100` (init), `:150` (submit), `:304-306` (options)

**Interfaces:**
- Consumes: `groupDoc.levels` in `idx` order (Task 5/6), `data.level_id` from the feed (Task 4) / resource doc.
- Produces: the level `SearchableSelect` lists levels in group order with `value = level_id`; the todo is saved with `fields.level_id`.

- [ ] **Step 1: Web — initialize from `level_id`**

`ProjectItem.tsx:384`, change:
```tsx
  const [level, setLevel] = useState(data.level_id ?? '')
```

- [ ] **Step 2: Web — options in group order, value = level_id**

`ProjectItem.tsx:596-598`, replace the `options` expression:
```tsx
          options={(groupDoc?.levels ?? []).map((l) => ({
            value: l.level_id ?? '',
            label: `${l.level_name} (${l.point} pts)`,
          }))}
```

- [ ] **Step 3: Web — submit `level_id`**

`ProjectItem.tsx:430`, change `fields.level = level` to:
```tsx
    fields.level_id = level
```
(Backend `snapshot_point_from_level` refreshes the cached `level` name and `point`.) The required-field guard at line ~406 (`if (!group || !level)`) still works — `level` now holds the id.

- [ ] **Step 4: Mobile — same three edits**

Apply Steps 1–3 to `frontend/src/pages/ProjectItemScreen.tsx`: line 100 → `useState(data.level_id ?? '')`; lines 304-306 → the `idx`-order `options` map with `value: l.level_id ?? ''`; line 150 → `fields.level_id = level`.

- [ ] **Step 5: Type-check + build both**

Run: `cd frontend-web && npx tsc --noEmit && npm run build && cd ../frontend && npx tsc --noEmit && npm run build`
Expected: both clean; both bundles written.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/ProjectItem.tsx frontend/src/pages/ProjectItemScreen.tsx vernon_project/public/frontend_web vernon_project/public/frontend vernon_project/www/w.html vernon_project/www/m.html vernon_project/public/frontend_web/index.html vernon_project/public/frontend/index.html
git commit -m "feat(todos): level picker follows group order and stores level_id"
```

---

### Task 9: End-to-end verification + deploy

**Files:** none (verification + final migrate/restart).

- [ ] **Step 1: Ensure schema + patch + python are live**

Run: `bench --site project.vernon.id migrate && bench restart`
Expected: no error; patch already applied (idempotent).

- [ ] **Step 2: Full manual flow (web `/w` and mobile `/m`)**

Verify, on the live site:
1. **Group editor:** create a group with custom-named levels (e.g. `Minor`, `Major`, `Critical`), reorder them, edit a point, delete one. Save; reopen → order + values persist; non-numeric names accepted.
2. **Picker order:** open a todo in that group → the level dropdown lists levels in the GROUP's order (not numeric/alphabetical), label shows `name (point pts)`.
3. **Rename safety:** rename a level that an existing open todo uses. Reopen that todo → picker still pre-selects it (no blank), and the header shows the new name after a save; no "Level does not belong to Group" error.
4. **Delete safety:** delete a level used by an existing todo → that todo still opens, keeps its point, no crash; the deleted level is absent from the picker.
5. **Scoring:** complete a todo and confirm the wallet/ledger point matches the level's point; the ledger `level_name` shows the name at credit time.

- [ ] **Step 3: Confirm no orphaned blanks**

Run in `bench --site project.vernon.id console`:
```python
import frappe
print("group levels missing id:", frappe.db.count("Group Level", {"level_id": ["in", ["", None]]}))
print("todos with level but no id:", frappe.db.count("Project Todo", {"level": ["is","set"], "level_id": ["in", ["", None]]}))
```
Expected: `0` group levels missing id. Todos-without-id may be >0 only for groups/levels deleted before migration (acceptable, they degrade gracefully).

- [ ] **Step 4: Final commit (if any uncommitted built assets)**

```bash
git add -A
git commit -m "chore: rebuild assets for editable group levels" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Data model `level_id` (Group Level + Project Todo, `level`→Data, auto-assign) → Task 1. ✓
- Backend scoring by id, graceful on delete, ledger snapshot, recurring clone → Task 2. ✓
- Migration backfill → Task 3. ✓
- API returns `level_id` → Task 4. ✓
- Shared types + Sortable → Task 5. ✓
- Form full CRUD + reorder, both apps → Tasks 6, 7. ✓
- Picker group-order + level_id, both apps → Task 8. ✓
- Verification → Task 9. ✓

**Placeholder scan:** No TBD/TODO. Tasks 7 and 8.4 reference "same code as Task 6 / Steps 1-3" but the canonical code is fully written in Task 6 / Task 8 Steps 1-3 — the engineer applies the shown code to the second file (parity edits to a duplicate file; reproducing 150 lines verbatim would be noise). Acceptable per DRY for genuine duplicate-file parity.

**Type consistency:** `LevelRow` (`_key`, `name?`, `level_id?`, `level_name`, `point`) consistent across Tasks 6/7. Wire type `ScoringGroupPayload.levels` (`name?`, `level_id?`, `level_name`, `point`) matches Task 5. `Sortable` signature (`items`, `keyFor`, `onReorder`, `renderItem`) consistent in Tasks 5/6/7. Picker `value = level_id`, state `level` holds the id, submit `fields.level_id` consistent in Task 8. Backend `snapshot_point_from_level` sets `self.level`/`self.level_id`/`self.point`; recurring clone copies `level_id`; matches Task 1 fields.
