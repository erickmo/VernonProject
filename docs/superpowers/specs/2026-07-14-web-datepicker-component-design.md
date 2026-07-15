# Web DatePicker / DateTimePicker — design

**Date:** 2026-07-14
**Scope:** `frontend-web` (`/w`) only. Mobile (`/m`, `frontend`) untouched.

## Goal

Every date / datetime field in the web app opens a **styled** picker consistent
with the soft-pop design system, instead of the browser's native
`<input type="date">` / `<input type="datetime-local">` (whose text format and
calendar UI vary per OS/browser and clash with the app look). Mirrors the
existing mandatory-component conventions (`SearchableSelect`, `NumField`).

## Component

New file `frontend-web/src/components/DatePicker.tsx` — two exports:

- **`DatePicker`** — `value` (`YYYY-MM-DD` | `''`), `onChange(v: string)`,
  `disabled?`, `className?`, `id?`, `min?`, `max?`, `placeholder?`, `aria-label?`.
- **`DateTimePicker`** — same API; `value` is `YYYY-MM-DDTHH:mm`.

Design decisions:

- **`onChange` receives the value string, not a DOM event** — matches the
  `SearchableSelect` convention. Every call site rewrites
  `onChange={(e) => setX(e.target.value)}` → `onChange={(v) => setX(v)}`.
- **Trigger is a `<button>` styled by the caller's `className`** — pass the same
  `field` / `inputCls` / `fieldCls` the old `<input>` used, so layout is
  unchanged. Shows `formatDate(value)` (`@/lib/format`, e.g. "14 Jul 2026") or
  the placeholder, plus a calendar icon.
- **Calendar lives in the existing `Popover`** (`@web/components/overlays/Popover`,
  already used by `OverflowMenu`) — month nav ‹ › , weekday row, 6×7 day grid,
  today ringed, selected filled, `min`/`max` grey out-of-range. Footer:
  **Today** / **Clear**.
- **`DateTimePicker`** adds a native `<input type="time">` row under the calendar.
  `// ponytail:` native time input — time controls don't have the cross-browser
  calendar-rendering inconsistency this change fixes; upgrade to a custom wheel
  only if asked.

## Timezone safety (the one real hazard)

All date math is pure and lives in `frontend-web/src/lib/dateGrid.ts`, covered by
`dateGrid.selfcheck.ts`. Rule: **never** `new Date("2026-07-14")` — that parses as
UTC midnight and shifts a day in negative-offset zones. Strings are parsed by
regex; `Date`s are built from **local** components (`new Date(y, m-1, d)`).
`YYYY-MM-DD` lexical compare == chronological, used for `min`/`max`.

## Sweep

37 native inputs across 19 files → the two components. Purely mechanical except:

- **`Home.tsx`** — invisible-overlay chip (opacity-0 input over a "Pick" label)
  becomes a normal `DatePicker` chip (shows the picked date).
- **`DataTable.tsx` `EditableDateCell`** — `defaultValue` → controlled `value`;
  the input's `onClick` stopPropagation moves to a wrapping `<span>` so the table
  row doesn't navigate on picker click.

## Non-goals / skipped

- No new date library — plain JS date math.
- No custom time wheel — native `<input type="time">`.
- Mobile `/m` frontend unchanged.
- No new `min`/`max` wiring beyond what call sites already had (e.g. deadline ≥
  start) — additive, do later if wanted.

## Verification

- `dateGrid.selfcheck.ts` (round-trip, month grid dims/membership, month
  stepping, range clamp, datetime split/join, TZ safety).
- `tsc --noEmit` clean across `frontend-web`.
- Adversarial review of the sweep diff (missed conversions, lost props, wrong
  onChange shape, date-vs-datetime mismatch).
- Manual: open `/w`, exercise a date field and a datetime field.
