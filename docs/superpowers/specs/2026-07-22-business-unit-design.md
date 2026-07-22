# Business Unit — design

**Approved:** 2026-07-22

New standalone DocType `Business Unit` with full CRUD (list + form) on both frontends,
mirroring the existing **Company** registry but richer: adds an optional Company link,
a description, and an image. "Standalone" = nothing in the existing
Company→Brand→Project hierarchy changes; a Business Unit may *reference* a Company,
but nothing references a Business Unit.

Built by cloning two existing patterns:
- **Company registry** (`Companies.tsx` / `CompaniesScreen.tsx` + `CompanyForm.tsx` /
  `CompanyFormScreen.tsx`) — admin-gated list/form over the generic `resource` client.
- **Marketplace Reward form** (`RewardForm.tsx` / `RewardFormScreen.tsx`) — image upload
  + description.

## 1. DocType `Business Unit`

Mirror `Company`'s doctype (same 5 permission blocks, module Vernon Project, empty
controller). Fields:

| field | type | notes |
|---|---|---|
| `business_unit_name` | Data, unique, reqd, `in_list_view` | `autoname: field:business_unit_name`, `title_field` |
| `company` | Link → Company, `in_list_view`, `in_standard_filter` | optional metadata |
| `description` | Small Text | |
| `image` | Attach Image | `"image_field": "image"` |

Permissions (copy verbatim from Company): System Manager / Project Owner / Group Manager
= full write; Project Leader / Project Team = read/select. Empty `BusinessUnit(Document)`
controller — no side effects.

## 2. Image upload endpoint

`upload_reward_image` is gated on `_require_marketplace_manager()` — wrong role for BU
admins. Add a sibling in `vernon_project/api/mobile.py`, identical validation
(`ALLOWED_IMAGE_EXT` / `ALLOWED_IMAGE_MIME` / `MAX_IMAGE_BYTES`, public `save_file`), gated
on `frappe.has_permission("Business Unit", "create")` — exactly who may create a BU:

```python
@frappe.whitelist()
def upload_business_unit_image():
    if not frappe.has_permission("Business Unit", "create"):
        frappe.throw("Not permitted", frappe.PermissionError)
    ...  # same body as upload_reward_image
```

## 3. Docs

Add `"Business Unit"` to `gen_docs.py` CLUSTERS `"org"` member set (`{"Brand", "Company"}`
→ `{"Brand", "Company", "Business Unit"}`). Run `python3 scripts/gen_docs.py`, commit
`docs/assets/data.js`. (gen_docs exits non-zero if a new DocType is unmapped.)

## 4. Shared FE (`frontend/src`, imported by both frontends)

- `lib/types.ts` — `BusinessUnit` interface: `{ name, business_unit_name, company,
  description, image }` (all-but-name nullable).
- `hooks/useData.ts` — query keys `businessUnits` / `businessUnit(n)`; hooks
  `useBusinessUnits`, `useBusinessUnit`, `useCreateBusinessUnit`, `useUpdateBusinessUnit`,
  `useDeleteBusinessUnit` (generic `resource` client, mirror the Company + Reward hooks);
  gate `canManageBusinessUnits = canManageBrands`.
- `lib/api.ts` — `uploadBusinessUnitImage(file)`, identical to `uploadRewardImage` but
  posts to `upload_business_unit_image`.

## 5. Web (`frontend-web/src`)

- `pages/BusinessUnits.tsx` — clone `Companies.tsx`; tiles show name + company + thumbnail.
- `pages/BusinessUnitForm.tsx` — clone `CompanyForm.tsx`; add company `SearchableSelect`
  (searchable-select convention — no native `<select>`), description textarea, image upload
  from `RewardForm.tsx`. **Edit saves** the editable fields (`business_unit_name` immutable,
  read-only on edit); create sets all four. `useConfirm`/`useToast` — no native
  alert/confirm.
- `App.tsx` — routes `/business-units`, `/business-units/new`, `/business-units/:name`
  under the `canManageCompanies`/`canManageBusinessUnits` gate (beside `/companies`).
- `lib/nav.ts` — nav leaf `/business-units` "Business Units" beside Companies/Brands.

## 6. Mobile (`frontend/src`)

- `pages/BusinessUnitsScreen.tsx` — clone `CompaniesScreen.tsx` (soft-pop cards); show
  thumbnail + company subtitle.
- `pages/BusinessUnitFormScreen.tsx` — clone `CompanyFormScreen.tsx` + image/description
  from `RewardFormScreen.tsx` + company picker.
- `App.tsx` — routes under the same admin gate.
- `pages/Profile.tsx` — add "Manage Business Units" row in the "Companies" menu group,
  cloning the "Manage Companies" row.

## 7. Deferred (YAGNI)

- **No merge tool.** Company has one (re-points brands); BU is standalone with no
  dependents to re-point.

## 8. Ship

`bench migrate` (new doctype) → build both bundles → `sudo /usr/local/bin/tj-restart` →
regen docs → verify each frontend's routes → add What's New entry (Bahasa, platform `Both`).
