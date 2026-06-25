# Web App — Desktop Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-optimized web app at `/web` that reuses the mobile PWA's entire data/logic layer (`frontend/src`) via Vite/TS alias and rebuilds only the layout chrome (sidebar shell, dialogs, master-detail, tables).

**Architecture:** New sibling source dir `frontend-web/` with its own Vite/TS build chain producing `public/frontend_web` → `www/web.html`. The mobile `frontend/` is **never edited**. Shared mobile files keep their internal `@/...` imports working because the web build points `@` back at `../frontend/src`; web's own code uses a separate `@web` alias. A new Frappe route rule and `www/web.py` controller serve the SPA shell at `/web`. No service worker.

**Tech Stack:** React 18.3, Vite 5.4, TypeScript 5.5, TanStack Query 5.51, react-router-dom 6.26, Tailwind 3.4, lucide-react. Same versions as mobile.

## Global Constraints

- **Never edit any file under `frontend/`** (mobile source) or its outputs. Zero regression on `/m`.
- React Query persist key MUST be `vernon-web-cache` (mobile uses `vernon-mobile-cache`); caches must not clash.
- No service worker, no `serviceWorker.register`, no SW copy in build.
- Router `basename` = `/web`; Vite `--base` = `/assets/vernon_project/frontend_web/`; `build.outDir` = `../vernon_project/public/frontend_web`.
- Reuse the mobile data layer through the `@` alias only; web's own code through `@web`. Web imports ONLY from the reuse contract in the spec — never from a mobile-chrome file except the type-only `FilterDimension`/`FilterValue` from `FilterSheet.tsx`.
- Tailwind tokens/config copied verbatim from mobile (`brand` palette, Inter, dark mode `class`).
- No `alert()`/`confirm()`/`prompt()` — use the reused `ConfirmProvider`/`useConfirm` and `ToastProvider`/`useToast`.
- Deploy = `npm run build` in `frontend-web/`, then `bench --site project.vernon.id clear-cache && bench restart`. No `migrate` (no schema change).

## Testing convention (live-site / code-first)

Per the project's live-site convention there is no test DB; formal automated tests are deferred to a final phase. **Each task's verification step is a build/typecheck gate plus a manual check against the running site** (`project.vernon.id/web`), and a confirmation that `/m` still works. This intentionally replaces the TDD red/green cycle for this plan. The build gate for every task is:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build
```
Expected: tsc clean, Vite build writes `../vernon_project/public/frontend_web/` and `copy-html` logs the `web.html` copy.

---

## File Structure

New files (all under `apps/vernon_project/`):

```
frontend-web/
  package.json            # scripts + deps (mirror mobile, no PWA)
  vite.config.ts          # base, outDir, @ + @web aliases
  tsconfig.json           # @ + @web paths
  tailwind.config.js      # copied from mobile, content globs include ../frontend/src
  postcss.config.js       # copied from mobile
  index.html              # CSRF line, favicon under frontend_web, no SW, no manifest PWA
  copy-html.mjs           # copy index.html -> www/web.html (NO sw copy)
  src/
    main.tsx              # providers, persist vernon-web-cache, basename /web, initTheme, NO sw
    App.tsx               # useBoot gate (Splash/Login/Shell) + route table
    index.css             # tailwind directives (copied from mobile)
    components/
      AppShell.tsx        # sidebar + topbar + responsive drawer
      overlays/
        Dialog.tsx        # centered modal
        Drawer.tsx        # right slide-in
        Popover.tsx       # anchored panel
    pages/
      Login.tsx
      Today.tsx
      Projects.tsx
      Project.tsx         # master-detail shell + left pane + <Outlet/>
      ProjectItem.tsx     # right-pane + standalone wide route
      ProjectDetail.tsx   # standalone detail route
      Review.tsx
      Me.tsx
vernon_project/www/web.py # controller, no_cache = 1
```

Modified files:
- `vernon_project/vernon_project/hooks.py` — append one `website_route_rules` entry.

---

### Task 1: Build & serve plumbing scaffold

**Files:**
- Create: `frontend-web/package.json`
- Create: `frontend-web/vite.config.ts`
- Create: `frontend-web/tsconfig.json`
- Create: `frontend-web/tailwind.config.js`
- Create: `frontend-web/postcss.config.js`
- Create: `frontend-web/index.html`
- Create: `frontend-web/copy-html.mjs`
- Create: `frontend-web/src/index.css`
- Create: `frontend-web/src/main.tsx` (temporary placeholder, replaced in Task 2)
- Create: `vernon_project/vernon_project/www/web.py`
- Modify: `vernon_project/vernon_project/hooks.py` (website_route_rules)

**Interfaces:**
- Produces: a buildable empty SPA served at `/web`; aliases `@`→`../frontend/src`, `@web`→`./src`; build output at `public/frontend_web`, shell at `www/web.html`.

- [ ] **Step 1: Create `frontend-web/package.json`**

```json
{
  "name": "vernon-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build --base=/assets/vernon_project/frontend_web/ && npm run copy-html",
    "copy-html": "node copy-html.mjs",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/query-sync-storage-persister": "^5.51.21",
    "@tanstack/react-query": "^5.51.21",
    "@tanstack/react-query-persist-client": "^5.51.21",
    "clsx": "^2.1.1",
    "html-to-image": "^1.11.13",
    "lucide-react": "^0.418.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
```

Deps mirror mobile exactly (shared `frontend/src` code imports them; they must resolve from the web build). `vite-plugin-pwa` is omitted — no SW.

- [ ] **Step 2: Create `frontend-web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../frontend/src'),
      '@web': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../vernon_project/public/frontend_web',
    emptyOutDir: true,
    target: 'es2018',
    sourcemap: false,
  },
})
```

`@` points at the MOBILE source so shared files' internal `@/lib/...` imports resolve. `@web` is web's own code.

- [ ] **Step 3: Create `frontend-web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["../frontend/src/*"],
      "@web/*": ["src/*"]
    }
  },
  "include": ["src", "../frontend/src"]
}
```

`include` lists `../frontend/src` so tsc resolves shared files. `paths` mirror the Vite aliases.

- [ ] **Step 4: Create `frontend-web/tailwind.config.js`** (copy mobile config; content globs must scan BOTH dirs)

```javascript
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        nav: '0 -1px 12px 0 rgb(0 0 0 / 0.06)',
      },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
```

The `../frontend/src` glob is critical — reused components carry Tailwind classes that must be in the web build's CSS.

- [ ] **Step 5: Create `frontend-web/postcss.config.js`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 6: Create `frontend-web/src/index.css`** — copy the mobile `frontend/src/index.css` verbatim.

```bash
cp /home/frappe/frappe-bench/apps/vernon_project/frontend/src/index.css \
   /home/frappe/frappe-bench/apps/vernon_project/frontend-web/src/index.css
```

(If it has `@/` url() refs to assets, leave them — they resolve under the shared alias.)

- [ ] **Step 7: Create `frontend-web/index.html`** (no SW, no PWA manifest registration, favicon under frontend_web)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/assets/vernon_project/frontend_web/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#4f46e5" />
    <title>Vernon</title>
    <script>
      (function () {
        try {
          var t = localStorage.getItem('vernon-theme') || 'system'
          var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          if (dark) document.documentElement.classList.add('dark')
        } catch (e) {}
      })()
    </script>
    <script>
      window.csrf_token = '{{ frappe.session.csrf_token }}'
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Theme bootstrap reuses the SAME `vernon-theme` localStorage key as mobile (shared `theme.ts`) — intentional, themes stay in sync. CSRF line is identical to mobile (Jinja-injected when served from `www/web.html`).

- [ ] **Step 8: Create `frontend-web/copy-html.mjs`** (copies HTML only — NO service worker)

```javascript
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = '../vernon_project/public/frontend_web/index.html'
const dest = '../vernon_project/www/web.html'

if (!existsSync(src)) {
  console.error(`[copy-html] build output not found at ${src}`)
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`[copy-html] ${src} -> ${dest}`)
```

- [ ] **Step 9: Create `vernon_project/vernon_project/www/web.py`**

```python
# Controller for the /web desktop SPA shell (companion to the vite-generated web.html).
#
# Mirrors www/m.py: the shell must never be served stale. Every build produces new
# content-hashed asset filenames referenced by hash in web.html, so a cached shell
# white-screens. `no_cache = 1` disables Frappe's server-side page cache for /web.
#
# Hand-written; NOT overwritten by the build (copy-html.mjs only regenerates web.html).
# There is intentionally NO service worker for the desktop app.

