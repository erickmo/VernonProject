# Web recurrence parity + Annual frequency — design

Date: 2026-08-06
Status: Approved (design), pending spec review

## Problem

Two gaps in recurring todos/meetings:

1. **Web is stripped.** "Second Tuesday" / "last Monday" monthly recurrence already works
   end-to-end on the backend (`recurrence.py` `_monthly_nth` / `_nth_weekday`, incl. `Last`)
   and on mobile `/m` (`frontend/src/components/RecurrenceEditor.tsx` — full controls). But every
   web `/w` recurrence form hand-rolls a **reduced** editor exposing only Frequency + Until +
   Exceptions — no interval, no weekday picker, no monthly-mode / day-of-month / nth. Web users
   cannot set "second Tuesday", nor even "weekly on Tue".

2. **No Annual frequency.** `recurring_frequency` offers only Daily / Weekly / Monthly.

## Scope

- Close the web gap by porting the full editor to web (single shared component).
- Add an `Annually` frequency across backend + both frontends.
- Order the frequency options by period length everywhere: **Daily, Weekly, Monthly, Annually**.

Out of scope: nth-weekday-of-year ("2nd Tuesday of March") — Annual repeats the anchor date only.
Backend recurrence engine and mobile editor are already correct for the monthly-nth case and are
not otherwise changed.

## Annual recurrence — semantics

Annual repeats the **deadline's month + day**, every `N` years — the same derive-from-deadline
pattern Daily/Weekly already use. **No new doctype field.** The todo's existing `deadline` /
`start_date` set the first occurrence's date; each successor is that date + `interval` years.

- Feb 29 anchor → clamped to Feb 28 in common years (reuse the monthly day-of-month clamp
  `min(day, days_in_month)`). Marked with a `# ponytail:` comment.
- Resume after a gap longer than `interval` years re-anchors the series to "today" via the existing
  `first_on_or_after` fallback (rare). Documented ceiling; upgrade path = thread `recurring_anchor_date`
  into `Rule`. Not built now.

## Backend changes

`vernon_project/vernon_project/doctype/project_todo/recurrence.py`:
- Add `_annually(frm, r)`: `y = frm.year + r.interval; return date(y, frm.month, min(frm.day, _dim(y, frm.month)))`.
- Wire into `next_occurrence`: `if r.frequency == "Annually": return _annually(from_deadline, r)`.
- `first_on_or_after`: Annual falls through to the existing `return day` default (documented re-anchor).

Doctype Select options (both), append `\nAnnually`:
- `doctype/project_todo/project_todo.json:418`
- `doctype/meeting/meeting.json:38`

Deploy for the backend part = `bench migrate` (sync the Select field) + `tj-restart` (reload Python).

## Frontend — shared lib

`frontend/src/lib/recurrence.ts` (imported as `@` by both frontends):
- `Frequency` type: add `'Annually'`.
- `serializeRecurrence`: for `Annually`, send only `recurring_frequency` + `recurring_interval` +
  `recurring_until`; no weekdays / monthly_mode / day_of_month / nth (mirrors how Daily is handled).
- `summarizeRecurrence`: add `Annually` → `every('year')`.

## Frontend — web component (the parity fix)

New `frontend-web/src/components/RecurrenceEditor.tsx`:
- Contract identical to mobile: `{ value: Recurrence; onChange: (r: Recurrence) => void }`, using the
  shared `Recurrence` type + helpers from `@/lib/recurrence`.
- Web bento styling; **`@web` `SearchableSelect` + `DatePicker`** (web conventions — no native
  `<select>` / `<input type=date>`).
- Controls: Recurring toggle · Frequency (Daily/Weekly/Monthly/Annually) + interval "Every (N)" ·
  weekday picker (Weekly = multi-select, Nth = single) · Monthly-mode select → (Day-of-month input |
  nth select) · Until. Annual shows only interval + Until.
- Exceptions: **embed the existing `frontend-web/src/components/RecurrenceExceptions.tsx`** — no
  re-implementation.
- Branch logic (`isNth`, single-vs-multi weekday toggle, monthly-mode reset) mirrors mobile
  `RecurrenceEditor`; the actual field mapping stays in the shared lib.

## Frontend — swap into all web forms

Replace each form's `frequency/until/exc*` `useState` soup + inline JSX + hand-rolled `recurring_*`
mapping with one `useState<Recurrence>(emptyRecurrence)` + `<RecurrenceEditor value onChange>`:

- `frontend-web/src/components/CreateProjectItemDialog.tsx`
- `frontend-web/src/components/BulkAddDialog.tsx`
- `frontend-web/src/components/CreateMeetingDialog.tsx`
- `frontend-web/src/pages/ProjectItem.tsx` (edit)

- Submit: `Object.assign(fields, serializeRecurrence(rec))`.
- Edit load: `recurrenceFromDetail(...)` (todos) / `recurrenceFromMeeting(...)` (meeting).
- Deletes the 4 hand-rolled serialization blocks.

Each form's current recurrence wiring is verified individually during implementation (two of the four
did not match the `['Daily','Weekly','Monthly']` literal grep — confirm their shape before swapping).

## Frontend — mobile

`frontend/src/components/RecurrenceEditor.tsx`: add `'Annually'` to the Frequency options
(line 41). Annual needs no extra controls — the editor already shows only interval + Until when the
frequency is not Weekly/Monthly. No other mobile change.

## Testing

- `recurrence.py` monthly-nth math is already covered by `test_recurrence`.
- Add one `test_recurrence` case for Annual: normal year, a leap-day anchor clamped to Feb 28, and
  `interval=2`. This is the only new non-trivial backend logic.
- No new frontend tests — the web component is presentation wiring over the already-tested lib.

## Ship / deploy

- `bench migrate` + `sudo /usr/local/bin/tj-restart` (Select option + Python).
- Rebuild **both** bundles: web (new editor) and mobile (gains Annually). Purge CF asset cache +
  bump SW `ASSET_CACHE` per the Cloudflare-asset-cache rule.
- Docs: no `gen_docs.py` — no DocType / endpoint / hook added (Select option only).
- What's New: one App Release row, `platform=Both` (web gets the full editor; both get Annually),
  Bahasa, `published=1`.

## Verification before "done"

- Grep the built web bundle in `public/frontend_web/assets/` for a distinctive nth/annual string.
- Endpoint round-trip: create a todo "second Tuesday" and an "Annually" todo on web, confirm the
  `recurring_*` fields persist and the next occurrence date is correct.
