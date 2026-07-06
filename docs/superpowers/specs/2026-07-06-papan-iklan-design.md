# Papan Iklan (Classified Ads / Notice Board) — Design

**Date:** 2026-07-06
**Status:** Approved, pending implementation plan

## Summary

A classified-ads board ("Papan Iklan") where any logged-in Vernon user posts an
ad to **Sell**, **Buy**, or **Rent** something, browses other users' ads, and
contacts the poster. Admins (System Manager) can delete any ad and impose a
time-limited posting ban on a user. Ships on both frontends: mobile `/m` and
web `/w`.

## Decisions (from brainstorming)

- **Audience:** all logged-in Vernon users. No guests. No per-role restriction.
- **Contact:** both a contact field on the ad **and** an in-app comment thread
  per ad (reuse existing comment thread).
- **Moderation:** ads go live immediately on submit; admin deletes bad ones
  reactively. No approval queue.
- **Ban:** time-limited. Admin sets an until-date + required reason. Ban blocks
  new posts; auto-lifts when the date passes.
- **Price:** numeric Rp currency (optional; blank = "Nego").
- **Categories:** none — the three ad types plus text search cover browsing.
- **Frontends:** both `/m` and `/w`.
- **Moderator role:** reuse `System Manager` (no new custom role).

## Data model — 3 new doctypes

Module `"Vernon Project"`, folder pattern
`vernon_project/vernon_project/doctype/<snake_name>/`. Copy the `vernon_event`
skeleton (author-stamped UGC with cover image + status lifecycle) and the
`vernon_banner` istable-image pattern.

### `Papan Iklan` (the ad)

| field | type | notes |
|---|---|---|
| `title` | Data, reqd | `in_list_view` |
| `ad_type` | Select, reqd | `Sell` / `Buy` / `Rent` (UI labels: Jual / Beli / Sewa) |
| `description` | Text Editor | rich text |
| `price` | Currency | optional; blank = "Nego"; for Buy = budget |
| `rate_period` | Select | optional; `\nper Hari\nper Bulan\nper Tahun`; only meaningful for Rent |
| `location` | Data | optional; where the item is |
| `contact` | Data, reqd | WhatsApp / phone |
| `photos` | Table → `Papan Iklan Photo` | up to ~5 images |
| `author` | Link → User | auto-stamped in `validate()`, never set from client |
| `status` | Select | `Active` / `Fulfilled` / `Removed`, default `Active` |

- `autoname: "hash"`, `naming_rule: "Random"` (opaque IDs, matches convention).
- `validate()`: on new doc, stamp `author = frappe.session.user`.
- Desk permissions: System Manager only. All real access via the API layer with
  `ignore_permissions=True` — same as `vernon_event`.
- **No** `has_permission` / `get_permission_query_conditions` registration in
  `hooks.py`: every logged-in user may read every `Active` ad, so no row-level
  filtering is needed.

### `Papan Iklan Photo` (child, `istable: 1`)

- `image`: Attach Image.

### `Papan Iklan Ban`

| field | type | notes |
|---|---|---|
| `user` | Link → User, reqd | the banned user |
| `banned_until` | Date, reqd | ban auto-lifts on/after this date |
| `reason` | Small Text, reqd | audit trail |
| `banned_by` | Link → User | auto-stamped |

- An **active ban** = a row where `banned_until >= today`.
- `autoname: "hash"`. Desk perms: System Manager only.

## Backend — `vernon_project/api/papan_iklan.py`

New feature file (copy the clean patterns from `api/feedback.py` and
`api/events_admin.py`). Conventions: read `frappe.session.user`; `"Guest"` =
not-logged-in → `frappe.throw(..., frappe.AuthenticationError)`; mutations end
`return {"status": "ok"}` or `{"name": doc.name}`; errors via `frappe.throw`
with the right exception class.

### Public / author endpoints

- `list_ads(ad_type=None, q=None, mine=0)` — `Active` ads, newest first, joined
  with author name + image. `q` matches title/description. `mine=1` → only the
  caller's ads (any status).
- `get_ad(name)` — the ad + its photos + `is_owner` / `is_admin` flags. (Comments
  fetched via the existing comment endpoint keyed by `Papan Iklan`/`name`.)
- `create_ad(title, ad_type, description, price, rate_period, location, contact, photos)`
  — assert logged-in **and** `_assert_not_banned(user)`; insert with author
  stamped; `ignore_permissions=True`.
- `update_ad(name, ...)` — owner-or-admin gate (`_can_manage`); a field
  allow-list prevents client-set `author` / `status` spoofing.
- `set_status(name, status)` — owner may set `Active` / `Fulfilled`; admin may
  also set `Removed`.
