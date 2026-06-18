# Task-form Group/Level + Group Merge + Weight Labels + Customer→Brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four changes on one branch: (A) group+level pickers on the mobile task create/edit forms, (B) a group-merge mode in the mobile Groups UI, (C) bigger weight labels / narrower inputs on the Group form, (D) full rename of the `Customer` doctype+fields to `Brand` plus a mobile Brand CRUD.

**Architecture:** Frappe backend (`vernon_project/api/mobile.py`, doctype JSON, a pre-model-sync patch) + a React/Vite mobile app under `frontend/`. The mobile app reaches scoring Groups and Brands through the generic `/api/resource/<Doctype>` helper and bespoke `mobile.*` whitelisted methods. The Customer→Brand rename is a guarded pre-model-sync patch (rename doctype + columns) plus a code sweep.

**Tech Stack:** Frappe (Python, DocType JSON, patches), React 18, react-router-dom, @tanstack/react-query, TypeScript, Tailwind, lucide-react, Vite, MariaDB.

## Global Constraints

- Frontend dir: `/home/frappe/frappe-bench/apps/vernon_project/frontend`; backend app root: `/home/frappe/frappe-bench/apps/vernon_project`. Bench cwd `/home/frappe/frappe-bench`, site `project.vernon.id`.
- CODE-FIRST / LIVE site: implementers write code + commit ONLY. NO `bench migrate`/`bench restart`/`bench build` per task. Frontend tasks verify with `cd frontend && npx tsc --noEmit`. The FINAL task (controller-run) does the single `bench migrate` + `bench restart` + `npm run build` + rolled-back smoke on `project.vernon.id`.
- `group` is a SQL reserved word — always backtick it in raw SQL (`` t.`group` ``).
- Access rules (verbatim): `canManageGroups(boot)` = roles include `System Manager` || `Group Manager` (exists). `canManageBrands(boot)` = roles include `System Manager` || `Project Owner` || `Group Manager`.
- Level is required in the mobile FORMS only; backend `Project Todo.level` stays optional.
- Mobile outward JSON key for a project's brand is `brand` (already emitted today as `"brand": row.get("customer")`).
- Existing idioms: `SearchableSelect` (`components/SearchableSelect`, props `{value, onChange, options:{value,label}[], placeholder?}`), `useToast()` → `toast('success'|'error'|'info', msg)`, `DetailScreen{title, children, right?}`, `Spinner`/`EmptyState` (`components/ui`), `resource` + `api` helpers (`lib/api`), React Query.
- Match the existing scoring-Group code (committed) when mirroring it for Brands: `canManageGroups`, `useScoringGroups`, `GroupsScreen`, `GroupFormScreen`.

---

### Task 1: D — rename Customer→Brand (doctype JSON + pre-model-sync patch)

**Files:**
- Rename: `vernon_project/vernon_project/doctype/customer/` → `vernon_project/vernon_project/doctype/brand/` (3 files: `__init__.py`, `customer.json`→`brand.json`, `customer.py`→`brand.py`)
- Modify: `vernon_project/vernon_project/doctype/project/project.json` (field `customer`→`brand`)
- Create: `vernon_project/patches/v1_0/rename_customer_to_brand.py`
- Modify: `vernon_project/patches.txt` (register under `[pre_model_sync]`)

**Interfaces:**
- Produces: doctype `Brand` (was Customer), field `brand_name` (was customer_name), autoname `field:brand_name`; `Project.brand` Link→Brand (was `customer`). Consumed by Tasks 2-4.

