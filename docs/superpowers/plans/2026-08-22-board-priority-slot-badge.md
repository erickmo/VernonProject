# Priority-Slot Badge on the By-Project Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Plan → My project → By project week board, show each day-card's assignee their remaining priority slots for that day, and let a leader flag the todo priority by tapping the badge.

**Architecture:** Reuse the shipped `get_team_priority_coverage` endpoint via `useTeamPriorityCoverage` (per-member per-day `used`/`slots` for the board's project + week) and the shipped `useSetTodoPriority` toggle. One new shared `PrioritySlotBadge` in `PlanMeta.tsx`; both `PlanProjectBoard.tsx` files plumb the coverage lookup and render it inside their card, deadline-mode only. No backend change.

**Tech Stack:** React 18 + TypeScript + Vite + TanStack Query v5 + Tailwind. Two frontends: `frontend/` (mobile /m), `frontend-web/` (web /w).

## Global Constraints

- **Both frontends, always.** The badge ships to both `PlanProjectBoard.tsx` files (mobile + web), each in its own card idiom. Rebuild both bundles.
- **`PlanMeta.tsx` is token-safe:** only stone/slate + core Tailwind colours that exist in BOTH tailwind configs — NO web-only tokens (`text-muted`, `bg-surface`, `bg-canvas`, `text-ink`). The badge must use stone/slate/amber/rose only.
- **Bahasa Indonesia** end-user copy: `prioritas`, `N slot kosong`, `slot penuh`.
- **Deadline mode only** (`mode === 'deadline'`, i.e. My project → By project). The alloc/My-work board is untouched.
- **No native `confirm/alert/prompt`.**
- **No new endpoint, no schema change.** Reuse `get_team_priority_coverage` + `useSetTodoPriority`.
- **Restart:** `sudo /usr/local/bin/tj-restart`. **SW bump** on ship: `ASSET_CACHE` in `frontend/sw-custom.js` (currently `vernon-assets-v22`) → next version, so installed PWAs pick up the rebuild.
- **What's New** row required on ship.
- Tabs for Python (n/a here — frontend only); match each TSX file's existing indentation (2-space).

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/components/PlanMeta.tsx` | new shared `PrioritySlotBadge` component |
| `frontend/src/components/PlanProjectBoard.tsx` | mobile board: coverage hook + lookup + badge in `card()` + toggle |
| `frontend-web/src/components/PlanProjectBoard.tsx` | web board: same, in the web card idiom |
| build artifacts + `frontend/sw-custom.js` | ship |

---

### Task 1: `PrioritySlotBadge` shared component

**Files:**
- Modify: `frontend/src/components/PlanMeta.tsx`

**Interfaces:**
- Consumes: nothing new (lucide `Zap` already imported here; `clsx` already imported).
- Produces: `PrioritySlotBadge({ used, slots, isPriority, canToggle, pending, onToggle })` — a named export. Tasks 2 & 3 render it. Renders `null` when `slots <= 0`.

- [ ] **Step 1: Add the component**

Append to `frontend/src/components/PlanMeta.tsx` (after the existing `PriorityBadge`). `Zap` is
already in the `lucide-react` import at the top of the file; `clsx` is already imported — do not
re-import them.

```tsx
// Per-card priority-slot badge for the By-project board: shows the card assignee's
// remaining priority slots on the card's day, and (for a leader) toggles the todo's
// priority on tap. Three states — already-priority / room-left / full — plus a
// null-render when the feature is off (slots <= 0). Token-safe (amber/stone/slate
// only) so it works in both frontends' PlanProjectBoard. `pending` dims + disables it
// while the toggle mutation for THIS card is in flight. onToggle must NOT need the
// event; the badge stops propagation itself so it never triggers the card's own tap.
export function PrioritySlotBadge({
  used,
  slots,
  isPriority,
  canToggle,
  pending,
  onToggle,
}: {
  used: number
  slots: number
  isPriority: boolean
  canToggle: boolean
  pending: boolean
  onToggle: () => void
}) {
  if (!slots) return null
  const free = slots - used
  const full = !isPriority && free <= 0
  const tappable = canToggle && !full && !pending
  const label = isPriority ? 'prioritas' : full ? `slot penuh (${used}/${slots})` : `${free} slot kosong`
  const tone = isPriority
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : full
      ? 'bg-stone-100 text-stone-500 dark:bg-slate-700 dark:text-slate-400'
      : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
  return (
    <span
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      aria-label={tappable ? (isPriority ? 'Lepas prioritas' : 'Jadikan prioritas') : undefined}
      onClick={
        tappable
          ? (e) => {
              e.stopPropagation()
              onToggle()
            }
          : undefined
      }
      className={clsx(
        'mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        tone,
        tappable && 'cursor-pointer active:scale-95',
        pending && 'animate-pulse opacity-60',
      )}
    >
      <Zap className="h-3 w-3" fill={isPriority ? 'currentColor' : 'none'} />
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```

Expected: no NEW errors vs baseline (baseline is 3 pre-existing errors in Confirm.tsx /
presence.selfcheck.ts / Profile.tsx). Run `npx tsc --noEmit 2>&1 | grep -c "error TS"` before and
after; the count must not increase.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlanMeta.tsx
git commit -m "feat(priority): PrioritySlotBadge shared component for the board"
```

---

### Task 2: Wire the badge into both `PlanProjectBoard.tsx` files

**Files:**
- Modify: `frontend/src/components/PlanProjectBoard.tsx` (mobile)
- Modify: `frontend-web/src/components/PlanProjectBoard.tsx` (web)

**Interfaces:**
- Consumes: `PrioritySlotBadge` (Task 1); `useTeamPriorityCoverage(project, weekStart)` and
  `useSetTodoPriority()` from `@/hooks/useData` (both already shipped); `ProjectItem.is_priority` /
  `.can_prioritize` / `.assigned_to` / `.deadline` / `.project` (all existing fields).
- Produces: nothing downstream.

`useTeamPriorityCoverage(project, weekStart)` returns
`{ data?: { members: { user: string; full_name: string; days: { date: string; used: number; slots: number; contributed: boolean }[] }[] } }`.
`useSetTodoPriority()` returns a TanStack mutation; call `.mutate({ todoName: string, isPriority: boolean })`;
`.isPending` and `.variables` (the in-flight vars) drive per-card pending.

- [ ] **Step 1: Mobile — add imports**

In `frontend/src/components/PlanProjectBoard.tsx`, extend the existing PlanMeta import and the
useData import:

```tsx
import { AssigneeTag, PlanLegend, PrioritySlotBadge } from '@/components/PlanMeta'
import { useMoveTodoPlan, useMoveTodoDeadline, useTeamPriorityCoverage, useSetTodoPriority } from '@/hooks/useData'
```

(These two import lines already exist — add `PrioritySlotBadge` to the first and
`useTeamPriorityCoverage, useSetTodoPriority` to the second; don't add new import lines.)

- [ ] **Step 2: Mobile — coverage hook + lookup + toggle handler**

Immediately after the existing `const detailTotal = useMemo(() => estOf(detailTodos), [detailTodos])`
line, add:

```tsx
  // Priority-slot occupancy for this detail's project across the board week — reused
  // from the Tim view's endpoint. Deadline mode only (the leader is placing due dates).
  const boardProject = detailTodos[0]?.project ?? ''
  const occ = useTeamPriorityCoverage(deadlineMode ? boardProject : '', boardWeekStart)
  const occByUserDate = useMemo(() => {
    const m = new Map<string, Map<string, { used: number; slots: number }>>()
    for (const mem of occ.data?.members ?? []) {
      const dm = new Map<string, { used: number; slots: number }>()
      for (const d of mem.days) dm.set(d.date, { used: d.used, slots: d.slots })
      m.set(mem.user, dm)
    }
    return m
  }, [occ.data])
  const setPriority = useSetTodoPriority()
```

(`deadlineMode` and `boardWeekStart` are already defined above this point; `useMemo` is already
imported.)

- [ ] **Step 3: Mobile — render the badge inside `card()`**

In `card()`, immediately after the existing assignee block:

```tsx
        {t.assigned_to_name && (
          <div className="mt-1 pr-6">
            <AssigneeTag name={t.assigned_to_name} />
          </div>
        )}
```

insert:

```tsx
        {deadlineMode && t.assigned_to && t.deadline && weekSet.has(t.deadline) && (() => {
          const cell = occByUserDate.get(t.assigned_to)?.get(t.deadline)
          if (!cell) return null
          return (
            <PrioritySlotBadge
              used={cell.used}
              slots={cell.slots}
              isPriority={!!t.is_priority}
              canToggle={!!t.can_prioritize}
              pending={setPriority.isPending && setPriority.variables?.todoName === t.name}
              onToggle={() => setPriority.mutate({ todoName: t.name, isPriority: !t.is_priority })}
            />
          )
        })()}
```

`weekSet` is already defined in this file (`const weekSet = useMemo(() => new Set(weekDates), [weekDates])`).
The badge's own `onClick` calls `stopPropagation`, so it won't trigger the card's pick-to-move tap
(same isolation the existing Info button uses).

- [ ] **Step 4: Web — add imports**

In `frontend-web/src/components/PlanProjectBoard.tsx`, extend the same two import lines:

```tsx
import { AssigneeTag, PlanLegend, PrioritySlotBadge } from '@/components/PlanMeta'
import { useMoveTodoPlan, useMoveTodoDeadline, useTeamPriorityCoverage, useSetTodoPriority } from '@/hooks/useData'
```

- [ ] **Step 5: Web — coverage hook + lookup + toggle handler**

The web file has no `weekSet` (it uses `weekDates.includes(...)`). After the existing
`const detailTotal = useMemo(() => estOf(detailTodos), [detailTodos])` line, add the same block
plus a `weekSet` for the membership test:

```tsx
  const weekSet = useMemo(() => new Set(weekDates), [weekDates])
  // Priority-slot occupancy for this detail's project across the board week — reused
  // from the Tim view's endpoint. Deadline mode only (the leader is placing due dates).
  const boardProject = detailTodos[0]?.project ?? ''
  const occ = useTeamPriorityCoverage(deadlineMode ? boardProject : '', boardWeekStart)
  const occByUserDate = useMemo(() => {
    const m = new Map<string, Map<string, { used: number; slots: number }>>()
    for (const mem of occ.data?.members ?? []) {
      const dm = new Map<string, { used: number; slots: number }>()
      for (const d of mem.days) dm.set(d.date, { used: d.used, slots: d.slots })
      m.set(mem.user, dm)
    }
    return m
  }, [occ.data])
  const setPriority = useSetTodoPriority()
```

- [ ] **Step 6: Web — render the badge inside `card()`**

In the web `card()`, immediately after the existing assignee block:

```tsx
        {t.assigned_to_name && (
          <div className="mt-1">
            <AssigneeTag name={t.assigned_to_name} />
          </div>
        )}
```

insert:

```tsx
        {deadlineMode && t.assigned_to && t.deadline && weekSet.has(t.deadline) && (() => {
          const cell = occByUserDate.get(t.assigned_to)?.get(t.deadline)
          if (!cell) return null
          return (
            <PrioritySlotBadge
              used={cell.used}
              slots={cell.slots}
              isPriority={!!t.is_priority}
              canToggle={!!t.can_prioritize}
              pending={setPriority.isPending && setPriority.variables?.todoName === t.name}
              onToggle={() => setPriority.mutate({ todoName: t.name, isPriority: !t.is_priority })}
            />
          )
        })()}
```

The web card is a `<div>` whose `onClick` opens the detail drawer; the badge's `stopPropagation`
prevents that. (The badge is inside a `draggable` div — a click, not a drag, toggles; a drag still
moves the card, which is fine.)

- [ ] **Step 7: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: mobile 3 (baseline), web 5 (baseline) — no increase. If `setPriority.variables` triggers
a TS error (its type is `{ todoName: string; isPriority: boolean } | undefined`), the `?.todoName`
access already guards it; if TS still complains, cast via `setPriority.variables?.todoName` which is
already optional-chained — no cast should be needed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/PlanProjectBoard.tsx frontend-web/src/components/PlanProjectBoard.tsx
git commit -m "feat(priority): free-slot badge on By-project board cards, both frontends

Each day-column card shows its assignee's remaining priority slots for that day
(reusing get_team_priority_coverage), and a leader can tap it to flag the todo
priority (useSetTodoPriority). Deadline mode only; badge isolates its tap from
the card's move/open handlers."
```

---

### Task 3: Ship — build, SW bump, What's New

**Files:**
- Modify: `frontend/sw-custom.js` (ASSET_CACHE bump), build output, `docs/assets/data.js` (regen — expected no-diff)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Confirm no endpoint/doctype change**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

Expected: no diff (frontend-only change). If there IS a diff, commit `docs/assets/data.js` with the
build in Step 5.

- [ ] **Step 2: Bump the service-worker cache version**

In `frontend/sw-custom.js`, change the `ASSET_CACHE` line (currently `vernon-assets-v22`) to the
next version and add a one-line comment above it:

```js
// v23: flush stale /m shell for the By-project board priority-slot badge.
const ASSET_CACHE = 'vernon-assets-v23'
```

- [ ] **Step 3: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

- [ ] **Step 4: Verify the badge string reached the exact live bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
MJS=$(grep -o 'frontend/assets/index-[^"]*\.js' vernon_project/www/m.html | head -1)
WJS=$(grep -o 'frontend_web/assets/index-[^"]*\.js' vernon_project/www/w.html | head -1)
grep -l "slot kosong" "vernon_project/public/$MJS" && grep -l "slot kosong" "vernon_project/public/$WJS"
grep -o "vernon-assets-v23" vernon_project/www/vernon_sw.js | head -1
```

Expected: both bundle files listed (string present), and `vernon-assets-v23` in the deployed SW.

- [ ] **Step 5: Restart + commit build output**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/sw-custom.js vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js
git diff --cached --name-only | grep -vE 'sw-custom.js|public/frontend|www/(m|w).html|www/vernon_sw.js' && echo "!! unexpected staged" || echo "clean: artifacts + SW only"
git commit -m "chore: rebuild bundles + bump SW for By-project slot badge"
```

- [ ] **Step 6: Purge Cloudflare (asset cache is 1yr; PWA + web need the new bundle)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
MURLS=$(grep -oE 'assets/vernon_project/frontend/assets/[^"]+\.(js|css)' vernon_project/www/m.html | sort -u | sed 's#^#https://project.vernon.id/#')
WURLS=$(grep -oE 'assets/vernon_project/frontend_web/assets/[^"]+\.(js|css)' vernon_project/www/w.html | sort -u | sed 's#^#https://project.vernon.id/#')
FILES=$(printf '%s\n' $MURLS $WURLS "https://project.vernon.id/vernon_sw.js" "https://project.vernon.id/m" "https://project.vernon.id/w" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
TOKEN=$(cat ~/.cf_token); ZONE=bd13d791fab46ac955b9b068edefc049
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" --data "{\"files\":$FILES}" | python3 -m json.tool
```

Expected: `"success": true`. Then verify a bundle serves full bytes:
`curl -sk -o /dev/null -w "%{http_code} %{size_download}\n" "https://project.vernon.id/$MJS"` → `200` + non-zero.

- [ ] **Step 7: What's New row**

Newest version check + insert (bump minor — new user-visible capability):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version"], order_by="creation desc", limit=1))
EOF
```

Write the row (substitute the bumped minor version + today's date):

```bash
cat > /tmp/claude-1000/board_badge_release.json <<'EOF'
[{"version": "X.Y.0",
  "release_date": "YYYY-MM-DD",
  "title": "Slot Prioritas di Papan Proyek",
  "notes": "Di Plan → My project → By project, tiap kartu harian kini menampilkan sisa slot prioritas orang itu untuk hari tersebut\nTap “N slot kosong” untuk langsung menjadikannya prioritas hari itu — tanpa buka detail\nKartu yang sudah prioritas tampil bertanda, dan hari yang penuh ditandai “slot penuh”",
  "platform": "Both",
  "published": 1}]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/board_badge_release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 8: Verify What's New live, both platforms**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([(p, [r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)][:1]) for p in ("Mobile","Web")])
EOF
```

Expected: `Slot Prioritas di Papan Proyek` first for both.
