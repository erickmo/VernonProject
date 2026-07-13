# /w Todo Detail Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a todo anywhere in /w opens its detail in a right-side drawer over the current page; refresh/deep-link falls back to the full page.

**Architecture:** Modal route via synthesized background location in `App.tsx`. Every entry point already navigates to `/project-item/:name`, so one interceptor covers all screens. Reuse `ProjectItem` unchanged inside the existing `overlays/Drawer`.

**Tech Stack:** React 18 + TS, react-router-dom v6, Tailwind, vite. No new dependencies.

## Global Constraints

- Edit ONLY `frontend-web/**`. Shared `../frontend/src` (the `@` alias, mobile `/m`) is OFF LIMITS — do not touch `TodoCard` or any shared file.
- No native `<select>`, no `alert()` (project conventions) — n/a here but do not introduce.
- Live site: per-task check = `cd frontend-web && npx tsc --noEmit` clean. No test runner is installed (no vitest/tsx); the repo's convention is a co-located `*.selfcheck.ts` using `node:assert/strict` (see `src/lib/match.selfcheck.ts`), pinned as executable documentation and verified by `tsc` (it is in the `src/**` glob). Follow that convention — do NOT add vitest/tsx.
- Do NOT `git add -A` — user works in parallel. `git add` exactly the files each task names; re-check `git status` first.
- Reuse `ProjectItem.tsx` verbatim — no `inDrawer` prop, no edits to it.
- All commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01XXKG4Te8Mu1tNpiB7J1bM6`

---

### Task 1: Pure path helper + drawer component

**Files:**
- Create: `frontend-web/src/lib/todoDrawer.ts`
- Create: `frontend-web/src/lib/todoDrawer.selfcheck.ts`
- Create: `frontend-web/src/components/TodoDrawer.tsx`

**Interfaces:**
- Produces: `isTodoPath(path: string): boolean` (used by App.tsx Task 2).
- Produces: default export `TodoDrawer` (React component, prop `{ onClose: () => void }`), used by App.tsx Task 2. It reads `:name` from `useParams` itself.

- [ ] **Step 1: Implement the helper**

`frontend-web/src/lib/todoDrawer.ts`:

```ts
// Single source of truth for "is this the standalone todo-detail route".
// One path segment after /project-item/ (nested item routes and /project-detail
// are deliberately excluded — they render in place, not in the drawer).
const TODO_PATH = /^\/project-item\/[^/]+$/

export function isTodoPath(path: string): boolean {
  return TODO_PATH.test(path)
}
```

- [ ] **Step 2: Write the self-check (repo convention: node:assert, tsc-verified)**

`frontend-web/src/lib/todoDrawer.selfcheck.ts` (mirrors `match.selfcheck.ts`):

```ts
import { isTodoPath } from './todoDrawer'
import assert from 'node:assert/strict'
// bare /project-item/:name → drawer route
assert.equal(isTodoPath('/project-item/T1'), true)
assert.equal(isTodoPath('/project-item/PROJ-ITEM-0001'), true)
// nested item route, sibling detail route, and non-todo paths → NOT the drawer
assert.equal(isTodoPath('/project-item/T1/sub'), false)
assert.equal(isTodoPath('/project-detail/T1'), false)
assert.equal(isTodoPath('/project-item'), false)
assert.equal(isTodoPath('/project-item/'), false)
assert.equal(isTodoPath('/'), false)
assert.equal(isTodoPath('/projects'), false)
console.log('todoDrawer.selfcheck: all assertions passed')
```

- [ ] **Step 3: Write the drawer component**

`frontend-web/src/components/TodoDrawer.tsx`:

```tsx
import { Drawer } from '@web/components/overlays/Drawer'
import ProjectItem from '@web/pages/ProjectItem'

