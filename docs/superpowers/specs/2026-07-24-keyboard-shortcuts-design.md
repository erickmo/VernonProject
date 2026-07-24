# Keyboard Shortcuts (/w) — Design

Date: 2026-07-24
Platform: **Web (`/w`) only.** `/m` is a touch PWA — physical keyboard shortcuts don't apply, so no mobile counterpart ships. (Stated per the two-frontend rule; this is a genuine one-platform change.)

## Goal

Make `/w` faster for keyboard users and make the shortcuts that already exist
**discoverable**. Today `⌘K` (command palette) and `c` (quick-create) work but
nothing tells users they exist. This adds a `?` cheat-sheet, a few global
navigation/creation keys, and contextual keys for an open task.

## Principle: one source of truth

A single `SHORTCUTS` list (in `shortcuts.tsx`) is the **display** source for the
cheat-sheet. Handlers implement the keys where their context is mounted. The
cheat-sheet documents; it does not dispatch. This is the same
"code knows it → no human retypes it" discipline as the docs `data.js` rule —
the cheat-sheet can't advertise a key the app doesn't have if we keep the list
next to the handlers and review both when either changes.

## Two scopes

Handlers live **where their context is mounted** — no global action registry.

### A. Global keys — `frontend-web/src/lib/shortcuts.tsx` (new), used by `AppShell`

| Key | Action |
|---|---|
| `?` | Toggle the cheat-sheet overlay |
| `⌘K` / `Ctrl+K` | Command palette (existing) |
| `/` | Command palette (new alias — familiar "search" key) |
| `c` | Quick-create menu (existing) |
| `n` | New task — opens the task dialog directly (skips the `c` menu) |
| `g` then `h` | Go Home (`/`) |
| `g` then `p` | Projects (`/projects`) |
| `g` then `r` | Review (`/review`) |
| `g` then `n` | Notes (`/notes`) |
| `g` then `c` | Calendar (`/calendar`) |

- `g` is a **prefix**: after `g`, the next key within **1000ms** is the target;
  otherwise the sequence resets. (Generous window — gmail-style; a slow second
  key still works.)
- `?` is `Shift+/`; `e.key` reports `'?'` directly, so it's distinguished from
  bare `/` with no shift bookkeeping.

### B. Contextual keys — wired inside `ProjectItem.tsx`

`ProjectItem` is the **sole** component rendered for an open todo — both the
right-side `TodoDrawer` (`TodoDrawer.tsx` renders `<ProjectItem/>`) and the full
`/project-item/:name` page use it. So a `keydown` effect placed in
`ProjectItem`'s top-level component auto-scopes: it is mounted **iff** a todo is
"current". No registry, no "active todo" store.

| Key | Action | Reuses |
|---|---|---|
| `e` | Edit | `setEditing(true)` (already exists, line ~1046/1253) |
| `f` | Focus (toggle) | active → `focus.stop()`; else `openFocus()` (line ~1177) |
| `t` | Deadline → today | `useUpdateTodo(data.name).mutate({ deadline: todayISO() })`, gated on `data.can_edit` |
| `⌘S` / `Ctrl+S` | Save | `EditForm.save()` — listener placed **inside `EditForm`**, which mounts only in edit mode |

- `todayISO()` from `@web/lib/dateGrid` (TZ-safe local date).
- `e`/`f`/`t` skip when focus is in `INPUT`/`TEXTAREA`/`contentEditable`
  (existing convention from the `c` handler) **and** skip while `editing` is
  true (so they never fire mid-edit).
- `⌘S` deliberately fires even inside form fields (save-while-typing is
  expected) and calls `preventDefault()` to stop the browser "Save page" dialog.
- `t` only acts when `data.can_edit` (Done/locked todos are left alone — mirrors
  `EditForm`'s own deadline guard).

## Cheat-sheet overlay — `ShortcutsHelp` (in `shortcuts.tsx`)

- Renders `SHORTCUTS` in two groups: **Anywhere** and **When a task is open**.
- Uses `useModalA11y(true, onClose)` so `Esc` closes it exactly like every other
  overlay (no new Esc plumbing — `Esc`-to-close already works app-wide and is
  documented in the sheet, not bound).
- Soft-pop styling consistent with existing dialogs.

## The hook — `useShortcuts({ nav, openPalette, openQuick, openTask })`

- Registers one `document` `keydown` listener (cleanup on unmount).
- Owns the `g`-prefix timer state and the `helpOpen` boolean.
- Returns `{ helpOpen, setHelpOpen }` so `AppShell` renders `<ShortcutsHelp>`.
- `AppShell`'s current inline `⌘K`/`c` effect is **removed** and replaced by this
  hook — net AppShell shrinks.

## Files touched

| File | Change |
|---|---|
| `frontend-web/src/lib/shortcuts.tsx` | **new** — `useShortcuts` hook, `SHORTCUTS` list, `ShortcutsHelp` overlay |
| `frontend-web/src/components/AppShell.tsx` | replace inline key effect with `useShortcuts(...)`, render `<ShortcutsHelp>` |
| `frontend-web/src/components/QuickCreate.tsx` | add optional `initialTask?: boolean` prop so `n` opens the task dialog directly |
| `frontend-web/src/pages/ProjectItem.tsx` | `keydown` effect for `e`/`f`/`t`; `⌘S`→`save()` listener inside `EditForm` |

## Out of scope (deliberate)

- **Key customization / remapping** — YAGNI. No profiler or user asked.
- **Global `Esc` binding** — redundant; overlays already self-close via `useModalA11y`.
- **Mobile shortcuts** — `/m` is touch; no physical keyboard.
- **`⌘S` for other forms** (NoteForm, project/user dialogs) — `⌘S` is wired for
  the todo edit form only. Each other form can adopt the same one-line listener
  later if wanted; not built now.

## Ship tail (per project rules)

- **What's New**: add an `App Release` row (Bahasa, `platform: Web`) once the
  bundle is rebuilt and live — user-visible change.
- **`gen_docs.py`**: no DocType/endpoint/hook change, so `data.js` is expected
  unchanged; run the staleness check anyway to confirm.
- Rebuild the `/w` bundle before claiming done.

## Test

One runnable self-check for the non-trivial logic (the `g`-prefix state machine
and the editable-field guard): a `shortcuts.selfcheck.ts` asserting that
`g`→`p` resolves to `/projects`, a stale second key (past the window) does not,
and that a keypress with an editable target is ignored. No framework — matches
the repo's existing `*.selfcheck.ts` pattern (e.g. `match.selfcheck.ts`).
