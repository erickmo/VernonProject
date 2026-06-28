# Avatar Freemium (3 free per slot, rest purchasable) — Design

**Date:** 2026-06-28
**Status:** Draft (design); awaiting user review

## Summary

Change the DiceBear avatar economy: for each style + slot, the **first 3
variants** (DiceBear enum order) are **free**; every later variant is
**premium** — previewable on the live avatar but requiring a flat **5000-point**
purchase before it can be saved. Premium variants show a friendly **"Style N"**
label (not raw `variant05`), a 🔒 + price, a **mini-preview** of the variant on
the user's avatar, and a per-tile **Buy** button. Ownership is server-enforced.

This replaces the previous "enumerated premium Avatar Item rows + redeem_reward"
model with a **rule-based** free/premium split + a lightweight per-variant
unlock, so we never seed hundreds of catalog rows.

## Locked decisions (from brainstorming)

- **Free rule:** first 3 variants of each curated slot per style are free; 4+ premium.
- **Price:** flat **5000 points** per premium variant.
- **Buy UX:** per-tile **Buy** button (preview on tap; explicit buy per variant).
- **Labels:** friendly "Style N" (position-based, scales to any count) + a
  rendered mini-preview thumbnail per tile; premium tiles add 🔒 + price.
- **Preview:** tapping any variant (free or premium) applies it to the live
  preview; saving an unowned premium is blocked client-side and rejected server-side.

## Backend

### `AVATAR_FREE` map (in `api/mobile.py`)
First-3 variant ids per (style, slot), generated from the installed DiceBear v9
enums (same order the frontend introspects → both agree on "free"):
```python
AVATAR_FREE = {
  "lorelei": {"hair":["variant48","variant47","variant46"],"eyes":["variant24","variant23","variant22"],"eyebrows":["variant13","variant12","variant11"],"mouth":["happy01","happy02","happy03"],"glasses":["variant01","variant02","variant03"],"earrings":["variant01","variant02","variant03"],"nose":["variant01","variant02","variant03"],"hairAccessories":["flowers"]},
  "adventurer": {"hair":["short16","short15","short14"],"eyes":["variant26","variant25","variant24"],"eyebrows":["variant10","variant09","variant08"],"mouth":["variant30","variant29","variant28"],"glasses":["variant01","variant02","variant03"],"earrings":["variant06","variant01","variant02"],"features":["mustache","blush","birthmark"]},
  "notionists": {"hair":["variant63","variant62","variant61"],"eyes":["variant05","variant04","variant03"],"brows":["variant13","variant12","variant11"],"lips":["variant30","variant29","variant28"],"glasses":["variant11","variant10","variant09"],"nose":["variant20","variant19","variant18"],"gesture":["wavePointLongArms","waveOkLongArms","waveLongArms"]},
}
PREMIUM_PRICE = 5000
```
A slot is **premium-checked** iff it appears in `AVATAR_FREE[style]`. Color
slots (`skinColor`/`hairColor`/`backgroundColor`) and `*Probability` keys are
always free (not in the map → skipped). A value is **free** iff it's in the
slot's first-3 list; otherwise **premium**.

### New doctype `Avatar Unlock`
One row per purchased variant. `autoname` = `hash`.
| Field | Type | Notes |
|-------|------|-------|
| `user` | Link → User | required |
| `style` | Data | required |
| `slot` | Data | required (DiceBear option key) |
| `option_value` | Data | required (variant id) |
| `cost` | Float | snapshot of price at purchase |
| `unlocked_on` | Datetime | |
Uniqueness enforced in code: one unlock per (user, style, slot, value).

### Balance
`_user_balance` subtracts unlock spend: `balance = earned − redeemed − Σ Avatar Unlock.cost`.
(One added term; mirrors how `redeemed` is summed.)

