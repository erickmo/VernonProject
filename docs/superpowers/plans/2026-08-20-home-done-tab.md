# Home "Done" Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Done" tab to the Home dashboard's Plan/Deadline/Waiting axis on both frontends, listing the current user's own last 30 completed todos, newest first.

**Architecture:** One new whitelisted backend function (`get_recently_done`, in `project_todo.py`, mirroring the existing `get_my_approvals` fetch→filter→shape→sort pattern) feeds one new shared React Query hook, consumed identically by the mobile and web Home pages via their existing axis-tab machinery. No new doctype, no new field, no schema change.

**Tech Stack:** Frappe (Python) backend, React + TanStack Query frontend (`frontend/` mobile, `frontend-web/` web, shared logic in `frontend/src`).

## Global Constraints

- Ship to **both** frontends — mobile (`frontend/`, route `/`, `Today.tsx`) and web (`frontend-web/`, route `/`, `Home.tsx`). Neither is optional.
- New whitelisted endpoint → run `python3 scripts/gen_docs.py` and commit the regenerated `docs/assets/data.js` (per project CLAUDE.md — the doc generator errors out if it's missing something, but won't error here; it just needs to be re-run and diffed).
- No native `confirm()`/`alert()`/`prompt()` — not applicable here (no destructive/confirm action in this feature), noted for completeness.
- Deploy: Python change → `sudo /usr/local/bin/tj-restart`. Frontend change → `npm run build` in the changed frontend dir, then the same restart (bundles are served as static files, but the wrapper reload is cheap and covers both).
- `bench console` heredocs must be ONE self-contained line in the body — piping loops or multi-line statements silently mis-parses (project gotcha).
- After shipping, add a What's New `App Release` row (Bahasa, `platform: Both`) — required by CLAUDE.md for every user-visible change, however small.

---

### Task 1: Backend endpoint `get_recently_done`

**Files:**
- Modify: `vernon_project/api/project_todo.py:455-457` (insert new function between `get_my_approvals` and `save_notes`)
- Modify: `docs/assets/data.js` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `vernon_project.api.mobile._fetch_todos`, `_shape_todo`, `_visible_projects`, `_user_name_map`, `_allocations_map`, `_admins_by_project`, `STATUS_COMPLETED` (all pre-existing, unchanged).
- Produces: whitelisted method `vernon_project.api.project_todo.get_recently_done` — no args, returns a JSON list of shaped todo dicts (same shape as every other `_shape_todo` output) each with two extra keys: `done_at` (ISO string or `null`) and `done_at_human` (e.g. `"2 hours ago"`, or `null`). Capped at 30 rows, sorted `done_at` descending. Task 2 imports this method name verbatim into `lib/api.ts`.

- [ ] **Step 1: Add the function**

Open `vernon_project/api/project_todo.py`. Find this exact block (lines 453-457):

```python
	out.sort(key=lambda t: t["approved_at"] or "", reverse=True)
	return out


@frappe.whitelist()
def save_notes(todo_id, notes):
```

Replace it with:

```python
	out.sort(key=lambda t: t["approved_at"] or "", reverse=True)
	return out


@frappe.whitelist()
def get_recently_done(limit=30):
	"""The current user's own recently-completed todos (assignee's Done list),
	newest completed_at first, capped at `limit`. Powers the Home 'Done' tab.

	Scoped to assigned_to == me (not tested_by/completed_by like get_my_approvals —
	this is "what I finished," not "what I approved for someone else") and to the
	final Completed status only (mirrors the completed_today aggregate in
	get_dashboard, which already treats Completed as "done" in the Home UI).
	"""
	from vernon_project.api.mobile import (
		STATUS_COMPLETED,
		_admins_by_project,
		_allocations_map,
		_fetch_todos,
		_shape_todo,
		_user_name_map,
		_visible_projects,
	)
	from frappe.utils import pretty_date, get_datetime

	user = frappe.session.user
	rows = _fetch_todos(_visible_projects(), statuses=[STATUS_COMPLETED])
	mine = [r for r in rows if r.get("assigned_to") == user]
	if not mine:
		return []

	emails = {r["assigned_to"] for r in mine}
	for r in mine:
		emails.update([r["project_owner"], r["project_leader"]])
	name_map = _user_name_map(emails)
	alloc_map = _allocations_map([r["name"] for r in mine])
	admins_map = _admins_by_project(mine)

	out = []
	for r in mine:
		shaped = _shape_todo(r, user, name_map, alloc_map=alloc_map, admins=admins_map.get(r["project"], []))
		shaped["done_at"] = str(r["completed_at"]) if r.get("completed_at") else None
		shaped["done_at_human"] = pretty_date(get_datetime(r["completed_at"])) if r.get("completed_at") else None
		out.append(shaped)

	out.sort(key=lambda t: t["done_at"] or "", reverse=True)
	return out[: int(limit)]


@frappe.whitelist()
def save_notes(todo_id, notes):
```

- [ ] **Step 2: Restart so the new whitelisted method is registered**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 3: Smoke-verify via bench console**

Pick a real user who has at least one Completed todo assigned to them (check `frappe.db.get_value("Project Todo", {"status": "✅ Completed"}, "assigned_to")` if unsure). Run:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("mo@intinusa.id"); from vernon_project.api.project_todo import get_recently_done; r = get_recently_done(); print(len(r), r[0]["done_at_human"] if r else None, r[0]["to_do"] if r else None)
EOF
```

Expected: prints a count `<= 30` and, if the user has completed work, a human-readable relative time (e.g. `3 days ago`) and a todo title. Swap in a real user email — `mo@intinusa.id` is an example, not a fixture.

- [ ] **Step 4: Regenerate docs data**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py
git diff --stat docs/assets/data.js
```

Expected: `data.js` shows a diff (the new endpoint is now counted/listed). If the script exits non-zero, follow its error message (it means something new is missing from a `CLUSTERS` map — not expected here since no new DocType was added).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/project_todo.py docs/assets/data.js
git commit -m "feat(home): get_recently_done endpoint for the Done tab"
```

---

### Task 2: Shared type + API + hook wiring

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `DoneItem` interface, next to `MyApprovalItem`)
- Modify: `frontend/src/lib/api.ts` (add `recentlyDone` call, next to `myApprovals`)
- Modify: `frontend/src/hooks/useData.ts` (add `keys.recentlyDone` + `useRecentlyDone`, next to `keys.myApprovals` / `useMyApprovals`)

**Interfaces:**
- Consumes: whitelisted method `vernon_project.api.project_todo.get_recently_done` (Task 1).
- Produces: `DoneItem` type (exported from `@/lib/types`), `mobileApi.recentlyDone(): Promise<DoneItem[]>` (exported from `@/lib/api`), `useRecentlyDone(): UseQueryResult<DoneItem[]>` (exported from `@/hooks/useData`). Tasks 3-5 import these three names verbatim.

- [ ] **Step 1: Add the `DoneItem` type**

In `frontend/src/lib/types.ts`, find:

```ts
// A row from get_my_approvals: a ProjectItem the current user personally
// approved, plus when (their own stamp) and in which role.
export interface MyApprovalItem extends ProjectItem {
  approved_at: string | null
  approval_role: 'Leader' | 'Owner'
}
```

Add immediately after it:

```ts

// A row from get_recently_done: a ProjectItem the current user completed
// themself, plus when. Powers the Home "Done" tab.
export interface DoneItem extends ProjectItem {
  done_at: string | null
  done_at_human: string | null
}
```

- [ ] **Step 2: Add the API call**

In `frontend/src/lib/api.ts`, find:

```ts
  myApprovals: () =>
    api.get<import('./types').MyApprovalItem[]>('vernon_project.api.project_todo.get_my_approvals'),
