# Mobile: "My Info" own page + admin employee management — design

**Date:** 2026-07-05
**Scope:** mobile frontend (`/m` = `frontend/`) only. No backend, no doctype changes.
**Follows:** [2026-07-05-employee-profile-design.md](2026-07-05-employee-profile-design.md) (initiative that shipped the self-profile card + web admin editor).

## Motivation

Two user asks:

1. **Move "my info update" to a separate page.** Today self-service editing is an inline
   `MyInfoCard` crammed into the `/me` profile scroll. Promote it to its own route.
2. **Admins can manage employees from mobile.** Today the combined User+Employee admin form
   only exists on web (`/w`). Mobile's user-admin form edits User roles/enabled only. Bring it
   to parity so a System Manager can edit any employee's legal/contract/leave fields on a phone.

## Decisions (confirmed with user)

- Admin delivery: **fold** employee-profile fields into the existing mobile Manage-Users form
  (not a separate Employees screen). Mirrors web exactly, reuses the existing route.
- Admin field scope: **full parity with web** (legal + bank + contract + leave quota).
- "My Info" entry point: **its own top menu section** on `/me` (prominent), not buried in Account.
- Leave-balance chip: **moves with the card** to `/me/info`. `/me` no longer shows it.

## Current state (verified)

- Self card: `MyInfoCard`, `frontend/src/pages/Profile.tsx:479-786`. Self-contained — own state,
  one-shot hydration (`:502-516`), `useSaveMyProfile` (`:487`), local consts `INPUT_CLS`/
  `PROFICIENCIES`/`EDU_LEVELS` (`:473-477`). Rendered inline at `Profile.tsx:340`.
- Save endpoint: `useSaveMyProfile` → `mobileApi.updateMyProfile` (soft fields only, self).
- Admin plumbing **already exists and is used by web**: `mobileApi.getEmployeeProfile(user)` /
  `updateEmployeeProfile(user, payload)` (`frontend/src/lib/api.ts:488/490`), `useEmployeeProfile`
  hook (`frontend/src/hooks/useData.ts:1620`), `EmployeeProfileAdmin`/`LeaveBalance` types.
  Backend `get_employee_profile` / `update_employee_profile` are `System Manager`-gated
  (`vernon_project/api/mobile.py:5123/5138`).
- Web parity reference: `frontend-web/src/pages/UserForm.tsx` — the exact combined form to mirror.
- Mobile form to extend: `frontend/src/pages/UserFormScreen.tsx` (uses `DetailScreen` shell).
- Route already registered + gated: `/users/:name` under `canManageUsers` (`App.tsx:189-196`).

## Feature 1 — `/me/info` page

**New file `frontend/src/pages/MyInfoScreen.tsx`**
- `DetailScreen` shell (`@/components/Layout`), title "My Info", Save button in the `right` slot
  (same pattern as `UserFormScreen`).
- Move `MyInfoCard`'s body + the three module consts (`INPUT_CLS`, `PROFICIENCIES`, `EDU_LEVELS`)
  verbatim. Read `boot.employee` + `boot.leave` via `useBoot()`; save via `useSaveMyProfile`.
  The read-only leave chip renders here (top of the form). **No logic change** — pure relocation.
- Imports: `useState`/`useEffect`, `DetailScreen`, `Spinner`, `useToast`, `useBoot`,
  `useSaveMyProfile`, the `EmployeeChild*` types, lucide icons
  (`User, Phone, MapPin, CalendarDays, Award, BookOpen, ClipboardList, Trash2, Plus`).

**`App.tsx`** — add **ungated** route `/me/info` → `<MyInfoScreen />`, next to `/me` (self-service;
boot already guarantees an authenticated user).

**`Profile.tsx`**
- Delete inline `<MyInfoCard employee={boot.employee} leave={boot.leave} />` at `:340`.
- Delete the `MyInfoCard` function (`:479-786`) and the three consts moved to the new file.
- Add a **new first menu section** at the top of the `menu` array:
  `{ title: 'Me', rows: [{ icon: User, label: 'My Info', hue: 'indigo', onClick: () => navigate('/me/info') }] }`.
