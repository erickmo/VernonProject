# Web `/w` homepage → mobile parity — design

**Date:** 2026-07-13
**Scope:** `frontend-web/src/pages/Home.tsx` + one line in `frontend-web/src/components/AppShell.tsx`. Web only. No backend, no shared-type changes.

## Goal

Bring the web homepage closer to the mobile `/m` Today screen on three axes the user asked for: full-width canvas, a mobile-style shortcut tile grid, and the mobile Plan/Deadline/Waiting todo area.

## Changes

### 1. Full-width main area
`AppShell.tsx mainWidth()`: the `/` route returns `''` (full-bleed, same as `/project/`) instead of `max-w-7xl`. The existing 2-col `main + 380px aside` grid stays; it just uses the extra width.

### 2. Shortcut tile grid (mobile parity)
- Reuse the shared `ACTIONS` list from `@/lib/actions` (the same source that drives mobile `QuickActions`).
- Render a **web-styled, wrapping** full-width tile grid near the top of the page — under the meeting reminder, above the stat tiles. No mobile `-mx-4` horizontal-scroll idiom; the web grid wraps.
- Delete the aside **"Jump to"** launcher and its now-unused `buildNavGroups` / `GROUP_ICON` usage.

### 3. Todo area → Plan / Deadline / Waiting axis
Replaces the flat 5-tab `Segmented` (Overdue/Today/Upcoming/Planned/Waiting) inside the `lens === 'me'` block. Ports mobile Today's structure:

- **Axis tabs:** Plan · Deadline · Waiting (Waiting carries a count).
- **Plan** → sub-tabs Today / Past / Upcoming + a native `<input type="date">` "Pick a day". Grouped by **allocation date** via mobile's `allocOn` / `planGroups` logic (mutually exclusive, precedence Today > Past > Upcoming). Today group uses `focusedFirst` + `byAllocationAsc`; past/upcoming `byDeadlineAsc`; picked-day `byAllocationAsc`.
- **Deadline** → sub-tabs Today / Overdue / Upcoming. Overdue sorts `byDeadlineDesc` (per the auto-plan/deadline convention), today & upcoming `byDeadlineAsc`.
- **Waiting** → parked list (`is_waiting`), `byDeadlineAsc`.
- **Plan-my-day CTA banner + Auto-plan button** row above the axis tabs (ports mobile).
- Cards render **single-column** (`flex flex-col gap-3`), reusing the shared `TodoCard`, the existing web search box, and the existing filter popover.
- Tabs reuse web's existing `Segmented` component (no new PillTabs).

## Kept unchanged
Stat tiles, lens switcher (For me / Owned / Led / I'm in), aside cards (This week / Verse / Today's meetings / Attendance), banners, shortfall alert, `PageHeader` actions.

## Deliberately skipped
- Mobile `-mx-4` full-bleed / horizontal-scroll idioms (mobile-only).
- The mobile Spotlight rotating hero (web already surfaces stat tiles + banners; not requested).

## Deploy
Web build only: `cd frontend-web && npm run build`. No Python restart (static assets, hashed filenames self-bust cache).
