# Manage Team Members — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Goal

Let authorized users add/remove team members and assign project roles
(owner, leader, admin) directly from the project detail page, without going
through the full project edit form.

## Permissions

- **Who can manage the team:** System Manager, Project Owner, Project Leader
  (matches `permFlags().can_edit`).
- **Who can reassign owner/leader:** System Manager, Project Owner only
  (matches `permFlags().can_reassign`). A Leader can edit the member list and
  the admin role, but the owner/leader dropdowns are locked for them — this
  mirrors the existing `lockLeads` behavior in `ProjectFormSheet` and the
  server-side `validate_edit_permission` rule.
- **Admin role:** editable by anyone who can manage the team.

## Scope

Manage:
1. The `team_members` list (plain members).
2. Role assignment: `project_owner`, `project_leader`, `project_admin`.

Out of scope: editing other project fields (name, customer, dates, etc.) —
those remain in `ProjectFormSheet`.

## Architecture

Approach A: dedicated sheet that reuses existing mutations. **No backend
changes.**

Existing infrastructure leveraged:
- `useUpdateProject(name)` → `resource.update('Project', name, partial)` —
  permission-gated by `Project.has_permission` (allows owner/leader write).
- `useFormOptions()` → whitelisted user list (bypasses the SM-only User read
  gate via `frappe.get_all` server-side).
- `permFlags(project, boot)` → `can_edit`, `can_reassign`.
- Server hooks in `project.py`:
  - `before_save → add_owner_and_leader_to_team()` auto-adds
    owner/leader/admin to `team_members`.
  - `before_save → remove_duplicate_team_members()` dedupes.
  - `validate → validate_edit_permission()` enforces owner-only
    owner/leader reassignment.

### New component: `frontend/src/components/TeamManagerSheet.tsx`

Props:
```ts
interface Props {
  open: boolean
  onClose: () => void
  project: ProjectDetail   // already loaded by the page; no extra fetch
  canReassign: boolean     // from permFlags().can_reassign
}
```

State (working copy, seeded from `project` on open):
- `members: string[]` — list of user emails (from `project.team.map(t => t.user)`).
- `owner: string`, `leader: string`, `admin: string` — from the project's
  `project_owner` / `project_leader` / `project_admin`.

UI:
- **Member list:** one row per member (avatar + display name, looked up from
  `opts.users` / `project.team`). Members who are owner/leader/admin show a
  role badge and have **no remove button** (the server hook would re-add them
  on save anyway). Plain members get a trash/remove icon.
- **Add member:** `SearchableSelect` over `opts.users`, filtered to exclude
  users already in `members`. Selecting appends to the working list.
- **Role assignment:** three `SearchableSelect` controls.
  - Owner and Leader: `disabled={!canReassign}`.
  - Admin: editable, `allowClear` (None allowed).
  - Setting a role to a user not already in `members` adds them to the working
    list (kept consistent client-side; the server hook also enforces this).
- **Save button:** disabled while pending; spinner while saving.

Save action:
```ts
useUpdateProject(project.name).mutate({
  team_members: members.map(user => ({ user })),
  project_owner: owner,
  project_leader: leader,
  project_admin: admin,
})
```
On success: toast, close. Query invalidation for `['project', name]` and
`['projects']` is already wired in `useUpdateProject`.

### Wiring: `frontend/src/pages/ProjectDetailPage.tsx`

- New state: `const [teamOpen, setTeamOpen] = useState(false)`.
- **Entry point 1 — Team section header** (existing Team section, ~lines
  107–128): add a "Manage" button/icon, rendered only when `perm.can_edit`.
- **Entry point 2 — project action menu/row:** add a "Manage team" action
  alongside the existing actions (edit project, group manager), same
  `perm.can_edit` gate.
- Render the sheet:
  ```tsx
  <TeamManagerSheet
    open={teamOpen}
    onClose={() => setTeamOpen(false)}
    project={project}
    canReassign={perm.can_reassign}
  />
  ```

## Data flow

1. User opens the sheet from either entry point.
2. Sheet seeds its working copy from the already-loaded `ProjectDetail`.
3. User adds/removes members and/or changes roles.
4. Save → `resource.update('Project', ...)` PATCH.
5. Server runs `validate` (permission check) then `before_save`
   (auto-add roles + dedupe), persists.
6. React Query invalidates the project caches → page re-renders with the new
   team workload.

## Error handling

- Server `PermissionError` (e.g. a Leader attempts an owner/leader change that
  slips through) surfaces via the existing toast-on-error pattern
  (`onError: (e) => toast('error', (e as Error).message)`).
- The owner/leader dropdowns are disabled for non-reassigners, so the error
  path is a safety net, not the primary UX.

## Edge cases

- **Removing owner/leader/admin:** prevented in the UI (locked rows). Even if
  attempted, the server re-adds them.
- **Duplicate add:** prevented by filtering the add picker to exclude current
  members; the server also dedupes.
- **Empty team:** impossible — roles are always present in `team_members`.
- **Leader editing:** sees owner/leader locked; can still edit members + admin.

## Testing

- Owner: add a member, remove a plain member, reassign leader → persists.
- Leader: can add/remove members and change admin; owner/leader dropdowns
  disabled.
- Non-owner/leader/SM: no "Manage" entry point shown.
- Attempt to remove the owner: no remove control present.
- Verify team workload section refreshes after save.

## Build

Frontend is the Vite-bundled PWA (`frontend/` → `vernon_project/public/frontend`).
Rebuild the bundle after the change (same as the prior "rebuild PWA bundle"
commits).
