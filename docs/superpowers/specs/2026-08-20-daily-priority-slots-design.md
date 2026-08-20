# Daily Priority Slots — Design

**Date:** 2026-08-20
**Status:** Approved, ready for implementation plan

## Problem

Everyone's day is a flat list of todos with no forced ranking. A project leader has no way
to say "this one, today, above everything else", and nothing makes a person's most important
work visually unmissable when they open the app.

## Solution in one paragraph

Every person gets a fixed number of **priority slots** per day (3). A project leader claims a
free slot by flagging one of that person's todos as a priority for its deadline date. A single
project may claim at most 2 of a person's 3 slots on a given day. A claimed priority that has
not reached 🟠 Done by end of day costs the assignee 250 points, and costs another 250 for every
further day it stays unfinished. The person's slots render as vibrant horizontal cards at the
top of the homepage on both frontends, with ghost placeholder cards for unclaimed slots.

## Decisions taken (and rejected alternatives)

| Decision | Chosen | Rejected |
|---|---|---|
| What occupies a slot | An existing `Project Todo` flagged `is_priority` | A standalone `Priority Slot` doctype; auto-deriving priorities from deadline |
| "Done that day" means | Status reaches 🟠 **Done** by end of day | Requiring ✅ Completed (punishes the assignee for a slow reviewer) |
| Miss penalty | −250 for the missed day, **and −250 for every further day** it stays Planned | One-shot −250 |
| Who may claim | Project **leader / owner / System Manager / project admin** | Assignee self-claim; anyone who can edit the todo |
| Homepage treatment | Horizontal swipe cards above the feed | Full-width strip; badging the existing Due Today list |
| Live numbers | 3 slots · max 2 per project · 250 points | Ship default-off |

## Data model

### `Project Todo` — one new field

| Field | Type | Notes |
|---|---|---|
| `is_priority` | Check, default 0 | Placed in the existing scheduling area near `deadline` |

### `Point Ledger` — one new Select option

`source` gains `Priority` (existing: Todo, Grant, Gift, Meeting, Attendance, Daily, Reward,
Achievement, Mentoring, Recognition, Feedback, Learning).

### `Vernon Settings` — new section "Daily Priorities"

| Field | Type | Live value | Meaning |
|---|---|---|---|
| `daily_priority_slots` | Int | 3 | Slots per person per day. **0 disables the whole feature** — guard, cron, payload and UI all no-op. |
| `max_project_priorities_per_day` | Int | 2 | Max slots one project may claim of one person on one day. 0 = no per-project cap. |
| `priority_miss_penalty` | Float | 250 | Entered positive, minted negative. 0 disables charging while slots stay visible. |

### Occupancy is derived, never stored

A slot on `(user, date)` is occupied by any `Project Todo` where
`is_priority = 1 AND assigned_to = user AND deadline = date AND status != '🚫 Cancelled'`.

There is no slot table, so there is no state to drift out of sync when a todo is reassigned,
rescheduled, cancelled or deleted. Cancelling a priority frees its slot immediately.

## Component 1 — slot guard (`ProjectTodo.validate_priority_slot`)

**Where:** `vernon_project/vernon_project/doctype/project_todo/project_todo.py`, a new method
called from `validate()` alongside `validate_estimated_max` (same shape: read a Vernon Settings
single value, `frappe.throw` on breach).

**Why the controller and not the endpoint:** every write path routes through `validate` —
`update_todo`, the desk form, bulk add, move-todos, a deadline change, a reassignment. Guarding
the claim endpoint alone would leave "leader moves an already-priority todo onto a full day"
and "leader reassigns a priority to someone whose slots are full" broken.

**Logic:**

```
if not self.is_priority: return
slots = Vernon Settings.daily_priority_slots
if not slots: return                      # feature off
throw if not self.deadline or not self.assigned_to
peers = Project Todo where is_priority=1, assigned_to=self.assigned_to,
                           deadline=self.deadline, status != Cancelled, name != self.name
throw if len(peers) >= slots                                  -> "Slot prioritas <nama> pada <tgl> sudah penuh (3/3)."
cap = Vernon Settings.max_project_priorities_per_day
throw if cap and len([p for p in peers if p.project == self.project]) >= cap
                                                              -> "Proyek ini sudah memakai 2 slot prioritas <nama> pada <tgl>."
```

Completed priorities still occupy their slot for that date — the day's history stays honest and
a finished slot cannot be recycled to stack a fourth priority on the same person.

**Claim API:** no new endpoint. `mobile.py::update_todo` gains an `is_priority` parameter,
gated to leader / owner / System Manager / project admin using the same guard `estimated`
already uses. The assignee may edit their todo but cannot flag it.

## Component 2 — penalty cron (`tasks.py::charge_missed_priorities`)

Hung on the existing `0 0 * * *` cron entry in `hooks.py`, beside `sweep_stale_plans`.

For `D = yesterday`:

1. No-op entirely if `daily_priority_slots == 0` or `priority_miss_penalty == 0`.
2. Select todos with `is_priority = 1 AND deadline <= D AND status = '⚪️ Planned'`
   (reaching 🟠 Done stops the bleed; Cancelled and Completed are excluded by the status filter).
3. For each, insert a `Point Ledger` row: `user = assigned_to`, `todo`, `project`,
   `source = "Priority"`, `point = -penalty`, `points_earned = -penalty`,
   `credited_on = D 23:59:59`, Bahasa note naming the todo.
4. **Idempotency:** skip when a `Priority` row already exists for that todo with `credited_on`
   inside `D`. Re-running the cron mints nothing.

Dating `credited_on` to the missed day (not the run time) also puts the deduction on the correct
day in the wallet log and daily points chart.

Selecting `deadline <= D` rather than `= D` is what produces the −250/day bleed: an unfinished
priority is re-charged each night, each night keyed to a different date, until it goes Done or is
cancelled.

## Component 3 — homepage payload

`mobile.py::get_dashboard` returns a new block:

```json
"priority": { "slots": 3, "items": [ {shaped todo}, ... ] }
```

`items` = my todos with `is_priority = 1 AND deadline = today`, **all statuses**. This cannot be
derived from the existing `due_today` array, which holds Planned-only todos: a priority marked
Done would vanish from the rail and "1/3 selesai" would be uncomputable.

`_shape_todo` also gains `is_priority` so ordinary todo cards elsewhere can carry a ⚡ mark.

A priority whose deadline has passed and which is still unfinished does **not** appear on today's
rail — it belongs to the day whose slot it took. It stays in the normal Overdue list (marked ⚡)
and keeps accruing −250 a night. Today's rail shows today's slots only.

## Component 4 — the vibrant rail

**One** component, `frontend/src/components/PriorityRail.tsx`, imported by mobile `Today.tsx`
and web `Home.tsx` through the `@` alias — the same reuse pattern web already uses for /m cards.
Placed above the todo feed. Renders nothing at all when `slots === 0`.

```
⚡ Prioritas Hari Ini              1/3 selesai
┌───────────┐ ┌───────────┐ ┌╌╌╌╌╌╌╌╌╌╌╌┐
│▌ ✅ Kirim │ │▌ Review   │ ╎     +     ╎
│  proposal │ │  kontrak  │ ╎  Slot     ╎
│  Web · 90m│ │  Legal·45m│ ╎  kosong   ╎
└───────────┘ └───────────┘ └╌╌╌╌╌╌╌╌╌╌╌┘
```

- Horizontally scrollable row, one card per slot, `slots` cards total.
- Occupied card: rank accent bar, title, project · estimated minutes, status pill; tap opens the
  todo (drawer on /w, screen on /m).
- Unoccupied card: dashed ghost, "Slot kosong", inert — only leaders fill slots.
- Header counts finished (status Done/Checked/Completed) over `slots`.

## Component 5 — leader control

Priority toggle in the todo detail overflow menu (`ProjectItemScreen.tsx` /m, `ProjectItem.tsx` /w),
visible only to leader / owner / SM / project admin.

No live "2/3 slot terpakai" counter: the backend's refusal message already names the assignee, the
date and the counts, so a counter would buy a separate endpoint and its own staleness story for
information the user gets anyway at the moment it matters.

## Component 6 — settings screens

The three fields in a "Daily Priorities" section of both settings UIs
(`SettingsScreen.tsx` /m, the web Settings page), wired through
`get_app_settings` / `save_app_settings`.

## Behaviour notes

- **Empty slots are never penalized.** Only a claimed-and-unfinished slot charges points.
- **Recurring series do not inherit `is_priority`.** `build_occurrence` copies an explicit field
  list; leaving `is_priority` out means occurrences start clean instead of silently overflowing a
  future day's slots. The leader re-flags each occurrence.
- **Past dates cannot be claimed** as a practical matter — the guard permits it, but the cron
  charges the miss the same night, so it self-corrects rather than needing its own rule.

## Testing

`vernon_project/api/test_priority_slots.py`, mirroring the existing `test_allocations.py` style:

1. Third priority on a full day throws; second within a 3-slot day passes.
2. Per-project cap: a project's third claim on one person's day throws while another project's
   first claim passes.
3. Cancelling a priority frees its slot.
4. `charge_missed_priorities` mints exactly one −250 row for a Planned priority, mints nothing on
   a second run, and mints nothing for one that reached Done.
5. A priority unfinished for three days carries three ledger rows, one per date.

This is the live site with no test database, so tests run last, against throwaway records that
are cleaned up.

## Ship checklist

- `bench migrate` (new fields + Select option), then `sudo /usr/local/bin/tj-restart`.
- Rebuild **both** bundles.
- `python3 scripts/gen_docs.py` — no new DocType, but the endpoint surface changes.
- Set the live Vernon Settings values: 3 / 2 / 250.
- Insert the App Release row (Bahasa, platform `Both`) — the feature is live, not inert.