- Prune imports left unused after `MyInfoCard` leaves (`useSaveMyProfile`, `Phone`, `MapPin`,
  `Award`, `Plus`, `Trash2`, and any `EmployeeChild*`/`EmployeeSoft` types no longer referenced).
  **`noUnusedLocals` is off and `vite build` doesn't type-check, so nothing flags these —**
  **prune by hand**: for each candidate, grep it across the rest of `Profile.tsx` and only remove
  if it has no other use (e.g. `User`, `CalendarDays`, `BookOpen`, `ClipboardList` are also used
  by the settings menu / other cards — keep those).

## Feature 2 — admin employee fields in `UserFormScreen.tsx`

Mirror `frontend-web/src/pages/UserForm.tsx`, mobile-styled. Edit-mode only (`isEdit`).

- **Imports:** add `mobileApi` (`@/lib/api`), `LeaveBalance` type (`@/lib/types`).
- **State (14 + balance):** `nikKtp, npwp, bpjsKes, bpjsTk, bankName, bankAccountNo,
  bankAccountHolder, employmentStatus, jobTitle, dateJoined, contractStart, contractEnd,
  annualLeaveQuota (number|''), priorLeaveTaken (number|''), leaveBalance (LeaveBalance|null)`.
- **Load:** `useEffect([name])` → `mobileApi.getEmployeeProfile(name).then(populate).catch(noop)`
  (non-fatal — fields stay blank if fetch fails, matching web).
- **Save:** in `onSave` `isEdit` branch, after `update.mutateAsync(...)`:
  ```
  await mobileApi.updateEmployeeProfile(name, {
    nik_ktp, npwp, bpjs_kesehatan, bpjs_ketenagakerjaan,
    bank_name, bank_account_no, bank_account_holder,
    employment_status, job_title, date_joined, contract_start, contract_end,
    annual_leave_quota: annualLeaveQuota === '' ? null : annualLeaveQuota,
    prior_leave_taken: priorLeaveTaken === '' ? null : priorLeaveTaken,
  })
  ```
- **UI sections** (inside the `isEdit` block, between the "Account enabled" toggle and the
  password controls), mobile input styling (reuse the existing inline field className or a local
  `field` const):
  - **Legal & ID:** NIK KTP, NPWP, BPJS Kesehatan, BPJS Ketenagakerjaan, Bank name,
    Account number, Account holder name.
  - **Contract:** Employment status (select: Permanent/Contract/Probation/Intern), Job title,
    Date joined (`date`), Contract start (`date`), Contract end (`date`).
  - **Leave:** Annual leave quota (`number`), Leave already taken this year / pre-system
    (`number`), read-only balance line when `leaveBalance` present
    (`{remaining} / {quota} days remaining`, `{used} used`, `(incl. {prior} pre-system)`).
- **Reached via:** existing Manage Users → tap user. No new route or nav entry.
- **`attach_*` uploads omitted** — parity with web (no generic private-file uploader yet).

## Non-goals

- No backend / doctype / API changes (all endpoints + JS bindings already exist).
- No separate Employees list screen.
- No `dirty`/discard-confirm on the mobile user form (mobile version never had it; not adding).
- No `project_todo.py` touch (unrelated in-flight work by the user).

## Verification

Live site, no test DB (project convention — [vernon-live-site-codefirst]). This change is UI
relocation + a form mirrored from an already-shipped web component; the meaningful gate is the
type-check, plus a manual smoke:

1. `cd frontend && npx tsc --noEmit` — must pass with 0 errors (catches payload/type mismatches).
   `vite build` alone does **not** type-check, so this is the real gate.
2. `cd frontend && npm run build` — regenerates `vernon_project/public/frontend/*` + `www/m.html`;
   commit those built assets so the live site serves them (as commit `f6fb845` did).
3. Manual: `/me` shows a "My Info" section row; tapping opens `/me/info` with all fields + leave
   chip; Save persists (toast) and survives reload.
4. Manual (as System Manager): Manage Users → a user → Legal/Contract/Leave sections populate,
   edits save, reload confirms. As a non-admin the `/users` route stays gated (unchanged).

## Risks

- Unused-import pruning in `Profile.tsx` — nothing enumerates them automatically (`noUnusedLocals`
  off, `vite build` skips type-check). Grep each candidate across the file before removing; don't
  remove identifiers still referenced by the settings menu / avatar / passkey code.
- Field-name drift vs. backend: payload keys must match `update_employee_profile` args exactly
  (copied from web, which works today).
