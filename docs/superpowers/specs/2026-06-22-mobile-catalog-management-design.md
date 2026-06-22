# Mobile Catalog Management — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation pending
**Builds on:** `2026-06-21-points-wallet-leaderboard-marketplace-design.md`

## Summary

The points marketplace shipped with catalog administration deferred to Frappe
Desk. This adds **mobile admin** so a `Marketplace Manager` (or `System
Manager`) can, from the phone:

1. **Manage the reward catalog** — list all rewards (active + inactive),
   create, edit, disable, delete; including **image upload** from the device.
2. **Fulfill redemptions** — list redemptions (Pending / Fulfilled / All) and
   mark a Pending redemption Fulfilled.

The user-facing marketplace, wallet, leaderboard, and redemption mechanics are
unchanged. This is purely an additive admin surface.

## Access control

Admin features are visible/usable only to **`Marketplace Manager`** and
**`System Manager`**.

- **Backend gap to close:** `bootstrap()` in `vernon_project/api/mobile.py`
  currently filters the returned `roles` to
  `("Project Owner", "Project Leader", "Project Admin", "Project Team",
  "System Manager")`. Add `"Marketplace Manager"` to that whitelist so the
  frontend can see it.
- **Frontend:** new helper `canManageMarketplace(boot)` →
  `boot.roles.includes('System Manager') || boot.roles.includes('Marketplace Manager')`.
- Routes and the Profile entry row are gated by this helper, consistent with
  the existing `canManageBrands` / `canManageUsers` pattern.

Doctype permissions already grant `Marketplace Manager` + `System Manager` full
CRUD on `Marketplace Reward` and write on `Reward Redemption` (from the points
feature), so `/api/resource` mutations succeed for these roles.

## Navigation

- **Profile/Me:** a new "Manage Marketplace" row (icon: `Store`/`Settings`),
  shown when `canManageMarketplace(boot)`, navigates to `/marketplace-admin`.
- **`/marketplace-admin`** — an admin hub (DetailScreen) with a `Segmented`
  switch between two sections: **Rewards** and **Redemptions**. Both render
  inline within the hub (no nested routes for the lists), matching the
  app's lightweight screen style.
- **Reward form** is a separate screen: `/marketplace-admin/reward/new` and
  `/marketplace-admin/reward/:name` (mirrors `/brands/new`, `/brands/:name`).

## Components

### 1. Reward catalog CRUD

**List (Rewards section of the hub):** fetches ALL rewards via
`resource.list('Marketplace Reward', { fields: [name, reward_name, point_cost,
stock_quantity, active, image], limit: 0 })`. Renders each with name, cost,
stock, and an active/inactive badge. Tapping a row → reward form; a "+" action →
new reward form. Empty state when none.

**Form (`RewardFormScreen`):** DetailScreen with fields:
- `reward_name` (text, required)
- `point_cost` (number, required, ≥ 0)
- `stock_quantity` (number, ≥ 0)
- `active` (toggle)
- `description` (textarea)
- `image` (image picker + preview — see §2)

Buttons: "Create reward" / "Save changes"; on edit also "Delete". Mutations via
new hooks `useCreateReward` / `useUpdateReward` / `useDeleteReward` wrapping
`resource.create/update/remove('Marketplace Reward', …)`. Client validation:
non-empty name, `point_cost ≥ 0`, `stock_quantity ≥ 0`. Success → toast + back.

### 2. Image upload

No image upload exists in the app today; this is net-new.

- **Backend:** a whitelisted `upload_reward_image()` endpoint in `mobile.py`,
  gated to `Marketplace Manager` / `System Manager`, that accepts the request
  file (`frappe.request.files`), saves it via `frappe.get_doc({"doctype":
  "File", ...}).insert()` (or `frappe.utils.file_manager.save_file`) as a public
  file, and returns `{ "file_url": <url> }`.
- **Frontend:** `api.ts` gains an `uploadRewardImage(file: File)` helper that
  POSTs `multipart/form-data` with the CSRF header (NOT JSON) to that endpoint
  and returns the `file_url`. The form uses
  `<input type="file" accept="image/*">`; on select it uploads, shows a preview
  from the returned URL, and stores the URL in the form's `image` field (saved
  with the reward like any other field). Upload failure → toast; the rest of
  the form still works.

