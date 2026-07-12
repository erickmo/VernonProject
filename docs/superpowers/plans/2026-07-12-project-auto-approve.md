# Project-level Auto-Approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-wide auto-approve default plus a per-todo 3-state override (Inherit/On/Off) that skips the Owner review gate (Checked By PL → Completed).

**Architecture:** One project bool (`Project.auto_approve`) is the default. Each todo keeps its existing `auto_approve` (force ON) and gains `auto_approve_opt_out` (force OFF); the two encode a tri-state. A single resolver — `effective = todo.on OR (NOT todo.off AND project.default)` — drives the Owner-gate skip in `_auto_advance` and is surfaced to both frontends via the existing serializers. UI is a segmented control per todo + an on/off switch on the project and project-detail screens, in both `/m` and `/w`.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), React + TypeScript + TanStack Query (two SPAs sharing `frontend/src` hooks/types/api via `@/`).

## Global Constraints

- Live site `project.vernon.id`, code-first: no test DB. Site-less pure-Python unit tests only; DB-touching logic is verified via a `bench console` snippet, not a site test. (memory: live-site/code-first)
- Every dropdown/select must use `SearchableSelect`/`MultiSelectSearch` — N/A here (no selects added), but do not introduce a native `<select>`.
- No native `alert/confirm/prompt` — use dialog modals. N/A here.
- `@` = `frontend/src` (SHARED hooks/types/api, edited once, consumed by both apps). `@web` = `frontend-web/src` (web UI only). Mobile UI lives in `frontend/src/components` + `frontend/src/pages`. Do NOT share a styled component across the two apps — `/m` uses `paper-*`/`brand-*` tokens, `/w` uses flat-Notion tokens (`ink/line/hover/surface`). One component per app.
- Partner+owner gate is the trust boundary for every write: `user == project.project_owner and "Partner" in frappe.get_roles(user)`. Copy verbatim.
- Auto-approve only skips the **Owner** gate. It never touches the Leader gate (Done→Checked) or points/reject logic.
- Deploy: `bench --site project.vernon.id migrate` for schema, `sudo /usr/local/bin/tj-restart` for Python, `npm run build` per frontend. Partner role already granted to `mo@vernon.id`.

---

### Task 1: Doctype fields + migrate

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project/project.json`
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json`

**Interfaces:**
- Produces: `Project.auto_approve` (Check, read_only), `Project Todo.auto_approve_opt_out` (Check, read_only). Existing `Project Todo.auto_approve` unchanged.

- [ ] **Step 1: Add `auto_approve` to Project**

In `project.json`, add `"auto_approve"` to `field_order` (near `status`), and add this field object to `fields` (place after the `status` field object):

```json
{
   "default": "0",
   "fieldname": "auto_approve",
   "fieldtype": "Check",
   "label": "Auto-Approve All Todos (Owner)",
   "read_only": 1,
   "description": "Project-wide default. When set, every todo reaching Checked By PL auto-advances to Completed without Owner approval, unless the todo opts out. Only a Partner project owner can set this."
}
```

- [ ] **Step 2: Add `auto_approve_opt_out` to Project Todo**

In `project_todo.json`, add `"auto_approve_opt_out"` to `field_order` immediately after `"auto_approve"`, and add this field object right after the existing `auto_approve` field object (which ends at the `}` before `notes`):

```json
{
   "default": "0",
   "fieldname": "auto_approve_opt_out",
   "fieldtype": "Check",
   "label": "Auto-Approve Opt-Out",
   "read_only": 1,
   "description": "When set, this todo is excluded from the project-wide auto-approve and always waits for Owner approval. Only a Partner project owner can set this."
}
```

- [ ] **Step 3: Migrate**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error; new columns exist.

- [ ] **Step 4: Verify columns exist**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
print("Project.auto_approve:", frappe.db.has_column("Project", "auto_approve"))
print("Project Todo.auto_approve_opt_out:", frappe.db.has_column("Project Todo", "auto_approve_opt_out"))
EOF
```
Expected: both `True`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project/project.json vernon_project/vernon_project/doctype/project_todo/project_todo.json
git commit -m "feat: add project-wide auto_approve + per-todo auto_approve_opt_out fields"
```

---

### Task 2: Effective-resolution in `_auto_advance` (+ site-less test)

**Files:**
- Modify: `vernon_project/vernon_project/api/project_todo.py:9-34` (`_auto_advance`), and `:96` (its caller in `update_status`)
- Test: `vernon_project/tests/test_auto_approve_advance.py`

