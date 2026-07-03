# vernon_entre Sales Operations (Sub-project 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Sales half of a company's Operations tab — list the company's ERPNext Sales Orders and create Drafts (customer + item lines, manual rate) that can be submitted from the list/detail.

**Architecture:** Generic ERPNext API via the existing `src/lib/api.ts` (add a `submitDoc` helper). New frontend pieces under `src/ops/` (SalesPanel, SalesList) + two routed screens (SalesOrderForm, SalesOrderDetail). CompanyDetail's Operations tab renders `<SalesPanel>`. Red theme + existing components reused. No custom Python; ERPNext Sales User + Company User Permissions enforce access.

**Tech Stack:** Vite+React+TS+Tailwind, Vitest; ERPNext v15 on dev.vernon.id (Company `Dev`; 7 Customers, 5 Items).

## Global Constraints

- Draft-then-submit: create Sales Orders as Draft (docstatus 0); Submit action (docstatus 1) on list/detail. Manual rate per line. Pick existing Customers/Items (no inline create). No custom Python.
- Sales Order create payload: `{ doctype:'Sales Order', company, customer, delivery_date, items:[{ item_code, qty, rate, delivery_date }] }` — delivery_date on header AND each item.
- Submit: `getDoc('Sales Order', name)` then `submitDoc(theDoc)` (POST `frappe.client.submit`).
- Routes: `/company/:name/sales/new` → SalesOrderForm; `/company/:name/sales/:so` → SalesOrderDetail. Operations tab in CompanyDetail renders `<SalesPanel company={name} />`.
- Keep all existing tests green under `tsc -b`. App repo `/home/frappe/frappe-bench/apps/vernon_entre`, branch develop. Build/verify on dev.vernon.id. Reuse red-theme components (AppBar, Button, Dialog, StatusPill, useToast).

---

### Task 1: `submitDoc` API helper + SalesOrder types

**Files:**
- Modify: `frontend-entre/src/lib/api.ts`, `frontend-entre/src/lib/api.test.ts`, `frontend-entre/src/lib/types.ts`

**Interfaces:**
- Produces: `submitDoc<T>(doc): Promise<T>`; types `SalesOrder { name: string; customer: string; transaction_date?: string; grand_total?: number; status?: string; docstatus?: number }`, `SalesOrderItem { item_code: string; qty: number; rate: number; amount?: number; delivery_date?: string }`.

- [ ] **Step 1: Write the failing test** — in `src/lib/api.test.ts` add:
```ts
import { submitDoc } from './api'
it('submitDoc POSTs frappe.client.submit with CSRF + same-origin', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: { name: 'SO-0001', docstatus: 1 } }) })
  vi.stubGlobal('fetch', f); (window as any).csrf_token = 'tok'
  const out = await submitDoc({ doctype: 'Sales Order', name: 'SO-0001' })
  expect(out).toEqual({ name: 'SO-0001', docstatus: 1 })
  const [url, opts] = f.mock.calls[0]
  expect(url).toContain('/api/method/frappe.client.submit')
  expect((opts as any).method).toBe('POST')
  expect((opts as any).headers['X-Frappe-CSRF-Token']).toBe('tok')
})
```
Run `npm test -- api.test` → FAIL (no submitDoc).

- [ ] **Step 2: Implement** — in `src/lib/api.ts` add next to the other exports:
```ts
export const submitDoc = <T = any>(doc: any): Promise<T> => post('frappe.client.submit', { doc })
```
And in `src/lib/types.ts`:
```ts
export interface SalesOrderItem { item_code: string; qty: number; rate: number; amount?: number; delivery_date?: string }
export interface SalesOrder { name: string; customer: string; transaction_date?: string; delivery_date?: string; grand_total?: number; status?: string; docstatus?: number; items?: SalesOrderItem[] }
```

- [ ] **Step 3: Run** `npm test -- api.test` → PASS. `npx tsc -b` → 0.

