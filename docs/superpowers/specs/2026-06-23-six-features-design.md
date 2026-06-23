# Six Features — Design Spec

**Date:** 2026-06-23
**Branch base:** `feat/gift-points` (current)
**Status:** Approved, pending implementation plan

## Overview

Six new features for the Vernon PWA, built in dependency order. Several are small;
two (notifications, comment image+mention) are large and coupled — `@mention` fires a
notification, so notifications land first.

**Build order:** #5 → #3 → #6 → #2 → #1 → #4

| # | Feature | Size | Touches |
|---|---------|------|---------|
| 5 | Comments newest-first | 1 line | backend |
| 3 | Reward detail drawer | small | frontend |
| 6 | Review filter "I led / I own" | small | full-stack |
| 2 | Badge by points earned (sysmgr config) | medium | full-stack + new doctype |
| 1 | Notifications (in-app feed + Web Push) | large | full-stack + 2 new doctypes + SW + deploy |
| 4 | Comment image upload + @mention | medium | full-stack (mention couples to #1) |

## Decisions locked

- **Notification channel:** in-app feed **and** Web Push (background, app-closed).
- **Notification delivery architecture:** **A — poll feed + Web Push.** Bell polls
  `get_notifications` via react-query (~30s refetch); Web Push for background. No socketio.
  Realtime can be added later if the ≤30s in-app lag is a problem.
- **Notification events (all four):** task assigned to me; needs-my-approval / approved;
  comment or @mention on my item; points granted/gifted/redemption-fulfilled to me.
- **Review filter location:** Review tab (`Review.tsx`), the approval queue.
- **Badge metric:** lifetime points earned, **Todo-source only** (exclude Grant + Gift) —
  `SUM(Point Ledger.points_earned WHERE source='Todo')`. Matches leaderboard semantics; never drops.
- **Mention scope:** project participants only (owner/leader/admin/team + assignees).
- **Badge display:** Profile chip + leaderboard rows + comment author.
- **Comment image:** 5 MB cap, raster only, stored inline as `<img>` in the Comment HTML content.

## Codebase grounding (verified during recon)

- API layer: all PWA endpoints in `vernon_project/api/mobile.py`; identity is `frappe.session.user`
  (Frappe session cookie, no token). Role gates: `_require_system_manager()` (`mobile.py:24`),
  `_require_points_granter()` (`mobile.py:1752`), `_require_marketplace_manager()` (`mobile.py:1671`).
- Frontend: routes in `App.tsx` (basename `/m`); fetch wrapper `lib/api.ts` (`api.get`/`api.post`,
  `mobileApi.*`); react-query hooks in `hooks/useData.ts`; boot payload cached under key `['boot']`
  via `useBoot()`; types in `lib/types.ts`. Toast via `useToast`, confirm via `useConfirm`
  (never native alert/confirm).
- Points: `Point Ledger` doctype is the source of truth; `points_earned` is the credited amount;
  `source ∈ {Todo, Grant, Gift}`. Balance computed live in `_user_balance` (`mobile.py:1383`).
- Comments: Frappe built-in `Comment` doctype (`comment_type="Comment"`), HTML `content`,
  attached via `reference_doctype`+`reference_name`. `get_comments` (`mobile.py:694`),
  `add_comment` (`mobile.py:713`). `COMMENTABLE = {Project, Project Detail, Project Todo}` (`mobile.py:657`).
- Rewards: `Marketplace Reward` + `Reward Redemption` doctypes; `get_marketplace` (`mobile.py:1592`),
  `redeem_reward` (`mobile.py:1607`); fulfillment is a generic `/api/resource` update (no custom endpoint today).
- Projects: ownership on `Project` (`project_owner`, `project_leader`), not on `Project Todo`.
  `get_projects` (`mobile.py:443`) already tags each row `is_owner`/`is_leader`/`is_admin`/`is_member`
  (`mobile.py:497`). `get_dashboard` (`mobile.py:381`) review rows do **not** carry these yet.
- Service workers: `vernon_project/www/vernon_sw.js` and `frontend/sw-custom.js` are byte-identical,
  cache-only. No push code, no VAPID. Must be kept in sync.

---

## Feature #5 — Comments newest-first

**Change:** `mobile.py:706` `order_by="creation asc"` → `order_by="creation desc"`.
Composer (`CommentThread.tsx` textarea) stays below the list; newest comment renders at top.
No frontend change needed (renders in API order).

**Acceptance:** Open any item with ≥2 comments → newest appears first.

---

## Feature #3 — Reward detail drawer

**New component** `frontend/src/components/RewardDetailSheet.tsx`, mirroring `RedeemSheet`
container idiom (`fixed inset-0 z-50 bg-black/40`, backdrop-click closes, `stopPropagation`
on panel, `rounded-t-3xl bg-white dark:bg-slate-800`, grab-handle pill, `max-w-md`,
`pb-[calc(env(safe-area-inset-bottom)+1.25rem)]`).

Props: `{ reward: MarketplaceReward | null, balance, onRedeem, onClose }`.
Renders: large image (`object-cover`, Store-icon fallback), `reward_name`, full `description`
(no line-clamp), `point_cost` pts, stock pill, and a primary "Redeem" button — disabled with the
same rules as the card (sold out / too pricey), label flips accordingly.

**`MarketplaceScreen.tsx` change:** card tap sets `detail` reward (opens `RewardDetailSheet`)
instead of `selected` (which today opens `RedeemSheet` directly). "Redeem" inside the detail sheet
then sets `selected` → existing `RedeemSheet` confirm flow runs unchanged. Two-step: browse → detail
→ confirm.

**Acceptance:** Tap a reward card → detail drawer with full description and image → Redeem →
confirm sheet → balance updates via existing `useRedeemReward`.

---

## Feature #6 — Review filter "I led / I own"

**Backend:** `get_dashboard` (`mobile.py:381`) review-bucket rows must carry relationship flags.
Add, per review item, `is_owner = project.project_owner == user` and
`is_leader = project.project_leader == user` (mirror `get_projects` `mobile.py:497-501`; the
review items already reference their project, so look up owner/leader from the project meta already
loaded, or a single `_project_roles` map to avoid N queries).

**Frontend:** `Review.tsx` gains a segmented control `[ All | I own | I led ]` (state `rel`,
default `all`). Predicate over the existing review list:
`rel === 'all' || (rel === 'owned' ? r.is_owner : r.is_leader)`.
Add `is_owner`/`is_leader` to the review-item type in `types.ts` (`Dashboard` review row shape).

**Acceptance:** As a user who owns project A and leads project B, the toggle narrows the review
queue to A-only / B-only / all.

---

## Feature #2 — Badge by points earned (System Manager configurable)

**New Single doctype** `Badge Settings` (`issingle: 1`), System Manager perms only, with a child
table:

- `Badge Tier` (`istable: 1`): `tier_name` (Data, reqd), `min_points` (Float, reqd),
  `color` (Data — hex or token), `icon` (Data — emoji or icon name, optional).

Place both under `vernon_project/vernon_project/doctype/`.

**Backend compute** — `_user_badge(user)` in `mobile.py`: read `Badge Settings.tiers` ordered by
`min_points` desc; `earned = SUM(Point Ledger.points_earned WHERE user=? AND source='Todo')`;
return the highest tier whose `min_points ≤ earned` (or null if none / no tiers configured).
Cache the tiers per request.

**Surfacing:**
- `bootstrap()` (`mobile.py:357`) returns a `badge` object `{tier_name, color, icon}` (or null).
- `Boot` type (`types.ts:3`) gains `badge?: Badge | null`; new `Badge` type.
- `Profile.tsx` renders the badge chip near the name (mirror role-chip pattern `Profile.tsx:78`).
- Leaderboard: `get_leaderboard` entries gain each user's badge; `LeaderboardScreen` rows show it.
- Comment author: `_shape_comment` (`mobile.py:680`) gains `by_badge`; `CommentThread.tsx` shows it.

**Admin UI** — new route `/badge-settings` (gated `canManageBadges` = System Manager), screen
`BadgeSettingsScreen.tsx` mirroring `GroupFormScreen` form idiom: editable list of tiers
(tier_name, min_points, color, icon), loaded + saved via a custom `get_badge_settings()` /
`save_badge_settings(tiers)` endpoint pair in `mobile.py` (gated System Manager) — chosen over raw
`/api/resource` so the single's child-table write and the gating live in one whitelisted place,
matching the rest of the mobile API. Linked from Profile admin nav.

**Acceptance:** System Manager defines tiers (e.g. Bronze 0 / Silver 500 / Gold 2000); a user with
1200 Todo-source points earned shows "Silver" on Profile, leaderboard, and their comments; grants/gifts
do not change the badge.

---

## Feature #1 — Notifications (in-app feed + Web Push)

### Data model (2 new doctypes)

- `Vernon Notification` (namespaced — Frappe owns "Notification"):
  `recipient` (Link User, reqd), `type` (Select: Assignment / Approval / Comment / Mention /
  Points / Redemption), `title` (Data), `body` (Small Text), `reference_doctype` (Data),
  `reference_name` (Data), `actor` (Link User), `is_read` (Check, default 0). Autoname hash.
  Perms: System Manager full; recipient reads own via endpoint (ignore_permissions in API).
- `Push Subscription`: `user` (Link User), `endpoint` (Data, unique, reqd), `p256dh` (Data),
  `auth` (Data), `user_agent` (Data). Autoname hash. One row per browser/device.

### Endpoints (`mobile.py`)

- `get_notifications(limit=30)` → `{ items: [...], unread: N }`, newest first, recipient = session user.
- `mark_notification_read(name)` → set `is_read=1` for own notification.
- `mark_all_read()` → bulk set own unread to read.
- `register_push_subscription(subscription)` → upsert `Push Subscription` by endpoint for session user.
- `unregister_push_subscription(endpoint)` → delete by endpoint.
- Internal `_notify(recipient, type, title, body, reference_doctype=None, reference_name=None,
  actor=None)`: insert `Vernon Notification`, then send Web Push to every `Push Subscription` of
  `recipient` (best-effort; on 404/410 delete the dead subscription). Never raise into the caller —
  notification failure must not break the triggering action. Skip self-notification
  (`recipient == actor`).

### Web Push infra

- **VAPID:** keypair generated once, stored in `site_config.json`
  (`vapid_public_key`, `vapid_private_key`, `vapid_subject`). Public key exposed to frontend via
  `bootstrap()` (`vapid_public_key`) so the client can `pushManager.subscribe`.
- **Library:** `pywebpush` installed in the bench env (deploy prerequisite — see below).
- **SW handlers** added to **both** `vernon_project/www/vernon_sw.js` and `frontend/sw-custom.js`
  (keep identical): `self.addEventListener('push', ...)` → `showNotification(title, {body, data:{url}})`;
  `self.addEventListener('notificationclick', ...)` → focus existing client or `openWindow(url)` to the
  deep-link. Bump `ASSET_CACHE` version.

### Frontend

- `useNotifications()` hook — react-query, `refetchInterval: 30_000`, returns items + unread count.
- `useMarkRead` / `useMarkAllRead` mutations (invalidate notifications).
- **Bell** in the tab header (TabScreen header area) with unread-count badge; tap opens a
  `NotificationSheet` listing items (title, body, relative time, unread dot), "Mark all read" action,
  tap an item → `mark_notification_read` + navigate to `reference_doctype`/`reference_name` deep link.
- **Push permission flow:** after first successful boot, if `Notification.permission === 'default'`,
  show a soft prompt (dialog) offering to enable; on accept call `Notification.requestPermission()`,
  then `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: vapidPublicKey })`,
  POST result to `register_push_subscription`. Also a toggle in `Profile.tsx` to enable/disable
  (subscribe / `unregister_push_subscription`).
- Types: `Notification` and `Badge`/push types in `types.ts`.

### Send-hook sites

- **Assignment** — `update_todo` (`mobile.py:932`): when `assigned_to` changes, `_notify` the new
  assignee (type Assignment, deep-link Project Todo).
- **Approval queue / approved** — `project_todo` status transition: in `project_todo.py` `on_change`
  (or the update path), when status advances, `_notify` the next approver (leader on →Done,
  owner on →Checked) that an item awaits them; `_notify` the assignee when their item is
  approved/completed. Use `_can_advance` role logic (`mobile.py:88`) to pick the recipient.
- **Comment** — `add_comment` (`mobile.py:713`): `_notify` item participants (assignee + project
  owner/leader) of a new comment; parse `@mentions` from content → `_notify` each mentioned user
  (type Mention) — see #4.
- **Points** — `grant_points` (`mobile.py:1776`), `gift_points` (`mobile.py:1823`): `_notify`
  recipient. **Redemption fulfilled:** fulfillment is a generic resource update today, so add a
  `Reward Redemption` controller `on_update` hook that fires `_notify` to `user` when `status`
  becomes `Fulfilled`.

**Acceptance:** Assigning a task, advancing it into someone's approval queue, commenting/mentioning,
and granting/gifting/fulfilling each produce an in-app notification (bell badge increments) and, when
the recipient has enabled push and the app is closed, an OS notification that deep-links into the app.

### Deploy prerequisite (one-time, user-run on project.vernon.id)

1. `./env/bin/pip install pywebpush` in the bench.
2. Generate VAPID keypair; write `vapid_public_key`, `vapid_private_key`,
   `vapid_subject` (mailto:) into the site's `site_config.json`.
3. `bench restart`.

A helper script will be provided; the user runs the install + keygen (needs server shell).

---

## Feature #4 — Comment image upload + @mention

### Image upload

- `CommentThread.tsx`: add a file/image picker button next to the textarea; on pick, upload then
  insert an `<img src="/files/…">` into the composed `content` HTML at the cursor / appended.
- New endpoint `upload_comment_image()` in `mobile.py`, mirroring `upload_reward_image`
  (`mobile.py:1715`): multipart, raster-only whitelist, 5 MB cap, save as public File, return `{file_url}`.
  Add `uploadCommentImage` to `lib/api.ts` (raw multipart, like `uploadRewardImage`).
- **Sanitizer** `sanitizeHtml` (`format.ts:88`): explicitly allow `<img>` only when `src` starts with
  `/files/` (or same-origin); strip otherwise. Keep existing script/iframe/etc. removal.

### @mention

- New endpoint `get_mentionable_users(reference_doctype, reference_name)` in `mobile.py`: returns the
  project participants for that comment target (owner, leader, admin, team members, and assignees of
  the project's todos) as `[{user, full_name, image}]`. Reuses `_comment_project` (`mobile.py:660`)
  to resolve the project + `_assert_comment_visible` for the access check.
- `CommentThread.tsx`: typing `@` opens an autocomplete (filtered by the endpoint's list). Selecting a
  user inserts a token rendered/stored as `<span data-mention="user@email">@Full Name</span>`.
- `add_comment` (`mobile.py:713`): after saving, parse `data-mention` spans (or a regex) out of
  `content` → for each mentioned user, `_notify(type=Mention, …, reference=this item)`.
- Sanitizer allows `<span data-mention="…">`; `CommentThread` renders mention spans highlighted.

**Acceptance:** In a comment, attach an image (renders inline) and type `@` to mention a teammate
(autocomplete from project participants); the mentioned user gets a Mention notification and the
comment shows the highlighted mention.

---

## Cross-cutting conventions

- All new mutations call `frappe.db.commit()` explicitly inside the whitelisted fn and use
  `ignore_permissions=True` for writes, matching existing points endpoints.
- All new screens use `useToast` for feedback and `useConfirm` for confirmations — never native
  `alert`/`confirm`/`prompt`.
- New backend writes resolve user emails → display names server-side (`_user_name_map`,
  `mobile.py:108`).
- Frontend gating via boot roles (`useData.ts` `can*` predicates); add `canManageBadges` (System
  Manager) for the badge admin route.

## Out of scope (YAGNI)

- Realtime socket notifications (poll is enough; revisit if lag matters).
- Notification preferences / per-type mute (all four types on for everyone initially).
- Email digests.
- Mentioning users outside the project's participants.
- Per-avatar badge display app-wide (only Profile / leaderboard / comment author).

## Deploy mechanics (per project memory)

- Schema (new doctypes, fields): `bench migrate`.
- Python (endpoints, controllers): `bench restart`.
- Frontend: `npm build` in `frontend/`, output copied to `vernon_project/public/frontend/`.
- Live site, no test DB — defer integration tests to a final phase; verify against the live PWA.
