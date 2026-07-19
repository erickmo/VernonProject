# Superpowers v2 — explanation, performance-earned traits, badge UI

**Date:** 2026-07-19
**Status:** Approved, pending implementation
**Builds on:** 2026-07-19-superpowers-design.md

## Three changes

1. **Explanation** on the superpower page: a short intro (Bahasa) — a superpower is
   your core strength/skill, used to decide your involvement in tasks and contribution.
2. **Performance-earned superpowers** — a new kind, auto-computed from app data
   (attendance punctuality, beating deadlines, streak, throughput). Not votable, not
   self-claimed.
3. **My Superpowers UI** — replace the dropdown select with a tap-to-toggle badge grid;
   each claimed badge shows its level/score. Add a "Kinerja" (Performance) tab.

## Data model changes

### `Superpower` catalog — two new fields
- `kind` (Select: `Voted` [default] / `Performance`). `Voted` = self-claim + peer-vote
  (existing behavior). `Performance` = system-earned; cannot be claimed or voted.
- `metric` (Data) — for `Performance` rows, the computation key: `ontime`,
  `beat_deadline`, `streak`, `finisher`.

### `Superpower Settings` — performance knobs
- `perf_window_days` (Int, default 30) — lookback window.
- `streak_target` (Int, default 30) — streak length that maps to score 10.
- `finisher_target` (Int, default 30) — completed-todo count that maps to score 10.

### Seed (patch, idempotent)
Four `Performance` catalog rows (cool names + emoji icons + hex colors):
- **Timekeeper** — `ontime`
- **Deadline Slayer** — `beat_deadline`
- **Iron Streak** — `streak`
- **Finisher** — `finisher`

## Performance scoring (live, no scheduler)

All computed over the last `perf_window_days`, for the profile's user, mapped to a
0–10 `score`, then to the same level bands via the existing `_level_for`.

- **ontime** (Timekeeper): from `Daily Attendance` (employee=user, attendance_date in
  window). on-time = status in {`Present`, `EarlyLeave`}; late = status in {`Late`,
  `Late+EarlyLeave`}. `score = on_time / (on_time + late) * 10`; 0 when no such days.
- **beat_deadline** (Deadline Slayer): from `Project Todo` (assigned_to=user,
  status=`✅ Completed`, `completed_at` in window). on-time = `date(completed_at) <=
  deadline`. `score = on_time / total_completed * 10`; 0 when none.
- **streak** (Iron Streak): current consecutive-day run ending today or yesterday where
  the user completed ≥1 todo (`completed_at` date) OR has a Present/Late/EarlyLeave
  attendance. `score = min(streak, streak_target) / streak_target * 10`.
- **finisher** (Finisher): count of `✅ Completed` todos (assigned_to=user, `completed_at`
  in window). `score = min(count, finisher_target) / finisher_target * 10`.

Each performance item is shaped like a voted item:
`{superpower, name, icon, color, category, kind:"Performance", metric, score, count?, level, detail}`
where `detail` is a short human string (e.g. "27/30 tepat waktu").

## API — `api/superpowers.py`

- `list_superpowers()` — add `kind` to the returned fields. (Used by the my-editor to
  show only `Voted` traits as toggle chips.)
- `get_user_superpowers(user)` — add `performance: [perf items…]` (the 4, computed).
  `mine`/`voted`/`signature`/`achievement` unchanged; `signature` still = max-W voted,
  `achievement` still = a voted trait at the top band. (Performance shown in its own tab.)
- `set_my_superpowers(user, superpowers)` — accept only `kind = Voted` enabled traits
  (silently drop Performance/unknown).
- `cast_vote(ratee, superpower, score)` — reject voting a `Performance` trait
  (`frappe.throw`).
- `get_superpower_settings` / `save_superpower_settings` — include the 3 perf knobs.
- Helpers: `_perf_scores(user)` computing the 4 metrics; reuse `_level_for`, `_settings`.

## Frontend (both /m and /w)

**Intro card** (top of the per-person superpower screen): the Bahasa explanation.

**My Superpowers tab** — tap-to-toggle badge grid:
- Show every `Voted` catalog trait as a chip. Claimed = filled/active; unclaimed =
  outline. Tapping toggles membership → `set_my_superpowers` with the updated set
  (only on the viewer's own profile / admin; read-only otherwise).
- Each claimed chip also shows that trait's peer-voted level + score (from `voted`),
  when it has votes.

**Kinerja (Performance) tab** — the 4 `performance` items as read-only badges: name,
level badge (color/icon), score (1 decimal) and the `detail` string. Same on every
profile (your own and others').

**Peer-Voted tab** — unchanged, but the "add a trait to vote on" picker and votable
list exclude `Performance` traits (they aren't in `voted` and aren't votable).

Segmented control now has 3 tabs: **Superpower Saya** · **Dinilai Rekan** · **Kinerja**.

**Admin settings screen** — add the 3 perf knobs (window/streak target/finisher target);
the catalog editor shows `kind` (and `metric` when Performance) read-only-ish; admins
manage `Voted` traits as before (performance rows are seed-managed).

## Testing (`test_superpowers.py` additions)

- `ontime`/`beat_deadline`/`streak`/`finisher` score math on seeded fixtures
  (e.g. 8 on-time + 2 late attendance → score 8.0; 3/4 todos before deadline → 7.5).
- `set_my_superpowers` drops a Performance trait; `cast_vote` on a Performance trait raises.
- `get_user_superpowers` returns 4 performance items with levels.

## Deploy

- New fields ⇒ `bench migrate`; seed patch adds the 4 performance rows + knob defaults.
- Python ⇒ restart. Frontend ⇒ rebuild both. gen_docs unaffected (no new DocType).
- User-visible ⇒ App Release entry.
