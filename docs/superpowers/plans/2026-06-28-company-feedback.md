# Company Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in user send criticism & suggestions to the company; System Managers triage them in a web admin inbox.

**Architecture:** New `Company Feedback` doctype + new `vernon_project/api/feedback.py` whitelisted methods (submit/list/set-status). Submit UI on both mobile (`/m`) and web (`/w`); admin inbox on `/w` only. New feedback notifies System Managers via the existing `_notify` (in-app + web push).

**Tech Stack:** Frappe (Python), React + Vite + TypeScript, React Query, Tailwind (Soft-Pop / `paper-*` on mobile; web primitives on web), lucide-react.

## Global Constraints

- **Live site, code-first.** Site is `project.vernon.id`, no test DB. Per project convention, verify backend tasks with `bench --site project.vernon.id console` smoke checks; real pytest tests are deferred to the final task (Task 7). Do NOT add per-step pytest cycles to Tasks 1–6.
- **Deploy mechanics:** `bench --site project.vernon.id migrate` after doctype/JSON changes; `bench restart` after Python changes; `npm run build` (in `frontend/` and/or `frontend-web/`) after frontend changes.
- **Parallel-work hygiene:** the user commits/switches branches mid-session. Re-check `git status` before any git action; `git add` ONLY the files this plan creates/modifies — never `git add -A`. Never `git checkout` another branch in this live dir.
- **No native dialogs:** never `alert`/`confirm`/`prompt`. Use the existing Toast for feedback and dialog modals where needed.
- **Commit trailers:** end every commit message with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BMBFEjDsoMRdNyhH6DMYKd
  ```
- **Anonymity is a hard requirement, not optional.** Anonymous submissions must be unattributable even to admins: `submitted_by` blank AND `owner` scrubbed to `Administrator`.
- **API contract (consumed by frontend Tasks 3–6), all under `vernon_project.api.feedback`:**
  - `submit_feedback(feedback_type, message, is_anonymous)` → `{"status":"ok"}`
  - `list_feedback(status=None)` → `{"items":[{name, feedback_type, message, status, is_anonymous, submitter, at, at_human}]}`
  - `set_feedback_status(name, status)` → `{"status":"ok"}`
  - Types: `Criticism`, `Suggestion`, `Praise`, `Bug`. Statuses: `New`, `Reviewed`, `Resolved`.

---

## File Structure

- Create: `vernon_project/vernon_project/doctype/company_feedback/__init__.py`
- Create: `vernon_project/vernon_project/doctype/company_feedback/company_feedback.json`
- Create: `vernon_project/vernon_project/doctype/company_feedback/company_feedback.py`
- Modify: `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json` (add `Feedback` to `type` options)
- Create: `vernon_project/api/feedback.py`
- Modify: `frontend/src/lib/api.ts` (add 3 `mobileApi` methods)
- Modify: `frontend/src/hooks/useData.ts` (add 3 hooks + query keys)
- Create: `frontend/src/pages/FeedbackScreen.tsx` (mobile submit)
- Modify: `frontend/src/App.tsx` (route `/feedback`)
- Modify: `frontend/src/pages/Profile.tsx` (link "Send feedback")
- Create: `frontend-web/src/pages/Feedback.tsx` (web submit)
- Create: `frontend-web/src/pages/FeedbackInbox.tsx` (web admin inbox)
- Modify: `frontend-web/src/App.tsx` (routes `/feedback`, `/feedback-inbox`)
- Modify: `frontend-web/src/components/AppShell.tsx` (nav links)
- Create: `vernon_project/api/test_feedback.py` (final task)

---

## Task 1: Company Feedback doctype + notification type

**Files:**
- Create: `vernon_project/vernon_project/doctype/company_feedback/__init__.py`
- Create: `vernon_project/vernon_project/doctype/company_feedback/company_feedback.json`
- Create: `vernon_project/vernon_project/doctype/company_feedback/company_feedback.py`
- Modify: `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`

**Interfaces:**
- Produces: doctype `Company Feedback` with fields `feedback_type`, `message`, `is_anonymous`, `submitted_by`, `status`. Vernon Notification `type` Select gains `Feedback`.

- [ ] **Step 1: Create the doctype package init**

`vernon_project/vernon_project/doctype/company_feedback/__init__.py` — empty file.

- [ ] **Step 2: Create the doctype JSON**

`vernon_project/vernon_project/doctype/company_feedback/company_feedback.json`:

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "feedback_type",
  "message",
  "is_anonymous",
  "submitted_by",
  "status"
 ],
 "fields": [
  {"fieldname": "feedback_type", "fieldtype": "Select", "label": "Type", "options": "Criticism\nSuggestion\nPraise\nBug", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
  {"fieldname": "message", "fieldtype": "Long Text", "label": "Message", "reqd": 1, "in_list_view": 1},
  {"fieldname": "is_anonymous", "fieldtype": "Check", "label": "Anonymous", "default": "0", "in_list_view": 1},
  {"fieldname": "submitted_by", "fieldtype": "Link", "label": "Submitted By", "options": "User", "in_list_view": 1, "search_index": 1},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "New\nReviewed\nResolved", "default": "New", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Company Feedback",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/company_feedback/company_feedback.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class CompanyFeedback(Document):
	pass
```

