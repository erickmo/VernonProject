# Mobile User Management — Design

**Date:** 2026-06-21
**Status:** Approved
**Target:** vernon_project mobile app (React frontend + Frappe backend)

## Goal

Give System Managers a mobile screen to manage Frappe Users: create/invite,
edit, assign Vernon roles, enable/disable, and trigger password resets — without
opening the Frappe desk UI.

## Access Control

- **Gate:** System Manager role only.
- Backend re-checks `"System Manager" in frappe.get_roles(frappe.session.user)`
  on **every** endpoint and `frappe.throw(..., frappe.PermissionError)` otherwise.
  Never trust the client.
- Frontend hides the nav entry and screen when `boot.roles` lacks System Manager,
  but this is convenience only — the backend is the real gate.

## Roles Model

Vernon app roles (Frappe roles): `Project Owner`, `Project Leader`,
`Project Admin`, `Project Team`.

- These 4 are the only roles assignable/removable from the mobile screen.
- The `System Manager` role itself is **never** added or removed by these
  endpoints (privilege-escalation risk) — managed in the Frappe desk only.
  If a user already holds System Manager, role-sync preserves it untouched.
- No brand or group assignment in this feature: there is no user↔brand link in
  the schema, and "groups" in this app are scoring/gamification groups, not
  access groups.

## Backend — `vernon_project/api/mobile.py`

All endpoints `@frappe.whitelist()` and start with the System Manager guard.
Exclude `Guest` and `Administrator` from all listings and from mutation targets.

### `list_users()`
Returns all manageable users:
`name`, `full_name`, `enabled`, `user_image`, `last_active`, and their Vernon
roles (subset of the 4 above). Sorted by `full_name`. Uses `frappe.get_all`.

### `create_user(email, full_name, roles, send_welcome=1)`
- Validate `email` (format, not already a user).
- Validate `roles` ⊆ the 4 Vernon roles.
- Insert `User` doc (`enabled=1`, `send_welcome_email=send_welcome`).
- Assign chosen Vernon roles via the user's `roles` child table.
- Live site → welcome email actually sends. Return the created user summary.

### `update_user(user, full_name, roles, enabled)`
- Reject if `user` is Guest/Administrator or `user == frappe.session.user` for
  the `enabled=0` case (no self-disable).
- Validate `roles` ⊆ the 4 Vernon roles.
- Update `full_name`, `enabled`.
- Sync role set: add missing Vernon roles, remove de-selected Vernon roles.
  Leave System Manager and any non-Vernon roles untouched.
- Return updated summary.

### `reset_user_password(user)`
- Reject Guest/Administrator.
- Trigger Frappe's reset-password email flow for `user`.
- Return `{ ok: true }`.

## Frontend

### Pages
- **`frontend/src/pages/UsersScreen.tsx`** — list of users with: avatar,
  full name, email, enabled/disabled badge, role badges. Search box (client-side
  filter on name/email). Tap a row → edit sheet. FAB / header button → create.
  Empty + loading + error states matching existing screens.

### Components
- **`frontend/src/components/UserFormSheet.tsx`** — bottom sheet for create AND
  edit:
  - Create: email (required), full name, role multi-select, send-welcome toggle.
  - Edit: full name, role multi-select, enabled toggle, "Reset password" button
    (email is read-only — Frappe user id is immutable).
  - Role selection via existing `MultiSelectChips`.
  - Confirms (disable account, reset password) via `Confirm.tsx` dialog —
    never native `confirm()`.

### Data layer
- **`frontend/src/lib/api.ts`** — `listUsers`, `createUser`, `updateUser`,
  `resetUserPassword` calling the whitelisted methods.
- **`frontend/src/lib/types.ts`** — `ManagedUser`, `UserFormPayload` types;
  the 4 Vernon roles as a typed constant.
- **`frontend/src/hooks/useData.ts`** — `useUsers`, `useCreateUser`,
  `useUpdateUser`, `useResetPassword`. Refetch on mutate (no optimistic update),
  matching the existing hook pattern.

### Navigation
- Add a Users entry, gated on `boot.roles` including `System Manager`.
- Place per existing nav structure (BottomNav or Profile/settings area — follow
  current convention).

## Data Flow

`UsersScreen` → hook (`useData.ts`) → `api.ts` fn → whitelisted `mobile.py`
endpoint → Frappe ORM. Mutations invalidate/refetch the user list.

## Error Handling

- Backend throws `PermissionError` for non-System-Managers, `ValidationError`
  for bad email/role/self-disable. Frontend surfaces via `Toast`.
- Network/permission errors render the existing error state, not a crash.

## Testing

Per project convention, tests deferred to final phase (live site, no test DB).
Manual verification: create user (welcome email arrives), edit roles, disable +
re-enable, reset password, and confirm a non-System-Manager gets 403.

## Out of Scope (YAGNI)

- Brand/group membership assignment.
- Bulk operations.
- Editing the System Manager role from mobile.
- User profile/activity analytics.