- [ ] **Step 1: Move the doctype folder with git**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git mv vernon_project/vernon_project/doctype/customer vernon_project/vernon_project/doctype/brand
git mv vernon_project/vernon_project/doctype/brand/customer.json vernon_project/vernon_project/doctype/brand/brand.json
git mv vernon_project/vernon_project/doctype/brand/customer.py vernon_project/vernon_project/doctype/brand/brand.py
```

- [ ] **Step 2: Rewrite `brand.json`**

Replace the full contents of `vernon_project/vernon_project/doctype/brand/brand.json` with (permissions preserved from the original — SM full, Project Owner create/write, Project Leader/Team read):
```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:brand_name",
 "creation": "2026-01-15 12:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["brand_name"],
 "fields": [
  {
   "fieldname": "brand_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Brand Name",
   "reqd": 1,
   "unique": 1
  }
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [
  {"link_doctype": "Project", "link_fieldname": "brand"}
 ],
 "modified": "2026-06-18 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Brand",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Project Owner", "create": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Project Leader", "read": 1, "report": 1, "export": 1, "print": 1},
  {"role": "Project Team", "read": 1, "report": 1, "export": 1, "print": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "title_field": "brand_name"
}
```
(Original `customer.json` had `link_fieldname: "customer"` in a links/dashboard block — verify the original's exact `links`/extra keys by reading the git-moved file's history; preserve any keys present in the original other than the renamed ones. If the original had no `links` block, omit it.)

- [ ] **Step 3: Rewrite `brand.py` class name**

`vernon_project/vernon_project/doctype/brand/brand.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class Brand(Document):
	pass
```

- [ ] **Step 4: Point the Project link field at Brand**

In `vernon_project/vernon_project/doctype/project/project.json`, find the field object with `"fieldname": "customer"` and replace it with:
```json
  {
   "fieldname": "brand",
   "fieldtype": "Link",
   "label": "Brand",
   "options": "Brand",
   "reqd": 1,
   "search_index": 1
  }
```
Also change the `"customer"` entry in the `field_order` array to `"brand"`.

- [ ] **Step 5: Write the pre-model-sync patch**

`vernon_project/patches/v1_0/rename_customer_to_brand.py`:
```python
import frappe


def execute():
	"""Rename the Customer doctype + its fields to Brand, before model sync.

	Runs in [pre_model_sync] so the doctype/table and columns are renamed to
	match the new JSON BEFORE Frappe syncs brand.json / project.json. Idempotent.
	"""
	# 1. Rename the doctype (renames tabCustomer -> tabBrand and the DocType record).
	if frappe.db.exists("DocType", "Customer") and not frappe.db.exists("DocType", "Brand"):
		frappe.rename_doc("DocType", "Customer", "Brand", force=True)
		frappe.flags.ignore_route_conflict_validation = True

	# 2. Rename the identity column customer_name -> brand_name on the Brand table.
	if frappe.db.table_exists("Brand") and frappe.db.has_column("Brand", "customer_name") \
			and not frappe.db.has_column("Brand", "brand_name"):
		frappe.db.rename_column("Brand", "customer_name", "brand_name")

	# 3. Rename the Project link column customer -> brand.
	if frappe.db.has_column("Project", "customer") and not frappe.db.has_column("Project", "brand"):
		frappe.db.rename_column("Project", "customer", "brand")

	frappe.db.commit()
```

- [ ] **Step 6: Register the patch (pre_model_sync)**

In `vernon_project/patches.txt`, under the `[pre_model_sync]` header (after the comment lines, before `[post_model_sync]`), add:
```
vernon_project.patches.v1_0.rename_customer_to_brand
```

- [ ] **Step 7: Validate JSON + commit (no migrate — final task runs it)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
python3 -c "import json; json.load(open('vernon_project/vernon_project/doctype/brand/brand.json')); json.load(open('vernon_project/vernon_project/doctype/project/project.json')); print('JSON ok')"
python3 -c "import ast; ast.parse(open('vernon_project/patches/v1_0/rename_customer_to_brand.py').read()); print('AST ok')"
git add -A vernon_project
git commit -m "feat: rename Customer doctype+fields to Brand (JSON + pre-model-sync patch)"
```

---

### Task 2: D — backend sweep (`mobile.py` Customer→Brand)

**Files:**
- Modify: `vernon_project/api/mobile.py`

**Interfaces:**
- Consumes: `Brand` doctype + `Project.brand` (Task 1).
- Produces: `get_form_options` returns a `brands` list (was `customers`); project payloads read `p.brand`. Consumed by Task 3 frontend sweep.

- [ ] **Step 1: `_fetch_todos` — select `p.brand` not `p.customer`**

In `vernon_project/api/mobile.py`, in the `_fetch_todos` SQL SELECT, change `p.customer` to `p.brand`.

- [ ] **Step 2: `_shape_todo` — read `brand`**

In `_shape_todo`, change `"brand": row.get("customer"),` to `"brand": row.get("brand"),`.

