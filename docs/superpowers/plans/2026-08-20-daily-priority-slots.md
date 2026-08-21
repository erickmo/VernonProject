# Daily Priority Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every person a fixed number of daily priority slots that project leaders claim by flagging a todo, render them as vibrant cards on both homepages, and deduct points nightly for any claimed slot that never reached Done.

**Architecture:** No new DocType. A single `is_priority` Check on `Project Todo` makes slot occupancy a derived query — `(assigned_to, deadline, is_priority=1, status != Cancelled)` — so nothing drifts when a todo is reassigned, rescheduled or cancelled. The cap is enforced in the `ProjectTodo` controller's `validate()` so every write path is covered, not just the claim call. A nightly cron mints negative `Point Ledger` rows dated to the missed day, which makes the "−250 per day until Done" behaviour and idempotency fall out of one query.

**Tech Stack:** Frappe v15 (Python 3.11, MariaDB), React 18 + TypeScript + Vite + TanStack Query, Tailwind. Two frontends: `frontend/` (mobile `/m`), `frontend-web/` (web `/w`).

## Global Constraints

- **Both frontends, always.** Every user-facing change ships to `/m` and `/w`. Rebuild both bundles before claiming done.
- **Live site, no test database.** `project.vernon.id` is the only site. Tests are written and run at the END (Task 9), not per-task TDD — this is a standing project constraint that overrides the usual TDD ordering. Test fixtures must clean up after themselves in `tearDown`.
- **Bahasa Indonesia for all end-user copy.** Admin-facing settings copy follows the existing mixed style in the settings screens (Bahasa body text, English field chrome).
- **Live setting values:** `daily_priority_slots = 3`, `max_project_priorities_per_day = 2`, `priority_miss_penalty = 250`.
- **No native `confirm()`/`alert()`/`prompt()`.** Use the in-app toast/dialog components already present.
- **Every dropdown uses `SearchableSelect`** — not relevant to this plan (no new dropdowns), but do not introduce one.
- **Restart command:** `sudo /usr/local/bin/tj-restart` (never `bench restart`).
- **Tabs, not spaces**, in all Python files in this repo.

## File Map

| File | Responsibility |
|---|---|
| `vernon_project/vernon_project/doctype/project_todo/project_todo.json` | new `is_priority` field |
| `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json` | `Priority` added to `source` options |
| `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` | new "Daily Priorities" section, 3 fields |
| `vernon_project/vernon_project/doctype/project_todo/project_todo.py` | `validate_priority_slot()` guard; `_remove_ledger` must not eat penalties |
| `vernon_project/api/mobile.py` | `update_todo` param + gate; `_fetch_todos` column; `_shape_todo` field; `get_dashboard` payload; `get_app_settings` / `save_app_settings` |
| `vernon_project/tasks.py` | `charge_missed_priorities()` cron job |
| `vernon_project/hooks.py` | register the cron job |
| `frontend/src/lib/types.ts` | `is_priority` on `ProjectItem`; `priority` on `Dashboard`; 3 fields on `AppSettings` |
| `frontend/src/components/PriorityRail.tsx` | **new** — the vibrant rail, shared by both frontends |
| `frontend/src/pages/Today.tsx` | mount the rail (mobile home) |
| `frontend-web/src/pages/Home.tsx` | mount the rail (web home) |
| `frontend/src/pages/ProjectItemScreen.tsx` | priority toggle in the todo overflow menu (/m) |
| `frontend-web/src/pages/ProjectItem.tsx` | priority toggle in the todo overflow menu (/w) |
| `frontend/src/pages/SettingsScreen.tsx` | Daily Priorities settings card (/m) |
| `frontend-web/src/pages/Settings.tsx` | Daily Priorities settings card (/w) |
| `vernon_project/api/test_priority_slots.py` | **new** — guard + cron tests |

---

### Task 1: Schema — field, ledger source, settings

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json`
- Modify: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `Project Todo.is_priority` (Check), `Point Ledger.source` option `Priority`, and Vernon Settings fields `daily_priority_slots` (Int), `max_project_priorities_per_day` (Int), `priority_miss_penalty` (Float). Every later task depends on these existing.

- [ ] **Step 1: Add `is_priority` to Project Todo**

In `project_todo.json`, add to the `fields` array (anywhere; order is controlled separately):

```json
{
 "default": "0",
 "fieldname": "is_priority",
 "fieldtype": "Check",
 "label": "Priority Slot",
 "description": "Claims one of the assignee's daily priority slots for this todo's deadline date."
}
```

Then insert `"is_priority"` into the `field_order` array immediately after `"owner_deadline"`.

- [ ] **Step 2: Add the `Priority` ledger source**

In `point_ledger.json`, find the field with `"fieldname": "source"` and append `\nPriority` to the end of its `options` string. The result must read exactly:

```
Todo\nGrant\nGift\nMeeting\nAttendance\nDaily\nReward\nAchievement\nMentoring\nRecognition\nFeedback\nLearning\nPriority
```

A `source` value not present in this list makes `Document._validate_selects()` throw on insert, so this step must land before Task 4.

- [ ] **Step 3: Add the three Vernon Settings fields**

In `vernon_settings.json`, add these four entries to `fields`:

```json
{
 "fieldname": "daily_priorities_section",
 "fieldtype": "Section Break",
 "label": "Daily Priorities"
},
{
 "default": "0",
 "fieldname": "daily_priority_slots",
 "fieldtype": "Int",
 "label": "Daily Priority Slots (per user)",
 "description": "How many priority slots each person gets per day. 0 disables the whole feature."
},
{
 "default": "0",
 "fieldname": "max_project_priorities_per_day",
 "fieldtype": "Int",
 "label": "Max Priorities per Project (per user per day)",
 "description": "How many of one person's daily slots a single project may claim. 0 = no per-project cap."
},
{
 "default": "0",
 "fieldname": "priority_miss_penalty",
 "fieldtype": "Float",
 "label": "Priority Miss Penalty (points/day)",
 "description": "Points deducted each day a claimed priority has not reached Done. Entered positive, charged negative."
}
```

Then insert into `field_order`, immediately **after** `"sweep_stale_plan_after_days"` and before `"recognition_section"`:

```
"daily_priorities_section", "daily_priority_slots", "max_project_priorities_per_day", "priority_miss_penalty",
```

Defaults are 0 so the feature is inert until Task 10 sets the live values — a half-deployed migration must never start charging points.

- [ ] **Step 4: Migrate and verify the schema landed**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```

