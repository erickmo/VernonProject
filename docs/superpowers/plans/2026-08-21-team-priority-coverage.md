# Team Priority Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a project leader/owner a per-team-member, per-week view of whether daily priority
slots are filled, with a tap-through to fill any gap — a new "Tim" mode in the Plan screen.

**Architecture:** One new whitelisted endpoint, `get_team_priority_coverage(project, week_start)`,
computes the whole team's whole-week occupancy in a single targeted SQL query (same indexed
pattern already proven in `get_priority_occupancy`). One new shared component renders it as a
name + 7-dot row per member. Both `PlanScreen.tsx`/`Plan.tsx` gain a 4th mode tab plus a small,
additive deep-link mechanism (read `location.state` on mount) so tapping a dot can jump straight
to the existing single-day `PlanDeadlineDay` view pre-set to that date.

**Tech Stack:** Frappe v15 (Python 3.11, MariaDB), React 18 + TypeScript + Vite + TanStack Query,
Tailwind, React Router v6. Two frontends: `frontend/` (mobile `/m`), `frontend-web/` (web `/w`).

## Global Constraints

- **Both frontends, always.** Every piece here ships to `/m` and `/w`, each in its own frontend's
  existing idiom. Rebuild both bundles.
- **Live site, no test database.** Tests write throwaway fixture data and clean up after
  themselves — mirror the existing `_PriorityFixture` in `vernon_project/api/test_priority_slots.py`.
- **Bahasa Indonesia end-user copy**, matching the mixed convention already used across this
  feature (Bahasa body/labels, English chrome where the existing pattern already uses English).
- **No native `confirm()`/`alert()`/`prompt()`.**
- **Every dropdown uses `SearchableSelect`.**
- **Restart command:** `sudo /usr/local/bin/tj-restart` (never `bench restart`).
- **Tabs, not spaces**, in Python files.
- **`python3 scripts/gen_docs.py`** must be re-run and committed — this adds a new whitelisted
  endpoint.
- **What's New** row required at the end.
- **True site-wide occupancy, never locally-visible-only** — this is the exact lesson the prior
  plan's final review already had to fix once (`get_priority_occupancy` was briefly shipped scoped
  to the requester's visible projects instead of the real cap count). This new endpoint's `used`
  values must be genuinely global (any project, anywhere), matching what the controller's cap
  actually enforces — never re-introduce a visibility-scoped count.

## File Map

| File | Responsibility |
|---|---|
| `vernon_project/api/mobile.py` | new `get_team_priority_coverage(project, week_start)` endpoint |
| `vernon_project/api/test_priority_slots.py` | tests for the new endpoint |
| `frontend/src/lib/api.ts` | `mobileApi.teamPriorityCoverage(project, weekStart)` |
| `frontend/src/hooks/useData.ts` | `keys.teamPriorityCoverage`, `useTeamPriorityCoverage` |
| `frontend/src/lib/types.ts` | `TeamPriorityCoverage` response type |
| `frontend/src/components/TeamPriorityCoverage.tsx` | **new** — shared component, both frontends via `@` |
| `frontend/src/pages/PlanScreen.tsx` | new "Tim" mode tab + deep-link read (mobile) |
| `frontend-web/src/pages/Plan.tsx` | same (web) |

---

### Task 1: Backend — `get_team_priority_coverage` endpoint + tests

**Files:**
- Modify: `vernon_project/api/mobile.py` (add the function; place it right after
  `get_priority_occupancy`, since it reuses the same query shape and helpers)
- Modify: `vernon_project/api/test_priority_slots.py` (add a new test class)

**Interfaces:**
- Consumes: `get_project_admins` (already imported in `mobile.py`), `_user_name_map`,
  `_shape_todo` is NOT needed here (this endpoint returns aggregate counts, not shaped todos) —
  only `_user_name_map` for full names. `STATUS_CANCELLED` (already defined in `mobile.py`).
- Produces: `get_team_priority_coverage(project, week_start) -> {"members": [{"user": str,
  "full_name": str, "days": [{"date": str, "used": int, "slots": int, "contributed": bool}, ...
  7 entries, Mon..Sun]}]}`. Task 2's frontend type and Task 3's component consume this exact shape.

- [ ] **Step 1: Add the endpoint**

Insert into `vernon_project/api/mobile.py`, immediately after `get_priority_occupancy` (which ends
with `return out`):

