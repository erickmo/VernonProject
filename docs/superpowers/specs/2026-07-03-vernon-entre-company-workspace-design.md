# vernon_entre — Company Workspace + Business Plan (Sub-project 1 of 3)

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Depends on:** existing vernon_entre app (canvas doctypes + red-themed `frontend-entre` SPA at `/entre`) and ERPNext v15 on `dev.vernon.id` (`Company`, `Sales Order`, `Purchase Order`, `Customer`, `Supplier`, `Item` present; one Company `Dev` exists, IDR/Indonesia).

## Purpose

Pivot the app from student "ventures" to **operator companies**. The homepage becomes a **grid of companies** (ERPNext `Company` records). Tapping a company opens its **detail**, which has a **Business Plan** area (the VPC + BMC canvases, with SWOT + Empathy Map secondary) and an **Operations** area (Sales & Purchase — stubbed here, built in sub-projects 2 & 3).

This sub-project delivers a working Company + Business-Plan app on the existing red theme. Operations (list + create Sales/Purchase Orders via ERPNext API) are separate specs.

## Decisions (locked in brainstorming)

- **Company = ERPNext `Company`** (native). Full ERPNext company model.
- **Operator model**: drop the Entre-Student per-owner isolation. Users have ERPNext access; per-company visibility comes from **ERPNext `Company` User Permissions** (Frappe applies user permissions to the canvases' `company` Link field automatically).
- **Business plan = VPC + BMC featured**, SWOT + Empathy Map kept (secondary).
- **Canvas re-link**: canvases attach to a Company via a `company` Link field (was `venture`). The `Venture` doctype is retired.
- **Operations** = full create + list of Sales/Purchase Orders (sub-projects 2 & 3), via ERPNext's generic API.
- **Company creation** is deferred to the ERPNext desk for now (creating an ERPNext Company auto-builds a chart of accounts — heavy). Sub-project 1 lists + opens existing companies.

## Data model changes

For each canvas doctype — **SWOT**, **Business Model Canvas**, **Value Proposition Canvas**, **Empathy Map**:
- Remove the `venture` field (Link → Venture).
- Add `company` (Link → `Company`, reqd, `in_list_view`).
- Set `title_field = company`.
- Section table fields (the `Entre Canvas Item` tables) are unchanged.
- `autoname` series unchanged.

**Per-company scoping** is automatic: a Link field to `Company` respects ERPNext `Company` User Permissions unless `ignore_user_permissions` is set — leave it unset, so an operator with a Company User Permission for "Dev" only sees canvases where `company = Dev`. System Manager / Administrator see all.

**Existing data:** verify canvas-doc counts; any existing canvas docs (likely only leftover smoke-test rows) are deleted or reassigned to `Dev` during migration — old `venture` values do not map to `Company` names.

**Venture doctype:** retired — no UI references it and no canvas links to it. The doctype file is left dormant (not deleted, to avoid a destructive drop); a later cleanup may remove it.

## Permissions

- New role **`Entre Operator`** (replaces the workspace use of `Entre Student`).
- Each canvas doctype's permissions become exactly: `Entre Operator` (read/write/create/delete, **no `if_owner`**) and `System Manager` (full). The old `Entre Student` `if_owner` rows are removed.
- Company-level isolation is delegated to ERPNext `Company` User Permissions (above). Operators also need ERPNext read on `Company` (and, for sub-projects 2/3, roles to read/write Sales/Purchase Orders — specified there).

## Backend

No custom Python. The frontend uses Frappe's generic client API (already wrapped in `src/lib/api.ts`): `frappe.client.get_list` / `get` / `get_doc` / `save` / `set_value`, against `Company` and the canvas doctypes. ERPNext + Company User Permissions enforce access.

## Frontend (reuse the red theme + components)

Routes (in `App.tsx`, inside the existing shell/nav):
- `/` → **Companies** grid (replaces the ventures home)
- `/company/:name` → **CompanyDetail** (replaces VentureHub)
- `/canvas/:key/:company` → **CanvasEditor** (company-scoped; param renamed `venture`→`company`)

Screens:
- **Companies** (`src/pages/Companies.tsx`, replacing `Ventures.tsx`): `getList('Company', { fields: ['name','company_name','abbr','default_currency','country'], limit: 200 })` → a grid of company cards (name, abbr, currency·country, a building icon) → tap → `/company/:name`. Reuse the red cards/tiles + search/filter + nav/tab bar. Friendly empty state. **No create/rename here** (company creation deferred to ERPNext desk) — so the old create/rename sheets are removed.
- **CompanyDetail** (`src/pages/CompanyDetail.tsx`, replacing `VentureHub.tsx`): `getDoc('Company', name)` for the header (company_name, abbr, default_currency, country). A two-tab layout:
  - **Business Plan**: featured cards for **Value Proposition Canvas** and **Business Model Canvas**, then secondary cards for **SWOT** and **Empathy Map**; each links to `/canvas/<key>/<company>`.
  - **Operations**: a stub panel ("Sales & Purchase — coming next") with the tab structure that sub-projects 2 & 3 fill in.
- **CanvasEditor** (`src/canvas/CanvasEditor.tsx`): change the prop/param from `venture` to `company`; load via `getList(doctype, { filters: { company }, fields:['name'], limit:1 })` then `getDoc`; save `{ doctype, company, <section>:[…] }`. The sticky-note editing, save/dirty logic, aria-labels, and section layout are otherwise UNCHANGED.
- **Login** unchanged.
- `CANVAS_CONFIGS` (`src/canvas/configs.ts`): section fieldnames unchanged; the config drives the same four canvases. (Only the parent link field changed, not the sections.)

## Testing

- Update component tests venture→company: `Companies.test.tsx` (lists companies, tapping opens `/company/:name`), `CompanyDetail.test.tsx` (renders the company + the 4 business-plan canvas links + tab structure), `CanvasEditor.test.tsx` (company prop; save shape includes `company`). `api.test.ts` and `configs.test.ts` are unaffected.
- Remove the obsolete create/rename venture tests.
- **Live smoke** on `dev.vernon.id`: with the `Dev` company, insert + save a `Business Model Canvas` with `company = Dev` and a couple of `Entre Canvas Item` rows, read back, assert persistence, clean up.

## Out of scope (this sub-project)

- Sales operations (list + create Sales Orders) — sub-project 2.
- Purchase operations (list + create Purchase Orders) — sub-project 3.
- Creating ERPNext Companies from entre (deferred to ERPNext desk).
- Deleting the `Venture` doctype (left dormant).

## Verification

1. `bench --site dev.vernon.id migrate` clean; canvas doctypes now have a `company` Link (→ Company) and no `venture` field.
2. `/entre` serves; Home shows the `Dev` company; opening it shows the Business Plan tab with VPC/BMC featured + SWOT/Empathy; opening a canvas edits + saves items scoped to `Dev`; reload persists.
3. Component tests green; live smoke passes.