- [ ] **Step 3: project getters — `doc.customer` → `doc.brand`**

In `mobile.py`, the project-shaping spots that reference `customer`:
- the SELECT field list `"name", "project_name", "status", "customer", "start_date",` → replace `"customer"` with `"brand"`.
- `"customer": doc.customer,` → `"brand": doc.brand,` (search for `doc.customer`).

- [ ] **Step 4: `get_form_options` — Brand**

Replace the customers block in `get_form_options`:
```python
	brands = frappe.get_all("Brand", fields=["name", "brand_name"], limit_page_length=0)
```
and in the returned dict replace the `"customers"` key with:
```python
		"brands": sorted(
			[{"value": b["name"], "label": b.get("brand_name") or b["name"]} for b in brands],
			key=lambda x: x["label"],
		),
```
Update the docstring mention of "customers" → "brands".

- [ ] **Step 5: AST check + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
python3 -c "import ast; ast.parse(open('vernon_project/api/mobile.py').read()); print('AST ok')"
grep -n "customer\|Customer" vernon_project/api/mobile.py || echo "no customer refs left"
git add vernon_project/api/mobile.py
git commit -m "feat: mobile.py uses Brand instead of Customer"
```

---

### Task 3: D — frontend sweep (customer→brand in existing screens)

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/components/ProjectFormSheet.tsx`, `frontend/src/components/ProjectCard.tsx`, `frontend/src/pages/Projects.tsx`, `frontend/src/pages/ProjectScreen.tsx`

**Interfaces:**
- Consumes: `get_form_options().brands` (Task 2), `brand` on project payloads.
- Produces: project UI uses `brand` field + "Brand" labels.

- [ ] **Step 1: Inventory the references**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend/src
grep -rn "customer\|Customer" lib/types.ts components/ProjectFormSheet.tsx components/ProjectCard.tsx pages/Projects.tsx pages/ProjectScreen.tsx
```

- [ ] **Step 2: Apply the rename in each file**

For each hit, rename the identifier and label from customer→brand, consistently:
- `types.ts`: in the project/form-options types, rename `customer: string` → `brand: string`; rename a `customers: {value,label}[]` form-options field → `brands: {value,label}[]`.
- `ProjectFormSheet.tsx`: the state/field for customer → brand; the options source `options.customers` → `options.brands`; the visible label `Customer` → `Brand`; the submit payload key `customer` → `brand`.
- `ProjectCard.tsx`, `Projects.tsx`, `ProjectScreen.tsx`: any `.customer` read → `.brand`; visible "Customer" label text → "Brand".

Keep behavior identical — this is a pure rename. Do NOT touch the scoring-Group code.

- [ ] **Step 3: Typecheck + confirm no stragglers + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
grep -rn "customer\|Customer" frontend/src/lib/types.ts frontend/src/components/ProjectFormSheet.tsx frontend/src/components/ProjectCard.tsx frontend/src/pages/Projects.tsx frontend/src/pages/ProjectScreen.tsx || echo "clean"
git add frontend/src
git commit -m "feat(mobile): project UI uses Brand instead of Customer"
```

---

### Task 4: D — mobile Brand CRUD (mirror of Groups)

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/hooks/useData.ts`, `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx`
- Create: `frontend/src/pages/BrandsScreen.tsx`, `frontend/src/pages/BrandFormScreen.tsx`

**Interfaces:**
- Consumes: `Brand` doctype via `/api/resource/Brand`; `boot.roles`.
- Produces: `canManageBrands`, `useBrands`/`useBrand`/`useCreateBrand`/`useUpdateBrand`/`useDeleteBrand`; `/brands*` routes; Profile entry. Mirrors the committed scoring-Group code.

- [ ] **Step 1: Types**

Append to `frontend/src/lib/types.ts`:
```ts
export interface Brand {
  name: string
  brand_name: string
}
```

- [ ] **Step 2: Access helper + hooks**

In `frontend/src/hooks/useData.ts`: add `Brand` to the `import type` block; add keys `brands: ['brands'] as const` and `brand: (n: string) => ['brand', n] as const` to `keys`; then add:
```ts
export function canManageBrands(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Project Owner') ||
    boot.roles.includes('Group Manager')
  )
}

