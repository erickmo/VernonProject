# Habit Tracker — Design Spec

**Date:** 2026-07-29
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** New personal, per-user habit tracker with DISC-personalized suggestions, streaks, and an optional daily push reminder. Ships to **both** frontends (`/m` mobile, `/w` web).

---

## 1. Purpose & principles

A personal habit tracker each user builds for themselves. Two sources of habits:

1. **Own** — user creates custom habits (title + emoji + cadence).
2. **Suggested** — a DISC-personalized starter set the user can adopt or ignore.

Design commitments:

- **Streaks only — no gamification tie-in.** Habit check-ins are self-reported. They mint **no** Point Ledger points and touch **no** score/level/badge. This is deliberate: self-report must never inflate the company gamification. Habits track streaks and completion, nothing more.
- **Personalization is server-side.** The suggestion list is derived from the caller's DISC dominant axis on the server, so both frontends render an identical set with no client mapping logic.
- **Both frontends, same capability.** Mobile = Soft-Pop cards; web = bento tiles. Shared logic (hook, types, api wrapper) lives in `frontend/src` (imported as `@` from web).

---

## 2. Data model — 2 new doctypes

Both mirror the per-user isolation convention of `personal_note` / `focus_timer`: `autoname: hash`, `naming_rule: Random`, a `user` Link→User field, role permissions granted to **System Manager only**, with real user isolation enforced by `get_permission_query_conditions` + `has_permission` hooks (so desk/list views are isolated too, matching Personal Note style A).

### 2.1 Habit

| Field | Type | Notes |
|---|---|---|
| `user` | Link → User | reqd, `search_index: 1`. Defaulted to `frappe.session.user` in `before_insert`. |
| `title` | Data | reqd. e.g. "Drink water". |
| `icon` | Data | emoji, optional. e.g. "💧". |
| `cadence` | Select | `Daily` / `Weekdays`. Default `Daily`. |
| `weekdays` | Data | CSV of weekday ints `0`(Mon)–`6`(Sun), used only when `cadence = Weekdays`. e.g. `0,2,4`. |
| `active` | Check | default `1`. Soft-delete = set `0` (keeps log history). |
| `disc_axis` | Data | provenance: the DISC axis (`D`/`I`/`S`/`C`) that suggested this habit, or empty if custom. Display/analytics only. |

Weekday convention: **0 = Monday … 6 = Sunday** (Python `date.weekday()`). This is the single source of truth for both the scheduler and the frontend picker.

### 2.2 Habit Log

One row = one completed check-in for a habit on a date. **Row presence means "done"** — there is no `done` field. Un-checking a day deletes the row.

| Field | Type | Notes |
|---|---|---|
| `user` | Link → User | reqd, `search_index: 1`. Denormalized from the habit for cheap scheduler queries. |
| `habit` | Link → Habit | reqd, `search_index: 1`. |
| `date` | Date | reqd, `search_index: 1`. |

Uniqueness: at most one row per `(habit, date)`. Enforced in the API (`toggle_habit` checks existence before insert), not a DB unique index — matches the app's API-as-trust-boundary convention.

No patch needed — plain `bench migrate` syncs the JSON.

---

## 3. Streak & schedule logic (server)

Computed per habit in `get_habits()`; the frontend renders values, never computes them.

- **`scheduled_today`** — `True` if `cadence = Daily`, or `cadence = Weekdays` and today's weekday ∈ `weekdays`.
- **`done_today`** — a Habit Log row exists for `(habit, today)`.
- **`current_streak`** — walk backward from today over *scheduled* days only (skipping non-scheduled weekdays), counting consecutive days that have a log, stopping at the first scheduled day with no log. Today counts only if already done; an as-yet-unchecked today does not break the streak (streak = count up to the last completed scheduled day).
- **`best_streak`** — longest such run in the habit's log history. Cheap: sort the habit's log dates, scan for the longest consecutive-scheduled run.
- **`week`** — an array of the last 7 calendar days: `[{date, scheduled, done}]` for the 7-dot week strip.