// Renders the full todo detail page inside the app's right-side Drawer.
// Mounted by App.tsx under a <Route path="/project-item/:name">, so
// ProjectItem reads its id from useParams exactly as on the full page.
// closeOnEscape is false: ProjectItem hosts its own cancel/waiting/duplicate
// confirms whose Escape must close THEM, not this drawer.
export default function TodoDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} title="Todo details" widthClass="max-w-2xl" closeOnEscape={false}>
      <ProjectItem />
    </Drawer>
  )
}
```

- [ ] **Step 4: Typecheck (also validates the self-check compiles)**

Run: `cd frontend-web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/lib/todoDrawer.ts frontend-web/src/lib/todoDrawer.selfcheck.ts frontend-web/src/components/TodoDrawer.tsx
git commit -m "feat(web): todo-drawer path helper + drawer component"
```

---

### Task 2: Wire the modal route into App.tsx

**Files:**
- Modify: `frontend-web/src/App.tsx`

**Interfaces:**
- Consumes: `isTodoPath` and `TodoDrawer` from Task 1.

**Current relevant shape of App.tsx** (verbatim):
- Line 2: `import { Routes, Route, Navigate } from 'react-router-dom'`
- The `return (` block (~line 161) renders `<><{showOnboarding && …}><Routes> … </Routes></>`, where the `<Routes>` contains `<Route path="/kiosk/:station" …/>` then `<Route element={<AppShell />}>…all app routes incl `/project-item/:name`…</Route>`.

- [ ] **Step 1: Extend the react-router import**

Change line 2 to:

```tsx
import { Routes, Route, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
```

- [ ] **Step 2: Add imports for the helper + drawer**

After the existing `@web/...` imports near the top (e.g. after the `WhatsNew` import line), add:

```tsx
import { isTodoPath } from '@web/lib/todoDrawer'
import TodoDrawer from '@web/components/TodoDrawer'
```

- [ ] **Step 3: Compute background + drawer state inside `App()`**

The kiosk early-return and boot gating must stay ABOVE this (hooks run every
render, so declare the hooks at the very top of `App()`, but only USE them in
the returned JSX). At the top of `export default function App()` (with the
other hooks, before any early return), add:

```tsx
  const location = useLocation()
  const navigate = useNavigate()
  const bgRef = useRef<Location | null>(null)
  const onTodo = isTodoPath(location.pathname)
  // Freeze the last non-todo page; it stays mounted behind the drawer.
  if (!onTodo) bgRef.current = location
  const showDrawer = onTodo && bgRef.current !== null
  const background = showDrawer ? bgRef.current! : location
  const closeDrawer = () => navigate((bgRef.current?.pathname ?? '/') + (bgRef.current?.search ?? ''))
```

`useRef` must be added to the existing `react` import (`import { useEffect, useRef, useState } from 'react'`).

- [ ] **Step 4: Render app routes against `background` + overlay the drawer**

In the returned JSX, change the app `<Routes>` opening tag to take the
background location, and add the overlay `<Routes>` right after it. Replace:

```tsx
      <Routes>
        <Route path="/kiosk/:station" element={<Kiosk />} />
        <Route element={<AppShell />}>
```

…keeping every child route unchanged, and change ONLY the opening `<Routes>`
to `<Routes location={background}>`. Then immediately after the closing
`</Routes>` of the app routes (before the closing `</>`), add:

```tsx
      {showDrawer && (
        <Routes location={location}>
          <Route path="/project-item/:name" element={<TodoDrawer onClose={closeDrawer} />} />
        </Routes>
      )}
```

(The kiosk pathname early-return at the top of `App` still short-circuits
`/kiosk/*` before any of this, so kiosk is unaffected.)

- [ ] **Step 5: Typecheck**

Run: `cd frontend-web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/App.tsx
git commit -m "feat(web): open todos in a detail drawer over the current page"
```

---

### Task 3: Build, deploy, verify live

**Files:** generated bundle under `vernon_project/public/frontend_web/` + `vernon_project/www/w.html`.

- [ ] **Step 1: Build**

Run: `cd frontend-web && npm run build`
Expected: vite build succeeds; new hashed assets written.

- [ ] **Step 2: Commit build artifacts**

```bash
git add vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "build(web): todo detail drawer bundle"
```

- [ ] **Step 3: Purge Cloudflare + verify bundle non-zero**

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/bd13d791fab46ac955b9b068edefc049/purge_cache" \
  -H "Authorization: Bearer $(cat ~/.cf_token)" -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```
Expected: `"success":true`. Then confirm the live JS bundle referenced by
`/w` is hundreds of KB (not 0 — poisoned-cache gotcha).

- [ ] **Step 4: Live spot-check**

`https://project.vernon.id/w`: click a todo on `/review` and on Home → drawer
slides over the page, URL becomes `/project-item/…`; X and browser-back close
it to the page behind; refresh on `/project-item/…` shows the full page;
workspace item pane still renders inline. Report anything off.
