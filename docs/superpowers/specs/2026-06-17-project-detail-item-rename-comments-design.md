# Project Detail / Project Item rename + comments — Design

Date: 2026-06-17
Status: Approved (pending spec review)

## 1. Goal

Four user-requested changes:

1. Rename UI name **"Work Item" → "Project Detail"**.
2. Update the mobile app so **project items** behave as a **standalone (non
   child-table)** entity instead of being nested under their parent.
3. Show **comments** at three levels: on a Project (its comments), on a Project
   Detail (its comments), on a Project Item (its comments).
4. A **project item must link to its project detail**.

## 2. Current model (ground truth)

Doctypes (names unchanged by this work):

```
Project ──< Project Detail ──< Project Todo
 (L1)          (L2)               (L3)
```

- `Project Detail` is the doctype currently shown to users as **"Work Item"**.
- `Project Todo` is the task, shown as **"Task" / "Todo"**. It is already a
  standalone doctype (`istable: 0`) and already has a Link field
  `project_detail` (→ `Project Detail`) — currently labeled "Work Item". So
  goal 4 already holds at the data layer; the work is **surfacing** the link.
- Desk forms already have `track_changes` and the standard comment timeline
  enabled, so desk comments largely exist already (verify-only).

Mobile (React PWA at `/m`) naming is **misaligned** with the desk model:

| Route | File | Backend | Really shows |
| --- | --- | --- | --- |
| `/project/:name` | `ProjectDetailPage.tsx` | `get_project` | a **Project** |
| `/work-item/:name` | `WorkItemPage.tsx` | `get_work_item` | a **Project Detail** |
| `/todo/:name` | `TodoPage.tsx` | `get_todo` | a **Project Todo** |

`get_work_item` embeds the full task docs as a nested `todos: [...]` array
(child-table-style transport), even though the desk doctype is standalone.

## 3. Decisions

- **Terminology mapping** (UI labels + strings only — no `rename_doc`, no
  doctype renames, no DB migration):

  | Layer | Old UI name | New UI name | Doctype |
  | --- | --- | --- | --- |
  | L1 | Project | Project | `Project` |
  | L2 | Work Item | **Project Detail** | `Project Detail` |
  | L3 | Task / Todo | **Project Item** | `Project Todo` |

- **Rename depth: Full rename (option B).** In the mobile app, rename routes,
  page files, API endpoints, and API response keys — not just visible text — so
  the codebase matches the new vocabulary. Old deep links get redirects (§6).

- **Item shape: de-nest + link up (option C).** The Project Detail screen lists
  its project items as standalone link rows (not embedded full docs); each
  Project Item screen shows and links to its parent Project Detail.

- **Comments: built-in Frappe `Comment`** doctype keyed by
  `reference_doctype` + `reference_name`. No custom comment store.

## 4. Backend changes — `vernon_project/api/mobile.py`

### 4.1 Rename (keep behavior)

- `get_work_item(work_item)` → **`get_project_detail(project_detail)`**.
- `get_todo(todo)` → **`get_project_item(project_item)`** (keep `update_todo`
  parameter behavior; rename wrapper params accordingly, internal `Project
  Todo` DB names unchanged).
- Response keys: `work_item` → `project_detail`, `work_item_title` →
  `project_detail_title`, `work_items` → `project_details`, `todos` →
  `project_items` (and `todo_total`/`todo_done` → `item_total`/`item_done`).
  Update `_fetch_todos` SQL aliases (`pd.name AS project_detail`, etc.) and
  `_shape_todo` output keys.
- Keep the underlying `update_status` / `save_notes` endpoints
  (`vernon_project.api.project_todo.*`) as-is — out of mobile scope.

### 4.2 De-nest items (goal 2 + 4)

- `get_project_detail` returns detail meta + a **lightweight** `project_items`
  list: `{ name, to_do, status, status_key, deadline, deadline_human,
  is_overdue, assigned_to, assigned_to_name }` per item — enough to render a
  link row, not the full doc. (Full doc loads on the item screen via
  `get_project_item`.)
- `get_project_item` payload includes the parent link explicitly:
  `project_detail`, `project_detail_title`, plus `project`, `project_name`
  (already present) — so the item screen can render an up-link.

### 4.3 Comment endpoints (goal 3)

Two whitelisted, permission-checked endpoints reusing Frappe `Comment`:

```python
@frappe.whitelist()
def get_comments(reference_doctype, reference_name):
    _assert_visible(reference_doctype, reference_name)  # maps to a visible Project
    rows = frappe.get_all("Comment",
        filters={"comment_type": "Comment",
                 "reference_doctype": reference_doctype,
                 "reference_name": reference_name},
        fields=["name", "content", "comment_email", "comment_by", "creation"],
        order_by="creation asc", limit_page_length=0)
    # resolve commenter -> full name + image, add at_human
    return [...]

@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
    _assert_visible(reference_doctype, reference_name)
    content = (content or "").strip()
    if not content:
        frappe.throw("Comment cannot be empty.")
    doc = frappe.get_doc(reference_doctype, reference_name)   # uses Document.add_comment
    c = doc.add_comment("Comment", content)
    return {shaped comment}
```

- Allowed `reference_doctype` restricted to `{"Project", "Project Detail",
  "Project Todo"}`; anything else throws.
- `_assert_visible` resolves the doc to its Project and checks it is in
  `_visible_projects()` (mirrors existing permission pattern). For `Project`
  the name is the project; for `Project Detail` use its `project`; for `Project
  Todo` resolve `project_detail` → `project`.

### 4.4 Tests

Extend `vernon_project/api/test_mobile.py`: renamed endpoints return the new
keys; `get_project_detail` items are the lightweight shape; `get_project_item`
exposes the parent `project_detail`; `add_comment` + `get_comments` round-trip
at all three levels; permission denial for a non-visible reference.

## 5. Frontend changes — `frontend/src`

- **Routes / files (full rename):**
  - `/project/:name` `ProjectDetailPage.tsx` → `/project/:name`
    `ProjectScreen.tsx` (this page shows a *Project*; rename to remove the
    misnomer). Route path unchanged (already correct).
  - `/work-item/:name` `WorkItemPage.tsx` → `/project-detail/:name`
    `ProjectDetailScreen.tsx`.
  - `/todo/:name` `TodoPage.tsx` → `/project-item/:name`
    `ProjectItemScreen.tsx`.
- **`lib/api.ts`:** `workItem()` → `projectDetail()`, `todo()` →
  `projectItem()`, pointing at the renamed endpoints; add `getComments()` /
  `addComment()`.
- **`lib/types.ts`:** `WorkItem`/`WorkItemSummary` → `ProjectDetail`/
  `ProjectDetailSummary`; `Todo`/`TodoDetail` → `ProjectItem`/
  `ProjectItemDetail`; `work_item*` fields → `project_detail*`; add `Comment`
  type. Keep `Todo`-shaped dashboard arrays renamed to `ProjectItem`.
- **UI strings everywhere:** "Work Item" → "Project Detail", "Task"/"Todo" →
  "Project Item" (cards, headings, empty states, onboarding copy, nav drill-in
  labels).
- **De-nest + link up:**
  - Project Detail screen renders `project_items` as tappable link rows →
    `/project-item/:name`.
  - Project Item screen renders a header link "in **<Project Detail title>**" →
    `/project-detail/:name`, plus the existing project up-link.
- **Comments UI:** a reusable `CommentThread` component (list + add box,
  optimistic add with rollback toast, matching existing patterns) embedded on
  the Project, Project Detail, and Project Item screens, each passing its
  `reference_doctype` + `reference_name`.

## 6. Compatibility / migration

- **Deep links / PWA cache:** add redirect routes so cached old links resolve —
  `/work-item/:name` → `/project-detail/:name`, `/todo/:name` →
  `/project-item/:name` (React Router `<Navigate replace>`). Removed after one
  release cycle (tracked, not in this change).
- **No DB migration:** doctype names and fieldnames unchanged; only label text
  on `Project Todo.project_detail` ("Work Item" → "Project Detail").
- **Rebuild required:** `npm run build` in `frontend/`, then `bench clear-cache`
  + `bench restart` (per `MOBILE_APP.md`).

## 7. Desk changes (labels + comments)

- `Project Todo.project_detail` field **label**: "Work Item" → "Project Detail"
  (in `project_todo.json`).
- User-facing strings in `project.py`, `project_detail.py`, `glossary.py`
  (`frappe.throw` messages mentioning "work item") → "project detail".
- `project_todo.js` comments/labels referencing "Work Item" → "Project Detail".
- **Comments:** confirm the standard form comment timeline shows on Project,
  Project Detail, and Project Todo desk forms (default-on via `track_changes`).
  No code change expected unless a customization hides it; if hidden, re-enable.

## 8. Out of scope

- Renaming the `Project Todo` / `Project Detail` doctypes themselves
  (`rename_doc`) or any fieldname.
- Changing the status workflow, recurrence, reports, or notes endpoints.
- Desk UI redesign beyond label/string changes.

## 9. Testing summary

- Backend: `test_mobile.py` extensions (§4.4); run `bench run-tests --app
  vernon_project --module vernon_project.api.test_mobile`.
- Frontend: type-check + build (`npm run build`); manual smoke of the three
  screens, the up-links, and comment add/list at each level.
