# Task-form Group/Level + Group Merge + Weight Labels + Customer→Brand — Design

Date: 2026-06-18
Status: Approved (autonomous execution requested — "do it silently")

One combined branch delivering four related changes. Sections A–D are independent
enough to implement as separate plan tasks but ship together.

## Deploy summary

- Backend (mobile.py, doctype rename, field renames, patches) → `bench --site project.vernon.id migrate` + `bench restart`.
- Frontend (React) → `npm run build` (built assets are tracked in git).
- All schema/data migrations verified on a rolled-back console transaction before the real migrate.

---

## A. Task form: Group + Level

**Problem:** `Project Todo.group` is now required, but the mobile create/edit task
forms don't set it, so creating a todo from mobile fails. Add group + level pickers
(both required in the forms) and surface them on the task detail.

### Backend — `vernon_project/api/mobile.py`
1. `update_todo(...)` — add params `group=None, level=None`; when provided, set
   `row.group` / `row.level` before save (the Project Todo controller then snapshots
   `point` and validates that `level` belongs to `group`).
2. Task-detail shaper (the function producing `ProjectItemDetail` for
   `get_project_item`) — include `group`, `level`, `point`, `assignee_earned`,
   `leader_earned`.
3. `get_project_detail` (context the create sheet reads) — add `default_group`:
   resolve the detail's `grouping` (a Glossary docname) → its `glossary` label →
   the `Group` whose `group_name` equals that label; `null` if no match.

### Frontend
4. Types (`lib/types.ts`): `ProjectItemDetail` gains `group`, `level`, `point`,
   `assignee_earned`, `leader_earned`; the project-detail context type gains
   `default_group`.
5. `CreateProjectItemSheet.tsx`:
   - **Group** picker (`SearchableSelect`, options from `useScoringGroups`), required,
     initialised to `default_group`.
   - **Level** picker (`SearchableSelect`, options from the selected group's
     `levels` via `useScoringGroup(group)`), required; each option label shows
     `"<level> (<point> pts)"`. Disabled until a group is chosen; cleared when the
     group changes.
   - Submit validation requires group + level (in addition to existing required
     fields); sends `group` + `level` in the create payload.
6. `ProjectItemScreen.tsx` `EditForm`: the same two pickers, prefilled from the
   todo's `group`/`level`; sent through `update_todo`. The read-only detail view
   gains a line: `Group · Level (point) · earned`.

### Decisions
- Level is **required in the mobile forms** only; the backend `level` field stays
  optional so desk usage and the 1070 legacy group-only todos are not broken. Any
  todo edited via mobile must get a level before save.
- Group/level option data comes from the existing `useScoringGroups` /
  `useScoringGroup` hooks over `/api/resource/Group` — no new read endpoints.

---

## B. Group merge (mobile, Frappe-native)

Add a **Merge mode** to `GroupsScreen`:
- A "Merge" toggle reveals two `SearchableSelect`s: **source** and **target** group
  (both from `useScoringGroups`; source ≠ target enforced).
- Confirm → `api.post('frappe.client.rename_doc', { doctype: 'Group', old_name: source, new_name: target, merge: 1 })`.
  Frappe reassigns every `Project Todo.group` referencing the source to the target
  and deletes the source group.