- [ ] **Step 4: Add `Feedback` to Vernon Notification type options**

In `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`, the `type` field currently has:
`"options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption\nKudos"`
Change it to append `\nFeedback`:
`"options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption\nKudos\nFeedback"`

- [ ] **Step 5: Migrate**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; `Company Feedback` doctype created.

- [ ] **Step 6: Smoke-verify the doctype exists**

Run:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
print(frappe.db.exists("DocType", "Company Feedback"))
print([f.fieldname for f in frappe.get_meta("Company Feedback").fields])
PY
```
Expected: prints `Company Feedback` and the field list `['feedback_type', 'message', 'is_anonymous', 'submitted_by', 'status']`.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/company_feedback vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json
git commit -m "feat(feedback): Company Feedback doctype + notification type"
```

---

## Task 2: Backend API — submit / list / set status

**Files:**
- Create: `vernon_project/api/feedback.py`

**Interfaces:**
- Consumes: `Company Feedback` doctype (Task 1); `_notify` and `_humanize_datetime` from `vernon_project.api.mobile`.
- Produces: whitelisted methods per the Global Constraints API contract.

- [ ] **Step 1: Create `vernon_project/api/feedback.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# Company feedback: criticism & suggestions from users to the company.

import frappe

from vernon_project.api.mobile import _notify, _humanize_datetime

TYPES = {"Criticism", "Suggestion", "Praise", "Bug"}
STATUSES = {"New", "Reviewed", "Resolved"}
MAX_MESSAGE = 5000


def _require_admin():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted", frappe.PermissionError)


def _admins():
	"""Distinct, enabled System Manager users."""
	rows = frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User"},
		pluck="parent",
	)
	return sorted({r for r in rows})


@frappe.whitelist()
def submit_feedback(feedback_type, message, is_anonymous=0):
	"""Create a Company Feedback row and notify admins. Any logged-in user."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Please log in to send feedback.", frappe.AuthenticationError)

	if feedback_type not in TYPES:
		frappe.throw("Invalid feedback type.")

	message = (message or "").strip()
	if not message:
		frappe.throw("Message is required.")
	if len(message) > MAX_MESSAGE:
		frappe.throw("Message is too long.")

	anon = bool(frappe.utils.cint(is_anonymous))

	doc = frappe.get_doc({
		"doctype": "Company Feedback",
		"feedback_type": feedback_type,
		"message": message,
		"is_anonymous": 1 if anon else 0,
		"submitted_by": None if anon else user,
		"status": "New",
	}).insert(ignore_permissions=True)

	if anon:
		# Frappe stamps owner = session user on insert; scrub it so anonymous
		# feedback is unattributable even to admins.
		frappe.db.set_value(
			"Company Feedback", doc.name, "owner", "Administrator",
			update_modified=False,
		)

	frappe.db.commit()

	# Best-effort notify; _notify swallows errors and skips self/protected.
	preview = message[:140]
	actor = None if anon else user
	for admin in _admins():
		_notify(
			admin, "Feedback", f"New {feedback_type.lower()} feedback",
			preview, "Company Feedback", doc.name, actor=actor,
		)

	return {"status": "ok"}


@frappe.whitelist()
def list_feedback(status=None):
	"""Admin-only. Newest-first feedback with a display submitter."""
	_require_admin()
	filters = {}
	if status and status in STATUSES:
		filters["status"] = status

	rows = frappe.get_all(
		"Company Feedback",
		filters=filters,
		fields=[
			"name", "feedback_type", "message", "status",
			"is_anonymous", "submitted_by", "creation",
		],
		order_by="creation desc",
		limit_page_length=0,
	)

	names = {r["submitted_by"] for r in rows if r["submitted_by"]}
	name_map = {}
	if names:
		for u in frappe.get_all(
			"User", filters={"name": ["in", list(names)]},
			fields=["name", "full_name"],
		):
			name_map[u["name"]] = u["full_name"] or u["name"]

	items = [
		{
			"name": r["name"],
			"feedback_type": r["feedback_type"],
			"message": r["message"],
			"status": r["status"],
			"is_anonymous": bool(r["is_anonymous"]),
			"submitter": "Anonymous" if r["is_anonymous"]
			else (name_map.get(r["submitted_by"]) or r["submitted_by"] or "—"),
			"at": str(r["creation"]),
			"at_human": _humanize_datetime(r["creation"]),
		}
		for r in rows
	]
	return {"items": items}


@frappe.whitelist()
def set_feedback_status(name, status):
	"""Admin-only status transition."""
	_require_admin()
	if status not in STATUSES:
		frappe.throw("Invalid status.")
	if not frappe.db.exists("Company Feedback", name):
		frappe.throw("Feedback not found.")
	frappe.db.set_value("Company Feedback", name, "status", status)
	return {"status": "ok"}
```

