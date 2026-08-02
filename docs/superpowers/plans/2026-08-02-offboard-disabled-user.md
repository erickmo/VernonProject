# Offboard Disabled User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user's account is disabled, remove them from every project team, lead role, admin list, and upcoming meeting — and stop them being re-picked or re-invited.

**Architecture:** Extend the existing `User.on_update` disable hook (`user_offboarding.py`) into a full offboarding orchestrator that runs atomically inside the disable save transaction. A pure decision function plans lead reassignments (leader→owner / owner→leader cross-fill) and blocks the disable when a required, role-gated lead has no eligible replacement. Raw `frappe.db` writes apply the changes (bypassing the Project auto-re-add). Three small write-boundary guards keep disabled users out even for non-UI callers.

**Tech Stack:** Frappe (Python doc events, `frappe.db` raw writes), plain-Python unit test (no bench needed for the pure planner).

## Global Constraints

- Live site `project.vernon.id`, **no test DB** — the pure planner is unit-tested with plain asserts; all Frappe-integrated behavior is verified manually on the live site with care. Backfill previews before it mutates.
- Both frontends already exclude disabled users from every picker (`get_form_options` filters `enabled:1`); **no frontend code changes** in this plan. The block message must surface through the existing user-save error path — verify, don't rebuild.
- Deploy after Python changes: `sudo /usr/local/bin/tj-restart`. No migrate (no schema change).
- After changing the hook target: `python3 scripts/gen_docs.py` and commit `docs/assets/data.js`.
- After shipping: one Bahasa **App Release** (What's New) row, `platform="Both"`, `published=1`, semver-bumped from the newest existing row.
- Commit messages end with the Co-Authored-By / Claude-Session trailers. `git add` only this plan's files (user edits other files in parallel).

---

### Task 1: Pure lead-reassignment planner + unit test

The branching/blocking decision is the one non-trivial logic path. Isolate it in a **frappe-free** module so it runs under plain `python3`.

**Files:**
- Create: `vernon_project/offboarding_plan.py`
- Create: `vernon_project/tests/test_offboarding_plan.py`

**Interfaces:**
- Produces: `plan_lead_reassignments(projects, user, enabled_users) -> (plan, blockers)`
  - `projects`: iterable of dicts `{"name": str, "project_owner": str|None, "project_leader": str|None}` — only projects where `user` is owner or leader need be passed.
  - `user`: the disabled user id (str).
  - `enabled_users`: `set[str]` of candidate user ids that are enabled.
  - `plan`: `list[dict]` `{"project", "field" ("project_owner"|"project_leader"), "new_value", "grant_role" ("Project Owner"|"Project Leader")}`.
  - `blockers`: sorted unique `list[str]` of project names with no eligible replacement.

- [ ] **Step 1: Write the failing test**

Create `vernon_project/tests/test_offboarding_plan.py`:

```python
"""Plain-python unit test (no bench): python3 vernon_project/tests/test_offboarding_plan.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from vernon_project.offboarding_plan import plan_lead_reassignments

U = "u@x"  # the disabled user


def test_leader_reassigns_to_owner():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P1", "project_owner": "o@x", "project_leader": U}], U, {"o@x"})
    assert blockers == []
    assert plan == [{"project": "P1", "field": "project_leader",
                     "new_value": "o@x", "grant_role": "Project Leader"}]


def test_owner_reassigns_to_leader():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P2", "project_owner": U, "project_leader": "l@x"}], U, {"l@x"})
    assert blockers == []
    assert plan == [{"project": "P2", "field": "project_owner",
                     "new_value": "l@x", "grant_role": "Project Owner"}]


def test_block_when_owner_equals_leader_equals_user():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P3", "project_owner": U, "project_leader": U}], U, set())
    assert blockers == ["P3"]
    assert plan == []


def test_block_when_counterpart_disabled():
    # user is owner; leader exists but is NOT in enabled_users
    plan, blockers = plan_lead_reassignments(
        [{"name": "P4", "project_owner": U, "project_leader": "l@x"}], U, set())
    assert blockers == ["P4"]
    assert plan == []


def test_block_when_counterpart_missing():
    # user is owner, no leader set at all -> reqd field can't be blanked
    plan, blockers = plan_lead_reassignments(
        [{"name": "P5", "project_owner": U, "project_leader": None}], U, set())
    assert blockers == ["P5"]


def test_unrelated_project_ignored():
    plan, blockers = plan_lead_reassignments(
        [{"name": "P6", "project_owner": "x@x", "project_leader": "y@x"}], U, {"x@x", "y@x"})
    assert plan == [] and blockers == []


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
    print("ALL PASS")
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `python3 vernon_project/tests/test_offboarding_plan.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'vernon_project.offboarding_plan'`.

- [ ] **Step 3: Write the pure planner**

Create `vernon_project/offboarding_plan.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Pure decision logic for offboarding a disabled user's lead roles.

No frappe import: unit-testable under plain python. Given the projects a user
owns or leads, decide the cross-fill replacement (leader->owner, owner->leader)
or mark the project as a blocker when the required, role-gated lead field has no
eligible enabled replacement.
"""


def plan_lead_reassignments(projects, user, enabled_users):
    """Return (plan, blockers). See the module/plan docstring for shapes."""
    plan, blockers = [], []
    for p in projects:
        name = p["name"]
        owner = p.get("project_owner")
        leader = p.get("project_leader")
        blocked = False

        if leader == user:
            cand = owner  # leader -> owner
            if cand and cand != user and cand in enabled_users:
                plan.append({"project": name, "field": "project_leader",
                             "new_value": cand, "grant_role": "Project Leader"})
            else:
                blocked = True

        if owner == user:
            cand = leader  # owner -> leader
            if cand and cand != user and cand in enabled_users:
                plan.append({"project": name, "field": "project_owner",
                             "new_value": cand, "grant_role": "Project Owner"})
            else:
                blocked = True

        if blocked:
            blockers.append(name)

    blockers = sorted(set(blockers))
    # Never half-apply a project that also blocks on its other lead field.
    blocked_set = set(blockers)
    plan = [x for x in plan if x["project"] not in blocked_set]
    return plan, blockers
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `python3 vernon_project/tests/test_offboarding_plan.py`
Expected: `ok test_...` lines then `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/offboarding_plan.py vernon_project/tests/test_offboarding_plan.py
git commit -m "feat(offboard): pure lead-reassignment planner + unit test"
```

---

### Task 2: Offboarding orchestrator + hook rename

Grow `user_offboarding.py` from todo-transfer-only into full offboarding, driven by the Task 1 planner. Rename the hook target.

**Files:**
- Modify: `vernon_project/user_offboarding.py` (whole rewrite around the existing todo logic)
- Modify: `vernon_project/hooks.py:212`

**Interfaces:**
- Consumes: `plan_lead_reassignments` (Task 1).
- Produces: `offboard_disabled_user(doc, method=None)` (hook entry); `offboard_user(user)` (reusable core, called by the hook and by the backfill in Task 4).

- [ ] **Step 1: Rewrite `user_offboarding.py`**

Replace the whole file with:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Offboard a user when their account is disabled (enabled 1->0).

Wired as a User `on_update` doc_event, so it fires for every disable path:
Frappe desk, the mobile `update_user()` endpoint, and the bench console. All
work runs inside the disabling save's transaction, so a `throw` (an
unreplaceable required lead) rolls the whole disable back atomically.
"""

import frappe
from frappe import _
from frappe.utils import cint

from vernon_project.offboarding_plan import plan_lead_reassignments

# Project Todo statuses that mean "finished" — these stay with the disabled user
# as a historical record and are never reassigned. Mirrors project_todo.py.
TERMINAL_STATUSES = ("✅ Completed", "🚫 Cancelled")

# Mirrors mobile.MEETING_SCHEDULED (kept local to avoid importing the heavy api module).
MEETING_SCHEDULED = "⚪️ Scheduled"


def offboard_disabled_user(doc, method=None):
    """On the enabled 1->0 transition, remove the user from everything."""
    if not (doc.has_value_changed("enabled") and not cint(doc.enabled)):
        return
    offboard_user(doc.name)


def offboard_user(user):
    """Core offboarding. Reused by the disable hook and the one-time backfill.

    Phase 1 plans lead reassignments and throws if any required lead can't be
    replaced (nothing written). Phase 2 applies via raw db writes.
    """
    # ---- Phase 1: plan & block -------------------------------------------
    lead_projects = frappe.get_all(
        "Project",
        or_filters={"project_owner": user, "project_leader": user},
        fields=["name", "project_owner", "project_leader"],
    )
    candidates = set()
    for p in lead_projects:
        candidates.update((p.project_owner, p.project_leader))
    candidates.discard(user)
    candidates.discard(None)
    enabled_users = set(
        frappe.get_all("User", filters={"name": ["in", list(candidates)], "enabled": 1}, pluck="name")
    ) if candidates else set()

    plan, blockers = plan_lead_reassignments(lead_projects, user, enabled_users)
    if blockers:
        frappe.throw(
            _("Cannot disable {0}: reassign the owner/leader on these projects first: {1}.")
            .format(user, ", ".join(blockers)),
            title=_("Reassign project leads first"),
        )

    # ---- Phase 2: apply ---------------------------------------------------
    _transfer_open_todos(user)

    for item in plan:
        frappe.db.set_value("Project", item["project"], item["field"], item["new_value"])
        _ensure_role(item["new_value"], item["grant_role"])

    # A disabled user belongs on no team and no admin list, anywhere.
    frappe.db.delete("Project Team", {"user": user, "parenttype": "Project"})
    frappe.db.delete("Project Admin User", {"user": user, "parenttype": "Project"})

    _scrub_upcoming_meetings(user)


def _ensure_role(user, role):
    """Grant `role` to `user` if missing, so the reassigned lead passes validation."""
    if role not in frappe.get_roles(user):
        frappe.get_doc("User", user).add_roles(role)


def _first_enabled(candidates, exclude):
    for c in candidates:
        if c and c != exclude and cint(frappe.db.get_value("User", c, "enabled")):
            return c
    return None


def _scrub_upcoming_meetings(user):
    """Drop the user from upcoming meetings; reassign organizer to lead."""
    scheduled = frappe.get_all(
        "Meeting", filters={"status": MEETING_SCHEDULED},
        fields=["name", "project", "organizer"],
    )
    if not scheduled:
        return
    for m in scheduled:
        if m.organizer == user:
            owner, leader = frappe.get_value(
                "Project", m.project, ["project_owner", "project_leader"]
            ) or (None, None)
            new_org = _first_enabled([leader, owner], user)
            if new_org:
                frappe.db.set_value("Meeting", m.name, "organizer", new_org)
            else:
                frappe.log_error(
                    message=_("Meeting {0} organized by disabled {1} has no eligible new organizer.")
                    .format(m.name, user),
                    title="Meeting organizer not reassigned",
                )
    frappe.db.delete(
        "Meeting Participant",
        {"user": user, "parent": ["in", [m.name for m in scheduled]]},
    )


def _transfer_open_todos(user):
    """Move the user's open Project Todos to project_leader, else project_owner.

    Raw update: bypasses validate_assigned_to_team_member (leader/owner may not
    be on the team — intended system override) and skips re-running
    point-ledger/recurrence hooks (open tasks have 0 earned). Recurrence still
    follows: next-occurrence generation reads assigned_to fresh from the DB.
    """
    todos = frappe.get_all(
        "Project Todo",
        filters={"assigned_to": user, "status": ["not in", TERMINAL_STATUSES]},
        fields=["name", "project"],
    )
    if not todos:
        return

    target_cache = {}
    orphans = []
    for t in todos:
        target = _resolve_target(t.project, user, target_cache)
        if not target:
            orphans.append(t.name)
            continue
        frappe.db.set_value("Project Todo", t.name, "assigned_to", target)
        # Wipe the outgoing assignee's day-plan allocation rows (see report.py):
        # left in place they get misattributed to the new assignee.
        frappe.db.delete("Project Todo Allocation", {"parent": t.name, "parenttype": "Project Todo"})

    if orphans:
        msg = _(
            "{0} of {1} open task(s) could not be reassigned after disabling {2} "
            "(no enabled project leader or owner): {3}"
        ).format(len(orphans), len(todos), user, ", ".join(orphans))
        frappe.log_error(message=msg, title="Task transfer on user disable")
        frappe.msgprint(msg, title=_("Tasks not reassigned"), indicator="orange")


def _resolve_target(project, disabled_user, cache):
    """Return an enabled user (leader, else owner) able to receive tasks, or None."""
    if project in cache:
        return cache[project]
    target = None
    if project:
        leader, owner = frappe.get_value(
            "Project", project, ["project_leader", "project_owner"]
        ) or (None, None)
        target = _first_enabled([leader, owner], disabled_user)
    cache[project] = target
    return target
```

- [ ] **Step 2: Update the hook target**

In `vernon_project/hooks.py`, line 212, change:

```python
	"User": {
		"on_update": "vernon_project.user_offboarding.offboard_disabled_user",
	},
```

- [ ] **Step 3: Import-sanity check (no bench)**

Re-run the Task 1 unit test to prove the pure module still imports cleanly (the orchestrator import chain is exercised on the live site in Task 4):

Run: `python3 vernon_project/tests/test_offboarding_plan.py`
Expected: `ALL PASS`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/user_offboarding.py vernon_project/hooks.py
git commit -m "feat(offboard): remove disabled user from teams, leads, admins, meetings"
```

---

### Task 3: Write-boundary guards (leads, team members, meeting invites)

So a disabled user can't be re-picked/invited by callers that bypass the UI pickers (raw `/api/resource/Project` PUT, `create_meeting`/`set_meeting_participants` with an explicit id list).

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project/project.py` (add `cint` import; extend `validate_lead_roles`; add `remove_disabled_team_members` + call in `before_save`)
- Modify: `vernon_project/api/mobile.py` (`create_meeting` ~line 4395; `set_meeting_participants` line 4520)

**Interfaces:**
- Consumes: nothing new.
- Produces: no new public functions.

- [ ] **Step 1: Guard the lead fields (enabled) in `project.py`**

Change the import line `from frappe.utils import getdate` to:

```python
from frappe.utils import getdate, cint
```

In `validate_lead_roles`, after the two existing role checks, append:

```python
		if self.project_owner and not cint(frappe.db.get_value("User", self.project_owner, "enabled")):
			frappe.throw(
				f"Project Owner {frappe.bold(self.project_owner)} is disabled; pick an active user."
			)
		if self.project_leader and not cint(frappe.db.get_value("User", self.project_leader, "enabled")):
			frappe.throw(
				f"Project Leader {frappe.bold(self.project_leader)} is disabled; pick an active user."
			)
```

- [ ] **Step 2: Strip disabled team members in `before_save`**

Change `before_save` to:

```python
	def before_save(self):
		self.add_owner_and_leader_to_team()
		self.remove_duplicate_team_members()
		self.remove_disabled_team_members()
```

Add the method (next to `remove_duplicate_team_members`):

```python
	def remove_disabled_team_members(self):
		"""Self-heal: a disabled user is never a team member (batched, one query)."""
		users = [m.user for m in self.team_members if m.user]
		if not users:
			return
		disabled = set(
			frappe.get_all("User", filters={"name": ["in", users], "enabled": 0}, pluck="name")
		)
		if disabled:
			self.team_members = [m for m in self.team_members if m.user not in disabled]
```

- [ ] **Step 3: Filter disabled ids out of meeting participants in `mobile.py`**

In `create_meeting`, replace the `rows = json.loads(...)` line (~4395) with:

```python
		rows = json.loads(participants) if isinstance(participants, str) else (participants or [])
		rows = _enabled_only([u for u in rows if u])
```

In `set_meeting_participants`, replace its `rows = json.loads(...)` line (4520) with:

```python
		rows = json.loads(users) if isinstance(users, str) else (users or [])
		rows = _enabled_only([u for u in rows if u])
```

Add this helper just below the `MEETING_DONE = "✅ Done"` constant (~line 4361):

```python
def _enabled_only(user_ids):
	"""Keep only enabled users — disabled accounts can't be invited to meetings."""
	if not user_ids:
		return []
	return frappe.get_all("User", filters={"name": ["in", user_ids], "enabled": 1}, pluck="name")
```

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/project/project.py vernon_project/api/mobile.py
git commit -m "feat(offboard): reject disabled users at project + meeting write boundaries"
```

---

### Task 4: Deploy, backfill existing disabled users, verify on live

**Files:** none (operational). Live site `project.vernon.id`.

- [ ] **Step 1: Restart the bench (loads the Python changes)**

Run: `sudo /usr/local/bin/tj-restart`
Expected: exits 0.

- [ ] **Step 2: Preview the backfill (read-only) — who would BLOCK?**

Dry-run the planner against every currently-disabled user before mutating anything:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.offboarding_plan import plan_lead_reassignments
import frappe
disabled = frappe.get_all("User", filters={"enabled": 0, "user_type": "System User", "name": ["not in", ("Guest", "Administrator")]}, pluck="name")
report = {}
for u in disabled:
    lp = frappe.get_all("Project", or_filters={"project_owner": u, "project_leader": u}, fields=["name", "project_owner", "project_leader"])
    cands = {p.project_owner for p in lp} | {p.project_leader for p in lp}; cands.discard(u); cands.discard(None)
    en = set(frappe.get_all("User", filters={"name": ["in", list(cands)], "enabled": 1}, pluck="name")) if cands else set()
    plan, blk = plan_lead_reassignments(lp, u, en)
    if plan or blk: report[u] = {"reassign": len(plan), "BLOCKED": blk}
print(len(disabled), "disabled users;", sum(1 for v in report.values() if v["BLOCKED"]), "would block")
print(report)
EOF
```

Expected: a dict per disabled user with lead involvement. Note any `BLOCKED` lists — those projects need a manual owner/leader set before that user can be fully offboarded. Handle them (or accept they stay) before Step 3.

- [ ] **Step 3: Apply the backfill (mutates data)**

Runs the real `offboard_user` per disabled user; catches the block-throw so one blocked user doesn't abort the sweep:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
from vernon_project.user_offboarding import offboard_user
disabled = frappe.get_all("User", filters={"enabled": 0, "user_type": "System User", "name": ["not in", ("Guest", "Administrator")]}, pluck="name")
done, blocked = [], {}
# Per-user commit: a blocker throws in Phase 1 BEFORE writing anything, but
# frappe.db.rollback() is transaction-wide — without committing each success
# first, one block would discard every prior success. Commit-per-user isolates them.
for u in disabled:
    try:
        offboard_user(u); frappe.db.commit(); done.append(u)
    except frappe.ValidationError as e:
        frappe.db.rollback(); blocked[u] = str(e)
print("offboarded:", len(done), "blocked:", list(blocked))
print(blocked)
EOF
```

Expected: `offboarded: N blocked: [...]`. Blocked users are reported, not force-broken.

- [ ] **Step 4: Verify a live disable end-to-end**

Pick one enabled non-critical test user (or create a throwaway). Confirm each guarantee:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
u = "REPLACE_WITH_TEST_USER"
before = {
  "teams": frappe.db.count("Project Team", {"user": u}),
  "admins": frappe.db.count("Project Admin User", {"user": u}),
  "owns": frappe.db.count("Project", {"project_owner": u}),
  "leads": frappe.db.count("Project", {"project_leader": u}),
  "mtg_parts": frappe.db.count("Meeting Participant", {"user": u}),
}
print("BEFORE", before)
d = frappe.get_doc("User", u); d.enabled = 0; d.save(ignore_permissions=True); frappe.db.commit()
after = {
  "teams": frappe.db.count("Project Team", {"user": u}),
  "admins": frappe.db.count("Project Admin User", {"user": u}),
  "owns": frappe.db.count("Project", {"project_owner": u}),
  "leads": frappe.db.count("Project", {"project_leader": u}),
}
print("AFTER", after)  # expect teams/admins/owns/leads all 0 (unless it threw a block)
EOF
```

Expected: `AFTER` shows `teams=admins=owns=leads=0`. If the user was a sole owner it should have **thrown** at save (block) — confirm the message names the projects. Re-enable / clean up the test user afterward.

- [ ] **Step 5: Verify the invite guard**

Confirm a disabled user cannot be added as a meeting participant even by explicit id:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.mobile import _enabled_only
print(_enabled_only(["REPLACE_WITH_DISABLED_USER", "Administrator"]))  # disabled id dropped
EOF
```

Expected: the disabled id is absent from the returned list.

---

### Task 5: Regenerate docs data + What's New

**Files:**
- Modify: `docs/assets/data.js` (generated)
- Data: one `App Release` row on the live site (no file)

- [ ] **Step 1: Regenerate docs data (hook target renamed)**

Run: `python3 scripts/gen_docs.py`
Then: `git diff --stat docs/assets/data.js` (expect it changed) and commit:

```bash
git add docs/assets/data.js
git commit -m "docs: regenerate data.js after offboarding hook rename"
```

- [ ] **Step 2: Write the What's New row**

Confirm the newest existing version first:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
print(frappe.get_all("App Release", fields=["version", "release_date"], order_by="creation desc", limit=1))
EOF
```

Write `/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/6d0f16b7-3a50-4547-acba-092147fbbae9/scratchpad/releases.json` (bump minor from the newest version, `release_date` = the live-deploy date):

```json
[
  {
    "version": "X.Y.0",
    "release_date": "2026-08-02",
    "title": "Nonaktifkan anggota, bersih otomatis",
    "notes": "Saat sebuah akun dinonaktifkan, orang itu langsung keluar dari semua tim proyek (/m & /w)\nTidak bisa lagi dipilih sebagai anggota, pemimpin, atau pemilik proyek\nTidak bisa lagi diundang ke rapat, dan otomatis dilepas dari rapat yang belum berlangsung\nJika dia pemimpin/pemilik proyek, perannya dioper ke pasangannya; kalau tidak ada penggantinya, sistem meminta Anda menunjuk pengganti dulu",
    "platform": "Both",
    "published": 1
  }
]
```

- [ ] **Step 3: Insert the row (one self-contained line — see CLAUDE.md)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/6d0f16b7-3a50-4547-acba-092147fbbae9/scratchpad/releases.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 4: Verify through the real endpoint (both platforms)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[0])
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[0])
EOF
```

Expected: the new row is the first entry for both platforms.

---

## Self-Review

**Spec coverage:**
- Remove from teams → Task 2 (`Project Team`/`Project Admin User` blanket delete). ✓
- Remove/reassign lead roles with cross-fill + block → Task 1 (planner) + Task 2 (apply/throw). ✓
- Remove from meetings (participants + organizer) → Task 2 `_scrub_upcoming_meetings`. ✓
- Can't be picked (member/owner/leader) → already true via pickers; enforced at write boundary in Task 3 (lead enabled-guard, team strip). ✓
- Can't be invited to meetings → Task 3 `_enabled_only` filter. ✓
- Backfill existing disabled users → Task 4. ✓
- gen_docs + What's New → Task 5. ✓
- No frontend change; block surfaces via existing error path → Task 4 Step 4 verifies. ✓

**Placeholder scan:** `REPLACE_WITH_TEST_USER` / `REPLACE_WITH_DISABLED_USER` / `X.Y.0` are runtime values the operator fills at execution — intentional, not code gaps. No TODO/TBD in code.

**Type consistency:** `plan_lead_reassignments` shape (`plan` dict keys `project`/`field`/`new_value`/`grant_role`) matches its consumer loop in Task 2 Step 1. `offboard_user` (Task 2) is the exact name called by the Task 4 backfill. `_enabled_only` (Task 3) matches its call in Task 4 Step 5. Consistent.
