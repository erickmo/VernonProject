# Focus timer: backend persistence, realtime sync, permanent per-task note

**Date:** 2026-07-14
**Frontends:** both `/w` (frontend-web) and `/m` (frontend). Shared store `@/hooks/useFocusTimer.ts`.

## Goal

Two asks: (1) a focus note per task that **persists permanently**, and (2) **link focus timers across web and mobile** (start/pause/note on one device shows on the other). Both require moving focus state from localStorage-only to backend, plus realtime push.

## Backend

### Doctype `Focus Timer`
`vernon_project/vernon_project/doctype/focus_timer/` — one row per (user, task).

Fields: `user` (Link User, reqd), `task` (Link Project Todo, reqd), `task_title` (Data), `estimated_ms` (Float), `status` (Select: `running`/`paused`/`idle`), `started_at` (Datetime), `elapsed_before_ms` (Float), `note` (Long Text), `meta` (Long Text — JSON blob for overlay chips). `autoname: hash`.

- **Lifecycle:** active timer = status `running`|`paused`. **Stop** sets status `idle`, zeroes timer fields; the row is **kept iff `note` is non-empty** (that's the permanent note) else deleted. So a task's note survives across sessions/devices and reappears whenever the task is focused again.
- **Permissions:** users see only their own rows — enforced in the API (filter by `user = frappe.session.user`), not via row-level perms. Doctype perms: System Manager full; no public read.

### `api/focus.py` (whitelisted)
- `list_focus()` → all rows for `frappe.session.user` (active + noted), shaped for the store.
- `start(task, task_title, estimated_minutes, meta)` — upsert running row (started_at=now, elapsed_before_ms=0). No-op if already active.
- `pause(task)`, `resume(task)`, `reset(task)`, `stop(task)`, `set_note(task, note)`.
- Every mutation: write, then `frappe.publish_realtime('focus_sync', {"user": user}, user=user, after_commit=True)`.
- A helper `_row(task)` gets-or-creates the (user, task) row.

## Frontend

### Store (`@/hooks/useFocusTimer.ts`)
Backend-backed, keeps the existing module-store + `useSyncExternalStore` shape and wall-clock math (start time + elapsed) so UI code is unchanged.

- **Hydrate:** on first load call `listFocus()` → map rows to `FocusTimer[]` (+ a `notes: Record<task, string>` map). localStorage stays as an offline cache for instant first paint.
- **Mutators** (start/pause/resume/reset/stop/setNote): optimistic local update + localStorage write + fire the matching backend call. On error, refetch to reconcile.
- **Note:** add `note` to the store surface. `setNote(task, note)` is debounced (~600ms) before hitting `set_note`.
- **Realtime:** `@/lib/focusRealtime.ts` — `socket.io-client` connects to `/socket.io` (Frappe socketio, same origin, cookie auth) with the Frappe handshake, joins the user room, listens for `focus_sync` → triggers `listFocus()` refetch + merge.
- **Poll backstop:** refetch on `visibilitychange`→visible, window `focus`, and a 60s interval — covers a dropped socket / Cloudflare WS block.

### API client (`@/lib/api.ts`)
Add `listFocus`, `focusStart/Pause/Resume/Reset/Stop`, `focusSetNote` over the existing `request()` helper.

### Note UI
Focus overlay in both frontends (`frontend-web/src/components/FocusOverlay.tsx` + the mobile overlay) gets a **Note** textarea bound to the focused task's permanent note; edits debounce-save and sync to the other device. Visible even when the timer is idle (focusing a task shows its saved note).

### New dependency
`socket.io-client` in both `frontend/` and `frontend-web/` (Frappe socketio is socket.io v4). No lighter path exists for Frappe realtime.

## Deploy
`npm i socket.io-client` (both) → `bench --site … migrate` (new doctype) → `sudo /usr/local/bin/tj-restart` (Python) → build both frontends. Cloudflare must pass websockets on `/socket.io`; if it doesn't, the poll backstop keeps sync working (just not instant).

## Out of scope
Multi-note per task, note history, sharing a note between users (note is personal/per-user), focus analytics.
