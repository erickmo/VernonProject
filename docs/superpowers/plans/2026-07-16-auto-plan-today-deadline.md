# Server-Side Auto-Plan for Today-Deadline Todos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Project Todo's deadline is today, the server writes it into the assignee's day-plan immediately — no browser required — and the assignee cannot remove it.

**Architecture:** One `_ensure_today_allocation()` on the `ProjectTodo` controller, called last from `validate()`. `allocations` is a child table on the same doc, so the row rides the save already in flight: no endpoint, no scheduler, no second write, no recursion. The decision logic is extracted as a module-level **pure function** (`_ensure_today_minutes`) so it is testable without the live DB. The frontend then floors today-deadline rows in Plan-my-day so the now-impossible "remove" doesn't silently bounce back.

**Tech Stack:** Frappe v15 (Python), React + TypeScript (two frontends), esbuild self-checks.

**Spec:** `docs/superpowers/specs/2026-07-16-auto-plan-today-deadline-design.md`

## Global Constraints

- **Live site, code-first.** `project.vernon.id` is the only site; there is **no test DB**. Add **pure** test classes only (no DB writes). Do NOT add DB-integration tests. Precedent: `docs/superpowers/plans/2026-07-13-per-weekday-minimum-minutes.md`.
- **No test framework in the frontends.** No vitest, no tsx. The convention is a co-located `*.selfcheck.ts` using `node:assert`, run via esbuild, and type-checked by `tsc` (it sits in the `src/**` glob). Follow `frontend/src/lib/planDay.selfcheck.ts`. Do NOT add a test runner.
- **`frontend/src` is the SHARED layer.** `@` = `frontend/src`, `@web` = `frontend-web/src`. `usePlanDay.ts`, `planDay.ts` and `PlanRow.tsx` are imported by **both** apps. A change there hits /m and /w together — and a mistake breaks both.
- **The user works in parallel.** Re-check `git status` before every git action. `git add` **only** the files you touched, never `-A`. Note `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` is **already modified** in the working tree by someone else — run `git diff` on it before staging and stage it only if the diff is yours plus theirs is intentional to include; if unsure, ask.
- **Status vocabulary:** Planned is the exact string `"⚪️ Planned"` (with the variation selector). Copy it verbatim; do not retype it.
- **Estimate fallback is `30`** — mirrors `est()` in `frontend/src/lib/planDay.ts:65`. Same number on both sides.
- **Circular imports:** `project_todo.py` imports from `api/mobile.py` only via **deferred, in-function** imports (see `_notify_status_change`). Do not add a module-level import of `api.mobile` to the controller.
- **Bahasa for user-facing copy.** The Plan-my-day note is Bahasa; so is the App Release row.

---

## File Structure

| File | Responsibility |
|---|---|
| `vernon_project/vernon_project/doctype/project_todo/project_todo.py` | Modify: hoist the `PLANNED` constant to module level; add pure `_ensure_today_minutes()`; add `_ensure_today_allocation()`; call it last from `validate()`. |
| `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` | Modify: new pure `TestEnsureTodayMinutes` class (no DB). |
| `frontend/src/lib/planDay.ts` | Modify: add pure `planFloor(t, today)`. |
| `frontend/src/lib/planDay.selfcheck.ts` | Modify: assertions for `planFloor`. |
| `frontend/src/hooks/usePlanDay.ts` | Modify: build a `floors` map, clamp `setMin` to it, seed `mins` from it, return `floors`. |
| `frontend/src/components/PlanRow.tsx` | Modify: accept `floor`, render the Bahasa note when floored. |
| `frontend/src/components/PlanDaySheet.tsx` | Modify: pass `floor` to `PlanRow`. |
| `frontend-web/src/components/PlanDayDrawer.tsx` | Modify: pass `floor` to `PlanRow`. |

Task order is server → shared pure fn → UI → ship. Each task ends green and committed.

---

### Task 1: Server rule (pure function + controller wiring)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `_ensure_today_minutes(status, is_waiting, assigned_to, deadline, today, estimated, current_today_minutes) -> int | None` (module-level, pure). Returns the minutes today's row must hold, or `None` to leave the plan alone. Also `ProjectTodo._ensure_today_allocation(self) -> None`.

- [ ] **Step 1: Write the failing test**

Append to `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` (top-level, after the existing `TestProjectTodo` class — this is a **pure** class, it must not touch the DB and must not subclass `FrappeTestCase`):

