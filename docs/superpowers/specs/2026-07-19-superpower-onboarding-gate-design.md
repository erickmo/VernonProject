# Superpower Onboarding Gate — design

**Date:** 2026-07-19
**Status:** approved

## Goal

Force every user to claim at least one **superpower** before they can use the app — an
admin-controlled onboarding gate that doubles as a hype moment for the superpower gamification.

## Behavior

- One admin toggle (`Vernon Settings.force_superpower_onboarding`, default `0` → inert).
- While ON, any user with **zero** self-claimed superpowers (`User Superpower` rows) hits a
  full-screen modal on app open, in **both** /m and /w.
- Modal = animated hero (the user's gamified avatar + orbiting/floating superpower icons,
  gradient glow, pop/confetti entrance) + Bahasa headline + explanation + one CTA
  **"Pilih Superpower-ku →"**. No skip button.
- CTA navigates to `/superpowers`. The overlay renders everywhere **except** `/superpowers`, so
  that page is the only screen reachable until the user claims a trait.
- Claim ≥1 trait → boot refetches → `has_superpower` true → gate never returns.

Gate condition (no per-session dismiss state):

```
blocked = force_superpower && !has_superpower && !path.startsWith('/superpowers')
```

## Changes

| Layer | Change |
|---|---|
| `Vernon Settings` doctype | +1 `Check` `force_superpower_onboarding` (default 0) |
| `bootstrap()` (mobile.py) | `settings.force_superpower` + `settings.has_superpower` |
| `get_app_settings` / `save_app_settings` | pass the new flag through |
| /w Settings admin UI | one toggle row |
| `SuperpowerGate.tsx` | new shared component (`frontend/src/components`, imported by both apps) |
| both `App.tsx` | mount `{blocked && <SuperpowerGate onGo={…}/>}` next to existing `Onboarding` |
| claim mutation `onSuccess` | invalidate boot query so `has_superpower` flips |

## Reuse (no new primitives)

Existing self-claim flow (`set_my_superpowers`), existing boot-modal mount pattern,
existing avatar renderer, existing `animate-float/pop` utilities. No new asset, no new
endpoint, no schema beyond one checkbox.

## Copy (Bahasa, end-user)

> **⚡ Waktunya pilih Superpower-mu!**
> Setiap orang punya kekuatan unik. Pilih superpower yang paling menggambarkan dirimu — biar
> rekan kerja mengenali kelebihanmu, memberi nilai, dan kamu naik level serta kumpulkan badge
> dari kontribusimu. Yuk mulai sekarang!
>
> `[ Pilih Superpower-ku → ]`

## Deploy

`bench migrate` (new field) → build both frontends → `tj-restart` → What's New App Release row.

## Out of scope

No "signature/primary" single-power concept (gate clears on any ≥1 claim). No per-role
exemptions. No analytics.