```python
@frappe.whitelist()
def get_team_priority_coverage(project, week_start):
	"""One project's whole team, one week, priority-slot fill status per person per day.

	Permission: caller must be System Manager, or that project's owner/leader, or a
	Project Admin User on it — same gate `update_todo`'s `is_priority` param already uses.

	For every Project Team member, for every day Mon-Sun starting at `week_start`, returns
	{used, slots, contributed}: `used`/`slots` are that person's TRUE site-wide priority
	occupancy that day (any project, anywhere — the same global count the controller's cap
	enforces, never scoped down to just this project's visibility), and `contributed` is
	whether one of that day's priority rows for that person belongs to THIS project. One
	query for the whole team, whole week — not one call per user per day.
	"""
	requester = frappe.session.user
	if not frappe.db.exists("Project", project):
		frappe.throw("Project not found.")
	proj = frappe.db.get_value("Project", project, ["project_owner", "project_leader"], as_dict=True)
	is_sm = "System Manager" in frappe.get_roles(requester)
	if not (
		is_sm
		or requester in (proj.project_owner, proj.project_leader)
		or requester in get_project_admins(project)
	):
		frappe.throw("Not permitted", frappe.PermissionError)

	members = sorted(set(frappe.get_all(
		"Project Team", filters={"parent": project}, pluck="user", limit_page_length=0
	)))
	week_start_date = getdate(week_start)
	week_dates = [add_days(week_start_date, i) for i in range(7)]
	week_end_date = week_dates[-1]

	slots = cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots"))
	name_map = _user_name_map(set(members))
	empty_days = [{"date": str(d), "used": 0, "slots": 0, "contributed": False} for d in week_dates]

	if not members:
		return {"members": []}
	if not slots:
		return {"members": [
			{"user": u, "full_name": name_map.get(u, {}).get("full_name") or u, "days": list(empty_days)}
			for u in members
		]}

	rows = frappe.db.sql(
		"""
		SELECT t.assigned_to, t.deadline, pd.project
		FROM `tabProject Todo` t
		JOIN `tabProject Detail` pd ON t.project_detail = pd.name
		WHERE t.is_priority = 1
			AND t.assigned_to IN %(members)s
			AND t.deadline BETWEEN %(start)s AND %(end)s
			AND t.status != %(cancelled)s
		""",
		{
			"members": tuple(members),
			"start": week_start_date,
			"end": week_end_date,
			"cancelled": STATUS_CANCELLED,
		},
		as_dict=True,
	)

	out_members = []
	for u in members:
		days = []
		for d in week_dates:
			# getdate()-wrap both sides — frappe.db.sql doesn't guarantee r.deadline comes back
			# as a clean date object across drivers, matching the safety get_priority_occupancy
			# already applies to the same comparison.
			day_rows = [r for r in rows if r.assigned_to == u and getdate(r.deadline) == d]
			days.append({
				"date": str(d),
				"used": len(day_rows),
				"slots": slots,
				"contributed": any(r.project == project for r in day_rows),
			})
		out_members.append({
			"user": u,
			"full_name": name_map.get(u, {}).get("full_name") or u,
			"days": days,
		})
	return {"members": out_members}
```

`add_days`/`getdate`/`cint` are already imported at module scope in `mobile.py` (used throughout
the file) — confirm before assuming; if any is missing from the top-level `from frappe.utils
import ...` line, add it there rather than a local import.

- [ ] **Step 2: Restart and smoke-test by hand**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
p = frappe.get_all("Project", filters={"project_owner": "Administrator"}, limit=1, pluck="name")
print(p)
if p:
    print(frappe.call("vernon_project.api.mobile.get_team_priority_coverage", project=p[0], week_start=frappe.utils.nowdate()))
