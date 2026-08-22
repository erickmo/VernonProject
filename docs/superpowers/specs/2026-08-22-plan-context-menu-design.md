# Context Menu on Plan Todo Cards — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation plan

## Context

The app already has a todo context menu — `useTodoContextMenu()` + `TodoContextMenuProvider`
(right-click on /w, long-press on /m) + the shared menu model `useTodoMenuGroups` (see the
`vernon-todo-context-menu` work, shipped 1.17.0). It's live on `TodoCard`, the report rows, and
the project views. The provider is mounted app-wide in both `App.tsx`, so it is already available
on the Plan route — but the Plan screen's own cards never wired up a trigger, so right-click /
long-press does nothing there. This adds the trigger to the Plan cards and adds one leader-oriented
item (a priority toggle) to the shared menu.

## The ask

> Add a context menu to the todo cards in the Plan screen.

## Decisions taken

| Decision | Chosen | Rejected |
|---|---|---|
| Which Plan surfaces | **All three** — PlanRow (By-date day list), the By-project board cards, the PlanDeadlineDay rows | just the day list; just the board |
| Menu content | **Full shared menu + a leader-gated priority toggle** | shared menu verbatim; a Plan-only trimmed set |
| Trigger wiring | **Extract a shared `useTodoMenuTrigger(todo)` hook** | duplicate the ~40-line inline trigger per card |

## Components

### 1. Shared trigger hook — `useTodoMenuTrigger()`

New file `frontend/src/hooks/useTodoMenuTrigger.ts(x)` (shared; both frontends import via `@`).
Extracts the trigger boilerplate currently inline in `TodoCard`. It is a **no-argument hook** —
called ONCE at a component's top level — that returns a per-todo props factory, so a parent that
renders many cards via a plain `.map()` / `card()` function stays Rules-of-Hooks-safe (the hook
count never depends on the number of cards). Internally it calls `useTodoContextMenu()` once and
holds one long-press timer/`longFired` ref for the component.

Returns `{ makeTriggerProps, consumeLongPress }`:
- `makeTriggerProps(todo)` — returns the event-handler object to spread onto that todo's card root:
  - `onContextMenu` — web right-click: `preventDefault()` + `menu.open(todo, { x: e.clientX, y: e.clientY })`.
  - `onPointerDown/Move/Up/Leave/Cancel` — mobile long-press: arm a timer on touch/pen down
    (ignore `pointerType === 'mouse'`), fire `menu.open(todo, at)` after the long-press delay,
    cancel on early release or >10px movement. Mirrors `TodoCard`'s existing logic + `LONG_MS`.
  - All handlers no-op safely when `useTodoContextMenu()` returned null (no provider).
- `consumeLongPress()` — returns `true` (and resets the flag) if a long-press just fired; a card
  whose root also has an `onClick` (navigate / pick) calls it first and bails, so a long-press
  doesn't also register as a tap. Cards with no root `onClick` (PlanRow) ignore it.

Because it's one hook per component with a plain factory, a parent (board / deadline list) calls it
once and does `makeTriggerProps(t)` inside its `card()`; a self-contained card component (PlanRow)
calls it at its own top level. `TodoCard` is **not** required to adopt it in this change (it keeps
working); adopting it there is optional cleanup, out of scope.

### 2. New shared menu item — priority toggle

In `frontend/src/hooks/useTodoMenu.tsx`'s `useTodoMenuGroups`, add to the `todo` group, gated on
`t.can_prioritize`:

```
{ key: 't-priority', label: t.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas',
  icon: Zap, onClick: () => setPriority.mutate({ todoName: t.name, isPriority: !t.is_priority }) }
```

`setPriority = useSetTodoPriority()` is called once at the top of `useTodoMenuGroups` (the provider
runs this hook for the open target — one instance, Rules-of-Hooks safe). The mutation is
cap-enforced server-side, surfaces the existing Bahasa rejection toast, and already invalidates the
occupancy caches. `Zap` is added to the file's existing `lucide-react` import. Because the menu
model is shared, this item appears in every surface that uses the menu (TodoCard, report, project,
Plan) — accepted per the decision above; placed after "Add to Today", before "Duplicate".

### 3. Wire the trigger into the five card sites

- `frontend/src/components/PlanRow.tsx` (**shared** — one file, covers both frontends' By-date day
  list): spread `triggerProps` on the root `<li>`. It has no root `onClick`, so no
  `consumeLongPress` needed.
- `frontend/src/components/PlanProjectBoard.tsx` and `frontend-web/src/components/PlanProjectBoard.tsx`:
  spread `triggerProps` on the card element and call `consumeLongPress()` at the top of the card's
  existing tap handler (mobile: the pick-to-move `onClick`; web: the open-detail `onClick`) so a
  long-press opens the menu instead of picking/opening. The board's move interactions are otherwise
  untouched (mobile uses tap-to-pick not long-press; web uses drag + right-click is free).
- `frontend/src/components/PlanDeadlineDay.tsx` and `frontend-web/src/components/PlanDeadlineDay.tsx`:
  spread `triggerProps` on the row; guard the row's open-detail `onClick` with `consumeLongPress()`.
  The "clear deadline" (X) button keeps its own `stopPropagation`.

Rules-of-Hooks is handled by the hook's shape (§1): the parent (board / PlanDeadlineDay) calls
`useTodoMenuTrigger()` **once** at its top level and calls the plain `makeTriggerProps(t)` inside
its per-card `card()` / `.map()` — no hook is called per card, so the hook count never varies with
the number of cards. `PlanRow`, a self-contained component, calls the hook at its own top level.

## Data / backend

None. No endpoint, no schema, no doctype change. Pure frontend wiring + one reused mutation.

## Testing

Frontend-only, reusing already-tested endpoints/mutations. Verification: `tsc` clean on both
frontends; manual check that right-click (/w) and long-press (/m) open the menu on all three Plan
surfaces, the priority item toggles + refreshes, and existing tap/pick/drag/stepper behavior is
unchanged. No new automated test.

## Ship checklist

- Frontend only — `gen_docs.py` expected no-diff (run to confirm).
- Rebuild both bundles; bump SW `ASSET_CACHE` (currently `vernon-assets-v23`) → next; purge CF.
- What's New row (Bahasa, `Both`): long-press (/m) or right-click (/w) any todo in Plan for quick
  actions — open, edit, focus, add to today, duplicate, move, and set priority.