export function useBrands() {
  return useQuery({
    queryKey: keys.brands,
    queryFn: () => resource.list<Brand[]>('Brand', { fields: ['name', 'brand_name'], limit: 0 }),
  })
}

export function useBrand(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.brand(name),
    queryFn: () => resource.get<Brand>('Brand', name),
    enabled: !!name && enabled,
  })
}

export function useCreateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { brand_name: string }) =>
      resource.create<{ name: string }>('Brand', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}

export function useUpdateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: { brand_name: string } }) =>
      resource.update<{ name: string }>('Brand', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.brands })
      qc.invalidateQueries({ queryKey: keys.brand(vars.name) })
    },
  })
}

export function useDeleteBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Brand', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}
```

- [ ] **Step 3: BrandsScreen**

Create `frontend/src/pages/BrandsScreen.tsx` — copy the committed `frontend/src/pages/GroupsScreen.tsx` structure exactly, substituting: `useScoringGroups`→`useBrands`, `canManageGroups`→`canManageBrands`, title "Groups"→"Brands", `/groups`→`/brands`, the row primary text `g.group_name`→`b.brand_name`, drop the weight badge (Brands have no weight) and any `Layers`/weight UI, keep the `+ Brand` button → `/brands/new`, the `NoAccessRedirect` (navigate inside `useEffect`), bootLoading spinner, and `EmptyState` ("No brands yet"). Read `GroupsScreen.tsx` first and keep all the gating/loading patterns identical.

- [ ] **Step 4: BrandFormScreen**

Create `frontend/src/pages/BrandFormScreen.tsx` — a trimmed copy of `frontend/src/pages/GroupFormScreen.tsx`: only one editable field `brand_name` (required; read-only in edit mode as it is the identity), no weights, no levels. Hooks: `useBrand`/`useCreateBrand`/`useUpdateBrand`/`useDeleteBrand`/`useBoot`/`canManageBrands`. Keep the effect-based access redirect, edit-load `useEffect` prefill, validation (brand_name non-empty → toast), Save (create/update), Delete (confirm) → navigate `/brands`. Payload `{ brand_name }`.

- [ ] **Step 5: Routes + Profile entry**

In `frontend/src/App.tsx`: import `BrandsScreen`, `BrandFormScreen`, and `canManageBrands`; add, before `/me`, ordered new-before-:name:
```tsx
        {canManageBrands(boot) && (
          <>
            <Route path="/brands" element={<BrandsScreen />} />
            <Route path="/brands/new" element={<BrandFormScreen />} />
            <Route path="/brands/:name" element={<BrandFormScreen />} />
          </>
        )}
```
In `frontend/src/pages/Profile.tsx`: add `canManageBrands` to the useData import, add a `Tag` (or `Store`) icon from lucide, and add a gated row next to "Manage Groups":
```tsx
            {canManageBrands(boot) && (
              <Row icon={Store} label="Manage Brands" onClick={() => navigate('/brands')} />
            )}
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src
git commit -m "feat(mobile): Brand management CRUD (list + form + routes + Profile entry)"
```

---

### Task 5: A — backend group/level on the task API (`mobile.py`)

**Files:**
- Modify: `vernon_project/api/mobile.py`

**Interfaces:**
- Consumes: `Project Todo.group/level/point/assignee_earned/leader_earned`, `Group`, `Glossary`.
- Produces: `_shape_todo` emits `group/level/point/assignee_earned/leader_earned`; `update_todo` accepts `group`/`level`; `get_project_detail` returns `default_group`. Consumed by Tasks 6-7.

- [ ] **Step 1: `_fetch_todos` — select the points columns**

In the `_fetch_todos` SELECT, add to the `t.` columns (mind the backtick on `group`):
```
			t.`group` AS `group`, t.level, t.point, t.assignee_earned, t.leader_earned,
```
(place it among the other `t.` columns, e.g. right after `t.is_recurring,`).

- [ ] **Step 2: `_shape_todo` — emit the fields**

In `_shape_todo`'s `out` dict, add:
```python
		"group": row.get("group"),
		"level": row.get("level"),
		"point": row.get("point") or 0,
		"assignee_earned": row.get("assignee_earned") or 0,
		"leader_earned": row.get("leader_earned") or 0,
