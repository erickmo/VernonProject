# Delete todo-less Projects & Project Details

**Date:** 2026-07-19
**Status:** Approved (design)

## Goal

Let a project's owner / leader / admin (and System Manager) delete a **Project** or a
**Project Detail** — but only when it carries **no Project Todo**. Available in both the
mobile (`/m`) and web (`/w`) apps. Deleting a project cascades its sub-entities
(details, glossaries, meetings); it never destroys point history.

## Current state

Delete is already half-built:

- Buttons exist: mobile `ProjectScreen.tsx`, web `Project.tsx` + `ProjectDetail.tsx`,
  behind confirm dialogs, wired to shared hooks `useDeleteProject` / `useDeleteProjectDetail`
  (`frontend/src/hooks/useData.ts`, imported by web via the `@` alias).
- The hooks call generic REST `DELETE /api/resource/...` (`resource.remove`).

Two reasons it doesn't do what's asked:

1. **No cascade.** `Project Detail`, `Meeting`, `Glossary`, and `Point Ledger` all `Link`
   to `Project`; REST delete raises `LinkExistsError` the moment any exist. `Project Team`
   is a child table (`istable: 1`) and auto-cascades — the others don't.
2. **No "no todos" guard.** The button shows regardless of todo count.

Permission today: DocPerm grants `delete` on Project to System Manager + Project Owner only;
`permFlags.can_delete = isSM || isOwner`. Leader/Admin cannot delete.

## Approach: two whitelisted endpoints + repoint the existing hooks

One server code path serves both frontends (shared hooks). Reuses every existing button and
confirm dialog.

### Backend — `vernon_project/api/mobile.py`

Shared gate helper: session user must be the project's `project_owner`, `project_leader`,
`project_admin`, or hold `System Manager`; else `frappe.PermissionError`.

**`delete_project(project)`**
1. Load project; run the gate.
2. **Guard:** throw if `frappe.db.count("Project Todo", {"project": project}) > 0`
   (message names the count). Also throw if
   `frappe.db.count("Point Ledger", {"project": project}) > 0` — point history is never
   destroyed. Both guards are user-facing `frappe.throw`.
3. **Cascade** (all `ignore_permissions=True`), in order:
   - each `Project Detail` where `project == project` (its child `Project Glossary` rows go
     with it automatically),
   - each `Meeting` where `project == project`,
   - each `Glossary` (group) where `project == project`,
   - then the `Project` itself.
4. `frappe.db.commit()`; return `{"ok": True}`.

**`delete_project_detail(project_detail)`**
1. Load detail; gate against its parent `project`.
2. **Guard:** throw if `frappe.db.count("Project Todo", {"project_detail": project_detail}) > 0`.
3. `frappe.delete_doc("Project Detail", project_detail, ignore_permissions=True)` — its child
   glossary rows cascade.
4. `frappe.db.commit()`; return `{"ok": True}`.

The gate + guard are the trust boundary — enforced server-side regardless of what the UI shows.

### Frontend — shared (`frontend/src/`, consumed by both apps)

- `useDeleteProject` / `useDeleteProjectDetail`: swap `resource.remove(...)` for a POST to the
  new endpoints (add thin wrappers in `lib/api.ts` next to the other `mobileApi` methods).
- `permFlags.can_delete`: widen to `isSM || isOwner || isLeader || isAdmin`
  (`isAdmin = me === project.project_admin`).
- **UI guard** — hide/disable the existing Delete controls when todos exist:
  - Delete project: disabled when `project_details.some(d => d.total > 0)`
    (`ProjectDetailSummary.total` is the per-detail todo count — data already present).
  - Delete detail: disabled when that detail's `total > 0`.
  - Disabled state gets a short reason ("Has todos — clear them first"); no new endpoint call.

No change to `get_project`'s response shape — the counts it already returns are enough.

## Testing

`vernon_project/api/test_mobile.py` (both apps share these endpoints):
- project with a todo → `delete_project` throws, project still exists.
- project with a Point Ledger row, 0 todos → throws.
- empty project with a detail + glossary + meeting → deletes, all four gone, Point Ledger of
  *other* projects untouched.
- detail with a todo → `delete_project_detail` throws; detail with 0 todos → deletes.
- non-owner/leader/admin/SM caller → `PermissionError`.

## Out of scope / skipped

- Kebab menus / swipe affordances (reuse the edit-area buttons already there).
- New DocPerms or `on_trash` hooks (would fire desk-wide, implicit side effects).
- Force-deleting a project that has Point Ledger rows — deliberately blocked.

## What's New

Ships a user-visible change → add an `App Release` row (Bahasa, platform `Both`, `published=1`,
semver bump) after it's live, per project CLAUDE.md.
