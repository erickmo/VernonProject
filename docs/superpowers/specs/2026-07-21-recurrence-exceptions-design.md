# Recurrence Exceptions — Design / Implementation Contract

Date: 2026-07-21
Feature: a recurring Project Todo can carry **exceptions** — days-of-week, days-of-month,
and specific dates/ranges — that block occurrences. One per-todo behavior toggle decides
**Skip** (drop the occurrence, continue at next natural date) vs **Shift** (move it to the
next open day, series rhythm unchanged).

Existing behavior already skips non-working days (brand weekday minimum = 0, holiday,
shift-off) via `advance_over_zero_days`, plus `recurring_paused` + `recurring_until`. These
per-todo exceptions are a manual override layered on top. Both generation paths
(on-complete `force=True`, scheduler `force=False`) funnel through `generate_next` — one
place to change.

## Data model — 5 new fields on `Project Todo`, ZERO new doctypes

Add to `recurring_section` in `project_todo.json` (near `recurring_nth` / `recurring_until`):

| Field | Type | Notes |
|---|---|---|
| `recurring_exception_weekdays` | Data | CSV `MON,SUN` — reuses `parse_weekdays`/`format_weekdays` |
| `recurring_exception_monthdays` | Data | CSV `1,25` (each 1–31) |
| `recurring_exception_dates` | Small Text | JSON array `[{"from":"2026-12-25","to":"2026-12-25"},{"from":"2026-07-20","to":"2026-07-27"}]`. Single date = one-day range. Covers "specific dates" **and** vacation ranges. |
| `recurring_exception_behavior` | Select | options `Skip\nShift`, **default `Skip`** (all existing todos unchanged) |
| `recurring_anchor_date` | Date | read-only, controller-managed. Rule-basis for computing the next occurrence so **Shift never drifts the series**. Backfilled = `deadline`. |

Why JSON field, not a child table: the engine only needs an `is_blocked(date) -> bool`
predicate, never an aggregate query. A JSON field is the smaller correct storage, rides the
existing `_ROLL` + `build_occurrence` copy path, and adds no doctype (no gen_docs churn).
Weekday/monthday stay CSV to match the existing `recurring_weekdays` pattern.

## Engine — `recurrence.py`

Add:

```python
def parse_monthdays(csv):
    # -> sorted unique list[int], each 1..31; raise ValueError on out-of-range/non-int
def parse_ranges(value):
    # value: JSON string OR list of {"from","to"}. -> list[(date, date)].
    # single date (no/blank "to") -> (d, d). Skip blank rows. If from > to, swap.

@dataclass
class Exceptions:
    weekdays: tuple = ()     # ISO idx (Mon=0)
    monthdays: tuple = ()    # 1..31
    ranges: tuple = ()       # ((date, date), ...)
    behavior: str = "Skip"   # Skip | Shift
    def blocks(self, d):     # d in weekdays / d.day in monthdays / any a<=d<=b
```

Generalize the skip loop: rename `advance_over_zero_days` → `advance_while_blocked(start,
step, blocked, until=None, bound=40)` where `blocked(d) -> bool` and the loop **returns the
first candidate that is NOT blocked** (else advances via `step`); `until` passed → `None`;
all-blocked within `bound` → returns `start` (degenerate config never silently drops the
series). Keep `advance_over_zero_days` as a thin back-compat wrapper so existing callers/tests
still pass:

```python
def advance_over_zero_days(start, step, min_for, until=None, bound=40):
    return advance_while_blocked(start, step, lambda d: min_for(d) <= 0, until, bound)
```

`bound=40` so a multi-week vacation range survives day-stepping in Shift mode.

## Controller — `project_todo.py`

- `_exceptions(self) -> Exceptions` — parse the 4 fields (reuse `parse_weekdays`,
  `parse_monthdays`, `parse_ranges`).
- `validate_recurrence_rule` — when `is_recurring`: normalize `recurring_exception_weekdays`
  (`format_weekdays`), `recurring_exception_monthdays` (sorted-unique CSV), re-serialize
  `recurring_exception_dates` to canonical JSON (parse → validate ISO → dump; empty → `""`),
  default `recurring_exception_behavior` to `Skip`. Optional guard: throw if
  `exception_weekdays` lists all 7 (guaranteed-empty series).
- `generate_next` — integrate:
  - `basis = anchor.recurring_anchor_date or anchor.deadline` (use for
    `calculate_next_occurrence`; the resume `< today` clamp is unchanged).
  - `exc = head._exceptions()`
  - `blocked = lambda d: _resolve_min_minutes(anchor.assigned_to, str(d)) <= 0 or exc.blocks(d)`
  - **Shift:** `next_date = advance_while_blocked(rule_date, lambda d: getdate(add_days(d, 1)),
    blocked, until=until)`; `anchor_date = rule_date` (un-shifted rule date drives the next occ).
  - **Skip:** `next_date = advance_while_blocked(rule_date, lambda d:
    getdate(next_occurrence(d, rule)), blocked, until=until)`; `anchor_date = next_date`.
  - `if next_date is None: return None`. Pass `anchor_date` to `build_occurrence`.