Then:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_meta("Project Todo").get_field("is_priority").fieldtype)
print("Priority" in frappe.get_meta("Point Ledger").get_field("source").options.split("\n"))
print([frappe.db.get_single_value("Vernon Settings", f) for f in ("daily_priority_slots","max_project_priorities_per_day","priority_miss_penalty")])
EOF
```

Expected: `Check`, `True`, `[0, 0, 0.0]`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/vernon_project/doctype/point_ledger/point_ledger.json vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json
git commit -m "feat(priority): schema for daily priority slots

Project Todo.is_priority, a Priority source on Point Ledger, and the three
Vernon Settings knobs. All default to 0/off so migrating alone changes nothing."
```

---

### Task 2: Slot guard in the Project Todo controller

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py:44-59` (the `validate` method) and add a new method after `validate_estimated_min`

**Interfaces:**
- Consumes: `Project Todo.is_priority`, the three Vernon Settings fields (Task 1).
- Produces: `ProjectTodo.validate_priority_slot()` — raises `frappe.ValidationError` via `frappe.throw` when a claim exceeds either cap. Task 3 and Task 9 rely on this being the only enforcement point.

- [ ] **Step 1: Add the guard method**

Insert immediately after `validate_estimated_min` (which ends around line 277):

```python
	def validate_priority_slot(self):
		"""A priority claims one of the assignee's daily slots for its deadline date.

		Enforced in the controller rather than the API so every write path shares the
		cap: update_todo, the desk form, bulk add, move-todos, a deadline change and a
		reassignment all land here. Slots are derived, never stored — occupancy is just
		the count of non-cancelled priority todos on that (assignee, date).
		"""
		if not self.is_priority:
			return
		slots = cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots"))
		if not slots:
			return  # feature off
		if not self.deadline or not self.assigned_to:
			frappe.throw(_("A priority needs both an assignee and a deadline."))

		peers = frappe.get_all(
			"Project Todo",
			filters={
				"is_priority": 1,
				"assigned_to": self.assigned_to,
				"deadline": self.deadline,
				"status": ["!=", "🚫 Cancelled"],
				"name": ["!=", self.name or ""],
			},
			fields=["name", "project"],
			limit_page_length=0,
		)
		who = frappe.db.get_value("User", self.assigned_to, "full_name") or self.assigned_to
		if len(peers) >= slots:
			frappe.throw(
				_("Slot prioritas {0} pada {1} sudah penuh ({2}/{2}).").format(who, self.deadline, slots)
			)
		cap = cint(frappe.db.get_single_value("Vernon Settings", "max_project_priorities_per_day"))
		if cap and self.project and len([p for p in peers if p.project == self.project]) >= cap:
			frappe.throw(
				_("Proyek ini sudah memakai {0} slot prioritas {1} pada {2}.").format(cap, who, self.deadline)
			)
```

Completed priorities are deliberately **not** excluded from `peers`: a finished slot stays spent for that day, so a fourth priority can never be stacked onto one person by finishing the first three.

- [ ] **Step 2: Confirm `cint` and `_` are already imported**

Run:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && head -20 vernon_project/vernon_project/doctype/project_todo/project_todo.py
```

If `cint` is not in the `from frappe.utils import ...` line, add it. If `_` is not imported, add `from frappe import _`. Do not add an import that is already there.

- [ ] **Step 3: Call it from `validate`**

In `validate` (line 44), add the call as the **last** line of the method, after `self._ensure_today_allocation()`:

```python
		self.validate_priority_slot()
```

It must run after `sync_project_from_detail()` (line 45), which is what populates `self.project` — the per-project cap reads it.

- [ ] **Step 4: Stop `_remove_ledger` from erasing penalties**

`_remove_ledger` (line 432) deletes *every* Point Ledger row for a todo when it leaves ✅ Completed. Without a filter, a leader could complete then un-complete a todo to wipe its accrued priority penalties. Change the `get_all` filters:

```python
	def _remove_ledger(self):
		"""Delete this todo's earning rows and clear earned snapshots.

		Priority-miss penalties are excluded: they are a record of a day that was
		already missed, so un-completing a todo must not refund them.
		"""
		for name in frappe.get_all(
			"Point Ledger",
			filters={"todo": self.name, "source": ["!=", "Priority"]},
			pluck="name",
		):
			frappe.delete_doc("Point Ledger", name, ignore_permissions=True, force=True)
		self._set_earned("assignee_earned", 0)
		self._set_earned("leader_earned", 0)
```

- [ ] **Step 5: Restart and smoke-test the guard by hand**

```bash
sudo /usr/local/bin/tj-restart
```

Then, with the feature still off (`daily_priority_slots = 0`), confirm the guard is a no-op — flagging a todo must not throw:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
name = frappe.get_all("Project Todo", filters={"status": "⚪️ Planned"}, limit=1, pluck="name")[0]
d = frappe.get_doc("Project Todo", name); d.is_priority = 1; d.save(ignore_permissions=True)
print("flagged ok, feature off:", d.is_priority)
d.is_priority = 0; d.save(ignore_permissions=True); frappe.db.commit()
print("reverted:", frappe.db.get_value("Project Todo", name, "is_priority"))
EOF
```

Expected: `flagged ok, feature off: 1` then `reverted: 0`.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(priority): enforce daily slot caps in the Project Todo controller

Guarding validate() rather than the claim endpoint means a deadline change or a
reassignment onto a full day is caught too, not just an explicit claim. Also
exempts Priority rows from _remove_ledger so un-completing a todo cannot refund
a penalty for a day that was already missed."
```

---

### Task 3: Claim API — `is_priority` on `update_todo`

**Files:**
- Modify: `vernon_project/api/mobile.py:1884-1917` (signature), `:1946-1952` (the leader-gated field block), `:581-590` (`_fetch_todos` columns), `:793+` (`_shape_todo` output)

**Interfaces:**
- Consumes: `ProjectTodo.validate_priority_slot()` (Task 2).
- Produces: `update_todo(..., is_priority=None)` returning the standard `{"status": "ok"|"error", "message": str}`; `_shape_todo` output gains `"is_priority": bool` and `"can_prioritize": bool`. Tasks 5, 6 and 7 consume both keys.