EOF
```

Expected: a `{"members": [...]}` dict, each member with a 7-entry `days` list.

- [ ] **Step 3: Write the tests**

First, update the file's existing top-level import line (currently
`from frappe.utils import add_days, nowdate`) to also pull in `getdate`:

```python
from frappe.utils import add_days, getdate, nowdate
```

And add a new import line right after it for `timedelta` (used only by this new test class's
week-start helper):

```python
from datetime import timedelta
```

Then add the test class to `vernon_project/api/test_priority_slots.py`, after the existing
`TestPriorityOccupancy` class (reusing the same `_PriorityFixture`: `prio_leader@example.com`
leads Prio Project 1 and is genuinely non-SM; `Administrator` owns/leads Prio Project 2;
`prio_assignee@example.com` is a team member of both):

```python
class TestTeamPriorityCoverage(_PriorityFixture):
	def _coverage(self, project, week_start, as_user="Administrator"):
		from vernon_project.api.mobile import get_team_priority_coverage
		frappe.set_user(as_user)
		try:
			return get_team_priority_coverage(project, week_start)
		finally:
			frappe.set_user("Administrator")

	def _week_start_for_day(self):
		# Monday on/before self.day, so self.day's priority always lands inside the window.
		d = getdate(self.day)
		return str(d - timedelta(days=d.weekday()))

	def test_non_sm_leader_can_view_their_own_project(self):
		self._todo(0)  # priority todo for prio_assignee in Prio Project 1, on self.day
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		day = next(d for d in member["days"] if d["date"] == self.day)
		self.assertEqual(day["used"], 1)
		self.assertEqual(day["slots"], 3)
		self.assertTrue(day["contributed"])

	def test_unrelated_user_cannot_view_project_coverage(self):
		p1, _g1 = self.projects[0]
		with self.assertRaises(frappe.PermissionError):
			self._coverage(p1.name, self._week_start_for_day(), as_user="prio_assignee@example.com")

	def test_contributed_is_false_when_slot_filled_by_a_different_project(self):
		# prio_assignee is on BOTH projects' teams. Flag their priority via Project 2 (owned/led
		# by Administrator) — Project 1's leader should see `used=1` (true site-wide count) but
		# `contributed=False` (Project 1 itself claimed nothing that day).
		self._todo(1)  # detail_idx=1 -> Prio Project 2
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		day = next(d for d in member["days"] if d["date"] == self.day)
		self.assertEqual(day["used"], 1)
		self.assertFalse(day["contributed"])

	def test_feature_off_returns_zero_days(self):
		_set(daily_priority_slots=0)
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		self.assertTrue(all(d["used"] == 0 and d["slots"] == 0 for d in member["days"]))

	def test_week_has_seven_days_in_order(self):
		p1, _g1 = self.projects[0]
		ws = self._week_start_for_day()
		out = self._coverage(p1.name, ws, as_user="prio_leader@example.com")
		member = out["members"][0]
		self.assertEqual(len(member["days"]), 7)
		expected = [str(add_days(ws, i)) for i in range(7)]
		self.assertEqual([d["date"] for d in member["days"]], expected)
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_priority_slots
```

Expected: all tests pass (18 pre-existing + 5 new = 23).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_priority_slots.py
git commit -m "feat(priority): get_team_priority_coverage endpoint

One query for a project's whole team, whole week: true site-wide priority
occupancy per person per day (never scoped to just this project's
visibility — that mistake was already made and fixed once in
get_priority_occupancy), plus whether this project itself contributed each
day's slot."
```

---

### Task 2: Frontend data layer — API client, hook, type

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Consumes: `get_team_priority_coverage` (Task 1).
- Produces: `mobileApi.teamPriorityCoverage(project, weekStart)`,
  `useTeamPriorityCoverage(project, weekStart)` (a `useQuery`, enabled only when `project` is
  truthy), `TeamPriorityCoverage` type. Task 3 consumes all three by these exact names.

- [ ] **Step 1: Add the type**

In `frontend/src/lib/types.ts`, add near the other Priority-related types (wherever
`Dashboard.priority` is declared):

```ts
export interface TeamPriorityCoverageDay {
  date: string
  used: number
  slots: number
  contributed: boolean
}

export interface TeamPriorityCoverageMember {
  user: string
  full_name: string
  days: TeamPriorityCoverageDay[]
}

export interface TeamPriorityCoverage {
  members: TeamPriorityCoverageMember[]
}
```

- [ ] **Step 2: Add the API client entry**

In `frontend/src/lib/api.ts`, add next to `priorityOccupancy`:

```ts
  teamPriorityCoverage: (project: string, weekStart: string) =>
    api.get<import('./types').TeamPriorityCoverage>(
      M + 'get_team_priority_coverage',
      { project, week_start: weekStart },
    ),
```

- [ ] **Step 3: Add the query key + hook**

In `frontend/src/hooks/useData.ts`, add the key next to `priorityOccupancy`:

```ts
  teamPriorityCoverage: (project: string, weekStart: string) =>
    ['team-priority-coverage', project, weekStart] as const,
```

Add the hook next to `usePriorityOccupancy`:

```ts
// A project's whole team, one week's priority-slot fill status per person per day —
// powers the Plan screen's "Tim" mode. Disabled until a project is actually selected.
export const useTeamPriorityCoverage = (project: string, weekStart: string) =>
  useQuery({
    queryKey: keys.teamPriorityCoverage(project, weekStart),
    queryFn: () => mobileApi.teamPriorityCoverage(project, weekStart),
    enabled: !!project && !!weekStart,
  })
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors (compare the error count before/after your edit).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/lib/types.ts
git commit -m "feat(priority): frontend hooks for team priority coverage"
```

---

### Task 3: `TeamPriorityCoverage` component (shared, both frontends)

**Files:**
- Create: `frontend/src/components/TeamPriorityCoverage.tsx`

**Interfaces:**
- Consumes: `useTeamPriorityCoverage` (Task 2), `ProjectItem[]` (existing shared type, used the
  same way `PlanDeadlineDay` already consumes its `candidates` prop).
- Produces: `<TeamPriorityCoverage candidates={ProjectItem[]} onOpenDate={(date: string) => void} />`,
  a named export. Task 4 mounts this and supplies `onOpenDate` as the deep-link navigation.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/TeamPriorityCoverage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, ArrowUp, Users } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useTeamPriorityCoverage } from '@/hooks/useData'
import { addDaysISO, formatDate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

// Mon-first start of the week containing `iso` (TZ-safe via addDaysISO).
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=Mon … 6=Sun
  return addDaysISO(iso, -dow)
}

/**
 * A project leader/owner's whole team, one week at a time: one row per member, a fill
 * count, and a 7-dot strip (dot color = that day's TRUE site-wide priority fill level;
 * a small arrow marks days THIS project itself contributed). Tapping a non-full dot
 * calls `onOpenDate` so the caller can jump to the single-day view. Project picker
 * shown only when the caller leads/owns more than one project.
 */
