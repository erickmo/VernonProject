# 3D Avatar Customization & Cosmetics Marketplace — Design

**Date:** 2026-06-27
**Status:** Draft (design); awaiting user review

## Summary

Give every user a **customizable 3D avatar** rendered with three.js / WebGL,
shown live on a customizer screen and the profile hero. Users pick a **base
style** (human, cat, …), attach **cosmetics** (hat, face accessory), and set a
**color tint** (skin/fur + accent). Cosmetics are sold in the existing
**points marketplace**: locked items show a price, are bought with points
(reusing the current redeem flow), then become equippable.

The composed avatar is captured to a **PNG snapshot** on save and used as the
user's identity image everywhere else (leaderboard, comments, navbar) — so the
heavy WebGL canvas only ever renders on the customizer and profile hero, never
in lists.

Both frontends get it: mobile `/m` (Soft-Pop) and web `/w` (Bento). The
three.js code lives in one shared module under the mobile `src`, which web
imports using the same cross-app import convention it already uses for shared
mobile code (exact alias confirmed in the implementation plan).

## Goals / Non-goals

**v1 goals**
- Render a low-poly 3D avatar (r3f) with base-style swap, socket-attached hat +
  face accessory, and material color tint.
- Customizer UI on `/m` and `/w`: 3D viewport, slot tabs, item grid, Save.
- Persist per-user avatar config; capture snapshot → set as identity image.
- Marketplace sells cosmetics: ownership gating, buy → own → equip, reusing
  `redeem_reward` / Reward Redemption / wallet / stock.

**Non-goals (v1)**
- Deformable/layered cloth garments (not practical across un-shared skeletons —
  see Asset model). "Clothes" beyond the base mesh are out of v1.
- Idle/walk **animation**, additional base styles beyond two, leaderboard live
  3D. Deferred to phase 2 polish.
- Avatar in Frappe Desk. API-only, consumed by the SPAs.

## Locked decisions (from brainstorming)

- **Art/assets:** low-poly **CC0 GLB** packs (Quaternius modular human + a CC0
  cat base; Kenney accessory packs for hats/glasses). Bundled as static files.
- **Customization model:** socket attachments + material color swap + base-mesh
  swap. No deformable cloth.
- **Slots (v1):** Base style, Hat, Face, Color tint.
- **Surfacing:** live 3D on customizer + profile hero; **snapshot PNG** is the
  identity pic in all list contexts.
- **Marketplace:** in v1. Reuse existing Marketplace Reward / redeem flow; a
  reward links to an Avatar Item.

## Asset model — why attachments, not cloth

Kenney/Quaternius characters are separate packs with different skeletons and
scales; a cat and a human do **not** share a rig. Deformable garments would
require one shared skeleton + per-garment skinning, which these CC0 packs don't
provide. The workable, cross-style model:

- **Socket attachment** — each base GLB exposes named empty nodes
  (`head_top`, `face`). A cosmetic is a small standalone mesh parented to its
  socket. Covers hats, crowns, helmets, glasses, masks.
- **Material/color swap** — meshes tagged `tint:skin` and `tint:accent` get
  their material color overridden from the user's chosen colors.
- **Base-mesh swap** — switching style replaces the whole body GLB.

Sockets are **normalized per base** during asset prep: if a source GLB lacks
`head_top`/`face` empties, we add them (positioned at the crown / face) so the
same hat fits both human and cat. This normalization is the main art-prep task.

## Data model

### New doctype: Avatar Item
Cosmetic / base catalog. Managed in Frappe Desk by the Marketplace Manager role
(reuses existing role).

| Field | Type | Notes |
|-------|------|-------|
| `item_name` | Data | required, in_list_view |
| `slot` | Select | `Base` / `Hat` / `Face`; required |
| `model_url` | Data | path to GLB under the SPA static dir |
| `socket` | Data | anchor node name for attachment; empty for `Base` |
| `thumbnail` | Attach Image | catalog tile image (2D) |
| `is_default` | Check | default 0; if 1, every user owns it for free |
| `active` | Check | default 1; inactive hidden from catalog |

Color tint is **not** an Avatar Item — it is free per-user state on User Avatar.

### New doctype: User Avatar
One row per user; `autoname = field:user`, `user` unique. Created lazily on
first save.

| Field | Type | Notes |
|-------|------|-------|
| `user` | Link → User | required, unique |
| `base` | Link → Avatar Item | required; must be `slot=Base` |
| `hat` | Link → Avatar Item | optional; `slot=Hat` |
| `face` | Link → Avatar Item | optional; `slot=Face` |
| `skin_color` | Data | hex; default per base |
| `accent_color` | Data | hex |
| `snapshot` | Attach Image | PNG written on save; the identity image |

### Extend existing doctype: Marketplace Reward
Add one field — the link that turns a reward into a cosmetic grant:

| Field | Type | Notes |
|-------|------|-------|
| `avatar_item` | Link → Avatar Item | optional; if set, redeeming grants ownership of this item |

No other marketplace changes. Non-cosmetic rewards keep `avatar_item` empty and
behave exactly as today.

## Ownership model

A user **owns** an Avatar Item if:
- the item has `is_default = 1`, **or**
- the user has a Reward Redemption for a Marketplace Reward whose
  `avatar_item` = that item.

No new ownership doctype — Reward Redemption already records `user` + `reward`,
which is the proof. Equipping a non-owned item is rejected server-side.

## API (whitelisted, in `api/mobile.py`)