Streak walk respects `weekdays`: e.g. a Mon/Wed/Fri habit done last Mon+Wed+Fri has a streak of 3 even though calendar days were skipped.

### Self-check (ponytail rule)

`vernon_project/api/habit.py` ships a `_streak(...)` pure helper (log-date set + cadence + weekdays → current/best) with an `assert`-based `__main__`/`demo()` covering: daily unbroken run, daily with a gap, weekdays-only run skipping weekends, empty logs, and today-unchecked-but-yesterday-done. One runnable check, no framework.

---

## 4. Suggestions — DISC personalization

The suggestion library is a **Python constant** in `api/habit.py`, keyed by DISC axis. The server reads the caller's `disc_type` (dominant axis string, one or more of `D`/`I`/`S`/`C`) from their Employee Profile — reusing `_ensure_employee_profile(user)` / the `get_my_disc` path — and returns the union of suggestions for each axis present. If the user has no `disc_type` (hasn't taken DISC), return the **generic** set.

Each suggestion is `{key, title, icon, cadence, disc_axis}`. `key` is a stable slug so `adopt_suggestion` can look it up. Already-adopted suggestions (a Habit with the same `title` exists for the user) are filtered out of the returned list so the UI doesn't offer duplicates.

| Axis | Trait | Suggested habits |
|---|---|---|
| **D** — Dominance | driven, results, competitive | Set top-3 priorities each morning · Do the hardest task first · Workout / physical challenge · Review the weekly goal |
| **I** — Influence | social, enthusiastic, people | Message a colleague a thank-you · Share one win today · Reach out to someone new · Write one gratitude note |
| **S** — Steadiness | steady, routine, consistency | Same sleep & wake time · Daily walk · Drink water · Tidy the workspace at day's end |
| **C** — Conscientiousness | analytical, precise, planning | Plan tomorrow tonight · Reflect / journal 5 min · Read or learn 20 min · Clear the inbox to zero |
| _generic (no DISC)_ | — | Drink water · Read 20 min · Move / exercise · Plan the day · Sleep on time |

Titles ship in **Bahasa Indonesia** in the actual constant (end-user voice); English shown here for review. Emojis chosen per habit.

---

## 5. Daily reminder (inert until an admin enables it)

- New scheduled task `vernon_project.tasks.notify_habit_checkins`, appended to `scheduler_events["daily"]` in `hooks.py`.
- Gated by a new Vernon Settings `Check` field `habit_reminders` (label "Habit Reminders", default `"0"`). Task first line: `if not frappe.db.get_single_value("Vernon Settings", "habit_reminders"): return`.
- Recipients: users with ≥1 `active` habit scheduled today (respecting `weekdays`) and **no** Habit Log for any of their habits today. One reminder per user per day.
- Dedup: before sending, guard on `frappe.db.exists("Vernon Notification", {recipient, type, reference_doctype: "Habit", "creation": [">=", today]})`, mirroring `notify_due_todos`.
- Send via `_notify(recipient, type="Encouragement", title=…, body=…, reference_doctype="Habit")`. Reuses the existing `Encouragement` notification type → **zero doctype change**. `_notify` writes the in-app row and fires web push together.

> ponytail: reuse `Encouragement` type. Upgrade path — add a distinct `"Habit"` option to the Vernon Notification `type` Select only if the reminder needs its own icon/tap-routing. Not needed for v1.

Because the toggle defaults off, the reminder is **inert on ship** and is **not** announced in What's New until an admin turns it on (per the app's inert-default rule).

---

## 6. Frontend — both platforms

New personal screen at route `/habits`. Reached from a personal menu, **not** a bottom/primary tab:

