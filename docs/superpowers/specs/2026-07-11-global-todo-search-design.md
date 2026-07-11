# Global Todo Jump-to Search — Design

**Date:** 2026-07-11
**App:** vernon_project (two frontends: `/m` mobile `frontend/`, `/w` web `frontend-web/`, shared `@` layer = `frontend/src`)

## Problem

Users want to "search my todos". Basic per-list search already exists in three places
(mobile `Today.tsx` box, web `Home.tsx` "My work" card, web ⌘K `CommandPalette`), but
there is **no global "find any of my todos from anywhere" with deep matching**:

- Mobile has zero cross-everything search (per-list only; `BottomNav` has 5 fixed tabs, no room).
- Web ⌘K already lists todos globally (from `useCalendar` — the full per-user set) but is shallow:
  matches title (`to_do`) + group only, silent 50-row cap, no status/project/assignee in the match
  string, unlabeled trigger below 1280px.

Chosen scope (user-confirmed): **global jump-to search** (type → matching todos → open the todo),
NOT a browse/triage page. Dismisses on select. No bulk actions.

## Approach

One shared matcher powers both frontends; each frontend reuses its existing global-search shell.

### 1. Shared core — `frontend/src/lib/filters.ts`

Add:

```ts
export function matchProjectItem(t: ProjectItem, query: string): boolean
```

Case-insensitive substring; empty/whitespace query → `true`. Haystack fields (all optional-safe):
`to_do`, `project_name`, `project`, `brand`, `project_detail_title`,
`project_owner_name`, `project_leader_name`, `assigned_to_name`, `status`.

Ship a runnable assert self-check (matcher is the money path):
- empty query returns all; matches title; matches project_name; matches assignee; matches status;
  non-match returns false; case-insensitive.

Then **delete the 3 shallow inline matchers and route them through `matchProjectItem`**:
- `frontend/src/pages/Today.tsx:~349` (`renderList` filter over `to_do + project_name + project_detail_title`)
- `frontend/src/lib/planDay.ts` `filterCandidates` (`to_do + project_name`)
- `frontend-web/src/lib/match.ts` `matchCommand` todo path (label + group)

Result: mobile Today + plan-day silently deepen for free; one matcher, one behavior.

### 2. Web — deepen the existing ⌘K palette, no new surface

`frontend-web/src/components/CommandPalette.tsx`:
- Each todo `Command` carries a `haystack` string built from the matchProjectItem fields.
  `matchCommand` matches on `haystack ?? label` (nav/people commands keep matching `label`).
- Todo command `group = project_name` so the existing secondary row line renders
  "project · status · assignee". Keep the persistent type tag (don't swap for the Enter glyph).
- Keep `.slice(0, 50)` + nav-only to `/project-item/:name`, but:
  - footer "showing first 50 of N" when capped,
  - hidden `aria-live="polite"` result-count region,
  - `aria-expanded` reflects popup-open (not match count),
  - empty query → short **static hint** scaffold ("Type to search to-dos, projects, people"),
    replacing the current truncated nav+project+todo dump.

`frontend-web/src/components/TopNav.tsx`:
- Unhide the visible "Search" text label from `md:` up (currently `xl:` only → bare magnifier
  under 1280px). Keep the ⌘K `kbd` hint gated to `lg/xl`.

### 3. Mobile — new global entry, no 6th tab

`frontend/src/components/Layout.tsx` (`TabScreen` header):
- Add a lucide `Search` icon button to the header right-cluster on all 5 tabs, before the
  page-specific `{right}` content. `BottomNav` untouched.

New overlay component (state-driven, **not** a route):
- Top-anchored full-screen. Input autofocused, pinned under `safe-area-inset-top`; results list
  fills downward (the on-screen keyboard rises from the bottom, so a bottom sheet is wrong here).
- Reuse `FilterSheet`'s body-scroll-lock + focus-trap + focus-restore; a real Cancel/close button;
  close on `Esc` and Android back.
- Data = `useCalendar().todos` filtered by `matchProjectItem`. Empty query → static hint.
- Tap a row → navigate `/project-item/:name` and close. Mirrors the web palette (same scope,
  same destination) → one mental model across both shells.

## Data / constraints

- Search is **client-side**. Full per-user todo set already loaded via `useCalendar` →
  `{ todos: ProjectItem[] }` (same shared hook the web palette uses). No server endpoint
  (would duplicate `get_calendar`).
- `ProjectItem` has no `description` and no `priority` field — do not offer either.
- Conventions (hard): every dropdown = `SearchableSelect`/`MultiSelectSearch`; no native
  `alert/confirm`. (This feature adds no dropdowns.)

## Explicitly NOT building (YAGNI)

- Dedicated `/todos` web page or new `nav.ts` leaf (4th redundant search surface).
- 6th mobile BottomNav tab or new mobile route.
- Structured filters (project/brand/owner/leader/estimate) inside global search v1 — they already
  live in FilterSheet (Today/Review) + Home's Popover. Add only when a real >50-result query needs it.
- Per-list search boxes on ProjectDetailScreen/CalendarView/TodosDueScreen/ProjectDetailPane/ProjectDetail.
- Inline status/assignee/deadline mutation from results — nav to `/project-item` (already edits) is the 90% job.
- Server search endpoint. Priority filter/field.

## Testing / deploy

- Self-check on `matchProjectItem` (assert-based, in-repo). Broader tests deferred (live-site, code-first).
- Deploy: rebuild both frontends + clear cache; `sudo /usr/local/bin/tj-restart` if Python touched
  (it is not — frontend-only).

## Task breakdown (for subagent execution)

1. **Core** (blocks 2 & 3): `matchProjectItem` + self-check in `filters.ts`; reroute the 3 matchers.
2. **Web** (after 1): CommandPalette deepen + a11y/cap fixes; TopNav label. Parallel with 3.
3. **Mobile** (after 1): Layout.tsx Search icon + full-screen overlay component. Parallel with 2.
