# 2D DiceBear Avatar (replacing 3D) — Design

**Date:** 2026-06-28
**Status:** Draft (design); awaiting user review

## Summary

Replace the three.js/WebGL avatar with a **2D layered SVG avatar** rendered by
**DiceBear** (MIT, client-side). Users pick one of several **art styles**
(Lorelei, Adventurer, Notionists) and customize its built-in attributes — hair,
eyes, eyebrows, mouth, glasses, accessories, and skin/hair/background color. A
curated set of **premium** attributes is sold in the points marketplace
(reusing the existing redeem/ownership flow). The composed avatar is captured to
a PNG via **`html-to-image`** (already installed) and becomes the user's
identity image, exactly as today.

This pivot removes `three`/`@react-three/fiber`/`@react-three/drei` and all GLB
assets — shrinking each SPA bundle by ~1.5 MB, eliminating the build-OOM that
required swap, rendering instantly on any device, and making attributes pure
data (no 3D modeling, anchors, or rigs).

## Why pivot (rationale)

| | 3D (three.js) | 2D (DiceBear) |
|---|---|---|
| Bundle | +~1.5 MB | ~tens of KB/style, tree-shaken |
| Build | OOMs without swap | builds in low RAM |
| Render | WebGL canvas | inline SVG, instant, universal |
| Snapshot | canvas `preserveDrawingBuffer` | `html-to-image` (installed) |
| Add attribute | model GLB + tune anchors | one option value (data) |
| Verifiable headless | no (no WebGL/browser here) | yes (deterministic SVG) |

DiceBear renders **stylized human-portrait** avatars (face/hair/accessories) —
not animals or full-body characters. Accepted: the original "cat character" is
dropped in exchange for lightness + far more (human) attribute customization.

## Locked decisions (from brainstorming)

- **Renderer:** DiceBear SVG. Pin matched **v9** packages: `@dicebear/core@^9`
  + `@dicebear/collection@^9` (the collection's latest is 9.x; core v10 would
  mismatch). Import only the styles used (tree-shaken).
- **v1 styles:** `lorelei`, `adventurer`, `notionists` (expandable).
- **Free customization** from each style's built-in options; **premium**
  attributes sold via marketplace (reuse `redeem_reward`/ownership). Keep
  marketplace in v1.
- **Remove 3D entirely:** delete the three.js viewer, GLB assets, anchors, the
  three/r3f/drei deps + web dedupe entries, and `vernon_project/public/models/`.
- Snapshot→`User.user_image` identity flow unchanged.

## Rendering

A small shared component `DiceBearAvatar({ config, size })`:
- maps `config.style` → the imported DiceBear collection
  (`{ lorelei, adventurer, notionists }[config.style]`),
- calls `createAvatar(collection, config.options).toString()` → SVG string,
- renders it inline (e.g. `<div dangerouslySetInnerHTML={{__html: svg}}>` — the
  SVG is library-generated, not user HTML, so no injection surface).

Snapshot: `html-to-image`'s `toPng(previewEl)` → data-URL → `save_my_avatar`.
No WebGL, no readiness race (SVG is synchronous), no `AvatarBoundary` needed
(SVG can't fail the way WebGL can; a try/catch around `createAvatar` suffices).

## Styles + attributes (schema introspection)

Each DiceBear style exposes `collection.schema.properties` describing its option
groups and allowed values. The customizer reads this at runtime — **no
hardcoded variant lists**:
- **Option groups** (per style; the customizer shows the subset that exists):
  `hair, eyes, eyebrows, mouth, glasses, earrings/accessories, features`
  (each value is a variant id like `variant03`).
- **Color groups:** `hairColor, skinColor, backgroundColor` (arrays of hex) →
  rendered as swatches.
- Probability options (e.g. `glassesProbability`) are set to 100 when an item
  is equipped, 0 when "none".

A `config` is `{ style: 'adventurer', options: { hair:['long01'],
eyes:['variant02'], ..., skinColor:['f2d3b1'], backgroundColor:['b6e3f4'] } }`.

## Marketplace / premium / ownership (reused)

- A **premium** attribute = an `Avatar Item` row `(style, slot, option_value,
  is_default, active)` linked from a `Marketplace Reward` (`avatar_item`) for
  its price. Owned → selectable; locked → 🔒 + price → **`redeem_reward`** →
  invalidate catalog → unlock + equip. (All existing.)
- Ownership = `_avatar_owned_items(user)` (default items + redeemed) — unchanged
  logic.
- **Free options** (every variant NOT present as a premium `Avatar Item`) need
  no ownership and aren't stored in the DB — the client knows them from the
  schema. Only premium variants live in `Avatar Item`.

## Data model changes (our own low-data doctypes)

### `Avatar Item` (repurpose; additive fields + migration)
| Field | Change |
|-------|--------|
| `style` | **new** Data — DiceBear collection (`lorelei`/`adventurer`/`notionists`) |
| `slot` | broaden Select options to DiceBear slots (`Hair`/`Eyes`/`Eyebrows`/`Mouth`/`Glasses`/`Accessory`/`Background`) |
| `option_value` | **new** Data — the variant id (e.g. `variant07`) |
| `model_url`, `socket` | **deprecated** (kept nullable, unused) |
| `is_default`, `active`, `thumbnail`, `item_name` | unchanged |

A premium item is identified by the triple `(style, slot, option_value)`.

### `User Avatar`
| Field | Change |
|-------|--------|
| `config_json` | **new** Long Text — the full selection JSON `{style, options}` |
| `snapshot` | unchanged (identity PNG) |
| `base`, `hat`, `face`, `skin_color`, `accent_color` | **retired** (unused) |

### Seed
Re-seed `seed_avatar_catalog()` to create a handful of premium DiceBear items
(e.g. a fancy `adventurer` hair, a `lorelei` accessory, a special background)
priced via `Marketplace Reward`. Remove the old GLB seed rows.

## API changes (`api/mobile.py`)

- `get_avatar_catalog()` → `{ premium: [{name, item_name, style, slot,
  option_value, owned, price, reward, thumbnail}], my: <config_json or default> }`.
  (Renamed payload from `items` to `premium`; free options aren't listed —
  the client derives them from the DiceBear schema.)
- `get_my_avatar()` → the user's `config_json` (or a default config:
  `{style:'lorelei', options:{}}`).
