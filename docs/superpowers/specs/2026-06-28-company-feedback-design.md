# Company Feedback — Design

**Date:** 2026-06-28
**Status:** Approved (design)

## Goal

Let any logged-in user send criticism & suggestions to the company. Company
staff (System Manager) read and triage submissions in a web admin inbox.

## Decisions (locked)

- **Surface:** submit from both mobile (`/m`) and web (`/w`).
- **Identity:** default identified, with an anonymous toggle. Anonymous means
  *truly* anonymous — even admins cannot see who sent it.
- **Structure:** a type (`Criticism / Suggestion / Praise / Bug`) + free-text message.
- **Read side:** custom admin inbox page on `/w`.
- **Triage:** status `New / Reviewed / Resolved` + status filter.
- **Notify:** in-app Vernon Notification + web push to admins on new feedback.
- **Access:** inbox gated by `canManageUsers` (= `System Manager`).

## 1. Data model — new doctype `Company Feedback`

Module `Vernon Project`, `autoname: hash`, `naming_rule: Random`,
`sort_field: creation`, `sort_order: DESC`.

| field | type | notes |
|---|---|---|
| `feedback_type` | Select | options `Criticism\nSuggestion\nPraise\nBug`, reqd, in_list_view |
| `message` | Long Text | reqd, in_list_view |
| `is_anonymous` | Check | default `0` |
| `submitted_by` | Link → User | set to session user when identified; **left blank** when anonymous; in_list_view |
| `status` | Select | options `New\nReviewed\nResolved`, default `New`, reqd, in_list_view |

`creation` (built-in) is the submitted-at timestamp.

**Permissions:** only `System Manager` gets read/write/delete/report/export.
Regular users get **no** doctype-level permissions — they never read or write
the doctype directly. All writes go through whitelisted methods using
`ignore_permissions=True`.

**Anonymity integrity (must not be cut):** Frappe auto-stamps `owner` =
session user on insert. With `submitted_by` blank but `owner` set, an admin
could still read identity off `owner`. So when `is_anonymous` is truthy, after
insert scrub the owner:

```python
frappe.db.set_value("Company Feedback", name, "owner", "Administrator",
                    update_modified=False)
```

This makes anonymous submissions genuinely unattributable, admins included.

## 2. Backend API — new module `vernon_project/api/feedback.py`

New module (do **not** grow the 120K `mobile.py`). Reuses `_notify` from
`vernon_project.api.mobile`.

Constants:
```python
TYPES = {"Criticism", "Suggestion", "Praise", "Bug"}
STATUSES = {"New", "Reviewed", "Resolved"}
MAX_MESSAGE = 5000
```

### `submit_feedback(feedback_type, message, is_anonymous=0)` — `@frappe.whitelist()`
- Block `Guest` (`frappe.throw(..., frappe.AuthenticationError)`).
- `feedback_type` must be in `TYPES`, else throw.
- `message = (message or "").strip()`; throw if empty or `len > MAX_MESSAGE`.
- `anon = frappe.utils.cint(is_anonymous)`.
- Insert `Company Feedback` (`ignore_permissions=True`): `feedback_type`,
  `message`, `is_anonymous=anon`, `submitted_by = None if anon else
  frappe.session.user`, `status="New"`.
- If `anon`: scrub `owner` → `Administrator` (see §1).
- Best-effort notify: for each `System Manager` recipient, call
  `_notify(recipient, "Feedback", f"New {feedback_type.lower()} feedback",
  body_preview, "Company Feedback", name, actor=None if anon else
  frappe.session.user)`. `body_preview` = first ~140 chars of message.
  `_notify` already swallows errors and skips self / protected users.
- Return `{"status": "ok"}`.

Recipient list = users having the `System Manager` role
(`frappe.get_all("Has Role", filters={"role": "System Manager",
"parenttype": "User"}, pluck="parent")`), de-duplicated.

### `list_feedback(status=None)` — `@frappe.whitelist()`
- Assert caller is `System Manager` (else `frappe.throw(...,
  frappe.PermissionError)`).