- [ ] **Step 4: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add frontend-entre/src/lib
git commit -m "feat(web): submitDoc api helper + SalesOrder types"
```

---

### Task 2: SalesList + SalesPanel, wired into the Operations tab

**Files:**
- Create: `frontend-entre/src/ops/SalesList.tsx`, `frontend-entre/src/ops/SalesPanel.tsx`, `frontend-entre/src/ops/SalesList.test.tsx`
- Modify: `frontend-entre/src/pages/CompanyDetail.tsx` (Operations tab → `<SalesPanel company={name} />`)

**Interfaces:**
- Consumes: `getList`, `getDoc`, `submitDoc`, `SalesOrder` type, `useToast`, `Link`.
- Produces: `<SalesPanel company: string />`, `<SalesList company: string />`.

- [ ] **Step 1: Failing test** `src/ops/SalesList.test.tsx`:
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getList: vi.fn(), getDoc: vi.fn(), submitDoc: vi.fn() }))
import { getList, getDoc, submitDoc } from '../lib/api'
import { SalesList } from './SalesList'

test('lists SOs and submits a draft', async () => {
  ;(getList as any).mockResolvedValue([{ name: 'SO-0001', customer: 'Acme', grand_total: 100, docstatus: 0, status: 'Draft' }])
  ;(getDoc as any).mockResolvedValue({ name: 'SO-0001', docstatus: 0 })
  ;(submitDoc as any).mockResolvedValue({ name: 'SO-0001', docstatus: 1 })
  render(<MemoryRouter><SalesList company="Dev" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('SO-0001')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(submitDoc).toHaveBeenCalled())
})
```
Run → FAIL.

- [ ] **Step 2: Implement `SalesList.tsx`**
```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getList, getDoc, submitDoc } from '../lib/api'
import type { SalesOrder } from '../lib/types'
import { Button } from '../ui/Button'
import { StatusPill } from '../ui/StatusPill'
import { useToast } from '../ui/Toast'

const label = (d?: number) => (d === 1 ? 'Submitted' : d === 2 ? 'Cancelled' : 'Draft')

export function SalesList({ company }: { company: string }) {
  const [rows, setRows] = useState<SalesOrder[]>([])
  const toast = useToast()
  const load = () => getList<SalesOrder>('Sales Order', {
    filters: { company }, fields: ['name', 'customer', 'transaction_date', 'grand_total', 'status', 'docstatus'], limit: 100, order_by: 'creation desc',
  }).then(setRows)
  useEffect(() => { load() }, [company])
  const submit = async (name: string) => {
    try { const d = await getDoc('Sales Order', name); await submitDoc(d); toast.show('Submitted', 'ok'); load() }
    catch { toast.show('Submit failed', 'error') }
  }
  if (rows.length === 0) return <p className="text-ink-2 text-sm py-8 text-center">No sales orders yet.</p>
  return (
    <ul className="space-y-2">
      {rows.map(so => (
        <li key={so.name} className="rounded-xl2 bg-surface border border-line shadow-card p-4 flex items-center justify-between gap-2">
          <Link to={`/company/${company}/sales/${so.name}`} className="flex-1 min-w-0">
            <p className="font-display font-semibold text-ink">{so.name}</p>
            <p className="text-sm text-ink-2 truncate">{so.customer} · {so.grand_total ?? 0}</p>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={label(so.docstatus) as any} />
            {so.docstatus === 0 && <Button onClick={() => submit(so.name)}>Submit</Button>}
          </div>
        </li>
      ))}
      {toast.Host}
    </ul>
  )
}
```
(If `StatusPill`'s prop type is a union that doesn't include these labels, pass a plain colored pill instead — keep the label text.)

- [ ] **Step 3: Implement `SalesPanel.tsx`**
```tsx
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { SalesList } from './SalesList'

export function SalesPanel({ company }: { company: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-ink">Sales Orders</h3>
        <Link to={`/company/${company}/sales/new`} className="press inline-flex items-center gap-1 rounded-pill bg-brand-500 text-white text-sm font-display font-semibold px-3 py-1.5">
          <Plus size={16} /> New Sales Order
        </Link>
      </div>
      <SalesList company={company} />
    </div>
  )
}
```

