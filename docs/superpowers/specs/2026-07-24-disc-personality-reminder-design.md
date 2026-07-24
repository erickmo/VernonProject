# DISC + Personality Test Reminder — Design

**Date:** 2026-07-24
**Status:** Approved, implementing

## Goal

Admin-toggleable reminder that nudges every internal & intern user to take the
DISC test and the personality (Big Five/OCEAN) test. Results are stored on the
user's Employee Profile **read-only**. While a user hasn't finished both, a
dismissible popup re-appears every N hours (N is a setting). Default OFF — inert
until an admin enables it.

## Decisions (from brainstorming)

- **Test mechanism:** reuse the existing recruitment instrument engine
  (`api/recruitment_instruments.py`) — DISC + Big Five question banks + scoring.
  No new question content.
- **Popup behavior:** dismissible nudge every N hours (NOT a hard blocking gate).
  [Take now] opens the test; [Later] stamps localStorage and it returns after N h.
- **Read-only rule:** stored result is permanent & view-only for the user;
  a SysMgr can reset it to force a retake.
- **Scope:** `custom_member_type in ("Internal Team", "Intern")`.
- **Personality instrument:** the existing Big Five/OCEAN bank.
- Blueprint: the Daily Recognition Gate (settings toggle → boot → popup).

## Reused engine — exact contract

`vernon_project/api/recruitment_instruments.py`:
- `public_disc()` → `[{id, words:[str,str,str,str]}]`
- `public_bigfive()` → `[{id, text}]`
- `score_disc(answers)` where `answers = {item_id: {"most": wordIdx, "least": wordIdx}}`
  → `(scores {D,I,S,C: 0-100}, dominant_str)`
- `score_bigfive(answers)` where `answers = {item_id: 1..5}` → `{O,C,E,A,N: 0-100}`

Both score functions already validate ranges and ignore malformed input.

## Backend

### 1. Vernon Settings (2 new fields, mirror `force_daily_recognition`)
`vernon_settings.json`, in the Gamification section after `recognition_gate_start_time`:
- `force_disc_reminder` (Check, default 0) — the toggle. Inert-by-default.
- `disc_reminder_hours` (Int, default 24, `depends_on: force_disc_reminder`) — nudge interval.

Expose in `mobile.py`:
- `get_app_settings()` (~:2368) → add `force_disc_reminder` (int), `disc_reminder_hours` (int, default 24).
- `save_app_settings()` (~:2441) → add params `force_disc_reminder`, `disc_reminder_hours`;
  the check saved like `force_daily_recognition`, hours added to the int_fields block (floor 1).

### 2. Employee Profile (5 read-only fields)
`employee_profile.json`, new section `psychometric_section` "Psychometric (read-only)":
- `disc_scores` (Small Text) — JSON `{D,I,S,C}`
- `disc_type` (Data) — dominant letter(s)
- `disc_completed_on` (Datetime)
- `personality_scores` (Small Text) — JSON `{O,C,E,A,N}`
- `personality_completed_on` (Datetime)

Add to `field_order`. permlevel 0 (owner can read own via existing All-read perm).
**Do NOT add to `EMPLOYEE_SOFT_FIELDS`** (mobile.py:27) → users can never write them.

### 3. New `vernon_project/api/disc_test.py` (4 whitelisted endpoints)
- `get_disc_reminder()` → `{enabled:int, owed:int, hours:int}`.
  `owed = enabled and member_type in ("Internal Team","Intern") and (not disc_completed_on or not personality_completed_on)`.
- `get_disc_questions()` → `{disc: public_disc(), personality: public_bigfive(),
  disc_done:int, personality_done:int}` (done flags let the UI skip a finished sub-test).
- `submit_disc_test(disc_answers=None, personality_answers=None)` — parse JSON if str;
  ensure profile; for each sub-test **only if its completed_on is empty** (permanent),
  score & store (`json.dumps` the scores) + set completed_on = now. Idempotent (skips
  already-done). Returns stored `{disc_type, disc_scores, personality_scores, ...}`.
- `reset_disc(user)` — SysMgr only; clears the 5 fields so the user is reminded again.

Reuse `_ensure_employee_profile` from the employee_profile controller. member type
via `frappe.db.get_value("User", user, "custom_member_type")`.

No scheduler, no hooks change, no new doctype, no new notification type.
**Skipped:** daily push (`notify_recognition_gate`-style) — popup is the reminder;
add only if reaching users who aren't in the app is later required.

## Frontend (both /m and /w)

Shared logic in `frontend/src` (web imports via `@`), same as `DailyRecognitionGate`.

### Shared (`frontend/src`)
- `lib/api.ts`: `getDiscReminder()`, `getDiscQuestions()`, `submitDiscTest(disc, personality)`, `resetDisc(user)`.
- `hooks/useData.ts`: `useDiscReminder()` (plain `useQuery`, no poll — like `useRecognitionGate`).
- `lib/types.ts`: extend the app-settings type with `force_disc_reminder`, `disc_reminder_hours`.
- `components/DiscReminderPopup.tsx` (shared, both frontends mount it):
  - On load `useDiscReminder()`. Show popup iff `owed && now - localStorage["disc_reminder_dismissed_at"] > hours*3600e3`.
  - [Take now] → test flow modal. [Later] → stamp localStorage, close (returns after N h).
  - Test flow: `getDiscQuestions()`; render DISC (each item = 4 words, pick MOST + LEAST,
    most≠least) and Big Five (Likert 1–5); skip a sub-test whose `*_done` is true;
    submit answers in the exact shapes above; on success close (popup won't recur).
  - No native `alert/confirm` (use the modal). Number input clamped on blur, not per keystroke.

### Mobile (`frontend/src`)
- Mount `<DiscReminderPopup/>` in `App.tsx` near `<DailyRecognitionGate/>`.
- `pages/SettingsScreen.tsx`: toggle + hours input (Soft-Pop), hours shown only when toggle on.
- Profile view: compact read-only results card (DISC type + Big Five bars) shown only if completed.

### Web (`frontend-web/src`)
- Mount `<DiscReminderPopup/>` (from `@/components`) in `App.tsx` near the recognition gate.
- `pages/Settings.tsx`: toggle + hours input (bento).
- `pages/UserDashboard.tsx`: read-only results display shown only if completed.

**Ponytail:** one shared popup/test component for both frontends (precedent:
`DailyRecognitionGate`). Per-device throttle in localStorage — `// ponytail: per-device;
move server-side only if "nudge must sync across devices" comes up`.

## Deploy / verify
- `bench migrate` (additive fields), `npm run build` both bundles, `sudo /usr/local/bin/tj-restart`.
- Verify each endpoint via `frappe.call` on the live site; grep built bundles for a
  distinctive feature string to confirm it shipped.
- `python3 scripts/gen_docs.py` (new endpoints) + commit `docs/assets/data.js`.
- **What's New: SKIP.** Feature is inert by default (setting defaults 0/off → no
  user-visible change until an admin enables it), per the CLAUDE.md inert-default rule.