no_cache = 1
```

- [ ] **Step 10: Add the route rule in `hooks.py`**

Find the existing block:
```python
website_route_rules = [
	{"from_route": "/m/<path:app_path>", "to_route": "m"},
]
```
Replace with:
```python
website_route_rules = [
	{"from_route": "/m/<path:app_path>", "to_route": "m"},
	{"from_route": "/web/<path:app_path>", "to_route": "web"},
]
```

- [ ] **Step 11: Temporary placeholder `frontend-web/src/main.tsx`** (replaced in Task 2 — proves the chain end-to-end first)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="p-10 text-2xl font-bold text-brand-600">Vernon Web — scaffold OK</div>
  </React.StrictMode>,
)
```

- [ ] **Step 12: Install deps and build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm install && npm run build
```
Expected: Vite writes `../vernon_project/public/frontend_web/`, `copy-html` logs `-> ../vernon_project/www/web.html`.

- [ ] **Step 13: Make the route live and verify**

```bash
bench --site project.vernon.id clear-cache && bench restart
```
Then load `https://project.vernon.id/web` → shows "Vernon Web — scaffold OK" in brand color. Load `https://project.vernon.id/m` → mobile app still works. Confirm both.

- [ ] **Step 14: Commit**

```bash
git add frontend-web vernon_project/vernon_project/www/web.py vernon_project/vernon_project/hooks.py
git commit -m "feat(web): scaffold desktop web app build/serve chain at /web"
```

---

### Task 2: App bootstrap — providers, boot gate, route skeleton

**Files:**
- Modify: `frontend-web/src/main.tsx` (replace placeholder)
- Create: `frontend-web/src/App.tsx`

**Interfaces:**
- Consumes (from `@`): `initTheme` (`@/lib/theme`), `ToastProvider` (`@/components/Toast`), `ConfirmProvider` (`@/components/Confirm`), `ErrorBoundary` (`@/components/ErrorBoundary`), `useBoot` (`@/hooks/useData`), `ApiError` (`@/lib/api`).
- Consumes (from `@web`): `AppShell` (Task 3), page components (Tasks 5–12) — imported as they land; until then route to placeholders.
- Produces: `App` default export; the boot gate (Splash while loading, `<Login>` on 401/403, else `<AppShell>` with nested routes).

- [ ] **Step 1: Replace `frontend-web/src/main.tsx`**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { ToastProvider } from '@/components/Toast'
import { ConfirmProvider } from '@/components/Confirm'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'
import { initTheme } from '@/lib/theme'

initTheme()

const CACHE_BUSTER = 'v1'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'vernon-web-cache',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <BrowserRouter basename="/web">
        <ToastProvider>
          <ConfirmProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
```

Key differences from mobile `main.tsx`: persist key `vernon-web-cache` (own cache), `basename="/web"`, NO `serviceWorker.register`, NO `removeItem('vernon-mobile-cache')`.

- [ ] **Step 2: Create `frontend-web/src/App.tsx`** with the boot gate and route table. Until later tasks land, route to a shared inline placeholder so the build is green.

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { ApiError } from '@/lib/api'
import Login from '@web/pages/Login'
import { AppShell } from '@web/components/AppShell'
import Today from '@web/pages/Today'
import Projects from '@web/pages/Projects'
import Project from '@web/pages/Project'
import ProjectItem from '@web/pages/ProjectItem'
import ProjectDetail from '@web/pages/ProjectDetail'
import Review from '@web/pages/Review'
import Me from '@web/pages/Me'

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white">
      <FolderKanban className="w-12 h-12 animate-pulse" />
    </div>
  )
}

export default function App() {
  const boot = useBoot()

  if (boot.isLoading) return <Splash />

  const err = boot.error
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return <Login />
  }
  if (!boot.data && err) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Today />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project/:name" element={<Project />}>
          <Route path="item/:itemName" element={<ProjectItem />} />
        </Route>
        <Route path="/project-item/:name" element={<ProjectItem />} />
        <Route path="/project-detail/:name" element={<ProjectDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/me" element={<Me />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
```

> NOTE for the implementer: this file imports components built in later tasks. To keep the build green while executing task-by-task, create each `@web/pages/*` and `@web/components/AppShell` file as a minimal stub returning `<div/>` first (do this as the first step of Task 3, then flesh out in its own task), OR implement Task 2 last among 2–12. Recommended order: do Task 3 (AppShell) and Task 4 (overlays) next, then stub the seven pages, then refine each. The boot gate logic above is the deliverable of Task 2 and must not change.

- [ ] **Step 3: Stub the page + shell modules** so `tsc`/build pass. Create each of `frontend-web/src/pages/{Login,Today,Projects,Project,ProjectItem,ProjectDetail,Review,Me}.tsx` and `frontend-web/src/components/AppShell.tsx` with a placeholder default/named export, e.g.:

```tsx
// frontend-web/src/pages/Today.tsx (stub — replaced in Task 6)
export default function Today() {
  return <div className="p-6">Today</div>
}
```
```tsx
// frontend-web/src/components/AppShell.tsx (stub — replaced in Task 3)
import { Outlet } from 'react-router-dom'
export function AppShell() {
  return <div><Outlet /></div>
}
```
`Login` is a default export; `AppShell` is a named export (match the imports in App.tsx).

- [ ] **Step 4: Build gate**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build
```
Expected: clean. Deploy (`bench restart` not needed — no Python change; just rebuild assets) and load `/web`: should show the boot Splash then redirect to the `Today` stub (or `Login` if session expired). Confirm `/m` unaffected.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src
git commit -m "feat(web): app bootstrap, boot gate, route skeleton with stubs"
```

---

### Task 3: AppShell — sidebar, top bar, responsive drawer

**Files:**
- Modify: `frontend-web/src/components/AppShell.tsx` (replace stub)

**Interfaces:**
- Consumes (from `@`): `useBoot`, `useDashboard` (`@/hooks/useData`), `Avatar` (`@/components/ui`), `logout` (`@/lib/api`), `getStoredTheme`, `setTheme`, `Theme` (`@/lib/theme`).
- Consumes (router): `<Outlet/>`, `NavLink`, `useNavigate`.
- Produces: named export `AppShell` — persistent sidebar + sticky topbar wrapping `<Outlet/>`. Provides the layout for all routed screens.

- [ ] **Step 1: Implement `AppShell`**

```tsx
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, FolderKanban, CheckCircle2, User, Menu, X, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { useBoot, useDashboard } from '@/hooks/useData'
import { Avatar } from '@/components/ui'
import { logout } from '@/lib/api'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/review', label: 'Review', icon: CheckCircle2, end: false, badge: 'review' as const },
  { to: '/me', label: 'Me', icon: User, end: false },
]

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun }, { value: 'dark', icon: Moon }, { value: 'system', icon: Monitor },
]

export function AppShell() {
  const boot = useBoot()
  const dash = useDashboard()
  const reviewCount = dash.data?.counts.review ?? 0
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [drawerOpen, setDrawerOpen] = useState(false)

  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t) }
  const doLogout = async () => { await logout(); window.location.href = '/web' }

  const sidebar = (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center gap-2 text-brand-600 font-bold text-lg">
        <FolderKanban className="w-6 h-6" /> Vernon
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-600 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="flex-1">{label}</span>
            {badge === 'review' && reviewCount > 0 && (
              <span className="text-xs font-semibold bg-brand-600 text-white rounded-full px-2 py-0.5">{reviewCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Avatar name={boot.data?.full_name ?? '?'} image={boot.data?.image ?? undefined} size={32} />
          <span className="text-sm font-medium truncate">{boot.data?.full_name}</span>
        </div>
        <div className="flex items-center gap-1">
          {THEMES.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => pickTheme(value)}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-md ${
                theme === value ? 'bg-brand-50 dark:bg-brand-600/15 text-brand-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <button onClick={doLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* desktop sidebar */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* mobile/tablet drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 lg:px-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <button className="lg:hidden" onClick={() => setDrawerOpen((o) => !o)}>
            {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div id="web-topbar-slot" className="flex-1 flex items-center justify-between" />
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

> Screen titles/actions: each page renders its own heading at the top of its content (simpler than portaling into `#web-topbar-slot`). The slot div is kept for optional future use; pages are NOT required to fill it.

- [ ] **Step 2: Build gate + manual check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build
```
Load `/web`: sidebar with Today/Projects/Review/Me, active highlight, user avatar+name, theme toggle (switch light/dark and confirm it persists + matches `/m`), logout. Shrink to <1024px → sidebar collapses to a hamburger drawer. Confirm `/m` unaffected.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/components/AppShell.tsx
git commit -m "feat(web): AppShell sidebar + topbar + responsive drawer"
```

---

### Task 4: Overlay primitives — Dialog, Drawer, Popover

