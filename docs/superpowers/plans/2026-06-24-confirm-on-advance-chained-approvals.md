# Confirm-on-Advance + Chained Approvals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Project Todo status advance (`Mark Done` / `Approve (Leader)` / `Approve (Owner)`) opens a confirm dialog; when the same user can perform the next step too, the dialog stays open and relabels so approvals chain in one session.

**Architecture:** Backend `update_status` is extended to return the post-advance `status_key`, `can_advance`, and `next_status_label` for the acting user. A single shared `AdvanceProvider` (a context exposing `useAdvance()`) renders one confirm modal, runs the advance mutation, and either relabels-and-stays-open (chain) or closes based on that response. All four call sites — two mobile, two web — route through `useAdvance()` instead of mutating directly.

**Tech Stack:** Frappe (Python) backend; React + TypeScript + @tanstack/react-query + Tailwind frontends. Two Vite apps: `frontend` (mobile PWA, alias `@` → `frontend/src`) and `frontend-web` (desktop, alias `@web` → `frontend-web/src`, and `@` → `../frontend/src` — so `frontend/src` code is **shared** into web).

## Global Constraints

- **Endpoint is shared:** both apps call `vernon_project.api.project_todo.update_status` via `mobileApi.advanceStatus` (`frontend/src/lib/api.ts`). One backend change serves both.
- **`useAdvanceStatus` and all of `frontend/src` are shared** into the web app via the `@` alias. Put shared UI in `frontend/src/components`.
- **No automated tests** this cycle — single LIVE site (`project.vernon.id`), no test DB; testing is manual and deferred to the final task per project convention. Each code task is gated by a clean build instead of a unit test.
- **Deploy mechanics:** Python changes require `bench restart`; frontend changes require `npm run build` per app. No schema/DocType change here, so **no `bench migrate`**.
- **`vernon_project/api/project_todo.py` uses TAB indentation** — match it exactly when editing.
- **Confirm-dialog convention:** never native `alert/confirm/prompt`; the new modal is a styled overlay consistent with `frontend/src/components/Confirm.tsx`.
- **Permission rules are authoritative server-side** (`update_status`); the UI only mirrors them. `_can_advance` / `NEXT_LABEL` / `_status_key` live in `vernon_project/api/mobile.py` and are imported by the backend change (one-directional import — `mobile.py` does not import `project_todo`, verified no circular import).

---

### Task 1: Backend — return post-advance state from `update_status`

**Files:**
- Modify: `vernon_project/api/project_todo.py` (function `update_status`, lines 9-73)

**Interfaces:**
- Produces: `update_status(todo_id)` now returns, on a successful save, the existing
  `{status, message}` plus `status_key: "planned"|"done"|"checked"|"completed"`,
  `can_advance: bool` (for the acting user against the NEW status),
  `next_status_label: str|None`. Early error/info returns are unchanged (no extra fields).

- [ ] **Step 1: Add a function-local import at the top of `update_status`**

Immediately after the docstring (before `try:`), add (TAB-indented):

```python
	from vernon_project.api.mobile import _can_advance, _status_key, NEXT_LABEL
```

(Local import keeps module load order safe and follows the Frappe pattern for cross-API helpers.)

- [ ] **Step 2: Replace the success return block**

Replace the current success return (lines 65-68):

```python
		# Save and ignore permission
		todo.save(ignore_permissions=True)

		return {"status": "info", "message": f"Todo {todo.to_do} is updated to {todo.status}."}
```

with (TAB-indented):

```python
		# Save and ignore permission
		todo.save(ignore_permissions=True)

		new_key = _status_key(todo.status)
		return {
			"status": "info",
			"message": f"Todo {todo.to_do} is updated to {todo.status}.",
			"status_key": new_key,
			"can_advance": new_key != "completed" and _can_advance(new_key, project, user, todo.assigned_to),
			"next_status_label": NEXT_LABEL.get(new_key),
		}
```

Leave the `elif todo.status == "✅ Completed"` info-return and all error returns untouched.

