# vernon_entre Purchase Operations (Sub-project 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror Sales for Purchase — list the company's ERPNext Purchase Orders and create Drafts (supplier + item lines, manual rate) submittable from the list/detail; add a Sales | Purchase toggle to the Operations tab.

**Architecture:** Same pattern as SP2 Sales. New pieces under `src/ops/` (PurchasePanel, PurchaseList) + two routed screens (PurchaseOrderForm, PurchaseOrderDetail). `submitDoc` already exists. CompanyDetail Operations tab gets a Sales|Purchase inner toggle. No custom Python; ERPNext Purchase User + Company User Permissions enforce.

**Tech Stack:** Vite+React+TS+Tailwind, Vitest; ERPNext v15 (Company `Dev`; 2 Suppliers, 5 Items).

## Global Constraints

- Draft-then-submit; manual rate per line; pick existing Supplier/Items; no custom Python.
- Create payload: `{ doctype:'Purchase Order', company, supplier, schedule_date, items:[{ item_code, qty, rate, schedule_date }] }` — `schedule_date` on header AND each item.
- Submit: `getDoc('Purchase Order', name)` then `submitDoc(theDoc)` (reuse the SP2 helper).
- Routes: `/company/:name/purchase/new` → PurchaseOrderForm; `/company/:name/purchase/:po` → PurchaseOrderDetail. Operations tab renders a Sales|Purchase toggle → `<SalesPanel>` or `<PurchasePanel>`.
- Keep all existing tests green under `tsc -b`. App repo `/home/frappe/frappe-bench/apps/vernon_entre`, branch develop. Reuse red-theme components + the SP2 Sales code as the template (substitute Purchase Order/Supplier/schedule_date).

---

### Task 1: PurchaseOrder types

**Files:** Modify `frontend-entre/src/lib/types.ts`

- [ ] **Step 1: Add types**
```ts
export interface PurchaseOrderItem { item_code: string; qty: number; rate: number; amount?: number; schedule_date?: string }
export interface PurchaseOrder { name: string; supplier: string; transaction_date?: string; schedule_date?: string; grand_total?: number; status?: string; docstatus?: number; items?: PurchaseOrderItem[] }
```
- [ ] **Step 2:** `npx tsc -b` → 0.
- [ ] **Step 3: Commit** `git -C /home/frappe/frappe-bench/apps/vernon_entre add frontend-entre/src/lib/types.ts && git commit -m "feat(web): PurchaseOrder types"`

---

### Task 2: PurchaseList + PurchasePanel

**Files:** Create `frontend-entre/src/ops/PurchaseList.tsx`, `src/ops/PurchasePanel.tsx`, `src/ops/PurchaseList.test.tsx`

**Interfaces:** Consumes `getList`/`getDoc`/`submitDoc`, `PurchaseOrder`, `useToast`, `Link`, `Button`, `StatusPill`.

- [ ] **Step 1: Failing test** `src/ops/PurchaseList.test.tsx` (mirror SalesList.test):
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getList: vi.fn(), getDoc: vi.fn(), submitDoc: vi.fn() }))
import { getList, getDoc, submitDoc } from '../lib/api'
import { PurchaseList } from './PurchaseList'

