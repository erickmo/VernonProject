# Gift received → celebratory CheerPop

**Date:** 2026-07-27
**Status:** approved

## Problem

Sending points (peer-to-peer "gift") lands silently for the receiver: a plain
in-app notification row, no celebration. Reporters read this as "points not
received." The points *do* arrive (spendable wallet + notification verified on
live) — what's missing is the moment.

## Design

Reuse the existing `CheerPop` full-screen confetti overlay (already mounted in
both `/m` Today and `/w` Home, driven by `classifyCheer(notification)` polling
every 30s). Make a received gift pop it, in a new gift flavor.

### Detection — a dedicated notification type

Gift/grant/earned all share `type:"Points"`, so keying CheerPop on "Points"
would confetti on every completed todo. Instead the gift notification gets its
own type `"Gift"`:

- Add `"Gift"` to `Vernon Notification.type` Select options (+ `bench migrate`).
  **Required first** — `_notify` inserts with validation on and swallows errors,
  so an unknown Select value makes the notification vanish silently.
- `gift_points._notify(type="Gift", …)`, and its title/body → **Bahasa**
  (`"Kamu dapat kado poin! 🎁"` / `"{sender} memberi kamu {amount} poin."`).

Grant (admin) stays quiet — out of scope, rare, no "someone thanked you" moment.

### Frontend (shared `@` = both apps)

- `types.ts`: add `'Gift'` to `NotificationType`.
- `notifications.ts`: add `Gift: Gift` to `TYPE_ICON` (icon already imported).
- `cheer.ts`: add `'gift'` to `CheerKind`; `type === 'Gift'` → `'gift'`; extend
  the `demo()` self-check.
- `CheerPop.tsx`: add a `gift` KIND — 🎁 hero, headline `"Kamu dapat kado!"`,
  gold/amber gradient, sub = notification body. Auto-dismiss like `thanks`.

`deepLink` is keyed on `reference_doctype` (`"Wallet"` → `/wallet`), unchanged.

## Out of scope

Grant celebration; changing the points model; a persistent "gifts received"
history screen.

## Check

`cheer.ts` `demo()` asserts `type:"Gift"` → `"gift"` and that plain `"Points"`
still → `null` (no confetti on earned points).