- `build_occurrence(anchor, next_date, anchor_date=None)` — set `recurring_anchor_date =
  anchor_date or next_date`; copy the 4 exception fields from `anchor`.
- `_ROLL` — append `recurring_exception_weekdays, recurring_exception_monthdays,
  recurring_exception_dates, recurring_exception_behavior, recurring_anchor_date`.

## API — `api/mobile.py`

- **Read** (`get_project_item`, the `extra` fetch ~line 1427 + `shaped["recurring"]` ~1508):
  fetch the 4 exception fields; expose in the `recurring` dict as `exception_weekdays`
  (str), `exception_monthdays` (str), `exception_dates` (parsed **list**, not raw JSON),
  `exception_behavior` (str, default `Skip`).
- **Write** (`update_todo`): add 4 kwargs `recurring_exception_weekdays=None,
  recurring_exception_monthdays=None, recurring_exception_dates=None,
  recurring_exception_behavior=None`. In the not-recurring clear block, null all 4. In the
  `if row.is_recurring:` block, set each guarded on `is not None` (`... or ""` /
  behavior `... or "Skip"`).
- **Create**: no change — `createTask` posts `frappe.client.insert` with the raw doc, so
  the new doctype fields flow through automatically once they exist.

## Patch — backfill anchor date

`vernon_project/patches/backfill_recurring_anchor_date.py`:
`UPDATE \`tabProject Todo\` SET recurring_anchor_date = deadline WHERE is_recurring = 1 AND
(recurring_anchor_date IS NULL OR recurring_anchor_date = '') AND deadline IS NOT NULL`.
Register in `patches.txt`.

## Tests — `test_recurrence.py`

Add asserts: `parse_monthdays` (valid + out-of-range raises), `Exceptions.blocks` for each
type + range, `advance_while_blocked` skip vs shift, and the **no-drift property**: with a
weekly Monday rule + a blocked Monday, Shift yields deadline=next open day but the following
occurrence still lands on the next Monday.

## Frontend shared — `frontend/src/lib/recurrence.ts`

- `Recurrence` + `emptyRecurrence`: add `exceptionWeekdays: string`,
  `exceptionMonthdays: string`, `exceptionDates: { from: string; to: string }[]`,
  `exceptionBehavior: 'Skip' | 'Shift'`.
- `serializeRecurrence` (when `isRecurring`): add `recurring_exception_weekdays`,
  `recurring_exception_monthdays`, `recurring_exception_dates: JSON.stringify(exceptionDates)`,
  `recurring_exception_behavior`.
- `recurrenceFromDetail`: read `d.exception_weekdays`, `d.exception_monthdays`,
  `d.exception_dates` (already a list from the API; also tolerate a JSON string), `d.exception_behavior`.
- `summarizeRecurrence`: append e.g. `, except Sun & the 25th (skip)`.
- Export `MONTH_DAYS = [1..31]` for the grid.

## Frontend UI — both platforms (own design system each)

- **Mobile** (`frontend/src/components/RecurrenceEditor.tsx`, shared, used by mobile
  ProjectItemScreen + CreateProjectItemSheet): add an "Exceptions" block under the recurring
  fields — weekday chips (into `exceptionWeekdays`), a 1–31 day grid (`exceptionMonthdays`),
  a specific-dates/range list with add/remove (native `<input type="date">` — mobile allows),
  and a Skip/Shift `SearchableSelect`.
- **Web**: web hand-rolls a minimal recurrence block (freq + until only) in
  `CreateProjectItemDialog.tsx` and `pages/ProjectItem.tsx` — leave that pre-existing gap
  alone. Add a new web component `frontend-web/src/components/RecurrenceExceptions.tsx`
  (web design: chips + shared `DatePicker` for dates per the web date convention + shared
  `SearchableSelect` for Skip/Shift) driven by the 4 exception values, and drop it into both
  web editors' `isRecurring` blocks. Web serializes the 4 fields into `fields` manually when
  recurring, and inits state from `data.recurring.exception_*` on ProjectItem.

## Ships

- Rebuild both bundles. `bench migrate` (patch). `sudo /usr/local/bin/tj-restart`.
- What's New: App Release row, Bahasa, platform `Both`, published=1, semver bump.
- No gen_docs (fields only — no new doctype/endpoint/hook).
