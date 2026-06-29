# Team Wall — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorm), pending implementation plan

## Summary

A "team wall" — every enabled user's avatar arranged together like a group
photo. Whole-org scope (one shared wall, not per-project or per-group). Built
in **both** front ends: mobile (`frontend/`) and web (`frontend-web/`), sharing
a single backend method.

## Scope decisions (from brainstorm)

- **Whose avatars:** whole org — every enabled, non-protected user.
- **Where it lives:** a new standalone page + a navigation entry, in both apps.
- **Arrangement:** three switchable view modes (user picked all three) — Photo,
  Grid, Mosaic — toggled with the existing `Segmented` control.
- **Tap interaction:** tap an avatar → reveal its name. No per-user profile
  route exists in either app, so name-only for v1.

## Backend (shared, written once)

Add one whitelisted method to `vernon_project/api/mobile.py` (both front ends
already call methods from this module):

```python
@frappe.whitelist()
def get_team_wall():
    """All enabled users with avatar snapshot — for the team wall."""
    users = frappe.get_all(
        "User",
        filters={"name": ["not in", PROTECTED_USERS], "enabled": 1},
        fields=["name", "full_name", "user_image"],
        limit_page_length=0,
        order_by="full_name asc",
    )
    return {"users": users}
```

This mirrors the existing `list_grant_users`, minus the granter gate. Safe to
expose org-wide: it returns only display names and avatar snapshots — the same
data `get_leaderboard` already returns to every user. `user_image` holds the
avatar snapshot (snapshot → `user_image` per the avatar pipeline). Users with no
avatar fall back to initials in the `Avatar` component.

Ordering: alphabetical by `full_name` (matches `list_grant_users`).

## Frontend — identical UX in both apps

A `Segmented` toggle switches three view modes, all rendering the **same**
`users` array:

- **Photo** — staggered, overlapping rows (flex-wrap + negative margins). No
  name labels. Closest to a literal group photo.
- **Grid** — yearbook: uniform avatar tiles, full name under each.
- **Mosaic** — square avatar tiles, edge-to-edge, no gaps. No labels.

All tiles reuse the existing `Avatar` component (image → initials fallback is
already built in). Mosaic needs square corners, so add an optional `square` prop
to each app's `Avatar` (one conditional class — `rounded-none` vs the default
`rounded-full`).

**Tap behavior:** tapping a tile reveals that user's name (a small chip or
mini-sheet). Name only for v1.

### Per-app wiring

| | Mobile (`frontend/`) | Web (`frontend-web/`) |
|---|---|---|
| Page file | `src/pages/TeamWallScreen.tsx` | `src/pages/TeamWall.tsx` |
| Route | `/team-wall` in `src/App.tsx` | `/team-wall` in `src/App.tsx` |
| Nav entry | bottom bar is full (5 fixed tabs) → link from the feature menu (Today/Profile quick-links), next to Leaderboard | add `{ to: '/team-wall', label: 'Team Wall', icon: Users }` to the `NAV` array in `src/components/AppShell.tsx`, plus an accent in `accentFor` |
| Data | add `getTeamWall()` to `src/lib/api.ts` + a `useTeamWall` hook in `src/hooks/useData.ts`, calling `vernon_project.api.mobile.get_team_wall` | mirror the same in the web app's `lib/api.ts` / data hook, matching how it already calls backend methods |
| Primitives | `Avatar`, `Segmented` (already exist) | `Avatar`, `Segmented` (already exist) |

Design follows each app's conventions: mobile uses the Soft-Pop tokens and
448px column; web sits inside `AppShell` like the Leaderboard page.

## Out of scope (YAGNI — add when)

- **Search / filter box** — add when the org is large enough to scroll-hunt.
- **Sort by points** — ships alphabetical; add a sort toggle if wanted.
- **Tap → full profile** — no per-user profile route exists in either app; add
  if such a route is built.

## Testing

One backend check: `get_team_wall()` returns enabled users and excludes both
`PROTECTED_USERS` and disabled users. (Live site, no test DB — follow the
project's deferred-test convention; this is the check to run at the test phase.)
