# Priority Slots Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the priority rail above the todo tab bar, add a today/tomorrow/pick-date
filter to it, and let leaders flag/see team priority slots directly from the Plan screen.

**Architecture:** One new whitelisted endpoint (`get_priority_occupancy`) serves BOTH new
frontend surfaces — the rail's day filter (self, arbitrary day) and the leader's Plan-screen
occupancy badge (a teammate, arbitrary day) — reusing the exact shaping (`_fetch_todos`/
`_shape_todo`) and permission boundary (project owner/leader/admin) already established by the
shipped feature. Everything else is frontend-only: a JSX reposition, one new shared container
component, and additions to two existing per-frontend `PlanDeadlineDay` files plus the shared
`PlanMeta.tsx`.

**Tech Stack:** Frappe v15 (Python 3.11, MariaDB), React 18 + TypeScript + Vite + TanStack Query,
Tailwind. Two frontends: `frontend/` (mobile `/m`), `frontend-web/` (web `/w`).

## Global Constraints

- **Both frontends, always.** Every piece here (repositioned rail, day filter, leader toggle +
  badge) ships to `/m` and `/w`, each in its own frontend's existing idiom. Rebuild both bundles.
- **Live site, no test database.** Tests run against `project.vernon.id` directly; write fixtures
  that clean up after themselves (mirror `vernon_project/api/test_priority_slots.py`).
