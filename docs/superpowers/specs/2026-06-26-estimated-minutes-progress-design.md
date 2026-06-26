# Estimated-minutes progress everywhere

**Date:** 2026-06-26
**Status:** Approved (design) — pending implementation plan

## Goal

Show `[estimated minutes done] / [total estimated minutes]` on every surface that
tracks work progress (calendar day, home/today, projects list, project, project
detail), and **drive the progress bars/rings off minutes instead of todo counts.**

## Decisions (locked)

1. **"Done" numerator** = only `✅ Completed` todos (matches existing progress
   logic). Done / Checked still count as remaining.
2. **Display format** = human, via the existing `formatEstimate(minutes)`
   helper → `2h 30m`, `1h`, `45m`. A ratio reads `2h 30m / 8h`.
3. **Calendar per-day basis** = daily allocation slice when the Split toggle is
   on; otherwise the whole todo `estimated` lands on its active date field.
   (Mirrors how the calendar already buckets todos onto days.)
4. **Cards keep the todo count** — minutes ratio is shown *alongside* the
   existing `X/Y todos`, not replacing it.
5. **Zero-estimate fallback** — when a scope's total estimate is `0` (todos
   without estimates), progress falls back to **count-based %** so old/unestimated
   projects don't read 0%. The minutes text shows `0m` for the numerator.

## Core formula

```
progress% = total_minutes > 0
            ? round(done_minutes / total_minutes * 100)
            : round(done_count   / total_count   * 100)   # fallback
done_minutes  = Σ estimated where status == ✅ Completed
total_minutes = Σ estimated where status != 🚫 Cancelled
```

`estimated` is the `Project Todo.estimated` field (Int, minutes). Already shaped
into every todo payload as `estimated`, with per-day `allocations: [{date,
minutes}]`.

## Shared frontend helpers

Both apps share `frontend/src/lib/format.ts` (web aliases `@/*` →
`../frontend/src/*`). Add:

```ts
// "2h 30m / 8h" — 0 done renders "0m" (not the em-dash formatEstimate gives).
export function formatEstimateRatio(done: number, total: number): string {
  return `${done ? formatEstimate(done) : '0m'} / ${formatEstimate(total)}`
}

// Minutes-based progress %, count fallback when no estimates exist.
export function progressPct(mDone: number, mTotal: number, cDone: number, cTotal: number): number {
  if (mTotal > 0) return Math.round((mDone / mTotal) * 100)
  return cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0
}
```

## Backend changes — `vernon_project/api/mobile.py`

A small Python sibling of the fallback formula (used where the backend already
emits a single `progress` number):

```python
def _pct_minutes(m_done, m_total, c_done, c_total):
    if m_total:
        return round(m_done / m_total * 100)
    return round(c_done / c_total * 100) if c_total else 0
```

1. **`get_projects`** (per-project stats loop): accumulate
   `s["minutes_total"] += est`, and `s["minutes_done"] += est` when
   `skey == "completed"`. Emit `p["minutes_done"]`, `p["minutes_total"]`, and set
   `p["progress"] = _pct_minutes(...)`.

2. **`get_project`** (per work-item / Project Detail rollup): seed
   `minutes_total`/`minutes_done` = 0 in both item-dict initializers; accumulate
   in the rows loop; set `wi["progress"] = _pct_minutes(...)` and emit the minute
   fields on each item.

3. **`get_project_detail`**: add `estimated` to `_shape_item_row` so the detail
   screen can sum its own todos. (Optionally also emit detail-level
   `minutes_done`/`minutes_total`, but summing client-side from `project_items`
   keeps one source of truth — prefer client-side.)

4. **`get_dashboard`**: no backend change. `completed_minutes_today` already
   emitted; the `overdue` / `due_today` / `upcoming` arrays already carry
   `estimated` per todo, so the client sums denominators itself.

## TypeScript types — `frontend/src/lib/types.ts`

- `ProjectCard`: add `minutes_done: number`, `minutes_total: number`.
- `ProjectDetailSummary`: add `minutes_done: number`, `minutes_total: number`.
- `ProjectItem` already has `estimated`. (`_shape_item_row` rows are typed via
  the item-row shape used by the detail screen — add `estimated` there too.)

## Per-page UI changes

| Page | File(s) | Change |
|---|---|---|
| **Calendar** | `frontend/src/components/CalendarView.tsx` (shared) | Per day cell: a `[9px]` footer `formatEstimateRatio(doneMin, totalMin)`, shown only when `totalMin > 0`. Day-detail sheet header: append the day total. Per-day minutes via a `minutesForDay(t, dayKey, field, split)` helper — allocation slice when `split`, else full `estimated`; done counts only `status_key === 'completed'`. |
| **Home / Today** | `frontend/src/pages/Today.tsx` (mobile), `frontend-web/src/pages/Today.tsx` (web) | Ring `pct` from minutes: `completed_minutes_today / (completed_minutes_today + Σ estimated of due_today + Σ estimated of overdue)` (web denominator keeps its current `completed + due` bucketing; mobile keeps `completed + overdue + due`). Hero: show `formatEstimateRatio(...)` ratio; keep the existing count line. |
| **Projects list** | `frontend/src/components/ProjectCard.tsx` (shared) | Bar still uses `p.progress` (now minutes-based from backend). Add `formatEstimateRatio(p.minutes_done, p.minutes_total)` alongside `{item_done}/{item_total} todos`. |
| **Project** | `frontend-web/src/pages/Project.tsx`, `frontend/src/pages/ProjectScreen.tsx` | Project-level progress: sum `minutes_done`/`minutes_total` (and `done`/`total`) across `project_details`, compute via `progressPct(...)`. Hero + each detail card: detail bar uses `w.progress` (backend), add `formatEstimateRatio(w.minutes_done, w.minutes_total)` beside `{w.done}/{w.total}`. |
| **Project Detail** | `frontend-web/src/pages/ProjectDetail.tsx`, `frontend/src/pages/ProjectDetailScreen.tsx` | Compute `doneMin`/`totalMin` from `project_items[].estimated` (done = `status_key === 'completed'`, exclude cancelled). Show `formatEstimateRatio` in the stat/header beside open/completed counts. |

## Kept count-based (intentionally)

- The "detail is completed" classifier `total > 0 && done === total` (web/mobile
  Project) and the open/completed **list grouping** stay count-based. Only the
  progress bars/rings/ratios switch to minutes. Both agree at 100%.

## Out of scope

- No DocType / schema change. No new dependency.
- No change to point scoring, allocation editing, or the max-estimated-minutes
  setting.

## Testing

Per project convention (live site, code-first, tests deferred to final phase):
a runnable check on the two pure helpers (`formatEstimateRatio`, `progressPct`)
covering the zero-estimate fallback and the `0m` numerator. Manual smoke on each
page after deploy (migrate not needed — no schema; `bench restart` for the
Python API, `npm build` for the two frontends).