```python
class TestEnsureTodayMinutes(unittest.TestCase):
	"""Pure decision test for the today-deadline auto-plan rule. No DB."""

	def setUp(self):
		self.today = "2026-07-16"
		self.base = dict(
			status="⚪️ Planned",
			is_waiting=0,
			assigned_to="test_user@example.com",
			deadline="2026-07-16",
			today=self.today,
			estimated=60,
			current_today_minutes=0,
		)

	def _run(self, **over):
		from vernon_project.vernon_project.doctype.project_todo.project_todo import (
			_ensure_today_minutes,
		)

		return _ensure_today_minutes(**{**self.base, **over})

	def test_due_today_unplanned_gets_the_estimate(self):
		self.assertEqual(self._run(), 60)

	def test_zero_estimate_falls_back_to_30(self):
		self.assertEqual(self._run(estimated=0), 30)

	def test_existing_positive_row_is_left_alone(self):
		self.assertIsNone(self._run(current_today_minutes=90))

	def test_zeroed_row_is_refilled(self):
		self.assertEqual(self._run(current_today_minutes=0), 60)

	def test_other_deadline_is_ignored(self):
		self.assertIsNone(self._run(deadline="2026-07-17"))
		self.assertIsNone(self._run(deadline="2026-07-15"))
		self.assertIsNone(self._run(deadline=None))

	def test_waiting_is_ignored(self):
		self.assertIsNone(self._run(is_waiting=1))

	def test_non_planned_status_is_ignored(self):
		self.assertIsNone(self._run(status="✅ Completed"))
		self.assertIsNone(self._run(status="🟠 Done"))

	def test_unassigned_is_ignored(self):
		self.assertIsNone(self._run(assigned_to=None))
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.vernon_project.doctype.project_todo.test_project_todo \
  --test TestEnsureTodayMinutes
```
Expected: FAIL — `ImportError: cannot import name '_ensure_today_minutes'`.

- [ ] **Step 3: Write the minimal implementation**

In `project_todo.py`, add the module-level constant and pure function **above** `class ProjectTodo` (after the imports):

```python
# The one Planned status string, shared by the controller. `api/mobile.py` keeps
# its own copy (STATUS_PLANNED) — importing it here would be a circular import.
PLANNED = "⚪️ Planned"


def _ensure_today_minutes(
	status, is_waiting, assigned_to, deadline, today, estimated, current_today_minutes
):
	"""Minutes today's allocation row must hold, or None to leave the plan alone.

	A todo whose deadline is today belongs in its assignee's plan for today, always
	— it is written server-side so the plan is right whether or not the assignee
	ever opens the app. Ensure, not overwrite: a row already holding minutes is a
	deliberate choice and is never restated. Only a missing or zeroed row is filled,
	which is what makes the todo unremovable from today without stomping an edit.

	Pure: every input is passed in, so this is testable without the live DB.
	"""
	if not assigned_to or is_waiting or status != PLANNED:
		return None
	if not deadline or getdate(deadline) != getdate(today):
		return None
	if (current_today_minutes or 0) > 0:
		return None
	# Mirrors est() in frontend/src/lib/planDay.ts — an unestimated task plans as 30m.
	return int(estimated or 0) or 30
```

Add the method to `class ProjectTodo` (place it next to the other validate helpers):

```python
	def _ensure_today_allocation(self):
		"""Put a today-deadline todo into its assignee's day-plan, server-side.

		Runs on every save, so it also catches a future todo being pulled back to
		today and both recurrence paths (create_next_occurrence and the tasks.py
		scheduler) — every write reaches validate. `allocations` is a child table on
		this doc, so the row rides the save already in flight: no extra write, no
		recursion.
		"""
		old = self.get_doc_before_save()
		if old and old.assigned_to != self.assigned_to:
			# Allocation rows are per-todo, not per-user: the moment someone else owns
			# this todo, the previous assignee's plan is dead data, and leaving it would
			# silently hand the new assignee the old one's minutes.
			self.set("allocations", [])

		today = nowdate()
		row = next(
			(r for r in self.allocations if getdate(r.allocation_date) == getdate(today)),
			None,
		)
		minutes = _ensure_today_minutes(
			status=self.status,
			is_waiting=self.is_waiting,
			assigned_to=self.assigned_to,
			deadline=self.deadline,
			today=today,
			estimated=self.estimated,
			current_today_minutes=(row.estimated_minutes if row else 0),
		)
		if minutes is None:
			return
		if row:
			row.estimated_minutes = minutes
		else:
			self.append("allocations", {"allocation_date": today, "estimated_minutes": minutes, "note": ""})
```

Wire it as the **last** call in `validate()` so it sees the final `status`, `estimated` and `is_waiting` (`track_waiting()` sets the latter):

