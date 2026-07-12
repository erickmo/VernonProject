# App Update Log + Update-Available Popup — Design

**Date:** 2026-07-12
**Scope:** Both frontends — mobile `/m` (PWA, `frontend/`) and web `/w` (`frontend-web/`).

## Goal

When a newer build of the app is deployed while a user has the app open:

1. Detect it client-side.
2. Show a persistent **update-available popup** (banner) with an **Update now** button that reloads into the latest version.
3. Surface it as an entry in the notification list / sheet.
4. Provide a **What's New** screen listing release notes, editable by admins.
5. After a user updates, **auto-open What's New once** so they see what changed.

## Key architectural decision: detection and content are separate

- **Detection** = a build-stamped `version.json`, polled by the running app. It is the *reliable* signal — it changes on every deploy regardless of whether anyone wrote release notes.
- **Content** = the admin-editable `App Release` doctype — *best-effort*. If notes are missing for a version, detection still fires and the popup shows a generic message.

Coupling the two (e.g. "compare the latest doctype version string") was rejected: a forgotten release-notes row would silently break update detection.

Also rejected: the standard service-worker "waiting worker" prompt. The current SW (`frontend/sw-custom.js`) calls `self.skipWaiting()` on install and `clients.claim()` on activate, so it activates immediately — there is no `waiting` worker to hook. Polling `version.json` is the mechanism that works uniformly on `/m` (with SW) and `/w` (no SW).

---

## Components

### 1. Build stamp — `version.json` + `__BUILD_ID__`

Both `vite.config.ts` files:

- Add `define: { __BUILD_ID__: JSON.stringify(buildId), __APP_VERSION__: JSON.stringify(pkg.version) }`.
  - `buildId` = `execSync('git rev-parse --short HEAD')`, falling back to `String(Date.now())` if git is unavailable. Computed once in the config, so the baked constant and the emitted file always match.
- Add an inline plugin (`closeBundle` hook) that writes `version.json = { "buildId": <buildId>, "version": <pkg.version> }` into the build `outDir`.
- Declare `__BUILD_ID__` / `__APP_VERSION__` in a `global.d.ts` (or existing `vite-env.d.ts`) for TypeScript.

Served at:
- `/assets/vernon_project/frontend/version.json` (mobile)
- `/assets/vernon_project/frontend_web/version.json` (web)

**Service-worker cache guard (`/m` only):** `sw-custom.js` cache-firsts everything under `ASSET_PREFIX`, which would serve a stale `version.json`. Add a guard in the `fetch` handler: any request whose pathname ends with `version.json` is passed straight to the network (never cached). Bump `ASSET_CACHE` `vernon-assets-v9` → `v10` so the updated SW installs on existing clients. The poll also appends `?_=<timestamp>` as a second layer of cache-busting (defeats HTTP/CDN caches on both frontends).

### 2. Detection hook — `useAppUpdate()` (shared, `frontend/src/lib/appUpdate.ts` + `frontend/src/hooks`)

A module singleton + a React hook (via `useSyncExternalStore`, no new dependency):

- Reads the baked `__BUILD_ID__`.
- Polls `version.json?_=<ts>` (`cache: 'no-store'`) every ~2 minutes and on `window` focus / `visibilitychange`.
- When `fetched.buildId !== __BUILD_ID__`: sets `updateAvailable = true` and stores `latestVersion = fetched.version`. Never flips back to false on its own.
- Exposes:
  - `updateAvailable: boolean`
  - `latestVersion: string | null`
  - `applyUpdate(): void` → `window.location.reload()`. One line: the shell is served no-cache (`m.py`/`w.py` set `no_cache`) and network-first in the SW, and assets are content-hashed, so a plain reload fetches the new shell → new hashed asset URLs → fresh app. No SW-message dance needed.
- Failures (offline, non-200) are swallowed — polling simply retries next tick.

**Auto-open-after-update** lives here too: on first load, compare `localStorage['vernon-last-build']` to `__BUILD_ID__`.
- No stored value (fresh install) → store current, do nothing.
- Stored value present and different → the build changed since last visit → signal "just updated" (consumed once by the shell to navigate to `/whats-new`), then store current.
- Equal → nothing.

### 3. The popup — `UpdateBanner` (×2: mobile + web)

A component mounted once per shell (mobile: beside `Fab`/`FocusOverlay` in `main.tsx`; web: in `AppShell`/`TopNav`). Renders nothing unless `updateAvailable`.

Persistent bottom banner (not a modal, not an auto-dismiss toast):

- **Update now** → `applyUpdate()`
- **What's new** → navigate to `/whats-new`
- **Dismiss** → hides the banner for this session; the notification entry (below) remains.

Styling: mobile = Soft-Pop card tokens (`rounded-2xl`, `bg-paper-card`, `shadow-card`, brand accent); web = flat-Notion tokens (`surface`, `ink`, `line`, `Button`).

Rejected: `useConfirm` modal (interrupts work) and `useToast` (auto-dismisses in 3.8s, no time to click Update).

