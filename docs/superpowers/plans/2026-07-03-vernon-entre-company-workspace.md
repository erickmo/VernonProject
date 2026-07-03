# vernon_entre Company Workspace (Sub-project 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot vernon_entre from student ventures to operator **companies** — a homepage grid of ERPNext Companies, a CompanyDetail with a Business Plan tab (VPC/BMC featured + SWOT/Empathy) and an Operations stub, with the four canvases re-linked from `venture` to an ERPNext `Company`.

**Architecture:** Backend: re-link the canvas doctypes' parent field `venture`→`company` (Link→ERPNext `Company`) via a dev-mode DocType edit + migrate; add an `Entre Operator` role; per-company visibility comes from ERPNext Company User Permissions (no custom Python). Frontend: replace the venture Home/Hub with a Companies grid + CompanyDetail (tabs), company-scope the CanvasEditor, all on the existing red theme + components. Generic `frappe.client` API throughout.

**Tech Stack:** Frappe/ERPNext v15 (dev.vernon.id), Vite+React+TS+Tailwind, Vitest.

## Global Constraints

- Company = ERPNext `Company`. Operator model (no `if_owner`); per-company scoping via ERPNext `Company` User Permissions on the canvases' `company` Link field (leave `ignore_user_permissions` unset).
- Canvas doctypes SWOT / Business Model Canvas / Value Proposition Canvas / Empathy Map: parent field is `company` (Link → `Company`, reqd); `title_field = company`; section tables (`Entre Canvas Item`) UNCHANGED.
- Role on canvases: exactly `Entre Operator` (read/write/create/delete/print/export) + `System Manager` (full). Remove the old `Entre Student` `if_owner` rows.
- Frontend routes: `/` → Companies grid; `/company/:name` → CompanyDetail; `/canvas/:key/:company` → CanvasEditor.
- Company creation is OUT of scope (deferred to ERPNext desk). No custom Python. Keep all frontend tests green under `tsc -b`.
- Build/verify site: `dev.vernon.id` (Company `Dev` exists). App repo `/home/frappe/frappe-bench/apps/vernon_entre`, branch `develop`. Reuse the red theme + existing UI components; VISUAL/behaviour of the canvas editor otherwise unchanged.

---

### Task 1: Backend — re-link canvases to Company + Entre Operator role + migrate

**Files:**
- Modify (via dev-mode export): `vernon_entre/vernon_entre/doctype/{swot,business_model_canvas,value_proposition_canvas,empathy_map}/*.json`
- Modify: `vernon_entre/vernon_entre/doctype/venture/test_venture.py` (neuter the retired end-to-end test)

**Interfaces:**
- Produces: canvas doctypes with a `company` Link→Company (reqd) parent field, `title_field=company`, operator perms. Role `Entre Operator`. The frontend (Task 2) filters/saves canvases by `company`.

- [ ] **Step 1: Recheck git state + verify ERPNext Company + existing canvas doc counts**

Run (from `/home/frappe/frappe-bench`):
```bash
git -C apps/vernon_entre status --short | head
bench --site dev.vernon.id execute frappe.db.exists --args "['Company','Dev']"
bench --site dev.vernon.id execute frappe.db.sql --args "['SELECT (SELECT COUNT(*) FROM tabSWOT)+(SELECT COUNT(*) FROM `tabBusiness Model Canvas`)+(SELECT COUNT(*) FROM `tabValue Proposition Canvas`)+(SELECT COUNT(*) FROM `tabEmpathy Map`) AS n']"
```
Expected: `Dev` exists; note the canvas-doc count (likely 0 after prior smoke cleanups).

- [ ] **Step 2: Write the re-link script**

