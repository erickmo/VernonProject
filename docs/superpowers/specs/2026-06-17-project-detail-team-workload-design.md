# Project Detail — Team & Workload Enhancements

Date: 2026-06-17
Status: Approved (pending implementation)

## Problem

On the mobile PWA Project Detail page the "Team workload" strip only lists users
who currently have open todos. Project owner, leader, and team members with zero
open todos are invisible. The hero header does not surface who owns or leads the
project. Team cards are not interactive, so a PM cannot drill into one person's
workload.

## Goals

1. Show every team member (owner, leader, Project Team users) even with zero load.
2. Display owner & leader in the project header.
3. Tapping a team member opens that person's workload detail.

Non-goals: editing team membership (already handled by TeamManagerSheet),
cross-project workload, reassignment from the detail sheet.

## Membership model

- `Project.project_owner` (Link User)
- `Project.project_leader` (Link User)
- `Project Team` child table — rows with a single `user` Link field.
- Effective team = `{owner, leader} ∪ {Project Team users} ∪ {open-todo assignees}`.
  Open-todo assignees are unioned in because an assignee may exist who is not in
  the formal team list; never drop someone with real load.

## Backend — `vernon_project/api/mobile.py`

### `get_project(project)` — change `team`

Build `team` from the union above, one entry per distinct user (dedupe — if
owner == leader, a single row carries both flags):

```
{
  "user": email,
  "name": full_name or email,
  "image": user_image,
  "open_todos": <count of non-completed todos assigned to user in this project>,
  "is_owner": email == project_owner,
  "is_leader": email == project_leader,
}
```

Ordering: owner first, leader second, then remaining members by `open_todos`
desc, then name asc for stable output. Owner/leader keep their position even
with zero load. `open_todos` reuses the existing `workload` dict (already counts
non-completed assigned todos); members absent from it get 0.

`_user_name_map` call must include all team emails (currently only workload keys
+ owner + leader) so Project Team users with zero load resolve names/images.

### New endpoint `get_member_workload(project, user, include_completed=0)`

Whitelisted. Permission: `project in _visible_projects()` else throw
PermissionError (same guard as `get_project`).

Returns the member's todos in the project, shaped via the existing `_shape_todo`
(or a trimmed shape) so the client gets `name, to_do, status, status_key,
deadline, deadline_human, is_overdue, work_item, work_item_title`. Reuse
`_fetch_todos([project])`, filter `row["assigned_to"] == user`. When
`include_completed` is falsy, drop rows whose `status_key == "completed"`.
Order by deadline asc (already the SQL order). Return `[]` for none.

## Frontend

### `hooks/useData` — add `useMemberWorkload`

`useMemberWorkload(project, user, includeCompleted)` → React Query calling
`get_member_workload`. Keyed by `[project, user, includeCompleted]`. Enabled
only when a member is selected (user truthy).

### `pages/ProjectDetailPage.tsx`

1. **Header**: in the hero card add an owner/leader line, e.g.
   `Owner {owner_name} · Leader {leader_name}` (use existing `data.owner_name`,
   `data.leader_name`), styled as the existing small `text-brand-100` meta row.
   Omit a value if missing.
2. **Team strip**: already maps `data.team`; now non-empty for zero-load members.
   Add a small role badge ("Owner" / "Leader" / "Owner · Leader") when
   `is_owner`/`is_leader`. Each card becomes a `<button>` that sets
   `selectedMember`.
3. State: `const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)`.
4. Render `<MemberWorkloadSheet open={!!selectedMember} member={selectedMember}
   project={data.name} onClose={() => setSelectedMember(null)} />`.

### `components/MemberWorkloadSheet.tsx` (new)

Bottom sheet, same primitive as existing sheets. Contents:
- Header: avatar + member name + role badge + "{open_todos} open".
- Segmented control "Open / All" → drives `includeCompleted` (default Open).
- Body: `useMemberWorkload(project, member.user, includeCompleted)`. List rows:
  todo text, work-item title (sub-label), deadline (`deadline_human`), overdue
  rendered in rose. Each row is a button → `onClose()` then
  `navigate('/work-item/' + encodeURIComponent(row.work_item))`.
- Loading: small spinner. Empty: EmptyState "No tasks".

## Data flow

ProjectDetailPage → useProject → renders team strip → tap member sets state →
MemberWorkloadSheet → useMemberWorkload → get_member_workload → list → tap todo
→ navigate to WorkItemPage.

## Testing

- Backend: project with (a) owner==leader, (b) a Project Team member with zero
  todos, (c) an assignee not in Project Team. Assert all appear in `team` with
  correct flags/order and counts. `get_member_workload` returns only that user's
  open todos by default; includes completed when flagged; PermissionError for a
  non-visible project.
- Frontend: manual — team strip shows zero-load members, header shows
  owner/leader, tapping a member opens sheet with their todos, Open/All toggle
  works, tapping a todo lands on its work item.

## Rollout

Backend Python change requires a gunicorn restart (`--preload`, no autoreload).
Frontend requires PWA rebuild + served `m.html` bundle-hash update (existing
build step).