- [ ] **Step 2: Restart to load the new module**

Run: `bench restart`
Expected: completes.

- [ ] **Step 3: Smoke-verify submit (identified + anonymous), list, status, perms**

Run:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api import feedback

# pick a non-admin or any real user for the "identified" case
frappe.set_user("Administrator")

r1 = feedback.submit_feedback("Suggestion", "  Please add dark mode  ", 0)
print("submit identified:", r1)
r2 = feedback.submit_feedback("Criticism", "Anon gripe", 1)
print("submit anon:", r2)

# identity checks
rows = frappe.get_all("Company Feedback", fields=["name","submitted_by","owner","is_anonymous","message"], order_by="creation desc", limit_page_length=2)
for row in rows: print(row)
# expect: anon row -> submitted_by None, owner 'Administrator'; identified -> submitted_by set, message trimmed

print("list:", len(feedback.list_feedback()["items"]), "items")
nm = rows[0]["name"]
print("set status:", feedback.set_feedback_status(nm, "Reviewed"))
print("status now:", frappe.db.get_value("Company Feedback", nm, "status"))

# validation
for bad in (lambda: feedback.submit_feedback("Nope","x",0),
            lambda: feedback.submit_feedback("Bug","   ",0),
            lambda: feedback.set_feedback_status(nm,"Wrong")):
    try: bad(); print("NO THROW (bug)")
    except Exception as e: print("threw ok:", type(e).__name__)

frappe.db.rollback()
PY
```
Expected: identified row has `submitted_by` set and message trimmed to `Please add dark mode`; anon row has `submitted_by` `None` and `owner` `Administrator`; list returns items; status updates to `Reviewed`; all three bad calls throw.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/feedback.py
git commit -m "feat(feedback): submit/list/set-status API with anon owner-scrub + admin notify"
```