### API (`api/mobile.py`)
- `_avatar_owned_options(user) -> set[(style,slot,value)]` — the user's unlocks.
- `_is_free(style, slot, value) -> bool` — `value in AVATAR_FREE.get(style,{}).get(slot, [value])` (slots absent from the map → always free).
- `buy_avatar_option(style, slot, value)` — whitelisted; row-locked per user
  (mirror `redeem_reward`'s `get_lock`): reject if `_is_free` (already free);
  reject if already unlocked; require `balance ≥ PREMIUM_PRICE`; insert an
  `Avatar Unlock` (cost = PREMIUM_PRICE); return new balance.
- `save_my_avatar` — for each `(slot, values)` in config.options where
  `slot in AVATAR_FREE[style]`: every value must be free **or** in the user's
  unlocks, else `ValidationError`. (Existing config-snapshot + snapshot→identity
  logic unchanged.)
- `get_avatar_catalog()` → `{ free_count: 3, price: PREMIUM_PRICE,
  unlocked: [{style,slot,option_value}], my: <config>, balance }`. The old
  `premium[]` (from `Avatar Item`) is dropped; the frontend derives free/premium
  from variant index + `unlocked`.

### Retire the old premium model
`seed_avatar_catalog` no longer creates `Avatar Item`/`Marketplace Reward`
premium rows; it deletes the 6 it made. `Avatar Item` doctype stays defined but
unused (no migration risk). Purchases go through `buy_avatar_option`, not
`redeem_reward`.

## Frontend

`frontend/src/avatar/styles.ts`:
- `PREMIUM_FREE_COUNT = 3`. `isPremiumSlot(slot)` = `slot ∈ CURATED variant slots` (not a color/probability key).
- helper `variantLabel(slot, index) -> "Style {index+1}"`.

`DiceBearAvatar` already renders a config → reuse it for mini-previews: a tile
renders `<DiceBearAvatar config={{...draft, options:{...draft.options, [slot]:[value]}}}/>` at small size.

Customizer (`/m` + `/w`), per slot:
- `slotsForStyle(style)` gives ordered variants. Index `<3` = **free**; `≥3` =
  **premium**.
- Each tile: mini-preview thumbnail + "Style N". Free → tap selects/previews.
  Premium → tap **previews** (applies to draft); shows 🔒 + `5000`; if unowned,
  a **Buy** button → `mobileApi.buyAvatarOption(style, slot, value)` →
  invalidate catalog → owned (tile loses lock). Owned premium behaves like free.
- **Save** is blocked when the draft contains an unowned premium variant
  (toast: "Unlock the previewed 🔒 items first"); otherwise saves as today.
- Header shows the point balance (so 5000 prices are meaningful).

`api.ts`: add `buyAvatarOption(style, slot, value)` (POST). `useData.ts`: a
`useBuyAvatarOption` mutation (invalidate catalog + boot/wallet) or call via the
existing pattern. Types: `AvatarCatalog` gains `unlocked`, `price`, `free_count`,
`balance`; drop `premium`.

## Ownership / security

Server-authoritative: `buy_avatar_option` is the only way to gain an unlock and
it charges the server-side `PREMIUM_PRICE` with a per-user lock + balance check;
`save_my_avatar` independently rejects any unowned-premium selection. The client
cannot self-grant or set price. A user previewing premium can never *save* it
unbought.

## Error handling

- Insufficient balance → `buy_avatar_option` throws "Insufficient balance" → toast.
- Double-buy → idempotent (already-unlocked → no-op/return current balance).
- Save with unowned premium → blocked client-side + rejected server-side (dialog/toast, never native alert).

## Testing

- Backend: `_is_free` boundary (3rd free, 4th premium), `buy_avatar_option`
  (free→reject, insufficient→reject, success→unlock+balance drop, double→no-op),
  `save_my_avatar` (free allowed, unowned-premium rejected, unlocked accepted),
  balance subtracts unlock cost. Hermetic `FrappeTestCase`.
- Frontend: headless — assert index<3 vs ≥3 split + label; manual /m /w check.

## Deploy

`bench migrate` (new doctype) + reload + `npm run build` both SPAs (light). Bump
no asset cache (no static models). Existing saved configs keep working (their
selected variants are either free or — if previously premium-free — still render;
none were paid before).

## Risks / open items

- `AVATAR_FREE` must track the installed DiceBear enum order; pinned to v9.
  If DiceBear is upgraded, regenerate the map.
- 5000 is high vs current lifetime points (top user ~165) — premium is
  aspirational by design (user's choice).
- Mini-preview renders N small SVGs per open slot (dozens) — DiceBear is cheap;
  cap/lazy-render if a slot has many variants and perf suffers.
