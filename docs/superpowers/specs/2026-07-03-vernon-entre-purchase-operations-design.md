# vernon_entre — Purchase Operations (Sub-project 3 of 3)

**Date:** 2026-07-03
**Status:** Approved (mirrors the approved Sales design), pending implementation plan
**Depends on:** Sub-project 2 (Sales Operations) — the Operations tab, `submitDoc` in `src/lib/api.ts`, and the SalesList/SalesPanel/SalesOrderForm/SalesOrderDetail pattern. ERPNext v15 on `dev.vernon.id` (Company `Dev`; 2 Suppliers, 5 Items, 5 Purchase Orders exist).

## Purpose

Mirror Sales for the **Purchase** half of a company's Operations tab: **list** the company's Purchase Orders and **create** Drafts (supplier + item lines, manual rate), submittable from the list/detail. Same generic-API, draft-then-submit, operator-permission model as Sales. This completes the Operations tab.

## Decisions (identical to Sales, mirrored)

- Draft-then-submit (docstatus 0 → 1); manual rate per line; pick existing **Supplier**/Items (no inline create); no custom Python — generic ERPNext API; ERPNext **Purchase User** role + Company User Permissions enforce.
- The Operations tab gains a **Sales | Purchase** inner toggle: Sales shows the SP2 `SalesPanel`; Purchase shows the new `PurchasePanel`.

## Differences from Sales (the only deltas)

| Sales (SP2) | Purchase (SP3) |
|---|---|
| `Sales Order` | `Purchase Order` |
| `Customer` (`customer`) | `Supplier` (`supplier`) |
| `delivery_date` (header + item) | `schedule_date` (header + item; "Required By") |
| route `/company/:name/sales/*` | route `/company/:name/purchase/*` |

`submitDoc`, the item shape (`item_code`, `qty`, `rate`), totals, and the ERPNext generic calls are the same.

## Data / API (generic, reuse)

- **List**: `getList('Purchase Order', { filters:{ company }, fields:['name','supplier','transaction_date','grand_total','status','docstatus'], limit:100, order_by:'creation desc' })`.
- **Create (Draft)**: `insertDoc({ doctype:'Purchase Order', company, supplier, schedule_date, items:[{ item_code, qty, rate, schedule_date }] })` — `schedule_date` on header AND each item.
- **Submit**: `getDoc('Purchase Order', name)` then `submitDoc(theDoc)`.
- **View**: `getDoc('Purchase Order', name)`.
- **Picker**: `getList('Supplier', { fields:['name','supplier_name'], limit:200 })`; Items via the existing `getList('Item', …)`.
- Types: `PurchaseOrder { name, supplier, transaction_date?, schedule_date?, grand_total?, status?, docstatus?, items? }`, `PurchaseOrderItem { item_code, qty, rate, amount?, schedule_date? }` in `types.ts`.

## Frontend (red theme; mirror Sales)

- **CompanyDetail** Operations tab: add a small **Sales | Purchase** segmented control; render `<SalesPanel company/>` or `<PurchasePanel company/>`.
- **`PurchasePanel`** (`src/ops/PurchasePanel.tsx`): "Purchase Orders" header + "+ New Purchase Order" → `/company/:name/purchase/new`, and `<PurchaseList company/>`.
- **`PurchaseList`** (`src/ops/PurchaseList.tsx`): the company's POs (supplier · date · grand_total · status pill; **Submit** on Drafts; row → `/company/:name/purchase/:po`). Empty state.
- **`PurchaseOrderForm`** (`src/pages/PurchaseOrderForm.tsx`, route `/company/:name/purchase/new`): AppBar back; **Supplier** picker (`aria-label="Supplier"`), **Required-by date** (`type="date"`, `aria-label="Required by date"`), item lines (Item picker + Qty + Rate, add/remove, running total), **Save** → `insertDoc` Draft PO → back. Guard: supplier + ≥1 item line.
- **`PurchaseOrderDetail`** (`src/pages/PurchaseOrderDetail.tsx`, route `/company/:name/purchase/:po`): getDoc; supplier, lines, total, status pill; **Submit** if docstatus 0.
- Reuse red-theme components + `submitDoc`. New routes in `App.tsx`.

## Permissions

Operators need the ERPNext **Purchase User** role (read/create/submit `Purchase Order`; read `Supplier`/`Item`). Assigned per operator (Administrator has it on dev). Per-company scoping via the `company` filter + Company User Permissions.

## Testing

- **Component (Vitest, mocked api):** `PurchaseList` renders POs + Submit calls `submitDoc`; `PurchaseOrderForm` builds `{ doctype:'Purchase Order', company, supplier, schedule_date, items:[{ item_code, qty, rate, schedule_date }] }` and blocks Save when no supplier/line; `PurchaseOrderDetail` shows the PO + (docstatus 0) Submit.
- **Live smoke** on `dev.vernon.id`: create a Draft PO for `company='Dev'` with a real Supplier + Item, read back (docstatus 0), submit (docstatus 1), cancel + delete.

## Out of scope

Inline Supplier/Item creation; buying-price auto-pricing; editing/cancelling POs from entre (view + submit only).

## Verification

1. Operations tab has a Sales | Purchase toggle; Purchase lists the company's POs; "+ New Purchase Order" opens the form.
2. Creating a Draft PO persists + lists; Submit moves it to Submitted; totals correct.
3. Component tests green; live smoke (create→submit→cleanup) passes.