- [ ] **Step 1: Add the parameter**

In the `update_todo` signature, add `is_priority=None,` immediately after `is_waiting=None,`.

- [ ] **Step 2: Apply it with a leader-only gate**

Insert this block immediately after the `mentor` block (which ends with `row.mentor = mentor or None`, around line 1973):

```python
		# Priority slots are a leadership tool: the assignee receives them, they don't
		# grant themselves one (and one costs them points if missed). Same gate the
		# `estimated` field uses, plus project admins. The controller owns the caps.
		if is_priority is not None:
			if not (is_sm or user in (project.project_owner, project.project_leader) or user in get_project_admins(project)):
				return {"status": "error", "message": "Only the project leader or owner can set a priority slot."}
			row.is_priority = 1 if str(is_priority) in ("1", "true", "True") else 0
```

The controller's `frappe.throw` surfaces through `update_todo`'s existing `except` handler, which strips HTML and returns `{"status": "error", "message": ...}` — the Bahasa cap message reaches the toast unchanged. Do not add a second cap check here.

- [ ] **Step 3: Fetch the column**

In `_fetch_todos` (line ~584), add `t.is_priority,` to the SELECT list — append it to the line that currently reads:

```
			t.ongoing, t.notes, t.cancellation_reason, t.cancelled_on, t.is_recurring, t.auto_approve, t.auto_approve_opt_out,
```

so it becomes:

```
			t.ongoing, t.notes, t.cancellation_reason, t.cancelled_on, t.is_recurring, t.auto_approve, t.auto_approve_opt_out, t.is_priority,
```

- [ ] **Step 4: Shape it**

In `_shape_todo`, add two keys to the `out` dict, immediately after `"is_recurring": bool(row.get("is_recurring")),`:

```python
		"is_priority": bool(row.get("is_priority")),
		# Same set as can_create (SM / owner / leader / project admin) — who may spend
		# one of the assignee's daily priority slots.
		"can_prioritize": can_create,
```

- [ ] **Step 5: Restart and verify the shape**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
d = frappe.call("vernon_project.api.mobile.get_dashboard")
row = (d["due_today"] + d["upcoming"] + d["overdue"] + [None])[0]
print(sorted(k for k in (row or {}) if "priorit" in k))
EOF
```

Expected: `['can_prioritize', 'is_priority']` (or `[]` only if the Administrator has no todos at all — in that case check any project item instead).

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(priority): leader-gated is_priority on update_todo

Reuses the existing update_todo path rather than adding an endpoint; the
controller stays the single authority on the caps and its Bahasa message
reaches the client through the existing error handler."
```

---

### Task 4: Nightly penalty cron

**Files:**
- Modify: `vernon_project/tasks.py` (add a function after `sweep_stale_plans`, which ends at line 288)
- Modify: `vernon_project/hooks.py:236-238`

**Interfaces:**
- Consumes: `Project Todo.is_priority`, `Point Ledger.source == "Priority"`, the settings from Task 1.
- Produces: `charge_missed_priorities() -> int` (count of rows minted). Task 9 tests it directly.

- [ ] **Step 1: Write the job**

Append to `vernon_project/tasks.py` after `sweep_stale_plans`:

```python
def charge_missed_priorities():
    """Cron 00:00: deduct points for priority slots that never reached Done.

    A claimed slot must reach 🟠 Done by the end of its deadline day. Each night every
    still-⚪️ Planned priority whose deadline has passed costs the assignee
    Vernon Settings.priority_miss_penalty points, keyed to the day it missed — so an
    unfinished priority bleeds one charge per day until it goes Done or is cancelled.

    Idempotent: the (todo, source=Priority, credited_on inside that date) probe means a
    re-run mints nothing. credited_on is dated to the missed day, not the run time, so
    the deduction lands on the right day in the wallet log and daily points chart.

    Gated off entirely when slots or the penalty are 0.
    """
    from frappe.utils import add_days, cint, flt, getdate
    from vernon_project.api.mobile import STATUS_PLANNED

    if not cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots")):
        return 0
    penalty = flt(frappe.db.get_single_value("Vernon Settings", "priority_miss_penalty"))
    if penalty <= 0:
        return 0

    missed_on = getdate(add_days(nowdate(), -1))
    rows = frappe.get_all(
        "Project Todo",
        filters={"is_priority": 1, "deadline": ["<=", missed_on], "status": STATUS_PLANNED},
        fields=["name", "to_do", "assigned_to", "project", "`group` as todo_group"],
        limit_page_length=0,
    )
    charged = 0
    for r in rows:
        if not r.assigned_to:
            continue
        if frappe.db.exists("Point Ledger", {
            "todo": r.name,
            "source": "Priority",
            "credited_on": ["between", [f"{missed_on} 00:00:00", f"{missed_on} 23:59:59"]],
        }):
            continue
        # role is left blank on purpose: Project Todo._upsert_ledger_row dedupes on
        # (todo, role), so an "Assignee" penalty row would be overwritten by the
        # todo's own award row when it eventually completes.
        frappe.get_doc({
            "doctype": "Point Ledger",
            "user": r.assigned_to,
            "todo": r.name,
            "project": r.project,
            "group": r.todo_group,
            "source": "Priority",
            "point": -penalty,
            "points_earned": -penalty,
            "credited_on": f"{missed_on} 23:59:59",
            "note": f"Prioritas belum selesai: {r.to_do}",
        }).insert(ignore_permissions=True)
        charged += 1
    if charged:
        frappe.db.commit()
    frappe.logger().info(
        f"charge_missed_priorities: charged {charged} missed priority slots for {missed_on}"
    )
    return charged
```

`deadline <= missed_on` rather than `== missed_on` is what produces the per-day bleed: the same todo is re-selected every night and each night keys a different `credited_on` date, so each night mints exactly one new row.

- [ ] **Step 2: Match the file's indentation**

`tasks.py` mixes tabs and 4-space indentation between functions. Check what `sweep_stale_plans` immediately above uses and match it exactly:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && sed -n '261,266p' vernon_project/tasks.py | cat -A | head -3
```

If the body lines begin with spaces, keep the spaces used above. If they begin with `^I`, convert the new function's body to tabs.

- [ ] **Step 3: Register the cron**

In `hooks.py`, extend the existing `"0 0 * * *"` entry so it reads:

```python
		# Every day 00:00 — sweep past-due day-plan slots off still-Planned todos,
		# then charge yesterday's missed priority slots.
		"0 0 * * *": [
			"vernon_project.tasks.sweep_stale_plans",
			"vernon_project.tasks.charge_missed_priorities",
		],