**Interfaces:**
- Consumes: `Project Todo.auto_approve`, `Project Todo.auto_approve_opt_out` (Task 1).
- Produces: `_auto_advance(todo, project_leader, project_owner, project_auto_approve=0)` — new 4th param defaulting to `0` (falsy) so existing 3-arg callers are unaffected. Resolver: `effective = bool(todo.auto_approve) or (not getattr(todo, "auto_approve_opt_out", 0) and bool(project_auto_approve))`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `vernon_project/tests/test_auto_approve_advance.py` with (keeps the 3 existing cases, adds the project-default matrix):

```python
"""Site-less unit check for _auto_advance's auto_approve Owner-gate skip.

Runs without a Frappe site: we only need _auto_advance (pure mutation) and a
stubbed frappe.utils.now. No DB, no fixtures.
"""
import types

import frappe
frappe.utils.now = lambda: "2026-07-11 00:00:00"

from vernon_project.api.project_todo import _auto_advance


def _todo(**kw):
	base = dict(status="🔷 Checked By PL", auto_approve=0, auto_approve_opt_out=0,
	            assigned_to=None, tested_at="2026-07-11 00:00:00",
	            completed_at=None, completed_by=None)
	base.update(kw)
	return types.SimpleNamespace(**base)


def test_todo_force_on_completes():
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "✅ Completed"
	assert todo.completed_by == "owner@x"


def test_no_flags_leader_ne_owner_stays():
	todo = _todo()
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "🔷 Checked By PL"


def test_force_on_but_no_owner_stays():
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", None, 0)
	assert todo.status == "🔷 Checked By PL"


def test_project_default_inherit_completes():
	# project default ON, todo inherits -> completes
	todo = _todo()
	_auto_advance(todo, "leader@x", "owner@x", 1)
	assert todo.status == "✅ Completed"


def test_project_default_but_todo_opts_out_stays():
	# project default ON, todo forces OFF -> stays
	todo = _todo(auto_approve_opt_out=1)
	_auto_advance(todo, "leader@x", "owner@x", 1)
	assert todo.status == "🔷 Checked By PL"


def test_project_off_todo_on_completes():
	# project default OFF, todo forces ON -> completes
	todo = _todo(auto_approve=1)
	_auto_advance(todo, "leader@x", "owner@x", 0)
	assert todo.status == "✅ Completed"


def test_project_default_inherit_no_owner_stays():
	# project default ON, inherit, but no real owner -> truthiness guard holds
	todo = _todo()
	_auto_advance(todo, "leader@x", None, 1)
	assert todo.status == "🔷 Checked By PL"


if __name__ == "__main__":
	for fn in list(globals().values()):
		if callable(fn) and getattr(fn, "__name__", "").startswith("test_"):
			fn()
	print("ok")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.tests.test_auto_approve_advance`
Expected: FAIL — `test_project_default_inherit_completes` raises AssertionError (current `_auto_advance` ignores the project default; todo stays Checked).

- [ ] **Step 3: Implement the resolver**

In `vernon_project/vernon_project/api/project_todo.py`, change the `_auto_advance` signature and the Owner-gate condition:

```python
def _auto_advance(todo, project_leader, project_owner, project_auto_approve=0):
	"""Collapse redundant self-approval gates in place (mutates todo, no save).

	Two review gates exist: 🟠 Done → 🔷 Checked By PL (Leader approves) and
	🔷 Checked By PL → ✅ Completed (Owner approves). A gate is pointless when the
	approver already effectively signed off:
	  - assignee IS the leader -> the Leader gate is the assignee approving their
	    own work; skip it.
	  - leader IS the owner    -> the Owner gate is the same person who just
	    cleared the Leader gate; skip it.

	Auto-approve also clears the Owner gate. It resolves per-todo over the
	project-wide default: a todo may force it ON (auto_approve) or force it OFF
	(auto_approve_opt_out); otherwise it inherits project_auto_approve.

	Sequential ifs (not elif) so assignee==leader==owner completes in one hop.
	Truthiness guards keep an empty owner (None) from auto-completing.
	"""
	now = frappe.utils.now()
	if todo.status == "🟠 Done" and todo.assigned_to and todo.assigned_to == project_leader:
		todo.status = "🔷 Checked By PL"
		todo.tested_at = now
		todo.tested_by = project_leader
	effective = bool(todo.auto_approve) or (
		not getattr(todo, "auto_approve_opt_out", 0) and bool(project_auto_approve)
	)
	if todo.status == "🔷 Checked By PL" and project_owner and (effective or project_leader == project_owner):
		todo.status = "✅ Completed"
		todo.completed_at = now
		todo.completed_by = project_owner
```

Then update the caller at `update_status` (currently line 96):

```python
		_auto_advance(todo, project_leader, project_owner, project.auto_approve)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.tests.test_auto_approve_advance`