```python
	def validate(self):
		self.sync_project_from_detail()
		self.snapshot_point_from_level()
		self.validate_create_permission()
		self.validate_assigned_to_team_member()
		self.validate_start_date()
		self.validate_done_todo_fields()
		self.validate_estimated_max()
		self.validate_estimated_min()
		self.validate_project_admin_status_update()
		self.calculate_total_estimated_hours()
		self.track_phase_changes()
		self.track_waiting()
		self.validate_block_links()
		self.validate_recurrence_rule()
		self._ensure_today_allocation()
```

Then de-duplicate: inside `_notify_status_change`, delete the local `PLANNED = "⚪️ Planned"` line so the method uses the new module-level constant. Leave `DONE`, `CHECKED` and `COMPLETED` exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.vernon_project.doctype.project_todo.test_project_todo \
  --test TestEnsureTodayMinutes
```
Expected: PASS, 8 tests, `OK`.

- [ ] **Step 5: Confirm the constant hoist didn't break the notify path**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 -c "import ast,sys; ast.parse(open('vernon_project/vernon_project/doctype/project_todo/project_todo.py').read()); print('syntax OK')" && grep -n 'PLANNED' vernon_project/vernon_project/doctype/project_todo/project_todo.py
```
Expected: `syntax OK`, and `PLANNED` appears exactly twice — the module-level definition and the `self.status == PLANNED and prev_state in (DONE, CHECKED)` reject branch. If it appears three times, the local was not deleted.

- [ ] **Step 6: Restart the bench so the controller reloads**

```bash
sudo /usr/local/bin/tj-restart
```
Expected: exits 0. (Python change → restart required; standing approval, do not ask.)

- [ ] **Step 7: Commit**

Check `git diff vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` first — that file was already dirty before this work started. Stage only if the pre-existing hunks are meant to ship; otherwise ask.

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py \
        vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat(plan): write today-deadline todos into the assignee's plan server-side"
```

---

### Task 2: Shared `planFloor` + self-check

**Files:**
- Modify: `frontend/src/lib/planDay.ts`
- Test: `frontend/src/lib/planDay.selfcheck.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (the server and client rules are independent mirrors).
- Produces: `planFloor(t: ProjectItem, today: string): number` — the minimum minutes a row may hold. `est(t)` for a non-waiting today-deadline todo, else `0`. `today` is passed in (never read from the clock) so the function stays pure and testable.

- [ ] **Step 1: Write the failing test**

Insert into `frontend/src/lib/planDay.selfcheck.ts`, immediately before the `// autoFillPlan` section marker (line ~61). Also add `planFloor` to the existing import on line 4 so it reads:

```ts
import { autoFillPlan, filterCandidates, sortForPlanning, touchedDiff, buildNext, planFloor } from './planDay'
```

```ts
// planFloor: a today-deadline todo is pinned to today's plan at (at least) its estimate.
const TODAY = '2026-07-16'
assert.equal(planFloor(item({ deadline: TODAY, estimated: 60 }), TODAY), 60, 'due today → floor = estimate')
assert.equal(planFloor(item({ deadline: TODAY, estimated: 0 }), TODAY), 30, 'due today, no estimate → floor = 30')
assert.equal(planFloor(item({ deadline: TODAY, estimated: 60, is_waiting: true }), TODAY), 0, 'waiting → no floor')
assert.equal(planFloor(item({ deadline: '2026-07-17', estimated: 60 }), TODAY), 0, 'future deadline → no floor')
assert.equal(planFloor(item({ deadline: '2026-07-15', estimated: 60 }), TODAY), 0, 'overdue → no floor')
assert.equal(planFloor(item({ deadline: null, estimated: 60 }), TODAY), 0, 'no deadline → no floor')
```

- [ ] **Step 2: Run the self-check to verify it fails**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --outfile=/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js && node /tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js
```
Expected: FAIL — esbuild errors with `No matching export in "src/lib/planDay.ts" for import "planFloor"`.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/lib/planDay.ts`, add after `autoFillPlan` (it reuses the same `est` fallback, so keep them adjacent):

```ts
// The minutes a row may not go below in plan-my-day. A todo whose deadline is
// today is pinned to today's plan by the server (ProjectTodo._ensure_today_allocation)
// and cannot be removed, so the UI must not offer a zero it will hand straight back.
// The floor is the whole estimate, not 1m: splitting a today-deadline task across
// days would put the remainder past its own deadline. `today` is passed in to keep
// this pure. 0 = free (no floor).
export function planFloor(t: ProjectItem, today: string): number {
  if (t.is_waiting || !t.deadline || t.deadline !== today) return 0
  return t.estimated > 0 ? t.estimated : 30
}
```