Save to the scratchpad and run it (via `bench execute` — avoids the console for-loop gotcha). It creates the role, mutates each canvas doctype's `venture` field into a `company` Link, sets title_field + operator perms, and deletes any stray canvas docs (they can't map old venture values to companies):
```python
import frappe

CANVAS = ["SWOT", "Business Model Canvas", "Value Proposition Canvas", "Empathy Map"]
PERMS = [
    {"role": "Entre Operator", "read": 1, "write": 1, "create": 1, "delete": 1, "print": 1, "export": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]


def run():
    if not frappe.db.exists("Role", "Entre Operator"):
        frappe.get_doc({"doctype": "Role", "role_name": "Entre Operator", "desk_access": 1}).insert()
    for dt in CANVAS:
        frappe.db.delete(dt)  # drop stray docs (old venture-linked); dev-safe
        doc = frappe.get_doc("DocType", dt)
        for f in doc.fields:
            if f.fieldname == "venture":
                f.fieldname = "company"
                f.label = "Company"
                f.options = "Company"
                f.reqd = 1
                f.in_list_view = 1
        doc.title_field = "company"
        doc.permissions = []
        for p in PERMS:
            doc.append("permissions", p)
        doc.save()
    frappe.db.commit()
    print("relinked to Company:", CANVAS)
```
Run: write it to `.../scratchpad/relink.py`, then `bench --site dev.vernon.id execute vernon_entre.<temp>` — simplest is to place it as `vernon_entre/vernon_entre/relink.py` with a `run()` and call `bench --site dev.vernon.id execute vernon_entre.relink.run`, then delete the temp file.

- [ ] **Step 3: Neuter the retired backend test**

The Venture doctype is retired and canvases no longer have a `venture` field, so `venture/test_venture.py`'s graph test is invalid. Replace its body:
```python
# Copyright (c) 2026, Intinusa and Contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase


class TestVenture(FrappeTestCase):
	pass  # Venture retired; canvases now link to Company (see Company Workspace spec)
```

- [ ] **Step 4: Migrate + verify the schema**

```bash
bench --site dev.vernon.id migrate
bench --site dev.vernon.id execute frappe.get_meta --args "['SWOT']"
```
Then confirm the `company` field exists and `venture` is gone from the meta:
```bash
bench --site dev.vernon.id execute frappe.db.sql --args "['SELECT fieldname,options FROM tabDocField WHERE parent=\"SWOT\" AND fieldname IN (\"company\",\"venture\")', {}, 1]"
```
Expected: a `company` row with options `Company`; no `venture` row.

- [ ] **Step 5: Commit the exported JSON + test (app repo)**

