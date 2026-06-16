# Vernon Project — Mobile App (PWA)

A modern, installable mobile web app (Progressive Web App) built with **React +
Vite + Tailwind**, served by Frappe at **`/m`**. It gives the team a fast,
phone-first way to see their work, advance tasks through the approval workflow,
review what needs their sign-off, and track project progress — without opening
the full desk.

> Open it on a phone at **`https://<your-site>/m`** and choose *Add to Home
> Screen* to install it like a native app.

---

## 1. What it does (daily usage)

The information architecture and flows below were defined with a role panel —
**UX Specialist, COO, Project Manager, Project Leader, and a Project Team
Member** — so the app fits real daily routines, not just the data model.

### Bottom navigation (4 tabs)

| Tab | Purpose |
| --- | --- |
| **Today** | The home screen. Glance metrics (overdue / due today / to review / done today) + *your* tasks bucketed into **Overdue**, **Due today**, **Upcoming**. This is "what do I do right now?" in two seconds. |
| **Projects** | All projects you can see, each with a progress bar, task counts, overdue & review badges. Drill in → **work items** → **tasks**. Includes team-workload strip. |
| **Review** | Role-aware queue of everything **waiting for *your* approval**, most-urgent first. A badge on the tab shows the count. Approve in one tap. |
| **Me** | Profile, roles, online/sync status, replay the tour, link to the desktop app, log out. |

### The three core flows (1–2 taps each)

1. **Advance a task** — tap the action button on any task card (or the big
   button on the task screen). It moves one step:
   `⚪️ Planned → 🟠 Done → 🔷 Checked by PL → ✅ Completed`. The button only
   appears if *you* are allowed to take that step; otherwise you see a clear
   "waiting on someone else" state. Permission rules mirror the backend exactly,
   so you never get a surprise rejection.
2. **Read / update notes** — open a task → type in the notes box → it autosaves
   when you tap away ("Saved" confirmation). No save-button hunting.
3. **Find your work** — it's the home screen. Nothing to navigate.

### Trust & accountability (from the COO / PL panel)

- Each task shows an **activity timeline**: who developed / checked / completed
  it and when.
- Status colors are consistent everywhere: Planned = grey, Done = amber,
  Checked = blue, Completed = green; **overdue = red** regardless of status.
- Names (not emails) are shown throughout.
- Optimistic actions roll back with a clear toast if the server rejects them.

### Onboarding (<30 seconds)

First launch shows a 3-slide tour: *(1)* Today is your work, *(2)* tap to move
work forward — you only see steps you're allowed to take, *(3)* leaders get a
Review queue. It can be skipped and replayed anytime from **Me → Replay quick
tour**.

---

## 2. Architecture

```
frontend/                         # React + Vite + TS + Tailwind source
  src/
    lib/        api.ts, status.ts, format.ts, types.ts
    hooks/      useData.ts        # React Query data + mutations
    components/ Layout, BottomNav, TodoCard, Toast, ui primitives
    pages/      Today, Review, Projects, ProjectDetail, WorkItem, Todo,
                Profile, Onboarding
    App.tsx     auth gate + routing + onboarding gate
  vite.config.ts                  # base=/assets/vernon_project/frontend/, PWA
  copy-html.mjs                   # build → copies index.html to www/m.html

vernon_project/
  api/mobile.py                   # purpose-built, permission-aware endpoints
  www/m.html                      # generated SPA shell (served at /m)
  public/frontend/                # built assets (served at /assets/...)
  hooks.py                        # website_route_rule: /m/<path> → m
```

### Serving model

- `website_route_rules` maps `/m/<path:app_path>` → the `m` web page so React
  Router deep links and refreshes work.
- `www/m.html` is the Vite-built `index.html` (copied at build time). Frappe
  renders `{{ frappe.session.csrf_token }}` into it for CSRF-protected POSTs.
- Static JS/CSS/icons are served from `public/frontend/` at
  `/assets/vernon_project/frontend/…` (via the existing assets symlink / nginx).

### Backend API (`vernon_project/api/mobile.py`)

All endpoints are `@frappe.whitelist()` and **respect Project permissions**
(they only ever expose projects the user can see) and **replicate the
status-workflow permission rules**, so the UI offers exactly the actions the
server will accept.

| Method | Returns |
| --- | --- |
| `bootstrap()` | user identity, roles, leader flag |
| `get_dashboard()` | Today buckets + review queue + glance counts |
| `get_projects()` | project cards with progress / overdue / review rollups |
| `get_project(project)` | project meta, team workload, work items |
| `get_work_item(work_item)` | a work item with its tasks |
| `get_todo(todo)` | full task: notes, audit timeline, permission flags |

Status transitions and notes reuse the existing endpoints
`vernon_project.api.project_todo.update_status` / `save_notes`.

### Offline / PWA

- Installable: web manifest + service worker (precaches the app shell).
- React Query cache is persisted to `localStorage`, so reopening the app — even
  offline — shows last-known data instantly.
- Read API responses use a NetworkFirst strategy with a short timeout.

---

## 3. Building / deploying

```bash
cd apps/vernon_project/frontend
npm install
npm run build        # builds to ../vernon_project/public/frontend and
                     # copies index.html → ../vernon_project/www/m.html
```

Then make Frappe pick up the new route and assets:

```bash
bench --site <site> clear-cache
bench restart        # reload workers so the website_route_rule is live
```

For local development with hot reload: `npm run dev` (proxy `/api` and `/assets`
to your bench site, or run against the built `/m` page).