- [ ] **Step 4: Wire into CompanyDetail** — in `src/pages/CompanyDetail.tsx`, replace the Operations stub content with `<SalesPanel company={c.name} />` (import it). Keep the tab structure + Business Plan tab unchanged.

- [ ] **Step 5: Run** `npm test -- SalesList` → PASS; `npx tsc -b` → 0.

- [ ] **Step 6: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add frontend-entre/src/ops frontend-entre/src/pages/CompanyDetail.tsx
git commit -m "feat(web): Sales Orders list + panel in Operations tab"
```

---

### Task 3: SalesOrderForm (create Draft)

**Files:**
- Create: `frontend-entre/src/pages/SalesOrderForm.tsx`, `frontend-entre/src/pages/SalesOrderForm.test.tsx`
- Modify: `frontend-entre/src/App.tsx` (route `/company/:name/sales/new`)

**Interfaces:**
- Consumes: `getList` (Customer, Item), `insertDoc`, `useToast`, `useParams`/`useNavigate`, `AppBar`, `Button`.
- Produces: route screen that inserts a Draft Sales Order.

- [ ] **Step 1: Failing test** `src/pages/SalesOrderForm.test.tsx`:
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getList: vi.fn(), insertDoc: vi.fn() }))
import { getList, insertDoc } from '../lib/api'
import SalesOrderForm from './SalesOrderForm'

test('builds a draft Sales Order payload', async () => {
  ;(getList as any).mockImplementation((dt: string) =>
    Promise.resolve(dt === 'Customer' ? [{ name: 'Acme', customer_name: 'Acme' }] : [{ name: 'ITEM-1', item_name: 'Widget' }]))
  ;(insertDoc as any).mockResolvedValue({ name: 'SO-0001' })
  render(<MemoryRouter initialEntries={['/company/Dev/sales/new']}><Routes><Route path="/company/:name/sales/new" element={<SalesOrderForm />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText(/customer/i)).toBeInTheDocument())
  fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: 'Acme' } })
  fireEvent.change(screen.getByLabelText(/delivery date/i), { target: { value: '2026-08-01' } })
  fireEvent.change(screen.getByLabelText(/item/i), { target: { value: 'ITEM-1' } })
  fireEvent.change(screen.getByLabelText(/qty/i), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText(/rate/i), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(insertDoc).toHaveBeenCalledWith(expect.objectContaining({
    doctype: 'Sales Order', company: 'Dev', customer: 'Acme', delivery_date: '2026-08-01',
    items: [expect.objectContaining({ item_code: 'ITEM-1', qty: 3, rate: 10, delivery_date: '2026-08-01' })],
  })))
})
```
Run → FAIL.