- [ ] **Step 3: Syntax-check both modules**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m py_compile vernon_project/api/project_todo.py vernon_project/api/mobile.py`
Expected: no output (exit 0).

- [ ] **Step 4: Verify the cross-module import resolves under the site**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<< "from vernon_project.api.project_todo import update_status; from vernon_project.api.mobile import _can_advance, _status_key, NEXT_LABEL; print('import-ok')"`
Expected: output contains `import-ok` and no ImportError/traceback.

- [ ] **Step 5: Reload Python**

Run: `cd /home/frappe/frappe-bench && bench restart`
Expected: workers restart without error.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/project_todo.py
git commit -m "feat(api): update_status returns post-advance can_advance/next_status_label for chaining"
```

---

### Task 2: Shared `AdvanceProvider` + advance response type + mount in both roots

**Files:**
- Modify: `frontend/src/lib/api.ts` (advanceStatus return type, lines 97-100)
- Create: `frontend/src/components/AdvanceProvider.tsx`
- Modify: `frontend/src/main.tsx` (mount provider)
- Modify: `frontend-web/src/main.tsx` (mount provider)

**Interfaces:**
- Consumes: `useAdvanceStatus()` from `@/hooks/useData` (returns a react-query mutation whose
  `mutateAsync(todoId)` resolves to the Task 1 response).
- Produces: `useAdvance(): (todoId: string, label: string, title?: string) => void` exported from
  `@/components/AdvanceProvider`. Calling it opens the confirm modal for that todo.

- [ ] **Step 1: Widen the advance response type in `api.ts`**

Replace (lines 97-100):

```ts
  advanceStatus: (todoId: string) =>
    api.post<{ status: string; message: string }>(
      'vernon_project.api.project_todo.update_status',
      { todo_id: todoId },
    ),
```

with:

```ts
  advanceStatus: (todoId: string) =>
    api.post<{
      status: string
      message: string
      status_key?: string
      can_advance?: boolean
      next_status_label?: string | null
    }>('vernon_project.api.project_todo.update_status', { todo_id: todoId }),
```

- [ ] **Step 2: Create `frontend/src/components/AdvanceProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useAdvanceStatus } from '@/hooks/useData'
import { Spinner } from './ui'

// Opens a confirm dialog for a Project Todo status advance. After a successful
// advance, if the SAME user is permitted to advance again, the dialog stays open
// and relabels to the next step so consecutive approvals chain in one session.
// Otherwise the dialog closes. On error it stays open and shows the message.
type AdvanceFn = (todoId: string, label: string, title?: string) => void

const AdvanceCtx = createContext<AdvanceFn>(() => {})
export const useAdvance = () => useContext(AdvanceCtx)

interface State {
  todoId: string
  label: string // current step's action label, e.g. "Approve (Leader)"
  title: string // task title, shown for context
}