```

- [ ] **Step 3: `update_todo` — accept group + level**

Add `group=None,` and `level=None,` to the `update_todo` signature (next to the other params). In the body, before `row.save(...)`, add:
```python
		if group is not None and group:
			row.group = group
		if level is not None:
			row.level = level or None
```

- [ ] **Step 4: `get_project_detail` — resolve `default_group`**

In `get_project_detail`, after `detail["groupings"] = ...`, add:
```python
	# Resolve a default scoring Group from the detail's grouping (Glossary -> label -> Group).
	default_group = None
	if detail.get("grouping"):
		label = frappe.get_value("Glossary", detail["grouping"], "glossary")
		if label and frappe.db.exists("Group", label):
			default_group = label
	detail["default_group"] = default_group
```

- [ ] **Step 5: AST check + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
python3 -c "import ast; ast.parse(open('vernon_project/api/mobile.py').read()); print('AST ok')"
git add vernon_project/api/mobile.py
git commit -m "feat: expose group/level/point on task API + default_group + update_todo group/level"
```

---

### Task 6: A — group/level pickers on the create sheet

**Files:**
- Modify: `frontend/src/components/CreateProjectItemSheet.tsx`, `frontend/src/lib/types.ts` (add `default_group` to the detail type)

**Interfaces:**
- Consumes: `useScoringGroups`, `useScoringGroup` (committed), `default_group` (Task 5).
- Produces: create payload includes `group` + `level`.

- [ ] **Step 1: Add `default_group` to the detail type**

In `frontend/src/lib/types.ts`, on the interface returned by `get_project_detail` (the one carrying `team`, `groupings`, `can_create`), add `default_group?: string | null`.

- [ ] **Step 2: Add the pickers to `CreateProjectItemSheet`**

`CreateProjectItemSheet` currently takes `{ open, onClose, projectDetail, team }`. Add a `defaultGroup?: string | null` prop and pass it from the caller (`ProjectDetailScreen`/wherever the sheet is rendered — find with `grep -rn "CreateProjectItemSheet" frontend/src`). In the component:
- imports: `useScoringGroups`, `useScoringGroup` from `@/hooks/useData`.
- state: `const [group, setGroup] = useState(defaultGroup ?? '')` and `const [level, setLevel] = useState('')`.
- `const { data: groups } = useScoringGroups()` and `const { data: groupDoc } = useScoringGroup(group, !!group)`.
- When `group` changes, clear `level` (a `useEffect` on `[group]` that `setLevel('')`).
- Render two `SearchableSelect`s after the Assigned-to field:
  - Group (required): `options={(groups ?? []).map(g => ({ value: g.name, label: g.group_name }))}`, value `group`, onChange `setGroup`.
  - Level (required): `options={(groupDoc?.levels ?? []).map(l => ({ value: l.level_name, label: \`${l.level_name} (${l.point} pts)\` }))}`, value `level`, onChange `setLevel`, placeholder "Pick a group first…", and only enabled when `group` is set.
- In `submit`, extend the guard: `if (!toDo.trim() || !assignedTo || !deadline || !group || !level) { toast('error', 'Name, assignee, deadline, group and level are required'); return }` and add to `fields`: `fields.group = group; fields.level = level`.
- In `reset()`, also reset `group` to `defaultGroup ?? ''` and `level` to `''`.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src
git commit -m "feat(mobile): group+level pickers on task create sheet"
```

---

### Task 7: A — group/level on the edit form + task detail display

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx`, `frontend/src/lib/types.ts` (`ProjectItemDetail` fields)

**Interfaces:**
- Consumes: `useScoringGroups`, `useScoringGroup`, the `group/level/point/...` now on the item payload (Task 5).
- Produces: edit form sends `group`/`level`; detail view shows them.

- [ ] **Step 1: Extend `ProjectItemDetail`**

In `frontend/src/lib/types.ts`, on `ProjectItemDetail`, add:
```ts
  group?: string | null
  level?: string | null
  point?: number
  assignee_earned?: number
  leader_earned?: number
```

- [ ] **Step 2: Add pickers to `EditForm`**