- Manager-gated (existing `canManageGroups`). Success → toast + invalidate
  `['scoring-groups']`. Errors (e.g. permission, or a target that doesn't exist)
  surface via toast.

New api wrapper: `api.renameDoc(doctype, oldName, newName, merge)` calling
`frappe.client.rename_doc`. A hook `useMergeScoringGroup()` wraps it.

---

## C. Weight labels (Group form styling)

In `GroupFormScreen.tsx`, the six weight rows:
- Make each weight **label larger** (e.g. `text-sm text-slate-600` → `text-base font-medium text-slate-700`).
- Make the number **input narrower**, sized for ~5 characters (e.g. `w-24` → a
  fixed `w-16`). Purely visual; no behavior change.

---

## D. Customer → Brand (full rename + mobile CRUD)

Rename the `Customer` doctype **and** its fields to Brand, sweep all references, and
add a mobile Brand-management CRUD mirroring the Groups screens.

### D1. Schema rename (migration patch + JSON)
- Rename the doctype folder/files `customer/` → `brand/`; class `Customer` → `Brand`;
  JSON `name` `Customer` → `Brand`, `autoname` `field:customer_name` →
  `field:brand_name`, field `customer_name` → `brand_name` (label "Brand Name"),
  permissions unchanged.
- `project.json`: field `customer` → `brand` (label "Brand", `options` "Brand",
  keep `reqd`, `search_index`).
- Patch (`vernon_project/patches/v1_0/rename_customer_to_brand.py`), idempotent:
  1. If `Customer` doctype still exists and `Brand` does not →
     `frappe.rename_doc("DocType", "Customer", "Brand")`.
  2. `rename_field("Brand", "customer_name", "brand_name")` (guarded by column check).
  3. `rename_field("Project", "customer", "brand")` (guarded).
  Exact placement (pre/post model sync) and ordering relative to JSON sync is pinned
  in the plan and verified on a rolled-back console run before the real migrate.

### D2. Code sweep (labels + identifiers → brand)
- `mobile.py`: `get_form_options` `customers` key + `Customer` query → `brands` /
  `Brand` / `brand_name`; project shaping `doc.customer` → `doc.brand`; the existing
  `"brand": row.get("customer")` becomes `"brand": row.get("brand")`. Keep the
  outward JSON key `brand` (already used).
- Frontend `lib/types.ts`, `ProjectFormSheet.tsx`, `ProjectCard.tsx`,
  `Projects.tsx`, `ProjectScreen.tsx`: `customer` field/labels → `brand` / "Brand".
  `get_form_options` consumer reads `brands` instead of `customers`.
- Test fixtures referencing `Customer`/`customer` → `Brand`/`brand` (so the suite is
  not left broken, even though tests are deferred).

### D3. Mobile Brand CRUD (mirrors Groups feature)
- Types: `Brand { name: string; brand_name: string }`.
- Hooks: `canManageBrands(boot)` = roles include `System Manager` || `Project Owner`
  || `Group Manager`; `useBrands` (list), `useBrand(name)`, `useCreateBrand`,
  `useUpdateBrand`, `useDeleteBrand` over `/api/resource/Brand`.
- Screens: `BrandsScreen` (`/brands` list, `+ Brand`) and `BrandFormScreen`
  (`/brands/new`, `/brands/:name`; field `brand_name`, read-only on edit as it is the
  identity; delete with confirm). Same gated-route + redirect pattern as Groups.
- Profile entry "Manage Brands" gated by `canManageBrands`.

---

## Access rules (verbatim)

- `canManageGroups(boot)` = roles include `System Manager` || `Group Manager` (exists).
- `canManageBrands(boot)` = roles include `System Manager` || `Project Owner` || `Group Manager`.

## Error handling

- All mutations surface backend messages via `useToast` (ApiError carries the
  message, incl. permission denials and rename/merge failures).
- Reads show a spinner while loading and an inline retry on error, consistent with
  existing screens.

## Files

Backend:
- Modify `vernon_project/api/mobile.py` (A2, A3, D2).
- Rename `vernon_project/vernon_project/doctype/customer/` → `brand/` (+ class) (D1).
- Modify `vernon_project/vernon_project/doctype/project/project.json` (D1).
- Create `vernon_project/patches/v1_0/rename_customer_to_brand.py` + register in `patches.txt` (D1).
- Update test fixtures referencing Customer/customer (D2).

Frontend create:
- `frontend/src/pages/BrandsScreen.tsx`, `frontend/src/pages/BrandFormScreen.tsx` (D3).

Frontend modify:
- `frontend/src/lib/types.ts` (A, D), `frontend/src/hooks/useData.ts` (A, B, D),
  `frontend/src/lib/api.ts` (B, D), `frontend/src/components/CreateProjectItemSheet.tsx` (A),
  `frontend/src/pages/ProjectItemScreen.tsx` (A), `frontend/src/pages/GroupFormScreen.tsx` (C),
  `frontend/src/pages/GroupsScreen.tsx` (B), `frontend/src/App.tsx` (D routes),
  `frontend/src/pages/Profile.tsx` (D entry),
  `frontend/src/components/ProjectFormSheet.tsx`, `ProjectCard.tsx`, `pages/Projects.tsx`,
  `pages/ProjectScreen.tsx` (D sweep).

## Testing

CODE-FIRST: `npx tsc --noEmit` + `npm run build` for frontend; backend via console
smoke on `project.vernon.id`, rolled back:
1. A: create + edit a todo with group+level; verify point snapshot + detail payload
   includes group/level/point/earned; verify `default_group` resolves.
2. B: `frappe.client.rename_doc('Group', src, tgt, merge=1)` moves todos and removes
   source.
3. D: after the rename patch, `Brand` doctype + `tabBrand` exist, `Project.brand`
   column holds the old customer values, a Project still loads, and Brand CRUD via
   `/api/resource/Brand` works.

## Risks

- **D doctype+field rename on LIVE data** is the highest risk. Mitigations: idempotent
  guarded patch; dry-run on a rolled-back console transaction first; verify Project
  rows still resolve their brand after rename; the rename is reference-complete
  (JSON options + code sweep) so post-migrate sync is clean.
- **B merge is destructive** (source group deleted). The UI requires explicit
  source+target selection and a confirm step.
- Backend changes need `bench restart`; surfaced at deploy.