```

Add immediately after it:

```ts
  recentlyDone: () =>
    api.get<import('./types').DoneItem[]>('vernon_project.api.project_todo.get_recently_done'),
```

- [ ] **Step 3: Add the query key + hook**

In `frontend/src/hooks/useData.ts`, find (inside the `keys` object):

```ts
  myApprovals: ['my-approvals'] as const,
}
```

Replace with:

```ts
  myApprovals: ['my-approvals'] as const,
  recentlyDone: ['recently-done'] as const,
}
```

Then find:

```ts
// Approvals the current user has personally granted (Leader/Owner gate),
// newest first — powers the "My Approvals" history screen.
export const useMyApprovals = () =>
  useQuery({
    queryKey: keys.myApprovals,
    queryFn: () => mobileApi.myApprovals(),
  })
```

Add immediately after it:

```ts

// The current user's own last 30 completed todos, newest first — powers the
// Home "Done" tab. No invalidation wiring needed elsewhere: nothing on Home
// currently mutates a todo INTO Completed status without a full page action
// that already triggers a dashboard refetch on its own query keys.
export const useRecentlyDone = () =>
  useQuery({
    queryKey: keys.recentlyDone,
    queryFn: () => mobileApi.recentlyDone(),
  })
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors (the three additions are additive; nothing consumes them yet).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(home): DoneItem type + recentlyDone API + useRecentlyDone hook"
```

---

### Task 3: `TodoCard` — optional `doneAt` line

**Files:**
- Modify: `frontend/src/components/TodoCard.tsx:19-24` (props interface), `:169-172` (render)

**Interfaces:**
- Consumes: nothing new (pure prop addition).
- Produces: `TodoCard` accepts an optional `doneAt?: string | null` prop. When truthy, renders a small "done N ago" line next to the status pill. Tasks 4-5 pass `doneAt={item.done_at_human}` when rendering Done-tab rows.

- [ ] **Step 1: Add the prop**

In `frontend/src/components/TodoCard.tsx`, find:

```ts
interface Props {
  todo: ProjectItem
  // show the assignee avatar (review/team contexts) vs. hide (my own lists)
  showAssignee?: boolean
  showProject?: boolean
}