- [ ] **Step 2: Implement `SalesOrderForm.tsx`**
```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getList, insertDoc } from '../lib/api'
import { AppBar } from '../ui/AppBar'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

type Line = { item_code: string; qty: number; rate: number }
const sel = 'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm'

export default function SalesOrderForm() {
  const { name: company = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [customers, setCustomers] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [customer, setCustomer] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_code: '', qty: 1, rate: 0 }])
  useEffect(() => {
    getList('Customer', { fields: ['name', 'customer_name'], limit: 200 }).then(setCustomers)
    getList('Item', { fields: ['name', 'item_name'], limit: 200 }).then(setItems)
  }, [])
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const save = async () => {
    const valid = lines.filter(l => l.item_code && l.qty > 0)
    if (!customer || valid.length === 0) { toast.show('Pick a customer and at least one item', 'error'); return }
    try {
      await insertDoc({ doctype: 'Sales Order', company, customer, delivery_date: deliveryDate,
        items: valid.map(l => ({ item_code: l.item_code, qty: l.qty, rate: l.rate, delivery_date: deliveryDate })) })
      toast.show('Draft saved', 'ok'); nav(`/company/${company}`)
    } catch { toast.show('Could not save', 'error') }
  }
  return (
    <>
      <AppBar onBack={() => nav(`/company/${company}`)} title="New Sales Order" />
      <div className="px-4 pt-4 pb-24 md:pb-8 space-y-3 max-w-xl mx-auto">
        <label className="block text-sm">Customer
          <select aria-label="Customer" className={sel} value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">Select…</option>
            {customers.map(c => <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Delivery date
          <input aria-label="Delivery date" type="date" className={sel} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
        </label>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label="Item" className={sel} value={l.item_code} onChange={e => setLine(i, { item_code: e.target.value })}>
                <option value="">Item…</option>
                {items.map(it => <option key={it.name} value={it.name}>{it.item_name || it.name}</option>)}
              </select>
              <input aria-label="Qty" type="number" className={`${sel} w-20`} value={l.qty} onChange={e => setLine(i, { qty: Number(e.target.value) })} />
              <input aria-label="Rate" type="number" className={`${sel} w-24`} value={l.rate} onChange={e => setLine(i, { rate: Number(e.target.value) })} />
              <button aria-label="Remove line" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="press px-2 text-ink-2">✕</button>
            </div>
          ))}
          <button onClick={() => setLines(ls => [...ls, { item_code: '', qty: 1, rate: 0 }])} className="press text-sm text-brand-600">+ add line</button>
        </div>
        <p className="text-right font-display font-semibold">Total: {total}</p>
        <Button onClick={save}>Save</Button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add route** in `src/App.tsx`: `<Route path="/company/:name/sales/new" element={<SalesOrderForm />} />` (import it). Keep other routes.

- [ ] **Step 4: Run** `npm test -- SalesOrderForm` → PASS; `npx tsc -b` → 0.

- [ ] **Step 5: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add frontend-entre/src/pages/SalesOrderForm.tsx frontend-entre/src/pages/SalesOrderForm.test.tsx frontend-entre/src/App.tsx
git commit -m "feat(web): New Sales Order form (draft)"
```

---

### Task 4: SalesOrderDetail (view + submit)

**Files:**
- Create: `frontend-entre/src/pages/SalesOrderDetail.tsx`, `frontend-entre/src/pages/SalesOrderDetail.test.tsx`
- Modify: `frontend-entre/src/App.tsx` (route `/company/:name/sales/:so`)

**Interfaces:**
- Consumes: `getDoc`, `submitDoc`, `SalesOrder` type, `AppBar`, `Button`, `StatusPill`, `useToast`.

- [ ] **Step 1: Failing test** `src/pages/SalesOrderDetail.test.tsx`:
```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getDoc: vi.fn(), submitDoc: vi.fn() }))
import { getDoc, submitDoc } from '../lib/api'
import SalesOrderDetail from './SalesOrderDetail'

test('shows the SO and submits a draft', async () => {
  ;(getDoc as any).mockResolvedValue({ name: 'SO-0001', customer: 'Acme', grand_total: 30, docstatus: 0, items: [{ item_code: 'ITEM-1', qty: 3, rate: 10, amount: 30 }] })
  ;(submitDoc as any).mockResolvedValue({ name: 'SO-0001', docstatus: 1 })
  render(<MemoryRouter initialEntries={['/company/Dev/sales/SO-0001']}><Routes><Route path="/company/:name/sales/:so" element={<SalesOrderDetail />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('SO-0001')).toBeInTheDocument())
  expect(screen.getByText(/Acme/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(submitDoc).toHaveBeenCalled())
})
```
Run → FAIL.