**Files:**
- Create: `frontend-web/src/components/overlays/Dialog.tsx`
- Create: `frontend-web/src/components/overlays/Drawer.tsx`
- Create: `frontend-web/src/components/overlays/Popover.tsx`

**Interfaces:**
- Produces:
  - `Dialog({ open, onClose, title, children, footer?, widthClass? })` — centered modal; backdrop + Esc + click-out close; body-scroll lock; `widthClass` defaults `max-w-lg`.
  - `Drawer({ open, onClose, title, children, widthClass? })` — right slide-in; same close affordances; `widthClass` defaults `max-w-md`.
  - `Popover({ open, onClose, anchorRef, children, align? })` — anchored panel; outside-click + Esc close; `align` `'left' | 'right'` default `'right'`.
- These host the rebuilt forms/filters in later tasks. Destructive confirms still use the reused `useConfirm`.

- [ ] **Step 1: Create `Dialog.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({
  open, onClose, title, children, footer, widthClass = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  widthClass?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${widthClass} max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `Drawer.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Drawer({
  open, onClose, title, children, widthClass = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  widthClass?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-full ${widthClass} flex flex-col bg-white dark:bg-slate-900 shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `Popover.tsx`**

```tsx
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

export function Popover({
  open, onClose, anchorRef, children, align = 'right',
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return (
    <div
      ref={panelRef}
      className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} z-40 w-72 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 p-4`}
    >
      {children}
    </div>
  )
}
```

The `Popover` is positioned relative to a wrapping `relative` container the caller provides around the anchor button.

- [ ] **Step 4: Build gate**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```
Expected: clean (these are not yet mounted; visual verification happens when a consumer task uses them).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/components/overlays
git commit -m "feat(web): Dialog, Drawer, Popover overlay primitives"
```

---

### Task 5: Login page

**Files:**
- Modify: `frontend-web/src/pages/Login.tsx` (replace stub)

**Interfaces:**
- Consumes (from `@`): `login` (`@/lib/api`), `parseFrappeError` (`@/lib/format`).
- Produces: default export `Login`. On success calls `login(email, pwd)` then `window.location.href = '/web'`.

- [ ] **Step 1: Implement `Login`**

```tsx
import { useState } from 'react'
import { Eye, EyeOff, FolderKanban, Loader2 } from 'lucide-react'
import { login } from '@/lib/api'
import { parseFrappeError } from '@/lib/format'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login(email.trim(), pwd)
      window.location.href = '/web'
    } catch (ex) {
      setErr(parseFrappeError(ex instanceof Error ? ex.message : String(ex)) || 'Login failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-8 space-y-5">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-xl">
          <FolderKanban className="w-7 h-7" /> Vernon
        </div>
        {err && <div className="rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-sm px-3 py-2">{err}</div>}
        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'} value={pwd} onChange={(e) => setPwd(e.target.value)} required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 pr-10"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in
        </button>
        <a href="/login#forgot?redirect-to=/web" className="block text-center text-sm text-brand-600">Forgot password?</a>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Build gate + manual check** — build, deploy assets, open `/web` in a private window (no session) → Login card renders; bad creds show error banner; good creds redirect to `/web` Today. Confirm.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Login.tsx
git commit -m "feat(web): desktop login screen"
```

---

### Task 6: Today dashboard

**Files:**
- Modify: `frontend-web/src/pages/Today.tsx` (replace stub)

**Interfaces:**
- Consumes (from `@`): `useDashboard`, `useWallet` (`@/hooks/useData`); `TodoCard` (`@/components/TodoCard`); `Segmented`, `EmptyState`, `Spinner`, `ProgressBar` (`@/components/ui`); `FilterButton`, `activeFilterCount`, type `FilterDimension`, `FilterValue` (`@/components/FilterSheet`); `applyProjectItemFilters`, `buildOptions` (`@/lib/filters`); `Popover` (`@web/components/overlays/Popover`).
- `useDashboard().data`: `{ counts: {overdue, due_today, upcoming, review, completed_today}, overdue, due_today, upcoming, review: ProjectItem[] }`.
- `useWallet().data`: `Wallet { earned, redeemed, balance, today_earned, yesterday_earned }`.
- Produces: default export `Today`.

- [ ] **Step 1: Implement `Today`** — wide dashboard. Rebuild the `Ring` SVG locally (mobile's is inline in `Today.tsx`, not importable). Lens switcher via `Segmented`. Filters in a `Popover`. Task rows reuse `TodoCard`.

```tsx
import { useMemo, useRef, useState } from 'react'
import { useDashboard, useWallet } from '@/hooks/useData'
import { TodoCard } from '@/components/TodoCard'
import { Segmented, EmptyState, Spinner } from '@/components/ui'
import { FilterButton, activeFilterCount, type FilterDimension, type FilterValue } from '@/components/FilterSheet'
import { applyProjectItemFilters, buildOptions } from '@/lib/filters'
import { formatNumber } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CheckCircle2 } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'

function Ring({ pct }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r
  const off = c * (1 - Math.min(1, Math.max(0, pct / 100)))
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-slate-200 dark:stroke-slate-800" />
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
        className="stroke-brand-600" strokeDasharray={c} strokeDashoffset={off} />
    </svg>
  )
}

type Lens = 'mine' | 'owned' | 'led' | 'in'
const LENSES: { value: Lens; label: string }[] = [
  { value: 'mine', label: 'For me' }, { value: 'owned', label: 'Owned' },
  { value: 'led', label: 'Led' }, { value: 'in', label: "I'm in" },
]

export default function Today() {
  const dash = useDashboard()
  const wallet = useWallet()
  const [lens, setLens] = useState<Lens>('mine')
  const [filters, setFilters] = useState<FilterValue>({})
  const filterRef = useRef<HTMLButtonElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const allTasks: ProjectItem[] = useMemo(() => {
    const d = dash.data
    if (!d) return []
    return [...d.overdue, ...d.due_today, ...d.upcoming]
  }, [dash.data])

  // lens filtering mirrors mobile Today semantics (is_mine / project_owner / project_leader / membership)
  const lensed = useMemo(() => allTasks.filter((t) => {
    if (lens === 'mine') return t.is_mine
    if (lens === 'owned') return !!t.project_owner
    if (lens === 'led') return !!t.project_leader
    return true
  }), [allTasks, lens])

  const dimensions: FilterDimension[] = useMemo(() => [
    { key: 'status', label: 'Status', options: buildOptions(lensed, (t) => t.status_key, (t) => t.status) },
    { key: 'project', label: 'Project', options: buildOptions(lensed, (t) => t.project, (t) => t.project_name) },
  ], [lensed])

  const visible = useMemo(() => applyProjectItemFilters(lensed, filters), [lensed, filters])

  if (dash.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const counts = dash.data!.counts
  const donePct = counts.completed_today + counts.due_today > 0
    ? Math.round((counts.completed_today / (counts.completed_today + counts.due_today)) * 100) : 0
  const w = wallet.data

  const groups: { title: string; items: ProjectItem[] }[] = [
    { title: 'Overdue', items: visible.filter((t) => t.is_overdue) },
    { title: 'Today', items: visible.filter((t) => !t.is_overdue && !!t.today_allocation) },
    { title: 'Upcoming', items: visible.filter((t) => !t.is_overdue && !t.today_allocation) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Today</h1>

      {/* hero row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex items-center gap-6">
          <div className="relative">
            <Ring pct={donePct} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{counts.completed_today}</span>
              <span className="text-xs text-slate-500">done</span>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="font-semibold">{counts.due_today}</span> due today</div>
            <div><span className="font-semibold">{counts.overdue}</span> overdue</div>
            <div><span className="font-semibold">{counts.upcoming}</span> upcoming</div>
            <div className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" />{counts.review} to review</div>
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6">
          <div className="text-sm text-slate-500">Points balance</div>
          <div className="text-3xl font-bold">{w ? formatNumber(w.balance) : '—'}</div>
          <div className="text-xs text-slate-500 mt-2">
            +{w ? formatNumber(w.today_earned) : 0} today · +{w ? formatNumber(w.yesterday_earned) : 0} yesterday
          </div>
          {/* link to marketplace inert until Phase 2 */}
          <span className="inline-block mt-3 text-xs text-slate-400">Marketplace — coming soon</span>
        </div>
      </div>

      {/* tasks */}
      <div className="flex items-center justify-between gap-3">
        <Segmented options={LENSES} value={lens} onChange={setLens} />
        <div className="relative">
          <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} ref={filterRef as any} />
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
            <div className="space-y-4">
              {dimensions.map((d) => (
                <div key={d.key} className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">{d.label}</div>
                  <SearchableSelect
                    value={filters[d.key] ?? ''}
                    onChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}
                    options={d.options.map((o) => ({ value: o.value, label: `${o.label}${o.count != null ? ` (${o.count})` : ''}` }))}
                    allowClear placeholder="Any"
                  />
                </div>
              ))}
              <button onClick={() => setFilters({})} className="text-sm text-brand-600">Clear all</button>
            </div>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">{g.title} · {g.items.length}</h2>
            {g.items.length === 0
              ? <div className="text-sm text-slate-400 py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">Nothing here</div>
              : g.items.map((t) => <TodoCard key={t.name} todo={t} showProject />)}
          </section>
        ))}
      </div>

      {visible.length === 0 && <EmptyState icon={CheckCircle2} title="All clear" subtitle="No tasks match." />}
    </div>
  )
}
```

> If `FilterButton` does not `forwardRef`, wrap it in a `<span ref={filterRef}>` instead of passing `ref` (verify its signature when implementing; adjust the anchor accordingly). The lens predicates are a v1 approximation of mobile's; refine against mobile `Today.tsx` semantics during the verify pass if owned/led/in need exact owner-name matching.

- [ ] **Step 2: Build gate + manual check** — `/web` Today shows the ring hero, points card, lens segmented control, filter popover, and three task columns reusing `TodoCard`. Clicking a card navigates to `/web/project-item/:name`. Confirm `/m` unaffected.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Today.tsx
git commit -m "feat(web): Today desktop dashboard"
```