- **Bahasa Indonesia** for end-user copy; existing English field/UI chrome stays as-is (matches
  the shipped feature's mixed convention).
- **No native `confirm()`/`alert()`/`prompt()`.**
- **Every dropdown uses `SearchableSelect`** — not relevant here (no new dropdowns).
- **Restart command:** `sudo /usr/local/bin/tj-restart` (never `bench restart`).
- **Tabs, not spaces**, in Python files in this repo.
- **`python3 scripts/gen_docs.py`** must be re-run and committed — this plan adds a new
  whitelisted endpoint.
- **What's New** row required at the end — this ships user-visible changes.

## File Map

| File | Responsibility |
|---|---|
| `vernon_project/api/mobile.py` | new `get_priority_occupancy(users, date)` endpoint |
| `vernon_project/api/test_priority_slots.py` | tests for the new endpoint's permission boundary + shaping |
| `frontend/src/lib/api.ts` | `mobileApi.priorityOccupancy(users, date)` |
| `frontend/src/hooks/useData.ts` | `keys.priorityOccupancy`, `usePriorityOccupancy`, `useSetTodoPriority` |
| `frontend/src/pages/Today.tsx` | reposition the rail mount; swap `PriorityRail` for `PriorityRailPanel` |
| `frontend-web/src/pages/Home.tsx` | same, web |
| `frontend/src/components/PriorityRailPanel.tsx` | **new** — day-switcher chips + delegates render to `PriorityRail`; shared by both frontends |
| `frontend/src/components/PlanMeta.tsx` | new shared `PriorityBadge` component |
| `frontend/src/components/PlanDeadlineDay.tsx` | leader ⚡ toggle + occupancy badge per row (mobile) |
| `frontend-web/src/components/PlanDeadlineDay.tsx` | same, web (this file is NOT shared — it's a separate web-styled implementation) |

---

### Task 1: Backend — `get_priority_occupancy` endpoint + tests

**Files:**
- Modify: `vernon_project/api/mobile.py` (add the function; a good spot is right after
  `get_dashboard`, since it shares its shaping helpers and its `priority` block's shape)
- Modify: `vernon_project/api/test_priority_slots.py` (add a new test class)

**Interfaces:**
- Consumes: `_visible_projects()`, `_fetch_todos()` (already selects `t.is_priority`),
  `_shape_todo()`, `_user_name_map()`, `_allocations_map()`, `_admins_by_project()` — all existing,
  unchanged. `Vernon Settings.daily_priority_slots`.
- Produces: `get_priority_occupancy(users, date) -> dict[str, {"slots": int, "items": list}]`.
  Tasks 2, 4 and 5 consume this exact shape and parameter names (`users`, `date`).

- [ ] **Step 1: Add the endpoint**

Insert into `vernon_project/api/mobile.py`, after `get_dashboard` (which ends around the line
returning the `priority` dict):

```python
@frappe.whitelist()
def get_priority_occupancy(users, date):
	"""Priority-slot occupancy for one or more users on one date.

	Same shape as Dashboard.priority ({"slots": int, "items": [...]}), keyed by user — one
	endpoint serves both the homepage rail's day filter (self, arbitrary day) and a leader's
	Plan-screen occupancy badge (a teammate, arbitrary day), so both surfaces agree with the
	same live count the controller's cap actually enforces.

	Permission: the caller may always request themself. Requesting someone else requires the
	caller to lead/own/administer at least one project that user is involved in (a Project
	Team member, or has a todo assigned there) — the same trust boundary PlanDeadlineDay
	already relies on to show a leader their team's todos. A user the caller isn't allowed to
	see is silently omitted from the result rather than erroring the whole batch.
	"""
	requester = frappe.session.user
	if isinstance(users, str):
		users = frappe.parse_json(users) or []
	users = sorted({str(u).strip() for u in (users or []) if str(u).strip()})
	if not users:
		return {}

	slots = cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots"))
	if not slots:
		return {u: {"slots": 0, "items": []} for u in users}
	target_date = getdate(date)

	is_sm = "System Manager" in frappe.get_roles(requester)
	leader_projects = set()
	if not is_sm:
		leader_projects |= set(
			frappe.get_all("Project", filters={"project_owner": requester}, pluck="name", limit_page_length=0)
		)
		leader_projects |= set(
			frappe.get_all("Project", filters={"project_leader": requester}, pluck="name", limit_page_length=0)
		)
		leader_projects |= set(
			frappe.get_all(
				"Project Admin User",
				filters={"user": requester, "parentfield": "project_admins"},
				pluck="parent", limit_page_length=0,
			)
		)

	def _allowed(u):
		if u == requester or is_sm:
			return True
		if not leader_projects:
			return False
		if frappe.db.exists("Project Team", {"parent": ["in", list(leader_projects)], "user": u}):
			return True
		detail_names = frappe.get_all(
			"Project Detail", filters={"project": ["in", list(leader_projects)]},
			pluck="name", limit_page_length=0,
		)
		return bool(detail_names and frappe.db.exists(
			"Project Todo", {"assigned_to": u, "project_detail": ["in", detail_names]}
		))

	allowed_users = [u for u in users if _allowed(u)]
	if not allowed_users:
		return {}

	# One shared fetch over the requester's visible projects — a project this requester leads/
	# owns/admins/is-a-team-member-of is exactly what _allowed() above already required for any
	# non-self target, so their priority todos are guaranteed to be in this set.
	projects = _visible_projects()
	rows = [
		r for r in _fetch_todos(projects)
		if r.get("is_priority") and r.get("assigned_to") in allowed_users
	]
	name_map = _user_name_map(set(allowed_users))
	alloc_map = _allocations_map([r["name"] for r in rows])
	admins_map = _admins_by_project(rows)

	out = {}
	for u in allowed_users:
		u_rows = [
			r for r in rows
			if r["assigned_to"] == u and r.get("deadline") and getdate(r["deadline"]) == target_date
		]
		shaped = [
			_shape_todo(r, requester, name_map, alloc_map=alloc_map, admins=admins_map.get(r["project"], []))
			for r in u_rows
		]
		out[u] = {"slots": slots, "items": shaped}
	return out
```

`_shape_todo` is called with `requester` (not `u`) as the viewer — `is_mine`/`can_advance`/etc. on
the returned items reflect the ACTUAL caller's relationship to the todo, not the target user's.
Neither consumer (Task 4's `PriorityRailPanel`, Task 5's occupancy badge) reads those flags, but
shaping honestly avoids a surprise if the `items` array is ever rendered more richly later.

- [ ] **Step 2: Restart and smoke-test by hand**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
print(frappe.call("vernon_project.api.mobile.get_priority_occupancy", users=frappe.as_json(["Administrator"]), date=frappe.utils.nowdate()))
print(frappe.call("vernon_project.api.mobile.get_priority_occupancy", users=frappe.as_json(["nonexistent@example.com"]), date=frappe.utils.nowdate()))
EOF
```

Expected: first call returns `{'Administrator': {'slots': 3, 'items': [...]}}` (items may be
empty); second call returns `{}` (self ≠ target, no shared leader project, so silently omitted —
`Administrator` is a System Manager though, so this actually returns the target regardless of
project overlap; if you want to verify the non-SM omission path, run the same call as
`frappe.set_user("<a non-SM test user with no shared project>")` instead).

- [ ] **Step 3: Write the tests**

Add to `vernon_project/api/test_priority_slots.py`, reusing the existing `_PriorityFixture` (it
already creates two projects the fixture's Administrator leads/owns, plus
`prio_assignee@example.com` as a team member of both):

```python
class TestPriorityOccupancy(_PriorityFixture):
	def _occ(self, users, date, as_user="Administrator"):
		from vernon_project.api.mobile import get_priority_occupancy
		frappe.set_user(as_user)
		try:
			return get_priority_occupancy(users, date)
		finally:
			frappe.set_user("Administrator")

	def test_self_request_always_allowed(self):
		self._todo(0)
		out = self._occ(["prio_assignee@example.com"], self.day, as_user="prio_assignee@example.com")
		self.assertIn("prio_assignee@example.com", out)
		self.assertEqual(out["prio_assignee@example.com"]["slots"], 3)
		self.assertEqual(len(out["prio_assignee@example.com"]["items"]), 1)

	def test_leader_can_view_team_member(self):
		self._todo(0)
		out = self._occ(["prio_assignee@example.com"], self.day, as_user="Administrator")
		self.assertIn("prio_assignee@example.com", out)
		self.assertEqual(len(out["prio_assignee@example.com"]["items"]), 1)

	def test_unrelated_user_omitted(self):
		if not frappe.db.exists("User", "prio_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_outsider@example.com",
				"first_name": "Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		out = self._occ(["prio_outsider@example.com"], self.day, as_user="prio_assignee@example.com")
		self.assertEqual(out, {})

	def test_feature_off_returns_zero_slots_no_items(self):
		from vernon_project.api.mobile import get_priority_occupancy
		_set(daily_priority_slots=0)
		frappe.set_user("prio_assignee@example.com")
		try:
			out = get_priority_occupancy(["prio_assignee@example.com"], self.day)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(out, {"prio_assignee@example.com": {"slots": 0, "items": []}})

	def test_wrong_date_returns_empty_items(self):
		self._todo(0)
		out = self._occ(
			["prio_assignee@example.com"],
			str(add_days(nowdate(), 10)),
			as_user="prio_assignee@example.com",
		)
		self.assertEqual(out["prio_assignee@example.com"]["items"], [])
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_priority_slots
```

Expected: all tests pass (the pre-existing 11 plus these 5 = 16). If `test_unrelated_user_omitted`
fails because `prio_outsider@example.com` is somehow reachable, double check no stray team
membership exists from a prior failed test run — clean it up and re-run.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_priority_slots.py
git commit -m "feat(priority): get_priority_occupancy endpoint

One endpoint serves both the homepage rail's day filter (self, arbitrary day)
and a leader's Plan-screen occupancy badge (a teammate, arbitrary day) —
same shaping and permission boundary as the shipped feature, so neither
surface can show a count that disagrees with what the controller enforces."
```

---

### Task 2: Frontend data layer — hooks for occupancy + priority toggling

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `mobileApi.priorityOccupancy`)
- Modify: `frontend/src/hooks/useData.ts` (add `keys.priorityOccupancy`, `usePriorityOccupancy`,
  `useSetTodoPriority`)

**Interfaces:**
- Consumes: `get_priority_occupancy` (Task 1).
- Produces: `usePriorityOccupancy(users: string[], date: string, enabled: boolean)` — a
  `useQuery` returning `Record<string, {slots: number; items: ProjectItem[]}>`.
  `useSetTodoPriority()` — a `useMutation` whose `mutate`/`mutateAsync` takes
  `{ todoName: string; isPriority: boolean }`, returning the same `{status, message}` shape
  `update_todo` always returns, toasting on error. Tasks 4 and 5 consume both by these exact
  names/signatures.

- [ ] **Step 1: Add the API client entry**

In `frontend/src/lib/api.ts`, add near the other `M +` entries (e.g. right after the `calendar`
entry):

```ts
  priorityOccupancy: (users: string[], date: string) =>
    api.get<Record<string, { slots: number; items: import('./types').ProjectItem[] }>>(
      M + 'get_priority_occupancy',
      { users: JSON.stringify(users), date },
    ),
```

- [ ] **Step 2: Add the query key**

In `frontend/src/hooks/useData.ts`'s `keys` object, add next to `dailyTargets`:

```ts
  priorityOccupancy: (users: string[], date: string) =>
    ['priority-occupancy', date, [...users].sort().join(',')] as const,
```

- [ ] **Step 3: Add `usePriorityOccupancy`**

Add near `useDailyTargets`:

```ts
// Priority-slot occupancy for one or more users on one date — powers the homepage rail's
// day filter (self) and the Plan screen's leader occupancy badge (a teammate). `enabled`
// lets callers skip the request entirely for the common case (today's data is already
// loaded elsewhere).
export const usePriorityOccupancy = (users: string[], date: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.priorityOccupancy(users, date),
    queryFn: () => mobileApi.priorityOccupancy(users, date),
    enabled: enabled && users.length > 0 && !!date,
  })
```

- [ ] **Step 4: Add `useSetTodoPriority`**

Add near `useMoveTodoDeadline` (a single hook instance, mutation variables carry which todo —
the same shape needed to toggle priority across a LIST of rows without calling a hook per row,
which `useUpdateTodo(todoId)` cannot do since it binds the id at hook-call time):

```ts
// Toggle is_priority on an arbitrary todo. Unlike useUpdateTodo (bound to one todo id at hook
// call time), this takes the todo name as a mutation variable — needed because
// PlanDeadlineDay renders a LIST of todos and can't call a hook once per row.
export function useSetTodoPriority() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todoName, isPriority }: { todoName: string; isPriority: boolean }) => {
      const res = await mobileApi.updateTodo(todoName, { is_priority: isPriority ? 1 : 0 })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onError: (e) => toast('error', (e as Error).message || 'Could not update priority'),
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todoName) })
      qc.invalidateQueries({ queryKey: ['priority-occupancy'] })
    },
  })
}
```

`qc.invalidateQueries({ queryKey: ['priority-occupancy'] })` uses a partial key on purpose —
TanStack Query treats this as a prefix match, invalidating every occupancy query regardless of
which user/date it was for, so both the rail and the Plan-screen badge refresh after any toggle.

- [ ] **Step 5: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors (there are pre-existing unrelated errors in this repo — confirm your
change doesn't add to that count, e.g. by running `npx tsc --noEmit 2>&1 | wc -l` before and after
your edit).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(priority): frontend hooks for occupancy + priority toggling

usePriorityOccupancy powers both the rail's day filter and the Plan screen's
occupancy badge. useSetTodoPriority takes the todo name as a mutation variable
(not bound at hook-call time) since PlanDeadlineDay toggles priority from
inside a list, where useUpdateTodo's per-hook binding doesn't fit."
```

---

### Task 3: Reposition the rail (both frontends)

**Files:**
- Modify: `frontend/src/pages/Today.tsx`
- Modify: `frontend-web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — pure JSX relocation. Task 4 replaces the relocated `<PriorityRail>`
  with `<PriorityRailPanel>` at the same spot.

- [ ] **Step 1: Mobile — remove the rail from its current mount**

In `frontend/src/pages/Today.tsx`, delete this block (currently right after
`<BannerCarousel slides={banners ?? []} />`):

```tsx
              {/* Today's priority slots — vibrant, above everything else in the feed. */}
              <PriorityRail
                slots={data.priority?.slots ?? 0}
                items={data.priority?.items ?? []}
                onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
              />
```

- [ ] **Step 2: Mobile — re-mount it just above the tab bar**

Find the `{filtered && (<>` block's action-row `</div>` that immediately precedes
`<div id="today-groups" className="mt-5 scroll-mt-4">` (the `PillTabs<Axis>` wrapper). Insert the
same block back in, right before that `today-groups` div:

```tsx
                  {/* Today's priority slots — vibrant, just above the work tabs. */}
                  <PriorityRail
                    slots={data.priority?.slots ?? 0}
                    items={data.priority?.items ?? []}
                    onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
                  />
                  <div id="today-groups" className="mt-5 scroll-mt-4">
```

(i.e. the `<div id="today-groups"...>` line itself is unchanged — only the new block is inserted
directly above it.)

- [ ] **Step 3: Web — remove the rail from its current mount**

In `frontend-web/src/pages/Home.tsx`, delete this block (currently right after
`<ValuesWelcome />`):

```tsx
      {/* Today's priority slots — same rail as /m, above the bento grid. */}
      <PriorityRail
        slots={d.priority?.slots ?? 0}
        items={d.priority?.items ?? []}
        onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
      />
```

- [ ] **Step 4: Web — re-mount it just above the tab bar**

Find `<SectionHead>Your work</SectionHead>` (right before `<div id="my-work" className="scroll-mt-4 space-y-4">`,
which wraps the `Segmented` axis tabs). Insert the block right after the `SectionHead`:

```tsx
          <SectionHead>Your work</SectionHead>
          {/* Today's priority slots — same rail as /m, just above the work tabs. */}
          <PriorityRail
            slots={d.priority?.slots ?? 0}
            items={d.priority?.items ?? []}
            onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
          />
          <div id="my-work" className="scroll-mt-4 space-y-4">
```

- [ ] **Step 5: Typecheck and visually sanity-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no new errors — this step only moves JSX, no prop/type changes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Today.tsx frontend-web/src/pages/Home.tsx
git commit -m "refactor(priority): move the rail just above the work tabs, both frontends"
```

---

### Task 4: Day-switcher panel (both frontends)

**Files:**
- Create: `frontend/src/components/PriorityRailPanel.tsx`
- Modify: `frontend/src/pages/Today.tsx` (swap `<PriorityRail>` for `<PriorityRailPanel>` at the
  spot Task 3 just created)
- Modify: `frontend-web/src/pages/Home.tsx` (same swap)

**Interfaces:**
- Consumes: `usePriorityOccupancy` (Task 2), `PriorityRail` (shipped), `useBoot` (existing).
- Produces: `<PriorityRailPanel todaySlots={number} todayItems={ProjectItem[]} onOpen={(name: string) => void} />`,
  a named export, shared by both frontends via the `@` alias (same reuse pattern as
  `PriorityRail` itself).

- [ ] **Step 1: Write the component**

Create `frontend/src/components/PriorityRailPanel.tsx`:

```tsx
import { useState } from 'react'
import clsx from 'clsx'
import { CalendarDays } from 'lucide-react'
import { PriorityRail } from '@/components/PriorityRail'
import { usePriorityOccupancy, useBoot } from '@/hooks/useData'
import { addDaysISO, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

/**
 * Wraps PriorityRail with a Today / Tomorrow / Pick-date filter. The common case (today) reuses
 * data the caller already loaded from the dashboard — no extra request. Any other day queries
 * get_priority_occupancy for just the current user. Renders nothing at all when the feature is
 * off (todaySlots === 0) — slots is a global setting, not date-dependent, so today's value is
 * enough to decide whether to render anything on any day.
 */
export function PriorityRailPanel({
  todaySlots,
  todayItems,
  onOpen,
}: {
  todaySlots: number
  todayItems: ProjectItem[]
  onOpen: (name: string) => void
}) {
  const { data: boot } = useBoot()
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const [selected, setSelected] = useState(today)
  const isToday = selected === today

  const me = boot?.user
  const occ = usePriorityOccupancy(me ? [me] : [], selected, !isToday && !!me)

  if (!todaySlots) return null

  const slots = isToday ? todaySlots : (me && occ.data?.[me]?.slots) || 0
  const items = isToday ? todayItems : (me && occ.data?.[me]?.items) || []

  const chip = (label: string, iso: string) => (
    <button
      onClick={() => setSelected(iso)}
      className={clsx(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95',
        selected === iso
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-paper-edge bg-paper-card text-stone-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="mt-4">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip('Today', today)}
        {chip('Tomorrow', tomorrow)}
        <label
          className={clsx(
            'relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95',
            !isToday && selected !== tomorrow
              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
              : 'border-paper-edge bg-paper-card text-stone-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Pilih</span>
          <input
            type="date"
            value={selected}
            onChange={(e) => e.target.value && setSelected(e.target.value)}
            aria-label="Pilih tanggal"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <PriorityRail slots={slots} items={items} onOpen={onOpen} />
    </div>
  )
}
```

- [ ] **Step 2: Confirm `useBoot` is exported from `useData.ts`**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "export const useBoot\|export function useBoot" frontend/src/hooks/useData.ts
```

If the export name differs, adjust the import in Step 1 to match.

- [ ] **Step 3: Swap the mount on mobile**

In `frontend/src/pages/Today.tsx`, replace the block Task 3 just re-mounted:

```tsx
                  {/* Today's priority slots — vibrant, just above the work tabs. */}
                  <PriorityRail
                    slots={data.priority?.slots ?? 0}
                    items={data.priority?.items ?? []}
                    onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
                  />
```

with:

```tsx
                  {/* Today's priority slots — vibrant, just above the work tabs. Day filter
                      built in (Today/Tomorrow/Pick). */}
                  <PriorityRailPanel
                    todaySlots={data.priority?.slots ?? 0}
                    todayItems={data.priority?.items ?? []}
                    onOpen={(name) => navigate(`/project-item/${encodeURIComponent(name)}`)}
                  />
```

Update the import at the top of the file from `import { PriorityRail } from '@/components/PriorityRail'`
to `import { PriorityRailPanel } from '@/components/PriorityRailPanel'`.

- [ ] **Step 4: Swap the mount on web**

Same replacement in `frontend-web/src/pages/Home.tsx` — swap `<PriorityRail ...>` for
`<PriorityRailPanel todaySlots={d.priority?.slots ?? 0} todayItems={d.priority?.items ?? []} onOpen={...}>`
and update the import from `@/components/PriorityRail` to `@/components/PriorityRailPanel`
(still the shared `frontend/src` path via the `@` alias — no `@web` involved, matching how
`PriorityRail` itself is already imported on web).

- [ ] **Step 5: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PriorityRailPanel.tsx frontend/src/pages/Today.tsx frontend-web/src/pages/Home.tsx
git commit -m "feat(priority): today/tomorrow/pick-date filter on the homepage rail

One shared PriorityRailPanel wraps PriorityRail with day-switcher chips.
Today reuses already-loaded dashboard data (no extra request); any other day
queries get_priority_occupancy for just the current user."
```

---

### Task 5: Leader slot management in `PlanDeadlineDay` (both frontends)

**Files:**
- Modify: `frontend/src/components/PlanMeta.tsx` (add `PriorityBadge`)
- Modify: `frontend/src/components/PlanDeadlineDay.tsx` (mobile)
- Modify: `frontend-web/src/components/PlanDeadlineDay.tsx` (web — a separate implementation,
  not shared; both need the same addition in their own idiom)

**Interfaces:**
- Consumes: `usePriorityOccupancy`, `useSetTodoPriority` (Task 2), `t.can_prioritize`/
  `t.is_priority` (shipped, already present on every `ProjectItem`).
- Produces: nothing new downstream.

- [ ] **Step 1: Add the shared `PriorityBadge`**

In `frontend/src/components/PlanMeta.tsx`, add next to `AssigneeTag`:

```tsx
import { Zap } from 'lucide-react'
```

(add `Zap` to the existing `lucide-react` import line rather than a second import statement).

```tsx
// Site-wide slot occupancy for one assignee on one date — "2/3" — sourced from
// get_priority_occupancy, not a locally-visible count, so it never undercounts a slot
// claimed by a project this view can't see. `used` excludes the row being toggled from
// its own count when the caller passes one (see PlanDeadlineDay).
export function PriorityBadge({ used, slots }: { used: number; slots: number }) {
  if (!slots) return null
  const full = used >= slots
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        full
          ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
          : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
      )}
    >
      <Zap className="h-3 w-3" fill="currentColor" />
      {used}/{slots}
    </span>
  )
}
```

Add `import clsx from 'clsx'` at the top of `PlanMeta.tsx` if not already present (check first).

- [ ] **Step 2: Verify `clsx` isn't already imported (avoid a duplicate)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && head -5 frontend/src/components/PlanMeta.tsx
```

- [ ] **Step 3: Wire it into mobile's `PlanDeadlineDay.tsx`**

Add these two hooks near the top of the component body (after `const move = useMoveTodoDeadline()`):

```tsx
  const setPriority = useSetTodoPriority()
  const assignees = useMemo(
    () => [...new Set(due.map((t) => t.assigned_to).filter(Boolean))],
    [due],
  )
  const occ = usePriorityOccupancy(assignees, selected, assignees.length > 0)
```

(`due` must already be computed above this point — if the current file computes `due` further
down via `useMemo`, move this block to after that `useMemo` instead of before it.)

Add the imports at the top:

```tsx
import { usePriorityOccupancy, useSetTodoPriority } from '@/hooks/useData'
import { PriorityBadge } from '@/components/PlanMeta'
```

(merge `PriorityBadge` into the existing `import { AssigneeTag, PlanLegend } from '@/components/PlanMeta'`
line rather than adding a new one.) Add `Zap` to the existing `lucide-react` import.

Add a toggle handler next to `setDeadline`:

```tsx
  const onTogglePriority = (todo: ProjectItem) => {
    setPriority.mutate({ todoName: todo.name, isPriority: !todo.is_priority })
  }
```

In the `due.map((t) => { ... })` row, add the badge next to `<AssigneeTag>` and the toggle button
next to the existing "clear deadline" button:

```tsx
                    <div className="mt-1 flex items-center gap-2">
                      <AssigneeTag name={t.assigned_to_name} />
                      {t.assigned_to && (
                        <PriorityBadge
                          used={occ.data?.[t.assigned_to]?.items.length ?? 0}
                          slots={occ.data?.[t.assigned_to]?.slots ?? 0}
                        />
                      )}
                    </div>
```

(replace the existing bare `<AssigneeTag name={t.assigned_to_name} />` line with this block).

```tsx
                  {t.can_prioritize && (
                    <button
                      onClick={() => onTogglePriority(t)}
                      disabled={setPriority.isPending}
                      aria-label={t.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas'}
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50',
                        t.is_priority
                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                          : 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-400',
                      )}
                    >
                      <Zap className="h-4 w-4" fill={t.is_priority ? 'currentColor' : 'none'} />
                    </button>
                  )}
```

(insert this right before the existing "clear deadline" `<button onClick={() => setDeadline(t, null)}...>`,
inside the same row's button group).

- [ ] **Step 4: Mirror the same wiring in web's `PlanDeadlineDay.tsx`**

This file is structurally parallel to mobile's but uses `bg-surface`/`text-muted`/`text-ink`
tokens and a `DatePicker` component instead of `paper-*`/`stone-*` and a native date input. Add
the imports:

```tsx
import { usePriorityOccupancy, useSetTodoPriority } from '@/hooks/useData'
import { PriorityBadge } from '@/components/PlanMeta'
```

(merge `PriorityBadge` into the existing `import { AssigneeTag, PlanLegend } from '@/components/PlanMeta'`
line; add `Zap` to the existing `lucide-react` import — both are shared paths, same as mobile, NOT
`@web/...`, since neither is web-specific.)

Add the hooks after `const move = useMoveTodoDeadline()`, and the handler after `setDeadline`:

```tsx
  const setPriority = useSetTodoPriority()
  const assignees = useMemo(
    () => [...new Set(due.map((t) => t.assigned_to).filter(Boolean))],
    [due],
  )
  const occ = usePriorityOccupancy(assignees, selected, assignees.length > 0)

  const onTogglePriority = (todo: ProjectItem) => {
    setPriority.mutate({ todoName: todo.name, isPriority: !todo.is_priority })
  }
```

(`due` is defined via `useMemo` above these; place this block after that `useMemo`, same as
mobile's Step 3.)

Replace the row's `<AssigneeTag name={t.assigned_to_name} />` line with:

```tsx
                  <div className="mt-1 flex items-center gap-2">
                    <AssigneeTag name={t.assigned_to_name} />
                    {t.assigned_to && (
                      <PriorityBadge
                        used={occ.data?.[t.assigned_to]?.items.length ?? 0}
                        slots={occ.data?.[t.assigned_to]?.slots ?? 0}
                      />
                    )}
                  </div>
```

Add the toggle button right before the existing "clear deadline" button (inside the same `<li>`'s
button group):

```tsx
                <button
                  onClick={() => onTogglePriority(t)}
                  disabled={setPriority.isPending}
                  aria-label={t.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas'}
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50',
                    t.is_priority
                      ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                      : 'bg-paper-line text-muted dark:bg-slate-700',
                  )}
                >
                  <Zap className="h-4 w-4" fill={t.is_priority ? 'currentColor' : 'none'} />
                </button>
```

Only render this button when `t.can_prioritize` is true, matching mobile's `{t.can_prioritize && (...)}`
wrapper.

- [ ] **Step 5: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PlanMeta.tsx frontend/src/components/PlanDeadlineDay.tsx frontend-web/src/components/PlanDeadlineDay.tsx
git commit -m "feat(priority): leader slot toggle + occupancy badge in PlanDeadlineDay

Both frontends. Reuses can_prioritize/is_priority already on every ProjectItem
and the new get_priority_occupancy endpoint for a true site-wide '2/3' badge
per assignee on the selected date — not a locally-visible count, so it can't
undercount a slot claimed by a project this leader doesn't see."
```

---

### Task 6: Ship — build, docs, What's New

**Files:**
- Modify: build output under `vernon_project/public/frontend{,_web}/**`
- Modify: `docs/assets/data.js` (generated — new endpoint)

**Interfaces:**
- Consumes: everything above.
- Produces: the live follow-ups.

- [ ] **Step 1: Regenerate docs data (new endpoint)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

- [ ] **Step 2: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

- [ ] **Step 3: Verify the day-filter string reached both live bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -o 'assets/[^"]*\.js' vernon_project/www/m.html vernon_project/www/w.html
```

Then `grep -l "Pilih tanggal" vernon_project/public/frontend/assets/<the .js file named above>`
and the same for `frontend_web` — confirm both hits.

- [ ] **Step 4: Restart**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 5: Commit the build output**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web docs/assets/data.js
git commit -m "chore: rebuild bundles for priority-slots follow-ups"
```

- [ ] **Step 6: Add the What's New row**

Check the newest existing version first:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version","release_date"], order_by="creation desc", limit=1))
EOF
```

Bump the patch version (this is polish/refinement on an already-announced feature, not a new
feature — patch, not minor). Write the row (substitute the actual bumped version and today's
date):

```bash
cat > /tmp/claude-1000/priority_followup_release.json <<'EOF'
[{"version": "X.Y.Z",
  "release_date": "YYYY-MM-DD",
  "title": "Slot Prioritas: Update",
  "notes": "Slot prioritas sekarang tampil tepat di atas tab Plan/Deadline/Waiting/Done, lebih dekat ke daftar kerjamu\nBisa lihat slot prioritas untuk besok atau tanggal lain, tidak cuma hari ini\nKetua proyek sekarang bisa menandai & melihat slot prioritas tim langsung dari layar Plan (mode My project → By date)",
  "platform": "Both",
  "published": 1}]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/priority_followup_release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 7: Verify through the real endpoint**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
for p in ("Mobile", "Web"):
    print(p, [r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)][:2])
EOF
```

Expected: `Slot Prioritas: Update` first for both platforms.