test('lists POs and submits a draft', async () => {
  ;(getList as any).mockResolvedValue([{ name: 'PO-0001', supplier: 'Globex', grand_total: 100, docstatus: 0, status: 'Draft' }])
  ;(getDoc as any).mockResolvedValue({ name: 'PO-0001', docstatus: 0 })
  ;(submitDoc as any).mockResolvedValue({ name: 'PO-0001', docstatus: 1 })
  render(<MemoryRouter><PurchaseList company="Dev" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('PO-0001')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(submitDoc).toHaveBeenCalled())
})
```
Run → FAIL.

- [ ] **Step 2: Implement `PurchaseList.tsx`** — copy SP2 `SalesList.tsx`, substitute: `SalesOrder`→`PurchaseOrder`, `'Sales Order'`→`'Purchase Order'`, `customer`→`supplier`, link `/company/${company}/sales/${so.name}`→`/company/${company}/purchase/${po.name}`, field `'customer'`→`'supplier'` in the fields array. Render `<toast.Host />` (a component) OUTSIDE the `<ul>` (in a fragment). Label helper + StatusPill same.

- [ ] **Step 3: Implement `PurchasePanel.tsx`** — copy `SalesPanel.tsx`, substitute title "Purchase Orders", link `/company/${company}/purchase/new`, "+ New Purchase Order", `<PurchaseList company={company} />`.

- [ ] **Step 4:** `npm test -- PurchaseList` → PASS; `npx tsc -b` → 0.
- [ ] **Step 5: Commit** `git -C … add frontend-entre/src/ops && git commit -m "feat(web): Purchase Orders list + panel"`

---

### Task 3: PurchaseOrderForm (create Draft)

**Files:** Create `frontend-entre/src/pages/PurchaseOrderForm.tsx`, `PurchaseOrderForm.test.tsx`; Modify `src/App.tsx` (route).

- [ ] **Step 1: Failing test** `src/pages/PurchaseOrderForm.test.tsx` (mirror SalesOrderForm.test):
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getList: vi.fn(), insertDoc: vi.fn() }))
import { getList, insertDoc } from '../lib/api'
import PurchaseOrderForm from './PurchaseOrderForm'

test('builds a draft Purchase Order payload', async () => {
  ;(getList as any).mockImplementation((dt: string) =>
    Promise.resolve(dt === 'Supplier' ? [{ name: 'Globex', supplier_name: 'Globex' }] : [{ name: 'ITEM-1', item_name: 'Widget' }]))
  ;(insertDoc as any).mockResolvedValue({ name: 'PO-0001' })
  render(<MemoryRouter initialEntries={['/company/Dev/purchase/new']}><Routes><Route path="/company/:name/purchase/new" element={<PurchaseOrderForm />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument())
  fireEvent.change(screen.getByLabelText(/supplier/i), { target: { value: 'Globex' } })
  fireEvent.change(screen.getByLabelText(/required by date/i), { target: { value: '2026-08-01' } })
  fireEvent.change(screen.getByLabelText(/item/i), { target: { value: 'ITEM-1' } })
  fireEvent.change(screen.getByLabelText(/qty/i), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText(/rate/i), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(insertDoc).toHaveBeenCalledWith(expect.objectContaining({
    doctype: 'Purchase Order', company: 'Dev', supplier: 'Globex', schedule_date: '2026-08-01',
    items: [expect.objectContaining({ item_code: 'ITEM-1', qty: 3, rate: 10, schedule_date: '2026-08-01' })],
  })))
})
```
Run → FAIL.

- [ ] **Step 2: Implement `PurchaseOrderForm.tsx`** — copy SP2 `SalesOrderForm.tsx`, substitute: title "New Purchase Order"; state `customer`→`supplier`; `customers`→`suppliers` from `getList('Supplier', { fields:['name','supplier_name'], limit:200 })`; the customer `<select>` label/aria "Customer"→"Supplier" and options use `s.supplier_name`; `deliveryDate`→`requiredBy`, its input `aria-label="Required by date"`; the insert payload `{ doctype:'Purchase Order', company, supplier, schedule_date: requiredBy, items: valid.map(l => ({ item_code, qty, rate, schedule_date: requiredBy })) }`; nav back `/company/${company}`. Item lines + qty + rate + total unchanged. Guard: supplier + ≥1 line.

- [ ] **Step 3: Route** in `src/App.tsx`: `<Route path="/company/:name/purchase/new" element={<PurchaseOrderForm />} />` + import.
- [ ] **Step 4:** `npm test -- PurchaseOrderForm` → PASS; `tsc -b` → 0.
- [ ] **Step 5: Commit** `git -C … add frontend-entre/src/pages/PurchaseOrderForm.tsx frontend-entre/src/pages/PurchaseOrderForm.test.tsx frontend-entre/src/App.tsx && git commit -m "feat(web): New Purchase Order form (draft)"`

---

### Task 4: PurchaseOrderDetail (view + submit)

**Files:** Create `frontend-entre/src/pages/PurchaseOrderDetail.tsx`, `PurchaseOrderDetail.test.tsx`; Modify `src/App.tsx` (route).

- [ ] **Step 1: Failing test** `src/pages/PurchaseOrderDetail.test.tsx` (mirror SalesOrderDetail.test):
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getDoc: vi.fn(), submitDoc: vi.fn() }))
import { getDoc, submitDoc } from '../lib/api'
import PurchaseOrderDetail from './PurchaseOrderDetail'