```

- [ ] **Step 4: Restart and dry-run the job with the feature still off**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.tasks import charge_missed_priorities
print("charged:", charge_missed_priorities())
EOF
```

Expected: `charged: 0` — the job must short-circuit while `daily_priority_slots` is 0. If it returns anything else, the gate is wrong; fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/tasks.py vernon_project/hooks.py
git commit -m "feat(priority): nightly charge for missed priority slots

Selects deadline <= yesterday and keys each row to its own missed date, so the
per-day bleed and idempotency both fall out of one query. Ledger role is left
blank so the todo's own award row cannot overwrite a penalty."
```

---

### Task 5: Dashboard payload + shared types

**Files:**
- Modify: `vernon_project/api/mobile.py:1020-1089` (`get_dashboard`)
- Modify: `frontend/src/lib/types.ts:122-140` (`ProjectItem`), `:273-286` (`Dashboard`)

**Interfaces:**
- Consumes: `_shape_todo`'s `is_priority` / `can_prioritize` (Task 3).
- Produces: `get_dashboard()["priority"] = {"slots": int, "items": ProjectItem[]}`. Task 6 renders exactly this. TypeScript names: `Dashboard.priority.slots`, `Dashboard.priority.items`, `ProjectItem.is_priority`, `ProjectItem.can_prioritize`.

- [ ] **Step 1a: Collect today's non-completed priorities in the existing loop**

`get_dashboard` already fetches Planned / Done / Checked todos and shapes each one, so those three statuses cost nothing extra.

Add `priority` to the accumulator line (line 1039):

```python
	overdue, due_today, upcoming, review, priority = [], [], [], [], []
```

Then inside the `for r in rows:` loop, immediately **before** the existing `# My personal work` block, add:

```python
			# Today's priority slots — mine, deadline today, any status. This cannot be
			# read off due_today: that list is Planned-only, so a priority already marked
			# Done would vanish from the rail and "1/3 selesai" would be uncomputable.
			if (
				shaped["is_mine"]
				and shaped["is_priority"]
				and shaped["deadline"]
				and getdate(shaped["deadline"]) == today
			):
				priority.append(shaped)
```

- [ ] **Step 1b: Top up with today's completed priorities**

The main fetch deliberately excludes ✅ Completed (fetching the whole completed backlog is what the comment at line 1024-1026 exists to avoid), so a finished slot needs its own narrow, assignee-scoped query. Add this after the loop, next to the existing `completed_today` SQL:

```python
	# Completed priorities dated today, so a finished slot still renders on the rail.
	# Scoped to this user in SQL — much narrower than widening the dashboard's status
	# filter, which would pull every finished todo in every visible project.
	done_rows = [
		r for r in _fetch_todos(projects, statuses=[STATUS_COMPLETED], assigned_to=user)
		if r.get("is_priority") and r.get("deadline") and getdate(r["deadline"]) == today
	]
	if done_rows:
		_dn = _user_name_map({r["assigned_to"] for r in done_rows})
		_da = _allocations_map([r["name"] for r in done_rows])
		priority += [
			_shape_todo(r, user, _dn, alloc_map=_da, admins=admins_map.get(r["project"], []))
			for r in done_rows
		]
	# Unfinished slots first so the rail leads with what still needs doing.
	priority.sort(key=lambda t: (t["status_key"] == "completed", t["name"]))
```

- [ ] **Step 2: Return it**

Add to the returned dict, after `"review": review,`:

```python
		"priority": {
			"slots": cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots")),
			"items": priority,
		},
```

Confirm `cint` is imported in `mobile.py` (it is used elsewhere in the file, e.g. in `update_todo`); if not, add it to the `frappe.utils` import.

- [ ] **Step 3: Extend the TypeScript types**

In `frontend/src/lib/types.ts`, add to `interface ProjectItem` right after `can_create: boolean`:

```ts
  is_priority: boolean
  can_prioritize: boolean
```

and add to `interface Dashboard` after `review: ProjectItem[]`:

```ts
  priority: { slots: number; items: ProjectItem[] }
```

- [ ] **Step 4: Restart and verify the payload**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
d = frappe.call("vernon_project.api.mobile.get_dashboard")
print(d["priority"])
EOF
```

Expected: `{'slots': 0, 'items': []}` — slots is still 0 until Task 10.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py frontend/src/lib/types.ts
git commit -m "feat(priority): today's priority slots in the dashboard payload

All statuses, not just Planned, so a finished slot still renders on the rail and
the x/N counter is computable. Completed ones come from a targeted assignee-
scoped query rather than widening the dashboard's status filter."
```

---

### Task 6: The vibrant rail (shared component, both homepages)

**Files:**
- Create: `frontend/src/components/PriorityRail.tsx`
- Modify: `frontend/src/pages/Today.tsx` (imports near line 46; mount inside the `{data && (<>` block after `<BannerCarousel .../>`)
- Modify: `frontend-web/src/pages/Home.tsx` (imports; mount inside `<Page className="space-y-6">` at line ~529, directly after `<ValuesWelcome />`)

**Interfaces:**
- Consumes: `Dashboard.priority` (Task 5).
- Produces: `<PriorityRail slots={number} items={ProjectItem[]} onOpen={(name: string) => void} />` — a default export is **not** used; export it as a named export `PriorityRail`, matching the other components in that folder.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/PriorityRail.tsx`:

```tsx
import clsx from 'clsx'
import { Zap, Check } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { formatEstimate } from '@/lib/format'

// Per-slot accent so the rail reads as a row of distinct, vibrant cards rather
// than one repeated tile. Cycles if an admin ever sets more than four slots.
const ACCENTS = [
  'from-rose-500 via-red-500 to-orange-500',
  'from-violet-500 via-purple-500 to-fuchsia-500',
  'from-sky-500 via-cyan-500 to-teal-500',
  'from-amber-500 via-orange-500 to-yellow-500',
]

const FINISHED = new Set(['done', 'checked', 'completed'])

/**
 * The day's priority slots as vibrant swipe cards. Occupied slots are gradient
 * cards; unclaimed ones are inert dashed ghosts — only project leaders fill a
 * slot, so there is nothing for the assignee to tap. Renders nothing when the
 * feature is off (slots === 0).
 */