export function AdvanceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const advance = useAdvanceStatus()

  const open = useCallback<AdvanceFn>((todoId, label, title = '') => {
    setError(null)
    setState({ todoId, label, title })
  }, [])

  const close = useCallback(() => {
    if (advance.isPending) return // never close mid-mutation
    setState(null)
    setError(null)
  }, [advance.isPending])

  const confirm = useCallback(async () => {
    if (!state || advance.isPending) return
    setError(null)
    try {
      const res = await advance.mutateAsync(state.todoId)
      if (res.can_advance && res.next_status_label) {
        // chain: relabel and keep the dialog open for the next step
        const nextLabel = res.next_status_label
        setState((s) => (s ? { ...s, label: nextLabel } : s))
      } else {
        setState(null) // no further step for this user → close
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance')
    }
  }, [state, advance])

  useEffect(() => {
    if (!state) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [state, close, confirm])

  return (
    <AdvanceCtx.Provider value={open}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={close} />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{state.label}?</h2>
            {state.title && (
              <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">{state.title}</p>
            )}
            {error && (
              <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={close}
                disabled={advance.isPending}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600 disabled:opacity-60"
              >
                {error ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={confirm}
                disabled={advance.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
              >
                {advance.isPending ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <>
                    {state.label}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdvanceCtx.Provider>
  )
}
```

- [ ] **Step 3: Mount `AdvanceProvider` in the mobile root**

In `frontend/src/main.tsx`, add the import after the `ConfirmProvider` import:

```tsx
import { AdvanceProvider } from './components/AdvanceProvider'
```

Then wrap `<App />` — change:

```tsx
        <ToastProvider>
          <ConfirmProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ConfirmProvider>
        </ToastProvider>
```

to:

```tsx
        <ToastProvider>
          <ConfirmProvider>
            <AdvanceProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AdvanceProvider>
          </ConfirmProvider>
        </ToastProvider>
```

- [ ] **Step 4: Mount `AdvanceProvider` in the web root**

In `frontend-web/src/main.tsx`, add after the `ConfirmProvider` import:

```tsx
import { AdvanceProvider } from '@/components/AdvanceProvider'
```

Then apply the identical wrap of `<App />` (insert `<AdvanceProvider>` directly inside `<ConfirmProvider>`, wrapping `<ErrorBoundary>`).

- [ ] **Step 5: Build both apps**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds, no unresolved-import / missing-export errors.

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/api.ts frontend/src/components/AdvanceProvider.tsx frontend/src/main.tsx frontend-web/src/main.tsx
git commit -m "feat(web/mobile): shared AdvanceProvider confirm dialog with chained approvals"
```

---

### Task 3: Route mobile call sites through `useAdvance`

**Files:**
- Modify: `frontend/src/components/TodoCard.tsx`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx`

**Interfaces:**
- Consumes: `useAdvance()` from `@/components/AdvanceProvider` (Task 2).

- [ ] **Step 1: `TodoCard.tsx` — swap imports**

Remove these two import lines (lines 7-8):

```tsx
import { useAdvanceStatus } from '@/hooks/useData'
import { useToast } from './Toast'
```

Add (next to the other component imports):

```tsx
import { useAdvance } from '@/components/AdvanceProvider'
```

In the import from `./ui` (line 6 `import { Avatar, Pill, Spinner } from './ui'`), drop `Spinner` (no longer used here):

```tsx
import { Avatar, Pill } from './ui'
```

- [ ] **Step 2: `TodoCard.tsx` — swap the hook + handler**

Replace (lines 19-31):

```tsx
  const navigate = useNavigate()
  const advance = useAdvanceStatus()
  const toast = useToast()
  const meta = STATUS[todo.status_key]

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (advance.isPending) return
    advance.mutate(todo.name, {
      onSuccess: (res) => toast('success', res.message),
      onError: (err) => toast('error', (err as Error).message),
    })
  }
```

with:

```tsx
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  const meta = STATUS[todo.status_key]

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.next_status_label) advanceConfirm(todo.name, todo.next_status_label, todo.to_do)
  }
```

- [ ] **Step 3: `TodoCard.tsx` — simplify the advance button (dialog now owns the spinner)**

Replace the button body (lines 96-113):

```tsx
      {todo.can_advance && todo.next_status_label && (
        <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <span
            onClick={onAdvance}
            role="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:bg-brand-100 dark:active:bg-brand-500/20"
          >
            {advance.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                {todo.next_status_label}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </span>
        </div>
      )}
```

with:

```tsx
      {todo.can_advance && todo.next_status_label && (
        <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <span
            onClick={onAdvance}
            role="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:bg-brand-100 dark:active:bg-brand-500/20"
          >
            {todo.next_status_label}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      )}
```

- [ ] **Step 4: `ProjectItemScreen.tsx` — swap imports**

In the `@/hooks/useData` import (line 36), remove `useAdvanceStatus,`:

```tsx
import { useProjectItem, useSaveNotes, useUpdateTodo, useScoringGroups, useScoringGroup, useSetTodoAllocations, useCancelTodo, useRestoreTodo } from '@/hooks/useData'
```

Add near the other component imports:

```tsx
import { useAdvance } from '@/components/AdvanceProvider'
```

- [ ] **Step 5: `ProjectItemScreen.tsx` — swap the hook + handler**

Replace (line 613):

```tsx
  const advance = useAdvanceStatus()
```

with:

```tsx
  const advanceConfirm = useAdvance()
```

Replace `onAdvance` (lines 639-643):

```tsx
  const onAdvance = () =>
    advance.mutate(data.name, {
      onSuccess: (res) => toast('success', res.message),
      onError: (err) => toast('error', (err as Error).message),
    })
```

with:

```tsx
  const onAdvance = () => {
    if (data.next_status_label) advanceConfirm(data.name, data.next_status_label, data.to_do)
  }
```

(`toast` stays — it is still used by `onCancel`/`onRestore`. `Spinner` stays — still used by the cancel/restore buttons.)

- [ ] **Step 6: `ProjectItemScreen.tsx` — simplify the advance button**

Replace the advance `<button>` (lines 901-914):

```tsx
                <button
                  onClick={onAdvance}
                  disabled={advance.isPending}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:bg-brand-700 disabled:opacity-60"
                >
                  {advance.isPending ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <>
                      {data.next_status_label}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
```

with:

```tsx
                <button
                  onClick={onAdvance}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:bg-brand-700"
                >
                  {data.next_status_label}
                  <ArrowRight className="h-4 w-4" />
                </button>
```

- [ ] **Step 7: Build the mobile app**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds (no unused-import or unresolved-symbol errors for `useAdvanceStatus`/`useToast`/`Spinner`).

- [ ] **Step 8: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/TodoCard.tsx frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(mobile): route todo advance through AdvanceProvider confirm dialog"
```

---

### Task 4: Route web call sites through `useAdvance`

**Files:**
- Modify: `frontend-web/src/pages/Review.tsx`
- Modify: `frontend-web/src/pages/ProjectItem.tsx`

**Interfaces:**
- Consumes: `useAdvance()` from `@/components/AdvanceProvider` (Task 2).

- [ ] **Step 1: `Review.tsx` — swap imports**

Change (line 4):

```tsx
import { useDashboard, useAdvanceStatus } from '@/hooks/useData'
```

to:

```tsx
import { useDashboard } from '@/hooks/useData'
```

Remove the toast import (line 11) — it is only used by the old `approve`:

```tsx
import { useToast } from '@/components/Toast'
```

Add:

```tsx
import { useAdvance } from '@/components/AdvanceProvider'
```

- [ ] **Step 2: `Review.tsx` — swap hook + `approve`**

Replace (lines 16-17):

```tsx
  const advance = useAdvanceStatus()
  const toast = useToast()
```

with:

```tsx
  const advanceConfirm = useAdvance()
```

Replace `approve` (lines 69-76):

```tsx
  const approve = async (id: string) => {
    try {
      const r = await advance.mutateAsync(id)
      toast('success', r.message || 'Approved')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed')
    }
  }
```

with:

```tsx
  const approve = (t: { name: string; next_status_label: string | null; to_do: string }) =>
    advanceConfirm(t.name, t.next_status_label || 'Approve', t.to_do)
```

- [ ] **Step 3: `Review.tsx` — update the button**

Replace (lines 162-171):

```tsx
                        {t.can_advance && (
                          <button
                            onClick={() => approve(t.name)}
                            disabled={advance.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            {t.next_status_label || 'Approve'}
                          </button>
                        )}
```

with:

```tsx
                        {t.can_advance && (
                          <button
                            onClick={() => approve(t)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            {t.next_status_label || 'Approve'}
                          </button>
                        )}
```

- [ ] **Step 4: `ProjectItem.tsx` (web) — swap imports**

In the `@/hooks/useData` import block, remove the `useAdvanceStatus,` line (line 31). Add near the other component imports:

```tsx
import { useAdvance } from '@/components/AdvanceProvider'
```

(`useToast` stays — it is used throughout this file by other handlers.)

- [ ] **Step 5: `ProjectItem.tsx` (web) — swap hook + handler**

Replace (line 661):

```tsx
  const advance = useAdvanceStatus()
```

with:

```tsx
  const advanceConfirm = useAdvance()
```

Replace `onAdvance` (lines 688-692):

```tsx
  const onAdvance = () =>
    advance.mutate(data.name, {
      onSuccess: (res) => toast('success', res.message),
      onError: (err) => toast('error', (err as Error).message),
    })
```

with:

```tsx
  const onAdvance = () => {
    if (data.next_status_label) advanceConfirm(data.name, data.next_status_label, data.to_do)
  }
```

- [ ] **Step 6: `ProjectItem.tsx` (web) — simplify the advance button**

Replace the advance `<button>` (lines 957-970):

```tsx
                      <button
                        onClick={onAdvance}
                        disabled={advance.isPending}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
                      >
                        {advance.isPending ? (
                          <Spinner className="h-5 w-5" />
                        ) : (
                          <>
                            {data.next_status_label}
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
```

with:

```tsx
                      <button
                        onClick={onAdvance}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
                      >
                        {data.next_status_label}
                        <ArrowRight className="h-4 w-4" />
                      </button>
```

(`Spinner` stays imported — still used by the cancel/restore buttons in this file.)

- [ ] **Step 7: Build the web app**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: build succeeds (no unused/unresolved `useAdvanceStatus`/`useToast` errors).

- [ ] **Step 8: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Review.tsx frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(web): route todo advance through AdvanceProvider confirm dialog"
```

---

### Task 5: Deploy + manual verification (final phase)

**Files:** none (deploy + verify)

- [ ] **Step 1: Build both frontends (production assets)**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build && cd ../frontend-web && npm run build`
Expected: both succeed; assets emitted under `frontend/dist` and `frontend-web/dist` (vite `--base` paths per `package.json`).

- [ ] **Step 2: Reload backend**

Run: `cd /home/frappe/frappe-bench && bench restart`
Expected: clean restart.

- [ ] **Step 3: Manual verification on `project.vernon.id`** — confirm each, no console errors:

  - **Mobile detail (`/m`, ProjectItemScreen):** as owner, open a Planned todo → tap `Mark Done` → confirm dialog shows `Mark Done?` + task title → confirm → dialog **stays open**, relabels to `Approve (Leader)?` → confirm → stays open, `Approve (Owner)?` → confirm → dialog **closes** at Completed. Stepper reflects final status.
  - **Mobile card (TodoCard):** quick-advance button opens the same dialog; chaining behaves identically.
  - **Web review (`/w`, Review.tsx):** as owner, click the row's advance button → dialog → chain to Completed → row leaves the review queue.
  - **Web detail (`/w`, ProjectItem.tsx):** same chaining on the detail button.
  - **Single-step actor:** as `assigned_to`, `Mark Done` → confirm → dialog **closes** (no chain).
  - **Permission/error path:** trigger a rejected advance (e.g. a leader on a `Checked By PL` item, if reachable) → dialog stays open and shows the server message; `Close` dismisses it.
  - **Cancel/backdrop/Escape:** dismiss the dialog with no change.

- [ ] **Step 4: Final commit (if any verification fix was needed)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A
git commit -m "chore: confirm-on-advance chained approvals — verification fixes"
```

(Skip if no changes.)

---

## Self-Review

**Spec coverage:**
- Confirm dialog on every advance → Tasks 3 & 4 route all four call sites through `useAdvance`; dialog in Task 2. ✓
- Chaining (stay open + relabel when same user can advance again) → `AdvanceProvider.confirm` (Task 2) driven by Task 1's `can_advance`/`next_status_label`. ✓
- Closes when no further step / Completed → `setState(null)` branch. ✓
- Error keeps dialog open with message → `catch` sets `error`. ✓
- Simple confirm, no note field → dialog body is title only; no backend field added. ✓
- Both apps → mobile (Task 3) + web (Task 4); shared provider mounted in both roots (Task 2). ✓
- Cancel/restore untouched → not modified. ✓
- Tests deferred → Task 5 manual verification only. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**Type consistency:** `useAdvance(todoId, label, title?)` defined in Task 2, called with those args in Tasks 3 & 4. Advance response fields `can_advance`/`next_status_label`/`status_key` defined in Task 1 (Python) and typed in Task 2 (`api.ts`), consumed in `AdvanceProvider`. `next_status_label` is `string | null` at call sites → guarded with `if (...next_status_label)` (mobile/detail) or `|| 'Approve'` (web review). ✓
