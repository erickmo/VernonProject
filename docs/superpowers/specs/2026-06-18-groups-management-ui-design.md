# Groups Management UI (Mobile) — Design

Date: 2026-06-18
Status: Approved (pending spec review)

## Goal

Give users with management access a mobile UI to manage the global scoring
**Group** doctype (introduced in the group-points-gamification feature):
full CRUD over a group's name, description, six weight percentages, and its
levels (level → point). Access is gated to managers; the backend already
enforces write permissions.

## Scope

Frontend only — the React mobile app under `frontend/`. No backend changes:
the global `Group` doctype already grants read to all project roles and
write/create/delete to `System Manager` + `Group Manager`, and the mobile
bootstrap already returns `boot.roles`.

In scope:
- A manager-gated "Manage Groups" entry on the Profile screen.
- A `/groups` list screen and a `/groups/new` + `/groups/:name` form screen.
- Data types + React Query hooks over the existing `/api/resource/Group` helper.
- Route guards so non-managers cannot reach the screens.

Out of scope (explicitly):
- The existing per-project Glossary "grouping" UI (`GroupManagerSheet`,
  launched from `ProjectScreen`, and the `useGroups`/`useCreateGroup`/… hooks).
  It remains wired to Project Detail creation (Detail.grouping is required) and
  will be removed in a later, separate task. This spec does not touch it.
- Any change to the points formula, Point Ledger, or todo crediting.

## Context (existing patterns to follow)

- Router: `frontend/src/App.tsx` — flat `<Routes>`; Profile lives at `/me`.
- Bootstrap + roles: `useBoot()` returns `Boot { user, roles: string[], … }`
  (`frontend/src/lib/types.ts`). Existing gates read `boot.roles.includes(...)`
  (`hooks/useData.ts`: `permFlags`, `canCreateProject`).
- Generic REST: `resource` in `frontend/src/lib/api.ts`
  (`get/list/create/update/remove` over `/api/resource/<Doctype>`). Frappe's
  resource API includes child tables on GET of a single doc and accepts a child
  array in the body on create/update.
- Mutations invalidate React Query keys and surface success/error via `useToast`.
- UI building blocks: `Spinner` (`components/ui.tsx`), sheet/screen styling with
  Tailwind, `lucide-react` icons. Profile uses a `<Row icon label onClick/>`.

## Access rule

```ts
export function canManageGroups(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Group Manager')
  )
}
```

Used in two places: (1) to render the Profile entry, (2) to guard the routes.
A non-manager who navigates directly to `/groups*` is redirected to `/`.

## Data model (frontend types)

`frontend/src/lib/types.ts`:

```ts
export interface GroupLevel {
  name?: string          // child row name (present when loaded)
  level_name: string
  point: number
}

export interface ScoringGroup {
  name: string           // == group_name (field-based autoname)
  group_name: string
  description?: string
  weight: number
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: GroupLevel[]   // empty in list responses, populated by get()
}
```

## Hooks (`frontend/src/hooks/useData.ts`)

Named with a `ScoringGroup` prefix to avoid colliding with the existing
Glossary `useGroups`/`useCreateGroup`/… hooks.

- `useScoringGroups()` — list:
  `resource.list<ScoringGroup[]>('Group', { fields: ['name','group_name','description','weight','leader_weight'], limit: 0 })`.
  Query key `['scoring-groups']`.
- `useScoringGroup(name, enabled)` — single full doc incl levels:
  `resource.get<ScoringGroup>('Group', name)`. Query key `['scoring-group', name]`.
- `useCreateScoringGroup()` — `resource.create('Group', payload)`; on success
  invalidate `['scoring-groups']`.
- `useUpdateScoringGroup()` — `resource.update('Group', name, payload)`; invalidate
  `['scoring-groups']` and `['scoring-group', name]`.
- `useDeleteScoringGroup()` — `resource.remove('Group', name)`; invalidate
  `['scoring-groups']`.

`payload` shape (create/update):
```ts
{
  group_name, description,
  weight, late_penalty, early_bonus,
  leader_weight, leader_late_penalty, leader_early_bonus,
  levels: levels.map(l => ({ level_name: l.level_name, point: l.point })),
}
```
On update, sending the full `levels` array replaces the child table (Frappe
resource PUT semantics) — add/edit/remove are all expressed by the submitted array.

## Screens