- `save_my_avatar(config_json, snapshot_dataurl=None)` → parse config; for each
  selected `(slot, value)`, if a premium `Avatar Item (style, slot, value)`
  exists and the user doesn't own it → reject; else allow. Persist `config_json`
  + snapshot → `User.user_image`. Snapshot pruning + ordering fixes carry over.
- Ownership helper `_avatar_owned_items` unchanged.

## Frontend

**Deps:** add `@dicebear/core@^9` + `@dicebear/collection@^9` to `frontend/`.
Remove `three`/`@react-three/fiber`/`@react-three/drei` + their web `dedupe`
entries. (DiceBear has no React-context concerns, so no dedupe needed.)

**Shared module** `frontend/src/avatar/` (web imports via `@`):
- `DiceBearAvatar.tsx` — renders SVG from a config (above).
- `styles.ts` — `{ lorelei, adventurer, notionists }` map + the curated slot
  list + schema helpers (`optionsForStyle(style)` reading `schema.properties`).
- `useAvatarCapture.ts` — `toPng` via `html-to-image`.
- Delete `AvatarViewer.tsx`, `anchors.ts`, `AvatarBoundary.tsx`.

**Customizer** (`/m` Soft-Pop, `/w` Bento), rewritten:
- Live `DiceBearAvatar` preview of the draft config.
- Style selector (Lorelei/Adventurer/Notionists) — switching resets to that
  style's defaults.
- Per-slot pickers (Hair/Eyes/Eyebrows/Mouth/Glasses/Accessory): a row/grid
  cycling the style's variants; premium variants show 🔒 + price (buy →
  unlock → select).
- Color pickers (Skin/Hair/Background): swatches.
- Save → `html-to-image` snapshot → `useSaveAvatar`.
- Reuse `useAvatarCatalog`/`useSaveAvatar` hooks (payload shape updated).

**Profile hero (`/m`) + Me (`/w`):** render `<DiceBearAvatar config={my} />`
instead of the 3D viewer; "Customize" entry + the Me-menu row stay.

## Removal of 3D

Delete: `frontend/src/avatar/{AvatarViewer,anchors,AvatarBoundary}.tsx`,
`vernon_project/public/models/*.glb` + `CREDITS.md`, the three/r3f/drei deps and
the web `dedupe` entries. Rebuild both SPAs (now light — no OOM, no swap needed).

## Migration

- Doctype field changes via `bench migrate` (additive `style`/`option_value`/
  `config_json`; old fields left nullable).
- Existing `User Avatar` rows (3D configs) are stale → on first load,
  `get_my_avatar` returns the default DiceBear config when `config_json` is
  empty; users just re-customize. No data loss elsewhere (points/badges/
  marketplace untouched).
- Bump the asset-cache story is moot (no static model files anymore).

## Error handling

- `createAvatar` wrapped in try/catch → on failure show the existing image
  `<Avatar>` fallback + toast.
- `save_my_avatar` rejects unowned premium selections (server-authoritative);
  surfaced via dialog/toast (never native alert).
- Unknown/legacy `style` in a stored config → fall back to `lorelei` default.

## Testing

- Backend (live-site convention, final phase): premium-ownership validation in
  `save_my_avatar` (free option allowed, unowned premium rejected, owned premium
  accepted), catalog ownership flags, config persistence + snapshot→identity.
  Hermetic `FrappeTestCase` like the existing `test_user_avatar.py`.
- Frontend: now verifiable headless — a small Node script can call
  `createAvatar(style, options).toString()` and assert non-empty SVG per style
  (no browser/WebGL needed). Manual check on `/m` + `/w`.

## Deploy / build notes

- `bench migrate` (fields) + `bench restart`/HUP (Python) + `npm run build`
  both SPAs. Builds are light again (no three.js) — **no swap required**.
- Frontend bundles drop ~1.5 MB each.

## Risks / open items

- DiceBear v9 core+collection version pairing must match (pin both to 9.x).
- Per-style option groups differ; the customizer must introspect
  `schema.properties` and gracefully show only the slots a style has.
- Premium variants are specific existing DiceBear variant ids we gate behind
  purchase — we are selling *access* to a built-in variant, not custom art.
- Bundle still includes 3 styles' assets (still far smaller than three.js).
