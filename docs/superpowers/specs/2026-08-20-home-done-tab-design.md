# Home "Done" tab — recently completed todos

## Problem

Home dashboard (`/` mobile, `/` web) has a Plan/Deadline/Waiting axis tab bar for "your work." There's no way to see what you just finished — a todo leaves the Plan/Deadline view the moment it's marked Done and never comes back into any Home list. User wants a 4th tab: **Done**, listing todos they recently completed.

## Scope

- **Whose todos:** assigned to me only (`assigned_to == session user`). Mirrors the framing of Plan/Deadline/Waiting, which are all "my work," and mirrors the existing `completed_today` aggregate query (same `assigned_to` filter).
- **Which status counts as "done":** final `✅ Completed` (`STATUS_COMPLETED`, `status_key: 'completed'`) — the same state Home already counts in `counts.completed_today` / `completed_minutes_today` and labels "Done today" (web Queues tile) / "X done today" (mobile spotlight). Not the intermediate `🟠 Done` status (that's "submitted, awaiting review," shown elsewhere as "Done" internally but not the assignee-facing meaning of "I finished this").
- **How many / how far back:** last 30 completed, sorted newest-first, no date cutoff. Simplest query; always shows something even for a light week. Not paginated (YAGNI — 30 is plenty for "recently").
- **No undo, no quick-action on the row.** The existing undo (`UndoProvider`, `useUndoApproval`) is scoped to Leader/Owner *approval* reversal (`tested_by`/`completed_by` == current user, on Checked/Completed statuses) — a different actor and a different action from "I, the assignee, marked my own todo done." Self-undo-my-done is a separate feature, not requested here.

## Backend

New whitelisted function `get_recently_done(limit=30)` in `vernon_project/api/project_todo.py`, placed next to `get_my_approvals` (same file — the established location for "personal todo history" endpoints; keeps the already-6756-line `mobile.py` from growing further).

Pattern — identical shape to `get_my_approvals` (fetch broad, filter in Python, shape, sort, return), just a different filter and no time cutoff:

```python
@frappe.whitelist()
def get_recently_done(limit=30):
    """The current user's own recently-completed todos (assignee's Done list),
    newest completed_at first, capped at `limit`. Powers the Home 'Done' tab."""
    from vernon_project.api.mobile import (
        STATUS_COMPLETED,
        _admins_by_project, _allocations_map, _fetch_todos,
        _shape_todo, _user_name_map, _visible_projects,
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
```

No new SQL, no new doctype field, no permission changes — reuses `completed_at` (already selected by `_fetch_todos`) and `pretty_date` (already the humanizer for every other `*_human` field in `_shape_todo`). Scoping rides the same `_visible_projects()` gate every sibling endpoint uses.

## Frontend — shared (`frontend/src`, imported by both platforms)

- **`lib/api.ts`**: add `recentlyDone: (limit = 30) => call('vernon_project.api.project_todo.get_recently_done', { limit })`, alongside the existing `myApprovals` entry.
- **`hooks/useData.ts`**: add `keys.recentlyDone = ['recently-done'] as const` and `useRecentlyDone = () => useQuery({ queryKey: keys.recentlyDone, queryFn: () => api.recentlyDone() })`.
- **`components/TodoCard.tsx`**: add one new optional prop `doneAt?: string | null`. When set, render a small line (near the status pill) showing `✅ {doneAt}`. Deliberately *not* added to the `ProjectItem` type — only the Done tab's caller passes it, keeping the shared type from growing for a single-consumer field.

## Frontend — both pages (mirrors the existing Plan/Deadline/Waiting axis exactly)

Applies identically to `frontend/src/pages/Today.tsx` (mobile) and `frontend-web/src/pages/Home.tsx` (web):

- `type Axis = 'plan' | 'deadline' | 'waiting' | 'done'`
- `const { data: doneTodos } = useRecentlyDone()` (default `[]`)
- Tab bar (`PillTabs` mobile / `Segmented` web) gets a 4th entry: `{ key: 'done', label: 'Done', count: doneTodos.length }`. No sub-tabs for Done — same treatment as Waiting (flat recency list, not grouped).
- `axis === 'done'` branch: same non-swipe rendering as Waiting — `renderList(doneTodos, 'Nothing done yet', false)` (mobile) / `renderList(doneList, 'Nothing done yet', 'Nothing completed recently.')` (web) — each card gets `doneAt={t.done_at_human}` passed through to `TodoCard`.
- Empty state reuses the existing `EmptyState` component, consistent tone with the other axes.

## Not doing (explicitly out of scope)

- No undo / quick-action on Done rows.
- No date-range picker or pagination — flat top-30.
- No new doctype field or migration.
- No changes to `get_dashboard` — Done is a separate query, not folded into the existing Planned-only dashboard payload (keeps that endpoint's "skip the completed backlog" perf property intact).

## Verification

Live site, no test DB (per project convention — code-first, defer tests to end). Post-deploy smoke check: one `bench console` call to `get_recently_done` as a real user with completed todos, confirm list shape (`done_at`/`done_at_human` populated, capped at 30, newest first).

## What's New

After shipping (build both bundles + live): add an `App Release` row — "Tab Done baru di Home — lihat daftar tugas yang baru saja kamu selesaikan" (platform: Both).
