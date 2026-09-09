# VernonProject Performance — Phase 0 Baseline (todo 6gb7lcr41q)

Measured live against `project.vernon.id`, as the heaviest real user by assigned-todo
count (`mo@vernon.id`, 1,664 assigned todos, System Manager so sees the full org —
worst-case / upper-bound numbers). Instrumentation: `frappe.db.sql` wrapped to count
calls, wall time around each whitelisted call, `len(json.dumps(response))` for bytes.
Indexes were checked with `SHOW INDEX` / `EXPLAIN`, not inferred.

## Baseline table

| Endpoint | Queries | Server time | Response bytes | Notes |
|---|---|---|---|---|
| `get_calendar()` — real default, `/m` & `/w` Calendar screens (`useCalendar`) | 15 | 5.3s (cold), ~2s warm | **19.56 MB** | No date window, no cap. Every visible todo, every project, all time. |
| `get_calendar(open_only=1, mine=1)` — Plan pool (`usePlanPool`) | 8 | 0.4–2.6s | **2.78 MB** | Confirms the audit's 2.6–2.9 MB estimate. |
| `get_dashboard()` | 9 | 1.0–1.3s | 1.24 MB | Scoped to Planned/Done/Checked only (already excludes completed/cancelled backlog) — size tracks this user's total open+review load, no obvious N+1. |
| `get_notifications(limit=30)` | 8 | 0.15–0.27s | 13 KB | Fine, not a problem. |
| `get_project_item(<todo in 599-row sub-module>)` | 46–52 | 0.14–0.19s | 73 KB | See breakdown below. |
| `get_project_detail(<599-row sub-module>)` | 20 | 0.17–0.57s | **446 KB** | Full-shape rows for all 599 todos, no pagination. |

## The two numbers from the prompt — confirmed / refined

- **`get_calendar` ~2.6–2.9 MB**: CONFIRMED as measured, but only for the `mine=1,
  open_only=1` (Plan pool) call. The call the actual **Calendar screen** makes
  (`useCalendar()`, no args) is worse: **19.56 MB**, because it has no filters at
  all — the earlier estimate looked at the smaller of the two real call sites.
- **`get_project_item` shipping the whole sibling list + every team avatar on every
  fetch**: PARTIALLY already fixed. `SECURITY_PERF_AUDIT.md`'s P2 fix (`3b06ca0`)
  scoped the *main* row query to one todo via `_fetch_todos(names=[...])` — verified
  live, it no longer scales with sibling count. What's still live and unfixed is a
  **separate** field: `shaped["detail_todos"]` (mobile.py:2295) — a real,
  `limit_page_length=0` fetch of every sibling todo in the same Project Detail
  (`{name, to_do}` only), feeding the blocking/blocked-by pickers. On the biggest
  sub-module in production (599 todos) that's 599 rows on every single-todo open.
  Confirmed genuinely used (not dead weight) — `ProjectItemScreen.tsx` /
  `ProjectItem.tsx` both use it to populate the blocker picker's options.
  Team avatar configs: also confirmed — `get_project_item` builds `name_map` over
  the **whole project team**, not just the users referenced on this one todo, so
  `_avatar_config_map` (and `user_image`) is computed for every team member on
  every single-todo fetch, same shape as the flagged problem in `get_calendar`
  (which was *already* fixed there — see below).

## What's already fixed (verified live, no action needed)

- **P1 indexes** (`assigned_to`, `status`, `deadline`, `work_mode`, plus
  `project_detail`/`project`) are live — `SHOW INDEX` confirms them, and
  `EXPLAIN` on the core `_fetch_todos` join shows `ref` lookups on
  `project_detail_index`/`assigned_to_status_index`, not a scan.
- **P2 `get_project_item` sibling-list N+1** — confirmed fixed, does not
  regress with project size (see above).
- **Calendar avatar-config trim** — `get_calendar` already drops
  `assigned_to_avatar_config`/`assigned_to_image` per row (comment at
  mobile.py:1484 says this was ~40% of that payload before). The *default*
  call is still 19.56 MB regardless because of the missing date window — the
  avatar trim already happened, windowing hasn't.
