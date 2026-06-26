# Estimated-minutes progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive every progress bar/ring off estimated-minutes (`done / total`) instead of todo counts, and show the human `2h 30m / 8h` ratio on calendar, home, projects list, project, and project detail.

**Architecture:** Backend (`api/mobile.py`) emits per-project and per-detail minute sums plus a minutes-with-count-fallback `progress`. Two shared pure helpers in `frontend/src/lib/format.ts` (`formatEstimateRatio`, `progressPct`) render the ratio and compute client-side aggregates. Both apps share `frontend/src/` via the web's `@/* → ../frontend/src/*` alias, so `CalendarView`, `ProjectCard`, `format.ts`, and `types.ts` are edited once and cover both.

**Tech Stack:** Frappe (Python) backend; two Vite + React + TypeScript frontends (`frontend` mobile, `frontend-web` web); Tailwind.

## Global Constraints

- **Done = `✅ Completed` only.** `_status_key(status) == "completed"`. Cancelled excluded from all sums.
- **Display via existing `formatEstimate(minutes)`** → `2h 30m` / `1h` / `45m`. Never hand-roll h/m formatting.
- **Zero-estimate fallback:** when total minutes == 0, progress falls back to count-based %. Ratio numerator shows `0m` (not `—`).
- **Cards keep the todo count** alongside the minutes ratio (show both).
- **Tests deferred** per project convention (live site, code-first — `MEMORY.md`). Per-task verification = `npx tsc --noEmit` (frontend) / `python -m py_compile` (backend) + build + manual smoke. No new test framework, no new dependency.
- **No schema change** → no `bench migrate`. Deploy = `bench restart` (Python) + `npm run build` in both frontends (commit built assets).
- Indentation: `api/mobile.py` uses **tabs**. Frontend uses **2 spaces**.

---

### Task 1: Shared frontend helpers

**Files:**
- Modify: `frontend/src/lib/format.ts` (after `formatEstimate`, line 19)

**Interfaces:**
- Produces: `formatEstimateRatio(done: number, total: number): string` and `progressPct(minutesDone: number, minutesTotal: number, countDone: number, countTotal: number): number` — consumed by every later task.

- [ ] **Step 1: Add the two helpers**

Insert directly after the `formatEstimate` function (after line 19) in `frontend/src/lib/format.ts`:

```ts
// "2h 30m / 8h" — done/total estimate. 0 done renders "0m" (formatEstimate alone gives "—").
export function formatEstimateRatio(done: number, total: number): string {
  return `${done ? formatEstimate(done) : '0m'} / ${formatEstimate(total)}`
}

// Minutes-based progress %, falling back to todo count when nothing is estimated.
export function progressPct(
  minutesDone: number,
  minutesTotal: number,
  countDone: number,
  countTotal: number,
): number {
  if (minutesTotal > 0) return Math.round((minutesDone / minutesTotal) * 100)
  return countTotal > 0 ? Math.round((countDone / countTotal) * 100) : 0
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: exits 0, no errors.

- [ ] **Step 3: Sanity-check behavior**

Confirm by reading: `formatEstimateRatio(150, 480)` → `"2h 30m / 8h"`; `formatEstimateRatio(0, 480)` → `"0m / 8h"`; `progressPct(150, 480, 1, 3)` → `31`; `progressPct(0, 0, 2, 4)` → `50` (fallback); `progressPct(0, 0, 0, 0)` → `0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/format.ts
git commit -m "feat(web): formatEstimateRatio + progressPct helpers"
```

---

### Task 2: Backend minute rollups + types

**Files:**
- Modify: `vernon_project/api/mobile.py` (add `_pct_minutes` after line 60; `get_projects` 738–758; `get_project` 792–832; `_shape_item_row` 554–567)
- Modify: `frontend/src/lib/types.ts` (`ProjectCard` 154–175; `ProjectDetailSummary` 177–184)

**Interfaces:**
- Produces: API now returns `minutes_done` + `minutes_total` on each project card and each `project_details` summary; `_shape_item_row` rows carry `estimated`; project/detail `progress` is minutes-with-count-fallback.

- [ ] **Step 1: Add the Python fallback helper**

In `vernon_project/api/mobile.py`, after `_status_key` (after line 60), add (tabs):

```python
def _pct_minutes(m_done, m_total, c_done, c_total):
	"""Minutes-based progress %, falling back to todo count when nothing is estimated."""
	if m_total:
		return round(m_done / m_total * 100)
	return round(c_done / c_total * 100) if c_total else 0
