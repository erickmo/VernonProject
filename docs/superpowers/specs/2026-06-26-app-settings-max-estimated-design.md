# App Settings — Max Estimated Minutes — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation

## Problem

There's no place to configure app-wide rules. First need: a maximum estimated minutes
per todo, enforced on save (todos with absurd estimates inflate the points economy — see
the Data Health outliers). This introduces a general settings store plus the first setting.

## Decisions (locked)

- Store: new **Vernon Settings** Single doctype (room for future settings).
- Enforcement: HARD block — `validate()` throws if `estimated > max`.
- Single source: the Data Health "outlier estimate" check uses this max (drop hardcoded 1440).
- Editor surface: both web + mobile, manager-gated.

## Data model

**Vernon Settings** (`issingle: 1`):
- `max_estimated_minutes` (Int, default `1440`, non_negative). Label "Max Estimated Minutes (per todo)".
  Description: "0 = no limit." 
- Permissions: System Manager + Group Manager (read/write); read for the roles that need
  it at todo-create time is provided via the whitelisted getter, not doctype-level read.

## Backend

All in `vernon_project/api/mobile.py` + the Project Todo controller, mirroring the existing
Badge Settings get/save pattern (`get_badge_settings`/`save_badge_settings`,
`frappe.get_single`).

- **Hard block:** add `validate_estimated_max()` to `ProjectTodo.validate()` (after the
  existing field validators). Logic:
  ```
  mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0
  if mx and self.estimated and float(self.estimated) > mx:
      frappe.throw(f"Estimated minutes ({int(self.estimated)}) exceeds the maximum ({int(mx)}).")
  ```
  `mx <= 0` (or unset) → no cap. Empty `estimated` → no check.
- **Single source for Data Health:** in `data_health()`, read
  `mx = max_estimated_minutes` once at the top. Replace the hardcoded `1440` in BOTH the
  outlier list query and its count query with `mx`. If `mx <= 0` (no limit configured),
  skip the outlier check entirely — return `outliers = []` and `outliers_n = 0` (don't run
  the queries). Detail string stays `"estimated <n> min"`.
- **API:**
  - `@frappe.whitelist() get_app_settings()` — any authenticated user (todo forms read the
    cap). Returns `{"max_estimated_minutes": int}`.
  - `@frappe.whitelist() save_app_settings(max_estimated_minutes)` — manager-gated
    (System Manager / Group Manager; throw PermissionError otherwise). Validates the value
    is a non-negative int, saves the Single, returns the saved value.

## Frontend (both apps share `@/`)

Mirror Badge Settings wiring:
- `frontend/src/lib/api.ts`: `getAppSettings()` (GET `...get_app_settings`),
  `saveAppSettings(maxEstimatedMinutes)` (POST `...save_app_settings`).
- `frontend/src/lib/types.ts`: `interface AppSettings { max_estimated_minutes: number }`.
- `frontend/src/hooks/useData.ts`: `useAppSettings()` (query key `['app-settings']`),
  `useSaveAppSettings()` (mutation, invalidates `['app-settings']`).
- **Mobile** `frontend/src/pages/SettingsScreen.tsx` (DetailScreen, manager-gated): a single
  number input for max estimated minutes + Save (toast on success/error). Route
  `/settings`; manager-gated Profile `Row` ("Settings", gear icon) → `/settings`.
- **Web** `frontend-web/src/pages/Settings.tsx` (bento, manager-gated): same field + save.
  Route `/settings`; manager-gated AppShell admin nav entry.
- Manager gate reuses the existing `canManageGroups(boot)` helper (as Badge Settings does)
  — or the app's manager check; whichever Badge Settings uses.
- The create/edit todo block error (server throw) surfaces through the existing error toast;
  no client-side duplicate validation (YAGNI).

## Out of scope (YAGNI)

- Other settings (the doctype is built to hold more later, but only `max_estimated_minutes` now).
- Client-side pre-validation of the cap in todo forms (server enforces; error shows).
- Per-group / per-type max overrides.

## Testing

LIVE site, no test DB. Verify via `bench console`: set `Vernon Settings.max_estimated_minutes`,
attempt to save a Project Todo with `estimated` above it → expects `frappe.throw`; below →
saves. `data_health()` outlier count reflects the configured max. Manual: managers can open
Settings on web + mobile, change the value, save; a non-manager is blocked from saving.
