# Project Detail / Project Item rename + comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Work Item"→"Project Detail" and "Task/Todo"→"Project Item" across desk + mobile, make project items standalone (de-nested, linking up to their Project Detail), and show built-in Frappe comments on Project / Project Detail / Project Item.

**Architecture:** No doctype/field renames and no DB migration — only UI labels, mobile API endpoint/key names, and React route/file/symbol names change. Mobile `get_project_detail` returns a lightweight item list; each item screen up-links to its parent. Comments reuse the Frappe `Comment` doctype via two permission-gated whitelisted endpoints.

**Tech Stack:** Frappe (Python), React + Vite + TypeScript + Tailwind PWA, React Query, React Router.

## Global Constraints

- Doctype names stay: `Project`, `Project Detail`, `Project Todo`. NO `rename_doc`, NO fieldname changes.
- `Project Todo.project_detail` (Link → `Project Detail`) is the L3→L2 link; it already exists. Only its **label** changes ("Work Item" → "Project Detail").
- Status strings are exact (emoji + U+FE0F): `⚪️ Planned`, `🟠 Done`, `🔷 Checked By PL`, `✅ Completed` — never retype; reuse the constants in `mobile.py`.
- Comments use Frappe `Comment` (`comment_type="Comment"`), keyed by `reference_doctype` + `reference_name`. Allowed reference doctypes: `Project`, `Project Detail`, `Project Todo` only.
- Permission model: every mobile endpoint resolves its target to a `Project` and checks membership via the existing `_visible_projects()` helper.
- Python tests: `bench --site <site> run-tests --app vernon_project --module vernon_project.api.test_mobile`. Frontend verify: `cd frontend && npm run build` (tsc + vite). Use the site from `frappe-bench/sites/currentsite.txt` for `<site>`.
- Commit after every task.

---

### Task 1: Desk labels — "Work Item" → "Project Detail"

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (field `project_detail` label)
- Modify: `vernon_project/vernon_project/doctype/project/project.py` (throw message)
- Modify: `vernon_project/vernon_project/doctype/project_detail/project_detail.py` (comments/throw)
- Modify: `vernon_project/vernon_project/doctype/glossary/glossary.py` (throw message)
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.js` (comments/labels)

**Interfaces:**
- Consumes: nothing.
- Produces: no code symbols; desk now displays "Project Detail" where it said "Work Item".

- [ ] **Step 1: Change the field label.** In `project_todo.json`, find the field whose `"fieldname": "project_detail"` and change `"label": "Work Item"` to `"label": "Project Detail"`. Leave `options`, `fieldtype` untouched.

- [ ] **Step 2: Update user-facing strings.** Replace user-facing occurrences of "work item" / "Work Item" with "project detail" / "Project Detail" in the four files below (match the original capitalization style of each message):
  - `project.py:80` `frappe.throw("Cannot delete a project that has work items.")` → `"Cannot delete a project that has project details."`
  - `project_detail.py:47-49` comment `# Cannot delete a work item that still has tasks.` and `frappe.throw("Cannot delete a work item that has tasks.")` → "project detail".
  - `glossary.py:13` `frappe.throw("Cannot delete a group that is in use by a work item.")` → `"... in use by a project detail."`
  - `project_todo.js` comments referencing "Work Item" (lines ~6, 14, 27, 37–38) → "Project Detail". These are JS comments only; keep behavior identical.

- [ ] **Step 3: Verify no stray desk "work item" strings remain.**

Run: `grep -rin "work item" vernon_project/vernon_project/doctype --include=*.py --include=*.js --include=*.json | grep -v __pycache__`
Expected: no output.