### 4. Notification entry — client-side synthetic row

The update entry is **local**, driven by `useAppUpdate()` — not a server-created Vernon Notification. Rationale: detection is inherently per-device, so a per-user server fan-out (a row for every user on every deploy) would be heavy, spammy, and inconsistent. The synthetic row is naturally correct: it appears on the device that detected the update and disappears after the reload (buildId then matches).

- **Mobile** (`NotificationsScreen.tsx`): when `updateAvailable`, prepend a synthetic item ("Update available — tap to reload"). Tapping calls `applyUpdate()`.
- **Web** (`NotificationSheet.tsx`): same, prepended into the drawer list.
- **Badge**: the bell unread badge shows `serverUnread + (updateAvailable ? 1 : 0)` on both frontends.

The synthetic item is rendered inline (its own small branch), not merged into the server `['notifications']` query cache — keeping the shared hook untouched.

### 5. Changelog source — `App Release` doctype + API

**Doctype `App Release`** (`vernon_project/vernon_project/doctype/app_release/`), modeled on `Vernon Event`:

| field | type | notes |
|---|---|---|
| `version` | Data | e.g. `1.4.0` |
| `release_date` | Date | |
| `title` | Data | short headline |
| `notes` | Text | one bullet per line (no child table) |
| `platform` | Select | `Both` / `Mobile` / `Web` (default `Both`) |
| `published` | Check | draft vs live |

- `autoname: hash`, `module: Vernon Project`, `sort_field: release_date`, `sort_order: DESC`.
- Permissions: single `System Manager` block (read/write/create/delete). Admins edit in Frappe Desk (`/app/app-release`) — no custom admin UI.

**API** (`vernon_project/vernon_project/api/app_release.py`):

- `@frappe.whitelist()` `get_app_releases(platform=None)` — requires a logged-in session (no `allow_guest`). Returns published rows via `frappe.get_all("App Release", filters={"published": 1, ...platform...}, fields=[version, release_date, title, notes, platform], order_by="release_date desc")`. When `platform` is given, filter to rows whose platform is `Both` or that platform.

No `hooks.py` change required (plain admin doctype, no fixtures in this app).

### 6. "What's New" screen — `WhatsNew` page (×2)

Shared hook `useAppReleases(platform)` (React Query) → new `api.getAppReleases` call.

- **Mobile** (`frontend/src/pages/WhatsNew.tsx`): `DetailScreen` wrapper, list of release cards (version + date + title + bulleted `notes`), empty/loading states from `@/components/ui`. Route `/whats-new` added to `App.tsx` before the `*` catch-all. Pass `platform="Mobile"`.
- **Web** (`frontend-web/src/pages/WhatsNew.tsx`): `Page` + `PageHeader` + `Section` list. Route added to `App.tsx`; a `NavLeaf` ("What's New") appended to a section in `lib/nav.ts`. Pass `platform="Web"`.

**Entry points:** (a) the banner's "What's new" link; (b) persistent nav — web nav leaf + a mobile row in the Help/Settings menu; (c) auto-open once after an update (§2), consumed by the shell to `navigate('/whats-new')` on the first render following a build change.

---

## Data flow

```
deploy ──▶ new build:  __BUILD_ID__ baked in bundle  +  version.json{buildId} on disk
                                     │
running app (old build) ── poll version.json?_=ts ──▶ buildId differs
                                     │
                         useAppUpdate: updateAvailable = true
                        ┌────────────┼─────────────────────────┐
                   UpdateBanner   notif entry + badge+1     (unchanged until user acts)
                        │
                 [Update now] ─▶ applyUpdate() = location.reload()
                        │
             new bundle loads; localStorage build changed ─▶ auto-open /whats-new once
                        │
             /whats-new ── useAppReleases ─▶ get_app_releases ─▶ App Release (published)
```

## Error handling

- Poll failure (offline / non-200 / bad JSON): swallowed; retried next tick. Never surfaces an error to the user.
- `get_app_releases` with no published rows: `/whats-new` shows an empty state; detection/popup are unaffected (they never depend on the doctype).
- git unavailable at build time: `buildId` falls back to a build timestamp — still unique per build.
- `applyUpdate` is idempotent (just a reload); double-click is harmless.

## Testing

- **Backend:** a Frappe test that `get_app_releases` returns only `published=1` rows, respects the `platform` filter (`Both` + matching platform), and orders by `release_date desc`.
- **Detection logic:** a small unit test of the buildId-compare + auto-open decision (fresh install vs unchanged vs changed) — pure function, no DOM.
- **Manual (live site, per project convention):** deploy, open app, deploy again with a bumped build, confirm banner appears, Update reloads to the new build, notification entry shows and clears, What's New lists a seeded release, and auto-open fires exactly once.

## Out of scope (YAGNI)

- Custom admin CRUD UI for releases (Frappe Desk covers it).
- Per-change child table (multiline `notes` suffices).
- Server-side per-user update notifications / web push on deploy.
- Forced/blocking updates (banner is dismissible).
- Localised release notes.