```

- [ ] **Step 2: `get_projects` — accumulate minutes**

Replace the stats init + loop (lines 738–749):

```python
	stats = {n: {"total": 0, "done": 0, "overdue": 0, "review": 0} for n in names}
	for r in rows:
		s = stats[r["project"]]
		s["total"] += 1
		skey = _status_key(r["status"])
		if skey == "completed":
			s["done"] += 1
		else:
			if r["deadline"] and getdate(r["deadline"]) < today:
				s["overdue"] += 1
		if skey in ("done", "checked"):
			s["review"] += 1
```

with:

```python
	stats = {n: {"total": 0, "done": 0, "overdue": 0, "review": 0, "minutes_total": 0, "minutes_done": 0} for n in names}
	for r in rows:
		s = stats[r["project"]]
		s["total"] += 1
		est = r["estimated"] or 0
		s["minutes_total"] += est
		skey = _status_key(r["status"])
		if skey == "completed":
			s["done"] += 1
			s["minutes_done"] += est
		else:
			if r["deadline"] and getdate(r["deadline"]) < today:
				s["overdue"] += 1
		if skey in ("done", "checked"):
			s["review"] += 1
```

- [ ] **Step 3: `get_projects` — emit minutes + fallback progress**

Replace lines 754–758:

```python
		p["item_total"] = s["total"]
		p["item_done"] = s["done"]
		p["overdue"] = s["overdue"]
		p["review"] = s["review"]
		p["progress"] = round(s["done"] / s["total"] * 100) if s["total"] else 0
```

with:

```python
		p["item_total"] = s["total"]
		p["item_done"] = s["done"]
		p["overdue"] = s["overdue"]
		p["review"] = s["review"]
		p["minutes_total"] = s["minutes_total"]
		p["minutes_done"] = s["minutes_done"]
		p["progress"] = _pct_minutes(s["minutes_done"], s["minutes_total"], s["done"], s["total"])
```

- [ ] **Step 4: `get_project` — seed minute fields on both item initializers**

Replace the seed block (lines 792–798):

```python
			items[d["name"]] = {
				"name": d["name"],
				"title": d["title"],
				"total": 0,
				"done": 0,
				"overdue": 0,
			}
```

with:

```python
			items[d["name"]] = {
				"name": d["name"],
				"title": d["title"],
				"total": 0,
				"done": 0,
				"overdue": 0,
				"minutes_total": 0,
				"minutes_done": 0,
			}
```

Replace the `setdefault` block (lines 809–812):

```python
			wi = items.setdefault(
				r["project_detail"],
				{"name": r["project_detail"], "title": r["project_detail_title"], "total": 0, "done": 0, "overdue": 0},
			)
```

with:

```python
			wi = items.setdefault(
				r["project_detail"],
				{"name": r["project_detail"], "title": r["project_detail_title"], "total": 0, "done": 0, "overdue": 0, "minutes_total": 0, "minutes_done": 0},
			)
```

- [ ] **Step 5: `get_project` — accumulate + fallback progress per item**

Replace the per-row body (lines 813–818):

```python
			wi["total"] += 1
			skey = _status_key(r["status"])
			if skey == "completed":
				wi["done"] += 1
			elif r["deadline"] and getdate(r["deadline"]) < today:
				wi["overdue"] += 1
```

with:

```python
			wi["total"] += 1
			est = r["estimated"] or 0
			wi["minutes_total"] += est
			skey = _status_key(r["status"])
			if skey == "completed":
				wi["done"] += 1
				wi["minutes_done"] += est
			elif r["deadline"] and getdate(r["deadline"]) < today:
				wi["overdue"] += 1
```

Replace the progress loop (lines 831–832):

```python
		for wi in items.values():
			wi["progress"] = round(wi["done"] / wi["total"] * 100) if wi["total"] else 0
