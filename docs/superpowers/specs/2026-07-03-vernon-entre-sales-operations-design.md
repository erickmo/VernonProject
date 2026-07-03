# vernon_entre — Sales Operations (Sub-project 2 of 3)

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Depends on:** Sub-project 1 (Company Workspace) — CompanyDetail with a stubbed **Operations** tab, company-scoped canvases, generic `frappe.client` API in `src/lib/api.ts`, red theme. ERPNext v15 on `dev.vernon.id` (Company `Dev`; 7 Customers, 5 Items, 0 Sales Orders).

## Purpose

Fill the **Sales** half of a company's Operations tab: **list** the company's Sales Orders and **create** new ones (customer + item lines), saving as a Draft and **submitting** from the list/detail. All through ERPNext's generic API; ERPNext operator permissions enforce access. Purchase is Sub-project 3.

## Decisions (locked in brainstorming)

- **Draft, then submit**: create Sales Orders as Draft (docstatus 0); a **Submit** action on the list/detail submits (docstatus 1). No accidental committed orders; submit errors surface visibly.
- **Manual rate per line**: each item line is item + qty + rate (typed). No selling-price-list dependency; auto-pricing deferred.
- **Pick existing** Customers/Items (7/5 exist); no inline Customer/Item creation in this sub-project.
- **Operator model**: no custom Python — the frontend calls ERPNext's generic API with the user's session; the ERPNext **Sales User** role (read/create/submit Sales Order + read Customer/Item) governs access. Per-company visibility via the `company` filter + ERPNext Company User Permissions.

## Data / API

No new doctypes — uses ERPNext `Sales Order`, `Customer`, `Item`. Add one helper to `src/lib/api.ts`:
- `submitDoc<T>(doc): Promise<T>` → POST `frappe.client.submit` with `{ doc }` (submits a saved doc, docstatus → 1).

Operations (existing generic helpers + the new one):
- **List**: `getList('Sales Order', { filters: { company }, fields: ['name','customer','transaction_date','grand_total','status','docstatus'], limit: 100, order_by: 'creation desc' })`.
- **Create (Draft)**: `insertDoc({ doctype: 'Sales Order', company, customer, delivery_date, items: [{ item_code, qty, rate, delivery_date }] })` — set `delivery_date` on the header AND each item (ERPNext requires an item delivery date). `transaction_date` and `currency` default from the company.
- **Submit**: load with `getDoc('Sales Order', name)`, then `submitDoc(theDoc)`.
- **View**: `getDoc('Sales Order', name)`.
- **Pickers**: `getList('Customer', { fields: ['name','customer_name'], limit: 200 })`, `getList('Item', { fields: ['name','item_name','stock_uom'], limit: 200 })`.

Errors: the api wrapper throws on non-ok; create/submit failures show an in-app toast with the message (submit is the likely failure — ERPNext validation).

## Frontend (red theme; Operations tab in CompanyDetail)

- **CompanyDetail** Operations tab: replace the stub with `<SalesPanel company={name} />`.
- **`SalesPanel`** (`src/ops/SalesPanel.tsx`): a section header "Sales Orders" + a "+ New Sales Order" link to `/company/:name/sales/new`, and `<SalesList company />`.
- **`SalesList`** (`src/ops/SalesList.tsx`): loads the company's SOs; each row → customer · transaction_date · grand_total · a status pill (Draft/Submitted/Cancelled from docstatus); a **Submit** button on Draft rows (calls submit, then reloads); the row links to `/company/:name/sales/:so`. Empty state.
- **`SalesOrderForm`** (`src/pages/SalesOrderForm.tsx`, route `/company/:name/sales/new`): `<AppBar onBack title="New Sales Order" />`; a **Customer** picker (`<select>` from `getList('Customer')`, `aria-label="Customer"`), a **Delivery date** input (`type="date"`, `aria-label="Delivery date"`), and **item lines** — each line: an Item picker (`aria-label="Item"`), **Qty** (`aria-label="Qty"`), **Rate** (`aria-label="Rate"`), and a remove button; an "+ add line" control; a running **Total** = Σ(qty×rate); a **Save** button that builds the Draft payload, `insertDoc`s it, toasts, and navigates back to `/company/:name`. Guard: require a customer + at least one line with item+qty.
- **`SalesOrderDetail`** (`src/pages/SalesOrderDetail.tsx`, route `/company/:name/sales/:so`): `<AppBar onBack title={so.name} />`; `getDoc('Sales Order', :so)`; show customer, delivery date, item lines (item · qty · rate · amount), grand total, and a status pill; a **Submit** button if docstatus 0 (calls `submitDoc`, refreshes); toast on success/failure.
- Reuse red-theme components (AppBar, Button, Dialog, StatusPill, useToast, cards, inputs). New routes added to `App.tsx`.

## Permissions

Operators need the ERPNext **Sales User** role (read/create/submit `Sales Order`; read `Customer`/`Item`). Assigned per operator (operational — Administrator has it on dev). Per-company scoping comes from the `company` filter on lists + ERPNext Company User Permissions.

## Testing

- **Component (Vitest, mocked api):**
  - `SalesList` renders the company's SOs and a Submit button on a Draft row; clicking Submit calls `submitDoc` then reloads.
  - `SalesOrderForm` builds the correct `insertDoc` payload: `{ doctype:'Sales Order', company, customer, delivery_date, items:[{ item_code, qty, rate, delivery_date }] }` and blocks Save when no customer/line.
  - `SalesOrderDetail` shows the SO and (docstatus 0) a Submit calling `submitDoc`.
- **Live smoke** on `dev.vernon.id`: create a Draft Sales Order for `company='Dev'` with a real Customer + Item (qty/rate), read it back (docstatus 0), submit it (docstatus 1), then cancel + delete to clean up. Assert the flow.

## Out of scope (this sub-project)

- Purchase operations — Sub-project 3 (mirrors this).
- Inline Customer/Item creation; selling-price-list auto-pricing; editing or cancelling Sales Orders from entre (view + submit only).

## Verification

1. Operations tab shows the company's Sales Orders; "+ New Sales Order" opens the form.
2. Creating a Draft SO (customer + item lines) persists and appears in the list; Submit moves it to Submitted; totals correct.
3. Component tests green; live smoke (create→submit→cleanup) passes.