Delete the temp `relink.py`, then:
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/swot vernon_entre/vernon_entre/doctype/business_model_canvas vernon_entre/vernon_entre/doctype/value_proposition_canvas vernon_entre/vernon_entre/doctype/empathy_map vernon_entre/vernon_entre/doctype/venture/test_venture.py
git commit -m "feat(entre): re-link canvases venture->company (ERPNext) + Entre Operator role"
```

---

### Task 2: Frontend pivot — Companies grid, CompanyDetail, company-scoped CanvasEditor

**Files:**
- Modify: `frontend-entre/src/lib/types.ts` (add `Company`)
- Modify: `frontend-entre/src/canvas/CanvasEditor.tsx`, `frontend-entre/src/canvas/CanvasEditor.test.tsx` (venture→company)
- Create: `frontend-entre/src/pages/Companies.tsx`, `frontend-entre/src/pages/Companies.test.tsx`
- Create: `frontend-entre/src/pages/CompanyDetail.tsx`, `frontend-entre/src/pages/CompanyDetail.test.tsx`
- Modify: `frontend-entre/src/App.tsx` (routes)
- Delete: `frontend-entre/src/pages/Ventures.tsx`, `Ventures.test.tsx`, `frontend-entre/src/pages/VentureHub.tsx`, `VentureHub.test.tsx`
- Modify (labels): `frontend-entre/src/ui/TabBar.tsx`, `frontend-entre/src/ui/NavBar.tsx` ("Ventures" → "Companies")

**Interfaces:**
- Consumes: `getList`, `getDoc`, `saveDoc` (`src/lib/api.ts`), `CANVAS_CONFIGS`/`CanvasConfig` (`src/canvas/configs.ts`), existing red-theme UI components (`AppBar`, `SectionTitle`, `ServiceTile`/`RecoCard`, `Dialog`, `StatusPill`, `Button`, `useToast`, `TabBar`, `NavBar`).
- Produces: routes `/`, `/company/:name`, `/canvas/:key/:company`. `Company` type `{ name, company_name, abbr?, default_currency?, country? }`.

- [ ] **Step 1: Add the `Company` type**

In `src/lib/types.ts` add:
```ts
export interface Company {
  name: string
  company_name: string
  abbr?: string
  default_currency?: string
  country?: string
}
```

- [ ] **Step 2: Company-scope the CanvasEditor test (write failing)**

Replace the venture references in `src/canvas/CanvasEditor.test.tsx` — render with `company` and assert the saved doc carries `company`:
```tsx
render(<CanvasEditor config={CANVAS_CONFIGS.swot} company="Dev" />)
// ...open add, type 'Low cost', Save item, Save...
await waitFor(() => expect(saveDoc).toHaveBeenCalledWith(expect.objectContaining({
  doctype: 'SWOT', company: 'Dev',
  strengths: [expect.objectContaining({ item: 'Low cost', priority: 'Medium' })],
})))
```
Keep the existing `getList`/`getDoc`/`saveDoc` mocks and the edit-preserves-name + save-failure tests (swap `venture`→`company` in their setup where present). Run `npm test -- CanvasEditor` → FAIL (CanvasEditor still expects `venture`).

- [ ] **Step 3: Company-scope the CanvasEditor**

In `src/canvas/CanvasEditor.tsx` rename the prop and the field used to load/save (presentation + save/dirty logic otherwise unchanged):
```tsx
export default function CanvasEditor({ config, company }: { config: CanvasConfig; company: string }) {
  // ...
  useEffect(() => {
    let live = true
    getList(config.doctype, { filters: { company }, fields: ['name'], limit: 1 }).then(async rows => {
      const base: DocState = { doctype: config.doctype, company }
      config.sections.forEach(s => { base[s.fieldname] = [] as CanvasItem[] })
      if (rows[0]?.name) { const full = await getDoc(config.doctype, rows[0].name); if (live) setDoc({ ...base, ...full }) }
      else if (live) setDoc(base)
    })
    return () => { live = false }
  }, [config.doctype, company])
  // DocState type: { name?: string; company: string; doctype: string; [field: string]: any }
```
Run `npm test -- CanvasEditor` → PASS.

- [ ] **Step 4: Companies grid — write failing test**

`src/pages/Companies.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getList: vi.fn() }))
import { getList } from '../lib/api'
import Companies from './Companies'

test('lists companies, each links to its detail', async () => {
  ;(getList as any).mockResolvedValue([{ name: 'Dev', company_name: 'Dev', default_currency: 'IDR', country: 'Indonesia' }])
  render(<MemoryRouter><Companies /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('Dev')).toBeInTheDocument())
  expect(screen.getByRole('link', { name: /dev/i })).toHaveAttribute('href', '/company/Dev')
})
```
Run → FAIL (no Companies).

- [ ] **Step 5: Implement Companies grid**

`src/pages/Companies.tsx` — reuse the red-theme AppBar/SearchHeader + card styling; logic:
```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { getList } from '../lib/api'
import type { Company } from '../lib/types'
import { AppBar } from '../ui/AppBar'