---

## Task 3: Shared API client + React Query hooks

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Consumes: backend methods from Task 2.
- Produces: `mobileApi.submitFeedback`, `mobileApi.listFeedback`, `mobileApi.setFeedbackStatus`; hooks `useSubmitFeedback()`, `useFeedbackInbox(status?)`, `useSetFeedbackStatus()`; query key `keys.feedbackInbox`. The web app imports these via the `@/lib/api` and `@/hooks/useData` aliases.

- [ ] **Step 1: Add the three client methods to `mobileApi` in `frontend/src/lib/api.ts`**

The dotted module is `vernon_project.api.feedback` (NOT the `M` mobile prefix). Add inside the `mobileApi` object (place near the end, before the closing `}`), using the existing `api.get`/`api.post` helpers:

```ts
  submitFeedback: (feedback_type: string, message: string, is_anonymous: boolean) =>
    api.post<{ status: string }>('vernon_project.api.feedback.submit_feedback', {
      feedback_type,
      message,
      is_anonymous: is_anonymous ? 1 : 0,
    }),
  listFeedback: (status?: string) =>
    api.get<{ items: FeedbackItem[] }>('vernon_project.api.feedback.list_feedback',
      status ? { status } : {}),
  setFeedbackStatus: (name: string, status: string) =>
    api.post<{ status: string }>('vernon_project.api.feedback.set_feedback_status', {
      name,
      status,
    }),
```

Add the `FeedbackItem` type. Put it next to the other domain types (if types live in `./types`, add it there and import it; otherwise define+export it in `api.ts`):

```ts
export type FeedbackItem = {
  name: string
  feedback_type: string
  message: string
  status: string
  is_anonymous: boolean
  submitter: string
  at: string
  at_human: string
}
```

- [ ] **Step 2: Add query keys + hooks to `frontend/src/hooks/useData.ts`**

In the `keys` object (around line 48), add:
```ts
  feedbackInbox: (status?: string) => ['feedback-inbox', status ?? 'all'] as const,
```

Then add the hooks (follow the existing `useMutation`/`useQuery` + `useQueryClient` patterns already in this file):
```ts
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (v: { feedback_type: string; message: string; is_anonymous: boolean }) =>
      mobileApi.submitFeedback(v.feedback_type, v.message, v.is_anonymous),
  })
}

export function useFeedbackInbox(status?: string) {
  return useQuery({
    queryKey: keys.feedbackInbox(status),
    queryFn: () => mobileApi.listFeedback(status),
  })
}

export function useSetFeedbackStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; status: string }) =>
      mobileApi.setFeedbackStatus(v.name, v.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback-inbox'] }),
  })
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors from the new code. (Pre-existing unrelated errors, if any, are out of scope — confirm none reference `feedback`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(feedback): shared API client + React Query hooks"
```

---

## Task 4: Mobile submit screen (`/m`)

**Files:**
- Create: `frontend/src/pages/FeedbackScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Profile.tsx`

**Interfaces:**
- Consumes: `useSubmitFeedback` (Task 3); existing mobile primitives.

- [ ] **Step 1: Read neighbors to match conventions**

Read `frontend/src/pages/NoteFormScreen.tsx` (form + Toast + back nav pattern), `frontend/src/components/ui.tsx` (for `Segmented`/`FilterChips`, `Spinner`), and how Toast is invoked (search `Toast`/`toast` in `frontend/src`). Match those imports — do NOT invent component APIs.

- [ ] **Step 2: Create `frontend/src/pages/FeedbackScreen.tsx`**