- **Mobile:** add a route in `frontend/src/App.tsx`; add one menu row in the Me/Profile menu (`frontend/src/pages/Profile.tsx`). New page `frontend/src/pages/HabitsScreen.tsx` (Soft-Pop): today's habits as cards with a large check circle, 🔥 current-streak count, and a 7-dot week strip; a "Disarankan untukmu" (Suggested for you) section with adopt buttons; an add/edit habit sheet with title, emoji, and cadence (Daily / weekday multi-select).
- **Web:** add a route in `frontend-web/src/App.tsx`; add one `NavLeaf` to the `WORK` group in `frontend-web/src/lib/nav.ts` (no role gate). New page `frontend-web/src/pages/Habits.tsx` (bento tiles): today grid + per-habit streak tiles + a suggestions rail; add/edit via a dialog.

**Shared (in `frontend/src`, used by both):**
- `frontend/src/lib/api.ts` — a `habitApi` method object (const prefix `H = 'vernon_project.api.habit.'`) with `getHabits`, `createHabit`, `updateHabit`, `deleteHabit`, `toggleHabit`, `adoptSuggestion`. Params serialized like the personal-notes precedent.
- `frontend/src/hooks/useData.ts` — `useHabits()` query (key `habits: ['habits']`) + mutation hooks that `invalidateQueries({queryKey: keys.habits})` on settle.
- `frontend/src/lib/types.ts` — `Habit`, `HabitSuggestion`, `HabitWeekDot` interfaces.

Reuse existing primitives: DatePicker is not needed (check-in is today-centric); use the existing SearchableSelect/MultiSelect convention for weekday selection and the app's existing emoji/icon input if present, else a plain text field for the emoji.

---

## 7. Ship sequence

1. `bench migrate` — sync the two new doctypes + the Vernon Settings field.
2. `python3 scripts/gen_docs.py` — regenerate `docs/assets/data.js` (2 new doctypes + new endpoints). Add the new doctypes to the generator's `CLUSTERS` map (generator exits non-zero otherwise). Commit the regenerated file.
3. `npm run build` in **both** `frontend/` and `frontend-web/`.
4. `sudo /usr/local/bin/tj-restart`.
5. Insert an **App Release** row (What's New): announce the tracker (Both platforms), Bahasa, one bullet per line, `published=1`, semver-bumped. **Do not** announce the reminder — it's default-off/inert.
6. Verify: hit `get_habits` through the real endpoint for a test user; confirm both `/m/habits` and `/w/habits` render against the live bundle (grep the hashed bundle for a distinctive habit string).

---

## 8. Scope cuts (explicit, v1)

- No points / badges / gamification — streaks only.
- No per-habit reminder times — one daily reminder, admin-gated.
- No charts beyond the 7-dot week strip + current/best streak.
- Suggestions curated in code, **not** an admin-editable Habit Template doctype (revisit if HR wants to tune the list without a deploy).
- Cadence is Daily or specific weekdays only — no "X times per week" frequency goals.
- Soft-delete (archive) only; no hard-delete UI.

---

## 9. Files touched

**New:**
- `vernon_project/vernon_project/doctype/habit/{habit.json,habit.py,__init__.py}`
- `vernon_project/vernon_project/doctype/habit_log/{habit_log.json,habit_log.py,__init__.py}`
- `vernon_project/api/habit.py`
- `frontend/src/pages/HabitsScreen.tsx`
- `frontend-web/src/pages/Habits.tsx`

**Edited:**
- `vernon_project/hooks.py` — `permission_query_conditions`, `has_permission`, `scheduler_events.daily`.
- `vernon_project/tasks.py` — `notify_habit_checkins`.
- `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` — `habit_reminders` Check.
- `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`, `frontend/src/lib/types.ts`.
- `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx` (mobile route + menu).
- `frontend-web/src/App.tsx`, `frontend-web/src/lib/nav.ts` (web route + nav).
- `scripts/gen_docs.py` — add Habit/Habit Log to `CLUSTERS`.
