# Offboard a disabled user everywhere

**Date:** 2026-08-02
**Status:** Approved (design)

## Problem

When an admin disables a user (`User.enabled` 1→0), the user is only partially
removed from the app. They remain in project teams, stay set as project
owner/leader/admin, keep their meeting invitations, and can still linger in
stale references. The request: **on disable, remove the user from every team and
everywhere else** — they must not be a team member, team leader, team owner,
admin, or a meeting invitee/organizer, and must not be pickable/invitable going
forward.

## Existing state (grounding)

- **"Team" == Project.** No standalone Team doctype. Membership lives on Project:
  - `project_owner` (Link → User, **reqd**, role-gated to `Project Owner`)
  - `project_leader` (Link → User, **reqd**, role-gated to `Project Leader`)
  - `project_admins` (Table MultiSelect → `Project Admin User`, child of User links)
  - `team_members` (Table → `Project Team`, child of User links)
  - `Project.before_save` auto-appends owner/leader/admins back into `team_members`
    (`add_owner_and_leader_to_team`), and `validate_lead_roles` enforces the two
    lead roles. So removing a user from `team_members` alone does **not** hold if
    they are still owner/leader/admin — the next save re-adds them.
- **Disable == native `User.enabled = 0`**, reached via SysMgr-gated
  `update_user` / `save_user_with_profile`. An `on_update` doc_event
  (`vernon_project/hooks.py:212`) already fires `transfer_open_todos_on_disable`
  (`user_offboarding.py`) on the 1→0 transition, reassigning open todos to
  leader→owner. **This is the extension point.**
- **Meetings.** `Meeting.organizer` (Link → User) + `participants`
  (child table `Meeting Participant`, one `user` Link each). Invitee picker
  (`meeting_invitable_users`) draws candidates from the project's `Project Team`.
- **Pickers already exclude disabled users:** `get_form_options` returns
  `users` filtered `enabled:1`, and `owners`/`leaders` are role∩enabled. So
  "cannot be *picked* as member/owner/leader" is already true through the UI.
  The remaining gap is (a) retroactive removal and (b) enforcing it at the
  write boundary for non-UI callers (raw REST, `create_meeting` with an explicit
  id list).

## Design

Extend the existing disable hook into a full offboarding orchestrator. All work
happens inside the User save transaction, so any `throw` rolls back the whole
disable atomically (user stays enabled, nothing half-applied).

Rename `transfer_open_todos_on_disable` → `offboard_disabled_user` in
`user_offboarding.py`; update the wiring in `hooks.py`. Keep the guard
`if not (has_value_changed("enabled") and not cint(doc.enabled)): return`.

### Phase 1 — plan & block (no writes)

Gather every Project where the user is owner, leader, admin, or member.
For each project the user **owns or leads**, choose the replacement by cross-fill:

| Disabled user is… | New value |
|---|---|
| `project_leader` | `project_owner` |
| `project_owner`  | `project_leader` |

The replacement is **valid only if the counterpart is enabled and ≠ the disabled
user.** Invalid cases (counterpart also disabled; or `owner == leader == user`)
cannot satisfy the required, role-gated field → collect the project into
`blockers[]`.

If `blockers` is non-empty:

```
frappe.throw(
  "Cannot disable {user}: reassign the owner/leader on these projects first: "
  "{comma-separated project names}."
)
```

Nothing is applied; the user remains enabled; the admin sees exactly which
projects need a manual lead handoff. This is deliberate — a required, role-gated
lead field cannot be blanked, so silently leaving a disabled owner is not an
option.

### Phase 2 — apply (raw db writes)

Raw `frappe.db.set_value` / `frappe.db.delete` are used throughout — the same
system-override pattern the existing todo transfer already uses. Raw writes
bypass `Project.before_save` (which would re-append the user) and `validate`.

Order matters (leads before meetings, so meeting reassignment reads fresh leads):

1. **Open todos** — existing transfer logic, unchanged.
2. **Lead reassignment** — for each planned project: `frappe.db.set_value("Project", p, field, replacement)`. If the replacement user lacks the role it is inheriting (`Project Owner` / `Project Leader`), grant it (`add_roles`) so the project stays editable through normal validation afterward.
3. **Team + admin rows** — `frappe.db.delete("Project Team", {"user": user, "parenttype": "Project"})` and `frappe.db.delete("Project Admin User", {"user": user, "parenttype": "Project"})`. Blanket removal across all projects (a disabled user belongs on no team).
4. **Meetings** — for upcoming meetings (`status = "⚪️ Scheduled"`):
   - if `organizer == user`: `set_value` organizer → project leader, else owner (enabled, ≠ user); if neither qualifies, leave and report.
   - `frappe.db.delete("Meeting Participant", {"user": user, "parent": ["in", upcoming_meeting_names]})`.

Reuse the existing orphan-report pattern (`frappe.log_error` + `frappe.msgprint`)
for anything that can't be cleanly reassigned (e.g. a meeting whose project has
no eligible organizer).

### Trust-boundary guards

So "cannot be picked / invited" holds for callers that bypass the pickers
(raw `/api/resource/Project` PUT, `create_meeting` with an explicit id list):

5. **`Project.validate_lead_roles`** — additionally require owner/leader to be
   `enabled`. (reqd + role + enabled.)
6. **`Project.before_save`** — strip `team_members` whose user is disabled
   (one batched query; self-heals stale rows).
7. **`create_meeting` / `set_meeting_participants`** — drop disabled ids from the
   incoming participant list before writing.

### Backfill

One-time: run `offboard_disabled_user` (or the equivalent core sweep) for every
currently-disabled user, to clean memberships that predate this change. Report
any that block on an unreplaceable lead for manual handling.

## Non-goals / skipped

- No new UI. Pickers already exclude disabled users; the block message surfaces
  through the existing user-save error path (verify it renders as a toast in
  both `/m` and `/w`).
- No standalone "disabled user still referenced" audit report beyond the backfill.
- No per-project granular offboarding UI.
- The "grant role on inheritance" (step 2) is intentionally minimal — it grants
  only the single role the counterpart is inheriting, not a full role sync.

## Testing

- `user_offboarding.py` self-check (`assert`-based `demo()` / small `test_*.py`):
  cover cross-fill leader→owner and owner→leader; the block case
  (owner==leader==user, and counterpart-disabled); team/admin row removal;
  meeting participant scrub + organizer reassignment.
- Manual: disable a user who is (a) a plain member, (b) a leader with an enabled
  owner, (c) a sole owner → expect block with project list.

## Deploy checklist

- `bench restart` (Python change).
- Run backfill sweep on the live site.
- `python3 scripts/gen_docs.py` (hook target renamed) + commit `docs/assets/data.js`.
- Add a Bahasa **App Release** (What's New) row.
- No migrate (no schema change).