Rationale for a dedicated endpoint over raw `/api/method/upload_file`: it lets
us enforce the marketplace-admin role server-side and return a clean
`{file_url}` shape, mirroring the project's other purpose-built mobile
endpoints.

### 3. Redemption fulfillment

**List (Redemptions section of the hub):** a new whitelisted endpoint
`list_redemptions(status="all")` in `mobile.py`, gated to `Marketplace
Manager` / `System Manager`, returns redemptions resolved server-side:
```
[
  { "name", "user", "user_name" (full_name), "reward_name", "point_cost",
    "status", "redeemed_on", "redeemed_on_human", "fulfilled_on" },
  ...
]
```
`status ∈ {"pending","fulfilled","all"}` filters by the `status` field;
newest-first by `redeemed_on`. Uses `frappe.get_all` + a name map (reuse
`_user_name_map`). This mirrors the existing `list_users` precedent rather than
forcing the client to read the doctype and join names itself.

**Frontend:** a `Segmented` Pending / Fulfilled / All filter; each row shows
user name, reward, cost, date, and status. A "Mark Fulfilled" button on Pending
rows calls `useFulfillRedemption` →
`resource.update('Reward Redemption', name, { status: 'Fulfilled' })`. The
existing controller stamps `fulfilled_on`. On success → invalidate the
redemptions query (and refetch). Empty state per filter.

## Data flow

- Reward reads/writes: `/api/resource/Marketplace Reward` (admin roles have
  CRUD). React-Query keys: `rewardsAdmin` (list), `rewardAdmin(name)` (one).
- Image upload: `POST /api/method/…upload_reward_image` (multipart) → file_url.
- Redemption list: `GET /api/method/…list_redemptions?status=…`. Key:
  `redemptionsAdmin(status)`.
- Redemption fulfill: `PUT /api/resource/Reward Redemption/<name>`.

## Error handling

- Non-admin reaching a gated route: route not registered (like other admin
  screens) → falls through to the catch-all redirect to `/`.
- Server-side: `upload_reward_image` and `list_redemptions` re-check the role
  and `frappe.throw(..., frappe.PermissionError)` if not permitted (defense in
  depth; `resource` writes are already permission-checked by Frappe).
- Image upload failure → toast; form remains usable.
- Validation errors surfaced inline / via toast (no native alert/confirm —
  delete confirmation uses the existing dialog/sheet pattern, never
  `window.confirm`).
- Empty states for empty catalog and each redemption filter.

## Out of scope

- Editing redemption fields other than marking Fulfilled (no un-fulfill, no
  cancellation/refund — consistent with the points spec's Pending→Fulfilled
  lifecycle).
- Bulk actions, CSV import/export, reward categories/tags.
- Per-brand reward catalogs (catalog remains global).

## Testing & deployment

- **Tests deferred** — live site (`project.vernon.id`), no test DB. Verify
  manually: as a Marketplace Manager, create/edit/disable/delete a reward,
  upload an image, and fulfill a redemption; confirm a non-admin user sees no
  admin row/route.
- **Deploy:** no schema change → no `migrate` required. `bootstrap()` + two new
  endpoints are Python → `bench restart`. Frontend → `npm run build`.

## File structure

**Backend (modify):** `vernon_project/api/mobile.py` — add `"Marketplace
Manager"` to `bootstrap()`; add `upload_reward_image()` and
`list_redemptions(status)` (+ a small `_require_marketplace_manager()` helper).

**Frontend (create):**
- `frontend/src/pages/MarketplaceAdminScreen.tsx` (hub: Rewards + Redemptions
  sections)
- `frontend/src/pages/RewardFormScreen.tsx` (create/edit reward + image upload)

**Frontend (modify):**
- `frontend/src/lib/types.ts` — `AdminReward`, `AdminRedemption`,
  `RewardFormPayload` interfaces
- `frontend/src/lib/api.ts` — `uploadRewardImage`, `listRedemptions`,
  reward resource wrappers
- `frontend/src/hooks/useData.ts` — `canManageMarketplace`, `useRewardsAdmin`,
  `useReward`, `useCreateReward`, `useUpdateReward`, `useDeleteReward`,
  `useRedemptionsAdmin`, `useFulfillRedemption`, query keys
- `frontend/src/App.tsx` — routes `/marketplace-admin`,
  `/marketplace-admin/reward/new`, `/marketplace-admin/reward/:name` (gated)
- `frontend/src/pages/Profile.tsx` — "Manage Marketplace" row
