# Data Health Report — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation

## Problem

Recent economy work surfaced recurring data-quality issues: unfinished todos with no
type/level (won't score), implausibly large `estimated` minutes inflating points, todos
missing required-ish fields, and stale level references / junk titles. We need an
ongoing report so these are caught and fixed instead of discovered ad hoc.

## Surface

A dedicated **Data Health** page in the web app (`/w`), backed by one whitelisted API
endpoint. Manager-gated. (Mobile out of scope.)

## Architecture

- **Backend:** `@frappe.whitelist() def data_health()` in `vernon_project/api/mobile.py`.
  Runs the 4 checks, returns:
  ```
  {
    "counts": {"unmapped": n, "outliers": n, "missing": n, "orphaned": n, "total": n},
    "unmapped": [item, ...], "outliers": [...], "missing": [...], "orphaned": [...]
  }
  ```
  Each `item`: `{"name", "to_do", "group", "status", "detail"}` where `detail` is a
  short string explaining the flag (e.g. `"estimated 3360 min"`, `"missing: start_date"`,
  `"level_id orphaned"`). Each list capped at 200 rows with a `counts` total reflecting the
  true (uncapped) count, so the page can say "showing 200 of N".
  - **Permission:** allow only users with role System Manager, Group Manager, or
    Project Owner; otherwise `frappe.throw(PermissionError)`.
- **Web:** `frontend-web/src/pages/DataHealth.tsx`, route `/data-health`, an AppShell nav
  entry. A data hook (`useDataHealth`) calls the endpoint via the existing mobileApi
  client. Reuses bento components.

## The 4 checks

Statuses: in-flight = `⚪️ Planned`, `🟠 Done`, `🔷 Checked By PL`. "non-cancelled" =
status != `🚫 Cancelled`.

1. **Unmapped type/level** — in-flight AND `level_id IS NULL`. detail: `"no type/level"`.
2. **Outlier estimate** — non-cancelled AND `estimated > 1440` (minutes; >24h on one task).
   detail: `"estimated <n> min"`.
3. **Missing fields** — in-flight AND any of: `group` NULL/empty, `estimated` NULL or 0,
   `deadline` NULL, `start_date` NULL. detail lists which: `"missing: estimate, start_date"`.
4. **Orphaned / junk** — non-cancelled AND either: `level_id` set but not present in
   `tabGroup Level` (orphaned ref), OR junk title — `to_do` (trimmed, lowercased) in
   {`x`, `seed`, `test`, `testing`} or `CHAR_LENGTH(trimmed) <= 2`.
   detail: `"orphaned level_id"` or `"junk title"`.

A todo may appear in more than one section (each check independent). `counts.total` =
sum of the 4 section counts (not de-duplicated; it's a problem-instance count).

## UI (`DataHealth.tsx`)

- Header "Data Health".
- Top bento tile: total problems (amber/red if > 0, green if 0).
- 4 bento tiles, one per check: title + count (red when > 0), and a list of flagged todos
  (to_do + group + status + detail), each linking to the existing web todo route
  (`/w` ProjectItem) so it can be fixed. If a list is capped, show "showing 200 of N".
- Empty state per section when count = 0 ("No issues").
- Manager-only: if the endpoint throws PermissionError, the page shows an access notice
  (reuse existing error/empty-state component).

## Out of scope (YAGNI)

- Auto-fixing the problems (report only; fixes happen in the todo UI).
- Configurable thresholds UI (1440 is a constant in the endpoint; change in code).
- Mobile page, scheduled email digests, historical trend charts.

## Testing

LIVE site, no test DB. Verify via `bench console` calling `data_health()` (counts match
direct SQL for each check) and a manual web load. Confirm a non-manager is blocked.