export function TeamPriorityCoverage({
  candidates,
  onOpenDate,
}: {
  candidates: ProjectItem[]
  onOpenDate: (date: string) => void
}) {
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of candidates) if (!m.has(t.project)) m.set(t.project, t.project_name)
    return [...m].map(([value, label]) => ({ value, label }))
  }, [candidates])

  const [projectOverride, setProjectOverride] = useState('')
  const project = projectOverride || projectOptions[0]?.value || ''

  const today = new Date().toISOString().slice(0, 10)
  const [weekStart, setWeekStart] = useState(weekStartOf(today))

  const { data, isLoading } = useTeamPriorityCoverage(project, weekStart)

  if (!project) {
    return <EmptyState icon={Users} title="Tidak ada proyek" subtitle="Kamu belum memimpin proyek apa pun." />
  }

  return (
    <div className="space-y-4">
      {projectOptions.length > 1 && (
        <SearchableSelect
          value={project}
          onChange={setProjectOverride}
          options={projectOptions}
          placeholder="Pilih proyek…"
        />
      )}

      {/* Week nav */}
      <div className="flex items-center gap-2 rounded-2xl border border-paper-edge bg-paper-card p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
          aria-label="Minggu sebelumnya"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-stone-800 dark:text-slate-100">
          {formatDate(weekStart)} – {formatDate(addDaysISO(weekStart, 6))}
        </p>
        <button
          onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
          aria-label="Minggu berikutnya"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      ) : !data?.members.length ? (
        <EmptyState icon={Users} title="Tidak ada anggota tim" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.members.map((m) => {
            const filledDays = m.days.filter((d) => d.slots > 0 && d.used >= d.slots).length
            const allFull = filledDays === 7
            return (
              <li
                key={m.user}
                className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{m.full_name}</p>
                  <span className="shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">
                    {filledDays}/7 hari terisi{allFull ? ' ✓' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {m.days.map((d, i) => {
                    const full = d.slots > 0 && d.used >= d.slots
                    const empty = d.used === 0
                    const actionable = !full
                    return (
                      <button
                        key={d.date}
                        onClick={() => actionable && onOpenDate(d.date)}
                        disabled={!actionable}
                        className="flex flex-col items-center gap-1"
                      >
                        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                          <span
                            className={clsx(
                              'h-3 w-3 rounded-full',
                              full ? 'bg-emerald-500' : empty ? 'bg-stone-300 dark:bg-slate-600' : 'bg-amber-500',
                            )}
                          />
                          {d.contributed && (
                            <ArrowUp className="absolute -top-1.5 h-2.5 w-2.5 text-brand-600 dark:text-brand-400" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-[10px] font-medium text-stone-400 dark:text-slate-500">{DAY_LABELS[i]}</span>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Confirm `formatDate`/`addDaysISO` are exported from `frontend/src/lib/format.ts`**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "^export function formatDate\|^export function addDaysISO" frontend/src/lib/format.ts
```

If either name differs, fix the import in Step 1.

- [ ] **Step 3: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TeamPriorityCoverage.tsx
git commit -m "feat(priority): TeamPriorityCoverage component, shared by both frontends"
```

---

### Task 4: Wire into both Plan screens (new "Tim" mode)

**Files:**
- Modify: `frontend/src/pages/PlanScreen.tsx`
- Modify: `frontend-web/src/pages/Plan.tsx`

**Interfaces:**
- Consumes: `TeamPriorityCoverage` (Task 3).
- Produces: nothing new downstream — this is the final wiring task.

**Note on the spec's deep-link idea:** the design spec described navigating via
`navigate('/plan', {state: {...}})` and reading `location.state` on mount. That mechanism turns
out to be unnecessary: `TeamPriorityCoverage` is mounted INSIDE the same `PlanScreen`/`Plan`
component instance that already owns `scope`/`mode`/`selected` as local state — so "jump to By
date for this date" is just calling the existing setters directly, no route navigation involved.
Building the `location.state` read would add an import, a type, and an initializer that nothing
in this plan calls — dead plumbing. This task uses direct `setScope`/`setMode`/`setSelected` calls
instead and does NOT add a `useLocation` read to either file.

- [ ] **Step 1: Mobile — widen the `mode` type and import the component**

In `frontend/src/pages/PlanScreen.tsx`, add the import:

```tsx
import { TeamPriorityCoverage } from '@/components/TeamPriorityCoverage'
```

Change:

```tsx
  const [mode, setMode] = useState<'date' | 'project' | 'peta'>('project')
```

to:

```tsx
  const [mode, setMode] = useState<'date' | 'project' | 'peta' | 'team'>('project')
```

- [ ] **Step 2: Mobile — add the mode tab, gated to scope==='project'**

Find the mode `Segmented`:

```tsx
          <div className="mt-3">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'date', label: 'By date' },
                { value: 'project', label: 'By project' },
                { value: 'peta', label: 'Peta' },
              ]}
            />
          </div>
```

Change the `options` array to:

```tsx
              options={[
                { value: 'date', label: 'By date' },
                { value: 'project', label: 'By project' },
                { value: 'peta', label: 'Peta' },
                ...(scope === 'project' ? [{ value: 'team' as const, label: 'Tim' }] : []),
              ]}
```

- [ ] **Step 3: Mobile — add the render branch**

Find the render chain:

```tsx
          {mode === 'peta' ? (
```

and its `} : scope === 'project' ? (` branch for `PlanDeadlineDay`. Add a `mode === 'team'` branch
BEFORE the `scope === 'project'` fallback (so it takes priority only when both conditions hold —
`mode` can only ever BE `'team'` while the tab was visible, i.e. while `scope === 'project'`, but
gate on both explicitly for safety against the state drifting if scope changes after 'team' was
selected):

```tsx
          {mode === 'peta' ? (
            // ... existing peta branch, unchanged ...
          ) : mode === 'project' ? (
            // ... existing by-project branch, unchanged ...
          ) : mode === 'team' && scope === 'project' ? (
            // Team: leader/owner checks the whole team's week at a glance, jumps to any gap.
            <div className="mt-5">
              <TeamPriorityCoverage
                candidates={scoped}
                onOpenDate={(date) => {
                  setScope('project')
                  setMode('date')
                  setSelected(date)
                }}
              />
            </div>
          ) : scope === 'project' ? (
            // ... existing PlanDeadlineDay branch, unchanged ...
          ) : (
            // ... existing self-plan branch, unchanged ...
          )}
```

- [ ] **Step 4: Web — same changes in `Plan.tsx`**

Import the component:

```tsx
import { TeamPriorityCoverage } from '@/components/TeamPriorityCoverage'
```

Change:

```tsx
  const [mode, setMode] = useState<'date' | 'project' | 'peta'>('project')
```

to:

```tsx
  const [mode, setMode] = useState<'date' | 'project' | 'peta' | 'team'>('project')
```

Find the mode button row:

```tsx
        <div className="inline-flex rounded-full bg-surface p-1 shadow-card">
          {(
            [
              ['date', 'By date'],
              ['project', 'By project'],
              ['peta', 'Peta'],
            ] as const
          ).map(([m, label]) => (
```

Change the tuple array to a computed one so the `'team'` entry only appears when
`scope === 'project'`:

```tsx
        <div className="inline-flex rounded-full bg-surface p-1 shadow-card">
          {(
            [
              ['date', 'By date'],
              ['project', 'By project'],
              ['peta', 'Peta'],
              ...(scope === 'project' ? ([['team', 'Tim']] as const) : ([] as const)),
            ] as const
          ).map(([m, label]) => (
```

Find the render chain:

```tsx
      {mode === 'peta' ? (
        // ...
      ) : mode === 'project' ? (
        // ...
      ) : scope === 'project' ? (
        <PlanDeadlineDay candidates={scoped} selected={selected} onSelect={setSelected} />
      ) : (
```

Add the team branch before the `scope === 'project'` fallback:

```tsx
      {mode === 'peta' ? (
        // ... unchanged ...
      ) : mode === 'project' ? (
        // ... unchanged ...
      ) : mode === 'team' && scope === 'project' ? (
        <TeamPriorityCoverage
          candidates={scoped}
          onOpenDate={(date) => {
            setScope('project')
            setMode('date')
            setSelected(date)
          }}
        />
      ) : scope === 'project' ? (
        <PlanDeadlineDay candidates={scoped} selected={selected} onSelect={setSelected} />
      ) : (
```

- [ ] **Step 5: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PlanScreen.tsx frontend-web/src/pages/Plan.tsx
git commit -m "feat(priority): 'Tim' mode in Plan screen, both frontends

Shows the whole team's week at a glance; tapping a non-full dot jumps to
By date pre-set to that day (direct setScope/setMode/setSelected — same
component instance, no route navigation needed), landing on the
already-shipped PlanDeadlineDay toggle."
```

---

### Task 5: Ship — build, docs, What's New

**Files:**
- Modify: build output under `vernon_project/public/frontend{,_web}/**`
- Modify: `docs/assets/data.js` (generated — new endpoint)

**Interfaces:**
- Consumes: everything above.
- Produces: the live feature.

- [ ] **Step 1: Regenerate docs data**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

- [ ] **Step 2: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

- [ ] **Step 3: Verify the "Tim" string reached both live bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -o 'assets/[^"]*\.js' vernon_project/www/m.html vernon_project/www/w.html
```

Then `grep -l "hari terisi" vernon_project/public/frontend/assets/<the .js file named above>`
and the same for `frontend_web` — confirm both hits.

- [ ] **Step 4: Restart**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 5: Commit the build output**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web docs/assets/data.js vernon_project/www/m.html vernon_project/www/w.html
git commit -m "chore: rebuild bundles for team priority coverage"
```

- [ ] **Step 6: Add the What's New row**

Check the newest existing version first:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version","release_date"], order_by="creation desc", limit=1))
EOF
```

Bump the minor version (this is a new feature, not a patch fix). Write the row (substitute the
bumped version and today's date):

```bash
cat > /tmp/claude-1000/team_coverage_release.json <<'EOF'
[{"version": "X.Y.0",
  "release_date": "YYYY-MM-DD",
  "title": "Cakupan Prioritas Tim",
  "notes": "Ketua/pemilik proyek sekarang bisa lihat seluruh tim dalam satu minggu sekaligus di Plan → My project → Tim\nTiap anggota tampil dengan berapa hari slotnya sudah terisi, plus titik warna per hari\nTap titik yang belum penuh untuk langsung menandai prioritas hari itu",
  "platform": "Both",
  "published": 1}]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/team_coverage_release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 7: Verify through the real endpoint**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([(p, [r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)][:1]) for p in ("Mobile", "Web")])
EOF
```

Expected: `Cakupan Prioritas Tim` first for both platforms.