In `frontend/src/pages/ProjectItemScreen.tsx` `EditForm`:
- import `useScoringGroups`, `useScoringGroup` (add to the existing `@/hooks/useData` import).
- state: `const [group, setGroup] = useState(data.group ?? '')`, `const [level, setLevel] = useState(data.level ?? '')`.
- `const { data: groups } = useScoringGroups()`, `const { data: groupDoc } = useScoringGroup(group, !!group)`; a `useEffect` on `[group]` clears level when the group changes to one whose levels no longer contain it (mirror the create sheet: simplest = clear level when group changes, but preserve initial `data.level` on first mount — implement by tracking a `didInit` ref, OR only clear when the user changes the select; the create-sheet approach of clearing on every group change is acceptable here too as long as the initial render keeps `data.level`). Keep it simple: clear `level` only when `group` differs from `data.group`.
- Render two `SearchableSelect`s (Group, Level) like Task 6, before the Save buttons. Both required.
- In `save`, before `update.mutate`: `if (!group || !level) { toast('error', 'Group and level are required'); return }` and add `fields.group = group; fields.level = level`.

- [ ] **Step 3: Show group/level on the read-only detail**

In `ProjectItemScreen.tsx`, in the non-editing detail view (the section that renders task meta — find where `data.to_do`/status/deadline are shown), add a read-only line when `data.group`:
```tsx
        {data.group && (
          <p className="text-sm text-slate-600">
            <span className="font-medium">Group:</span> {data.group}
            {data.level ? ` · ${data.level}` : ''}
            {data.point ? ` (${data.point} pts)` : ''}
          </p>
        )}
```
Place it near the existing meta lines, matching surrounding styling.

- [ ] **Step 4: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src
git commit -m "feat(mobile): group+level on task edit form and detail view"
```

---

### Task 8: B — group merge mode (mobile)

**Files:**
- Modify: `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`, `frontend/src/pages/GroupsScreen.tsx`

**Interfaces:**
- Consumes: `frappe.client.rename_doc` (whitelisted), `useScoringGroups`.
- Produces: `api.renameDoc`, `useMergeScoringGroup`, merge UI in GroupsScreen.

- [ ] **Step 1: api wrapper**

In `frontend/src/lib/api.ts`, add to the exported `api` usage a helper (near `mobileApi`, using the existing `api.post`):
```ts
export const renameDoc = (doctype: string, oldName: string, newName: string, merge: boolean) =>
  api.post<{ message?: string }>('frappe.client.rename_doc', {
    doctype,
    old_name: oldName,
    new_name: newName,
    merge: merge ? 1 : 0,
  })
