# Context Menu on Plan Todo Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click (/w) or long-press (/m) any todo card in the Plan screen to open the existing todo context menu, and add a leader-gated priority toggle to that shared menu.

**Architecture:** A new shared no-arg hook `useTodoMenuTrigger()` returns a per-todo `makeTriggerProps(todo)` factory + `consumeLongPress()`, extracting the trigger boilerplate that's currently inline in `TodoCard`. It's called once per component (Rules-of-Hooks-safe for map-rendered cards) and spread onto each Plan card. The shared menu model (`useTodoMenuGroups`) gains one `Jadikan/Lepas prioritas` item. No backend change.

**Tech Stack:** React 18 + TypeScript + Vite + TanStack Query v5 + Tailwind + React Router. Two frontends: `frontend/` (/m), `frontend-web/` (/w). The context-menu provider is already mounted app-wide in both `App.tsx`.

## Global Constraints

- **Both frontends.** PlanRow is shared (one file); PlanProjectBoard and PlanDeadlineDay are per-frontend (two files each).
- **Reuse the existing menu system** — `useTodoContextMenu()`, `TodoContextMenuProvider` (already mounted), `useTodoMenuGroups`. No new menu UI.
- **Rules of Hooks:** `useTodoMenuTrigger()` is a NO-ARG hook called ONCE per component; `makeTriggerProps(todo)` is a plain function used per card. Never call the hook inside a `.map()`/`card()`.
- **Bahasa** for the new menu item: `Jadikan prioritas` / `Lepas prioritas`.
- **The priority toggle reuses `useSetTodoPriority`** (cap-enforced server-side; already invalidates the occupancy caches). It's added to the SHARED menu model, so it appears everywhere the menu is used — this is intended.
- **Long-press delay `LONG_MS = 450`**, movement-cancel threshold `10px`, mouse pointer ignored for long-press — mirror `TodoCard` exactly.
- **No native `confirm/alert/prompt`.**
- **Restart:** `sudo /usr/local/bin/tj-restart`. **SW bump** on ship (`frontend/sw-custom.js`, currently `vernon-assets-v23` → next). **CF purge** (token `~/.cf_token`, zone `bd13d791fab46ac955b9b068edefc049`).
- **What's New** row on ship. Frontend-only → `gen_docs.py` expected no-diff.
- 2-space indentation in TSX; match each file.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/hooks/useTodoMenuTrigger.tsx` | **new** shared trigger hook (factory + consumeLongPress) |
| `frontend/src/hooks/useTodoMenu.tsx` | add the priority-toggle item to the shared menu model |
| `frontend/src/components/PlanRow.tsx` | shared By-date day-list row — spread trigger on `<li>` |
| `frontend/src/components/PlanDeadlineDay.tsx` | mobile deadline rows — trigger + guard open tap |
| `frontend-web/src/components/PlanDeadlineDay.tsx` | web deadline rows — same |
| `frontend/src/components/PlanProjectBoard.tsx` | mobile board cards — trigger + guard pick tap |
| `frontend-web/src/components/PlanProjectBoard.tsx` | web board cards — trigger + guard open tap |
| build artifacts + `frontend/sw-custom.js` | ship |

---

### Task 1: Shared trigger hook + priority menu item

**Files:**
- Create: `frontend/src/hooks/useTodoMenuTrigger.tsx`
- Modify: `frontend/src/hooks/useTodoMenu.tsx`

**Interfaces:**
- Consumes: `useTodoContextMenu()` from `@/hooks/useTodoMenu`; `ProjectItem`; `useSetTodoPriority` from `@/hooks/useData`.
- Produces: `useTodoMenuTrigger(): { makeTriggerProps(todo: ProjectItem): object; consumeLongPress(): boolean }`. Tasks 2 & 3 consume both by these exact names. Also: a new `t-priority` menu item (no downstream consumers).

- [ ] **Step 1: Create the trigger hook**

Create `frontend/src/hooks/useTodoMenuTrigger.tsx`:

```tsx
import { useRef } from 'react'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import type { ProjectItem } from '@/lib/types'