- `delete_ad(name)` — owner or admin; hard-deletes the caller's own ad.
- `upload_ad_image` — copy `upload_reward_image` in `mobile.py`
  (ext + MIME allow-list, 5 MB cap, SVG/HTML stored-XSS block); gate: logged-in.

### Admin endpoints (System Manager)

- `remove_ad(name, reason)` — set `status = Removed`; notify the author with the
  reason. (Soft-remove, keeps the record.)
- `ban_user(user, banned_until, reason)` — validate future date + non-empty
  reason; create a `Papan Iklan Ban`; notify the banned user.
- `unban_user(user)` — delete/expire the user's active ban.
- `list_bans()` — active bans for the admin screen.

### Helpers

- `_require_admin()` — `System Manager` gate (copy from `feedback.py`).
- `_can_manage(name)` — owner OR System Manager (copy from `events_admin.py`).
- `_assert_not_banned(user)` — query for an active `Papan Iklan Ban`; if found,
  `frappe.throw` with the until-date + reason.
- Reuse `_notify(...)` from `mobile.py` for author-facing remove/ban notices. Add
  a `Papan Iklan` value to the `type` Select on `vernon_notification.json` if a
  distinct category is wanted (else reuse an existing capitalized option — an
  invalid `type` makes the notification silently vanish).

No admin notification on every new post (moderation is reactive).

### Comments

Reuse the existing generic comment thread. Comments are keyed by
`reference_doctype = "Papan Iklan"` + `reference_name = <ad name>`. No new
comment doctype or endpoint — the `CommentThread` component and comment API
already accept an arbitrary reference. Comment-image upload reuses the existing
`upload_comment_image` reference-gated endpoint.

## Frontend

Both are Vite + React + react-router + Tailwind SPAs. Mobile follows the
Soft-Pop design system (`paper-*` tokens, lucide icons); web follows the
flat-Notion convention (semantic tokens, `Page`/`Section`/`DataTable`). No
`paper-*` in web.

### Shared (mobile package `@ = frontend/src`)

- `frontend/src/lib/types.ts`: add `Ad`, `AdPayload`, `AdBan`.
- `frontend/src/lib/api.ts`: add `const PI = 'vernon_project.api.papan_iklan.'`
  method map + `uploadAdImage(file)` wrapper (clone `uploadRewardImage`).

### Mobile `/m` — `frontend/src/pages/`

- `PapanIklanScreen.tsx` — browse: Sell / Buy / Rent tabs + search box, ad cards
  (photo, title, price, type badge), FAB to create.
- `PapanIklanFormScreen.tsx` — create/edit: title, type, price, rate_period,
  location, contact, description, photo upload (multi).
- `PapanIklanDetailScreen.tsx` — photo carousel, price, WhatsApp contact button
  (deep-link the `contact`), comment thread, owner edit/delete + mark Fulfilled,
  admin Remove + Ban.
- `PapanIklanAdminScreen.tsx` — active bans list + unban (admin only).
- Routes added to `frontend/src/App.tsx`; admin route gated by a
  `canModerateAds(boot)` helper in `hooks/useData.ts` (returns System Manager).

### Web `/w` — `frontend-web/src/pages/`

- `PapanIklan.tsx`, `PapanIklanForm.tsx`, `PapanIklanDetail.tsx`,
  `PapanIklanAdmin.tsx`; nav entry in `frontend-web/src/lib/nav.ts`.
- `frontend-web` has no shared types/hooks package — it duplicates the API call
  signatures locally (existing convention).

## Reuse vs build

**Reuse:** `vernon_event` doctype skeleton, `feedback.py` + `events_admin.py` API
patterns, `upload_reward_image` image hardening, `_notify`, generic comment
thread + `CommentThread` component, `_can_manage` owner-or-admin gate.

**Build fresh:** the 3 doctypes, `api/papan_iklan.py`, the ban gate, the ban
doctype + admin ban/unban flow, the mobile + web screens.

## Explicitly out of scope

- Approval / moderation queue (post-immediately chosen).
- Categories (text search instead; numeric `price` leaves sort/range for later).
- New custom moderator role (reuse `System Manager`).
- Auto-expiry of ads (poster marks `Fulfilled`; admin `Removed`).
- Shared frontend types package between `/m` and `/w` (duplicate per convention).

## Testing

Per project convention, this is a live site with no test DB — defer automated
tests to a final phase. Manual verification path: post an ad as a normal user,
browse/filter, comment, contact; edit + mark Fulfilled as owner; as admin remove
an ad and ban the poster; confirm banned user is blocked from posting until the
date passes, then can post again.