test('shows the PO and submits a draft', async () => {
  ;(getDoc as any).mockResolvedValue({ name: 'PO-0001', supplier: 'Globex', grand_total: 30, docstatus: 0, items: [{ item_code: 'ITEM-1', qty: 3, rate: 10, amount: 30 }] })
  ;(submitDoc as any).mockResolvedValue({ name: 'PO-0001', docstatus: 1 })
  render(<MemoryRouter initialEntries={['/company/Dev/purchase/PO-0001']}><Routes><Route path="/company/:name/purchase/:po" element={<PurchaseOrderDetail />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('PO-0001')).toBeInTheDocument())
  expect(screen.getByText(/Globex/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(submitDoc).toHaveBeenCalled())
})
```
Run → FAIL.

- [ ] **Step 2: Implement `PurchaseOrderDetail.tsx`** — copy SP2 `SalesOrderDetail.tsx`, substitute: `PurchaseOrder` type, `'Purchase Order'`, param `so`→`po` (from `/company/:name/purchase/:po`), back nav `/company/${company}`, show `doc.supplier` (label "Supplier"). Items/total/submit identical.
- [ ] **Step 3: Route** in `src/App.tsx`: `<Route path="/company/:name/purchase/:po" element={<PurchaseOrderDetail />} />`.
- [ ] **Step 4:** `npm test -- PurchaseOrderDetail` → PASS; `tsc -b` → 0; full `npm test` green.
- [ ] **Step 5: Commit** `git -C … add frontend-entre/src/pages/PurchaseOrderDetail.tsx frontend-entre/src/pages/PurchaseOrderDetail.test.tsx frontend-entre/src/App.tsx && git commit -m "feat(web): Purchase Order detail + submit"`

---

### Task 5: Operations Sales|Purchase toggle + build + deploy + live smoke

**Files:** Modify `frontend-entre/src/pages/CompanyDetail.tsx`.

- [ ] **Step 1: Add a Sales|Purchase toggle to the Operations tab**

In `CompanyDetail.tsx`, where the Operations tab currently renders `<SalesPanel company={c.name} />`, add local state `const [op, setOp] = useState<'sales'|'purchase'>('sales')` and render a small segmented control (two `press` pill buttons, active = `bg-brand-500 text-white`, else `bg-surface border border-line`) above the panel; render `op === 'sales' ? <SalesPanel company={c.name} /> : <PurchasePanel company={c.name} />` (import `PurchasePanel` from `../ops/PurchasePanel`). Keep the Business Plan tab + outer tab structure unchanged.

- [ ] **Step 2: Full suite + build**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre/frontend-entre && npm test && npm run build
cd /home/frappe/frappe-bench && bench build --app vernon_entre && bench --site dev.vernon.id clear-cache
```

- [ ] **Step 3: Live smoke — Draft PO → submit → cleanup** (`bench --site dev.vernon.id console < po_smoke.py`, no for-loops):
```python
import frappe
supp = frappe.get_all("Supplier", limit=1, pluck="name")[0]
items = frappe.get_all("Item", filters={"is_purchase_item": 1}, limit=1, pluck="name") or frappe.get_all("Item", limit=1, pluck="name")
item = items[0]
sd = frappe.utils.add_days(frappe.utils.nowdate(), 7)
po = frappe.get_doc({"doctype": "Purchase Order", "company": "Dev", "supplier": supp, "schedule_date": sd,
                     "items": [{"item_code": item, "qty": 2, "rate": 10, "schedule_date": sd}]}).insert()
print("DRAFT", po.name, "docstatus", po.docstatus)
try:
    po.submit(); po.reload(); print("SUBMITTED docstatus", po.docstatus); po.cancel()
except Exception as e:
    print("SUBMIT_ERR:", str(e)[:300])
frappe.delete_doc("Purchase Order", po.name, force=1); frappe.db.commit()
print("PO smoke done:", supp, item)
```
Expected: `DRAFT … docstatus 0`, `SUBMITTED docstatus 1`, `PO smoke done`. If submit raises an ERPNext validation, capture it and fold the required field into the form + payload.

- [ ] **Step 4: Serve check** `curl -sk -o /dev/null -w "%{http_code}\n" https://dev.vernon.id/entre` → 200. Manual: `Dev` → Operations → Purchase toggle → list + New Purchase Order.

- [ ] **Step 5: Commit built assets**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add frontend-entre/src/pages/CompanyDetail.tsx vernon_entre/vernon_entre/www vernon_entre/vernon_entre/public/frontend_entre
git commit -m "feat(web): Operations Sales|Purchase toggle + built assets"
```
Report: purchase list/create/submit working, smoke result — Operations tab now complete (Sales + Purchase).

---

## Notes
- If PO submit needs a field the draft omits, the live smoke surfaces the exact validation — fold it into the form + payload and re-verify.
- With SP3 the 3-sub-project company workspace is complete: business plan (VPC/BMC) + operations (Sales + Purchase) per company.