Expected: prints `ok` (all pass).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/api/project_todo.py vernon_project/tests/test_auto_approve_advance.py
git commit -m "feat: resolve auto-approve as todo override over project default"
```

---

### Task 3: Setters — `set_auto_approve(mode)` + `set_project_auto_approve`

**Files:**
- Modify: `vernon_project/vernon_project/api/project_todo.py:159-183` (`set_auto_approve`)
- Modify: `vernon_project/vernon_project/api/project_todo.py` (append `set_project_auto_approve`)

**Interfaces:**
- Produces:
  - `set_auto_approve(todo_id, mode)` → `mode ∈ {"on","off","inherit"}`; returns `{"status":"info","mode": mode}` or `{"status":"error","message":...}`.
  - `set_project_auto_approve(project, enabled)` → `enabled` 0/1; returns `{"status":"info","auto_approve": value}` or error.

- [ ] **Step 1: Rewrite `set_auto_approve` to take a mode**

Replace the existing `set_auto_approve` function (lines 159-183) with:

```python
@frappe.whitelist()
def set_auto_approve(todo_id, mode):
	"""Set a todo's auto-approve override: "on" (force skip Owner gate), "off"
	(force wait, opt out of the project default), or "inherit" (follow the
	project-wide default).

	Trust boundary: only the Project Owner who also holds the "Partner" role may
	set it.
	"""
	try:
		if mode not in ("on", "off", "inherit"):
			return {"status": "error", "message": f"Invalid mode {mode!r}."}
		todo = frappe.get_doc("Project Todo", todo_id)
		project_detail = frappe.get_doc("Project Detail", todo.project_detail)
		project = frappe.get_doc("Project", project_detail.project)

		user = frappe.session.user
		if not (user == project.project_owner and "Partner" in frappe.get_roles(user)):
			return {"status": "error", "message": "Hanya Project Owner dengan role Partner yang bisa mengatur auto-approve."}

		todo.auto_approve = 1 if mode == "on" else 0
		todo.auto_approve_opt_out = 1 if mode == "off" else 0
		todo.save(ignore_permissions=True)
		return {"status": "info", "mode": mode}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Todo {todo_id} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def set_project_auto_approve(project, enabled):
	"""Set the project-wide auto-approve default. Every todo inherits this unless
	it overrides via set_auto_approve.

	Trust boundary: only the Project Owner who also holds the "Partner" role.
	"""
	try:
		doc = frappe.get_doc("Project", project)
		user = frappe.session.user
		if not (user == doc.project_owner and "Partner" in frappe.get_roles(user)):
			return {"status": "error", "message": "Hanya Project Owner dengan role Partner yang bisa mengatur auto-approve."}
		value = frappe.utils.cint(enabled)
		doc.auto_approve = value
		doc.save(ignore_permissions=True)
		return {"status": "info", "auto_approve": value}

	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Project {project} does not exist."}
	except Exception as e:
		return {"status": "error", "message": str(e)}
```

- [ ] **Step 2: Verify via console (DB-touching, no site test)**

Pick one of your owned projects and one of its todos, then run (replace IDs):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("mo@vernon.id")
from vernon_project.api.project_todo import set_project_auto_approve, set_auto_approve
proj = frappe.get_all("Project", filters={"project_owner":"mo@vernon.id"}, pluck="name")[0]
print("project set:", set_project_auto_approve(proj, 1))
det = frappe.get_all("Project Detail", filters={"project":proj}, pluck="name")[0]
todo = frappe.get_all("Project Todo", filters={"project_detail":det}, pluck="name")[0]
print("todo off:", set_auto_approve(todo, "off"))
print("stored:", frappe.db.get_value("Project Todo", todo, ["auto_approve","auto_approve_opt_out"]))
print("todo inherit:", set_auto_approve(todo, "inherit"))
# cleanup
set_project_auto_approve(proj, 0)
frappe.db.commit()
EOF
```
Expected: `project set` → `{'status':'info','auto_approve':1}`; `todo off` → `{'status':'info','mode':'off'}`; `stored` → `(0, 1)`; `todo inherit` → `{'status':'info','mode':'inherit'}`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/api/project_todo.py
git commit -m "feat: add project + tri-state todo auto-approve setters (Partner-gated)"
```

---

### Task 4: Serializers + payloads

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py:431-453` (`_fetch_todos` SQL)
- Modify: `vernon_project/vernon_project/api/mobile.py:559-560` (`_shape_todo`)
- Modify: `vernon_project/vernon_project/api/mobile.py:640-656` (`_shape_item_row`)
- Modify: `vernon_project/vernon_project/api/mobile.py:998-1022` (`get_project` return)
- Modify: `vernon_project/vernon_project/api/mobile.py:1281-1290` (`get_project_detail`)