---

### Task 7: Projects page + create-project dialog

**Files:**
- Modify: `frontend-web/src/pages/Projects.tsx` (replace stub)
- Create: `frontend-web/src/components/ProjectFormDialog.tsx`

**Interfaces:**
- Consumes (from `@`): `useProjects`, `canCreateProject`, `useBoot`, `useFormOptions`, `useCreateProject`, `useUpdateProject` (`@/hooks/useData`); `ProjectCard` (`@/components/ProjectCard`); `Segmented`, `Spinner`, `EmptyState` (`@/components/ui`); `SearchableSelect` (`@/components/SearchableSelect`); `useToast` (`@/components/Toast`); `Dialog` (`@web/components/overlays/Dialog`); types `ProjectFull`, `ProjectInput`, `ProjectCard as ProjectCardT` (`@/lib/types`).
- Produces: default export `Projects`; named export `ProjectFormDialog({ open, onClose, project?, onSaved? })` — desktop wrapper hosting the SAME field set + mutation hooks as mobile `ProjectFormSheet` (project_name, brand, project_owner, project_leader, project_admin, blocked_by, start_date, deadline, goal, status, team_members), reused by Task 8 too.

- [ ] **Step 1: Create `ProjectFormDialog.tsx`** — rebuild `ProjectFormSheet`'s form body inside `Dialog`. Diff field-by-field against `frontend/src/components/ProjectFormSheet.tsx`; call the identical hooks (`useFormOptions`, `useCreateProject`, `useUpdateProject`). Validate required fields (project_name, brand, owner, leader, start_date, deadline, status). On success `useToast('success', …)`, invalidate happens inside the hooks, call `onSaved?.(name)` and `onClose()`.

```tsx
import { useState } from 'react'
import { useFormOptions, useCreateProject, useUpdateProject } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'
import type { ProjectFull, ProjectInput } from '@/lib/types'

const STATUS_OPTS = [
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Closed', label: 'Closed' },
]

export function ProjectFormDialog({
  open, onClose, project, onSaved,
}: {
  open: boolean
  onClose: () => void
  project?: ProjectFull
  onSaved?: (name: string) => void
}) {
  const opts = useFormOptions()
  const create = useCreateProject()
  const update = useUpdateProject(project?.name ?? '')
  const toast = useToast()
  const editing = !!project

  const [form, setForm] = useState<ProjectInput>(() => ({
    project_name: project?.project_name ?? '',
    brand: project?.brand ?? '',
    project_owner: project?.project_owner ?? '',
    project_leader: project?.project_leader ?? '',
    project_admin: project?.project_admin ?? '',
    blocked_by: project?.blocked_by ?? '',
    start_date: project?.start_date ?? '',
    deadline: project?.deadline ?? '',
    goal: project?.goal ?? '',
    status: project?.status ?? 'Ongoing',
    team_members: project?.team?.map((t) => ({ user: t.user })) ?? [],
  }))

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.project_name || !form.brand || !form.project_owner || !form.project_leader || !form.start_date || !form.deadline) {
      toast('error', 'Fill all required fields'); return
    }
    try {
      const res = editing ? await update.mutateAsync(form) : await create.mutateAsync(form)
      toast('success', editing ? 'Project updated' : 'Project created')
      onSaved?.(res.name); onClose()
    } catch (e) {
      toast('error', parseFrappeError(e instanceof Error ? e.message : String(e)))
    }
  }

  const userOpts = (opts.data?.users ?? []).map((u) => ({ value: u.value, label: u.label }))
  const brandOpts = (opts.data?.brands ?? []).map((b) => ({ value: b.value, label: b.label }))
  const busy = create.isPending || update.isPending

  return (
    <Dialog
      open={open} onClose={onClose} title={editing ? 'Edit project' : 'New project'} widthClass="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-60">{editing ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">Project name *</span>
          <input value={form.project_name} onChange={(e) => set('project_name', e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" /></label>
        <div className="space-y-1"><span className="text-sm font-medium">Brand *</span>
          <SearchableSelect value={form.brand} onChange={(v) => set('brand', v)} options={brandOpts} allowCreate /></div>
        <div className="space-y-1"><span className="text-sm font-medium">Status *</span>
          <SearchableSelect value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTS} /></div>
        <div className="space-y-1"><span className="text-sm font-medium">Owner *</span>
          <SearchableSelect value={form.project_owner} onChange={(v) => set('project_owner', v)} options={userOpts} /></div>
        <div className="space-y-1"><span className="text-sm font-medium">Leader *</span>
          <SearchableSelect value={form.project_leader} onChange={(v) => set('project_leader', v)} options={userOpts} /></div>
        <div className="space-y-1"><span className="text-sm font-medium">Admin</span>
          <SearchableSelect value={form.project_admin ?? ''} onChange={(v) => set('project_admin', v)} options={userOpts} allowClear /></div>
        <div className="space-y-1"><span className="text-sm font-medium">Blocked by</span>
          <SearchableSelect value={form.blocked_by ?? ''} onChange={(v) => set('blocked_by', v)} options={userOpts} allowClear /></div>
        <label className="space-y-1"><span className="text-sm font-medium">Start *</span>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">Deadline *</span>
          <input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" /></label>
        <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">Goal</span>
          <textarea value={form.goal} onChange={(e) => set('goal', e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" /></label>
        <div className="space-y-1 md:col-span-2"><span className="text-sm font-medium">Team</span>
          <MultiSelectChips options={opts.data?.users ?? []} value={(form.team_members ?? []).map((t) => t.user)} onChange={(vs) => set('team_members', vs.map((user) => ({ user })))} /></div>
      </div>
    </Dialog>
  )
}
```

> The `blocked_by` field on mobile is a *project* link (another project that blocks this one), not a user — verify in `ProjectFormSheet.tsx` and switch its options to a project list if so. Diff every field against the sheet before considering this done.

- [ ] **Step 2: Implement `Projects.tsx`** — search + status `Segmented` + brand/owner/leader `Popover`; grid of `ProjectCard` grouped by brand; gated "New project" button opens `ProjectFormDialog`.

```tsx
import { useMemo, useState } from 'react'
import { useProjects, canCreateProject, useBoot } from '@/hooks/useData'
import { ProjectCard } from '@/components/ProjectCard'
import { Segmented, Spinner, EmptyState } from '@/components/ui'
import { Plus, FolderKanban, Search } from 'lucide-react'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'

const STATUS: { value: string; label: string }[] = [
  { value: 'Ongoing', label: 'Ongoing' }, { value: 'Closed', label: 'Closed' }, { value: 'all', label: 'All' },
]

export default function Projects() {
  const projects = useProjects()
  const boot = useBoot()
  const [status, setStatus] = useState('Ongoing')
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const visible = useMemo(() => (projects.data ?? []).filter((p) => {
    if (status !== 'all' && p.status !== status) return false
    if (q && !p.project_name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [projects.data, status, q])

  const byBrand = useMemo(() => {
    const m = new Map<string, typeof visible>()
    for (const p of visible) { const k = p.brand || 'No brand'; (m.get(k) ?? m.set(k, []).get(k)!).push(p) }
    return [...m.entries()]
  }, [visible])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canCreateProject(boot.data) && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> New project
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <Segmented options={STATUS} value={status} onChange={setStatus} />
      </div>

      {projects.isLoading ? <div className="flex justify-center py-20"><Spinner /></div>
        : visible.length === 0 ? <EmptyState icon={FolderKanban} title="No projects" subtitle="Nothing matches your filters." />
        : byBrand.map(([brand, list]) => (
          <section key={brand} className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500">{brand}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map((p) => <ProjectCard key={p.name} p={p} />)}
            </div>
          </section>
        ))}

      <ProjectFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
```

