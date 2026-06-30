# Project Todo "Waiting" Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user park a Planned todo as "waiting" (on something external) with a required reason — it stays a todo (not done), shows a badge, is suppressed from overdue/nudges, and auto-clears when the todo advances.

**Architecture:** Four new fields on the `Project Todo` doctype; a `track_waiting()` lifecycle hook in the controller `validate()` enforces the rules; the existing `mobile.update_todo` whitelisted endpoint carries the toggle (no new endpoint); all todo reads funnel through `_fetch_todos`, so one SELECT + two shaping functions plumb `is_waiting` to the frontend; overdue computations and two scheduled nudge jobs gain an `is_waiting` guard. Mobile `/m` UI adds a badge (`TodoCard`), a mark-waiting/resume action (`ProjectItemScreen`), and an optional filter.

**Tech Stack:** Frappe (Python doctype + controller + whitelisted API), React + TypeScript + Tailwind (Vite PWA under `frontend/`), TanStack Query.

## Global Constraints

- Live site (`project.vernon.id`), no test DB. Deploy after backend changes: `bench --site project.vernon.id migrate` (schema for new fields) + `bench restart` (Python). Frontend: `cd frontend && npm run build`. (per deploy-mechanics)
- Never use native `alert/confirm/prompt`; use the in-app dialog/modal patterns already in the screen. (per no-alert-use-dialog)
- Waiting is only valid while `status == "⚪️ Planned"`. The canonical Planned value contains a variation-selector emoji `⚪️ Planned` — copy it verbatim.
- `status_key` for Planned is `'planned'`. The `StatusKey` union (`planned|done|checked|completed|cancelled`) does NOT change — waiting is orthogonal.
- `git add` only the files this plan touches (the user works in the repo in parallel). Re-check `git status` before each commit. (per user-parallel)
- bench console: write loop-free snippets; piping for-loops mis-parses. (per bench-console-stdin-gotcha)

---

### Task 1: Doctype fields + controller lifecycle

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (add to `field_order` after `"status"`, add 4 field objects)
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py` (call `track_waiting` in `validate`, define `track_waiting`)
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

**Interfaces:**
- Produces: doc fields `is_waiting` (0/1), `waiting_reason` (str|None), `waiting_since` (datetime|None), `waiting_by` (User|None); controller method `track_waiting(self)` called inside `validate()`.

- [ ] **Step 1: Add the four fields to the doctype JSON**

In `project_todo.json`, find the `field_order` array entry `"status"` and insert the four new fieldnames immediately after it:

```json
		"status",
		"is_waiting",
		"waiting_reason",
		"waiting_since",
		"waiting_by",
```

Then add these four objects to the `fields` array (place right after the existing `status` field object):

```json
		{
			"default": "0",
			"fieldname": "is_waiting",
			"fieldtype": "Check",
			"label": "Waiting"
		},
		{
			"depends_on": "is_waiting",
			"fieldname": "waiting_reason",
			"fieldtype": "Small Text",
			"label": "Waiting Reason",
			"description": "Why this todo is parked (required while waiting)"
		},
		{
			"fieldname": "waiting_since",
			"fieldtype": "Datetime",
			"label": "Waiting Since",
			"read_only": 1
		},
		{
			"fieldname": "waiting_by",
			"fieldtype": "Link",
			"label": "Waiting Set By",
			"options": "User",
			"read_only": 1
		},
```

- [ ] **Step 2: Write the failing test**

Create/extend `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`. If the file already exists, add this test class/methods alongside the existing ones (reuse any existing helper that builds a Project Todo; otherwise the helper below shows the minimum fields). Use the project's existing test fixture pattern if present.

```python
import frappe
from frappe.tests.utils import FrappeTestCase