Build a screen with: a back header ("Send feedback"), a type selector (`Segmented` or `FilterChips`) over `['Criticism','Suggestion','Praise','Bug']`, a `<textarea>` for the message (paper-* styling, e.g. classes used by other textareas in the app), an "Send anonymously" toggle (checkbox/switch), and a submit `Button`. On submit call `useSubmitFeedback().mutate(...)`; disable while pending; on success show the existing success Toast ("Thanks for your feedback") and reset the form (clear message, keep type). Block submit when message is empty/whitespace. Use lucide icons (e.g. `MessageSquarePlus`, `Send`). No native alert/confirm. Reference structure to mirror:

```tsx
// Skeleton — fill imports/primitives to match NoteFormScreen.tsx + ui.tsx.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSubmitFeedback } from '../hooks/useData'

const TYPES = ['Criticism', 'Suggestion', 'Praise', 'Bug'] as const

export default function FeedbackScreen() {
  const navigate = useNavigate()
  const submit = useSubmitFeedback()
  const [type, setType] = useState<string>('Suggestion')
  const [message, setMessage] = useState('')
  const [anon, setAnon] = useState(false)

  const canSend = message.trim().length > 0 && !submit.isPending

  function onSend() {
    if (!canSend) return
    submit.mutate(
      { feedback_type: type, message: message.trim(), is_anonymous: anon },
      {
        onSuccess: () => {
          /* show success Toast per app convention */
          setMessage('')
        },
        /* onError -> error Toast per app convention */
      },
    )
  }

  // ...render header, Segmented(TYPES), textarea(message), anon toggle, Button(onSend)
  return null
}
```

- [ ] **Step 3: Register the route in `frontend/src/App.tsx`**

Add an import for `FeedbackScreen` alongside the other page imports, and add (in the all-users routes area, near `/notes`):
```tsx
        <Route path="/feedback" element={<FeedbackScreen />} />
```

- [ ] **Step 4: Add a Profile link in `frontend/src/pages/Profile.tsx`**

In the rows list (near `Refresh data` / `Replay quick tour`, visible to all users — outside any `canManage*` guard), add, importing a lucide icon `MessageSquarePlus`:
```tsx
            <Row icon={MessageSquarePlus} label="Send feedback" hue="violet" onClick={() => navigate('/feedback')} />
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds; new hashed assets emitted under `vernon_project/public/frontend/assets/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FeedbackScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx vernon_project/public/frontend
git commit -m "feat(feedback): mobile submit screen + profile link"
```

---

## Task 5: Web submit page (`/w`)

**Files:**
- Create: `frontend-web/src/pages/Feedback.tsx`
- Modify: `frontend-web/src/App.tsx`
- Modify: `frontend-web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `useSubmitFeedback` from `@/hooks/useData`; web primitives (`Button`, `Field`) from `frontend-web/src/components/ui.tsx`.

- [ ] **Step 1: Read neighbors**

Read a simple web form page (e.g. `frontend-web/src/pages/GiftPoints.tsx` or `NoteForm.tsx`) and `frontend-web/src/components/ui.tsx` for `Button`/`Field`, plus how the web app shows Toast/success. Match those APIs.

- [ ] **Step 2: Create `frontend-web/src/pages/Feedback.tsx`**

A page (rendered inside `AppShell`) with heading "Send feedback", a type selector over `['Criticism','Suggestion','Praise','Bug']`, a message textarea (`Field`/web styling), an "Send anonymously" checkbox, and a submit `Button`. Use `useSubmitFeedback` from `@/hooks/useData`. Disable while pending; success Toast + clear message; block empty message. No native dialogs. Same logic as the mobile skeleton in Task 4 Step 2, web primitives instead.

- [ ] **Step 3: Register the route in `frontend-web/src/App.tsx`**

Import `Feedback` and add in the all-users routes (inside the `<Route element={<AppShell />}>` block, near `/notes`):
```tsx
          <Route path="/feedback" element={<Feedback />} />
```

- [ ] **Step 4: Add an AppShell nav link**

