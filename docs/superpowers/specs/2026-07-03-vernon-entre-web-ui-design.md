# vernon_entre — Student Web UI Design (sub-project 2)

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Depends on:** sub-project 1 (data model) — DONE and live on `dev.vernon.id`: `Venture` + `SWOT` / `Business Model Canvas` / `Value Proposition Canvas` / `Empathy Map`, one reused child `Entre Canvas Item`, role `Entre Student` (own-doc `if_owner`, incl. print/export).

## Purpose

A responsive React web app where an entrepreneurship student logs in, manages their **Ventures**, and fills each venture's four canvases as sticky-note boards. Served by the `vernon_entre` app at `/entre`, mirroring vernon_project's frontend convention.

## Constraints / decisions (locked in brainstorming)

- **Device:** responsive, desktop and phone both first-class. Desktop renders each canvas as its real grid; phone stacks sections vertically.
- **Scope v1:** Login → My Ventures (list + create + rename + status) → Venture hub (4 canvas cards) → CanvasEditor (all 4 canvases via ONE generic component + 4 config blobs).
- **Item editing:** sticky-note cards (text + optional note + priority badge); add/edit inline, delete; **no drag** (order = child-row insertion order).
- **Design language:** playful, its OWN identity (own brand color + friendly font, paper/sticky texture, light motion) — built via the `frontend-design` skill.
- **Data layer:** Frappe's built-in generic API (`frappe.client.get_list` / `get_doc` / `save`, `/api/resource`). **No custom Python endpoints** in v1 — doctype permissions (`if_owner`) enforce per-student isolation server-side.
- **PWA:** installable — service worker + manifest scoped to `/entre` (mirrors `/m`'s hand-written `sw-custom.js`).
- **Auth:** Frappe session cookie + in-app Login. Students are Frappe Users holding the `Entre Student` role. **User provisioning is out of scope** (assume users exist).

## Serving architecture (mirror vernon convention)

New Vite+React app `frontend-entre/` in the app root. Files to create (from the mapped convention):

| File | Responsibility |
|---|---|
| `frontend-entre/package.json` | `build: vite build --base=/assets/vernon_entre/frontend_entre/ && npm run copy-html` |
| `frontend-entre/vite.config.ts` | `build.outDir: '../vernon_entre/public/frontend_entre'` |
| `frontend-entre/copy-html.mjs` | copy built `index.html` → `vernon_entre/www/entre.html`; copy `sw-custom.js` → `vernon_entre/www/entre_sw.js` |
| `frontend-entre/src/main.tsx` | `<BrowserRouter basename="/entre">`; register SW `/entre_sw.js` scope `/entre` |
| `vernon_entre/www/entre.html` | generated; carries `window.csrf_token = '{{ frappe.session.csrf_token }}'` + hashed asset tags + manifest link |
| `vernon_entre/www/entre.py` | `no_cache = 1` |
| `vernon_entre/hooks.py` | `website_route_rules = [{"from_route": "/entre/<path:app_path>", "to_route": "entre"}]` |
| `frontend-entre/sw-custom.js` | hand-written SW, `ASSET_PREFIX = /assets/vernon_entre/frontend_entre/`, scope `/entre`; cache-first hashed assets, network-first `/entre` navigations w/ shell fallback |
| `frontend-entre/public/manifest.webmanifest` | `id`/`start_url`/`scope` = `/entre` |

Frappe symlinks `public/` under `/assets/vernon_entre/` at install, so assets serve at `/assets/vernon_entre/frontend_entre/...`.

## Data flow (generic Frappe API)

`src/lib/api.ts` — fetch wrapper matching convention: base `/api/method/`, GET (no CSRF header), POST (`X-Frappe-CSRF-Token: window.csrf_token`), `credentials: 'same-origin'`, unwrap `message`.

Operations (all via Frappe built-ins, permission-enforced):
- **List my ventures:** `frappe.client.get_list` doctype `Venture`, fields `[name, venture_name, pitch, status]` — `if_owner` auto-scopes.
- **Create venture:** `frappe.client.insert` `{doctype:"Venture", venture_name, pitch, status:"Draft"}`.
- **Rename/status:** `frappe.client.set_value` (or `save`).
- **Load a canvas:** `frappe.client.get_list` doctype `<Canvas>` filter `{venture: name}`, limit 1; if empty, treat as new (unsaved) canvas in memory.
- **Save a canvas:** `frappe.client.save` with the full doc incl. child rows: `{doctype:"<Canvas>", venture, <section>:[{item, note, priority}, ...]}`. First save inserts (create-if-absent handled client-side).

No new server code. If a genuine aggregation need appears later, add a whitelisted `api/entre.py` then — not now.

## Screens & components

```
Login
 └─ VenturesPage        list my ventures, create, rename, set status
     └─ VentureHubPage  venture meta + 4 canvas cards (link to each editor)
         └─ CanvasEditorPage  ← ONE generic component, config-driven
             ├─ CanvasSection   titled section (a doctype Table field)
             │   └─ ItemCard    sticky note: item text + note + priority badge
             └─ AddItem         inline add control per section
```

- **`src/canvas/configs.ts`** — the four config blobs. Each: `{ doctype, title, sections: [{ fieldname, label }], layout }` where `layout` is a responsive CSS-grid template describing desktop arrangement. Configs:
  - **SWOT** — 2×2: strengths, weaknesses, opportunities, threats.
  - **Business Model Canvas** — the 9-block layout: top row (key_partners | key_activities+key_resources | value_propositions | customer_relationships+channels | customer_segments), bottom row (cost_structure | revenue_streams).
  - **Value Proposition Canvas** — two sides: value map (products_and_services, pain_relievers, gain_creators) | customer profile (customer_jobs, pains, gains).
  - **Empathy Map** — 2×3: says, thinks, feels, does, pains, gains.
- **`CanvasEditor`** reads a config, renders its sections in the grid, holds the working doc in state, and dirty-saves via the API. It is doctype-agnostic — adding a fifth canvas later = one config entry.
- **Responsive:** desktop uses each config's `layout` grid; below a breakpoint, all sections collapse to a single vertical stack. Same components either way.

## State & save model

- CanvasEditor loads the canvas (or starts empty), edits child items in local state, and saves the whole doc (Frappe replaces child rows on save). Debounced autosave OR explicit Save button — **explicit Save button in v1** (simpler, predictable; autosave deferred).
- Priority is a 3-value select (High/Medium/Low, default Medium) shown as a colored badge.

## Error handling

- 401/403 on bootstrap → render Login (per convention).
- Save failure → inline toast/dialog (NOT native alert — use an in-app dialog/toast, per project rule), keep unsaved edits in state.
- Missing/permission-denied canvas → treated as empty new canvas (student only ever sees their own via `if_owner`).

## Testing

- **Component:** CanvasEditor renders a given config's sections; add/edit/delete ItemCard mutates working state; Save serializes the expected doc shape. Vitest + React Testing Library.
- **Integration (one happy path):** create a Venture, save a SWOT with items, reload — persists. Run against live doctypes on `dev.vernon.id` (session-authenticated), consistent with the project's code-first / final-phase-testing convention.

## Explicitly out of scope (v1)

Drag-reorder; offline editing/sync; student-user provisioning/onboarding; per-canvas scoring or instructor grading views; custom Python API; in-UI PDF export (Desk print/export already granted to Entre Student); analytics.

## Verification

1. `bench build` (or the app's frontend build) produces hashed assets + `www/entre.html`; app serves the SPA at `https://dev.vernon.id/entre` after login.
2. A student user (Entre Student role) logs in, creates a Venture, fills each of the 4 canvases with sticky items, saves, reloads — data persists and is scoped to that student.
3. Installable: manifest + SW register at scope `/entre`; app is installable on a phone.