**Interfaces:**
- Consumes: new fields (Task 1), `_can_set_auto_approve(project, user)` (exists, `mobile.py:156`).
- Produces (JSON contract for Task 5):
  - todo shapes gain `auto_approve_mode: "on"|"off"|"inherit"`, `auto_approve_effective: bool`. `_shape_item_row` also gains `can_set_auto_approve: bool`. `_shape_todo` keeps `can_set_auto_approve`. The raw `auto_approve: bool` key is REMOVED from `_shape_todo`.
  - `get_project` / `get_project_detail` gain `auto_approve: bool` (project default) and `can_set_auto_approve: bool`.

- [ ] **Step 1: Add columns to `_fetch_todos`**

In the `SELECT` (line 437 currently reads `t.ongoing, t.notes, t.is_recurring, t.auto_approve,`), change that line to include the opt-out and the project default:

```python
			t.ongoing, t.notes, t.is_recurring, t.auto_approve, t.auto_approve_opt_out,
```

and on the line listing project columns (currently `p.project_name, p.project_owner, p.project_leader, p.project_admin,`) change to:

```python
			p.project_name, p.project_owner, p.project_leader, p.project_admin, p.auto_approve AS project_auto_approve,
```

- [ ] **Step 2: Add a shared resolver helper**

Add near `_can_set_auto_approve` (after line 159) in `mobile.py`:

```python
def _auto_approve_fields(row):
	"""(mode, effective) for a todo row from _fetch_todos."""
	if row.get("auto_approve"):
		mode = "on"
	elif row.get("auto_approve_opt_out"):
		mode = "off"
	else:
		mode = "inherit"
	effective = bool(row.get("auto_approve")) or (
		not row.get("auto_approve_opt_out") and bool(row.get("project_auto_approve"))
	)
	return mode, effective
```

- [ ] **Step 3: Update `_shape_todo`**

Replace the line `"auto_approve": bool(row.get("auto_approve")),` (line 559) with:

```python
		"auto_approve_mode": _auto_approve_fields(row)[0],
		"auto_approve_effective": _auto_approve_fields(row)[1],
```

(Leave `"can_set_auto_approve": _can_set_auto_approve(project, user),` on the next line as-is.)

- [ ] **Step 4: Update `_shape_item_row`**

`_shape_item_row` has no `project` dict in scope, so build the gate inline. Add these keys to the returned dict (after `"assigned_to_name"`):

```python
		"auto_approve_mode": _auto_approve_fields(row)[0],
		"auto_approve_effective": _auto_approve_fields(row)[1],
		"can_set_auto_approve": (
			user == row.get("project_owner") and "Partner" in frappe.get_roles(user)
		),
```

- [ ] **Step 5: Update `get_project` return**

Add to the returned dict (after `"project_admin": doc.project_admin,`):

```python
		"auto_approve": bool(doc.auto_approve),
		"can_set_auto_approve": _can_set_auto_approve({"project_owner": doc.project_owner}, user),
```

- [ ] **Step 6: Update `get_project_detail`**

After the block that sets `detail["can_create"]`/`detail["can_edit"]` (around line 1287, where `owner, leader` are already fetched), add:

```python
	detail["auto_approve"] = bool(frappe.db.get_value("Project", detail["project"], "auto_approve"))
	detail["can_set_auto_approve"] = user == owner and "Partner" in frappe.get_roles(user)
```

- [ ] **Step 7: Verify payloads via console**

Run (replace with an owned project + one of its details):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("mo@vernon.id")
from vernon_project.api.mobile import get_project, get_project_detail
proj = frappe.get_all("Project", filters={"project_owner":"mo@vernon.id"}, pluck="name")[0]
p = get_project(proj)
print("project keys:", p.get("auto_approve"), p.get("can_set_auto_approve"))
det = frappe.get_all("Project Detail", filters={"project":proj}, pluck="name")[0]
d = get_project_detail(det)
print("detail keys:", d.get("auto_approve"), d.get("can_set_auto_approve"))
print("row keys:", d["project_items"][0].keys() if d["project_items"] else "no items")
EOF
```
Expected: project prints `False True`; detail prints `False True`; a row dict contains `auto_approve_mode`, `auto_approve_effective`, `can_set_auto_approve`.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat: surface auto-approve mode/effective + project default in payloads"
```

---

### Task 5: Shared frontend layer (api + types + hooks)

**Files:**
- Modify: `frontend/src/lib/api.ts:146-150` (`setAutoApprove`) + add `setProjectAutoApprove`
- Modify: `frontend/src/lib/types.ts:105-106` (todo item type) + project meta + item-row type
- Modify: `frontend/src/hooks/useData.ts:279-295` (`useSetAutoApprove`) + add `useSetProjectAutoApprove`