- [ ] **Step 2b:** brand/owner/leader filter `Popover` — add after search using the same `Popover` + `SearchableSelect` pattern as Task 6 (dimensions: brand, owner_name, leader_name from `buildOptions`). Optional for v1 grid; include if time permits.

- [ ] **Step 3: Build gate + manual check** — `/web/projects`: search, status segmented, brand-grouped grid of `ProjectCard`s; cards navigate to `/web/project/:name`; "New project" (only if `canCreateProject`) opens the dialog, creating a project refreshes the grid. Confirm `/m` unaffected.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Projects.tsx frontend-web/src/components/ProjectFormDialog.tsx
git commit -m "feat(web): Projects grid + create/edit project dialog"
```

---

### Task 8: Project master-detail shell (left pane + nested outlet)

**Files:**
- Modify: `frontend-web/src/pages/Project.tsx` (replace stub)
- Create: `frontend-web/src/components/ProjectDetailFormDialog.tsx`
- Create: `frontend-web/src/components/CreateProjectItemDialog.tsx`
- Create: `frontend-web/src/components/TeamWorkloadDrawer.tsx`

**Interfaces:**
- Consumes (from `@`): `useProject`, `useProjectGantt`, `permFlags`, `useBoot`, `useDeleteProject`, `useCreateProjectDetail`, `useCreateProjectItem`, `useMemberWorkload`, `useFormOptions`, `useUpdateProject` (`@/hooks/useData`); `GanttChart` (`@/components/GanttChart`); `groupFromItems` (`@/lib/gantt`); `Segmented`, `ProgressBar`, `Avatar`, `Spinner`, `Pill` (`@/components/ui`); `CommentThread` (`@/components/CommentThread`); `useConfirm` (`@/components/Confirm`); `useToast` (`@/components/Toast`); `Dialog`, `Drawer` (`@web` overlays); `ProjectFormDialog` (`@web/components/ProjectFormDialog`, from Task 7).
- Consumes (router): `useParams`, `useNavigate`, `Outlet`, `useLocation`.
- Produces: default export `Project`. Renders project hero + left-pane detail/task tree + right pane = `<Outlet/>` (the nested `/item/:itemName` route, or a project `CommentThread` fallback when no item selected).

- [ ] **Step 1: Create the three overlay-hosted forms** by porting the corresponding sheets field-for-field (same hooks):
  - `ProjectDetailFormDialog({ open, onClose, project })` ← `ProjectDetailFormSheet.tsx` (`useCreateProjectDetail`, `useGroups`; fields title, is_pending, current_condition via `RichEditor`, expected_outcome, keterangan_di_sow, discount, price, glossaries via `MultiSelectChips`). Hosted in `Dialog`.
  - `CreateProjectItemDialog({ open, onClose, projectDetail, team, defaultGroup?, siblings? })` ← `CreateProjectItemSheet.tsx` (`useCreateProjectItem`, `useScoringGroups`, `useScoringGroup`; full field set incl. recurring + blocked_by/blocking). Hosted in `Dialog widthClass="max-w-2xl"`.
  - `TeamWorkloadDrawer({ open, onClose, member, project })` ← `MemberWorkloadSheet.tsx` (`useMemberWorkload`). Hosted in `Drawer`.

  For each: open the mobile sheet, copy the JSX form body, swap the sheet container for `Dialog`/`Drawer`, keep imports pointing at `@/...` hooks/components. Use `useToast` on success, `useConfirm` for any destructive action. Each is its own commit-worthy sub-step but they share Task 8's verification.

- [ ] **Step 2: Implement `Project.tsx`**

```tsx
import { useRef, useState } from 'react'
import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useProject, useProjectGantt, permFlags, useBoot, useDeleteProject } from '@/hooks/useData'
import { GanttChart } from '@/components/GanttChart'
import { groupFromItems } from '@/lib/gantt'
import { Segmented, ProgressBar, Avatar, Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { Pencil, Users, Trash2, Plus } from 'lucide-react'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { TeamWorkloadDrawer } from '@web/components/TeamWorkloadDrawer'

type View = 'list' | 'gantt'
type ItemFilter = 'all' | 'open' | 'completed'

export default function Project() {
  const { name = '', itemName } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const project = useProject(name)
  const boot = useBoot()
  const del = useDeleteProject()
  const confirm = useConfirm()
  const toast = useToast()

  const [view, setView] = useState<View>('list')
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [detailFormOpen, setDetailFormOpen] = useState(false)
  const [createItemFor, setCreateItemFor] = useState<string | null>(null)
  const [workloadMember, setWorkloadMember] = useState<{ user: string; name: string } | null>(null)

  const gantt = useProjectGantt(name, view === 'gantt')

  if (project.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  const p = project.data!
  const perms = permFlags(p, boot.data)
  const itemSelected = !!itemName

  const doDelete = async () => {
    if (!(await confirm({ title: 'Delete project?', message: p.project_name, destructive: true, confirmLabel: 'Delete' }))) return
    await del.mutateAsync(p.name); toast('success', 'Project deleted'); nav('/projects')
  }

  // detail/task tree filter helper
  const matchItem = (statusKey: string) =>
    filter === 'all' ? true : filter === 'completed' ? statusKey === 'completed' : statusKey !== 'completed'

  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">{p.brand}</div>
            <h1 className="text-2xl font-bold">{p.project_name}</h1>
            <div className="text-sm text-slate-500 mt-1">Owner {p.owner_name} · Leader {p.leader_name}</div>
          </div>
          <div className="flex items-center gap-2">
            {perms.can_edit && <button onClick={() => setEditOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="w-4 h-4" /></button>}
            {perms.can_edit && <button onClick={() => setWorkloadMember(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Users className="w-4 h-4" /></button>}
            {perms.can_delete && <button onClick={doDelete} className="p-2 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {p.blocked_by && <div className="text-sm rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">Blocked by {p.blocked_by_name ?? p.blocked_by}</div>}
        {p.goal && <div className="text-sm text-slate-600 dark:text-slate-300">{p.goal}</div>}
        <div className="flex items-center gap-2">
          {p.team.map((t) => (
            <button key={t.user} onClick={() => setWorkloadMember({ user: t.user, name: t.name })} title={t.name}>
              <Avatar name={t.name} image={t.image ?? undefined} size={32} />
            </button>
          ))}
        </div>
      </div>

      {/* split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* left pane: details + tasks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Segmented options={[{ value: 'list', label: 'List' }, { value: 'gantt', label: 'Gantt' }]} value={view} onChange={setView} />
            <Segmented options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'completed', label: 'Done' }]} value={filter} onChange={setFilter} />
          </div>

          {view === 'gantt'
            ? <GanttChart groups={gantt.data ?? []} title={p.project_name} onBarClick={(id) => nav(`/project/${name}/item/${id}`)} />
            : (
              <div className="space-y-4">
                {p.project_details.map((d) => (
                  <div key={d.name} className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                      <button onClick={() => nav(`/project-detail/${d.name}`)} className="text-sm font-semibold text-left hover:text-brand-600">{d.title}</button>
                      {d.can_create && <button onClick={() => setCreateItemFor(d.name)} className="text-xs flex items-center gap-1 text-brand-600"><Plus className="w-3 h-3" /> Todo</button>}
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {d.items.filter((it) => matchItem(it.status_key)).map((it) => (
                        <li key={it.name}>
                          <button
                            onClick={() => nav(`/project/${name}/item/${it.name}`)}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 ${itemName === it.name ? 'bg-brand-50 dark:bg-brand-600/10' : ''}`}
                          >
                            <span className="flex-1 truncate">{it.to_do}</span>
                            <span className="text-xs text-slate-400">{it.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {perms.can_edit && (
                  <button onClick={() => setDetailFormOpen(true)} className="flex items-center gap-2 text-sm text-brand-600">
                    <Plus className="w-4 h-4" /> New detail
                  </button>
                )}
              </div>
            )}
        </div>

        {/* right pane: nested item outlet or project comments */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-5 min-h-[300px]">
          {itemSelected ? <Outlet /> : <CommentThread referenceDoctype="Project" referenceName={p.name} />}
        </div>
      </div>

      {/* overlays */}
      <ProjectFormDialog open={editOpen} onClose={() => setEditOpen(false)} project={p} />
      <ProjectDetailFormDialog open={detailFormOpen} onClose={() => setDetailFormOpen(false)} project={p.name} />
      {createItemFor && (
        <CreateProjectItemDialog
          open={!!createItemFor} onClose={() => setCreateItemFor(null)}
          projectDetail={createItemFor}
          team={p.team.map((t) => ({ user: t.user, name: t.name }))}
        />
      )}
      <TeamWorkloadDrawer open={!!workloadMember} onClose={() => setWorkloadMember(null)} member={workloadMember} project={p.name} />
    </div>
  )
}
```

> The team-management (`TeamManagerSheet`) action is folded into the edit dialog for v1 (owner/leader/admin/team are all editable in `ProjectFormDialog`). If a dedicated team manager is wanted, port `TeamManagerSheet` into a `Drawer` later — not required for v1. Confirm `ProjectFull` exposes `project_details[].items` and `.can_create`; the explorer reported `project_details: ProjectDetailSummary[]` — verify the summary carries items, and if it only carries counts, fetch each via `useProjectDetail` or adjust the left pane to link out to `/project-detail/:name` for the task list.

- [ ] **Step 2: Build gate + manual check** — `/web/project/:name`: hero with perm-gated Edit/Team/Delete, blocked-by banner, goal, team avatars (click → workload `Drawer`). Left pane lists details + tasks with List/Gantt + All/Open/Done toggles; +Todo / +Detail open dialogs. Selecting a task navigates to `/web/project/:name/item/:itemName` and renders it in the right pane (Task 9); with nothing selected the right pane shows the project `CommentThread`. Back button returns to empty right pane. Confirm `/m` unaffected.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Project.tsx frontend-web/src/components/ProjectDetailFormDialog.tsx frontend-web/src/components/CreateProjectItemDialog.tsx frontend-web/src/components/TeamWorkloadDrawer.tsx
git commit -m "feat(web): project master-detail shell with nested item outlet"
```

---

### Task 9: Project Item (right pane + standalone wide route)

**Files:**
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (replace stub)
- Create: `frontend-web/src/components/FocusOverlay.tsx`

**Interfaces:**
- Consumes (from `@`): `useProjectItem`, `useAdvanceStatus`, `useUpdateTodo`, `useSetTodoAllocations`, `useSaveNotes` (`@/hooks/useData`); `useFocusTimer` (`@/hooks/useFocusTimer`); `ambient`, `loadSoundPrefs`, `saveSoundPrefs` (`@/lib/ambientSound`); `STATUS`, `STATUS_ORDER` (`@/lib/status`); `formatEstimate`, `formatClock`, `formatDate`, `formatNumber`, `sanitizeHtml` (`@/lib/format`); `Avatar`, `Spinner`, `Pill` (`@/components/ui`); `CommentThread` (`@/components/CommentThread`); `RichEditor` (`@/components/RichEditor`); `useToast`, `useConfirm`; `Dialog` (`@web` overlay).
- Consumes (router): `useParams`. Detects standalone vs nested by route param name: standalone route passes `:name`, nested passes `:itemName`.
- Produces: default export `ProjectItem`. Rebuilds `Stepper`, `Notes`, `AllocationCard`, `EditForm` (these are inline-in-mobile, not importable) and `FocusOverlay`.

- [ ] **Step 1: Create `FocusOverlay.tsx`** — rebuild the mobile focus overlay (inside `ProjectItemScreen.tsx`) using the reused `useFocusTimer` engine + `ambient` sound. Full-screen `Dialog`-like overlay: ring/clock via `formatClock(remainingMs)`, start/pause/resume/stop controls, ambient sound toggle with `loadSoundPrefs`/`saveSoundPrefs`. Props: `{ open, onClose, taskId, taskTitle, estimatedMinutes }`.

```tsx
import { useState } from 'react'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { ambient, loadSoundPrefs, saveSoundPrefs } from '@/lib/ambientSound'
import { formatClock } from '@/lib/format'
import { Play, Pause, Square, Volume2, VolumeX, X } from 'lucide-react'

export function FocusOverlay({
  open, onClose, taskId, taskTitle, estimatedMinutes,
}: {
  open: boolean
  onClose: () => void
  taskId: string
  taskTitle: string
  estimatedMinutes: number
}) {
  const ft = useFocusTimer()
  const [sound, setSound] = useState(loadSoundPrefs())
  if (!open) return null

  const running = ft.timer?.status === 'running'
  const isThis = ft.timer?.taskId === taskId
  const toggleSound = () => {
    const next = { ...sound, enabled: !sound.enabled }
    setSound(next); saveSoundPrefs(next)
    if (next.enabled) ambient.play(); else ambient.stop()
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-brand-700 to-slate-950 text-white flex flex-col items-center justify-center gap-8 p-6">
      <button onClick={onClose} className="absolute top-5 right-5"><X className="w-6 h-6" /></button>
      <div className="text-lg opacity-80 text-center max-w-md">{taskTitle}</div>
      <div className="text-6xl font-mono tabular-nums">{formatClock(isThis ? ft.remainingMs : estimatedMinutes * 60_000)}</div>
      <div className="flex items-center gap-4">
        {!isThis || !running
          ? <button onClick={() => (isThis ? ft.resume() : ft.start(taskId, taskTitle, estimatedMinutes))} className="p-4 rounded-full bg-white text-brand-700"><Play className="w-6 h-6" /></button>
          : <button onClick={ft.pause} className="p-4 rounded-full bg-white text-brand-700"><Pause className="w-6 h-6" /></button>}
        <button onClick={() => { ft.stop(); ambient.stop() }} className="p-4 rounded-full bg-white/20"><Square className="w-6 h-6" /></button>
        <button onClick={toggleSound} className="p-4 rounded-full bg-white/20">{sound.enabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `ProjectItem.tsx`** — two-column layout (left: stepper + advance + stat grid + allocations + focus; right: notes + timeline + comments). Rebuild `Stepper`, `Notes`, `AllocationCard`, `EditForm` inline (mirroring mobile). Read the route param with a fallback so it works for both `/project-item/:name` and `/project/:name/item/:itemName`:

```tsx
import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { useProjectItem, useAdvanceStatus, useSaveNotes, useSetTodoAllocations } from '@/hooks/useData'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatEstimate, formatDate, formatNumber, sanitizeHtml } from '@/lib/format'
import { Avatar, Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { Check, ChevronRight, Timer, Pencil } from 'lucide-react'
import { FocusOverlay } from '@web/components/FocusOverlay'
import type { StatusKey } from '@/lib/types'

function Stepper({ current }: { current: StatusKey }) {
  const idx = STATUS_ORDER.indexOf(current)
  return (
    <div className="flex items-center">
      {STATUS_ORDER.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${i <= idx ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
            {i < idx ? <Check className="w-4 h-4" /> : STATUS[s].emoji}
          </div>
          {i < STATUS_ORDER.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300" />}
        </div>
      ))}
    </div>
  )
}

export default function ProjectItem() {
  const params = useParams()
  const todoName = params.itemName ?? params.name ?? ''
  const item = useProjectItem(todoName)
  const advance = useAdvanceStatus()
  const saveNotes = useSaveNotes(todoName)
  const toast = useToast()
  const [notes, setNotes] = useState<string | null>(null)
  const [focusOpen, setFocusOpen] = useState(false)

  if (item.isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
  const t = item.data!
  const notesValue = notes ?? t.notes ?? ''

  const doAdvance = async () => {
    try { const r = await advance.mutateAsync(t.name); toast('success', r.message || 'Advanced') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed') }
  }
  const blurNotes = async () => {
    if (notes == null || notes === (t.notes ?? '')) return
    try { await saveNotes.mutateAsync(notes); toast('success', 'Notes saved') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t.project_name} · {t.project_detail_title}</div>
          <h2 className="text-xl font-bold">{t.to_do}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* left */}
        <div className="space-y-5">
          <Stepper current={t.status_key} />
          {t.can_advance && t.next_status_label
            ? <button onClick={doAdvance} disabled={advance.isPending} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium">{t.next_status_label}</button>
            : <div className="text-sm text-slate-500">Waiting on someone else</div>}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><Avatar name={t.assigned_to_name} image={t.assigned_to_image ?? undefined} size={28} /><span>{t.assigned_to_name}</span></div>
            <div>Deadline: {formatDate(t.deadline ?? null)}</div>
            <div>Estimate: {formatEstimate(t.estimated)}</div>
            <div>Allocated: {formatEstimate(t.allocated_total)}</div>
            {t.group && <div>Group: {t.group}</div>}
            {t.level != null && <div>Level: {t.level}</div>}
            {t.point != null && <div>Points: {formatNumber(t.point)}</div>}
          </div>

          {t.estimated > 0 && (
            <button onClick={() => setFocusOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-600 text-brand-600 text-sm">
              <Timer className="w-4 h-4" /> Focus mode
            </button>
          )}
          {/* AllocationCard: render t.allocations as an editable grid for the assignee (useSetTodoAllocations); read-only otherwise. Port from mobile AllocationCard. */}
        </div>

        {/* right */}
        <div className="space-y-5">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Notes</div>
            {t.can_edit_notes
              ? <textarea value={notesValue} onChange={(e) => setNotes(e.target.value)} onBlur={blurNotes} rows={5} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm" />
              : <div className="text-sm text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.notes ?? '') }} />}
          </div>
          {/* timeline: render t.timeline events */}
          <CommentThread referenceDoctype="Project Item" referenceName={t.name} />
        </div>
      </div>

      <FocusOverlay open={focusOpen} onClose={() => setFocusOpen(false)} taskId={t.name} taskTitle={t.to_do} estimatedMinutes={t.estimated} />
    </div>
  )
}
```

> Confirm the `CommentThread` reference doctype string the backend expects for a project item (mobile `ProjectItemScreen.tsx` passes a specific `referenceDoctype` — copy it verbatim; it may be `"Project Todo"` not `"Project Item"`). `EditForm` (full edit via `useUpdateTodo` with field-lock once `fields_locked`/Done) and the editable `AllocationCard` (via `useSetTodoAllocations`) are ports of the mobile inline components — implement them as sub-steps mirroring `ProjectItemScreen.tsx` exactly, including the locked-fields behaviour. The timeline renders `t.timeline` (`TimelineEvent[]`).

- [ ] **Step 3: Build gate + manual check** — open a task both via Today (`/web/project-item/:name`, full width) and via Project left pane (`/web/project/:name/item/:itemName`, right pane). Verify: stepper reflects status; advance button advances and toasts; notes autosave on blur; allocations editable for assignee only; Focus mode overlay runs the timer + ambient sound; comments post. Fields lock once Done. Confirm `/m` unaffected.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/ProjectItem.tsx frontend-web/src/components/FocusOverlay.tsx
git commit -m "feat(web): project item detail (right pane + standalone) with focus mode"
```

---

### Task 10: Project Detail standalone route

**Files:**
- Modify: `frontend-web/src/pages/ProjectDetail.tsx` (replace stub)

**Interfaces:**
- Consumes (from `@`): `useProjectDetail`, `useUpdateProjectDetail`, `useDeleteProjectDetail`, `useCreateProjectItem` (`@/hooks/useData`); `sanitizeHtml`, `formatDate` (`@/lib/format`); `Spinner`, `Pill` (`@/components/ui`); `CommentThread`; `useToast`, `useConfirm`; `ProjectDetailEditDialog` (port of `ProjectDetailEditSheet`, optional reuse of Task 8's create dialog with edit mode); `CreateProjectItemDialog` (Task 8).
- Produces: default export `ProjectDetail`. Standalone view: header (sanitized `current_condition`/`expected_outcome`) + its `project_items` as a table + `CommentThread`.

- [ ] **Step 1: Implement `ProjectDetail.tsx`**

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useProjectDetail } from '@/hooks/useData'
import { sanitizeHtml } from '@/lib/format'
import { Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { Plus } from 'lucide-react'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'

export default function ProjectDetail() {
  const { name = '' } = useParams()
  const nav = useNavigate()
  const detail = useProjectDetail(name)
  const [createOpen, setCreateOpen] = useState(false)

  if (detail.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  const d = detail.data!

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <button onClick={() => nav(`/project/${d.project}`)} className="text-sm text-brand-600">← {d.project_name}</button>
        <h1 className="text-2xl font-bold mt-1">{d.title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {d.current_condition && <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Current condition</div>
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.current_condition) }} />
        </div>}
        {d.expected_outcome && <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Expected outcome</div>
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.expected_outcome) }} />
        </div>}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <span className="text-sm font-semibold">Tasks</span>
          {d.can_create && <button onClick={() => setCreateOpen(true)} className="text-xs flex items-center gap-1 text-brand-600"><Plus className="w-3 h-3" /> Todo</button>}
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.project_items.map((it) => (
              <tr key={it.name} className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => nav(`/project-item/${it.name}`)}>
                <td className="px-4 py-2.5">{it.to_do}</td>
                <td className="px-4 py-2.5 text-slate-500">{it.assigned_to_name}</td>
                <td className="px-4 py-2.5 text-slate-500 text-right">{it.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CommentThread referenceDoctype="Project Detail" referenceName={d.name} />

      <CreateProjectItemDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        projectDetail={d.name}
        team={d.team.map((t) => ({ user: t.user, name: t.name }))}
        defaultGroup={d.default_group ?? null}
      />
    </div>
  )
}
```

> Verify the `CommentThread` doctype string for a project detail against mobile `ProjectDetailScreen`. Edit/delete-detail actions (`useUpdateProjectDetail`/`useDeleteProjectDetail`) can be added as a `Dialog` + `useConfirm`; include if the detail header in mobile exposes them, gated by `d.can_edit`.

- [ ] **Step 2: Build gate + manual check** — `/web/project-detail/:name`: header with sanitized condition/outcome, task table (rows → item), +Todo (if `can_create`), comments. Reached from the project left pane. Confirm `/m` unaffected.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/ProjectDetail.tsx
git commit -m "feat(web): standalone project detail route"
```

---

### Task 11: Review queue

**Files:**
- Modify: `frontend-web/src/pages/Review.tsx` (replace stub)

**Interfaces:**
- Consumes (from `@`): `useDashboard`, `useAdvanceStatus` (`@/hooks/useData`); `byDeadlineAsc`, `formatDate` (`@/lib/format`); `Avatar`, `EmptyState`, `Spinner` (`@/components/ui`); `buildOptions` (`@/lib/filters`); `FilterButton`, `activeFilterCount`, type `FilterValue` (`@/components/FilterSheet`); `SearchableSelect`; `Popover` (`@web` overlay); `useToast`.
- `useDashboard().data.review`: `ProjectItem[]`.
- Produces: default export `Review`.

- [ ] **Step 1: Implement `Review.tsx`** — table grouped by project, sorted by deadline asc, inline approve via `useAdvanceStatus`, filter `Popover` (project/brand/assignee).

```tsx
import { useMemo, useRef, useState } from 'react'
import { useDashboard, useAdvanceStatus } from '@/hooks/useData'
import { byDeadlineAsc, formatDate } from '@/lib/format'
import { Avatar, EmptyState, Spinner } from '@/components/ui'
import { buildOptions } from '@/lib/filters'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import { useToast } from '@/components/Toast'
import { CheckCircle2, Check } from 'lucide-react'

export default function Review() {
  const dash = useDashboard()
  const advance = useAdvanceStatus()
  const toast = useToast()
  const [filters, setFilters] = useState<FilterValue>({})
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const all = dash.data?.review ?? []
  const dims = useMemo(() => [
    { key: 'project', label: 'Project', options: buildOptions(all, (t) => t.project, (t) => t.project_name) },
    { key: 'brand', label: 'Brand', options: buildOptions(all, (t) => t.brand ?? '', (t) => t.brand ?? '—') },
    { key: 'assignee', label: 'Assignee', options: buildOptions(all, (t) => t.assigned_to, (t) => t.assigned_to_name) },
  ], [all])

  const visible = useMemo(() => all.filter((t) =>
    (!filters.project || t.project === filters.project) &&
    (!filters.brand || (t.brand ?? '') === filters.brand) &&
    (!filters.assignee || t.assigned_to === filters.assignee)
  ).sort(byDeadlineAsc), [all, filters])

  const byProject = useMemo(() => {
    const m = new Map<string, typeof visible>()
    for (const t of visible) (m.get(t.project_name) ?? m.set(t.project_name, []).get(t.project_name)!).push(t)
    return [...m.entries()]
  }, [visible])

  const approve = async (id: string) => {
    try { const r = await advance.mutateAsync(id); toast('success', r.message || 'Approved') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed') }
  }

  if (dash.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review</h1>
        <div className="relative">
          <span ref={filterRef}><FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} /></span>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
            <div className="space-y-4">
              {dims.map((d) => (
                <div key={d.key} className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">{d.label}</div>
                  <SearchableSelect value={filters[d.key] ?? ''} onChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}
                    options={d.options.map((o) => ({ value: o.value, label: `${o.label}${o.count != null ? ` (${o.count})` : ''}` }))} allowClear placeholder="Any" />
                </div>
              ))}
              <button onClick={() => setFilters({})} className="text-sm text-brand-600">Clear all</button>
            </div>
          </Popover>
        </div>
      </div>

      {visible.length === 0
        ? <EmptyState icon={CheckCircle2} title="Nothing to review" subtitle="The queue is empty." />
        : byProject.map(([proj, list]) => (
          <section key={proj} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">{proj}</h2>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((t) => (
                    <tr key={t.name} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-2.5 cursor-pointer" onClick={() => window.location.assign(`/web/project-item/${t.name}`)}>{t.to_do}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><Avatar name={t.assigned_to_name} image={t.assigned_to_image ?? undefined} size={24} /><span className="text-slate-500">{t.assigned_to_name}</span></div></td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(t.deadline ?? null)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {t.can_advance && <button onClick={() => approve(t.name)} disabled={advance.isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs"><Check className="w-3 h-3" /> {t.next_status_label || 'Approve'}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </div>
  )
}
```

> Prefer `useNavigate()` over `window.location.assign` for the row click (kept terse here); use the router in the real implementation so it stays within the SPA.

- [ ] **Step 2: Build gate + manual check** — `/web/review`: project-grouped table sorted by deadline, filter popover, inline approve advances + removes the row on refetch, empty state when clear. Sidebar Review badge count matches. Confirm `/m` unaffected.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Review.tsx
git commit -m "feat(web): review approval queue table"
```

---

### Task 12: Me / profile + change password

**Files:**
- Modify: `frontend-web/src/pages/Me.tsx` (replace stub)
- Create: `frontend-web/src/components/ChangePasswordDialog.tsx`

**Interfaces:**
- Consumes (from `@`): `useBoot`, `useChangeMyPassword` (`@/hooks/useData`); `logout` (`@/lib/api`); `Avatar` (`@/components/ui`); `useToast`; `parseFrappeError`; `Dialog` (`@web` overlay).
- Produces: default export `Me`; named export `ChangePasswordDialog({ open, onClose })` (ports `ChangePasswordSheet`: oldPassword, newPassword, confirmPassword → `useChangeMyPassword`).

- [ ] **Step 1: Create `ChangePasswordDialog.tsx`** — port `ChangePasswordSheet` body into `Dialog`. Validate `newPassword === confirmPassword` and non-empty; on success toast + close; on error `parseFrappeError`.

```tsx
import { useState } from 'react'
import { useChangeMyPassword } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useChangeMyPassword()
  const toast = useToast()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')

  const submit = async () => {
    if (!oldPassword || !newPassword) { toast('error', 'Fill all fields'); return }
    if (newPassword !== confirm) { toast('error', 'Passwords do not match'); return }
    try {
      await change.mutateAsync({ oldPassword, newPassword })
      toast('success', 'Password changed'); onClose()
      setOld(''); setNew(''); setConfirm('')
    } catch (e) { toast('error', parseFrappeError(e instanceof Error ? e.message : String(e))) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Change password"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300">Cancel</button>
        <button onClick={submit} disabled={change.isPending} className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-60">Save</button>
      </>}>
      <div className="space-y-3">
        <input type="password" placeholder="Current password" value={oldPassword} onChange={(e) => setOld(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" />
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNew(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2" />
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 2: Implement `Me.tsx`**

```tsx
import { useState } from 'react'
import { useBoot } from '@/hooks/useData'
import { logout } from '@/lib/api'
import { Avatar } from '@/components/ui'
import { ChangePasswordDialog } from '@web/components/ChangePasswordDialog'
import { LogOut, KeyRound, Smartphone } from 'lucide-react'

export default function Me() {
  const boot = useBoot()
  const [pwOpen, setPwOpen] = useState(false)
  const b = boot.data
  const doLogout = async () => { await logout(); window.location.href = '/web' }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Me</h1>
      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex items-center gap-4">
        <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={56} />
        <div>
          <div className="text-lg font-semibold">{b?.full_name}</div>
          <div className="text-sm text-slate-500">{b?.user}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {(b?.roles ?? []).map((r) => <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{r}</span>)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card divide-y divide-slate-100 dark:divide-slate-800">
        <button onClick={() => setPwOpen(true)} className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800"><KeyRound className="w-4 h-4" /> Change password</button>
        <a href="/m" className="w-full flex items-center gap-3 px-5 py-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Smartphone className="w-4 h-4" /> Open mobile app</a>
        <button onClick={doLogout} className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><LogOut className="w-4 h-4" /> Log out</button>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}
```

(Theme toggle already lives in the sidebar footer; not duplicated here.)

- [ ] **Step 3: Build gate + manual check** — `/web/me`: profile card with roles, change-password dialog (validates match, succeeds), link to `/m`, logout returns to `/web` login. Confirm `/m` unaffected.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Me.tsx frontend-web/src/components/ChangePasswordDialog.tsx
git commit -m "feat(web): Me profile + change-password dialog"
```

---

### Task 13: Final verification pass + deploy

**Files:** none (verification + deploy only).

- [ ] **Step 1: Full typecheck + build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build
```
Expected: clean.

- [ ] **Step 2: Deploy**

```bash
bench --site project.vernon.id clear-cache && bench restart
```
(`migrate` not needed — no schema change. `restart` picks up the `hooks.py` route rule and `web.py`.)

- [ ] **Step 3: End-to-end manual verification on `project.vernon.id/web`** (per the live-site convention this is the test phase). Walk each:
  - Auth gate: logged-out → Login; bad creds → error; good creds → Today.
  - The three core flows: (a) advance a task from Today → Project Item; (b) edit a task's notes + day allocations; (c) drill Projects → Project → Detail → Item.
  - Permission-gated actions hidden for a non-owner/non-leader account (New project, Edit, Delete, +Todo, +Detail).
  - Review queue approve.
  - Theme toggle persists and matches `/m`.
  - **Regression: `/m` mobile app fully unaffected** — open it, navigate, confirm no SW/cache clash, no white screen.

- [ ] **Step 4: Final commit / branch wrap**

```bash
git add -A && git commit -m "chore(web): v1 desktop web app verification pass"
```
Then use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Self-Review

**Spec coverage:**
- Architecture / alias scheme → Task 1 (vite/tsconfig `@`→`../frontend/src`, `@web`→`./src`). ✓
- Build & serve plumbing table → Task 1 (package base, outDir, web.html, web.py, route rule, no SW). ✓
- Frontend bootstrap (persist `vernon-web-cache`, basename, no SW, boot gate, onboarding dropped) → Task 2. ✓
- AppShell sidebar/topbar/responsive → Task 3. ✓
- Dialog/Drawer/Popover → Task 4. ✓
- Login → Task 5. ✓ Today (ring rebuild, lens, filters popover, points card) → Task 6. ✓ Projects (search, segmented, grid, create dialog) → Task 7. ✓ Project master-detail + nested route + dialogs/drawer → Task 8. ✓ Project Item (right pane + standalone, stepper/notes/allocations/focus) → Task 9. ✓ Project Detail standalone → Task 10. ✓ Review table → Task 11. ✓ Me + change password → Task 12. ✓
- Testing (live-site verify, /m unaffected) → Task 13 + every task's verify step. ✓
- Risks: alias coupling (contract enforced — web imports only reuse list), sheet→dialog parity (each dialog task says "diff field-by-field against the sheet"), CommentThread dark-mode/doctype (flagged in Tasks 9/10 to verify the reference doctype string), CSRF (Task 1 index.html). ✓

**Known verification points deliberately deferred to implementation (flagged inline, not placeholders):** exact `CommentThread` `referenceDoctype` strings; whether `ProjectFull.project_details[]` carries `items`/`can_create` or only counts; `blocked_by` being a project-link vs user; `FilterButton` ref forwarding. Each is called out at its task with the fallback action — these are real API-shape confirmations the implementer must make against the running site, not missing plan content.

**Placeholder scan:** No "TBD/handle errors/add validation" left as the *deliverable*; every code step carries real code. The few "port field-for-field from mobile sheet X" steps name the exact source file, target container, and hooks — that is a concrete mechanical instruction, not a vague placeholder.

**Type consistency:** Hook names match the explorer map (`useSetTodoAllocations`, `useAdvanceStatus`, `useChangeMyPassword`, `permFlags`, `canCreateProject`, etc.). Overlay prop names consistent across consumers (`Dialog`/`Drawer`: `open,onClose,title`; `Popover`: `open,onClose,anchorRef`). `ProjectFormDialog` signature `{open,onClose,project?,onSaved?}` used identically in Tasks 7 and 8.
