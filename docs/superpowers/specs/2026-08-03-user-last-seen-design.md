# User "Last Seen" — feature + report

**Date:** 2026-08-03
**Status:** Approved design, pre-plan

## Goal

Let admins and team leaders see when each user was last active ("last seen"),
both inline (user dashboard + people lists) and as a dedicated report. Surface
a live "Online now" / "last seen 2h ago" presence label everywhere a person is
shown in those places.

## Data source — no new tracking

Frappe already writes `User.last_active` on session activity
(`frappe/sessions.py` `Session.update`). "Last seen" **is** `User.last_active`.
No heartbeat, no websocket, no new field for the timestamp.

**Calibration knob (important).** That DB write is throttled:
`threshold = min(get_expiry_in_seconds() / 2, 600) or 600` — with the default
multi-day session expiry this caps at **600s = 10 minutes**. So `last_active`
is only guaranteed fresh to within ~10 minutes. Consequences:

- The "online" window must be **> 10 min** or it flickers false-offline for
  active users. Default **15 minutes**, configurable (see Settings).
- This app polls continuously (real-time reads, `staleTime:0`), so an
  active user keeps generating requests → `last_active` stays within the cap.
  A closed tab stops updating — which is exactly correct "last seen" semantics.

## Presence model — shared logic

New `frontend/src/lib/presence.ts` (imported by both frontends as `@`):

```ts
export interface Presence { online: boolean; label: string }
// lastActive: ISO string | null; onlineWindowMin: minutes from settings
export function presenceOf(lastActive: string | null, onlineWindowMin: number): Presence
```

- `null` → `{ online: false, label: "Never signed in" }`
- within window → `{ online: true, label: "Online now" }`
- else → `{ online: false, label: "last seen " + ago }` where `ago` is a
  compact relative string (`just now`, `5m ago`, `2h ago`, `3d ago`, `Jul 12`).

This is the only relative-"ago" formatter the codebase needs; no existing one
in `lib/format.ts`. Keep it in `presence.ts`.

Ships with a self-check (`presence` `__tests__` or inline assert demo):
online boundary at the window edge, null case, each `ago` bucket.

## Backend — `vernon_project/api/report.py`

### `last_seen_report()` (whitelist, GET)

Returns rows ordered **stalest-first** (nulls first, then oldest `last_active`):

```
[{ user, full_name, user_image, member_type, enabled, last_active }]
```

Scope by caller:

- **System Manager** → all users (`enabled` + disabled), excluding
  `PROTECTED_USERS` (same exclusion `list_users` uses).
- **Team leader** → users who appear on `Project Team` of any project the
  caller owns / leads / admins, plus the caller themselves. Reuses the existing
  `_runs_project(user, project_row)` predicate + `get_project_admins`.
- **Neither** → `frappe.PermissionError`.

Implementation note: compute the leader's project set once
(projects where `project_owner == me` OR `project_leader == me` OR
`me in get_project_admins(project)`), then `Project Team.user` where
`parent in that set`, unioned with `{me}`.

### `last_seen_access()` (whitelist, GET)

`{ can: bool, scope: "all" | "team" | "none" }` — lets the Reports catalog show
the tile only to users who can open it (mirrors `daily_estimated_time_access`).

Both endpoints are new whitelisted methods → run `scripts/gen_docs.py`.

## Report screen — bespoke, both frontends

Not the generic Script-Report engine (`run_report`): that engine is built
around project/person/daterange/status filters this report doesn't have. Follow
the **bespoke** pattern already used by Todos Due and Logbook.

- Route `/reports/last-seen` on both `frontend/` (mobile) and `frontend-web/`.
- Registered in the `BESPOKE` tile list in each `Reports.tsx`, gated on
  `last_seen_access().can`.
- Row: avatar, full name, member type, presence dot (green = online) + label.
  Stalest-first. Mobile = Soft-Pop card list; web = DataTable / card list per
  that frontend's convention.
- New hook `useLastSeenReport()` + `useLastSeenAccess()` in `hooks/useData.ts`;
  client methods in `lib/api.ts`.

## Inline feature surfaces — both frontends

1. **User dashboard `/users/:name`** (`ProjectDetailPane`/user dashboard page,
   both frontends) — presence line near the header ("Online now" / "last seen
   …"). The dashboard is already System-Manager-gated; gating unchanged. Reads
   `last_active` already present in the user payload (or adds it if absent).

2. **People / team lists** — TeamManager drawer (`/w`) + sheet (`/m`) and any
   member list that renders user rows: small presence dot + relative label on
   each row. Add `last_active` to the feeding payload where missing.

All surfaces compute presence via `presenceOf(...)` + the settings window.

## Settings — configurable online window

- New field `online_window_minutes` (Int, default **15**) on **Vernon
  Settings** (existing Single doctype — no new doctype).
- Exposed in `boot.settings` so the frontends compute presence client-side.
- Editable in both Settings UIs (mobile `SettingsScreen`, web `Settings`),
  under an admin section, with help text: "Users active within this many
  minutes show as Online. Keep ≥ 10 — the server records activity at most once
  every ~10 minutes, so lower values flicker."

## Docs + What's New

- New endpoints → `python3 scripts/gen_docs.py`, commit regenerated
  `docs/assets/data.js`. No new DocType (Settings field only).
- After it actually ships (bundles rebuilt / live): one **App Release** row —
  Bahasa, `platform: Both`, `published: 1`, semver-bumped from the newest row,
  one bullet per line. Announces: see when teammates were last active, on the
  report and on people lists.

## Testing

- **Backend** (`vernon_project/api/test_report.py`):
  - SysMgr → sees all users.
  - Leader → sees only users on their projects + self; not unrelated users.
  - Outsider (no SysMgr, no led project) → `PermissionError`.
  - Ordering stalest-first (null before oldest before newest).
- **Frontend**: `presence.ts` self-check (window boundary, null, each `ago`
  bucket).

## Explicitly out of scope (YAGNI)

- Real-time heartbeat / websocket presence — `last_active` + existing polling
  is enough; revisit only if sub-10-min accuracy is ever required (blocked by
  the server throttle anyway).
- Presence badge on every avatar app-wide — only the dashboard, people lists,
  and the report get it.
- Per-user "hide my presence" privacy toggle — add if requested.