### `GroupsScreen` — route `/groups`
- Header "Groups" + back to Profile.
- `+ Group` button → navigate `/groups/new`.
- List from `useScoringGroups()`: each row shows `group_name`, a small badge with
  `weight%`, and (optional) description. Tap → `/groups/:name`.
- Loading spinner; empty state "No groups yet".

### `GroupFormScreen` — routes `/groups/new` and `/groups/:name`
- New mode: blank form, defaults `weight=100`, the other five weights `0`, no levels.
- Edit mode: load via `useScoringGroup(name)`; prefill.
- Fields:
  - `group_name` (text, required). **Read-only in edit mode** — it is the doc
    identity (field-based autoname); renaming is out of scope.
  - `description` (textarea, optional).
  - Six weight inputs (numeric, %): weight, late_penalty, early_bonus,
    leader_weight, leader_late_penalty, leader_early_bonus. Grouped visually as
    "Assignee" and "Leader".
  - Levels editor: list of rows (`level_name` text + `point` numeric), each with a
    remove button; an `+ Add level` button appends a blank row.
- Actions:
  - Save → create or update; on success toast + navigate back to `/groups`.
  - Delete (edit mode only) → confirm, then `useDeleteScoringGroup`, toast, navigate back.
- Validation (client, before submit):
  - `group_name` non-empty.
  - every level: `level_name` non-empty and `point` a number ≥ 0.
  - weights coerced to numbers (empty → 0); negative weights allowed only where the
    formula allows — keep simple: accept any number, no upper bound. (Penalties/bonus
    are percentages; no clamping, matching backend.)
  - Backend remains the source of truth; 403/validation errors surface via toast.

## Routing + entry point

`App.tsx`:
```tsx
import GroupsScreen from './pages/GroupsScreen'
import GroupFormScreen from './pages/GroupFormScreen'
// inside <Routes>, only when canManageGroups(boot):
<Route path="/groups" element={<GroupsScreen />} />
<Route path="/groups/new" element={<GroupFormScreen />} />
<Route path="/groups/:name" element={<GroupFormScreen />} />
```
Guard: render these routes only when `canManageGroups(boot)`; otherwise they fall
through to the existing `*` → `<Navigate to="/" replace/>`. The screens
additionally early-return a redirect if `!canManageGroups(boot)` (defense in depth).

`Profile.tsx`: add, inside the existing settings section, gated by `canManageGroups`:
```tsx
{canManageGroups(boot) && (
  <Row icon={Trophy} label="Manage Groups" onClick={() => navigate('/groups')} />
)}
```
(Icon: a `lucide-react` glyph such as `Trophy` or `Layers`; pick one consistent
with the app's icon usage.)

## Error handling

- All mutations: `onError` → `toast('error', (e as Error).message)` (ApiError carries
  the backend message, including permission denials).
- Reads: spinner while loading; on error show a simple inline message and a retry
  affordance consistent with other screens.

## Files

Create:
- `frontend/src/pages/GroupsScreen.tsx`
- `frontend/src/pages/GroupFormScreen.tsx`

Modify:
- `frontend/src/lib/types.ts` — add `GroupLevel`, `ScoringGroup`.
- `frontend/src/hooks/useData.ts` — add `canManageGroups` + the five hooks.
- `frontend/src/App.tsx` — add guarded routes.
- `frontend/src/pages/Profile.tsx` — add gated entry row.

## Testing

Per project convention (live site, code-first): automated tests deferred.
Verification:
1. `cd frontend && npx tsc --noEmit` — typecheck clean.
2. `npm run build` (vite) — builds clean.
3. Manual smoke (built assets on project.vernon.id):
   - As `mo@vernon.id` (Group Manager): Profile shows "Manage Groups"; `/groups`
     lists groups; create a group with two levels and weights; edit it; delete it.
   - As a non-manager (e.g. a Project Team user): Profile has no "Manage Groups";
     navigating to `/groups` redirects to `/`.
   - Confirm a created group appears as a selectable `group` on a Project Todo and
     its levels drive `point`.

## Edge cases

- Renaming `group_name` in edit mode is disabled (identity field). To rename,
  delete + recreate (acceptable; rename support is a later enhancement if needed).
- Group with no levels: allowed; todos using it get `point = 0` until levels added.
- Concurrent edits: last write wins (Frappe document versioning will reject on stale
  modified timestamp if the resource layer sends it; otherwise last-write-wins —
  acceptable for this low-contention admin screen).
- Deleting a group still referenced by todos: backend link-integrity will block the
  delete and the error surfaces via toast.
