# Intern Allocation Matrix — design

**Date:** 2026-08-23
**Goal:** Give the HR team a report of intern assignment allocation as a matrix, so they can
check whether an intern is being managed properly by their leader in the project.

## Problem

Nothing in the app answers "is this intern actually being given work, and is their leader
responding to it?". `daily_estimated_time` already pivots every active user × day into a
minutes matrix, but it is System-Manager-only, covers all 100+ users, carries no leader
attribution, and no management-quality signals. HR has to open each project by hand.

## Shape

One new report, `/reports/intern-allocation`, on both frontends.

**Rows = interns. Columns = days.** Cells = assigned minutes that day. Each row also carries
the signals that answer "managed properly", and the leader(s)/project(s) responsible.

```
Intern            Leader     Mon  Tue  Wed  Thu  Fri   Total   ⚠
Budi (Proj A)     Sinta      240   —   180   —    —     420    stale 9d
Ayu  (Proj B)     Rendi      180  120  150   90  120     660    —
```

## Backend

Both endpoints live in `vernon_project/api/report.py` beside every sibling report.

### `intern_allocation_access()`
Returns `{can, scope}` — the single source for the nav/tile gate, mirroring `last_seen_access`
so the UI can hide the entry without a 403 round-trip.

| Caller | scope |
|---|---|
| `HR Manager` or `System Manager` | `all` |
| owns / leads / admins ≥1 Project (`_projects_i_run`) | `team` |
| anyone else | `none` (`can: false`) |

### `intern_allocation(from_date, to_date)`
Enforces the same rule (`none` → `frappe.PermissionError`). Range validated by the existing
`_validated_range` (`MAX_SPAN_DAYS`).

**Who is an intern** — the union of the two markings the app already keeps:

- `User.custom_member_type == "Intern"` — the operational marking (Manage Users, DISC gate).
- `Employee Profile.employment_status == "Intern"` — the HR contract-level marking.

A user carrying both appears once, with `sources: ["member_type", "profile"]`. Disabled users,
Guest and Administrator are excluded. In `team` scope the set is further intersected with
`_users_on_projects(_projects_i_run(me))`.

Returning both sources (instead of picking one) means HR never silently loses an intern whose
two records disagree; the UI filters by source client-side, so a mismatch is visible, not hidden.

**Minutes** reuse the existing queries verbatim: `_assigned_minutes()` (explicit
`Project Todo Assigned Allocation` rows + the virtual-default deadline fallback) and the
`Project Todo Allocation` planned-minutes SQL from `daily_estimated_time`. The pivot is the
already-tested pure `_build_daily_matrix()`.

### Response

```jsonc
{
  "scope": "all",                    // "all" | "team"
  "from_date": "2026-08-10", "to_date": "2026-08-23",
  "dates": ["2026-08-10", ...],
  "threshold": 180,                  // Vernon Settings.min_daily_estimated_minutes
  "rows": [{
    "user": "budi@x.id", "full_name": "Budi",
    "sources": ["member_type"],
    "per_day_assigned": {"2026-08-10": 240, ...},
    "per_day_planned":  {"2026-08-10": 180, ...},
    "assigned_total": 420, "planned_total": 300,
    "flagged_dates": ["2026-08-11", ...],   // assigned < threshold

    "zero_days": 6,                  // WEEKDAYS in range with 0 assigned minutes
    "last_assigned_on": "2026-08-14", "stale_days": 9,
    "awaiting_review": 2, "oldest_wait_days": 5,
    "assigned_count": 7, "done": 4, "late": 2,
    "notes_count": 1, "last_note_on": "2026-08-12",
    "projects": [{"project": "PROJ-0007", "project_name": "Website",
                  "leader": "sinta@x.id", "leader_name": "Sinta",
                  "todos": 6, "minutes": 420, "last_assigned_on": "2026-08-14"}],
    "attention": true, "reasons": ["stale", "waiting"]
  }],
  "totals": {"interns": 12, "attention": 3}
}
```

