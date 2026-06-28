# Avatar Rich Attributes (sticky preview, all DiceBear, scenes, props, collectibles) — Design

**Date:** 2026-06-28
**Status:** Draft (design); awaiting user review

## Summary

Expand the avatar customizer with: a **sticky preview** (avatar stays visible
while scrolling options), **all** DiceBear-native attributes + **background
color/gradient**, **background scenes** (images behind the face), **overlay
props** (hats/frames/badges on/around the face), and **collectibles**
(cars/weapons/pets you own + show off on your profile, not worn). Scenes, props,
and collectibles are image assets sourced as CC0; they slot into the existing
freemium economy (free defaults + 5000-pt unlocks). Delivered as one spec but
**built in 4 internal phases** so it ships incrementally.

DiceBear renders a face **portrait**; weapons/cars can't be worn on it, so they
live as scene backgrounds (Phase 2), around-the-face overlays (Phase 3), or
owned collectibles displayed on the profile (Phase 4) — composited via a new
`AvatarScene` container, captured whole by `html-to-image`.

## Phase 1 — sticky preview + all DiceBear native + background (no art)

**Sticky preview.** In both customizers, the avatar-preview card becomes
`position: sticky; top: 0` (mobile) / a sticky column (web) so it stays visible
as the option lists scroll. Pure CSS/layout.

**All DiceBear native slots.** Extend `CURATED_SLOTS` to every enum slot the 3
styles expose: add `beard, head, freckles, body, bodyIcon` (to the existing
hair/eyes/eyebrows/brows/mouth/lips/glasses/earrings/nose/features/hairAccessories/gesture).
`slotsForStyle` already filters to slots present per style, so each style shows
only what it has. The freemium rule (first-3 free) applies unchanged → regenerate
`AVATAR_FREE` to include the new slots' first-3.

**Background color + gradient.** `backgroundColor`/`backgroundType` are DiceBear
**core** options (not in per-style schema) — pass them directly. Add a
**Background** tab: a palette for `backgroundColor` (1 color = solid; 2 colors +
`backgroundType:['gradientLinear']` = gradient) and a solid/gradient toggle.
Stored in `config.options.backgroundColor` / `backgroundType` (always free).

## Composited renderer — `AvatarScene` (Phases 2-3)

Replace bare `DiceBearAvatar` usage in the preview/heroes with `AvatarScene`, a
square relative container stacking:
1. **Background layer** — the `scene` asset image (CSS `background-image`/`<img>`),
   else the DiceBear background color/gradient.
2. **Face layer** — the DiceBear SVG (`DiceBearAvatar`), centered.
3. **Overlay layers** — each equipped `prop` asset as an absolutely-positioned
   `<img>` at its anchor (top=hat, full=frame, corner=badge), sized by the
   asset's `scale`.

Snapshot: `html-to-image` `toPng` on the `AvatarScene` container captures
background + face + props together → identity image. (CORS: assets are served
same-origin from `/assets/vernon_project/...`, so `toPng` can rasterize them.)

## Image-asset catalog — `Avatar Asset` doctype (Phases 2-4)

Scenes, props, and collectibles are enumerated image assets (not DiceBear option
ids), so they need a catalog:

### New doctype `Avatar Asset`
| Field | Type | Notes |
|-------|------|-------|
| `asset_name` | Data | name, unique |
| `asset_type` | Select | `Scene` / `Prop` / `Collectible` |
| `image` | Attach Image | the asset (PNG/SVG, served same-origin) |
| `anchor` | Select | `top` / `frame` / `corner` / `none` (props placement; scenes/collectibles = none) |
| `scale` | Float | overlay size fraction (props) |
| `is_default` | Check | free for everyone |
| `price` | Float | default 5000; premium price |
| `active` | Check | default 1 |

### Ownership (reuse `Avatar Unlock`)
Image-asset premium-ness is **catalog-based** (`is_default`), not rule-based.
An asset is owned iff `is_default` OR an `Avatar Unlock` exists for it. Unlocks
store assets with `style="_asset"`, `slot=asset_type` (lowercase), `option_value=asset_name`.

## config_json extension

```json
{ "style":"lorelei", "options":{...DiceBear...,"backgroundColor":["b6e3f4"],"backgroundType":["solid"]},
  "scene":"scene_city", "props":["prop_crown","prop_frame_gold"], "featured_collectible":"car_red" }
```
`scene` (one asset name | null), `props` (array of asset names), `featured_collectible`
(one | null) are new optional keys. Backend stores opaquely; validates ownership.

## Phase 2 — background scenes

- `Avatar Asset` rows of `asset_type=Scene` (e.g. City, Space, Sunset, Beach,
  Garage-with-car). Some `is_default` (free), some premium.