- `get_avatar_catalog()` → `{ items: [{name, item_name, slot, model_url, socket,
  thumbnail, owned: bool, price: float|null, reward: str|null}], my: {...config} }`.
  `owned` = ownership rule above. `price`/`reward` filled from the linked
  Marketplace Reward when the item is locked, so the UI can show 🔒 + cost and
  trigger purchase.
- `get_my_avatar()` → current `User Avatar` config (or defaults if none).
- `save_my_avatar(config, snapshot_dataurl)` → validate each equipped item is
  owned and slot-correct; upsert User Avatar; decode the data-URL PNG, save it
  as a File and set `snapshot` **and** the User identity image used by the
  existing Avatar component. Returns the saved config + snapshot URL.
- Purchase reuses the existing **`redeem_reward(reward)`** — no new endpoint.
  After redeem succeeds, the item is owned and can be equipped.

Server is the source of truth for ownership and balance; the client cannot
equip or "buy" by itself.

## Frontend architecture

**Dependencies (clean add — none present today):** `three`,
`@react-three/fiber`, `@react-three/drei`. Added to **both** `frontend` and
`frontend-web` package.json.

**Shared module `frontend/src/avatar/`** (web imports it via the existing
cross-app import convention; exact alias confirmed in the plan):
- `AvatarViewer.tsx` — r3f `<Canvas>`: `useGLTF` loads the base GLB, clones and
  parents hat/face meshes to their sockets, overrides `tint:*` material colors,
  `OrbitControls`, `Bounds`/`Center` for framing, a fixed 3-point light rig,
  static idle pose. `preserveDrawingBuffer` on so the canvas can be captured.
- `useAvatarCapture.ts` — reads `gl.domElement.toDataURL('image/png')` after a
  forced render; returns the data-URL for `save_my_avatar`.
- `types.ts`, `sockets.ts` (socket-name constants).

**Customizer screen** — new route on each app, following each design system:
- `/m` `AvatarCustomizerScreen` (Soft-Pop: paper tokens, indigo brand).
- `/w` `AvatarCustomizer` (Bento tiles).
- Layout: 3D viewport on top; slot tabs **Base / Hat / Face / Color**; item grid
  below (owned items equippable; locked items show 🔒 + price → tap buys via
  `redeem_reward`, then auto-equips); color tab = two swatches/pickers; **Save**.
- Data via new hooks in `frontend/src/hooks/useData.ts`:
  `useAvatarCatalog()`, `useSaveAvatar()` (react-query, matches existing pattern).

**Profile hero** — `AvatarViewer` (read-only, no controls beyond rotate) on the
`/m` Profile and `/w` Me pages, replacing the static image with the live model;
a "Customize" button routes to the customizer.

**Identity everywhere else** — unchanged. The existing image-based `Avatar`
component keeps rendering `boot.user` image, which `save_my_avatar` now keeps
in sync with the snapshot. Zero changes to leaderboard/comment rendering.

## Asset pipeline

- Source CC0 GLBs (Quaternius human, a CC0 cat, Kenney hats/glasses), trim &
  normalize sockets, export small GLBs (target < ~150 KB each, Draco optional).
- Place under `frontend/public/models/` and `frontend-web/public/models/`; Vite
  copies `public/` to the build root, so they ship with each SPA and resolve at
  a stable URL. `Avatar Item.model_url` stores that relative path.
- v1 seed set: 2 bases (human, cat), 2–3 hats, 1 glasses; one of each base is
  `is_default`, the rest priced via seeded Marketplace Reward rows.
- Seed via a loop-free `bench console` script (see the stdin gotcha note).

## Error handling

- GLB load failure → viewer shows a fallback silhouette + toast; Save disabled
  until a valid base loads.
- WebGL unsupported → feature-detect; show the static image avatar + a
  "3D not supported on this device" note; customizer hidden.
- `save_my_avatar`: reject non-owned/slot-mismatched items (server), surface as
  a dialog (never native alert — house rule).
- Snapshot capture failure → still save config; identity image left unchanged;
  warn.
- Purchase: reuse `redeem_reward`'s existing insufficient-balance / out-of-stock
  handling; on failure the item stays locked.

## Testing

- Backend (final-phase, per live-site convention): ownership rule
  (default vs redeemed vs unowned), slot validation in `save_my_avatar`,
  snapshot persistence sets identity image, redeem→own transition.
- A loop-free `__main__`/console self-check seeding the catalog and asserting
  `get_avatar_catalog` ownership flags for a known user.
- Frontend: manual verify on `/m` and `/w` — equip, color, buy-locked, save,
  confirm snapshot becomes the leaderboard image.

## Phasing

- **v1 (this spec):** doctypes + catalog API + renderer + customizer (both apps)
  + snapshot identity + marketplace buy/own/equip, with a small seeded asset set.
- **Phase 2 (later):** idle/walk animation, more bases & cosmetics, optional
  leaderboard snapshot rollout polish, Draco compression if payloads grow.

## Risks / open items

- **Asset prep is the real cost**, not the code: sourcing CC0 GLBs and
  normalizing `head_top`/`face` sockets so one hat fits human + cat. If a
  source lacks usable anchors, we add empties in Blender/gltf-transform during
  prep.
- Bundle size: GLBs inflate each SPA build. Keep the v1 set tiny; revisit
  lazy-loading/Draco in phase 2.
- Mobile WebGL perf on low-end devices — mitigated by single-canvas-only
  (customizer/profile) + snapshot everywhere else.
- Deploy: schema change (3 doctype changes) needs `bench migrate`; Python needs
  `bench restart`; both SPAs need `npm build`. New `models/` static files ship
  via the SPA build.