```

with:

```python
		for wi in items.values():
			wi["progress"] = _pct_minutes(wi["minutes_done"], wi["minutes_total"], wi["done"], wi["total"])
```

- [ ] **Step 6: `_shape_item_row` — expose estimated**

In `_shape_item_row` (lines 554–567), add `"estimated"` to the returned dict (after the `"status_key"` line):

```python
		"status_key": skey,
		"estimated": row["estimated"] or 0,
```

- [ ] **Step 7: Update TypeScript types**

In `frontend/src/lib/types.ts`, `ProjectCard` (lines 170–174), after `item_done`:

```ts
  item_total: number
  item_done: number
  minutes_total: number
  minutes_done: number
  overdue: number
  review: number
  progress: number
```

`ProjectDetailSummary` (lines 177–184), after `done`:

```ts
export interface ProjectDetailSummary {
  name: string
  title: string
  total: number
  done: number
  minutes_total: number
  minutes_done: number
  overdue: number
  progress: number
}
```

(`ProjectItem.estimated` already exists; `project_items` is already typed `ProjectItem[]`, so the detail screens already see `estimated` once the backend populates it.)

- [ ] **Step 8: Verify backend compiles + types pass**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m py_compile vernon_project/api/mobile.py`
Expected: exits 0.
Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add vernon_project/api/mobile.py frontend/src/lib/types.ts
git commit -m "feat(api): minutes rollups + count-fallback progress on projects/details"
```

---

### Task 3: Projects list card (shared)

**Files:**
- Modify: `frontend/src/components/ProjectCard.tsx` (import line 4; todos line 42–46)

**Interfaces:**
- Consumes: `formatEstimateRatio` (Task 1); `p.minutes_done` / `p.minutes_total` (Task 2).

- [ ] **Step 1: Import the helper**

Change line 4:

```tsx
import { formatDate } from '@/lib/format'
```

to:

```tsx
import { formatDate, formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 2: Show minutes ratio beside the todo count**

Replace lines 43–46:

```tsx
        <div className="flex items-center gap-3">
          <span className="text-slate-500 dark:text-slate-400">
            {p.item_done}/{p.item_total} todos
          </span>
```

with:

```tsx
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {formatEstimateRatio(p.minutes_done, p.minutes_total)}
          </span>
          <span className="text-slate-400 dark:text-slate-500">
            {p.item_done}/{p.item_total} todos
          </span>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProjectCard.tsx
git commit -m "feat(web): minutes ratio on project cards"
```

---

### Task 4: Project page (web + mobile)

**Files:**
- Modify: `frontend-web/src/pages/Project.tsx` (import 13; progress calc 72–75; hero 102; detail card 303–306)
- Modify: `frontend/src/pages/ProjectScreen.tsx` (import 17; progress calc 60–63; hero 84–87; detail card 306–311)

**Interfaces:**
- Consumes: `formatEstimateRatio`, `progressPct` (Task 1); `w.minutes_done` / `w.minutes_total` on each `project_details` entry (Task 2).

- [ ] **Step 1: web — import helpers**

Change `frontend-web/src/pages/Project.tsx` line 13:

```tsx
import { formatDate } from '@/lib/format'
```

to:

```tsx
import { formatDate, formatEstimateRatio, progressPct } from '@/lib/format'
```

- [ ] **Step 2: web — minutes-based project progress**

Replace lines 72–75:

```tsx
  const totalTasks = p.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = p.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = p.project_details.reduce((s, w) => s + w.overdue, 0)
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
```

with:

```tsx
  const totalTasks = p.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = p.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = p.project_details.reduce((s, w) => s + w.overdue, 0)
  const minutesTotal = p.project_details.reduce((s, w) => s + w.minutes_total, 0)
  const minutesDone = p.project_details.reduce((s, w) => s + w.minutes_done, 0)
  const progress = progressPct(minutesDone, minutesTotal, doneTasks, totalTasks)
```

- [ ] **Step 3: web — hero shows the ratio**

Replace line 102:

```tsx
              <span>{doneTasks}/{totalTasks} todos done</span>
```

with:

```tsx
              <span className="font-semibold">{formatEstimateRatio(minutesDone, minutesTotal)}</span>
              <span>{doneTasks}/{totalTasks} todos done</span>
```

- [ ] **Step 4: web — detail card shows ratio + count**

Replace lines 303–306:

```tsx
                                  <ProgressBar value={w.progress} />
                                  <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {w.done}/{w.total}
                                  </span>
```

with:

```tsx
                                  <ProgressBar value={w.progress} />
                                  <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {formatEstimateRatio(w.minutes_done, w.minutes_total)} · {w.done}/{w.total}
                                  </span>
```

- [ ] **Step 5: mobile — import helpers**

Change `frontend/src/pages/ProjectScreen.tsx` line 17:

```tsx
import { formatDate } from '@/lib/format'
```

to:

```tsx
import { formatDate, formatEstimateRatio, progressPct } from '@/lib/format'
```

- [ ] **Step 6: mobile — minutes-based project progress**

Replace lines 60–63:

```tsx
  const totalTasks = data.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = data.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = data.project_details.reduce((s, w) => s + w.overdue, 0)
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
```

with:

```tsx
  const totalTasks = data.project_details.reduce((s, w) => s + w.total, 0)
  const doneTasks = data.project_details.reduce((s, w) => s + w.done, 0)
  const overdue = data.project_details.reduce((s, w) => s + w.overdue, 0)
  const minutesTotal = data.project_details.reduce((s, w) => s + w.minutes_total, 0)
  const minutesDone = data.project_details.reduce((s, w) => s + w.minutes_done, 0)
  const progress = progressPct(minutesDone, minutesTotal, doneTasks, totalTasks)
```

- [ ] **Step 7: mobile — hero shows the ratio**

Replace lines 84–87:

```tsx
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          <span>
            {doneTasks}/{totalTasks} todos done
          </span>
```

with:

```tsx
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          <span className="font-semibold text-white">{formatEstimateRatio(minutesDone, minutesTotal)}</span>
          <span>
            {doneTasks}/{totalTasks} todos done
          </span>
```

- [ ] **Step 8: mobile — detail card shows ratio + count**

Replace lines 306–311:

```tsx
                <div className="mt-2.5 flex items-center gap-2">
                  <ProgressBar value={w.progress} />
                  <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {w.done}/{w.total}
                  </span>
                </div>
```

with:

```tsx
                <div className="mt-2.5 flex items-center gap-2">
                  <ProgressBar value={w.progress} />
                  <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatEstimateRatio(w.minutes_done, w.minutes_total)} · {w.done}/{w.total}
                  </span>
                </div>
```

- [ ] **Step 9: Typecheck both apps**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && cd ../frontend-web && npx tsc --noEmit -p tsconfig.json`
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add frontend-web/src/pages/Project.tsx frontend/src/pages/ProjectScreen.tsx
git commit -m "feat(web,mobile): minutes-based project progress + detail ratios"
```

---

### Task 5: Project Detail page (web + mobile)

**Files:**
- Modify: `frontend-web/src/pages/ProjectDetail.tsx` (import 7; counts 47–49; stats tiles after 115)
- Modify: `frontend/src/pages/ProjectDetailScreen.tsx` (import 11; counts 45–50; hero chips after 67)

**Interfaces:**
- Consumes: `formatEstimateRatio` (Task 1); `project_items[].estimated` (Task 2 backend).

- [ ] **Step 1: web — import helper**

Change `frontend-web/src/pages/ProjectDetail.tsx` line 7:

```tsx
import { sanitizeHtml, stripHtml } from '@/lib/format'
```

to:

```tsx
import { sanitizeHtml, stripHtml, formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 2: web — compute detail minutes**

Replace lines 47–49:

```tsx
  const items = d.project_items
  const completedCount = items.filter((t) => t.status_key === 'completed').length
  const openCount = items.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
```

with:

```tsx
  const items = d.project_items
  const completedCount = items.filter((t) => t.status_key === 'completed').length
  const openCount = items.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const notCancelled = items.filter((t) => t.status_key !== 'cancelled')
  const minutesTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const minutesDone = notCancelled
    .filter((t) => t.status_key === 'completed')
    .reduce((s, t) => s + (t.estimated || 0), 0)
```

- [ ] **Step 3: web — add an "Est. done" stat tile**

After the Completed tile (line 115, the closing `</BentoTile>` of the Completed stat), insert:

```tsx
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={formatEstimateRatio(minutesDone, minutesTotal)} label="Est. done" />
        </BentoTile>
```

(`BentoStat`'s `value` already accepts strings — e.g. `value={w ? formatNumber(w.balance) : '—'}`.)

- [ ] **Step 4: mobile — import helper**

Change `frontend/src/pages/ProjectDetailScreen.tsx` line 11:

```tsx
import { stripHtml, sanitizeHtml, byDeadlineAsc } from '@/lib/format'
```

to:

```tsx
import { stripHtml, sanitizeHtml, byDeadlineAsc, formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 5: mobile — compute detail minutes**

Replace lines 45–50:

```tsx
  const projectItems = data.project_items.slice().sort(byDeadlineAsc)
  const completedCount = projectItems.filter((t) => t.status_key === 'completed').length
  const openCount = projectItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
```

with:

```tsx
  const projectItems = data.project_items.slice().sort(byDeadlineAsc)
  const completedCount = projectItems.filter((t) => t.status_key === 'completed').length
  const openCount = projectItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const notCancelled = projectItems.filter((t) => t.status_key !== 'cancelled')
  const minutesTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const minutesDone = notCancelled
    .filter((t) => t.status_key === 'completed')
    .reduce((s, t) => s + (t.estimated || 0), 0)
```

- [ ] **Step 6: mobile — show the ratio chip in the hero**

Replace lines 63–67:

```tsx
          {data.deadline_human && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <CalendarClock className="h-3.5 w-3.5" /> {data.deadline_human}
            </span>
          )}
```

with:

```tsx
          {data.deadline_human && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <CalendarClock className="h-3.5 w-3.5" /> {data.deadline_human}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            {formatEstimateRatio(minutesDone, minutesTotal)} done
          </span>
```

- [ ] **Step 7: Typecheck both apps**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && cd ../frontend-web && npx tsc --noEmit -p tsconfig.json`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-web/src/pages/ProjectDetail.tsx frontend/src/pages/ProjectDetailScreen.tsx
git commit -m "feat(web,mobile): estimated-minutes ratio on project detail"
```

---

### Task 6: Home / Today ring (web + mobile)

**Files:**
- Modify: `frontend/src/pages/Today.tsx` (import 32; ring calc 150–152; hero line 231–235)
- Modify: `frontend-web/src/pages/Today.tsx` (import 9; pct calc 99–102; hero stat line 128)

**Interfaces:**
- Consumes: `formatEstimateRatio` (Task 1); `counts.completed_minutes_today` + `due_today` / `overdue` arrays' `estimated` (already in `Dashboard` type).

- [ ] **Step 1: mobile — import helper**

Change `frontend/src/pages/Today.tsx` line 32:

```tsx
import { byDeadlineAsc, byDeadlineDesc, formatEstimate } from '@/lib/format'
```

to:

```tsx
import { byDeadlineAsc, byDeadlineDesc, formatEstimate, formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 2: mobile — minutes-based ring**

Replace lines 150–152:

```tsx
  // Today progress ring
  const todayTotal = data ? data.counts.completed_today + data.counts.overdue + data.counts.due_today : 0
  const pct = todayTotal ? data!.counts.completed_today / todayTotal : 1
```

with:

```tsx
  // Today progress ring — minutes done vs planned (completed + due-today + overdue estimates).
  const completedMin = data?.counts.completed_minutes_today ?? 0
  const dueMin = data ? data.due_today.reduce((s, t) => s + (t.estimated || 0), 0) : 0
  const overdueMin = data ? data.overdue.reduce((s, t) => s + (t.estimated || 0), 0) : 0
  const todayTotalMin = completedMin + dueMin + overdueMin
  const pct = todayTotalMin ? completedMin / todayTotalMin : 1
```

- [ ] **Step 3: mobile — hero shows the ratio**

Replace lines 231–235:

```tsx
                  {data.counts.completed_minutes_today > 0 && (
                    <p className="text-xs font-medium text-brand-200">
                      {formatEstimate(data.counts.completed_minutes_today)} completed today
                    </p>
                  )}
```

with:

```tsx
                  {todayTotalMin > 0 && (
                    <p className="text-xs font-medium text-brand-200">
                      {formatEstimateRatio(completedMin, todayTotalMin)} done
                    </p>
                  )}
```

- [ ] **Step 4: web — import helper**

Change `frontend-web/src/pages/Today.tsx` line 9:

```tsx
import { formatNumber, formatEstimate } from '@/lib/format'
```

to:

```tsx
import { formatNumber, formatEstimate, formatEstimateRatio } from '@/lib/format'
```

(If `formatEstimate` becomes unused after Step 6, drop it from this import to keep the build clean — re-run typecheck to confirm.)

- [ ] **Step 5: web — minutes-based pct**

Replace lines 99–102:

```tsx
  const counts = dash.data.counts
  const donePct = counts.completed_today + counts.due_today > 0
    ? Math.round((counts.completed_today / (counts.completed_today + counts.due_today)) * 100)
    : 0
```

with:

```tsx
  const counts = dash.data.counts
  const completedMin = counts.completed_minutes_today
  const dueMin = dash.data.due_today.reduce((s, t) => s + (t.estimated || 0), 0)
  const todayTotalMin = completedMin + dueMin
  const donePct = todayTotalMin > 0 ? Math.round((completedMin / todayTotalMin) * 100) : 0
```

- [ ] **Step 6: web — hero stat shows the ratio**

Replace line 128:

```tsx
              <div><span className="font-semibold">{formatEstimate(counts.completed_minutes_today)}</span> done today</div>
```

with:

```tsx
              <div><span className="font-semibold">{formatEstimateRatio(completedMin, todayTotalMin)}</span> done today</div>
```

- [ ] **Step 7: Typecheck both apps**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && cd ../frontend-web && npx tsc --noEmit -p tsconfig.json`
Expected: both exit 0 (no unused-import error from Step 4/6).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Today.tsx frontend-web/src/pages/Today.tsx
git commit -m "feat(web,mobile): minutes-driven Today progress ring"
```

---

### Task 7: Calendar per-day minutes (shared)

**Files:**
- Modify: `frontend/src/components/CalendarView.tsx` (add import; day sheet totals after 113; per-cell calc after 221; cell footer after 265; sheet header 293–294; `minutesForDay` helper after 323)

**Interfaces:**
- Consumes: `formatEstimateRatio` (Task 1); `ProjectItem.allocations` / `.estimated` / `.status_key` (existing).
- Produces: `minutesForDay(t, dayKey, split)` (module-local).

- [ ] **Step 1: Import the helper**

After the existing imports (after line 8, `import type { ProjectItem } ...`), add:

```tsx
import { formatEstimateRatio } from '@/lib/format'
```

- [ ] **Step 2: Add the `minutesForDay` helper**

After the `daysFor` function (after line 323), add:

```tsx
// Minutes a todo contributes to one calendar day, matching how daysFor buckets it:
// the allocation slice for that day when Split is on, otherwise its whole estimate.
function minutesForDay(t: ProjectItem, dayKey: string, split: boolean): number {
  if (split) {
    const slice = (t.allocations ?? []).filter((a) => a.date === dayKey)
    if (slice.length) return slice.reduce((s, a) => s + (a.minutes || 0), 0)
  }
  return t.estimated || 0
}
```

- [ ] **Step 3: Compute the open-day totals**

After line 113 (`const dayTodos = openDay ? byDay.get(openDay) ?? [] : []`), add:

```tsx
  const dayMinTotal = openDay ? dayTodos.reduce((s, t) => s + minutesForDay(t, openDay, split), 0) : 0
  const dayMinDone = openDay
    ? dayTodos.filter((t) => t.status_key === 'completed').reduce((s, t) => s + minutesForDay(t, openDay, split), 0)
    : 0
```

- [ ] **Step 4: Compute per-cell minutes**

Replace line 221:

```tsx
              const items = byDay.get(c.key) ?? []
```

with:

```tsx
              const items = byDay.get(c.key) ?? []
              const cellTotalMin = items.reduce((s, t) => s + minutesForDay(t, c.key, split), 0)
              const cellDoneMin = items
                .filter((t) => t.status_key === 'completed')
                .reduce((s, t) => s + minutesForDay(t, c.key, split), 0)
```

- [ ] **Step 5: Render the cell footer**

Replace lines 263–266 (the `+N more` block and the closing `</div>` of the chip column):

```tsx
                    {items.length > 3 && (
                      <span className="px-1 text-[9px] font-medium text-slate-400">+{items.length - 3} more</span>
                    )}
                  </div>
```

with:

```tsx
                    {items.length > 3 && (
                      <span className="px-1 text-[9px] font-medium text-slate-400">+{items.length - 3} more</span>
                    )}
                  </div>
                  {cellTotalMin > 0 && (
                    <span className="mt-auto pt-0.5 text-[9px] font-semibold leading-none text-slate-400 dark:text-slate-500">
                      {formatEstimateRatio(cellDoneMin, cellTotalMin)}
                    </span>
                  )}
```

- [ ] **Step 6: Show the day total in the sheet header**

Replace lines 293–294:

```tsx
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{humanDay(openDay)}</h3>
```

with:

```tsx
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{humanDay(openDay)}</h3>
                {dayMinTotal > 0 && (
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {formatEstimateRatio(dayMinDone, dayMinTotal)} estimated
                  </p>
                )}
              </div>
```

- [ ] **Step 7: Typecheck both apps**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && cd ../frontend-web && npx tsc --noEmit -p tsconfig.json`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/CalendarView.tsx
git commit -m "feat(web,mobile): per-day estimated-minutes on the calendar"
```

---

### Task 8: Build, deploy, smoke

**Files:**
- Build artifacts under `vernon_project/public/` (committed, matching the repo's existing "build: … assets" commits).

**Interfaces:** none (deploy step).

- [ ] **Step 1: Build both frontends**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed, assets emitted.

- [ ] **Step 2: Restart Python (no migrate — no schema change)**

```bash
cd /home/frappe/frappe-bench && bench restart
```

- [ ] **Step 3: Manual smoke (live site project.vernon.id)**

Verify each surface shows the minutes ratio and the bars track minutes:
- Calendar: day cells show `Xh / Yh` footer; Split toggle changes per-day numbers; day sheet header shows the day total.
- Home/Today: ring % reflects completed vs planned **minutes**; hero shows `… done` ratio (web + mobile).
- Projects list: card shows `2h 30m / 8h` beside `X/Y todos`; bar tracks minutes.
- Project: hero + each detail card show the ratio; project bar tracks minutes.
- Project Detail: stat/chip shows the detail's `done/total` minutes.
- Fallback: a project whose todos have no estimates still shows a non-zero bar (count fallback) and `0m / 0m`… → confirm it reads count-based % (not stuck at 0).

- [ ] **Step 4: Commit built assets**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A
git commit -m "build: estimated-minutes progress assets"
```

---

## Self-Review

**Spec coverage:**
- Core formula + done=Completed + fallback → Task 1 (`progressPct`), Task 2 (`_pct_minutes`). ✓
- Human format reuse `formatEstimate` → Task 1 (`formatEstimateRatio`). ✓
- Calendar daily-allocation split → Task 7 (`minutesForDay` respects `split`). ✓
- Cards show both → Tasks 3, 4 (ratio + `X/Y todos`). ✓
- Backend get_projects / get_project / get_project_detail / dashboard → Task 2 (first three; dashboard needs no change, denominators summed client-side in Task 6). ✓
- Each page (calendar/home/projects/project/detail) → Tasks 7/6/3/4/5. ✓
- Kept count-based classifiers (`isDetailCompleted`, list grouping) → untouched in Tasks 4/5. ✓
- Types → Task 2 Step 7. ✓

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `minutes_done` / `minutes_total` named identically across `_pct_minutes` args, `ProjectCard`, `ProjectDetailSummary`, and all `reduce` accessors. `formatEstimateRatio(done, total)` and `progressPct(mDone, mTotal, cDone, cTotal)` signatures match every call site. `minutesForDay(t, dayKey, split)` matches both call sites in Task 7.