**Interfaces:**
- Consumes: JSON contract from Task 4.
- Produces:
  - `mobileApi.setAutoApprove(todoId, mode: 'on'|'off'|'inherit')`
  - `mobileApi.setProjectAutoApprove(project, enabled: 0|1)`
  - `useSetAutoApprove()` → `mutate({ todoId, mode })`
  - `useSetProjectAutoApprove()` → `mutate({ project, enabled })`
  - Types: `AutoApproveMode = 'on'|'off'|'inherit'`; todo carries `auto_approve_mode`, `auto_approve_effective`; project meta + item-row carry `auto_approve`/`can_set_auto_approve` as noted.

- [ ] **Step 1: Update `api.ts`**

Replace `setAutoApprove` (lines 146-150) with:

```typescript
  setAutoApprove: (todoId: string, mode: 'on' | 'off' | 'inherit') =>
    api.post<{ status: string; message?: string; mode?: 'on' | 'off' | 'inherit' }>(
      'vernon_project.api.project_todo.set_auto_approve',
      { todo_id: todoId, mode },
    ),
  setProjectAutoApprove: (project: string, enabled: 0 | 1) =>
    api.post<{ status: string; message?: string; auto_approve?: 0 | 1 }>(
      'vernon_project.api.project_todo.set_project_auto_approve',
      { project, enabled },
    ),
```

- [ ] **Step 2: Update `types.ts`**

Find the todo item type (the interface containing `auto_approve: boolean` / `can_set_auto_approve: boolean` around line 105). Replace `auto_approve: boolean` with:

```typescript
  auto_approve_mode: 'on' | 'off' | 'inherit'
  auto_approve_effective: boolean
```

Then locate the project meta type (the return shape of `useProject` / `get_project`; search for `project_details` and `owner_name` in `types.ts`) and add:

```typescript
  auto_approve: boolean
  can_set_auto_approve: boolean
```

Then locate the project-item row type used inside project-detail `project_items` (search for `status_key` on the lighter row type that also has `assigned_to_name` but no `can_advance`) and add:

```typescript
  auto_approve_mode: 'on' | 'off' | 'inherit'
  auto_approve_effective: boolean
  can_set_auto_approve: boolean
```

> If any of these three are the same interface reused, add each field once. Run `tsc` in Step 4 to catch mismatches.

- [ ] **Step 3: Update `useData.ts`**

Replace `useSetAutoApprove` (lines 279-295) with:

```typescript
export function useSetAutoApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ todoId, mode }: { todoId: string; mode: 'on' | 'off' | 'inherit' }) => {
      const res = await mobileApi.setAutoApprove(todoId, mode)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

export function useSetProjectAutoApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ project, enabled }: { project: string; enabled: 0 | 1 }) => {
      const res = await mobileApi.setProjectAutoApprove(project, enabled)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}
```

- [ ] **Step 4: Typecheck both apps**

Run: `cd frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit`
Expected: both fail ONLY where the old `auto_approve`/`setAutoApprove(enabled)` are still referenced in the page files (fixed in Tasks 6-7). No errors inside `lib/` or `hooks/`. Note the reported page/line references — they are the exact edit sites for the next tasks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat: shared api/types/hooks for tri-state + project auto-approve"
```

---

### Task 6: Mobile UI (`/m`)

**Files:**
- Create: `frontend/src/components/AutoApproveSegment.tsx`
- Create: `frontend/src/components/ProjectAutoApproveSwitch.tsx`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (~1013-1023 handler, ~1418-1441 render)
- Modify: `frontend/src/pages/ProjectScreen.tsx` (project header region)
- Modify: `frontend/src/pages/ProjectDetailScreen.tsx` (header region + todo rows ~166-200)

**Interfaces:**
- Consumes: `useSetAutoApprove`, `useSetProjectAutoApprove` (Task 5); todo `auto_approve_mode`/`auto_approve_effective`/`can_set_auto_approve`; project/detail `auto_approve`/`can_set_auto_approve`.

- [ ] **Step 1: Create `AutoApproveSegment.tsx` (mobile paper style)**

`frontend/src/components/AutoApproveSegment.tsx`:

```tsx
import clsx from 'clsx'

type Mode = 'on' | 'off' | 'inherit'

/** 3-state auto-approve control for a single todo (mobile /m).
 *  Inherit follows the project default; On/Off force per todo. */
