# Recurring Project Todo — continuity tracking + richer repeat rules

**Date:** 2026-07-05
**Status:** Design (awaiting review)
**Doctype:** `Project Todo` (standalone; enhance the existing occurrence chain — no new doctype)

## 1. Goals

1. **Track continuity of a recurring job** — always be able to answer "is this series still running, when does it fire next, or is it paused/ended?" and never let a deleted/cancelled occurrence silently stop the series.
2. **Richer repeat rules** beyond today's fixed Daily/Weekly/Monthly-at-interval-1:
   - every **N** days / weeks / months (interval),
   - **weekly on specific weekday(s)**, every N weeks (e.g. every 2 weeks on Mon + Thu),
   - **monthly on a day-of-month**, every N months (e.g. the 15th every 3 months),
   - **monthly on the Nth weekday**, every N months (e.g. 2nd Tuesday, Last Friday).
3. **Dates roll forward relative to the occurrence** — the next `deadline` lands on the rule's true target; `start_date` (and `leader_deadline`/`owner_deadline`) shift to preserve their offset.

## 2. Non-goals (deliberately out of scope)

No new Recurring-Series parent doctype (we enhance the chain). No per-occurrence rule overrides. No time-of-day (all fields are `Date`). No hourly/yearly frequency. No 5th-weekday ("Fifth") — First–Fourth + Last always resolve.

## 3. Current state (what we're changing)

- Fields today: `is_recurring`, `recurring_frequency` (Daily/Weekly/Monthly), `recurring_until`, `next_occurrence` (migrating flag), `original_todo` (**Data** = series-root name).
- **Two generators** exist and both stay: (a) `on_change` → `create_next_occurrence()` fires the instant a todo hits `✅ Completed`; (b) daily scheduler `tasks.py:create_recurring_todos()`. They avoid double-inserts only via a shared `exists()` dedup on `{project_detail, to_do, deadline, assigned_to}`.
- Continuity today: `original_todo` links children to root; `mobile.py` detail builds `occurrences[]` (root + children) and an `is_missed` flag; UI shows a "Recurrence history" panel. The schedule rides a **migrating `next_occurrence` flag** on the latest head — a deleted/cancelled occurrence strands it and the series silently dies.
- `calculate_next_occurrence(from_date)` is frappe-coupled and only does Daily +1d / Weekly +7d / Monthly +1mo. `leader_deadline`/`owner_deadline` are **not** carried forward at all.

## 4. Data model changes (`project_todo.json`)