## Signals — definitions (these are the report's contract)

| Field | Rule | Why it answers the goal |
|---|---|---|
| `zero_days` | Mon–Fri days in range whose assigned minutes are 0 | leader gave no work at all |
| `stale_days` | days between `last_assigned_on` and `to_date`; `null` last-assigned → whole range | work dried up |
| `awaiting_review` | todos at `🟠 Done` or `🔷 Checked By PL` | intern delivered, leader has not responded |
| `oldest_wait_days` | oldest of those, from `tested_at` (Checked) else `developed_at` (Done) | how long the intern has been blocked |
| `done` / `late` | done-date `COALESCE(done_started_at, developed_at)` in range; late when > `deadline` | the intern's own delivery, same rule `logbook()` uses |
| `notes_count` | `Leader Note` rows about the intern with `note_date` in range | is the leader coaching in writing |
| `attention` | `stale_days >= 7` OR `oldest_wait_days >= 3` OR every weekday is a zero day | the one column HR scans |

`ponytail:` a "weekday" is Mon–Fri. Not shift-aware and not holiday-aware — most users have no
Shift Assignment, so a shift-derived working-day model would evaluate nothing. `_resolve_expected()`
is the upgrade path if per-user working days ever matter.

Cancelled todos (`🚫 Cancelled`) are excluded everywhere, matching every sibling report.

## Frontend

Shared logic in `frontend/src` (imported as `@` from web), presentation per platform.

**Web — `frontend-web/src/pages/InternAllocation.tsx`, route `/reports/intern-allocation`**
- Sticky first column: intern name, leader chips, attention dot. Horizontally scrollable day grid,
  heat-scaled cells, blank (not `0`) for nothing assigned, weekend columns muted.
- Signal columns pinned right; a row click opens the drawer with the per-project breakdown.
- Filters (all client-side, instant): date preset (default 14 days), project, leader, intern source,
  name search. Selects use `SearchableSelect`, dates use the shared `DatePicker` — per repo convention.

**Mobile — `frontend/src/pages/InternAllocationScreen.tsx`, same route**
- One card per intern: 14-day chip strip, signal badges, attention flag. Tap → detail sheet with
  the same per-project breakdown.

**Tile** appears in the Reports hub on both frontends, gated on `intern_allocation_access().can` —
the same pattern the Last Seen tile uses.

**(i) hints.** One shared copy map `frontend/src/lib/internAllocationHelp.ts` (mirrors
`lib/scheduleHelp.ts`), rendered on web through the existing `HoverCard` and on mobile through a
help `Sheet` — identical wording on both. Terms covered: assigned vs planned minutes, zero-day,
stale, awaiting review, attention, intern source, and why a weekend column is muted.

## Tests

`vernon_project/api/test_intern_allocation.py`, following `test_report.py`'s split of pure-builder
unit tests + endpoint gate tests.

Pure (`_build_intern_signals`, no DB): empty range; intern with zero allocations; weekend-only
allocation still counts as zero weekday-work; stale boundary 6 vs 7 days; wait boundary 2 vs 3 days;
`attention` false when every signal is inside its bound; union dedup when a user is an intern by both
markers; per-project split with the right leader; late vs on-time; a rejected todo counts as neither
done nor awaiting review; `last_assigned_on` null when nothing was ever assigned.

Endpoint: HR Manager allowed (`scope: all`); System Manager allowed; a project leader gets only the
interns on projects they run; an unrelated user gets `PermissionError`; oversize span rejected;
response carries the documented keys.

## Out of scope

- No new DocType, no new setting, no scheduler job, no notification. The report reads what exists.
- No CSV/PDF export (the Logbook PDF is the precedent if it is ever asked for).
- No write actions from the report — nudging already exists as `buzz_todo` on the Todos Due report.