Read `frontend-web/src/components/AppShell.tsx` nav array (around line 148). Add an all-users entry (no guard) for "Send feedback" → `/feedback`, with a lucide icon (e.g. `MessageSquarePlus`), matching the existing `NavItem` shape.

- [ ] **Step 5: Build**

Run: `cd frontend-web && npm run build`
Expected: build succeeds; new assets under `vernon_project/public/frontend_web/assets/`.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/Feedback.tsx frontend-web/src/App.tsx frontend-web/src/components/AppShell.tsx vernon_project/public/frontend_web
git commit -m "feat(feedback): web submit page + nav link"
```

---

## Task 6: Web admin inbox (`/w`)

**Files:**
- Create: `frontend-web/src/pages/FeedbackInbox.tsx`
- Modify: `frontend-web/src/App.tsx`
- Modify: `frontend-web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `useFeedbackInbox`, `useSetFeedbackStatus`, `canManageUsers`, `useBoot` from `@/hooks/useData`; web primitives.

- [ ] **Step 1: Read neighbors**

Read `frontend-web/src/pages/Users.tsx` for the admin-gate pattern (`const blocked = !!boot && !canManageUsers(boot)` + redirect to `/`) and list rendering, and `frontend-web/src/components/ui.tsx` for chips/pills + `Button`/`OverflowMenu`.

- [ ] **Step 2: Create `frontend-web/src/pages/FeedbackInbox.tsx`**

Page gated by `canManageUsers(boot)` (redirect to `/` if not). A status filter (`All / New / Reviewed / Resolved`) driving `useFeedbackInbox(status)`. Render each item as a card: type chip, status chip, `submitter`, `at_human`, and the `message`. A per-card status control (select or `OverflowMenu`) calling `useSetFeedbackStatus().mutate({ name, status })` (the hook invalidates the inbox query). Loading + empty states. Skeleton:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoot, canManageUsers, useFeedbackInbox, useSetFeedbackStatus } from '@/hooks/useData'

const STATUSES = ['New', 'Reviewed', 'Resolved'] as const
const FILTERS = ['All', ...STATUSES] as const

export default function FeedbackInbox() {
  const navigate = useNavigate()
  const boot = useBoot()
  const [filter, setFilter] = useState<string>('All')
  const list = useFeedbackInbox(filter === 'All' ? undefined : filter)
  const setStatus = useSetFeedbackStatus()

  if (boot.data && !canManageUsers(boot.data)) { navigate('/', { replace: true }); return null }
  // ...filter chips, loading/empty, item cards with per-card status control
  return null
}
```
(Match `useBoot`'s actual return shape used elsewhere — in web pages boot is consumed as `boot.data`; confirm against `Users.tsx`.)

- [ ] **Step 3: Register the gated route in `frontend-web/src/App.tsx`**

Import `FeedbackInbox` and add inside the `canManageUsers(b)` admin block (next to `/users`):
```tsx
            <Route path="/feedback-inbox" element={<FeedbackInbox />} />
