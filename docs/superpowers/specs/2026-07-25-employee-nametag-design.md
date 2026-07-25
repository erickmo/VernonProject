# Employee Nametag — design

**Date:** 2026-07-25
**Status:** approved, implemented
**Goal:** print employee name badges that show each person's **real face** — company logo + photo + name + jabatan — selectable from the Team Wall, on both frontends.

## Why

The user wants "to see the face of every employee, printed on a nametag." Today the
Team Wall's photo mode renders the **gamified DiceBear avatar**, never the uploaded
photo — the `Avatar` component intentionally ignores `user_image`. So no surface in
the app shows real faces. The nametag is the first one, and it renders `user_image`
directly (`<img>`), falling back to initials when a photo is missing.

## Content of a badge

`[company logo]` + `[real photo]` + `[full name]` + `[jabatan]`.

- **Company logo** — one shared org logo for every badge (`boot.settings.app_logo`).
  Brand is *not* a per-employee attribute (it lives on Project), so per-person brand
  was rejected; a single org logo is what an event badge actually wants.
- **Photo** — `user_image` (the uploaded profile photo). Missing → initials circle.
- **Jabatan** — Employee Profile `job_title`. Missing → line omitted.

## Backend

One change, no new endpoint/doctype: `get_team_wall` (in `api/mobile.py`) additionally
returns `job_title` per user via a `{user: job_title}` map from Employee Profile
(mirrors the existing `avatar_config` attach). `user_image` and `full_name` are already
returned. The wall UI ignores the new field; the nametag reads the same `useTeamWall`.

## Shared frontend (`frontend/src`, imported as `@` from web)

- `types.ts`: `TeamWallUser` gains `job_title?: string | null`.
- `components/NametagPicker.tsx` — selection list: search (name/jabatan), select-all,
  per-row checkbox with real-photo thumbnail. "Cetak Nametag (N)" navigates to the
  print route passing the selected User names via router `location.state`.
- `components/NametagSheet.tsx` — the print route (`/team-wall/nametags`). Reads the
  selected names from `location.state` (falls back to the whole roster on refresh),
  filters the cached `useTeamWall` roster, and renders a badge grid. An `@media print`
  stylesheet hides all app chrome (`visibility` trick) and paginates fixed-size badges
  (54×90 mm, 9 per A4 page, dashed cut guides, `print-color-adjust: exact`). Auto-opens
  the browser print dialog once every real photo has loaded, plus a manual "Cetak" button.

## Per-frontend wiring

Both Team Wall pages get a **"Nametag"** segment alongside Photo/Grid/Mosaic/Superpower;
selecting it renders `<NametagPicker>`. Both `App.tsx` register the
`/team-wall/nametags` route → `<NametagSheet>` (shared component, same output both sides —
it is print CSS with no app chrome, so it is not duplicated per design system).

- `/m`: `pages/TeamWallScreen.tsx`
- `/w`: `pages/TeamWall.tsx`

## Platform

Both /m and /w (user asked for mobile too). Printing uses the browser dialog, which
works on mobile Chrome/Safari (Save-as-PDF / AirPrint) as well as desktop.

## Testing

- Backend: `get_team_wall` returns `job_title` (present for a user with an Employee
  Profile job_title, `None` otherwise) — extend `test_mobile.py`.
- Frontend: `tsc --noEmit` both apps; grep the built bundles for a distinctive string
  ("Cetak Nametag").

## Out of scope (YAGNI)

Per-employee brand, QR check-in on the badge, a badge-size/template UI, server-side PDF
export, event-attendee scoping. Uploading real photos for everyone is separate existing
profile functionality, not this feature.