export function TodoCard({ todo, showAssignee, showProject = true }: Props) {
```

Replace with:

```ts
interface Props {
  todo: ProjectItem
  // show the assignee avatar (review/team contexts) vs. hide (my own lists)
  showAssignee?: boolean
  showProject?: boolean
  // relative-time string ("2 hours ago") for the Home "Done" tab — not part of
  // ProjectItem itself since only that one list carries it. undefined elsewhere.
  doneAt?: string | null
}

export function TodoCard({ todo, showAssignee, showProject = true, doneAt }: Props) {
```

- [ ] **Step 2: Render it next to the status pill**

Find:

```tsx
            <Pill className={meta.pill}>
              <span>{meta.emoji}</span>
              {meta.label}
            </Pill>
            {todo.is_waiting && (
```

Replace with:

```tsx
            <Pill className={meta.pill}>
              <span>{meta.emoji}</span>
              {meta.label}
            </Pill>
            {doneAt && (
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-400">
                <Check className="h-3.5 w-3.5" />
                {doneAt}
              </span>
            )}
            {todo.is_waiting && (
```

(`Check` is already imported at the top of this file — no import change needed.)

- [ ] **Step 3: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TodoCard.tsx
git commit -m "feat(home): TodoCard optional doneAt line"
```

---

### Task 4: Mobile — Done axis in `Today.tsx`

**Files:**
- Modify: `frontend/src/pages/Today.tsx`

**Interfaces:**
- Consumes: `useRecentlyDone` (Task 2), `DoneItem` (Task 2), `TodoCard`'s `doneAt` prop (Task 3).
- Produces: nothing consumed by later tasks — this is a leaf page.

- [ ] **Step 1: Import the hook and type**

Find (line 47):

```ts
import { useBoot, useDashboard, useWallet, useHomeBanners, useDailyVerse, usePreviousShiftShortfall, useMeetings, useUnreadMentions, useMarkRead } from '@/hooks/useData'
```

Replace with:

```ts
import { useBoot, useDashboard, useWallet, useHomeBanners, useDailyVerse, usePreviousShiftShortfall, useMeetings, useUnreadMentions, useMarkRead, useRecentlyDone } from '@/hooks/useData'
```

Find (line 57):

```ts
import type { ProjectItem } from '@/lib/types'
```

Replace with:

```ts
import type { ProjectItem, DoneItem } from '@/lib/types'
```

- [ ] **Step 2: Widen the `Axis` type**

Find (line 107):

```ts
type Axis = 'plan' | 'deadline' | 'waiting'
```

Replace with:

```ts
type Axis = 'plan' | 'deadline' | 'waiting' | 'done'
```

- [ ] **Step 3: Fetch the done list**

Find (line 236):

```ts
  const { data: mentions } = useUnreadMentions()
```

Replace with:

```ts
  const { data: mentions } = useUnreadMentions()
  const { data: doneTodos = [] } = useRecentlyDone()
```

- [ ] **Step 4: Let `renderList`'s non-swipe path accept a per-row extra**

Find (lines 328-351):

```ts
  const renderList = (list: ProjectItem[], emptyTitle: string, swipe = true) => {
    const q = query.trim().toLowerCase()
    const shown = list.filter((t) => matchProjectItem(t, query))
    const empty = q ? (
      <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
    ) : activeTodos.length || waitingTodos.length ? (
      <EmptyState icon={SearchX} title={emptyTitle} subtitle="Peek at another tab, or clear the filters." />
    ) : (
      <EmptyState icon={PartyPopper} title="All caught up!" subtitle="Nothing on your plate right now. Go you." />
    )
    // Swipe axes: SwipeProjectLists owns the sticky search + project-picker header
    // and stays mounted even when empty, so the search input keeps focus while typing.
    if (swipe) return <SwipeProjectLists items={shown} search={searchBox} emptyState={empty} />
    // Non-swipe (Waiting): search is rendered inline by the caller, above this list.
    return shown.length ? (
      <div className="mt-3 flex flex-col gap-3">
        {shown.map((t) => (
          <TodoCard key={t.name} todo={t} />
        ))}
      </div>
    ) : (
      empty
    )
  }
```

Replace with:

```ts
  const renderList = (list: ProjectItem[], emptyTitle: string, swipe = true, doneAt?: (t: ProjectItem) => string | null | undefined) => {
    const q = query.trim().toLowerCase()
    const shown = list.filter((t) => matchProjectItem(t, query))
    const empty = q ? (
      <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
    ) : activeTodos.length || waitingTodos.length ? (
      <EmptyState icon={SearchX} title={emptyTitle} subtitle="Peek at another tab, or clear the filters." />
    ) : (
      <EmptyState icon={PartyPopper} title="All caught up!" subtitle="Nothing on your plate right now. Go you." />
    )
    // Swipe axes: SwipeProjectLists owns the sticky search + project-picker header
    // and stays mounted even when empty, so the search input keeps focus while typing.
    if (swipe) return <SwipeProjectLists items={shown} search={searchBox} emptyState={empty} />
    // Non-swipe (Waiting, Done): search is rendered inline by the caller, above this list.
    return shown.length ? (
      <div className="mt-3 flex flex-col gap-3">
        {shown.map((t) => (
          <TodoCard key={t.name} todo={t} doneAt={doneAt?.(t)} />
        ))}
      </div>
    ) : (
      empty
    )
  }
```

- [ ] **Step 5: Add the tab + panel**

Find (lines 628-637):

```tsx
                    {/* Axis: Plan (by allocation) · Deadline (by due date) · Waiting (parked) */}
                    <PillTabs<Axis>
                      tabs={[
                        { key: 'plan', label: 'Plan' },
                        { key: 'deadline', label: 'Deadline' },
                        { key: 'waiting', label: 'Waiting', count: waitingTodos.length },
                      ]}
                      value={axis}
                      onChange={setAxis}
                    />
```

Replace with:

```tsx
                    {/* Axis: Plan (by allocation) · Deadline (by due date) · Waiting (parked) · Done (recently finished) */}
                    <PillTabs<Axis>
                      tabs={[
                        { key: 'plan', label: 'Plan' },
                        { key: 'deadline', label: 'Deadline' },
                        { key: 'waiting', label: 'Waiting', count: waitingTodos.length },
                        { key: 'done', label: 'Done', count: doneTodos.length },
                      ]}
                      value={axis}
                      onChange={setAxis}
                    />
```

Find (lines 684-689):

```tsx
                    {axis === 'waiting' && (
                      <>
                        {searchBox}
                        {renderList(waitingTodos, 'Nothing waiting', false)}
                      </>
                    )}
```

Replace with:

```tsx
                    {axis === 'waiting' && (
                      <>
                        {searchBox}
                        {renderList(waitingTodos, 'Nothing waiting', false)}
                      </>
                    )}

                    {axis === 'done' && (
                      <>
                        {searchBox}
                        {renderList(doneTodos, 'Nothing done yet', false, (t) => (t as DoneItem).done_at_human)}
                      </>
                    )}
```

- [ ] **Step 6: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Today.tsx
git commit -m "feat(home): Done axis on mobile Today"
```

---

### Task 5: Web — Done axis in `Home.tsx`

**Files:**
- Modify: `frontend-web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `useRecentlyDone` (Task 2), `DoneItem` (Task 2), `TodoCard`'s `doneAt` prop (Task 3).
- Produces: nothing consumed by later tasks — this is a leaf page.

- [ ] **Step 1: Import the hook and type**

Find (lines 13-17):

```ts
import {
  useBoot, useDashboard, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useDailyVerse, useHomeBanners,
  usePreviousShiftShortfall, useUnreadMentions, useMarkRead,
} from '@/hooks/useData'
```

Replace with:

```ts
import {
  useBoot, useDashboard, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useDailyVerse, useHomeBanners,
  usePreviousShiftShortfall, useUnreadMentions, useMarkRead, useRecentlyDone,
} from '@/hooks/useData'
```

Find (line 36):

```ts
import type { ProjectItem, BannerSlide, MeetingListItem } from '@/lib/types'
```

Replace with:

```ts
import type { ProjectItem, BannerSlide, MeetingListItem, DoneItem } from '@/lib/types'
```

- [ ] **Step 2: Widen the `Axis` type**

Find (line 163):

```ts
type Axis = 'plan' | 'deadline' | 'waiting'
```

Replace with:

```ts
type Axis = 'plan' | 'deadline' | 'waiting' | 'done'
```

- [ ] **Step 3: Fetch the done list**

Find (line 367):

```ts
  const mentions = useUnreadMentions()
```

Replace with:

```ts
  const mentions = useUnreadMentions()
  const recentlyDone = useRecentlyDone()
```

Find (line 434):

```ts
  const waiting = allTasks.filter((t) => t.is_waiting)
```

Replace with:

```ts
  const waiting = allTasks.filter((t) => t.is_waiting)
  const doneList = recentlyDone.data ?? []
```

- [ ] **Step 4: Let `renderList` accept a per-row extra**

Find (lines 449-476):

```ts
  const renderList = (list: ProjectItem[], emptyTitle: string, emptySub?: string) => {
    const shown = q
      ? list.filter((t) => `${t.to_do} ${t.project_name} ${t.project_detail_title}`.toLowerCase().includes(q))
      : list
    if (!shown.length) {
      if (q) return <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
      return (
        <EmptyState
          icon={emptyTitle === 'Nothing waiting' ? Pause : Sparkles}
          title={emptyTitle}
          subtitle={emptySub ?? 'No tasks in this view.'}
        />
      )
    }
    return (
      <div className="mt-3">
        <ThreeColProjectList
          items={shown}
          storageKey="home"
          renderCard={(t, i) => (
            <div key={t.name} {...rise(i)}>
              <TodoCard todo={t} />
            </div>
          )}
        />
      </div>
    )
  }
```

Replace with:

```ts
  const renderList = (
    list: ProjectItem[],
    emptyTitle: string,
    emptySub?: string,
    doneAt?: (t: ProjectItem) => string | null | undefined,
  ) => {
    const shown = q
      ? list.filter((t) => `${t.to_do} ${t.project_name} ${t.project_detail_title}`.toLowerCase().includes(q))
      : list
    if (!shown.length) {
      if (q) return <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
      return (
        <EmptyState
          icon={emptyTitle === 'Nothing waiting' ? Pause : Sparkles}
          title={emptyTitle}
          subtitle={emptySub ?? 'No tasks in this view.'}
        />
      )
    }
    return (
      <div className="mt-3">
        <ThreeColProjectList
          items={shown}
          storageKey="home"
          renderCard={(t, i) => (
            <div key={t.name} {...rise(i)}>
              <TodoCard todo={t} doneAt={doneAt?.(t)} />
            </div>
          )}
        />
      </div>
    )
  }
```

- [ ] **Step 5: Add the tab**

Find (lines 696-707):

```tsx
                    <Segmented
                      options={[
                        { value: 'plan', label: 'Plan' },
                        { value: 'deadline', label: 'Deadline' },
                        { value: 'waiting', label: 'Waiting', badge: waitingList.length || undefined },
                      ]}
                      value={axis}
                      onChange={(k) => {
                        setAxis(k)
                        if (k !== 'plan') setPickedDate('')
                      }}
                    />
```

Replace with:

```tsx
                    <Segmented
                      options={[
                        { value: 'plan', label: 'Plan' },
                        { value: 'deadline', label: 'Deadline' },
                        { value: 'waiting', label: 'Waiting', badge: waitingList.length || undefined },
                        { value: 'done', label: 'Done', badge: doneList.length || undefined },
                      ]}
                      value={axis}
                      onChange={(k) => {
                        setAxis(k)
                        if (k !== 'plan') setPickedDate('')
                      }}
                    />
```

- [ ] **Step 6: Exclude Done from the sub-tabs refine row**

Find (line 734):

```tsx
                {axis !== 'waiting' && (
```

Replace with:

```tsx
                {(axis === 'plan' || axis === 'deadline') && (
```

- [ ] **Step 7: Add the Done panel**

Find (lines 856-861):

```tsx
              {axis === 'waiting' && (
                <>
                  <ListSummary count={waitingList.length} minutes={sumEst(waitingList)} label={waitingList.length === 1 ? 'task parked' : 'tasks parked'} />
                  {renderList(waitingList, 'Nothing waiting', 'No parked tasks.')}
                </>
              )}
```

Replace with:

```tsx
              {axis === 'waiting' && (
                <>
                  <ListSummary count={waitingList.length} minutes={sumEst(waitingList)} label={waitingList.length === 1 ? 'task parked' : 'tasks parked'} />
                  {renderList(waitingList, 'Nothing waiting', 'No parked tasks.')}
                </>
              )}

              {axis === 'done' && (
                <>
                  <ListSummary count={doneList.length} minutes={sumEst(doneList)} label={doneList.length === 1 ? 'task done' : 'tasks done'} />
                  {renderList(doneList, 'Nothing done yet', 'Nothing completed recently.', (t) => (t as DoneItem).done_at_human)}
                </>
              )}
```

- [ ] **Step 8: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/pages/Home.tsx
git commit -m "feat(home): Done axis on web Home"
```

---

### Task 6: Build, deploy, verify, What's New

**Files:**
- Build output: `vernon_project/public/frontend/**`, `vernon_project/public/frontend_web/**` (generated, committed)
- Create (temp): a scratch JSON file for the App Release insert (not committed — matches CLAUDE.md's insert recipe)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing — terminal task.

- [ ] **Step 1: Build mobile**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```

Expected: build succeeds, new hashed bundle files appear under `vernon_project/public/frontend/assets/`.

- [ ] **Step 2: Build web**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

Expected: build succeeds, new hashed bundle files appear under `vernon_project/public/frontend_web/assets/`.

- [ ] **Step 3: Restart**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 4: Verify the new bundle actually contains the feature**

```bash
grep -rl "Nothing done yet" /home/frappe/frappe-bench/apps/vernon_project/vernon_project/public/frontend/assets/*.js /home/frappe/frappe-bench/apps/vernon_project/vernon_project/public/frontend_web/assets/*.js
```

Expected: at least one match per frontend (mobile `assets/index-*.js`, web `assets/index-*.js`). This is the CLAUDE.md-required check before claiming a feature shipped — a distinctive string from the feature must be present in the built bundle, not just in source.

- [ ] **Step 5: Manual check in the app**

Open `/` (Home) on both `/m` and `/w`, confirm a 4th "Done" tab appears with a count badge, and tapping it shows the current user's recently-completed todos with a relative-time line on each card. If the test user has zero completed todos, confirm the empty state ("Nothing done yet") renders instead of a blank/broken panel.

- [ ] **Step 6: Insert the What's New entry**

Check the current latest version first:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version"], order_by="creation desc", limit=1))
EOF
```

Then write a releases file (bump the minor version by one from whatever that printed; use today's real date):

```bash
cat > /tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/0e0becd0-47b8-4797-900d-abb28d4e45d1/scratchpad/done-tab-release.json <<'EOF'
[
  {
    "version": "1.93.0",
    "release_date": "2026-08-20",
    "title": "Tab Done di Home",
    "notes": "Tab Done baru di Home — lihat daftar tugas yang baru saja kamu selesaikan, lengkap dengan waktu penyelesaiannya (/m & /w).",
    "platform": "Both"
  }
]
EOF
```

(Replace `release_date` with the actual date this step runs, and `version` with the real bump if the console printout above showed something newer than `1.92.2`.)

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/0e0becd0-47b8-4797-900d-abb28d4e45d1/scratchpad/done-tab-release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 7: Verify the release through the real endpoint**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[:1]); print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[:1])
EOF
```

Expected: the new row appears in both platform-filtered results (row is `platform: "Both"`, so it should show in both calls).

- [ ] **Step 8: Commit build artifacts**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend vernon_project/public/frontend_web
git commit -m "chore: rebuild bundles for Home Done tab"
```

---

## Self-Review

**Spec coverage:**
- Backend endpoint, scope (assigned-to-me, Completed status, no cutoff, cap 30) → Task 1. ✓
- Shared type/API/hook plumbing → Task 2. ✓
- `TodoCard` `doneAt` display → Task 3. ✓
- Mobile tab + panel → Task 4. ✓
- Web tab + panel → Task 5. ✓
- No undo/quick-action, no pagination, no new doctype field → nothing added anywhere; confirmed absent by omission. ✓
- Build both bundles, `gen_docs.py`, What's New → Task 1 Step 4 (docs) and Task 6 (build/deploy/What's New). ✓
- Verification approach (bench console smoke check, no pytest) → Task 1 Step 3, matches project's live-site/code-first convention. ✓

**Placeholder scan:** none — every step has literal code/commands, no "TBD"/"similar to above".

**Type consistency:** `DoneItem` (Task 2) used identically in Task 3 (`doneAt?: string | null` prop, matching `DoneItem.done_at_human`'s type), Task 4 and Task 5 (`(t) => (t as DoneItem).done_at_human`). `mobileApi.recentlyDone()` (Task 2) matches the endpoint name from Task 1 (`vernon_project.api.project_todo.get_recently_done`) exactly. `useRecentlyDone` (Task 2) is the exact name imported in Tasks 4 and 5.