- [ ] **Step 4: Run the existing desk tests to confirm nothing broke.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
Expected: PASS (label/string changes don't affect logic).

- [ ] **Step 5: Commit.**

```bash
git add vernon_project/vernon_project/doctype
git commit -m "feat: rename desk label Work Item -> Project Detail"
```

---

### Task 2: Mobile API — rename endpoints & response keys

**Files:**
- Modify: `vernon_project/api/mobile.py`
- Modify: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Consumes: existing `_fetch_todos`, `_shape_todo`, `_visible_projects`.
- Produces (new public surface used by Tasks 3, 5):
  - `get_project_detail(project_detail)` — replaces `get_work_item(work_item)`.
  - `get_project_item(project_item)` — replaces `get_todo(todo)`.
  - Response keys renamed: `work_item`→`project_detail`, `work_item_title`→`project_detail_title`, `work_items`→`project_details`, `todos`→`project_items`, `todo_total`/`todo_done`→`item_total`/`item_done`.
  - `update_todo`'s first param renamed `todo`→`project_item`.

- [ ] **Step 1: Update the existing tests to the new names (these now fail).** In `test_mobile.py`:
  - line 7 `from vernon_project.api.mobile import get_work_item` → `import get_project_detail`.
  - all `get_work_item(` calls → `get_project_detail(`.
  - line 256 `rows[0]["work_item"]` → `rows[0]["project_detail"]`.
  - Add to `TestMobileGetProjectTeam.test_member_workload_open_only_by_default` after line 256: `self.assertEqual(rows[0]["project_detail_title"], "Roster Detail")`.

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: FAIL — `ImportError: cannot import name 'get_project_detail'`.

- [ ] **Step 3: Rename SQL aliases in `_fetch_todos`.** In the SELECT, change the `pd.name AS work_item, pd.title AS work_item_title` line to:

```sql
				pd.name AS project_detail, pd.title AS project_detail_title, pd.project,
```

- [ ] **Step 4: Rename keys in `_shape_todo`.** Replace the two output lines

```python
		"work_item": row["work_item"],
		"work_item_title": row["work_item_title"],
```

with

```python
		"project_detail": row["project_detail"],
		"project_detail_title": row["project_detail_title"],
```

- [ ] **Step 5: Rename `get_work_item` → `get_project_detail`.** Rename the function and its param `work_item`→`project_detail`; inside, every `work_item` reference becomes `project_detail`, and the embedded list key `detail["todos"]` becomes `detail["project_items"]`. (Task 3 rewrites the list shape; for now keep the full `_shape_todo` mapping.) The row filter becomes `r["project_detail"] == project_detail`.

- [ ] **Step 6: Rename `get_todo` → `get_project_item`.** Rename the function and its param `todo`→`project_item`; update internal `frappe.get_value("Project Todo", project_item, ...)` and the `r["name"] == project_item` filter. Keep `update_status`/`save_notes` dotted paths unchanged.

- [ ] **Step 7: Rename keys in `get_member_workload` and `get_project`.** In `get_member_workload`'s returned dict, `"work_item"`/`"work_item_title"` → `"project_detail"`/`"project_detail_title"`. In `get_project`, rename the rollup key `"work_items"` (in the final return) to `"project_details"` and the per-item dict's `total/done` aggregation stays; rename the seeded var comment only. In `get_projects`, rename `p["todo_total"]`/`p["todo_done"]` to `p["item_total"]`/`p["item_done"]`.

- [ ] **Step 8: Rename `update_todo` param.** Change signature `def update_todo(todo, ...)` → `def update_todo(project_item, ...)` and the internal `frappe.get_value("Project Todo", todo, ...)`/`frappe.get_doc("Project Todo", todo)` → `project_item`. Keep the dotted method name `update_todo` (frontend Task 5 maps to it).

- [ ] **Step 9: Run tests to verify they pass.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: rename mobile API to Project Detail / Project Item"
```

---

### Task 3: Mobile API — de-nest items + parent up-link

**Files:**
- Modify: `vernon_project/api/mobile.py`
- Modify: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Consumes: `get_project_detail`, `get_project_item` from Task 2.
- Produces:
  - `get_project_detail(...)["project_items"]` is a **lightweight** list — each element: `{ name, to_do, status, status_key, deadline, deadline_human, is_overdue, assigned_to, assigned_to_name }`.
  - `get_project_item(...)` payload includes `project_detail` + `project_detail_title` (already added in Task 2 via `_shape_todo`) — assert it explicitly.

- [ ] **Step 1: Write failing tests.** Add to `test_mobile.py` a new class (reuse the `TestMobileGetProjectTeam` fixture style — it already creates a project, detail, and one todo). Append these methods to `TestMobileGetProjectTeam`:

```python
	def test_project_detail_items_are_lightweight(self):
		from vernon_project.api.mobile import get_project_detail
		r = get_project_detail(self.detail.name)
		self.assertIn("project_items", r)
		self.assertEqual(len(r["project_items"]), 1)
		item = r["project_items"][0]
		# lightweight shape: link-row fields present, heavy fields absent
		self.assertEqual(item["to_do"], "Open task")
		self.assertIn("status_key", item)
		self.assertIn("assigned_to_name", item)
		self.assertNotIn("notes", item)
		self.assertNotIn("timeline", item)

	def test_project_item_links_to_its_detail(self):
		from vernon_project.api.mobile import get_project_item
		r = get_project_item(self.todo.name)
		self.assertEqual(r["project_detail"], self.detail.name)
		self.assertEqual(r["project_detail_title"], "Roster Detail")
		self.assertEqual(r["project"], self.project.name)
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: FAIL — `get_project_detail` items still carry the full `_shape_todo` shape (so `assertNotIn("notes")` may pass but the lightweight contract isn't enforced) / `get_project_item` assertions pass only if Task 2 landed. The de-nest test fails on the explicit lightweight contract once Step 3 trims the list.

- [ ] **Step 3: Add a lightweight shaper and use it in `get_project_detail`.** Add this helper next to `_shape_todo` in `mobile.py`:

```python
def _shape_item_row(row, user, name_map):
	"""Lightweight project-item shape for link rows on the Project Detail screen.
	Full detail loads via get_project_item."""
	skey = _status_key(row["status"])
	assignee = name_map.get(row["assigned_to"], {})
	return {
		"name": row["name"],
		"to_do": row["to_do"],
		"status": row["status"],
		"status_key": skey,
		"deadline": str(row["deadline"]) if row["deadline"] else None,
		"deadline_human": _humanize_date(row["deadline"]),
		"is_overdue": bool(
			row["deadline"] and skey != "completed"
			and getdate(row["deadline"]) < getdate(nowdate())
		),
		"assigned_to": row["assigned_to"],
		"assigned_to_name": assignee.get("full_name") or row["assigned_to"],
	}
```

  Then in `get_project_detail`, replace the line that builds `detail["project_items"]` (the full `[_shape_todo(r, user, name_map) for r in rows]`) with:

```python
	detail["project_items"] = [_shape_item_row(r, user, name_map) for r in rows]
```

- [ ] **Step 4: Confirm the parent link in `get_project_item`.** Verify `_shape_todo` already emits `project_detail` + `project_detail_title` (added in Task 2 Step 4). No new code needed — the Step 1 test asserts it.

- [ ] **Step 5: Run tests to verify they pass.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: de-nest project items + expose parent detail link"
```

---

### Task 4: Mobile API — comment endpoints

**Files:**
- Modify: `vernon_project/api/mobile.py`
- Modify: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Produces:
  - `get_comments(reference_doctype, reference_name) -> list[dict]` — each: `{ name, content, by, by_name, by_image, at, at_human }`, oldest-first.
  - `add_comment(reference_doctype, reference_name, content) -> dict` — the shaped comment just added.
  - `_assert_comment_visible(reference_doctype, reference_name)` — internal guard.

- [ ] **Step 1: Write failing tests.** Append to `TestMobileGetProjectTeam` in `test_mobile.py`:

```python
	def test_comment_roundtrip_all_levels(self):
		from vernon_project.api.mobile import add_comment, get_comments
		cases = [
			("Project", self.project.name),
			("Project Detail", self.detail.name),
			("Project Todo", self.todo.name),
		]
		for dt, dn in cases:
			added = add_comment(dt, dn, f"hello {dt}")
			self.assertEqual(added["content"], f"hello {dt}")
			rows = get_comments(dt, dn)
			self.assertTrue(any(c["content"] == f"hello {dt}" for c in rows))
			self.assertIn("by_name", rows[0])
			self.assertIn("at_human", rows[0])

	def test_comment_rejects_unknown_doctype(self):
		from vernon_project.api.mobile import add_comment
		with self.assertRaises(frappe.ValidationError):
			add_comment("User", "Administrator", "nope")

	def test_comment_rejects_invisible_project(self):
		from vernon_project.api.mobile import get_comments
		frappe.set_user("tm_assignee@example.com")  # not on this project
		try:
			with self.assertRaises(frappe.PermissionError):
				get_comments("Project", self.project.name)
		finally:
			frappe.set_user("Administrator")
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: FAIL — `cannot import name 'add_comment'`.

- [ ] **Step 3: Implement the guard + endpoints.** Add to `mobile.py` (after `get_member_workload` or near the other endpoints):

```python
COMMENTABLE = {"Project", "Project Detail", "Project Todo"}


def _comment_project(reference_doctype, reference_name):
	"""Resolve a commentable reference to its owning Project name."""
	if reference_doctype == "Project":
		return reference_name
	if reference_doctype == "Project Detail":
		return frappe.get_value("Project Detail", reference_name, "project")
	if reference_doctype == "Project Todo":
		pd = frappe.get_value("Project Todo", reference_name, "project_detail")
		return frappe.get_value("Project Detail", pd, "project") if pd else None
	return None


def _assert_comment_visible(reference_doctype, reference_name):
	if reference_doctype not in COMMENTABLE:
		frappe.throw("Comments are not available for this record.")
	project = _comment_project(reference_doctype, reference_name)
	if not project or project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)


def _shape_comment(row, name_map):
	by = row.get("comment_by") or row.get("comment_email")
	person = name_map.get(by, {})
	return {
		"name": row["name"],
		"content": row.get("content") or "",
		"by": by,
		"by_name": person.get("full_name") or by,
		"by_image": person.get("user_image"),
		"at": str(row["creation"]),
		"at_human": _humanize_datetime(row["creation"]),
	}


@frappe.whitelist()
def get_comments(reference_doctype, reference_name):
	"""Built-in Frappe comments for a Project / Project Detail / Project Item."""
	_assert_comment_visible(reference_doctype, reference_name)
	rows = frappe.get_all(
		"Comment",
		filters={
			"comment_type": "Comment",
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
		},
		fields=["name", "content", "comment_email", "comment_by", "creation"],
		order_by="creation asc",
		limit_page_length=0,
	)
	name_map = _user_name_map({r.get("comment_email") for r in rows} | {r.get("comment_by") for r in rows})
	return [_shape_comment(r, name_map) for r in rows]


@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
	"""Add a built-in comment to a Project / Project Detail / Project Item."""
	_assert_comment_visible(reference_doctype, reference_name)
	content = (content or "").strip()
	if not content:
		frappe.throw("Comment cannot be empty.")
	doc = frappe.get_doc(reference_doctype, reference_name)
	c = doc.add_comment("Comment", content)
	name_map = _user_name_map({c.comment_email, c.comment_by})
	return _shape_comment(
		{
			"name": c.name,
			"content": c.content,
			"comment_email": c.comment_email,
			"comment_by": c.comment_by,
			"creation": c.creation,
		},
		name_map,
	)
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: mobile comment endpoints for project/detail/item"
```

---

### Task 5: Frontend lib — api.ts + types.ts rename + comment surface

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Consumes: renamed backend endpoints (Tasks 2–4).
- Produces (used by Tasks 6–7):
  - `mobileApi.projectDetail(name)`, `mobileApi.projectItem(name)`, `mobileApi.getComments(refDoctype, refName)`, `mobileApi.addComment(refDoctype, refName, content)`.
  - Types `ProjectFull` (was `ProjectDetail`), `ProjectDetail` (was `WorkItem`), `ProjectDetailSummary` (was `WorkItemSummary`), `ProjectItem` (was `Todo`), `ProjectItemDetail` (was `TodoDetail`), `ProjectItemEdit` (was `TodoEdit`), `ProjectDetailInput` (was `WorkItemInput`), `Comment`. Field `work_item*`→`project_detail*`.

- [ ] **Step 1: Rename types in `types.ts`.** Apply exactly:
  - `interface ProjectDetail` (the one with `work_items`, `team` — the get_project payload, ~line 146) → `interface ProjectFull`; inside it `work_items: WorkItemSummary[]` → `project_details: ProjectDetailSummary[]`.
  - `interface WorkItem` (~line 165) → `interface ProjectDetail`; inside it `todos: Todo[]` → `project_items: ProjectItem[]`.
  - `interface WorkItemSummary` → `interface ProjectDetailSummary`.
  - `interface Todo` → `interface ProjectItem`; fields `work_item`→`project_detail`, `work_item_title`→`project_detail_title`.
  - `interface TodoDetail extends Todo` → `interface ProjectItemDetail extends ProjectItem`.
  - `interface TodoEdit` → `interface ProjectItemEdit`.
  - `interface WorkItemInput` → `interface ProjectDetailInput`.
  - `MemberTodo`: `work_item`→`project_detail`, `work_item_title`→`project_detail_title`.
  - `Dashboard` arrays `Todo[]` → `ProjectItem[]`.
  - `ProjectCard`: `todo_total`→`item_total`, `todo_done`→`item_done`.
  - Append a comment type:

```ts
export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  at: string
  at_human: string
}
```

- [ ] **Step 2: Rename the API methods in `api.ts`.** In the `mobileApi` object replace lines 84 and 91 and add comment methods:

```ts
  projectDetail: (name: string) =>
    api.get(M + 'get_project_detail', { project_detail: name }),
  memberWorkload: (project: string, user: string, includeCompleted: boolean) =>
    api.get(M + 'get_member_workload', {
      project,
      user,
      include_completed: includeCompleted ? 1 : 0,
    }),
  projectItem: (name: string) => api.get(M + 'get_project_item', { project_item: name }),
```

  Keep `advanceStatus`, `saveNotes` unchanged. Change `updateTodo` body key `todo: todoId` → `project_item: todoId` (the dotted method `update_todo` is unchanged). Add after `formOptions`:

```ts
  getComments: (refDoctype: string, refName: string) =>
    api.get(M + 'get_comments', {
      reference_doctype: refDoctype,
      reference_name: refName,
    }),
  addComment: (refDoctype: string, refName: string, content: string) =>
    api.post(M + 'add_comment', {
      reference_doctype: refDoctype,
      reference_name: refName,
      content,
    }),
```

- [ ] **Step 3: Build to surface every consumer that still uses old names.**

Run: `cd frontend && npm run build`
Expected: FAIL — tsc errors in hooks/pages referencing `Todo`, `WorkItem`, `work_item`, `mobileApi.workItem`, `mobileApi.todo`, `todo_total`, etc. (Those are fixed in Task 6. This build failure is the worklist for Task 6.)

- [ ] **Step 4: Commit (lib only).**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts
git commit -m "feat(mobile): rename lib types/api to Project Detail/Item + comments"
```

---

### Task 6: Frontend pages — rename, routes, redirects, UI strings

**Files:**
- Rename: `frontend/src/pages/ProjectDetailPage.tsx` → `ProjectScreen.tsx` (shows a Project)
- Rename: `frontend/src/pages/WorkItemPage.tsx` → `ProjectDetailScreen.tsx`
- Rename: `frontend/src/pages/TodoPage.tsx` → `ProjectItemScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/hooks/useData.ts` and any component/page importing renamed symbols (the Task 5 build output lists them; commonly `Today.tsx`, `Review.tsx`, `Projects.tsx`, `components/TodoCard.tsx`).

**Interfaces:**
- Consumes: Task 5 lib (`mobileApi.projectDetail`, `mobileApi.projectItem`, renamed types).
- Produces: routes `/project-detail/:name`, `/project-item/:name`; legacy redirects from `/work-item/:name`, `/todo/:name`.

- [ ] **Step 1: Rename the three page files** (use `git mv` to preserve history):

```bash
cd frontend/src/pages
git mv ProjectDetailPage.tsx ProjectScreen.tsx
git mv WorkItemPage.tsx ProjectDetailScreen.tsx
git mv TodoPage.tsx ProjectItemScreen.tsx
```

  Inside each, rename the default-export component: `ProjectDetailPage`→`ProjectScreen`, `WorkItemPage`→`ProjectDetailScreen`, `TodoPage`→`ProjectItemScreen`.

- [ ] **Step 2: Rewire routes + redirects in `App.tsx`.** Update imports (lines 13–15) to the new file/symbol names and replace the route block:

```tsx
        <Route path="/project/:name" element={<ProjectScreen />} />
        <Route path="/project-detail/:name" element={<ProjectDetailScreen />} />
        <Route path="/project-item/:name" element={<ProjectItemScreen />} />
        {/* Legacy deep-link redirects (cached PWA links). Remove next release. */}
        <Route path="/work-item/:name" element={<LegacyRedirect to="project-detail" />} />
        <Route path="/todo/:name" element={<LegacyRedirect to="project-item" />} />
```

  Add this helper component in `App.tsx` (above `export default function App`):

```tsx
function LegacyRedirect({ to }: { to: string }) {
  const { name } = useParams()
  return <Navigate to={`/${to}/${name}`} replace />
}
```

  Add `useParams` to the `react-router-dom` import on line 2.

- [ ] **Step 3: Update hooks + the navigation targets and UI strings.** Using the Task 5 build error list, in `hooks/useData.ts` and every flagged page/component:
  - `mobileApi.workItem(` → `mobileApi.projectDetail(`; `mobileApi.todo(` → `mobileApi.projectItem(`.
  - Type references: `Todo`→`ProjectItem`, `TodoDetail`→`ProjectItemDetail`, `TodoEdit`→`ProjectItemEdit`, `WorkItem`→`ProjectDetail`, `WorkItemSummary`→`ProjectDetailSummary`, and the get_project payload type `ProjectDetail`→`ProjectFull`.
  - Field access: `.work_item`→`.project_detail`, `.work_item_title`→`.project_detail_title`, `.todos`→`.project_items`, `.work_items`→`.project_details`, `.todo_total`→`.item_total`, `.todo_done`→`.item_done`.
  - `Link`/`navigate` targets: `/work-item/${...}`→`/project-detail/${...}`, `/todo/${...}`→`/project-item/${...}`.
  - Visible copy: "Work Item"→"Project Detail", "Task"/"Tasks"/"Todo"→"Project Item"/"Project Items" (headings, empty states, buttons like "Add Task"→"Add Project Item", onboarding slides). Keep status labels (Mark Done, etc.) unchanged.

- [ ] **Step 4: Build until clean.**

Run: `cd frontend && npm run build`
Expected: PASS (no tsc errors). If errors remain, they name the exact file/symbol — fix and re-run.

- [ ] **Step 5: Grep for stray old vocabulary in the frontend.**

Run: `grep -rin "work.item\|workItem\|/todo/\|\.todos\b" frontend/src --include=*.ts --include=*.tsx`
Expected: no output (legacy `/todo/` only as the redirect route string in App.tsx is acceptable — verify it's only that line).

- [ ] **Step 6: Commit.**

```bash
git add -A frontend/src
git commit -m "feat(mobile): rename screens/routes to Project Detail/Item + redirects"
```

---

### Task 7: Frontend — de-nest item list, parent up-link, comment threads

**Files:**
- Create: `frontend/src/components/CommentThread.tsx`
- Modify: `frontend/src/hooks/useData.ts` (comment query + mutation hooks)
- Modify: `frontend/src/pages/ProjectDetailScreen.tsx` (item link rows + comments)
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (parent up-link + comments)
- Modify: `frontend/src/pages/ProjectScreen.tsx` (comments)

**Interfaces:**
- Consumes: `mobileApi.getComments`, `mobileApi.addComment`, `Comment` type, `ProjectDetail.project_items`, `ProjectItemDetail.project_detail`.
- Produces: `<CommentThread referenceDoctype referenceName />`.

- [ ] **Step 1: Add comment hooks in `useData.ts`.** Follow the existing React Query patterns already in this file (same `useQuery`/`useMutation` + `queryClient.invalidateQueries` style used for todos):

```tsx
import type { Comment } from '../lib/types'

export function useComments(refDoctype: string, refName: string) {
  return useQuery({
    queryKey: ['comments', refDoctype, refName],
    queryFn: () => mobileApi.getComments(refDoctype, refName) as Promise<Comment[]>,
    enabled: !!refName,
  })
}

export function useAddComment(refDoctype: string, refName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => mobileApi.addComment(refDoctype, refName, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', refDoctype, refName] }),
  })
}
```

  (Match the actual import names already used in `useData.ts` — e.g. if it imports `useQueryClient` from `@tanstack/react-query`, reuse that import.)

- [ ] **Step 2: Create `CommentThread.tsx`.** A self-contained list + add box reusing the app's existing ui primitives (`Spinner` from `components/ui`) and Tailwind classes consistent with other cards:

```tsx
import { useState } from 'react'
import { Send } from 'lucide-react'
import { useComments, useAddComment } from '../hooks/useData'
import { Spinner } from './ui'

export default function CommentThread({
  referenceDoctype,
  referenceName,
}: {
  referenceDoctype: string
  referenceName: string
}) {
  const { data: comments, isLoading } = useComments(referenceDoctype, referenceName)
  const addComment = useAddComment(referenceDoctype, referenceName)
  const [text, setText] = useState('')

  const submit = () => {
    const body = text.trim()
    if (!body) return
    addComment.mutate(body, { onSuccess: () => setText('') })
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Comments</h3>
      {isLoading ? (
        <Spinner className="h-5 w-5 text-gray-400" />
      ) : (
        <ul className="space-y-3">
          {(comments ?? []).map((c) => (
            <li key={c.name} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{c.by_name}</span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{c.content}</p>
            </li>
          ))}
          {comments && comments.length === 0 && (
            <li className="text-sm text-gray-400">No comments yet.</li>
          )}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="flex-1 resize-none rounded-xl border border-gray-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={addComment.isPending || !text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Wire the Project Detail screen.** In `ProjectDetailScreen.tsx`, ensure the items render from `data.project_items` as tappable rows linking to `/project-item/${item.name}` (de-nested standalone navigation — not an inline expandable child). At the bottom of the screen content add:

```tsx
<CommentThread referenceDoctype="Project Detail" referenceName={name!} />
```

  (`name` is the route param already read on this screen.)

- [ ] **Step 4: Wire the Project Item screen up-link + comments.** In `ProjectItemScreen.tsx`, add a header link to the parent detail using the payload's `project_detail`/`project_detail_title`:

```tsx
<Link to={`/project-detail/${data.project_detail}`} className="text-sm text-brand-600">
  in {data.project_detail_title}
</Link>
```

  and at the bottom: `<CommentThread referenceDoctype="Project Todo" referenceName={name!} />`.

- [ ] **Step 5: Wire the Project screen comments.** In `ProjectScreen.tsx` add at the bottom: `<CommentThread referenceDoctype="Project" referenceName={name!} />`. Import `CommentThread` in all three screens.

- [ ] **Step 6: Build.**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add -A frontend/src
git commit -m "feat(mobile): standalone item links + parent up-link + comment threads"
```

---

### Task 8: Verify desk comments + final integration check

**Files:** none (verification only; create a migration note if a fix is needed).

- [ ] **Step 1: Confirm desk forms show the comment timeline.** The three doctypes have `track_changes` on and Frappe shows the standard comment box by default. Confirm none disables it.

Run: `grep -rin "allow_comments\|hide_comments\|timeline" vernon_project/vernon_project/doctype/project*/ --include=*.json`
Expected: no `"allow_comments": 0` / `"hide_comments": 1`. If found, set them to allow comments and note it; otherwise no change.

- [ ] **Step 2: Full backend test run.**

Run: `bench --site $(cat ../../sites/currentsite.txt) run-tests --app vernon_project --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 3: Full frontend build.**

Run: `cd frontend && npm run build`
Expected: PASS (also copies `index.html` → `www/m.html` per the build script).

- [ ] **Step 4: Reload Frappe so new route + assets serve.**

Run: `bench --site $(cat ../../sites/currentsite.txt) clear-cache`
(Then a manual `bench restart` in the dev environment when ready — note this in the PR, don't assume it here.)

- [ ] **Step 5: Commit any verification fixes.**

```bash
git add -A
git commit -m "chore: verify desk comments + integration for rename" --allow-empty
```

---

## Self-Review notes

- **Spec coverage:** goal 1 → Tasks 1, 2, 5, 6; goal 2 (non-child) → Task 3 (lightweight list) + Task 7 (standalone link rows); goal 3 (comments) → Task 4 (API) + Task 7 (UI) + Task 8 (desk); goal 4 (item→detail link) → Task 2/3 (payload `project_detail`) + Task 7 (up-link UI). Covered.
- **Type consistency:** `ProjectFull` (get_project), `ProjectDetail` (get_project_detail), `ProjectItem`/`ProjectItemDetail` (get_project_item) used identically across api.ts/types.ts/pages. Response keys `project_detail`/`project_detail_title`/`project_items`/`project_details`/`item_total`/`item_done` match between `mobile.py` and `types.ts`.
- **No placeholders:** all steps carry concrete code or exact string maps + verification commands.
