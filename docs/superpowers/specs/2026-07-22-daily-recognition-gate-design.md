# Daily Recognition Gate — design

Force each Internal-Team member to cast **one superpower vote per day** for an
Internal-Team colleague they have not yet voted for, until they have voted for
every colleague. Blocking full-screen gate on app open + a daily push reminder.

Extends the existing Superpowers system (`api/superpowers.py`, `Superpower Vote`).
Sibling to the existing self-claim gate (`force_superpower_onboarding`).

## Rules

- **Membership**: voter and target are both `User.custom_member_type == "Internal Team"`.
  Non-internal users get no gate and no push.
- **colleagues** = enabled Internal-Team users, excluding self.
- **unvoted** = colleagues with zero `Superpower Vote` cast by me.
- **owed today** = `unvoted` is non-empty AND my voted-colleague set did *not grow
  today* — i.e. there is no colleague whose *first-ever* vote from me is dated today.
  This enforces exactly one *new* colleague per day; adding extra traits to an
  already-voted colleague cannot clear the gate.
- **assignee** = the `unvoted` colleague with the **fewest votes received**
  (tiebreak: `full_name`). Spreads recognition evenly.
- **done** = `unvoted` empty → gate never shows again.
- Whole feature gated by `Vernon Settings.force_daily_recognition` (Check, default 0).
  Inert until enabled.

No new doctype — all state derives from existing `Superpower Vote` rows.

## Backend (`vernon_project/api/superpowers.py`)

- `get_recognition_gate()` → `{ owed: bool, assignee: {user,user_name,user_image,avatar_config}|null, remaining: int, total: int }`
- `notify_recognition_gate()` — daily scheduler; push type `Kudos` to each owing
  Internal-Team member: "Beri superpower untuk <colleague>".
- helpers: `_internal_colleagues(user)`, `_unvoted(user, colleagues)`,
  `_grew_today(user, colleagues)`, `_assign(unvoted)`.
- `hooks.py`: add `notify_recognition_gate` to `scheduler_events["daily"]`.
- `Vernon Settings`: add `force_daily_recognition` Check (default 0).

## Frontend (shared component, mounted both /m and /w)

- `frontend/src/lib/api.ts`: `getRecognitionGate()`.
- `frontend/src/lib/types.ts`: `RecognitionGate`, `RecognitionAssignee`.
- `frontend/src/hooks/useData.ts`: `keys.recognitionGate`, `useRecognitionGate()`;
  extend `useCastVote` to also invalidate `recognitionGate`.
- `frontend/src/components/DailyRecognitionGate.tsx` — full-screen blocking modal
  (styled on existing `SuperpowerGate`): assignee avatar/name + Voted-trait picker
  + 0–10 score + Kirim → `castVote(assignee, trait, score)` → gate clears for today.
  No skip button. Reused on web (like `SuperpowerGate`).
- Mount in `frontend/src/App.tsx` and `frontend-web/src/App.tsx`, after the
  self-claim `superpowerBlocked` gate (self-claim takes priority).

## Housekeeping

- `scripts/gen_docs.py` (new endpoint + field).
- What's New entry after the flag is enabled live.

## Skipped (YAGNI)

Completion celebration screen; per-day storage table; weekly giver caps.
Add when asked.