- [ ] **Step 2: Implement `SalesOrderDetail.tsx`**
```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDoc, submitDoc } from '../lib/api'
import type { SalesOrder } from '../lib/types'
import { AppBar } from '../ui/AppBar'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

export default function SalesOrderDetail() {
  const { name: company = '', so = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<SalesOrder | null>(null)
  const load = () => getDoc<SalesOrder>('Sales Order', so).then(setDoc)
  useEffect(() => { if (so) load() }, [so])
  if (!doc) return <div className="p-6">Loading…</div>
  const submit = async () => {
    try { await submitDoc(doc); toast.show('Submitted', 'ok'); load() }
    catch { toast.show('Submit failed', 'error') }
  }
  return (
    <>
      <AppBar onBack={() => nav(`/company/${company}`)} title={doc.name} />
      <div className="px-4 pt-4 pb-24 md:pb-8 max-w-xl mx-auto space-y-3">
        <p className="text-sm text-ink-2">Customer: <span className="text-ink font-medium">{doc.customer}</span></p>
        <ul className="rounded-xl2 bg-surface border border-line divide-y divide-line">
          {(doc.items ?? []).map((it, i) => (
            <li key={i} className="flex justify-between p-3 text-sm">
              <span>{it.item_code} × {it.qty}</span><span>{it.amount ?? it.qty * it.rate}</span>
            </li>
          ))}
        </ul>
        <p className="text-right font-display font-semibold">Total: {doc.grand_total ?? 0}</p>
        {doc.docstatus === 0
          ? <Button onClick={submit}>Submit</Button>
          : <p className="text-sm text-ink-2">Status: {doc.docstatus === 2 ? 'Cancelled' : 'Submitted'}</p>}
        {toast.Host}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add route** in `src/App.tsx`: `<Route path="/company/:name/sales/:so" element={<SalesOrderDetail />} />`.

- [ ] **Step 4: Run** `npm test -- SalesOrderDetail` → PASS; `npx tsc -b` → 0; full `npm test` green.

- [ ] **Step 5: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add frontend-entre/src/pages/SalesOrderDetail.tsx frontend-entre/src/pages/SalesOrderDetail.test.tsx frontend-entre/src/App.tsx
git commit -m "feat(web): Sales Order detail + submit"
```

---

### Task 5: Build, deploy, live smoke

**Files:** none (integration).

- [ ] **Step 1: Full suite + build**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre/frontend-entre && npm test && npm run build
cd /home/frappe/frappe-bench && bench build --app vernon_entre && bench --site dev.vernon.id clear-cache
```

- [ ] **Step 2: Live smoke — create Draft SO → submit → cleanup**

Write to a scratch file and run `bench --site dev.vernon.id console < so_smoke.py` (no for-loops). Uses a real Customer + Item:
```python
import frappe
cust = frappe.get_all("Customer", limit=1, pluck="name")[0]
item = frappe.get_all("Item", filters={"is_sales_item": 1}, limit=1, pluck="name") or frappe.get_all("Item", limit=1, pluck="name")
item = item[0]
so = frappe.get_doc({"doctype": "Sales Order", "company": "Dev", "customer": cust,
                     "delivery_date": frappe.utils.add_days(frappe.utils.nowdate(), 7),
                     "items": [{"item_code": item, "qty": 2, "rate": 10,
                                "delivery_date": frappe.utils.add_days(frappe.utils.nowdate(), 7)}]}).insert()
assert so.docstatus == 0, so.docstatus
so.submit()
so.reload()
assert so.docstatus == 1, so.docstatus
so.cancel(); frappe.delete_doc("Sales Order", so.name, force=1); frappe.db.commit()
print("SO smoke ok:", cust, item)
```
Expected: `SO smoke ok: …`. (If submit raises an ERPNext validation, capture the message — it informs whether the create payload needs more fields; adjust the form/spec if so.)

- [ ] **Step 3: Serve check** `curl -sk -o /dev/null -w "%{http_code}\n" https://dev.vernon.id/entre` → 200. Manual: open `Dev` → Operations tab → Sales Orders list + "New Sales Order" form works; create a draft, submit it.

- [ ] **Step 4: Commit built assets**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/www vernon_entre/vernon_entre/public/frontend_entre
git commit -m "chore(web): built sales-operations assets"
```
Report: list/create/submit working, smoke result, and that Purchase (SP3) mirrors this.

---

## Notes
- If the ERPNext Sales Order submit needs fields the draft omits (e.g. a warehouse or a selling price list on the item), the live smoke will surface the exact validation — fold the required field into the form + payload and re-verify.
- SP3 (Purchase) mirrors this with `Purchase Order` / `Supplier` / `schedule_date` (instead of delivery_date).