export default function Companies() {
  const [rows, setRows] = useState<Company[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    getList<Company>('Company', { fields: ['name', 'company_name', 'abbr', 'default_currency', 'country'], limit: 200 }).then(setRows)
  }, [])
  const filtered = rows.filter(c => (c.company_name || c.name).toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <AppBar title="Companies" />
      <div className="px-4 pt-4 pb-24 md:pb-8">
        <input aria-label="Search companies" value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies"
          className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {filtered.map(c => (
            <Link key={c.name} to={`/company/${c.name}`} className="press block rounded-xl2 bg-surface shadow-card border border-line p-4">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mb-3"><Building2 size={20} className="text-brand-500" /></div>
              <p className="font-display font-semibold text-ink">{c.company_name || c.name}</p>
              <p className="text-xs text-ink-2 mt-0.5">{[c.abbr, c.default_currency, c.country].filter(Boolean).join(' · ')}</p>
            </Link>
          ))}
        </div>
        {filtered.length === 0 && <p className="text-center text-ink-2 mt-16">No companies yet.</p>}
      </div>
    </>
  )
}
```
Run `npm test -- Companies` → PASS.

- [ ] **Step 6: CompanyDetail — write failing test**

`src/pages/CompanyDetail.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
vi.mock('../lib/api', () => ({ getDoc: vi.fn() }))
import { getDoc } from '../lib/api'
import CompanyDetail from './CompanyDetail'

test('shows company + business-plan canvas links', async () => {
  ;(getDoc as any).mockResolvedValue({ name: 'Dev', company_name: 'Dev', default_currency: 'IDR' })
  render(<MemoryRouter initialEntries={['/company/Dev']}><Routes><Route path="/company/:name" element={<CompanyDetail />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('Dev')).toBeInTheDocument())
  expect(screen.getByText(/Value Proposition Canvas/)).toBeInTheDocument()
  expect(screen.getByText(/Business Model Canvas/)).toBeInTheDocument()
  expect(screen.getByText(/SWOT/)).toBeInTheDocument()
  expect(screen.getByText(/Empathy Map/)).toBeInTheDocument()
})
```
Run → FAIL.

- [ ] **Step 7: Implement CompanyDetail (tabs: Business Plan + Operations stub)**

`src/pages/CompanyDetail.tsx` — reuse AppBar + SectionTitle + tile styling:
```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Target, Grid2x2, Lightbulb, Users } from 'lucide-react'
import { getDoc } from '../lib/api'
import type { Company } from '../lib/types'
import { CANVAS_CONFIGS } from '../canvas/configs'
import { AppBar } from '../ui/AppBar'

const ICON: Record<string, ReactNode> = {
  vpc: <Lightbulb size={20} />, bmc: <Grid2x2 size={20} />, swot: <Target size={20} />, empathy: <Users size={20} />,
}
const PLAN_ORDER: Array<keyof typeof CANVAS_CONFIGS> = ['vpc', 'bmc', 'swot', 'empathy']