```

- [ ] **Step 2: merge hook**

In `frontend/src/hooks/useData.ts`, add (import `renameDoc` from `@/lib/api` alongside the existing `mobileApi, resource` import):
```ts
export function useMergeScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      renameDoc('Group', source, target, true),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.scoringGroups }),
  })
}
```

- [ ] **Step 3: merge UI in GroupsScreen**

In `frontend/src/pages/GroupsScreen.tsx`:
- imports: `useState` from react; `SearchableSelect`; `useMergeScoringGroup`; `useToast`; `GitMerge` icon from lucide.
- state: `const [mergeMode, setMergeMode] = useState(false)`, `const [src, setSrc] = useState('')`, `const [tgt, setTgt] = useState('')`; `const merge = useMergeScoringGroup()`; `const toast = useToast()`.
- Add a header-right secondary action (or a button above the list) to toggle `mergeMode`.
- When `mergeMode`, render a card above the list with two `SearchableSelect`s (source, target — options from `groups`, label `group_name`), and a "Merge" button:
```tsx
  const doMerge = () => {
    if (!src || !tgt) { toast('error', 'Pick source and target'); return }
    if (src === tgt) { toast('error', 'Source and target must differ'); return }
    if (!confirm(`Merge "${src}" into "${tgt}"? Todos move to "${tgt}" and "${src}" is deleted.`)) return
    merge.mutate({ source: src, target: tgt }, {
      onSuccess: () => { toast('success', 'Groups merged'); setMergeMode(false); setSrc(''); setTgt('') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
```
Keep the existing list + access gating untouched.

- [ ] **Step 4: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src
git commit -m "feat(mobile): merge mode for scoring groups (Frappe rename_doc merge)"
```

---

### Task 9: C — weight label sizing on the Group form

**Files:**
- Modify: `frontend/src/pages/GroupFormScreen.tsx`

**Interfaces:** none (styling only).

- [ ] **Step 1: Enlarge weight labels, narrow inputs**

In `frontend/src/pages/GroupFormScreen.tsx`, in the weights `WEIGHTS.filter(...).map(...)` rows:
- Change the weight `<label>` class from `flex-1 text-sm text-slate-600` to `flex-1 text-base font-medium text-slate-700`.
- Change the weight `<input>` class width from `field + ' w-24'` to `field + ' w-16 text-center'` (fits ~5 chars).
Leave the levels editor and everything else unchanged.

- [ ] **Step 2: Typecheck + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/GroupFormScreen.tsx
git commit -m "style(mobile): bigger weight labels, narrower inputs on Group form"
```

---

### Task 10: Final integration — migrate, restart, build, smoke (controller-run)

**Files:** none (verification). Run by the controller on `project.vernon.id`.

- [ ] **Step 1: Dry-run the Customer→Brand rename on a rolled-back console transaction**

In `bench --site project.vernon.id console`, simulate the patch logic (rename_doc DocType + rename_column ×2), confirm `tabBrand` exists, `Project.brand` column holds the old customer values, a Project still loads, then `frappe.db.rollback()`. Fix the patch if anything fails BEFORE the real migrate.

- [ ] **Step 2: Migrate (runs pre-model-sync rename patch + syncs brand.json/project.json)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: completes; `Brand` doctype exists, `Customer` gone, `Project.brand` populated.

- [ ] **Step 3: Restart workers (loads mobile.py changes) + clear cache**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-cache && bench restart
```

- [ ] **Step 4: Build the frontend**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```

- [ ] **Step 5: Rolled-back smoke on the live site (console)**

Verify, then `frappe.db.rollback()`:
- A: create a todo with `group`+`level` via `frappe.client.insert`; assert `point` snapshot; `get_project_detail` returns `default_group` for a detail with a grouping; `get_project_item` payload includes group/level/point/earned. `update_todo(..., group=g, level=l)` updates them.
- B: `frappe.client.rename_doc('Group', src, tgt, merge=1)` reassigns todos + removes source (use throwaway groups, rolled back).
- D: `Brand` CRUD via `frappe.client` works; `get_form_options()` returns `brands`.

- [ ] **Step 6: Commit built assets**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A frontend vernon_project
git commit -m "chore: build frontend + final integration for taskform/merge/brand"
```

---

## Self-Review

**Spec coverage:**
- A (task form group/level): backend Task 5; create Task 6; edit + detail Task 7. ✓
- B (group merge): Task 8. ✓
- C (weight labels): Task 9. ✓
- D (Customer→Brand): schema Task 1; backend sweep Task 2; frontend sweep Task 3; mobile CRUD Task 4. ✓
- Access rules: `canManageGroups` reused (Task 8); `canManageBrands` SM||PO||GM (Task 4). ✓
- Backtick on `group` in SQL: Task 5 Step 1. ✓
- `default_group` resolution: Task 5 Step 4. ✓
- Level required in forms only (backend stays optional): Tasks 6/7 guards; no backend reqd change. ✓
- Deploy migrate+restart+build+smoke: Task 10. ✓

**Placeholder scan:** No TBD/TODO; mechanical sweeps (Tasks 2/3) name exact files + exact identifier changes with grep verification steps; new logic has full code. ✓

**Type consistency:** `canManageBrands`, `useBrands`/`useBrand`/`useCreateBrand`/`useUpdateBrand`/`useDeleteBrand`, keys `brands`/`brand(n)`, `Brand{name,brand_name}`, `default_group`, `useMergeScoringGroup({source,target})`, `api.renameDoc(doctype,old,new,merge)` — used consistently across tasks. Group/level payload keys `group`/`level` match between mobile create (Task 6), edit (Task 7), and backend `update_todo` (Task 5). ✓

**Risks flagged in plan:** D rename verified on rolled-back console before real migrate (Task 10 Step 1); B merge is destructive (confirm dialog, Task 8).

**Known follow-up (out of scope):** removing the legacy per-project Glossary grouping UI.