```

- [ ] **Step 4: Add a gated AppShell nav entry**

In `frontend-web/src/components/AppShell.tsx`, alongside the existing `canManageUsers(b) ? [{ to: '/users', ... }]` entry, add a `canManageUsers(b)`-gated entry for "Feedback" → `/feedback-inbox` (lucide `Inbox` or `MessageSquare`).

- [ ] **Step 5: Build**

Run: `cd frontend-web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/FeedbackInbox.tsx frontend-web/src/App.tsx frontend-web/src/components/AppShell.tsx vernon_project/public/frontend_web
git commit -m "feat(feedback): web admin inbox with status triage"
```

---

## Task 7: Tests (final phase)

**Files:**
- Create: `vernon_project/api/test_feedback.py`

**Interfaces:**
- Consumes: `vernon_project.api.feedback` methods.

- [ ] **Step 1: Write `vernon_project/api/test_feedback.py`**

Mirror the existing test style in `vernon_project/api/test_mobile.py` (FrappeTestCase, `frappe.set_user`, cleanup). Cover:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api import feedback


class TestCompanyFeedback(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_identified_records_user(self):
		frappe.set_user("Administrator")
		feedback.submit_feedback("Suggestion", "  hi there  ", 0)
		row = frappe.get_all("Company Feedback", fields=["submitted_by", "owner", "message"],
		                     order_by="creation desc", limit_page_length=1)[0]
		self.assertEqual(row.submitted_by, "Administrator")
		self.assertEqual(row.owner, "Administrator")
		self.assertEqual(row.message, "hi there")  # trimmed

	def test_anonymous_scrubs_identity(self):
		frappe.set_user("Administrator")
		feedback.submit_feedback("Criticism", "anon", 1)
		row = frappe.get_all("Company Feedback", fields=["submitted_by", "owner", "is_anonymous"],
		                     order_by="creation desc", limit_page_length=1)[0]
		self.assertFalse(row.submitted_by)
		self.assertEqual(row.owner, "Administrator")
		self.assertTrue(row.is_anonymous)

	def test_validation(self):
		frappe.set_user("Administrator")
		for args in (("Nope", "x", 0), ("Bug", "   ", 0), ("Bug", "x" * 5001, 0)):
			with self.assertRaises(frappe.ValidationError):
				feedback.submit_feedback(*args)

	def test_set_status_validates(self):
		frappe.set_user("Administrator")
		feedback.submit_feedback("Bug", "x", 0)
		name = frappe.get_all("Company Feedback", order_by="creation desc", limit_page_length=1)[0].name
		with self.assertRaises(frappe.ValidationError):
			feedback.set_feedback_status(name, "Wrong")
		feedback.set_feedback_status(name, "Reviewed")
		self.assertEqual(frappe.db.get_value("Company Feedback", name, "status"), "Reviewed")

	def test_non_admin_blocked(self):
		# create a throwaway non-admin user or use an existing Website User without System Manager
		user = "test-feedback-nonadmin@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc({"doctype": "User", "email": user, "first_name": "NoAdmin",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.set_user(user)
		with self.assertRaises(frappe.PermissionError):
			feedback.list_feedback()
		with self.assertRaises(frappe.PermissionError):
			feedback.set_feedback_status("whatever", "New")
```

- [ ] **Step 2: Run the tests**

Run: `bench --site project.vernon.id run-tests --module vernon_project.api.test_feedback`
Expected: all pass. (If the live site forbids test runs, run against a scratch site or note the limitation — do not weaken assertions to make them pass.)

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/test_feedback.py
git commit -m "test(feedback): submit/anon/validation/perms"
```

---

## Self-Review

- **Spec coverage:** doctype (§1)→T1; anonymity owner-scrub (§1)→T1+T2; API submit/list/set-status (§2)→T2; notification type edit (§2)→T1; submit client+hooks (§3)→T3; mobile submit (§3)→T4; web submit (§3)→T5; admin inbox (§4)→T6; notifications (§5)→T2; error handling (§6)→T2; tests (§7)→T7. All covered.
- **Placeholders:** frontend page bodies are skeletons by necessity (must match live primitives the implementer reads in Step 1 of each task); every task names the exact neighbor file to mirror and the exact hook/API signatures, so no invented APIs. Backend + doctype + hooks are fully concrete.
- **Type consistency:** `FeedbackItem` shape (T3) matches `list_feedback` return (T2). Hook names (`useSubmitFeedback`/`useFeedbackInbox`/`useSetFeedbackStatus`) consistent across T3–T6. Method paths consistent with API contract.

## Execution order & parallelism

Sequential where dependent: **T1 → T2 → T3**. After T3, **T4, T5, T6 are independent** and can run in parallel (different files; only shared touch is `vernon_project/public/...` build artifacts — commit each task's build separately to avoid clobber, or build sequentially). **T7** depends only on T2 and can run anytime after it.