New fields in the `recurring_section` (all `depends_on: eval:doc.is_recurring==1`, added to `field_order`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `recurring_interval` | Int | 1 | the "every **N**" units |
| `recurring_weekdays` | Data (CSV `MON,THU`) | "" | Weekly: which weekday(s). Nth-weekday: the single weekday |
| `recurring_monthly_mode` | Select `Day of Month`\|`Nth Weekday` | `Day of Month` | which monthly rule |
| `recurring_day_of_month` | Int (1–31) | "" | monthly anchor day (empty → legacy: derive from deadline) |
| `recurring_nth` | Select `First/Second/Third/Fourth/Last` | `First` | Nth-weekday selector |
| `recurring_paused` | Check | 0 | stored **on the series root**; pauses generation |

**Changed:** `original_todo` **Data → Link(`Project Todo`)** (keep `read_only`, `hidden`). Values are already docnames.

**Deprecated:** `next_occurrence` loses its scheduling role (see §6). The column may remain but is no longer armed/read for generation; the UI's "next fire" is computed live.

### 4.1 Migration patch (`patches.txt` + a patch module)

1. **Null dangling `original_todo`** before the fieldtype flip: `UPDATE ... SET original_todo = NULL WHERE original_todo != '' AND original_todo NOT IN (SELECT name FROM \`tabProject Todo\`)`. Otherwise the Link conversion / next save throws "Could not find Project Todo".
2. Flip the fieldtype (schema reload via the doctype JSON on `migrate`).
3. New rule fields default so **every existing recurring row keeps its exact current cadence** with zero data backfill (see §5.5).

> Note: Link integrity makes a root **undeletable while any child links to it** — a deliberate, desirable change (prevents stranding). `on_trash` already blocks delete unless Planned/Cancelled.

## 5. Recurrence rule semantics — pure, frappe-free date lib

Extract a pure module `recurrence.py` (stdlib `datetime`/`calendar` only), modeled on the testable `tasks._due_message`. `ProjectTodo.calculate_next_occurrence` becomes a thin wrapper that reads the rule off `self` and calls it. Signature:

```
next_occurrence(from_deadline: date, rule: Rule) -> date | None
```

`Rule` = `{frequency, interval, weekdays:set[int], monthly_mode, day_of_month:int|None, nth:str, anchor_day:int|None}` where weekdays use ISO 0=Mon…6=Sun.

### 5.1 Daily
`from_deadline + interval days`.

### 5.2 Weekly (interval N, weekday set W)
`from_deadline` is itself always in W (that's where the prior occurrence landed).
1. **Within-week, strictly after:** the smallest date `d > from_deadline` in the same ISO week whose weekday ∈ W. *(Must be `>`, never `>=`, or `next == current` and the series stalls forever behind dedup.)*
2. **Exhausted → jump N weeks by ISO Monday anchor:** `target_monday = (from_deadline − from_deadline.weekday()) + 7*interval`; return the **first** weekday ∈ W on/after `target_monday`. *(Anchor on the week's Monday, NOT `from_deadline`, or e.g. Mon+Thu/every-2wk degrades to Thursdays-only.)*
- **Empty W (legacy default):** treat W = {weekday of `from_deadline`} → collapses to exactly `+7*interval`, reproducing today's Weekly.
- **Mid-series rule edit where `from_deadline`'s weekday ∉ W:** accept the resulting short transitional interval (ponytail-commented), then normal cadence resumes.

### 5.3 Monthly — Day of Month (interval N, anchor day A)
`target = (from_deadline.year, from_deadline.month) + interval months`; `day = min(A, days_in(target))`.
- **A source:** if `recurring_day_of_month` is **set**, it is a **fixed anchor** → "day 31" restores to 31 in long months (Jan31→Feb28→**Mar31**→Apr30). If **empty (legacy)**, A = the *root's* deadline day; for existing rows with no anchor, derive from the occurrence deadline day, preserving today's clamp-drift behavior. *(New explicit rules restore; legacy rows don't change.)*

### 5.4 Monthly — Nth Weekday (interval N, nth ∈ First..Last, weekday w)
`target = month + interval`; resolve the `nth` occurrence of weekday `w` in `target` (`Last` = last such weekday). No drift (resolved fresh each month). `w` = the **single** entry of `recurring_weekdays` (validated to exactly one in this mode).

### 5.5 Back-compat guarantee
Daily→`+interval(=1)`; Weekly empty-W→`+7`; Monthly empty-anchor→`add_months(1)` clamp. Identical to current behavior for every existing row. **Unit tests must assert this across all 7 start weekdays incl. Sunday.**

### 5.6 Date shift onto the new occurrence
Compute `Δ = (next_deadline − old_deadline).days` **once**. For each of `start_date`, `leader_deadline`, `owner_deadline`: if set, `field + Δ`; if unset, leave unset (do **not** fabricate). `start_date` thus preserves its span; `validate_start_date` (start ≤ deadline) holds because span ≥ 0. No leader/owner ordering check exists, so shifting is safe.

## 6. Generation & continuity

**Retire the migrating flag.** Remove `next_occurrence` arming in `validate()`, the flag-based scheduler `WHERE`, and the `update_todo` re-arm. Two generation paths remain, both routed through **one shared helper** so guards can't diverge:

- `should_generate(series) -> bool`: series is recurring, **not paused** (read from root), **not ended** (`next_fire` exists and `≤ recurring_until` when set), and **no future occurrence already exists**.
- `build_occurrence(anchor, next_deadline)`: the single insert builder used by BOTH paths (kills the current two-near-duplicate-insert-bodies drift). Copies all rule fields, applies the §5.6 shift, sets `original_todo = anchor.original_todo or anchor.name`, `status = ⚪️ Planned`.

### 6.1 Series key
Everywhere (scheduler grouping, dedup, API): `series_key = COALESCE(NULLIF(original_todo,''), name)`. Reuse the existing `WHERE name = root OR original_todo = root` pattern — **never** a plain `GROUP BY original_todo` (roots have empty `original_todo`).

### 6.2 Self-healing daily scheduler (`create_recurring_todos`)
For each active, non-paused series: find the latest occurrence (anchor), compute `next_fire = next_occurrence(anchor.deadline, rule)`, and if `should_generate` and it isn't past `recurring_until`, generate it. Because every occurrence lands exactly on its pattern target, the latest occurrence is always a valid anchor — deleting an intermediate occurrence cannot strand the series.
- **Anchor choice:** latest by `deadline`, ties by `creation`. A manually bumped one-off deadline is contained by the series+deadline dedup; add a test for a manually-edited deadline.
- **Resume clamp:** on resume after a pause (or any long gap), clamp the next fire to the **first rule-valid date ≥ today** — never backfill the paused window: `next = max(next_occurrence(anchor.deadline, rule), first_rule_date_on_or_after(today, rule))`.

### 6.3 On-complete path (`create_next_occurrence`)
Keep firing on `✅ Completed`, but route through the same `should_generate` + `build_occurrence`. This is why the **paused guard must live in the shared helper** — completing a paused occurrence must NOT spawn a successor.

### 6.4 Dedup + race
Dedup key = `(series_key, next_deadline)`. Back it with a **DB unique constraint** (or a guarded get-or-create) so the on-complete txn and the daily scheduler txn can't both pass a check-then-insert at midnight. The current title-based `exists()` is advisory only and collides across two same-titled series.

### 6.5 Cancelled / Completed / deleted latest occurrence
- **Cancelled latest** = "skip this instance, continue the series": roll the next occurrence forward from the cancelled one's rule date; series+deadline dedup prevents recreating the just-cancelled date (no zombie cancel-regenerate loop). Explicit test.
- **Completed** → on-complete path already spawns the successor.
- **Deleted intermediate** → self-heal regenerates from the latest remaining anchor (continuity restored).

## 7. Series state (derived, in `mobile.py` detail)

Add a shared controller helper `series_state(series_key)` used by both the API and (for consistency) the scheduler's `should_generate`. In the detail endpoint (`shaped["recurring"]`):
- `state`: `paused` (root's `recurring_paused`) / `ended` (`next_fire is None` OR `next_fire > recurring_until`) / `active`.
- `next_fire`: computed live from latest occurrence + rule (uses the **same inclusive `recurring_until`** comparison as the scheduler; empty until = never ends).
- Also return the new rule fields (`interval`, `weekdays`, `monthly_mode`, `day_of_month`, `nth`, `paused`) in `extra = get_value(...)` and `shaped["recurring"]`.

## 8. API changes

- **`update_todo` (strict named-kwarg allowlist):** add params + body assignment for `recurring_interval`, `recurring_weekdays`, `recurring_monthly_mode`, `recurring_day_of_month`, `recurring_nth`, `recurring_paused`; clear them when `is_recurring` is turned off. Remove the `next_occurrence` re-arm block. *(This allowlist is the top silent-drop risk — the create path is fine.)*
- **Create path (`api.ts:createTask` → `frappe.client.insert`)** spreads arbitrary fields; new fields flow once the doctype has them + the form sends them. Gated only by field perms + `validate()` → validation must be robust (§9).
- **List projection:** optionally add `recurring_paused` so a "Paused" badge can render without a detail fetch.

## 9. Validation (`ProjectTodo.validate`, the trust boundary — create path has no API sanitization)

- `recurring_interval` coerced to `≥ 1`.
- `recurring_weekdays` parsed → uppercased → deduped → sorted by ISO weekday → **throw on unknown token**; canonical CSV re-stored.
- `recurring_day_of_month` ∈ 1–31 (or empty).
- `recurring_monthly_mode == "Nth Weekday"` ⇒ **exactly one** weekday in `recurring_weekdays` (RecurrenceEditor enforces single-select in this mode; validate is the backstop). Mode/frequency switches clear stale weekday values.
- Guard against an empty-after-parse weekday set producing a `None`/loop in the weekly search.

## 10. Frontend

- **`<RecurrenceEditor>` (new, shared):** owns enabled toggle, frequency, interval, weekday multiselect (Weekly) / single-select (Nth mode), monthly-mode switch, day-of-month input (1–31), nth select, until date. One `Recurrence` value type + `onChange`, reused by `CreateTodoInitial` and the API `recurring{}` shape. Replaces the two hand-rolled editor blocks (`CreateProjectItemSheet` 252–268, `ProjectItemScreen` 345–374), the two state clusters, and unifies the two submit serializers (one shared `serializeRecurrence`).
- **`summarizeRecurrence(rule) -> string`** shared helper for human display ("every 2 weeks on Mon, Thu", "2nd Tuesday monthly"). Replaces `Repeats {frequency}` badge (`ProjectItemScreen` 1100).
- **Recurrence history panel:** surface `state` + `next_fire`; **rework the `occurrences.length > 1` gate** to render for any recurring series (a fresh/paused single-occurrence series must still show its state).
- **`types.ts` `recurring{}`:** widen to the full rule + `state` + `next_fire` (single fan-out point).
- **`duplicateTodo`:** carry every new rule field (today it drops all but frequency/until → a duplicated Mon/Thu rule degrades silently).
- `QuickAddSheet` delegates to `CreateProjectItemSheet` → inherits the editor for free.

## 11. Testing

Pure date lib (`test_recurrence.py`, no site needed) — the high-risk surface:
- Weekly: `next != current` for every selected-weekday input; Mon+Thu/every-2wk full sequence `Mon w0, Thu w0, Mon w2, Thu w2` (no dropped Mondays); empty-W = `+7` across all 7 start weekdays incl. Sunday; `+7*interval` for interval>1.
- Monthly day-of-month: 31st across Feb/Apr at interval 1 **and** 3 (anchor restores); leap 29th restore; legacy empty-anchor preserves drift.
- Monthly Nth: First–Fourth + Last per month; `Last` correctness; interval jump.
- Shift: `Δ` applied to start/leader/owner; null fields stay null; span preserved.

Controller/scheduler (`test_project_todo.py`, `test_tasks.py`):
- Self-heal after deleting an intermediate occurrence; cancelled-latest skips-not-regenerates; pause blocks both generators; resume clamps to ≥ today (no backfill burst); `recurring_until` on-boundary (occurrence == until allowed, next blocked); dedup across two same-titled series; manually-bumped deadline doesn't collapse the series. Update/rewrite existing tests that assert on the retired `next_occurrence` flag.

## 12. Decisions taken from the adversarial review (flag any to change)

1. **`recurring_day_of_month` set = fixed anchor that restores** (day 31 → 31); empty = legacy derive-from-deadline (drift preserved). *(Alt: always store an explicit anchor at root creation.)*
2. **Nth-weekday reuses `recurring_weekdays`** (validated to exactly one) rather than a dedicated field — fewer schema fields; the ambiguity is closed by validation + single-select UI.
3. **`recurring_paused` stored on the series root**, read via `series_key`, so it survives occurrence churn.
4. **Cancelled latest = skip instance, continue series** (not regenerate, not stall).
5. **`next_occurrence` fully retired** as a scheduling flag; `next_fire` computed live.
6. **`recurring_weekdays` stays a validated Data CSV** (vs a MultiSelect child table / 7 Checks) — lazy, matches existing Data patterns; canonicalized in `validate`.

## 13. Rollout

1. Add fields + migration patch (null dangling `original_todo`, flip to Link).
2. Land pure `recurrence.py` + tests (independently verifiable, no site).
3. Rewrite `calculate_next_occurrence` wrapper + `build_occurrence`/`should_generate`/`series_state` helpers; route both generators through them; strengthen dedup + DB guard; retire `next_occurrence`.
4. Extend `mobile.py` detail + `update_todo`; list projection badge.
5. Frontend `RecurrenceEditor` + `summarizeRecurrence` + types + duplicate + history-panel state.
6. Controller/scheduler tests.