- [ ] **Step 4: Run the self-check to verify it passes**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --outfile=/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js && node /tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js
```
Expected: PASS — prints `planDay self-check OK` with no assertion error.

- [ ] **Step 5: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/planDay.ts frontend/src/lib/planDay.selfcheck.ts
git commit -m "feat(plan): planFloor pins today-deadline todos to today's plan"
```

---

### Task 3: Clamp the UI and say why

**Files:**
- Modify: `frontend/src/hooks/usePlanDay.ts`
- Modify: `frontend/src/components/PlanRow.tsx`
- Modify: `frontend/src/components/PlanDaySheet.tsx`
- Modify: `frontend-web/src/components/PlanDayDrawer.tsx`

**Interfaces:**
- Consumes: `planFloor(t: ProjectItem, today: string): number` from Task 2.
- Produces: `usePlanDay(...)` gains `floors: Record<string, number>` in its return. `PlanRow` gains a required `floor: number` prop.

- [ ] **Step 1: Add the floors map and clamp `setMin`**

In `frontend/src/hooks/usePlanDay.ts`, extend the import on line 7 to include `planFloor`:

```ts
import { autoFillPlan, filterCandidates, sortForPlanning, touchedDiff, buildNext, planFloor } from '@/lib/planDay'
```

Then replace the `mins` initializer and `setMin` (lines 19-26) with:

```ts
  // A today-deadline todo is pinned to today's plan server-side and cannot be
  // removed, so every edit path clamps to its floor rather than offering a zero
  // the server would hand straight back. One clamp in setMin covers the minus
  // button, the preset chips, "Use est." and a typed 0 — they all route here.
  const floors = useMemo(
    () => Object.fromEntries(candidates.map((t) => [t.name, planFloor(t, today)])),
    [candidates, today],
  )
  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      candidates.map((t) => [t.name, Math.max(planFloor(t, today), t.today_allocation || 0)]),
    ),
  )
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const setMin = (id: string, v: number) =>
    setMins((m) => ({ ...m, [id]: Math.max(floors[id] || 0, Math.round(v)) }))
  const useEstimate = (t: ProjectItem) => setMin(t.name, t.estimated > 0 ? t.estimated : 30)
```

`today` and `useMemo` are both already in scope (lines 17 and 1) — no new imports beyond `planFloor`. Seeding `mins` from the floor rather than from `today_allocation` alone means opening Plan-my-day also repairs a pre-existing today-deadline todo that predates the server rule: `touchedDiff` sees the difference and `save()` writes it.

Add `floors` to the returned object (line 53):

```ts
  return { mins, setMin, useEstimate, query, setQuery, visible, total, saving, save, floors }
```

- [ ] **Step 2: Render the note in the shared row**

In `frontend/src/components/PlanRow.tsx`, add `floor` to the props type and destructuring:

```tsx
export function PlanRow({
  todo,
  minutes,
  floor,
  onSet,
  onUseEstimate,
}: {
  todo: ProjectItem
  minutes: number
  floor: number
  onSet: (id: string, v: number) => void
  onUseEstimate: (t: ProjectItem) => void
}) {
```

Then, directly after the `{todo.project_name}` paragraph closes (`</p>`, ~line 28) and still inside the `<div className="min-w-0">`, add:

```tsx
          {floor > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400">
              Deadline hari ini — wajib di rencana
            </p>
          )}
```

- [ ] **Step 3: Pass the prop from both call sites**

In `frontend/src/components/PlanDaySheet.tsx` line 129, and `frontend-web/src/components/PlanDayDrawer.tsx` line 82, add `floor={plan.floors[t.name] || 0}` to the `<PlanRow .../>` — e.g. the sheet becomes:

```tsx
                <PlanRow key={t.name} todo={t} minutes={plan.mins[t.name] || 0} floor={plan.floors[t.name] || 0} onSet={plan.setMin} onUseEstimate={plan.useEstimate} />
```

- [ ] **Step 4: Type-check both apps**

`floor` is required, so `tsc` failing here means a call site was missed — that is the check.

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && echo "BOTH CLEAN"
```
Expected: `BOTH CLEAN`.

- [ ] **Step 5: Re-run the self-check (nothing regressed)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx esbuild src/lib/planDay.selfcheck.ts --bundle --platform=node --outfile=/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js && node /tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/planday-selfcheck.js
```
Expected: `planDay self-check OK`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/usePlanDay.ts frontend/src/components/PlanRow.tsx \
        frontend/src/components/PlanDaySheet.tsx frontend-web/src/components/PlanDayDrawer.tsx
