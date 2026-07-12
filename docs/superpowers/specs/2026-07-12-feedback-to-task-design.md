# Create Task from Feedback — Design

**Date:** 2026-07-12
**App:** vernon_project
**Scope:** both frontends (`/w` web + `/m` mobile)

## Problem

Admins triage `Company Feedback` in the inbox (types: Criticism / Suggestion /
Praise / Bug; statuses: New / Reviewed / Resolved / Rejected). When a bug or
suggestion is actionable there is no way to turn it into work — the admin has to
manually re-key it as a Project Todo somewhere. We want a one-click "Create task"
that opens the normal todo form prefilled from the feedback, then records the link.

## Constraints (from the code)

- A todo is a `Project Todo`. It **must** live under a `project_detail` and needs
  `assigned_to`, `group`, `level_id` (type/level), `start_date`, `deadline`.
  Feedback carries none of that — so the admin must pick project → detail and fill
  the todo form. There is no lightweight/personal todo concept to reuse.
- Todo creation already exists as `CreateProjectItemDialog` (web) and
  `CreateProjectItemSheet` (mobile). Both take identical props
  (`projectDetail`, `team`, `defaultGroup`, `siblings`, `initial`) and both call the
  shared `useCreateProjectItem` hook → `frappe.client.insert` of a `Project Todo`.
- The feedback inbox exists in both frontends: `FeedbackInbox.tsx` (web) and
  `FeedbackInboxScreen.tsx` (mobile), both gated by `canManageUsers` (System Manager).
- Data to drive a project→detail picker is already available via shared hooks:
  `useProjects()` → project cards; `useProject(name).project_details` → details;
  `useProjectDetail(detail)` → `{ team, default_group, project }`.

## Decisions (agreed)

1. **Flow:** pick project → detail, then open the existing full todo dialog
   prefilled from the feedback. Maximum reuse, no lightweight-todo shortcut.
2. **After create:** set feedback `status = "Reviewed"` **and** store the created
   todo's name on the feedback (link). Card shows a "View task" link.
3. **Frontends:** both `/w` and `/m`.
4. **Prefill:** feedback text goes into **both** the todo title (trimmed to the
   first line / ~140 chars) and the notes (full message). Admin edits either.
5. **Availability:** "Create task" shows on **all** New/Reviewed feedback
   (no feedback-type gate).

## Design

### 1. Backend — `api/feedback.py` + doctype

- **Doctype `Company Feedback`:** add field `linked_todo`
  (`Link` → `Project Todo`, no reqd). Ships via `bench migrate`.
- **New whitelisted endpoint** `link_task(feedback, todo)`:
  - `_require_admin()`
  - validate both docs exist; set `linked_todo = todo` and `status = "Reviewed"`
    on the feedback; `frappe.db.commit()`; return `{"status": "ok"}`.
  - The todo itself is created client-side through the existing `createTask`
    (`frappe.client.insert`); this endpoint only records the link + status.
- **`list_feedback`:** add `linked_todo` to the returned fields/items so cards can
  render the "View task" link.

### 2. Todo dialogs — new optional callback (shared behaviour)

Add optional prop `onCreated?: (todoName: string) => void` to **both**
`CreateProjectItemDialog` and `CreateProjectItemSheet`. Fire it inside the existing
`create.mutate(..., { onSuccess })` with the inserted doc's `name`. Existing callers
pass nothing and are unaffected.

> Implementation note: confirm the shape `useCreateProjectItem`/`createTask` returns
> from `frappe.client.insert` (likely `{message: <doc>}` unwrapped by the api layer)
> and read `name` from it. If the name is not surfaced, the fallback is a follow-up
> `link_task` call keyed by a client-generated marker — but the direct name is expected.

### 3. Feedback → task flow (the one new piece)

Shared logic in a new hook **`useFeedbackToTask`** (`frontend/src/hooks/`), holding:
- state: `feedback` (the item being converted), `project`, `detail`;
- derived: `useProject(project).project_details`, `useProjectDetail(detail)`;
- the `link_task` mutation + `feedback-inbox` invalidation;
- an `onCreated(todoName)` handler that calls `link_task(feedback, todoName)`.

Each inbox wires its **native** UI to the hook (no cross-platform overlay abstraction):
- A **"Create task"** button on each New/Reviewed card (beside Approve/Reject).
- A small picker in the platform's existing overlay (web `Drawer`, mobile
  `BottomSheet`): two `SearchableSelect`s — Project, then Detail. `SearchableSelect`
  is already shared and is the mandated dropdown primitive.
- On both chosen: open the platform todo dialog with `projectDetail = detail`,
  `team = detail.team`, `defaultGroup = detail.default_group`, and
  `initial = { toDo: firstLine(message, 140), notes: message }`, plus
  `onCreated` from the hook.

Sequence:
```
[card] Create task
  → picker: Project ▾ → Detail ▾
  → todo dialog (prefilled toDo + notes; admin fills assignee/group/type/level/dates)
  → insert Project Todo  → onCreated(todoName)
  → link_task(feedback, todoName)  → status=Reviewed, linked_todo=todoName
  → invalidate feedback-inbox
```

### 4. Linked-todo display

`list_feedback` now returns `linked_todo`. On a card with a value, render a
"View task →" link → `navigate('/project-item/<name>')` (same route in both
frontends).

## Permissions

Inbox is already System-Manager-gated. `link_task` enforces `_require_admin()`.
Todo insert uses existing perms (admin has create). No new roles.

## Deploy

- `bench migrate` — the `linked_todo` field.
- `sudo /usr/local/bin/tj-restart` — Python (`feedback.py`).
- Web: `npm run build` in `frontend-web`.
- Mobile: build per its deploy flow.

## YAGNI trims

- No feedback-type gate.
- One link per feedback; a second todo overwrites `linked_todo`.
  `// ponytail: single link; add a child table if multi-todo per feedback is ever needed.`
- Prefill trims the title heuristically (first line / 140 chars); no smart summarisation.
- No new todo-creation backend — reuse `createTask`.

## Testing

Live site, code-first: defer automated tests to a final phase. Manual E2E after
deploy: create a task from a Bug feedback → todo appears under the chosen detail,
feedback flips to Reviewed with a working "View task" link.