export default function CompanyDetail() {
  const { name } = useParams()
  const nav = useNavigate()
  const [c, setC] = useState<Company | null>(null)
  const [tab, setTab] = useState<'plan' | 'ops'>('plan')
  useEffect(() => { if (name) getDoc<Company>('Company', name).then(setC) }, [name])
  if (!c) return <div className="p-6">Loading…</div>
  return (
    <>
      <AppBar onBack={() => nav('/')} title={c.company_name || c.name} />
      <div className="px-4 pt-4 pb-24 md:pb-8">
        <p className="text-sm text-ink-2 mb-4">{[c.abbr, c.default_currency, c.country].filter(Boolean).join(' · ')}</p>
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('plan')} className={`press rounded-pill px-4 py-2 text-sm font-display font-semibold ${tab === 'plan' ? 'bg-brand-500 text-white' : 'bg-surface text-ink-2 border border-line'}`}>Business Plan</button>
          <button onClick={() => setTab('ops')} className={`press rounded-pill px-4 py-2 text-sm font-display font-semibold ${tab === 'ops' ? 'bg-brand-500 text-white' : 'bg-surface text-ink-2 border border-line'}`}>Operations</button>
        </div>
        {tab === 'plan' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PLAN_ORDER.map(key => {
              const cfg = CANVAS_CONFIGS[key]
              return (
                <Link key={key} to={`/canvas/${key}/${c.name}`} className="press block rounded-xl2 bg-surface shadow-card border border-line p-4">
                  <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mb-3 text-brand-500">{ICON[key]}</div>
                  <p className="font-display font-semibold text-ink text-sm">{cfg.title}</p>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl2 bg-surface border border-line p-8 text-center text-ink-2">
            <p className="font-display font-semibold text-ink mb-1">Sales &amp; Purchase</p>
            <p className="text-sm">Operations for this company are coming next.</p>
          </div>
        )}
      </div>
    </>
  )
}
```
Run `npm test -- CompanyDetail` → PASS.

- [ ] **Step 8: Wire routes + delete obsolete files + relabel nav**

`src/App.tsx`:
```tsx
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
// CanvasRoute now reads company:
function CanvasRoute() {
  const { key, company } = useParams()
  const config = CANVAS_CONFIGS[key as CanvasConfig['key']]
  if (!config || !company) return <div className="p-6 text-ink-2">Not found</div>
  return <CanvasEditor config={config} company={company} />
}
// routes:
// <Route path="/" element={<Companies />} />
// <Route path="/company/:name" element={<CompanyDetail />} />
// <Route path="/canvas/:key/:company" element={<CanvasRoute />} />
```
Delete `src/pages/Ventures.tsx`, `src/pages/Ventures.test.tsx`, `src/pages/VentureHub.tsx`, `src/pages/VentureHub.test.tsx`. In `src/ui/TabBar.tsx` and `src/ui/NavBar.tsx`, change the "Ventures" label to "Companies" (keep the route target `/`).

- [ ] **Step 9: Full suite + typecheck**

Run: `cd frontend-entre && npx tsc -b && npm test`
Expected: `tsc -b` 0 errors; all tests pass (api, configs, ui.demo, auth, CanvasEditor, Companies, CompanyDetail). No references to the deleted Ventures/VentureHub remain.

- [ ] **Step 10: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add -A frontend-entre
git commit -m "feat(web): Companies grid + CompanyDetail (Business Plan/Operations) + company-scoped canvas"
```

---

### Task 3: Build, deploy, live smoke

**Files:** none (integration).

- [ ] **Step 1: Build + deploy**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre/frontend-entre && npm run build
cd /home/frappe/frappe-bench && bench build --app vernon_entre && bench --site dev.vernon.id clear-cache
```

- [ ] **Step 2: Live smoke — company-scoped canvas round-trip**

Write to a scratch file and run `bench --site dev.vernon.id console < smoke.py` (no for-loops):
```python
import frappe
d = frappe.get_doc({"doctype": "Business Model Canvas", "company": "Dev",
                    "revenue_streams": [{"item": "Subscriptions", "priority": "High"}]}).insert()
got = frappe.get_doc("Business Model Canvas", d.name)
assert got.company == "Dev", got.company
assert got.revenue_streams[0].item == "Subscriptions", got.revenue_streams
frappe.delete_doc("Business Model Canvas", d.name, force=1)
frappe.db.commit()
print("smoke ok")
```
Expected: `smoke ok`.

- [ ] **Step 3: Serve check**
```bash
curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://dev.vernon.id/entre
```
Expected: 200. Manual: `/entre` Home lists the `Dev` company → open it → Business Plan tab shows VPC/BMC/SWOT/Empathy → open BMC → add items → Save → reload persists (scoped to `Dev`).

- [ ] **Step 4: Commit built assets + report**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/www vernon_entre/vernon_entre/public/frontend_entre
git commit -m "chore(web): built company-workspace assets"
```
Report: schema re-linked, tests green, smoke result, and that Sales (SP2) + Purchase (SP3) fill the Operations tab next.

---

## Notes
- The `Venture` doctype is left dormant (not deleted). A later cleanup can remove it once nothing references it.
- Operations tab is a stub here; sub-projects 2 (Sales Orders) and 3 (Purchase Orders) implement list+create against ERPNext via the generic API, scoped by `company`.