// Long-press delay + movement cancel threshold — mirror TodoCard's inline trigger.
const LONG_MS = 450

// Shared trigger for the todo context menu (right-click on /w, long-press on /m).
// Call ONCE at a component's top level, then use the returned makeTriggerProps(todo)
// per card — so a list rendered via .map()/card() never calls a hook per row (Rules
// of Hooks). All handlers no-op when no menu provider is mounted. consumeLongPress()
// lets a card whose root ALSO has an onClick (navigate / pick) bail when a long-press
// just fired, so the hold isn't also treated as a tap.
export function useTodoMenuTrigger() {
  const menu = useTodoContextMenu()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPt = useRef<{ x: number; y: number } | null>(null)
  const longFired = useRef(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const makeTriggerProps = (todo: ProjectItem) => {
    if (!menu) return {}
    return {
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        menu.open(todo, { x: e.clientX, y: e.clientY })
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return
        const pt = { x: e.clientX, y: e.clientY }
        startPt.current = pt
        longFired.current = false
        clear()
        timer.current = setTimeout(() => {
          longFired.current = true
          menu.open(todo, pt)
        }, LONG_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startPt.current) return
        if (Math.abs(e.clientX - startPt.current.x) > 10 || Math.abs(e.clientY - startPt.current.y) > 10) clear()
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    }
  }

  // Call at the top of a card's own onClick: returns true (and resets) if the last
  // pointer sequence was a long-press, so the click should be ignored.
  const consumeLongPress = () => {
    if (longFired.current) {
      longFired.current = false
      return true
    }
    return false
  }

  return { makeTriggerProps, consumeLongPress }
}
```

(`React.MouseEvent`/`React.PointerEvent` resolve via the global React types — the same way
`TodoCard.tsx` uses `React.PointerEvent` with only `import { useRef } from 'react'`. Do not add a
default React import.)

- [ ] **Step 2: Add the priority item to the shared menu model**

In `frontend/src/hooks/useTodoMenu.tsx`:

Add `Zap` to the existing `lucide-react` import (it already imports `FolderOpen, Pencil, …, FolderInput, type LucideIcon`):

```tsx
import {
  FolderOpen,
  Pencil,
  CalendarPlus,
  ListTree,
  ExternalLink,
  Play,
  StickyNote,
  CalendarCheck,
  Copy,
  FolderInput,
  Zap,
  type LucideIcon,
} from 'lucide-react'
```

Add `useSetTodoPriority` to the existing `useData` import (currently `import { useSetTodoAllocations } from '@/hooks/useData'`):

```tsx
import { useSetTodoAllocations, useSetTodoPriority } from '@/hooks/useData'
```

Inside `useTodoMenuGroups`, add the hook next to the others (after `const confirm = useConfirm()`):

```tsx
  const setPriority = useSetTodoPriority()
```

In the `todo` group's `items` array, insert the priority item between the `t-today` spread and the
`t-duplicate` item:

```tsx
      // Only the assignee sets the day-plan (backend enforces it too).
      ...(t.is_mine ? [{ key: 't-today', label: planned ? 'Remove from Today' : 'Add to Today', icon: CalendarCheck, onClick: toggleToday }] : []),
      // Leader/owner/admin can flag this todo a priority for its deadline day (cap-enforced server-side).
      ...(t.can_prioritize ? [{ key: 't-priority', label: t.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas', icon: Zap, onClick: () => setPriority.mutate({ todoName: t.name, isPriority: !t.is_priority }) }] : []),
      { key: 't-duplicate', label: 'Duplicate', icon: Copy, onClick: go(`/project-item/${item}?duplicate=1`) },
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 3 (baseline — Confirm.tsx / presence.selfcheck.ts / Profile.tsx). No increase.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/hooks/useTodoMenuTrigger.tsx frontend/src/hooks/useTodoMenu.tsx
git commit -m "feat(plan): shared useTodoMenuTrigger hook + priority toggle in the todo menu"
```

---

### Task 2: Wire the trigger into PlanRow (shared) + both PlanDeadlineDay files

**Files:**
- Modify: `frontend/src/components/PlanRow.tsx`
- Modify: `frontend/src/components/PlanDeadlineDay.tsx`
- Modify: `frontend-web/src/components/PlanDeadlineDay.tsx`

**Interfaces:**
- Consumes: `useTodoMenuTrigger` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: PlanRow (shared) — spread the trigger on the row**

In `frontend/src/components/PlanRow.tsx`, add the import:

```tsx
import { useTodoMenuTrigger } from '@/hooks/useTodoMenuTrigger'
```

At the top of the `PlanRow` component body (before `return (`), add:

```tsx
  const { makeTriggerProps } = useTodoMenuTrigger()
```

Spread it on the root `<li>` (which currently has only `className`):

```tsx
    <li {...makeTriggerProps(todo)} className="rounded-2xl border border-paper-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800/60">
```

PlanRow's `<li>` has no `onClick`, so no `consumeLongPress` guard is needed (its stepper buttons
have their own handlers; a quick tap on a stepper cancels the long-press timer via pointerup).

- [ ] **Step 2: Mobile PlanDeadlineDay — trigger + guard the open tap**

In `frontend/src/components/PlanDeadlineDay.tsx`, add the import:

```tsx
import { useTodoMenuTrigger } from '@/hooks/useTodoMenuTrigger'
```

At the top of the component body (near the existing `const setPriority = useSetTodoPriority()` from
the earlier plan), add:

```tsx
  const { makeTriggerProps, consumeLongPress } = useTodoMenuTrigger()
```

In the `due.map((t) => { … })` row, spread the trigger on the row's `<li>` and guard the
open-detail button. The current row is:

```tsx
                <li
                  key={t.name}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-2xl border border-l-4 bg-paper-card px-3 py-2.5 dark:bg-slate-800',
                    'border-paper-edge dark:border-slate-700',
                    TONE_BORDER[tone],
                  )}
                >
                  <button
                    onClick={() => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
                    className="min-w-0 flex-1 text-left"
                  >
```

Change the `<li>` opening tag to spread the trigger, and guard the open button's onClick:

```tsx
                <li
                  key={t.name}
                  {...makeTriggerProps(t)}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-2xl border border-l-4 bg-paper-card px-3 py-2.5 dark:bg-slate-800',
                    'border-paper-edge dark:border-slate-700',
                    TONE_BORDER[tone],
                  )}
                >
                  <button
                    onClick={() => {
                      if (consumeLongPress()) return
                      navigate(`/project-item/${encodeURIComponent(t.name)}`)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
```

- [ ] **Step 3: Web PlanDeadlineDay — same**

In `frontend-web/src/components/PlanDeadlineDay.tsx`, add the same import and hook call. Its row
`<li>` and open button look like:

```tsx
              <li
                key={t.name}
                className={clsx(
                  'flex items-center gap-2 rounded-2xl border-l-4 bg-surface p-3 shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.06]',
                  TONE_BORDER[tone],
                )}
              >
                <button
                  onClick={() => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
                  className="min-w-0 flex-1 text-left"
                >
```

Spread `{...makeTriggerProps(t)}` on the `<li>` and guard the open button's onClick with
`if (consumeLongPress()) return` before the `navigate(...)`, exactly as in Step 2.

- [ ] **Step 4: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: mobile 3, web 5 (baselines). No increase.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/PlanRow.tsx frontend/src/components/PlanDeadlineDay.tsx frontend-web/src/components/PlanDeadlineDay.tsx
git commit -m "feat(plan): context-menu trigger on PlanRow + PlanDeadlineDay, both frontends"
```

---

### Task 3: Wire the trigger into both PlanProjectBoard files

**Files:**
- Modify: `frontend/src/components/PlanProjectBoard.tsx` (mobile — tap-to-pick card)
- Modify: `frontend-web/src/components/PlanProjectBoard.tsx` (web — draggable card)

**Interfaces:**
- Consumes: `useTodoMenuTrigger` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: Mobile board — hook + spread + guard the pick tap**

In `frontend/src/components/PlanProjectBoard.tsx`, add the import:

```tsx
import { useTodoMenuTrigger } from '@/hooks/useTodoMenuTrigger'
```

At the top of the component body (near the other hooks, e.g. after `const setPriority = useSetTodoPriority()`),
add:

```tsx
  const { makeTriggerProps, consumeLongPress } = useTodoMenuTrigger()
```

The mobile `card()` renders a `<button>` whose `onClick` is a conditional expression. Its current
open tag is:

```tsx
      <button
        key={t.name}
        disabled={moving}
        onClick={
          !picked
            ? () => setPicked(t)
            : isPicked
              ? (e) => {
                  e.stopPropagation()
                  setPicked(null)
                }
              : undefined
        }
```

Change it to spread the trigger and guard the pick branch so a long-press doesn't also pick:

```tsx
      <button
        key={t.name}
        disabled={moving}
        {...makeTriggerProps(t)}
        onClick={
          !picked
            ? () => {
                if (consumeLongPress()) return
                setPicked(t)
              }
            : isPicked
              ? (e) => {
                  e.stopPropagation()
                  setPicked(null)
                }
              : undefined
        }
```

(The Info span and the priority badge inside the card keep their own `stopPropagation`; the
trigger's pointer handlers live on the outer button and long-press anywhere on the card opens its
menu.)

- [ ] **Step 2: Web board — hook + spread + guard the open tap**

In `frontend-web/src/components/PlanProjectBoard.tsx`, add the same import and hook call at the top
of the component. The web `card()` renders a draggable `<div>` whose current open tag / onClick is:

```tsx
      <div
        key={t.name}
        draggable={!moving}
        onDragStart={(e) => { … }}
        onDragEnd={() => { … }}
        onClick={() => {
          // A plain click opens the detail drawer; a drag fires dragstart/end and
          // suppresses click, so the two don't collide.
          if (!moving) navigate(`/project-item/${encodeURIComponent(t.name)}`)
        }}
        title="Open detail"
        className={clsx( … )}
      >
```

Spread `{...makeTriggerProps(t)}` on the `<div>` (add it right after `draggable={!moving}`), and
guard the onClick:

```tsx
        onClick={() => {
          if (consumeLongPress()) return
          if (!moving) navigate(`/project-item/${encodeURIComponent(t.name)}`)
        }}
```

On web, the trigger's pointer handlers ignore mouse, so drag (mouse) is unaffected; right-click
fires `onContextMenu`. Touch long-press opens the menu; `onPointerMove` (>10px) cancels so a
touch-drag still moves the card.

- [ ] **Step 3: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: mobile 3, web 5. No increase.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/PlanProjectBoard.tsx frontend-web/src/components/PlanProjectBoard.tsx
git commit -m "feat(plan): context-menu trigger on By-project board cards, both frontends"
```

---

### Task 4: Ship — build, SW bump, CF purge, What's New

**Files:** build output, `frontend/sw-custom.js`, `docs/assets/data.js` (expected no-diff).

- [ ] **Step 1: Confirm no app-shape change**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

Expected: no diff (frontend-only). If there is one, include `docs/assets/data.js` in the Step 5 commit.

- [ ] **Step 2: Bump the SW cache version**

In `frontend/sw-custom.js`, add a comment line and bump (currently `vernon-assets-v23`):

```js
// v24: flush stale /m shell for the Plan context-menu trigger.
const ASSET_CACHE = 'vernon-assets-v24'
```

- [ ] **Step 3: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

- [ ] **Step 4: Verify the menu item reached the live bundles + SW is v24**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
MJS=$(grep -o 'frontend/assets/index-[^"]*\.js' vernon_project/www/m.html | head -1)
WJS=$(grep -o 'frontend_web/assets/index-[^"]*\.js' vernon_project/www/w.html | head -1)
grep -l "Jadikan prioritas" "vernon_project/public/$MJS" && grep -l "Jadikan prioritas" "vernon_project/public/$WJS"
grep -o "vernon-assets-v24" vernon_project/www/vernon_sw.js | head -1
```

Expected: both bundle files listed, and `vernon-assets-v24`. (Note: "Jadikan prioritas" already
existed in bundles from the earlier detail-menu toggle; its presence here just confirms the build
ran — the new behavior is the Plan-card trigger, not a new string.)

- [ ] **Step 5: Restart + commit build output**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/sw-custom.js vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js
git diff --cached --name-only | grep -vE 'sw-custom.js|public/frontend|www/(m|w).html|www/vernon_sw.js' && echo "!! unexpected staged" || echo "clean: artifacts + SW only"
git commit -m "chore: rebuild bundles + bump SW for Plan context menu"
```

- [ ] **Step 6: Purge Cloudflare**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
MURLS=$(grep -oE 'assets/vernon_project/frontend/assets/[^"]+\.(js|css)' vernon_project/www/m.html | sort -u | sed 's#^#https://project.vernon.id/#')
WURLS=$(grep -oE 'assets/vernon_project/frontend_web/assets/[^"]+\.(js|css)' vernon_project/www/w.html | sort -u | sed 's#^#https://project.vernon.id/#')
FILES=$(printf '%s\n' $MURLS $WURLS "https://project.vernon.id/vernon_sw.js" "https://project.vernon.id/m" "https://project.vernon.id/w" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
TOKEN=$(cat ~/.cf_token); ZONE=bd13d791fab46ac955b9b068edefc049
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" --data "{\"files\":$FILES}" | python3 -m json.tool
```

Expected `"success": true`. Then confirm a bundle serves 200 + non-zero:
`curl -sk -o /dev/null -w "%{http_code} %{size_download}\n" "https://project.vernon.id/$MJS"`.

- [ ] **Step 7: What's New row**

Check newest version, then insert (minor bump — new capability):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version"], order_by="creation desc", limit=1))
EOF
```

Substitute the bumped minor version + today's date:

```bash
cat > /tmp/claude-1000/plan_menu_release.json <<'EOF'
[{"version": "X.Y.0",
  "release_date": "YYYY-MM-DD",
  "title": "Menu Cepat di Layar Plan",
  "notes": "Klik-kanan (web) atau tekan-tahan (HP) todo mana pun di layar Plan untuk menu cepat\nLangsung buka, edit, fokus, tambah ke Today, duplikat, pindah, atau jadikan prioritas — tanpa membuka detail\nBerlaku di semua tampilan Plan: By date, By project, dan daftar tenggat My project",
  "platform": "Both",
  "published": 1}]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/plan_menu_release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 8: Verify What's New live both platforms**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([(p, [r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)][:1]) for p in ("Mobile","Web")])
EOF
```

Expected: `Menu Cepat di Layar Plan` first for both.

## Testing notes (manual, on ship)

- Right-click (/w) and long-press (/m) open the menu on: a PlanRow (My work → By date), a
  By-project board card, and a PlanDeadlineDay row.
- The new `Jadikan/Lepas prioritas` item shows only for leaders (`can_prioritize`), toggles, and
  the board slot badge / Tim view refresh (the toggle invalidates their caches).
- Existing taps still work: PlanRow steppers; board pick-to-move (mobile) / drag (web); deadline
  row open + clear-deadline; and a long-press does NOT also pick/open (guarded by `consumeLongPress`).
- Known minor: long-pressing *exactly* on the board card's small slot badge can both open the menu
  and toggle priority (the badge's own click isn't long-press-guarded). Rare; acceptable.