export function AutoApproveSegment({
  mode,
  effective,
  projectDefault,
  disabled,
  onChange,
}: {
  mode: Mode
  effective: boolean
  projectDefault: boolean
  disabled?: boolean
  onChange: (mode: Mode) => void
}) {
  const opts: { key: Mode; label: string }[] = [
    { key: 'inherit', label: 'Inherit' },
    { key: 'on', label: 'On' },
    { key: 'off', label: 'Off' },
  ]
  return (
    <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Auto-setujui (Owner)
        </span>
        <span className="text-xs text-slate-400">
          {effective ? 'aktif' : 'nonaktif'}
        </span>
      </div>
      <div className="mt-2 flex gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-700/60 p-1">
        {opts.map((o) => (
          <button
            key={o.key}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={clsx(
              'flex-1 rounded-md py-1.5 text-xs font-semibold transition disabled:opacity-60',
              mode === o.key
                ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === 'inherit' && (
        <p className="mt-1.5 text-xs text-slate-400">
          Ikut default proyek: {projectDefault ? 'ON' : 'OFF'}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `ProjectAutoApproveSwitch.tsx` (mobile paper style)**

`frontend/src/components/ProjectAutoApproveSwitch.tsx`:

```tsx
import clsx from 'clsx'

/** Project-wide auto-approve default switch (mobile /m). */
export function ProjectAutoApproveSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-60"
    >
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Auto-setujui semua todo (Owner)
      </span>
      <span
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            enabled ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
```

- [ ] **Step 3: Wire `ProjectItemScreen.tsx`**

Add the import at the top with the other component imports:

```tsx
import { AutoApproveSegment } from '@/components/AutoApproveSegment'
```

Replace the `onToggleAutoApprove` handler (around lines 1013-1023) with a mode setter:

```tsx
  const onSetAutoApprove = (mode: 'on' | 'off' | 'inherit') => {
    if (!data || setAutoApprove.isPending) return
    setAutoApprove.mutate({ todoId: data.name, mode })
  }
```

Replace the entire `{data.can_set_auto_approve && ( ... )}` button block (lines 1418-1441) with:

```tsx
            {data.can_set_auto_approve && (
              <AutoApproveSegment
                mode={data.auto_approve_mode}
                effective={data.auto_approve_effective}
                projectDefault={data.auto_approve_effective && data.auto_approve_mode === 'inherit'}
                disabled={setAutoApprove.isPending}
                onChange={onSetAutoApprove}
              />
            )}
```

> `projectDefault` here derives from what the payload already carries. To show the true project default even when mode is On/Off, prefer reading it from the project meta if this screen has it; otherwise the `inherit`-only hint above is sufficient (the hint line only renders when mode === 'inherit', where `auto_approve_effective` equals the project default).

- [ ] **Step 4: Wire the project-wide switch into `ProjectScreen.tsx`**

Add imports:

```tsx
import { ProjectAutoApproveSwitch } from '@/components/ProjectAutoApproveSwitch'
import { useSetProjectAutoApprove } from '@/hooks/useData'
```

Near the other hooks (after `const { data, isLoading } = useProject(id)`), add:

```tsx
  const setProjectAutoApprove = useSetProjectAutoApprove()
```

In the project header/meta area (where owner/status/progress render — search for `owner_name` or the stats block), add, gated by permission:

```tsx
          {data.can_set_auto_approve && (
            <div className="mt-3">
              <ProjectAutoApproveSwitch
                enabled={data.auto_approve}
                disabled={setProjectAutoApprove.isPending}
                onToggle={() =>
                  setProjectAutoApprove.mutate({ project: data.name, enabled: data.auto_approve ? 0 : 1 })
                }
              />
            </div>
          )}
```

- [ ] **Step 5: Wire `ProjectDetailScreen.tsx` — project switch + per-row segment**

Add imports:

```tsx
import { AutoApproveSegment } from '@/components/AutoApproveSegment'
import { ProjectAutoApproveSwitch } from '@/components/ProjectAutoApproveSwitch'
import { useSetAutoApprove, useSetProjectAutoApprove } from '@/hooks/useData'
```

After `const { data, isLoading } = useProjectDetail(id, showCancelled)`, add:

```tsx
  const setAutoApprove = useSetAutoApprove()
  const setProjectAutoApprove = useSetProjectAutoApprove()
```

Put the project switch in the detail header region (near the title/status), gated:

```tsx
          {data.can_set_auto_approve && (
            <div className="mt-3">
              <ProjectAutoApproveSwitch
                enabled={data.auto_approve}
                disabled={setProjectAutoApprove.isPending}
                onToggle={() =>
                  setProjectAutoApprove.mutate({ project: data.project, enabled: data.auto_approve ? 0 : 1 })
                }
              />
            </div>
          )}
```

In the todo-row map (around line 170, `s.items.map((t) => { ... })`), render the segment inside each row when permitted — place it below the row's main content:

```tsx
                    {t.can_set_auto_approve && (
                      <AutoApproveSegment
                        mode={t.auto_approve_mode}
                        effective={t.auto_approve_effective}
                        projectDefault={data.auto_approve}
                        disabled={setAutoApprove.isPending}
                        onChange={(mode) => setAutoApprove.mutate({ todoId: t.name, mode })}
                      />
                    )}
```

> If the row is a `<Link>`/clickable, wrap the segment so its clicks don't bubble to navigation: put it in a `<div onClick={(e) => e.stopPropagation()}>`.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AutoApproveSegment.tsx frontend/src/components/ProjectAutoApproveSwitch.tsx frontend/src/pages/ProjectItemScreen.tsx frontend/src/pages/ProjectScreen.tsx frontend/src/pages/ProjectDetailScreen.tsx
git commit -m "feat(/m): tri-state todo + project-wide auto-approve controls"
```

---

### Task 7: Web UI (`/w`)

**Files:**
- Create: `frontend-web/src/components/AutoApproveSegment.tsx`
- Create: `frontend-web/src/components/ProjectAutoApproveSwitch.tsx`
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (~1029-1031 handler, ~1440-1461 render)
- Modify: `frontend-web/src/pages/Project.tsx` (header/property region)
- Modify: `frontend-web/src/pages/ProjectDetail.tsx` + `frontend-web/src/pages/ProjectDetailPane.tsx` (header + todo rows)

**Interfaces:** same as Task 6, web components imported from `@web/components/...`.

- [ ] **Step 1: Create `AutoApproveSegment.tsx` (web flat-Notion style)**

`frontend-web/src/components/AutoApproveSegment.tsx`:

```tsx
import clsx from 'clsx'

type Mode = 'on' | 'off' | 'inherit'

/** 3-state auto-approve control for a single todo (web /w). */
export function AutoApproveSegment({
  mode,
  effective,
  projectDefault,
  disabled,
  onChange,
}: {
  mode: Mode
  effective: boolean
  projectDefault: boolean
  disabled?: boolean
  onChange: (mode: Mode) => void
}) {
  const opts: { key: Mode; label: string }[] = [
    { key: 'inherit', label: 'Inherit' },
    { key: 'on', label: 'On' },
    { key: 'off', label: 'Off' },
  ]
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Auto-approve (Owner)</span>
        <span className="text-xs text-muted">{effective ? 'active' : 'off'}</span>
      </div>
      <div className="mt-2 inline-flex rounded-md border border-line p-0.5">
        {opts.map((o) => (
          <button
            key={o.key}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={clsx(
              'rounded px-3 py-1 text-xs font-semibold transition disabled:opacity-60',
              mode === o.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-hover/[0.04]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === 'inherit' && (
        <p className="mt-1.5 text-xs text-muted">
          Follows project default: {projectDefault ? 'ON' : 'OFF'}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `ProjectAutoApproveSwitch.tsx` (web flat-Notion style)**

`frontend-web/src/components/ProjectAutoApproveSwitch.tsx`:

```tsx
import clsx from 'clsx'

/** Project-wide auto-approve default switch (web /w). */
export function ProjectAutoApproveSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-left hover:bg-hover/[0.04] disabled:opacity-60"
    >
      <span className="text-sm font-semibold text-ink">Auto-approve all todos (Owner)</span>
      <span
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
          enabled ? 'bg-brand-600' : 'bg-line',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
```

- [ ] **Step 3: Wire `ProjectItem.tsx`**

Add import:

```tsx
import { AutoApproveSegment } from '@web/components/AutoApproveSegment'
```

Replace the `onToggleAutoApprove` handler (~1029-1031) with:

```tsx
  const onSetAutoApprove = (mode: 'on' | 'off' | 'inherit') => {
    if (!data || setAutoApprove.isPending) return
    setAutoApprove.mutate({ todoId: data.name, mode })
  }
```

Replace the `{data.can_set_auto_approve && ( ... )}` button block (lines 1440-1461) with:

```tsx
                  {data.can_set_auto_approve && (
                    <AutoApproveSegment
                      mode={data.auto_approve_mode}
                      effective={data.auto_approve_effective}
                      projectDefault={data.auto_approve_effective && data.auto_approve_mode === 'inherit'}
                      disabled={setAutoApprove.isPending}
                      onChange={onSetAutoApprove}
                    />
                  )}
```

- [ ] **Step 4: Wire project switch into `Project.tsx`**

Add imports:

```tsx
import { ProjectAutoApproveSwitch } from '@web/components/ProjectAutoApproveSwitch'
import { useSetProjectAutoApprove } from '@/hooks/useData'
```

After `const project = useProject(id)` (and its `p` unwrap ~line 100), add:

```tsx
  const setProjectAutoApprove = useSetProjectAutoApprove()
```

In the project header/property region (near the `PropertyRow` block), add gated:

```tsx
        {p.can_set_auto_approve && (
          <div className="mt-3 max-w-sm">
            <ProjectAutoApproveSwitch
              enabled={p.auto_approve}
              disabled={setProjectAutoApprove.isPending}
              onToggle={() =>
                setProjectAutoApprove.mutate({ project: p.name, enabled: p.auto_approve ? 0 : 1 })
              }
            />
          </div>
        )}
```

- [ ] **Step 5: Wire `ProjectDetail.tsx` + `ProjectDetailPane.tsx`**

In BOTH files add imports:

```tsx
import { AutoApproveSegment } from '@web/components/AutoApproveSegment'
import { ProjectAutoApproveSwitch } from '@web/components/ProjectAutoApproveSwitch'
import { useSetAutoApprove, useSetProjectAutoApprove } from '@/hooks/useData'
```

After the `useProjectDetail(...)` unwrap (`detail`/`d`), add:

```tsx
  const setAutoApprove = useSetAutoApprove()
  const setProjectAutoApprove = useSetProjectAutoApprove()
```

In the detail header region, add the project switch (use the unwrapped detail object — `d`/`detail`; substitute the local name):

```tsx
        {d.can_set_auto_approve && (
          <div className="mt-3 max-w-sm">
            <ProjectAutoApproveSwitch
              enabled={d.auto_approve}
              disabled={setProjectAutoApprove.isPending}
              onToggle={() =>
                setProjectAutoApprove.mutate({ project: d.project, enabled: d.auto_approve ? 0 : 1 })
              }
            />
          </div>
        )}
```

In the `todoGroups.map((g) => ( ... ))` render (row level), add the per-todo segment inside each todo row, wrapped to stop click-through:

```tsx
                {t.can_set_auto_approve && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <AutoApproveSegment
                      mode={t.auto_approve_mode}
                      effective={t.auto_approve_effective}
                      projectDefault={d.auto_approve}
                      disabled={setAutoApprove.isPending}
                      onChange={(mode) => setAutoApprove.mutate({ todoId: t.name, mode })}
                    />
                  </div>
                )}
```

> Use the actual per-row variable name from each file's map (it may be `t`, `todo`, or similar) and the actual unwrapped detail name (`d` vs `detail`). `tsc` in Step 6 confirms.

- [ ] **Step 6: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/components/AutoApproveSegment.tsx frontend-web/src/components/ProjectAutoApproveSwitch.tsx frontend-web/src/pages/ProjectItem.tsx frontend-web/src/pages/Project.tsx frontend-web/src/pages/ProjectDetail.tsx frontend-web/src/pages/ProjectDetailPane.tsx
git commit -m "feat(/w): tri-state todo + project-wide auto-approve controls"
```

---

### Task 8: Build, deploy, verify

**Files:** none (build + deploy + manual verification).

- [ ] **Step 1: Restart backend**

Run: `sudo /usr/local/bin/tj-restart`
Expected: completes; bench reloads.

- [ ] **Step 2: Build both frontends**

Run: `cd frontend && npm run build && cd ../frontend-web && npm run build`
Expected: both builds succeed.

> If the `/m` bundle is served by Cloudflare per the deploy memory, follow the `cloudflare/wrangler deploy` + SW cache-bump steps; otherwise the Frappe-served build is live after restart.

- [ ] **Step 3: Manual E2E on `/m`**

As `mo@vernon.id` on a project you own:
1. Project screen → project-wide switch visible; toggle ON.
2. Open a todo item → segment shows `Inherit` with "default: ON"; effective active.
3. Set that todo to `Off` → advance it to Checked By PL as leader → confirm it STAYS at Checked (opt-out held).
4. Set another todo to `Inherit`, advance to Checked → confirm it AUTO-completes and mints points once.
5. Toggle project switch OFF; set a todo to `On`; advance to Checked → confirm it auto-completes.

- [ ] **Step 4: Manual E2E on `/w`**

Repeat the visibility + one auto-complete + one opt-out check on the web project + project-detail screens.

- [ ] **Step 5: Confirm non-owner sees nothing**

Log in as a non-owner (or a project you don't own) → neither the project switch nor the per-todo segment appears.

- [ ] **Step 6: Final commit (if any build artifacts are tracked)**

```bash
git add -A
git commit -m "chore: build project auto-approve frontends" || echo "nothing to commit"
```

---

## Notes / deliberate scope

- **Recurrence:** `build_occurrence` does not copy `auto_approve` today and won't copy `auto_approve_opt_out` either — a new occurrence resets to Inherit and follows the project default. This matches current behaviour; per-todo overrides are per-occurrence by design.
- **Points & reject:** untouched. `effective` only decides the Checked→Completed skip; points still mint once at Completed (`project_todo.py:377`), reject still guarded to review stages and blocked once Completed.
- **`_shape_todo` drops the raw `auto_approve` key** — any other consumer of that key must migrate to `auto_approve_mode`/`auto_approve_effective`. Task 5 Step 4 `tsc` surfaces all of them.