- Filter by `status` if provided and in `STATUSES`.
- Return rows newest-first: `name`, `feedback_type`, `message`, `status`,
  `is_anonymous`, and a display submitter = `"Anonymous"` when
  `is_anonymous` else the user's `full_name` (fallback email), plus
  `at_human` (reuse `_humanize_datetime` from mobile) and raw `at`.

### `set_feedback_status(name, status)` — `@frappe.whitelist()`
- Assert `System Manager`.
- `status` must be in `STATUSES`, else throw.
- `frappe.db.set_value("Company Feedback", name, "status", status)`.
- Return `{"status": "ok"}`.

### One-line doctype edit
Add `Feedback` to the `Vernon Notification` `type` Select options
(`vernon_notification.json`).

## 3. Submit UI — both apps (all logged-in users)

Shared API client: add to `frontend/src/lib/api.ts` `mobileApi`:
```ts
submitFeedback: (feedback_type: string, message: string, is_anonymous: boolean) =>
  api.post('vernon_project.api.feedback.submit_feedback',
    { feedback_type, message, is_anonymous: is_anonymous ? 1 : 0 }),
```
(web reuses this via the `@/lib/api` alias).

Shared hook in `frontend/src/hooks/useData.ts`: `useSubmitFeedback()`
(React Query mutation).

### Mobile `/m`
- New `frontend/src/pages/FeedbackScreen.tsx`, route `/feedback` in
  `frontend/src/App.tsx`.
- Fields: type via `Segmented`/`FilterChips`, message `<textarea>`,
  anonymous toggle, submit `Button`. Soft-Pop / `paper-*` tokens, lucide
  icons, no native `alert` — success via Toast.
- Entry point: link from `Profile.tsx` ("Send feedback"), visible to all users.

### Web `/w`
- New `frontend-web/src/pages/Feedback.tsx`, route `/feedback` in
  `frontend-web/src/App.tsx`.
- Same fields using web primitives (`Button`, `Field`). Success Toast.
- Entry point: AppShell nav/footer link "Send feedback", visible to all users.

## 4. Admin inbox — `/w` only

- New `frontend-web/src/pages/FeedbackInbox.tsx`, route `/feedback-inbox` in
  `frontend-web/src/App.tsx`, guarded by `canManageUsers(boot)` (redirect to
  `/` if not). AppShell nav entry shown only when `canManageUsers`.
- Hooks in `useData.ts`: `useFeedbackInbox(status?)`,
  `useSetFeedbackStatus()`.
- UI: status filter (All / New / Reviewed / Resolved). Cards show: type chip,
  status chip, submitter (or "Anonymous"), `at_human`, message. Per-card
  status control → `set_feedback_status`, then invalidate the inbox query.

## 5. Notifications

Reuse `_notify` (in-app Vernon Notification + web push, best-effort — never
breaks the submit). One notification per System Manager; `_notify` skips the
submitter (when identified) and protected users. `reference_doctype` /
`reference_name` point at the Company Feedback row.

## 6. Error handling

- Guest blocked on submit.
- Empty/whitespace message → throw; message > 5000 chars → throw.
- Invalid `feedback_type` / `status` → throw.
- Non-admin calling `list_feedback` / `set_feedback_status` → PermissionError.
- Notification failures swallowed (never block submit).
- Anonymity: owner scrub is mandatory, not optional.

## 7. Tests (deferred to final phase, per live-site convention)

`vernon_project/api/test_feedback.py`:
- anonymous submit → `submitted_by` blank AND `owner` == `Administrator`.
- identified submit → `submitted_by` == user, `owner` == user.
- empty / whitespace / oversized message → throws.
- invalid `feedback_type` → throws.
- `set_feedback_status` with invalid status → throws.
- non-admin → `list_feedback` / `set_feedback_status` raise PermissionError.
- valid status transition persists.

## Out of scope (YAGNI)

Reply-to-user, internal admin notes, star ratings, "my past feedback" list,
attachments. Add later only if requested.

## Deploy

- `bench migrate` for the new doctype + Vernon Notification Select change.
- `bench restart` for the new Python module.
- `npm run build` for both `frontend` and `frontend-web`.