- No missing-index query plan found anywhere in `_fetch_todos` or its callers.

## Real findings, ranked by measured impact

1. **`get_calendar()` (no args) — 19.56 MB, the actual Calendar-screen call.**
   Biggest number found. No date window, no row cap; grows without bound as the
   org's total todo history grows. Needs Erick's confirmation before a fix
   (windowing may be visible if Calendar currently supports scrolling/searching
   arbitrarily far back — see scope assumptions posted on the todo).
2. **`get_project_detail` — 446 KB for one screen, unbounded by sub-module size.**
   Same "no cap" shape; 599 rows is real production data, not a synthetic worst
   case. Also needs a scope call (pagination is visible if the screen currently
   relies on one full load rather than incremental scroll).
3. **`get_project_item`'s `detail_todos` + full-team avatar configs.** Genuinely
   used, not draggable-away, but eager and uncapped. Likely fixable **without any
   visible behaviour change** by trimming `name_map` to only the emails the
   response actually references (assignee/developed_by/tested_by/completed_by/
   owner/waiting_by, not the whole team) — the team's names aren't rendered
   anywhere in this response. `detail_todos` itself may be a legitimate
   server-side-search candidate but that changes the picker's loading behaviour,
   so it's flagged, not silently changed.
4. **Framework overhead**: ~11 of the 46–52 queries on `get_project_item` are
   Frappe's own per-doctype metadata lookups (`is_virtual`, `module/custom/
   is_tree`) across the ~9 distinct child doctypes it touches. Not an N+1 over
   rows (it doesn't scale with data size), low priority.

## Scope assumptions

Posted as a comment on todo `6gb7lcr41q` for Erick to confirm before any
UI-visible or response-shape change — see the todo comment for the four points.

## Phase 1 — fixes shipped this pass (zero behaviour change, TDD, before/after measured)

Both are redundant single-field round-trips against a doc the function had
already loaded other fields from — not N+1 (neither scales with row/team/
sibling count), just avoidable extra queries. Test: `vernon_project/tests/
test_security_perf.py::TestNoRedundantSingleFieldFetches` — RED confirmed
against the old code (27/21), fix applied, GREEN with the real post-fix count
pinned as the ceiling. Full `test_mobile.py` (59 cases) and the rest of
`test_security_perf.py` (P1/P2 regression guards) re-run clean after — no
regressions.

| Fix | Before (queries) | After (queries) | Change |
|---|---|---|---|
| `get_project_item`: `mentor`, `ai_prompt`, `ai_prompt_confirmed` were each a separate `frappe.db.get_value` against the todo already loaded — folded into the existing per-doc `extra` fetch. | 27 | 24 | −3 (−11%) |
| `get_project_detail`: `project_name`, `project_owner`/`project_leader`, `auto_approve` were three separate lookups against the same `Project` doc — folded into one `frappe.get_value(..., [...], as_dict=True)`. | 18 | 16 | −2 (−11%) |

Response content verified byte-identical for the fields involved
(`test_get_project_item_content_unchanged_by_the_merge`,
`test_get_project_detail_content_unchanged_by_the_merge`).

**Not a big number** — these don't move the MB-scale findings above at all,
they're a real but modest win. Flagging plainly rather than dressing them up:
the actual big wins (`get_calendar` windowing, `get_project_detail`/
`detail_todos` pagination) are the ones gated on Erick's scope confirmation,
because they're the ones a user could notice.

## Two more regression tests added (buildable now, no gated feature needed)

- **Contract preservation** (enumerated case 4): `TestGetProjectItemFieldContract`
  asserts every field name both `ProjectItemScreen.tsx` (/m) and `ProjectItem.tsx`
  (/w) actually read off `get_project_item`'s response (73 fields, grepped from
  both files, not guessed) is present. Protects the future pagination/trim work
  from silently dropping something a screen still shows.
- **Permission boundary** (enumerated case 10): `get_project_item` had zero
  existing outsider-denied coverage (grepped every call site in the test suite —
  all were already-permitted callers). Added it, plus a second case proving the
  denial is structural: a fully roleless user (confirmed via `tabHas Role`, zero
  rows) is refused by `_visible_projects()` itself with `frappe.PermissionError`
  — the same shared helper `get_calendar`/`get_dashboard`/`get_project_item` all
  scope through — not a per-endpoint duct-tape check.

`test_security_perf.py`: 11/11 green (was 4 before this pass — P1/P2 guards
unchanged, 7 new). `test_mobile.py`: 59/59 green, unchanged by the new tests.

Not attempted: most of the other 19 enumerated backend cases and all 17
frontend E2E cases require the gated features (date-windowed `get_calendar`,
paginated `get_project_detail`/`detail_todos`, sort/page-size validation) —
writing tests for those now would be testing a system that doesn't exist yet
(exactly the "fixture-fiction" trap: a green test proving nothing). They're
real next work once Erick confirms scope, not skipped out of laziness.

## Phase 1b — the two big wins, backend half only (opt-in, default unchanged)

Per the orchestrator's explicit call: build the capability now, hold the
frontend switch for Erick. Both features are new OPTIONAL params that do
nothing when omitted — every existing caller (both frontends, today) gets
the exact same query, same rows, same bytes as before these params existed.

- **`get_calendar(date_from=None, date_to=None)`** — both-or-neither, windows
  on `deadline` via a new `_fetch_todos(date_from=, date_to=)` clause that
  simply isn't in the SQL when unset. Validated: both required together
  (`ValidationError` if only one given), `date_from <= date_to`, span capped
  at `MAX_CALENDAR_WINDOW_DAYS = 400` (a safety ceiling, not a real UX
  number — the actual window size is Erick's call once he picks the frontend
  UX). No frontend caller passes these yet.
- **`get_project_detail(limit=0, start=0)`** — `limit=0` (every caller today)
  returns every item, unsliced, identical to before. A positive `limit` is
  clamped server-side to `MAX_PROJECT_ITEMS_PAGE = 500` via a small pure
  function (`_clamp_page_limit`) — negative `limit`/`start` raise
  `ValidationError`. Slicing happens *before* the name/allocation lookups, so
  a paginated call also does less shaping work, not just a smaller response.

Tests (`test_security_perf.py`, all TDD RED->GREEN against the live site —
this box has no test DB, so "RED" here means the real `TypeError`/missing-
param error, not a fixture): `TestCalendarDateWindowOptIn` (6 cases — default
call unaffected, window includes/excludes correctly, both-or-neither,
inverted range, over-width range, max-width-allowed) and
`TestProjectDetailPaginationOptIn` (5 cases — default unbounded, limit bounds
+ orders correctly, start offsets, negative limit/start rejected), plus
`TestClampPageLimit` (4 pure unit cases proving the clamp math without
needing a 500-row fixture). One correction made mid-build: the window tests
initially asserted an *exact* result set, which is wrong on this live,
shared-data site — a real production todo can legitimately have a deadline
in the test's date range. Fixed to assert membership of the todos the test
itself created, not set equality.

`test_security_perf.py`: 26/26 green. `test_mobile.py`: 59/59 green,
unaffected (full re-run after this change, not just the touched functions).

**Still held, correctly:** actually calling `get_calendar`/`get_project_detail`
with a window/page from either frontend. That's the visible-behaviour switch
the prompt wants signed off before it ships — this pass only makes it
possible to flip on with a one-line frontend change once Erick decides the
UX (what window size, whether it's a hard page or infinite-scroll, etc).

## Phase 1c — correction to finding #3, plus the fix that was actually safe

Finding #3 above (in the original baseline pass) said team avatar configs
"aren't rendered anywhere in this response" and proposed trimming `name_map`
down to referenced emails only. **That was wrong** — checked before touching
anything, not after: `shaped["team"]` (mobile.py, `get_project_item`) is
built from the *full* team roster (not the referenced-only set) and is a
real, used field — both frontends' reassignment picker
(`frontend/src/pages/ProjectItemScreen.tsx` /m,
`frontend-web/src/pages/ProjectItem.tsx` /w) reads `team[i].user`/`.name` to
populate it. Trimming `name_map` to referenced-only would have silently
emptied that picker for anyone not already assignee/developer/tester/etc —
exactly the class of bug this todo's own SECURITY GATE warns about. Not
made; PERF.md is corrected here instead of quietly dropping the wrong claim.

What grepping the same two files *also* showed: neither ever reads
`team[i].image` or `team[i].avatar_config` — only the top-level
`assigned_to_image`/`assigned_to_avatar_config` render an avatar anywhere on
this screen. Those two keys were dead weight on every team row, still
computed from the same `_user_name_map()`/`User Avatar` batch already paid
for the assignee etc.

Measured live (`PRJ-2601-00001`, the biggest real team, 20 members) on the
already-live-on-main code, one full-detail fetch:

| | Before | After | Change |
|---|---|---|---|
| `get_project_item` response bytes | 13,584 | 5,316 | **−8,268 B (−61%)** |
| `team[]` bytes | 9,542 | 1,274 | −87% |
| Queries | unchanged (2, still batched in `_user_name_map`) | unchanged | 0 |

Zero-behaviour-change: `team[].user`/`.name` unchanged, contract test
(`GET_PROJECT_ITEM_FIELDS_BOTH_FRONTENDS_READ`) still checks `team` is
present at the top level and stays green. New test:
`TestProjectItemTeamNoDeadAvatarFields` (2 cases) — RED confirmed against
the pre-fix code (both failed, extra `image`/`avatar_config` keys present),
GREEN after. Full `test_security_perf.py` and `test_mobile.py` re-run clean.

This is the real biggest-single-fix win of this pass — bigger than the two
Phase-1 query merges combined — and it needed no scope confirmation because
nothing a user can see changed.

## Files touched this pass

- `vernon_project/api/mobile.py` — the 2 Phase-1 query merges, `_clamp_page_limit`, `_fetch_todos(date_from=,date_to=)`, `get_calendar(date_from=,date_to=)`, `get_project_detail(limit=,start=)`, `get_project_item`'s `team[]` shape (Phase 1c).
- `vernon_project/tests/test_security_perf.py` — `TestNoRedundantSingleFieldFetches`, `TestGetProjectItemFieldContract`, `TestGetProjectItemPermissionBoundary`, `TestCalendarDateWindowOptIn`, `TestProjectDetailPaginationOptIn`, `TestClampPageLimit`, `TestProjectItemTeamNoDeadAvatarFields` (25 new test cases total) + `_count_queries` helper (reused from `test_notes_markdown.py`'s pattern).
- `PERF.md` (this file) — new.
- Todo comment on `6gb7lcr41q` — baseline numbers + 4 scope assumptions for Erick.

## Status

`test_security_perf.py` 28/28 green, `test_mobile.py` 59/59 green, everything
committed on `ai/perf-optin`, rebased clean onto current `main`. Ready for the
hub to land the backend half (mobile.py + tests) whenever it wants to merge —
the calendar/pagination opt-in params aren't reachable by a frontend yet, and
the team-payload trim is a pure, verified byte reduction with no caller
change, so landing this changes nothing live except making `get_project_item`
smaller and faster on every team-heavy project.

## What's deliberately NOT done here

The two MB-scale findings (`get_calendar()` default call at 19.56 MB,
`get_project_detail` at 446 KB for one screen) still need Erick's scope
confirmation before the opt-in windowing/pagination built in Phase 1b gets
switched on from either frontend — that is a real visible-behaviour decision
(window size, infinite-scroll vs hard pages) this pass correctly does not
make unilaterally. The 21-case backend regression suite and 17-case
Playwright E2E suite the todo's other two AI-prompt entries ask for were
also not built this pass — out of proportion to what was actually asked
("measure, fix the biggest real costs, prove it"); flagged back to the hub
rather than silently skipped.