export function PriorityRail({
  slots,
  items,
  onOpen,
}: {
  slots: number
  items: ProjectItem[]
  onOpen: (name: string) => void
}) {
  if (!slots) return null
  const filled = items.slice(0, slots)
  const ghosts = Math.max(0, slots - filled.length)
  const doneCount = filled.filter((t) => FINISHED.has(t.status_key)).length

  return (
    <section className="mt-4" aria-label="Prioritas hari ini">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
          <Zap className="h-3.5 w-3.5 text-amber-500" fill="currentColor" /> Prioritas Hari Ini
        </h2>
        <span className="text-xs font-semibold text-stone-400 dark:text-slate-500">
          {doneCount}/{slots} selesai
        </span>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filled.map((t, i) => {
          const done = FINISHED.has(t.status_key)
          return (
            <button
              key={t.name}
              onClick={() => onOpen(t.name)}
              className={clsx(
                'relative flex w-44 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-left text-white shadow-card transition active:scale-95',
                ACCENTS[i % ACCENTS.length],
                done && 'opacity-70',
              )}
            >
              <span className="absolute -bottom-4 -right-3 text-6xl font-black leading-none text-white/15">
                {i + 1}
              </span>
              <span className="relative line-clamp-2 text-sm font-bold leading-snug drop-shadow-sm">
                {t.to_do}
              </span>
              <span className="relative mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
                {done && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{t.project_name}</span>
                {t.estimated > 0 && <span className="shrink-0">· {formatEstimate(t.estimated)}</span>}
              </span>
            </button>
          )
        })}

        {Array.from({ length: ghosts }, (_, i) => (
          <div
            key={`ghost-${i}`}
            className="flex w-44 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-paper-edge py-6 text-stone-400 dark:border-slate-700 dark:text-slate-500"
          >
            <Zap className="h-5 w-5" />
            <span className="text-xs font-semibold">Slot kosong</span>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Confirm `formatEstimate` lives where the import says**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -rn "export .*formatEstimate" frontend/src/lib/
```

If it is exported from a different module, fix the import path. Do not reimplement it.

- [ ] **Step 3: Mount on the mobile home**

In `frontend/src/pages/Today.tsx`, add the import next to the other component imports (near line 46):

```tsx
import { PriorityRail } from '@/components/PriorityRail'
```

Then inside the `{data && (<>` block, immediately after the `<BannerCarousel slides={banners ?? []} />` line, add:

```tsx
              {/* Today's priority slots — vibrant, above everything else in the feed. */}
              <PriorityRail
                slots={data.priority?.slots ?? 0}
                items={data.priority?.items ?? []}
                onOpen={(name) => navigate(`/todo/${name}`)}
              />
```

Confirm the todo route prefix by checking an existing navigation in the same file:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "navigate(\`/" frontend/src/pages/Today.tsx | head
```

Use whatever prefix the other todo navigations use.

- [ ] **Step 4: Mount on the web home**

In `frontend-web/src/pages/Home.tsx`, add:

```tsx
import { PriorityRail } from '@/components/PriorityRail'
```

next to the other `@/` imports. Then inside `return (<Page className="space-y-6">`, directly after `<ValuesWelcome />`, add:

```tsx
      {/* Today's priority slots — same rail as /m, above the bento grid. */}
      <PriorityRail
        slots={d?.priority?.slots ?? 0}
        items={d?.priority?.items ?? []}
        onOpen={(name) => navigate(`/todo/${name}`)}
      />
```

Check what the dashboard data is bound to in that scope — the file uses `const dash = useDashboard()` at line 356 and destructures elsewhere. Use whichever local name is in scope at the mount point (`dash.data` or `d`), and confirm the web todo route with:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "navigate(\`/todo" frontend-web/src/pages/Home.tsx | head
```

`@` resolves to `frontend/src` from the web app, which is how the web already reuses mobile cards — no file is duplicated.

- [ ] **Step 5: Typecheck both frontends**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no errors. A missing `priority` on `Dashboard` here means Task 5 Step 3 was skipped.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PriorityRail.tsx frontend/src/pages/Today.tsx frontend-web/src/pages/Home.tsx
git commit -m "feat(priority): vibrant priority rail on both homepages

One component in frontend/src shared by /m and /w through the @ alias, matching
how the web already reuses mobile cards. Ghost cards are inert — only leaders
fill a slot."
```

---

### Task 7: Leader toggle in both todo detail menus

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (the `topActions` `TopMenu` items array around line 1076-1097)
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (the `OverflowMenu` items array around line 1220-1243)

**Interfaces:**
- Consumes: `ProjectItem.is_priority`, `ProjectItem.can_prioritize` (Task 3); `useUpdateTodo` from `@/hooks/useData` (already imported in both files).
- Produces: nothing downstream.

There is deliberately no live "2/3 slot terpakai" counter — the backend's Bahasa message already names the assignee, the date and the counts when a claim is refused, and a counter would need its own endpoint and its own staleness story.

- [ ] **Step 1: Add the mutation handler (mobile)**

In `ProjectItemScreen.tsx`, next to the existing `const setDeadlineToday = useUpdateTodo(id)` (line ~932), add:

```tsx
  const setPriority = useUpdateTodo(id)
```

Then next to `onDeadlineToday` (line ~1030), add:

```tsx
  // Leaders spend one of the assignee's daily priority slots. The controller owns
  // the caps; a refusal comes back as a Bahasa message naming the person and date.
  const onTogglePriority = () => {
    if (setPriority.isPending) return
    const next = data.is_priority ? 0 : 1
    setPriority.mutate(
      { is_priority: next },
      {
        onSuccess: () => toast('success', next ? 'Dijadikan prioritas hari itu' : 'Prioritas dilepas'),
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }
```

- [ ] **Step 2: Add the menu item (mobile)**

In the `TopMenu` `items` array, add as the first spread entry, before the `data.can_create` block:

```tsx
          ...(data.can_prioritize && data.status_key !== 'cancelled'
            ? [
                {
                  label: data.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas',
                  icon: Zap,
                  onClick: onTogglePriority,
                  disabled: setPriority.isPending,
                },
              ]
            : []),
```

Add `Zap` to the `lucide-react` import in that file if it is not already imported.

- [ ] **Step 3: Mirror it on the web**

In `frontend-web/src/pages/ProjectItem.tsx`, add the same `const setPriority = useUpdateTodo(id)` and `onTogglePriority` handler (use whatever the file's local id variable and toast helper are named — check the neighbouring `onDeadlineToday`), and add the same entry as the first spread in the `OverflowMenu` items array before the `data.can_create` block. Add `Zap` to the `lucide-react` import if missing.

- [ ] **Step 4: Typecheck both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProjectItemScreen.tsx frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(priority): leader toggle in the todo menu on both frontends"
```

---

### Task 8: Settings screens, both frontends

**Files:**
- Modify: `vernon_project/api/mobile.py:2781-2848` (`get_app_settings`), `:2887-2990` (`save_app_settings`)
- Modify: `frontend/src/lib/types.ts:843-883` (`AppSettings`)
- Modify: `frontend/src/pages/SettingsScreen.tsx`
- Modify: `frontend-web/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: the Vernon Settings fields (Task 1).
- Produces: `AppSettings.daily_priority_slots`, `.max_project_priorities_per_day`, `.priority_miss_penalty` (all `number`), readable via `get_app_settings` and writable via `save_app_settings`.

- [ ] **Step 1: Expose them in `get_app_settings`**

Add to the returned dict, next to the `sweep_stale_plan_after_days` line:

```python
		"daily_priority_slots": int(g("daily_priority_slots") or 0),
		"max_project_priorities_per_day": int(g("max_project_priorities_per_day") or 0),
		"priority_miss_penalty": float(g("priority_miss_penalty") or 0),
```

- [ ] **Step 2: Accept them in `save_app_settings`**

Add three parameters to the signature, after `sweep_stale_plan_after_days=None,`:

```python
	daily_priority_slots=None,
	max_project_priorities_per_day=None,
	priority_miss_penalty=None,
```

Add to the `int_fields` dict:

```python
		"daily_priority_slots": daily_priority_slots,
		"max_project_priorities_per_day": max_project_priorities_per_day,
```

Add to the `float_fields` dict:

```python
		"priority_miss_penalty": priority_miss_penalty,
```

The existing loops already reject negatives with `frappe.throw`, so no extra validation is needed.

- [ ] **Step 3: Extend `AppSettings`**

In `frontend/src/lib/types.ts`, add after `sweep_stale_plan_after_days: number`:

```ts
  daily_priority_slots: number
  max_project_priorities_per_day: number
  priority_miss_penalty: number
```

- [ ] **Step 4: Mobile settings card**

In `frontend/src/pages/SettingsScreen.tsx`:

State, next to `const [sweepAfterDays, setSweepAfterDays] = useState<number>(1)`:

```tsx
  const [prioritySlots, setPrioritySlots] = useState<number>(0)
  const [priorityPerProject, setPriorityPerProject] = useState<number>(0)
  const [priorityPenalty, setPriorityPenalty] = useState<number>(0)
```

Load, next to `setSweepAfterDays(loaded.sweep_stale_plan_after_days)`:

```tsx
    setPrioritySlots(loaded.daily_priority_slots ?? 0)
    setPriorityPerProject(loaded.max_project_priorities_per_day ?? 0)
    setPriorityPenalty(loaded.priority_miss_penalty ?? 0)
```

Save, next to `sweep_stale_plan_after_days: Math.max(0, sweepAfterDays)`:

```tsx
        daily_priority_slots: Math.max(0, prioritySlots),
        max_project_priorities_per_day: Math.max(0, priorityPerProject),
        priority_miss_penalty: Math.max(0, priorityPenalty),
```

Render — add a new card immediately after the existing "Sapu rencana lama" card (the `</div>` closing it sits around line 573), using the file's existing `card` class constant and `num()` helper:

```tsx
        <div className={card}>
          <p className="mb-1 text-sm font-bold text-stone-800 dark:text-slate-100">Prioritas Harian</p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Tiap orang punya sejumlah slot prioritas per hari. Ketua proyek mengisi slot yang masih kosong
            dengan salah satu todo orang itu. Prioritas yang belum “🟠 Done” sampai tengah malam memotong
            poin, dan memotong lagi tiap hari sampai selesai. Isi 0 untuk mematikan fitur ini.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Slot prioritas per orang per hari
              </label>
              {num(prioritySlots, setPrioritySlots, '3')}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Maksimum slot yang boleh dipakai satu proyek
              </label>
              {num(priorityPerProject, setPriorityPerProject, '2')}
              <p className="text-xs text-slate-500 dark:text-slate-400">0 = tanpa batas per proyek.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Potongan poin per hari terlewat
              </label>
              {num(priorityPenalty, setPriorityPenalty, '250')}
            </div>
          </div>
        </div>
```

Confirm the `num()` helper's signature before using it:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "const num = \|function num" frontend/src/pages/SettingsScreen.tsx
```

- [ ] **Step 5: Web settings card**

In `frontend-web/src/pages/Settings.tsx`, mirror Step 4 using that file's conventions: state is held as strings and coerced with the local `n()` helper, and fields are wrapped in `<Field label=...>{(id) => <input id={id} className={field} .../>}</Field>`. State:

```tsx
  const [prioritySlots, setPrioritySlots] = useState('0')
  const [priorityPerProject, setPriorityPerProject] = useState('0')
  const [priorityPenalty, setPriorityPenalty] = useState('0')
```

Load, next to the existing `setSweepAfterDays(...)` call:

```tsx
    setPrioritySlots(String(loaded.daily_priority_slots ?? 0))
    setPriorityPerProject(String(loaded.max_project_priorities_per_day ?? 0))
    setPriorityPenalty(String(loaded.priority_miss_penalty ?? 0))
```

Save, next to `sweep_stale_plan_after_days: Math.max(0, n(sweepAfterDays))`:

```tsx
        daily_priority_slots: Math.max(0, n(prioritySlots)),
        max_project_priorities_per_day: Math.max(0, n(priorityPerProject)),
        priority_miss_penalty: Math.max(0, n(priorityPenalty)),
```

Render a "Prioritas Harian" card after the sweep card (around line 700), with the same three labels and the same Bahasa explanation paragraph as Step 4.

- [ ] **Step 6: Restart, typecheck, verify the round-trip**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
s = frappe.call("vernon_project.api.mobile.get_app_settings")
print({k: s[k] for k in ("daily_priority_slots","max_project_priorities_per_day","priority_miss_penalty")})
EOF
```

Expected: no TS errors, and `{'daily_priority_slots': 0, 'max_project_priorities_per_day': 0, 'priority_miss_penalty': 0.0}`.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/api/mobile.py frontend/src/lib/types.ts frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx
git commit -m "feat(priority): Daily Priorities settings on both frontends"
```

---

### Task 9: Tests

**Files:**
- Create: `vernon_project/api/test_priority_slots.py`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

Tests run against the live site, so the fixture must create and delete its own records. Mirror `vernon_project/api/test_allocations.py`, which already does exactly this.

- [ ] **Step 1: Write the test file**

```python
# Copyright (c) 2026, Vernon and Contributors

import frappe
import unittest
from frappe.utils import add_days, nowdate


def _set(**kw):
	for k, v in kw.items():
		frappe.db.set_single_value("Vernon Settings", k, v)


class _PriorityFixture(unittest.TestCase):
	"""Project (owner+leader=Administrator) / Detail / two todos on one day for a
	non-leader assignee. Mirrors test_allocations.py's setup."""

	def setUp(self):
		if not frappe.db.exists("User", "prio_assignee@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_assignee@example.com",
				"first_name": "Prio", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Prio Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Prio Brand"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Prio Group"):
			frappe.get_doc({"doctype": "Project Group", "project_name": "Prio Group"}).insert(ignore_permissions=True)
		self._prev = {
			f: frappe.db.get_single_value("Vernon Settings", f)
			for f in ("daily_priority_slots", "max_project_priorities_per_day", "priority_miss_penalty")
		}
		_set(daily_priority_slots=3, max_project_priorities_per_day=2, priority_miss_penalty=250)
		self.day = str(add_days(nowdate(), 3))
		self.projects, self.details = [], []
		for i in (1, 2):
			p = frappe.get_doc({
				"doctype": "Project", "project_name": f"Prio Project {i}", "brand": "Prio Brand",
				"project_owner": "Administrator", "project_leader": "Administrator",
				"project_group": "Prio Group", "status": "Ongoing", "start_date": nowdate(),
				"deadline": add_days(nowdate(), 30),
				"team_members": [{"user": "Administrator"}, {"user": "prio_assignee@example.com"}],
			}).insert(ignore_permissions=True)
			g = frappe.get_doc({"doctype": "Glossary", "glossary": f"Prio Grouping {i}",
				"project": p.name}).insert(ignore_permissions=True)
			d = frappe.get_doc({"doctype": "Project Detail", "project": p.name,
				"title": f"Prio Detail {i}", "grouping": g.name,
				"project_deadline": add_days(nowdate(), 30), "estimated": 100}).insert(ignore_permissions=True)
			self.projects.append((p, g))
			self.details.append(d)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for d in self.details:
			for name in frappe.get_all("Project Todo", filters={"project_detail": d.name}, pluck="name"):
				for pl in frappe.get_all("Point Ledger", filters={"todo": name}, pluck="name"):
					frappe.delete_doc("Point Ledger", pl, ignore_permissions=True, force=True)
				frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
				frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
			frappe.delete_doc("Project Detail", d.name, ignore_permissions=True, force=True)
		for p, g in self.projects:
			frappe.delete_doc("Glossary", g.name, ignore_permissions=True, force=True)
			frappe.delete_doc("Project", p.name, ignore_permissions=True, force=True)
		_set(**self._prev)
		frappe.db.commit()

	def _todo(self, detail_idx=0, day=None, priority=1, status="⚪️ Planned"):
		return frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.details[detail_idx].name,
			"to_do": "Prio Todo", "assigned_to": "prio_assignee@example.com",
			"deadline": day or self.day, "estimated": 30,
			"status": status, "is_priority": priority,
		}).insert(ignore_permissions=True)


class TestSlotCap(_PriorityFixture):
	def test_within_cap_allowed(self):
		self._todo(0)
		self._todo(1)
		self.assertEqual(len(frappe.get_all("Project Todo", filters={
			"is_priority": 1, "assigned_to": "prio_assignee@example.com", "deadline": self.day})), 2)

	def test_fourth_priority_rejected(self):
		self._todo(0)
		self._todo(0)
		self._todo(1)
		with self.assertRaises(frappe.ValidationError):
			self._todo(1)

	def test_per_project_cap_rejected(self):
		self._todo(0)
		self._todo(0)
		with self.assertRaises(frappe.ValidationError):
			self._todo(0)  # third from the SAME project, day still has a free slot

	def test_cancelled_priority_frees_its_slot(self):
		a = self._todo(0)
		self._todo(0)
		self._todo(1)
		a.status = "🚫 Cancelled"
		a.save(ignore_permissions=True)
		self._todo(1)  # must not raise — the cancelled one no longer occupies a slot

	def test_feature_off_ignores_cap(self):
		_set(daily_priority_slots=0)
		for _ in range(5):
			self._todo(0)

	def test_non_priority_todos_do_not_consume_slots(self):
		for _ in range(5):
			self._todo(0, priority=0)
		self._todo(0)


class TestMissedPriorityCharge(_PriorityFixture):
	def _charge(self):
		from vernon_project.tasks import charge_missed_priorities
		return charge_missed_priorities()

	def test_charges_once_and_is_idempotent(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 1)
		self.assertEqual(self._charge(), 0)
		rows = frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"},
			fields=["points_earned", "user"])
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0].points_earned, -250)
		self.assertEqual(rows[0].user, "prio_assignee@example.com")

	def test_done_priority_not_charged(self):
		self._todo(0, day=str(add_days(nowdate(), -1)), status="🟠 Done")
		self.assertEqual(self._charge(), 0)

	def test_future_priority_not_charged(self):
		self._todo(0)  # deadline is 3 days out
		self.assertEqual(self._charge(), 0)

	def test_penalty_zero_disables_charging(self):
		_set(priority_miss_penalty=0)
		self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 0)

	def test_uncompleting_a_todo_does_not_refund_the_penalty(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 1)
		t.reload()
		t.status = "✅ Completed"
		t.save(ignore_permissions=True)
		t.status = "⚪️ Planned"
		t.save(ignore_permissions=True)
		self.assertEqual(
			len(frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"})), 1
		)
```

`test_charges_once_and_is_idempotent` only proves one night's charge. The per-day bleed is the same code path with a different `credited_on` key, and simulating it needs clock control the test harness does not have — verify it by hand on the live site the morning after Task 10 lands instead.

- [ ] **Step 2: Run the tests**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_priority_slots
```

Expected: all tests pass. If `Project Group` or `Glossary` field names differ from the fixture, correct them against `vernon_project/api/test_allocations.py:59-80`, which is known to work.

- [ ] **Step 3: Confirm the fixture cleaned up after itself**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("Project", filters={"project_name": ["like", "Prio Project%"]}, pluck="name"))
print(frappe.get_all("Point Ledger", filters={"source": "Priority"}, pluck="name"))
print([frappe.db.get_single_value("Vernon Settings", f) for f in ("daily_priority_slots","max_project_priorities_per_day","priority_miss_penalty")])
EOF
```

Expected: two empty lists and `[0, 0, 0.0]`. A leftover project or ledger row is a live-data leak — delete it before continuing.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/test_priority_slots.py
git commit -m "test(priority): slot caps, cancellation, and the nightly charge"
```

---

### Fix task (inserted after Task 9, before Task 10): Point Ledger role-collision bug

**Not part of the original plan.** Task 9's tests surfaced a real, independently-reproduced bug
in already-merged Task 4/2 code: `Point Ledger.role` is a Select field with no explicit
`default`, and Frappe defaults an *omitted* Select to its first listed option (`"Assignee"`) on
insert, not to blank. `charge_missed_priorities()` (Task 4) inserts its penalty row without a
`role`, believing this kept it off `_upsert_ledger_row`'s `(todo, role)` dedupe key — in reality
the row's role becomes `"Assignee"` anyway, so the very first time the assignee completes that
todo, `sync_point_ledger()`'s Assignee-award upsert finds and silently overwrites the penalty row
in place (flipping `source` from `"Priority"` to `"Todo"`), which then defeats `_remove_ledger`'s
`source != "Priority"` guard on any later un-complete. Fixed with a one-line change to
`_upsert_ledger_row`'s existence probe (`vernon_project/vernon_project/doctype/project_todo/project_todo.py:403`):
excludes `source="Priority"` from the dedupe filter outright, verified as a true no-op for both
existing call sites (Assignee/Leader default to `source="Todo"`, Mentor uses `"Mentoring"`; no
call site anywhere writes `source="Priority"` through this method — only `charge_missed_priorities`
does, via a direct insert). Landed before Task 10 so the live `priority_miss_penalty` value never
ships against the broken dedupe.

---

### Task 10: Ship — build, docs, live settings, What's New

**Files:**
- Modify: `vernon_project/public/frontend/**`, `vernon_project/public/frontend_web/**` (build output)
- Modify: `docs/assets/data.js` (generated)

**Interfaces:**
- Consumes: everything above.
- Produces: the live feature.

- [ ] **Step 1: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```

- [ ] **Step 2: Verify the feature actually reached the built bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -rl "Prioritas Hari Ini" vernon_project/public/frontend/assets/ vernon_project/public/frontend_web/assets/
```

Expected: at least one hashed JS file per frontend. An empty result means source was committed but nothing shipped — do not proceed to Step 6.

Then confirm those files are the ones the pages actually load:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -o 'assets/[^"]*\.js' vernon_project/www/m.html vernon_project/www/w.html
```

The hashed names must match files found above.

- [ ] **Step 3: Regenerate the docs data**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

- [ ] **Step 4: Restart**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 5: Set the live values**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.db.set_single_value("Vernon Settings", k, v) for k, v in (("daily_priority_slots", 3), ("max_project_priorities_per_day", 2), ("priority_miss_penalty", 250))])
frappe.db.commit()
print([frappe.db.get_single_value("Vernon Settings", f) for f in ("daily_priority_slots","max_project_priorities_per_day","priority_miss_penalty")])
EOF
```

Expected final line: `[3, 2, 250.0]`.

- [ ] **Step 6: Commit the build output**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web docs/assets/data.js
git commit -m "chore: rebuild bundles for daily priority slots"
```

- [ ] **Step 7: Add the What's New row**

Find the newest existing version first:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.get_all("App Release", fields=["version","release_date"], order_by="creation desc", limit=3))
EOF
```

Bump the minor version from that newest row (this is a feature). Write the row to a file — substitute the bumped version for `X.Y.0`:

```bash
cat > /tmp/claude-1000/priority_release.json <<'EOF'
[{"version": "X.Y.0",
  "release_date": "2026-08-20",
  "title": "Slot Prioritas Harian",
  "notes": "Sekarang kamu punya 3 slot prioritas tiap hari — muncul sebagai kartu warna-warni di paling atas halaman Home (/m & /w)\nKetua proyek yang mengisi slot kamu, maksimal 2 slot dari satu proyek yang sama per hari\nSlot yang belum diisi tampil sebagai kartu kosong, jadi kamu selalu tahu sisa ruang harimu\nPrioritas harus sudah ditandai “🟠 Done” sebelum tengah malam; kalau lewat, poin berkurang 250 dan berkurang lagi tiap hari sampai selesai\nPengaturan jumlah slot dan potongan poin ada di Culture Hub → Settings → Prioritas Harian",
  "platform": "Both"}]
EOF
```

Insert it:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/priority_release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 8: Verify What's New through the real endpoint, per platform**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
for p in ("Mobile", "Web"):
    print(p, [r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)][:2])
EOF
```

Expected: `Slot Prioritas Harian` first for both platforms.

- [ ] **Step 9: Verify the live payload one last time**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
frappe.set_user("Administrator")
print(frappe.call("vernon_project.api.mobile.get_dashboard")["priority"])
EOF
```

Expected: `{'slots': 3, 'items': [...]}` — slots is now 3, items may be empty until a leader claims one.

---

## Post-ship manual check (next morning)

The per-day bleed is the one behaviour no automated test covers. The morning after shipping, confirm a priority left unfinished for two days carries two ledger rows:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
rows = frappe.db.sql("""SELECT todo, DATE(credited_on) d, points_earned
  FROM `tabPoint Ledger` WHERE source='Priority' ORDER BY todo, d""", as_dict=True)
print(rows)
EOF
```

Each `(todo, date)` pair must appear at most once, and a todo missed on two days must show two rows with different dates.
