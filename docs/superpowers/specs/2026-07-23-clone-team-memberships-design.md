# Clone Team Memberships — Design

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan

## Problem

Onboarding a new employee A who should sit on the same set of projects as an
existing employee B means adding A to each project's team by hand — one edit
per project. For someone who mirrors a colleague across dozens of projects that
is tedious and error-prone.

## Goal

Give a System Manager one action: pick a **template** user B and a **target**
user A, and add A to every project B is currently on (that A is not already
on). One-time, additive, no ongoing coupling.

## Non-goals (explicitly out of scope)

- **Continuous mirror.** No hook that keeps A in sync with B after the copy. A
  is independent the moment the action finishes.
- **Ownership / role copy.** A is added as a plain team member only. Project
  owner / leader / admin fields are never changed.
- **Removal / undo / replace.** The action only adds. It never removes A from a
  project, never touches B, never removes B. Undo = the existing per-project
  edit.
- **New-user creation.** A must already exist as a User. Creating accounts is a
  separate flow.

## Membership model (existing, unchanged)

`Project.team_members` is a child table of `Project Team` rows (`{user}`).
`Project.validate` auto-appends `project_owner`, `project_leader`,
`project_admin` to it and de-duplicates (`add_owner_and_leader_to_team`,
`remove_duplicate_team_members`). It is the single source of truth for
membership (`api/mobile.py::_project_team`, and
`Project Todo.validate_assigned_to_team_member`).

Consequence we rely on: because owner/leader/admin are auto-appended, B appears
in `Project Team` even for projects B *leads* — so "every project B is on"
naturally includes those, and A joins them too.

`Project.validate_edit_permission` exempts System Manager, so a SysMgr can save
any project. The action is SysMgr-only, so saves succeed.

## Backend

One new module, one whitelisted endpoint. Pickers reuse the existing
`api/mobile.py::list_transfer_users` (returns non-protected users with
`full_name`, `user_image`, `enabled`, `avatar_config`) — no new picker endpoint.

**`vernon_project/api/team_membership.py`**

```
@frappe.whitelist()
def clone_memberships(from_user, to_user, dry_run=0):
```

- **Gate:** `_require_system_manager()` (same helper the transfer flow uses).
- **Validation** (mirrors `transfer_tasks`):
  - `from_user`, `to_user` stripped, both exist as `User`, neither in
    `PROTECTED_USERS`.
  - `from_user != to_user` else throw.
  - `to_user` (A) must be `enabled` else throw (no point onboarding a disabled
    account).
  - `from_user` (B) may be disabled — offboarded template is a valid source.
- **Find B's projects:** all `Project Team` rows where `user == from_user` and
  `parenttype == "Project"`, plucked to project names. Read each project's title
  (and skip projects that no longer exist — defensive).
- **Compute:** for each such project, `A already on?` via `_project_team(project)`
  (reuse the mobile helper) or a direct `Project Team` existence check.
  - `to_add` = projects where A is absent → `[{project, title}]`
  - `skipped_existing` = count where A already present.
- **`dry_run` truthy** → return `{to_add, skipped_existing}` and write nothing.
- **`dry_run` falsy** → for each `to_add` project: `frappe.get_doc("Project", p)`,
  `doc.append("team_members", {"user": to_user})`, `doc.save()` (validate
  de-dups and re-appends owner/leader — idempotent). `frappe.db.commit()` after
  the loop. Return `{added: [names], skipped_existing}`.
- **Idempotent:** running twice adds nothing the second time (A already on →
  skipped).

**Scale note (`ponytail:`):** N loaded-and-saved Project docs, one per project B
is on. Onboarding scale (tens, not thousands) — a plain loop is fine. If it ever
needs batching, the loop is the obvious place. No premature optimization.

## Frontend (both — `/m` and `/w`)

New SysMgr-gated screen. Label **"Salin Keanggotaan Proyek"** (Copy project
memberships).

Shared behaviour in `frontend/src` (imported as `@` by web); presentation
per-platform (mobile Soft-Pop card; web bento tile).

- **Two pickers**, `SearchableSelect` (per convention — zero native `<select>`),
  populated from `list_transfer_users` (enabled + disabled; the DARI/template
  picker may pick a disabled user, the KE/target picker filters to enabled):
  - "Salin DARI (karyawan template)" → B
  - "KE (karyawan baru)" → A
- **Live preview:** when both set and A≠B, call `clone_memberships(dry_run=1)`
  and show "N proyek akan ditambahkan" + "M sudah tergabung" and the project
  title list.
- **Action button** "Salin" → `clone_memberships(dry_run=0)` → result shown in a
  **dialog** (never `alert()`), e.g. "A ditambahkan ke N proyek."
- Guard A≠B in UI (disable button + inline hint) in addition to the server
  guard.
- Nav entry SysMgr-gated in `frontend/src/lib/nav.ts` (and web `nav.ts`), placed
  in the admin group near the transfer/offboarding tools.

## Error handling

- All server guards `frappe.throw` with a plain-language message; the frontend
  surfaces the message in the result dialog.
- Nothing partial-commits silently: dry-run writes nothing; the real run commits
  once after the whole loop. A mid-loop throw (e.g. a validate error on one
  project) rolls back the request — no half-applied state — and the admin sees
  the error. (Acceptable: re-running is idempotent, so a fixed re-run completes
  the rest.)

## Testing

- `test_team_membership.py`:
  - clone adds A to exactly B's projects, skips ones A already on, never touches
    B.
  - idempotent: second call adds nothing.
  - `dry_run=1` writes nothing, returns correct `to_add` / `skipped_existing`.
  - guards: non-SysMgr rejected; A disabled rejected; A==B rejected; unknown /
    protected user rejected.
  - A lands in `Project Team` for a project B only *leads* (owner/leader
    auto-append path).

## Ship checklist

- Rebuild both bundles (`/m`, `/w`).
- `python3 scripts/gen_docs.py` (new endpoint changes the docs facts) + commit
  regenerated `docs/assets/data.js`.
- `sudo /usr/local/bin/tj-restart` (new Python module).
- App Release / What's New row (Bahasa, `Both`, published, semver bump).