class TestProjectTodoWaiting(FrappeTestCase):
	def _make_planned_todo(self):
		"""Smallest Planned Project Todo. Reuse an existing Project Detail fixture
		if the suite already has one; otherwise create the chain in setUp."""
		todo = frappe.new_doc("Project Todo")
		todo.to_do = "waiting-test"
		todo.project_detail = self.detail  # set up in setUp (see existing tests)
		todo.status = "⚪️ Planned"
		return todo

	def test_waiting_requires_reason(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = None
		self.assertRaises(frappe.ValidationError, todo.insert)

	def test_marking_waiting_stamps_audit(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "waiting on client"
		todo.insert()
		self.assertTrue(todo.waiting_since)
		self.assertEqual(todo.waiting_by, frappe.session.user)
		self.assertEqual(todo.status, "⚪️ Planned")  # still a todo, not done

	def test_clearing_waiting_wipes_audit_and_reason(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "x"
		todo.insert()
		todo.is_waiting = 0
		todo.save()
		self.assertFalse(todo.waiting_since)
		self.assertFalse(todo.waiting_by)
		self.assertFalse(todo.waiting_reason)

	def test_advancing_status_force_clears_waiting(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "x"
		todo.insert()
		todo.status = "🟠 Done"
		todo.save()
		self.assertFalse(todo.is_waiting)
		self.assertFalse(todo.waiting_since)
```

> Note (per project convention): the live site has no test DB, so the suite runs in the final test phase. For immediate confidence after Step 3, use the loop-free bench-console smoke in Step 4b.

- [ ] **Step 3: Implement `track_waiting` and wire it into `validate`**

In `project_todo.py`, add the call inside `validate()` (right after `self.track_phase_changes()` at line ~23):

```python
		self.track_phase_changes()
		self.track_waiting()
```

Then add the method (place it next to `track_phase_changes`):

```python
	def track_waiting(self):
		"""Manual 'parked / waiting on external' flag. Only valid while the todo is
		still Planned (a todo, not done). Advancing the status force-clears it. A
		reason is required while waiting; clearing wipes the reason + audit so
		nothing stale lingers."""
		if self.status != "⚪️ Planned":
			self.is_waiting = 0

		if self.is_waiting:
			if not (self.waiting_reason and self.waiting_reason.strip()):
				frappe.throw(_("Please add a reason before marking this todo as waiting."))
			if not self.waiting_since:
				self.waiting_since = now_datetime()
				self.waiting_by = frappe.session.user
		else:
			self.waiting_since = None
			self.waiting_by = None
			self.waiting_reason = None
```

(`frappe`, `_`, and `now_datetime` are already imported at the top of the file.)

- [ ] **Step 4a: Deploy schema + Python**

```bash
bench --site project.vernon.id migrate
bench restart
```

Expected: migrate adds the four columns to `tabProject Todo`; no errors.

- [ ] **Step 4b: Loop-free bench-console smoke (immediate check, no test DB needed)**

Pick a real existing Planned todo name from the site and run (replace `TODO-NAME`):

```bash
bench --site project.vernon.id console <<'PY'
import frappe
d = frappe.get_doc("Project Todo", "TODO-NAME")
d.is_waiting = 1
d.waiting_reason = "smoke test"
d.save()
print("since:", d.waiting_since, "by:", d.waiting_by, "status:", d.status)
d.is_waiting = 0
d.save()
print("cleared since:", d.waiting_since, "reason:", d.waiting_reason)
frappe.db.rollback()
PY
```

Expected: first print shows a timestamp + a user + `⚪️ Planned`; second print shows `None` and `None`. `frappe.db.rollback()` leaves the live row untouched.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/vernon_project/doctype/project_todo/project_todo.py vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat(todo): waiting flag fields + lifecycle"
```

---

### Task 2: Carry the toggle through `update_todo`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`update_todo`, ~line 1371)

**Interfaces:**
- Consumes: doc fields from Task 1.
- Produces: `mobile.update_todo` accepts `is_waiting` and `waiting_reason`; the existing edit-permission gate (SM / owner / leader / assigned_to) applies; `row.save()` runs `track_waiting`, so a no-reason waiting toggle is rejected server-side.

- [ ] **Step 1: Add params to the signature**

In `update_todo` (line ~1391), add the two params before the closing paren (after `mentor=None,`):

```python
	mentor=None,
	is_waiting=None,
	waiting_reason=None,
):
```

- [ ] **Step 2: Apply them before save**

Just before `row.save(ignore_permissions=True)` (line ~1490), add:

```python
		# Waiting flag (parked / on-hold). The controller's track_waiting enforces
		# the required-reason rule and the Planned-only constraint on save.
		if is_waiting is not None:
			row.is_waiting = 1 if str(is_waiting) in ("1", "true", "True") else 0
		if waiting_reason is not None:
			row.waiting_reason = waiting_reason or None
```

- [ ] **Step 3: Deploy Python**

```bash
bench restart
```

- [ ] **Step 4: Verify via the API (manual)**

From a logged-in mobile session (or browser devtools while signed in), call `updateTodo` on a Planned todo with `{ is_waiting: 1 }` and no reason → expect `{status:'error'}` with the reason message. Then with `{ is_waiting: 1, waiting_reason: 'x' }` → expect success. Confirm in Desk the row shows Waiting checked + reason.

Expected: no-reason call is rejected by `track_waiting`; reason call succeeds.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(todo): accept waiting toggle in update_todo"
```

---

### Task 3: Plumb `is_waiting` to reads + suppress overdue/nudges

**Files:**
- Modify: `vernon_project/api/mobile.py` (`_fetch_todos` SELECT ~386; `_shape_todo` ~474–530; `_shape_item_row` ~577–596; projects rollup ~780; gantt bar overdue ~441; `get_project_item` name_map ~1249)
- Modify: `vernon_project/tasks.py` (`notify_due_todos` ~125; `notify_comeback_nudge` ~188)

**Interfaces:**
- Consumes: doc fields from Task 1.
- Produces: every shaped todo dict gains `is_waiting: bool`, `waiting_reason: str|None`, `waiting_since: str|None`, `waiting_by_name: str|None`; `is_overdue` is false while waiting; both nudge jobs skip waiting todos.

- [ ] **Step 1: Select the new columns in `_fetch_todos`**

In the SELECT (line ~388, after `t.estimated, t.assigned_to,`), add:

```python
			t.estimated, t.assigned_to,
			t.is_waiting, t.waiting_reason, t.waiting_since, t.waiting_by,
```

- [ ] **Step 2: Suppress overdue + emit waiting fields in `_shape_todo`**

Change the `overdue` computation (line ~482) to also require not-waiting:

```python
		overdue = bool(
			row["deadline"]
			and skey != "completed"
			and not row.get("is_waiting")
			and getdate(row["deadline"]) < getdate(nowdate())
		)
```

Add the waiting fields to the `out` dict (e.g. right after the `"is_overdue": overdue,` line ~511):

```python
			"is_overdue": overdue,
			"is_waiting": bool(row.get("is_waiting")),
			"waiting_reason": row.get("waiting_reason") or None,
			"waiting_since": str(row["waiting_since"]) if row.get("waiting_since") else None,
			"waiting_by_name": (name_map.get(row.get("waiting_by"), {}) or {}).get("full_name") or row.get("waiting_by"),
```

- [ ] **Step 3: Suppress overdue + emit `is_waiting` in `_shape_item_row`**

Change its `is_overdue` (line ~590) and add `is_waiting` to the returned dict:

```python
			"is_overdue": bool(
				row["deadline"] and skey != "completed"
				and not row.get("is_waiting")
				and getdate(row["deadline"]) < getdate(nowdate())
			),
			"is_waiting": bool(row.get("is_waiting")),
			"assigned_to": row["assigned_to"],
```

- [ ] **Step 4: Suppress the projects-tab overdue rollup**

In the rollup loop (line ~780), add the guard:

```python
			else:
				if r["deadline"] and not r.get("is_waiting") and getdate(r["deadline"]) < today:
					s["overdue"] += 1
```

- [ ] **Step 5: Suppress the gantt bar overdue flag**

At line ~441:

```python
				"overdue": bool(dl and skey != "completed" and not r.get("is_waiting") and getdate(dl) < getdate(nowdate())),
```

- [ ] **Step 6: Resolve `waiting_by` name on the single-todo screen**

In `get_project_item`, add `waiting_by` to the emails set feeding `name_map` (line ~1249):

```python
		emails = {r["assigned_to"], r["developed_by"], r["tested_by"], r["completed_by"], r.get("waiting_by")} | team_emails
```

(`_user_name_map` already tolerates falsy entries; this just lets `waiting_by_name` resolve to a full name on the detail screen.)

- [ ] **Step 7: Suppress the two scheduled nudges**

In `tasks.py`, `notify_due_todos` SQL (line ~129) add the guard inside the WHERE:

```python
		WHERE status LIKE %(planned)s
		  AND is_waiting = 0
		  AND assigned_to IS NOT NULL AND assigned_to != ''
		  AND deadline IS NOT NULL
		  AND deadline <= %(today)s
```

And `notify_comeback_nudge` SQL (line ~192):

```python
		WHERE status LIKE %(planned)s
		  AND is_waiting = 0
		  AND assigned_to IS NOT NULL AND assigned_to != ''
```

- [ ] **Step 8: Deploy + verify**

```bash
bench restart
```

Verify (loop-free console): mark a real Planned overdue todo waiting, then confirm the dashboard shape no longer flags it overdue:

```bash
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api.mobile import _fetch_todos, _shape_todo, _user_name_map
# pick a project the test user can see; replace PROJECT
rows = _fetch_todos(["PROJECT"])
r = next(x for x in rows if x["status"].endswith("Planned") and x["deadline"])
nm = _user_name_map({r["assigned_to"]})
before = _shape_todo(r, frappe.session.user, nm)["is_overdue"]
r["is_waiting"] = 1
after = _shape_todo(r, frappe.session.user, nm)["is_overdue"]
print("overdue before/after waiting:", before, after)
PY
```

Expected: if the row was overdue, prints `True False`; otherwise `False False`. Either way `after` is `False`.

- [ ] **Step 9: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/tasks.py
git commit -m "feat(todo): plumb waiting to reads, suppress overdue + nudges"
```

---

### Task 4: Frontend types + TodoCard badge

**Files:**
- Modify: `frontend/src/lib/types.ts` (`ProjectItem` interface ~86)
- Modify: `frontend/src/components/TodoCard.tsx` (badge ~90; border ~62)

**Interfaces:**
- Consumes: shaped fields from Task 3.
- Produces: `ProjectItem` gains `is_waiting`, `waiting_reason`, `waiting_since`, `waiting_by_name`; `TodoCard` shows a Waiting pill and keeps the normal border while waiting.

- [ ] **Step 1: Add fields to the `ProjectItem` interface**

In `types.ts`, after `is_overdue: boolean` (line ~97):

```ts
  is_overdue: boolean
  is_waiting: boolean
  waiting_reason: string | null
  waiting_since: string | null
  waiting_by_name: string | null
```

- [ ] **Step 2: Render the Waiting pill in `TodoCard`**

In `TodoCard.tsx`, import a pause icon — add `Pause` to the existing `lucide-react` import (line 3). Then, right after the status `<Pill>` block (line ~93), add:

```tsx
            <Pill className={meta.pill}>
              <span>{meta.emoji}</span>
              {meta.label}
            </Pill>
            {todo.is_waiting && (
              <Pill className="bg-stone-200 text-stone-700 dark:bg-slate-700 dark:text-slate-200">
                <Pause className="h-3.5 w-3.5" />
                Waiting
              </Pill>
            )}
```

- [ ] **Step 3: Keep the normal border while waiting**

The red overdue border at line ~62 keys off `todo.is_overdue`, which the backend already forces false while waiting (Task 3) — so no change is strictly required. Confirm by reading line 62; leave it as `todo.is_overdue ? 'border-rose-400' : meta.ring`. No edit.

- [ ] **Step 4: Typecheck + build**

```bash
cd frontend && npm run build
```

Expected: build succeeds, no TS errors about `is_waiting`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/components/TodoCard.tsx
git commit -m "feat(todo): waiting badge on TodoCard"
```

---

### Task 5: Mark-waiting / Resume action on the detail screen

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (badge row ~978; action wiring near the cancel pattern ~834 and quick-actions ~896)

**Interfaces:**
- Consumes: `ProjectItem` waiting fields (Task 4); `useUpdateTodo(id)` hook (already exists, mutates `mobileApi.updateTodo(id, fields)` and invalidates the right queries).
- Produces: user can mark a Planned todo waiting (with required reason) and resume it; the detail screen shows the reason + "Waiting since … · set by …".

- [ ] **Step 1: Add a waiting badge to the badge row**

In the existing badge group (lines ~978–996), add a waiting chip. Reuse the `Pause` icon (add `Pause` to the `lucide-react` import at the top if not present):

```tsx
              {data.is_waiting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-slate-200">
                  <Pause className="h-3.5 w-3.5" /> Waiting{data.waiting_reason ? ` · ${data.waiting_reason}` : ''}
                </span>
              )}
```

Also widen the row's render condition so the badge group shows when waiting:

```tsx
          {(data.is_missed || data.recurring.is_recurring || data.phase_estimates.total > 0 || data.is_waiting) && (
```

- [ ] **Step 2: Add waiting state + handlers (mirror the existing cancel-reason pattern)**

Near the existing cancel state (line ~834: `const [showCancel, setShowCancel] = useState(false)` / `cancelReason`), add a `useUpdateTodo` instance and waiting modal state. There is already a `setDeadlineToday = useUpdateTodo(id)` at line ~829 — add a separate one for clarity:

```tsx
  const setWaiting = useUpdateTodo(id)
  const [showWaiting, setShowWaiting] = useState(false)
  const [waitingReason, setWaitingReason] = useState('')

  const onMarkWaiting = () => {
    if (setWaiting.isPending || !waitingReason.trim()) return
    setWaiting.mutate(
      { is_waiting: 1, waiting_reason: waitingReason.trim() },
      {
        onSuccess: () => { setShowWaiting(false); setWaitingReason(''); toast('success', 'Marked as waiting') },
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
  const onResume = () => {
    if (setWaiting.isPending) return
    setWaiting.mutate(
      { is_waiting: 0 },
      {
        onSuccess: () => toast('success', 'Resumed'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
  // Parking is only meaningful while the todo is still Planned and editable.
  const canWait = data.can_edit && data.status_key === 'planned'
```

- [ ] **Step 3: Render the action button + reason modal**

Place the trigger alongside the other quick actions (e.g. near where `canSetDeadlineToday` / `canSplitToday` buttons render). Show "Resume" when waiting, otherwise "Mark waiting":

```tsx
          {canWait && (data.is_waiting ? (
            <button
              onClick={onResume}
              disabled={setWaiting.isPending}
              className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-3.5 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-95 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          ) : (
            <button
              onClick={() => setShowWaiting(true)}
              className="flex items-center gap-1.5 rounded-full bg-stone-100 dark:bg-slate-700 px-3.5 py-2 text-sm font-semibold text-stone-700 dark:text-slate-200 transition active:scale-95"
            >
              <Pause className="h-4 w-4" /> Mark waiting
            </button>
          ))}
```

Add the reason modal. Mirror the existing cancel modal markup in this file (search for `showCancel` JSX and copy its overlay/structure so styling matches); the waiting variant:

```tsx
          {showWaiting && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center">
              <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-xl">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Mark as waiting</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What is this todo waiting on?</p>
                <textarea
                  autoFocus
                  value={waitingReason}
                  onChange={(e) => setWaitingReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. waiting on client reply"
                  className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => { setShowWaiting(false); setWaitingReason('') }} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
                  <button
                    onClick={onMarkWaiting}
                    disabled={!waitingReason.trim() || setWaiting.isPending}
                    className="rounded-full bg-stone-800 dark:bg-slate-200 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 disabled:opacity-50"
                  >
                    Mark waiting
                  </button>
                </div>
              </div>
            </div>
          )}
```

(Add `Pause` and `Play` to the `lucide-react` import if not already present — `Play` is likely already imported for focus.)

- [ ] **Step 4: Show the audit line when waiting**

Near where the badge/reason is shown (or under the meta tiles), add a read-only audit line:

```tsx
          {data.is_waiting && data.waiting_since && (
            <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
              Waiting since {data.waiting_since.slice(0, 10)}
              {data.waiting_by_name ? ` · set by ${data.waiting_by_name}` : ''}
            </p>
          )}
```

- [ ] **Step 5: Typecheck + build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Manual smoke**

On the live mobile app: open a Planned todo → "Mark waiting" → enter a reason → submit. Confirm: badge appears, the card no longer shows red/overdue, and the audit line shows. Then "Resume" → badge clears.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(todo): mark waiting / resume action on detail screen"
```

---

### Task 6 (optional): Waiting filter

**Files:**
- Modify: `frontend/src/lib/filters.ts` (`applyProjectItemFilters` ~47)
- Modify: `frontend/src/components/FilterSheet.tsx` (add a Waiting option to the filter UI, matching its existing option pattern)

**Interfaces:**
- Consumes: `ProjectItem.is_waiting`.
- Produces: `applyProjectItemFilters` honors `f.waiting` (`'only'` → waiting todos; `'hide'` → non-waiting; absent → all).

- [ ] **Step 1: Add the filter clause**

In `applyProjectItemFilters` (line ~48), add one predicate:

```ts
      (!f.leader || t.project_leader === f.leader) &&
      (!f.waiting || (f.waiting === 'only' ? t.is_waiting : !t.is_waiting)) &&
      matchEstimate(f.estimate || '', t.estimated),
```

- [ ] **Step 2: Add the option to `FilterSheet`**

Open `frontend/src/components/FilterSheet.tsx`, find how an existing single-choice filter (e.g. status) is rendered, and add a "Waiting" group with options `All` (clears `waiting`), `Only waiting` (`'only'`), `Hide waiting` (`'hide'`) writing to the `waiting` filter key. Follow the file's existing option-row markup verbatim — do not introduce a new control style.

- [ ] **Step 3: Build + commit**

```bash
cd frontend && npm run build
git add frontend/src/lib/filters.ts frontend/src/components/FilterSheet.tsx
git commit -m "feat(todo): optional waiting filter"
```

---

## Final deploy

After all tasks: rebuild the frontend bundle that the site serves and restart.

```bash
cd frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project
bench --site project.vernon.id migrate   # if not already run in Task 1
bench restart
```

(The built assets land under `vernon_project/public/frontend/…` — commit those per the repo's existing convention only if the user does; the user often rebuilds/commits assets themselves.)

## Self-review notes

- **Spec coverage:** fields (T1) ✓; required reason server+client (T1 throw, T5 disabled submit) ✓; reuse update_todo (T2) ✓; suppress overdue at 4 sites + 2 nudges (T3) ✓; audit who/when (T1 set, T3 emit `waiting_by_name`, T5 display) ✓; auto-clear on advance (T1) ✓; mobile badge (T4) + action (T5) + optional filter (T6) ✓; web deferred (noted, no task) ✓.
- **No point-ledger impact:** status never changes, so no Point Ledger interaction — no task needed.
- **Type consistency:** `is_waiting/waiting_reason/waiting_since/waiting_by_name` named identically across `_shape_todo` (T3), `ProjectItem` (T4), and UI (T5). Backend `waiting_by` (User id) is resolved to `waiting_by_name` (full name) before reaching the frontend.