- Customizer **Scene** tab: grid of scene thumbnails (the image itself); tap =
  preview (set `config.scene`); premium → 🔒 + price + Buy (reuse buy flow).
- `AvatarScene` renders the chosen scene behind the face.

## Phase 3 — overlay props

- `Avatar Asset` rows of `asset_type=Prop` with an `anchor` (hats=`top`,
  frames=`frame`, badges=`corner`) + `scale`. Multiple props can be equipped
  (one per anchor; e.g. one hat + one frame).
- Customizer **Props** tab: grid; tap toggles the prop into `config.props`
  (replacing any prop sharing its anchor); premium → buy.
- `AvatarScene` overlays each equipped prop at its anchor.

## Phase 4 — collectibles (showroom)

Collectibles are **owned, not worn**: cars/weapons/pets you buy + display.
- `Avatar Asset` rows of `asset_type=Collectible` (Car, Sword, Pet, etc.),
  each premium (priced).
- A **Collectibles** section: in the customizer (or a profile sub-page), a grid
  of all collectibles; owned ones highlighted; locked ones show price + Buy.
- A user can set one **featured collectible** (`config.featured_collectible`)
  shown as a small badge beside their avatar on the Profile/Me hero.
- Purchases use the same `buy_avatar_*` flow; ownership via `Avatar Unlock`.

## Backend API changes (`api/mobile.py`)

- `AVATAR_FREE` regenerated to include the new native slots' first-3.
- `_asset_owned(user)` → owned asset names (default assets + unlocks where `style="_asset"`).
- `buy_avatar_option` extended (or a sibling `buy_avatar_asset(asset_name)`) to
  handle image assets: look up `Avatar Asset`, reject if `is_default`, charge its
  `price`, insert an `Avatar Unlock` (`style="_asset"`, slot=type, value=name).
- `save_my_avatar` validates the new keys: `scene`/`props`/`featured_collectible`
  values must be owned assets (default or unlocked) of the right type, else reject.
- `get_avatar_catalog` adds `assets: [{asset_name, asset_type, image, anchor,
  scale, owned, price}]` alongside the existing DiceBear `unlocked`/free rule.
- `seed_avatar_catalog` seeds the initial `Avatar Asset` rows (a starter set per
  type, mix of free + premium).

## Asset sourcing (the main cost/risk)

Scenes, props, and collectible art are CC0 2D images, sourced at implementation
time (Kenney 2D packs, OpenGameArt CC0, unDraw, public-domain illustrations) and
served from `vernon_project/public/avatar_assets/`. **This is the recurring hard
part** (same as the 3D GLB / chibi sourcing): blind curation of cohesive CC0 art
is uncertain. Where good CC0 isn't found, simple generated/solid placeholders
ship first and swap later (same file path). Each asset's license recorded in a
CREDITS file.

## Snapshot / identity

Unchanged flow: `html-to-image` `toPng(AvatarScene)` → `save_my_avatar` →
`User.user_image`. Now captures the full composited scene (bg + face + props).
Same-origin assets keep `toPng` from tainting the canvas.

## Error handling

- Missing/failed asset image → render the face without it (graceful); toast on
  buy/save errors (never native alert).
- Save with an unowned scene/prop/collectible → rejected server-side + blocked
  client-side (like premium variants).
- WebGL N/A (2D); `toPng` failure → config still saves, identity unchanged.

## Testing

- Backend: `Avatar Asset` ownership (default vs unlocked), `buy_avatar_asset`
  (free reject / insufficient / success), `save_my_avatar` rejects unowned
  scene/prop/collectible, catalog returns assets. Hermetic `FrappeTestCase`.
- Frontend: headless SVG/gradient render asserts; manual /m /w composite check.

## Deploy

`bench migrate` (Avatar Asset doctype) + reload + asset files + `npm run build`
both SPAs (light). Asset images cache-busted via build/path versioning.

## Phasing (build order within this spec)

1. **Phase 1** — sticky + all-native slots + background color/gradient. No art. Ships first.
2. **Phase 2** — `Avatar Asset` doctype + `AvatarScene` + scenes (+ source scene art).
3. **Phase 3** — props (anchored overlays) (+ source prop art).
4. **Phase 4** — collectibles + showroom + featured-on-profile (+ source item art).

Each phase = its own implementation plan + review + deploy.

## Risks / open items

- **Art sourcing** dominates Phases 2-4 (cohesive CC0 scenes/props/cars/weapons,
  blind). Placeholders first, swap later.
- `html-to-image` rasterizing external `<img>`/SVG layers can be browser-flaky;
  same-origin mitigates tainting; verify the composite snapshot on a device.
- Bundle/asset weight grows with image assets; keep them small (optimized PNG/SVG).
- `Avatar Unlock` now also holds `_asset` rows — `_user_balance` already nets all
  unlock costs, so asset purchases are economy-consistent.