git commit -m "feat(plan): floor today-deadline rows in plan-my-day, both apps"
```

---

### Task 4: Ship — build, cache, announce

**Files:**
- Modify: `vernon_project/public/frontend/**`, `vernon_project/public/frontend_web/**` (build output)
- Create: a scratch `releases.json`, then an `App Release` row on the live site

**Interfaces:**
- Consumes: the built bundles from Tasks 2-3.
- Produces: nothing further depends on this.

- [ ] **Step 1: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build && cd ../frontend-web && npm run build
```
Expected: both exit 0 and each print a new hashed `index-*.js`.

- [ ] **Step 2: Verify the feature is actually IN the shipped bundle**

Source committed but absent from the built bundle is **not shipped**. `index.html` names the live bundle; grep that exact file for the Bahasa note:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && for d in frontend frontend_web; do \
  f=$(grep -o 'index-[A-Za-z0-9_-]*\.js' vernon_project/public/$d/index.html | head -1); \
  echo "== $d → $f"; grep -c 'wajib di rencana' vernon_project/public/$d/assets/$f; done
```
Expected: a count of `1` (or more) for **both**. A `0` means the bundle is stale — rebuild before going further.

- [ ] **Step 3: Guard the Cloudflare asset cache**

`project.vernon.id` sits behind Cloudflare with `/assets` cached for a year; a rebuild can poison a 0-byte bundle and blank the app with no JS error. Confirm the new bundles are non-zero, then purge:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && find vernon_project/public/frontend/assets vernon_project/public/frontend_web/assets -name 'index-*.js' -size -1k -print | tee /dev/stderr | wc -l
```
Expected: `0` (no undersized bundle). Then purge the zone (`~/.cf_token`, zone `bd13d791fab46ac955b9b068edefc049`) and bump the service-worker `ASSET_CACHE` version per the standing procedure.

- [ ] **Step 4: Commit the build output**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && git status --short vernon_project/public
git add vernon_project/public/frontend vernon_project/public/frontend_web
git commit -m "build(plan): rebuild bundles for today-deadline plan floor"
```

- [ ] **Step 5: Write the App Release row**

This ships a user-visible change on both platforms, so What's New needs a row. Read the newest existing row first and bump **minor** (this is a feature):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version","release_date","platform"], order_by="creation desc", limit=3))
EOF
```

Write the row to a scratch file — substituting `<NEXT>` with the bumped semver from the command above — then insert it in ONE self-contained line (a `for` loop piped to `bench console` silently mis-parses):

```bash
cat > /tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/releases.json <<'EOF'
[{"version":"<NEXT>","release_date":"2026-07-16","platform":"Both","title":"Tugas deadline hari ini otomatis masuk rencana",
  "notes":"Tugas yang deadline-nya hari ini kini langsung masuk rencana harian kamu begitu dibuat, tanpa perlu buka aplikasi dulu (/m & /w)\nTugas deadline hari ini tidak bisa dihapus dari rencana hari ini — menitnya masih bisa kamu tambah\nSaat tugas dialihkan ke orang lain, rencana pemilik lama ikut dibersihkan supaya menitnya tidak terbawa"}]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/1acc1f20-d44b-47eb-a4fa-839216ee641f/scratchpad/releases.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 6: Verify What's New through the real endpoint**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[:1])
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[:1])
EOF
```
Expected: the new row is first in **both** lists (platform `Both` reaches each).

- [ ] **Step 7: Live sanity check**

Create a todo assigned to someone else with today's deadline, then confirm the server wrote the plan row **without** opening that user's dashboard:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("Project Todo", filters={"deadline": frappe.utils.nowdate(), "status": "⚪️ Planned"}, fields=["name","assigned_to","estimated"], limit=3))
EOF
```
Then for one of those names, re-save it and confirm an allocation row for today appears with `estimated_minutes > 0`. Report the actual output — do not claim it works without it.

---

## Notes

- **`docs/` regeneration is not needed.** No DocType, whitelisted endpoint or hook was added or removed — `scripts/gen_docs.py` covers the app's *shape*, which is unchanged. (`_ensure_today_minutes` is a module-level helper, not a `@frappe.whitelist()`.)
- **No backfill.** Today's existing due-today todos never hit `validate`, so they get no server row — the frontend `autoFillPlan` base still adds them on the next dashboard load, and Task 3's floor-seeded `mins` repairs them when Plan-my-day opens. This is why `base` stays in `autoFillPlan` rather than being deleted as now-redundant.
- **`useAutoPlanToday` is unchanged.** It still does the top-up-toward-the-daily-minimum work (pulling overdue then future), which is per-user session logic the server rule does not replace.
