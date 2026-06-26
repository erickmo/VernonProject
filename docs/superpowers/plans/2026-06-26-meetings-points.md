# Meetings with Points — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user schedule a Meeting, invite Project-Team members, and — when the organizer marks it Done — award points to every participant through the existing Point Ledger.

**Architecture:** New `Meeting` parent doctype + `Meeting Participant` child in the `vernon_project` app, mirroring `Project Todo`. Points are snapshotted from the Group/level system; on Scheduled→Done the controller upserts one idempotent Point Ledger row per participant (`source="Meeting"`, `role="Participant"`) and notifies them. Whitelisted `api/mobile.py` endpoints drive both PWA clients (`/m` mobile `frontend/`, `/w` desktop `frontend-web/`), which share API/types/hooks via the `@/` alias.

**Tech Stack:** Frappe v15 (Python doctype controllers, `unittest` via `bench run-tests`), React 18 + TanStack Query + react-router (no frontend test runner — verify by build).

## Global Constraints

- App root: `/home/frappe/frappe-bench/apps/vernon_project`. Doctype dir: `vernon_project/vernon_project/doctype/`.
- Site: `dev.vernon.id`. Apply schema with `bench --site dev.vernon.id migrate`. Run backend tests with `bench --site dev.vernon.id run-tests`.
- DocType module is always `"Vernon Project"`.
- Status values are exact, emoji included: `⚪️ Scheduled` and `✅ Done`.
- Point formula (whole numbers): `round(base_rate_per_minute × estimated_minutes × difficulty% / 100)`.
- Award is **flat** — `points_earned == point`, no late/early timing adjustment.
- Ledger idempotency key: `(meeting, user)`.
- API endpoints return `{"status": "success"|"error", "message": str, ...}` like `update_todo`.
- Frontend shared layer (`types.ts`, `lib/api.ts`, `hooks/useData.ts`) lives in `frontend/src` and is consumed by `frontend-web` via the `@/` path alias — add it **once**.
- Build mobile: `cd frontend && npm run build`. Build desktop: `cd frontend-web && npm run build`.
- Commit after each task. End commit messages with the two trailers used in this repo's recent history is NOT required; a plain conventional-commit subject is fine.

---

### Task 1: Doctypes — Meeting, Meeting Participant, Point Ledger extension

**Files:**
- Create: `vernon_project/vernon_project/doctype/meeting_participant/__init__.py`
- Create: `vernon_project/vernon_project/doctype/meeting_participant/meeting_participant.json`
- Create: `vernon_project/vernon_project/doctype/meeting_participant/meeting_participant.py`
- Create: `vernon_project/vernon_project/doctype/meeting/__init__.py`
- Create: `vernon_project/vernon_project/doctype/meeting/meeting.json`
- Create: `vernon_project/vernon_project/doctype/meeting/meeting.py`
- Create: `vernon_project/vernon_project/doctype/meeting/test_meeting.py`
- Modify: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`

**Interfaces:**
- Produces: doctype `Meeting` with fields `title, project, organizer, scheduled_at, estimated, group, level, level_type, level_id, point, status, participants, notes`; child `Meeting Participant` with `user`. `Meeting` controller class `Meeting(Document)` with `validate()` (empty stub for now).
- Produces: `Point Ledger` gains `meeting` (Link Meeting), `source` option `Meeting`, `role` option `Participant`.

- [ ] **Step 1: Create the child doctype Meeting Participant**

`meeting_participant/__init__.py`: empty file.

`meeting_participant/meeting_participant.json`:
```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-06-26 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["user"],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "in_list_view": 1, "label": "User", "options": "User", "reqd": 1, "search_index": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-06-26 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Meeting Participant",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

`meeting_participant/meeting_participant.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class MeetingParticipant(Document):
	pass
```

- [ ] **Step 2: Create the Meeting parent doctype JSON**

`meeting/__init__.py`: empty file.

`meeting/meeting.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-26 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "title", "project", "organizer", "column_break_a",
  "scheduled_at", "estimated", "status", "section_break_b",
  "group", "level", "level_type", "level_id", "point", "section_break_c",
  "participants", "notes"
 ],
 "fields": [
  {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1},
  {"fieldname": "project", "fieldtype": "Link", "label": "Project", "options": "Project", "reqd": 1, "in_standard_filter": 1, "search_index": 1},
  {"fieldname": "organizer", "fieldtype": "Link", "label": "Organizer", "options": "User", "read_only": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "scheduled_at", "fieldtype": "Datetime", "label": "Scheduled At"},
  {"fieldname": "estimated", "fieldtype": "Int", "label": "Estimated (minutes)", "default": "0"},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "⚪️ Scheduled\n✅ Done", "default": "⚪️ Scheduled", "reqd": 1, "read_only": 1, "in_list_view": 1},
  {"fieldname": "section_break_b", "fieldtype": "Section Break", "label": "Points"},
  {"fieldname": "group", "fieldtype": "Link", "label": "Group", "options": "Group"},
  {"fieldname": "level", "fieldtype": "Data", "label": "Level", "read_only": 1},
  {"fieldname": "level_type", "fieldtype": "Data", "label": "Level Type", "read_only": 1},
  {"fieldname": "level_id", "fieldtype": "Data", "label": "Level ID", "hidden": 1, "no_copy": 1},
  {"fieldname": "point", "fieldtype": "Float", "label": "Point", "read_only": 1},
  {"fieldname": "section_break_c", "fieldtype": "Section Break", "label": "Participants"},
  {"fieldname": "participants", "fieldtype": "Table", "label": "Participants", "options": "Meeting Participant"},
  {"fieldname": "notes", "fieldtype": "Small Text", "label": "Notes"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-26 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Meeting",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Project Owner", "create": 1, "delete": 1, "read": 1, "report": 1, "write": 1, "export": 1, "print": 1},
  {"role": "Project Leader", "create": 1, "delete": 1, "read": 1, "report": 1, "write": 1, "export": 1, "print": 1},
  {"role": "Project Team", "read": 1, "report": 1, "export": 1, "print": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the Meeting controller stub**

`meeting/meeting.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class Meeting(Document):
	def validate(self):
		pass
```

- [ ] **Step 4: Extend Point Ledger JSON**

In `point_ledger/point_ledger.json`:
- In `field_order`, append `"meeting"` after `"granted_by"`.
- Change the `role` field options from `"Assignee\nLeader"` to `"Assignee\nLeader\nParticipant"`.
- Change the `source` field options from `"Todo\nGrant\nGift"` to `"Todo\nGrant\nGift\nMeeting"`.
- In `fields`, add after the `granted_by` entry:
```json
  {"fieldname": "meeting", "fieldtype": "Link", "label": "Meeting", "options": "Meeting", "search_index": 1}
```

- [ ] **Step 5: Write the test that the doctypes exist and default correctly**

`meeting/test_meeting.py`:
```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


class MeetingTestBase(unittest.TestCase):
	def setUp(self):
		for email, first in (("m_user1@example.com", "M1"), ("m_user2@example.com", "M2")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": first,
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group", "project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Meeting Test Project",
			"brand": "Test Customer",
			"project_group": "Test Project Group",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "m_user1@example.com"},
				{"user": "m_user2@example.com"},
			],
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Meeting", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Meeting", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def make_meeting(self, **kw):
		doc = frappe.get_doc({
			"doctype": "Meeting",
			"project": self.project.name,
			"title": kw.pop("title", "Standup"),
			"participants": [{"user": u} for u in kw.pop("participants", [])],
			**kw,
		})
		doc.insert(ignore_permissions=True)
		return doc


class TestMeetingBasics(MeetingTestBase):
	def test_defaults_status_and_zero_point(self):
		m = self.make_meeting()
		self.assertEqual(m.status, "⚪️ Scheduled")
		self.assertEqual(m.point or 0, 0)
		self.assertEqual(m.organizer, "Administrator")
```

- [ ] **Step 6: Migrate and run the test**

Run:
```bash
cd /home/frappe/frappe-bench
bench --site dev.vernon.id migrate
bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting
```
Expected: migrate creates `Meeting`, `Meeting Participant`, and the new Point Ledger column; `TestMeetingBasics.test_defaults_status_and_zero_point` PASSES (organizer auto-set is provided by Step 3? No — add it now if it fails). If `organizer` is empty, proceed to Task 2 which adds it; for now change the assertion expectation only if needed. Prefer to add organizer defaulting here:

In `meeting.py` `validate`, replace `pass` with:
```python
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
```
Re-run; test PASSES.

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/meeting vernon_project/vernon_project/doctype/meeting_participant vernon_project/vernon_project/doctype/point_ledger/point_ledger.json
git commit -m "feat(meeting): Meeting + Meeting Participant doctypes; Point Ledger meeting/source/role"
```

---

### Task 2: Point snapshot from Group/level

**Files:**
- Modify: `vernon_project/vernon_project/doctype/meeting/meeting.py`
- Test: `vernon_project/vernon_project/doctype/meeting/test_meeting.py`

**Interfaces:**
- Produces: `Meeting.snapshot_point_from_level()` sets `point`, `level`, `level_type` from `group`+`level_id`, using the same formula as Project Todo.

- [ ] **Step 1: Write the failing test**

Append to `test_meeting.py`:
```python
class TestMeetingPoints(MeetingTestBase):
	def setUp(self):
		super().setUp()
		self.group = frappe.get_doc({
			"doctype": "Group",
			"group_name": "Meeting Group",
			"base_rate_per_minute": 2,
			"levels": [
				{"type_name": "Sync", "level_name": "Easy", "difficulty_percent": 50},
			],
		})
		self.group.insert(ignore_permissions=True)
		self.level_id = self.group.levels[0].level_id
		frappe.db.commit()

	def tearDown(self):
		frappe.delete_doc("Group", self.group.name, force=True, ignore_permissions=True)
		super().tearDown()

	def test_point_is_rate_times_minutes_times_difficulty(self):
		# 2 /min × 30 min × 50% = 30
		m = self.make_meeting(group=self.group.name, level_id=self.level_id, estimated=30)
		self.assertEqual(m.point, 30)
		self.assertEqual(m.level, "Easy")
		self.assertEqual(m.level_type, "Sync")

	def test_no_group_zero_point(self):
		m = self.make_meeting(estimated=30)
		self.assertEqual(m.point or 0, 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: `test_point_is_rate_times_minutes_times_difficulty` FAILS (point is 0, level None).

- [ ] **Step 3: Implement the snapshot**

In `meeting.py`, set `validate` and add the method:
```python
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		self.snapshot_point_from_level()

	def snapshot_point_from_level(self):
		"""point = group.base_rate_per_minute × estimated × difficulty%.
		Mirrors Project Todo.snapshot_point_from_level (flat, no timing)."""
		if not self.group:
			self.point = 0
			self.level = None
			self.level_type = None
			self.level_id = None
			return

		def _compute(difficulty_percent):
			base_rate = frappe.db.get_value("Group", self.group, "base_rate_per_minute") or 0
			minutes = float(self.estimated or 0)
			pct = float(difficulty_percent or 0)
			return round(float(base_rate) * minutes * (pct / 100.0))

		if self.level_id:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_id": self.level_id},
				["type_name", "level_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level = row.level_name
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			return
		if self.level:
			row = frappe.db.get_value(
				"Group Level",
				{"parent": self.group, "parenttype": "Group", "level_name": self.level},
				["name", "level_id", "type_name", "difficulty_percent"],
				as_dict=True,
			)
			if row:
				self.level_id = row.level_id
				self.level_type = row.type_name
				self.point = _compute(row.difficulty_percent)
			return
		self.point = 0
```

- [ ] **Step 4: Run to verify it passes**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/meeting/meeting.py vernon_project/vernon_project/doctype/meeting/test_meeting.py
git commit -m "feat(meeting): snapshot point from group/level"
```

---

### Task 3: Participants must be Project-Team members

**Files:**
- Modify: `vernon_project/vernon_project/doctype/meeting/meeting.py`
- Test: `vernon_project/vernon_project/doctype/meeting/test_meeting.py`

**Interfaces:**
- Produces: `Meeting.validate_participants_in_team()` raises `frappe.ValidationError` if any participant `user` is not in the project's `Project Team`.

- [ ] **Step 1: Write the failing test**

Append to `test_meeting.py`:
```python
class TestMeetingTeamGuard(MeetingTestBase):
	def test_non_team_member_rejected(self):
		if not frappe.db.exists("User", "outsider@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "outsider@example.com",
				"first_name": "Out", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			self.make_meeting(participants=["outsider@example.com"])

	def test_team_member_accepted(self):
		m = self.make_meeting(participants=["m_user1@example.com"])
		self.assertEqual(len(m.participants), 1)
```

- [ ] **Step 2: Run to verify it fails**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: `test_non_team_member_rejected` FAILS (no exception raised).

- [ ] **Step 3: Implement the guard**

In `meeting.py` `validate`, add the call and method:
```python
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		self.snapshot_point_from_level()
		self.validate_participants_in_team()

	def validate_participants_in_team(self):
		if not self.project:
			return
		team = set(frappe.get_all(
			"Project Team",
			filters={"parent": self.project, "parenttype": "Project"},
			pluck="user",
		))
		for row in self.participants:
			if row.user and row.user not in team:
				frappe.throw(_("Participant '{0}' is not a member of the Project Team.").format(row.user))
```

- [ ] **Step 4: Run to verify it passes**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/meeting/meeting.py vernon_project/vernon_project/doctype/meeting/test_meeting.py
git commit -m "feat(meeting): restrict participants to project team"
```

---

### Task 4: Award points on Done (idempotent) + remove on reopen + notify

**Files:**
- Modify: `vernon_project/vernon_project/doctype/meeting/meeting.py`
- Test: `vernon_project/vernon_project/doctype/meeting/test_meeting.py`

**Interfaces:**
- Produces: `Meeting.on_change()` — Scheduled→Done calls `sync_point_ledger()` (per-participant upsert keyed on `(meeting, user)`, `role="Participant"`, `source="Meeting"`, `points_earned=point`) + `_notify` each; Done→Scheduled calls `remove_ledger()` (deletes this meeting's ledger rows).

- [ ] **Step 1: Write the failing test**

Append to `test_meeting.py`:
```python
class TestMeetingAward(TestMeetingPoints):
	def _ledger_for(self, meeting):
		return frappe.get_all(
			"Point Ledger",
			filters={"meeting": meeting},
			fields=["user", "points_earned", "role", "source"],
		)

	def test_done_credits_each_participant_once(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com", "m_user2@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		rows = self._ledger_for(m.name)
		self.assertEqual(len(rows), 2)
		self.assertTrue(all(r.points_earned == 30 for r in rows))
		self.assertTrue(all(r.role == "Participant" and r.source == "Meeting" for r in rows))

	def test_resaving_done_does_not_double_credit(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		m.notes = "touch"
		m.save(ignore_permissions=True)
		self.assertEqual(len(self._ledger_for(m.name)), 1)

	def test_reopen_removes_ledger(self):
		m = self.make_meeting(
			group=self.group.name, level_id=self.level_id, estimated=30,
			participants=["m_user1@example.com"],
		)
		m.status = "✅ Done"
		m.save(ignore_permissions=True)
		m.status = "⚪️ Scheduled"
		m.save(ignore_permissions=True)
		self.assertEqual(len(self._ledger_for(m.name)), 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: the three new tests FAIL (no ledger rows created).

- [ ] **Step 3: Implement on_change + ledger methods**

Append to `Meeting` in `meeting.py`:
```python
	DONE = "✅ Done"

	def on_change(self):
		old = self.get_doc_before_save()
		prev = old.status if old else None
		if prev == self.status:
			return
		if self.status == self.DONE:
			self.sync_point_ledger()
		elif prev == self.DONE:
			self.remove_ledger()

	def sync_point_ledger(self):
		"""Credit each participant once. Idempotent on (meeting, user)."""
		for row in self.participants:
			self._upsert_ledger_row(row.user)
			self._notify_award(row.user)

	def _upsert_ledger_row(self, user):
		if not user:
			return
		existing = frappe.db.exists("Point Ledger", {"meeting": self.name, "user": user})
		values = {
			"user": user,
			"role": "Participant",
			"source": "Meeting",
			"meeting": self.name,
			"group": self.group,
			"project": self.project,
			"level_name": self.level,
			"point": self.point,
			"points_earned": self.point,
			"credited_on": now_datetime(),
		}
		if existing:
			doc = frappe.get_doc("Point Ledger", existing)
			doc.update(values)
			doc.save(ignore_permissions=True)
		else:
			frappe.get_doc({"doctype": "Point Ledger", **values}).insert(ignore_permissions=True)

	def remove_ledger(self):
		for name in frappe.get_all("Point Ledger", filters={"meeting": self.name}, pluck="name"):
			frappe.delete_doc("Point Ledger", name, ignore_permissions=True, force=True)

	def _notify_award(self, user):
		"""Best-effort in-app + push notification; never breaks the save."""
		try:
			from vernon_project.api.mobile import _notify
			_notify(
				recipient=user,
				type="Points",
				title="You earned points",
				body=f"“{self.title}” meeting completed: +{int(self.point or 0)} points.",
				reference_doctype="Meeting",
				reference_name=self.name,
				actor=frappe.session.user,
			)
		except Exception:
			frappe.log_error(title="Meeting _notify_award failed")
```

- [ ] **Step 4: Run to verify it passes**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/meeting/meeting.py vernon_project/vernon_project/doctype/meeting/test_meeting.py
git commit -m "feat(meeting): award points to participants on Done (idempotent) + notify"
```

---

### Task 5: Permissions (query conditions + has_permission + hooks)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/meeting/meeting.py`
- Modify: `vernon_project/hooks.py`
- Test: `vernon_project/vernon_project/doctype/meeting/test_meeting.py`

**Interfaces:**
- Produces module functions `get_permission_query_conditions(user)` and `has_permission(doc, ptype, user)` in `meeting.py`, registered in `hooks.py` under `permission_query_conditions["Meeting"]` and `has_permission["Meeting"]`.

- [ ] **Step 1: Write the failing test**

Append to `test_meeting.py`:
```python
class TestMeetingPermissions(MeetingTestBase):
	def test_team_member_can_read_non_member_cannot(self):
		m = self.make_meeting(participants=["m_user1@example.com"])
		frappe.set_user("m_user1@example.com")
		names = frappe.get_list("Meeting", filters={"name": m.name}, pluck="name")
		self.assertIn(m.name, names)
		frappe.set_user("Administrator")

		if not frappe.db.exists("User", "outsider2@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "outsider2@example.com",
				"first_name": "Out2", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("outsider2@example.com")
		names = frappe.get_list("Meeting", filters={"name": m.name}, pluck="name")
		self.assertNotIn(m.name, names)
		frappe.set_user("Administrator")
```

- [ ] **Step 2: Run to verify it fails**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting`
Expected: FAILS (without registered conditions, the outsider may still see the row, or the member may not — assertion fails).

- [ ] **Step 3: Implement permission functions**

Append to `meeting.py` (module level, after the class):
```python
def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	user_esc = frappe.db.escape(user)
	return f"""
		EXISTS (
			SELECT 1 FROM `tabProject` p
			WHERE p.name = `tabMeeting`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
					OR EXISTS (
						SELECT 1 FROM `tabProject Team` pt
						WHERE pt.parent = p.name AND pt.user = {user_esc}
					)
				)
		)
	"""


def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True
	if not doc.project:
		return False
	project = frappe.get_doc("Project", doc.project)
	if user in (project.project_owner, project.project_leader, project.project_admin):
		return True
	if any(t.user == user for t in project.team_members):
		return True
	return False
```

- [ ] **Step 4: Register in hooks.py**

In `vernon_project/hooks.py`, add the `Meeting` entry to both dicts:
```python
permission_query_conditions = {
	"Project": "vernon_project.vernon_project.doctype.project.project.get_permission_query_conditions",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.get_permission_query_conditions",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.get_permission_query_conditions",
	"Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.get_permission_query_conditions",
	"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.get_permission_query_conditions",
	"Meeting": "vernon_project.vernon_project.doctype.meeting.meeting.get_permission_query_conditions",
}

has_permission = {
	"Project": "vernon_project.vernon_project.doctype.project.project.has_permission",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.has_permission",
	"Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.has_permission",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.has_permission",
	"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.has_permission",
	"Meeting": "vernon_project.vernon_project.doctype.meeting.meeting.has_permission",
}
```

- [ ] **Step 5: Migrate (hooks change) and run the test**

Run:
```bash
bench --site dev.vernon.id migrate
bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.meeting.test_meeting
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/meeting/meeting.py vernon_project/hooks.py vernon_project/vernon_project/doctype/meeting/test_meeting.py
git commit -m "feat(meeting): project-scoped read permissions"
```

---

### Task 6: Mobile API endpoints

**Files:**
- Modify: `vernon_project/api/mobile.py`
- Test: `vernon_project/api/test_meeting_api.py` (new)

**Interfaces:**
- Produces whitelisted functions in `vernon_project.api.mobile`:
  - `create_meeting(project, title, scheduled_at=None, estimated=0, group=None, level_id=None, participants=None, notes=None)` → `{status, message, name?}`
  - `update_meeting(meeting, title=None, scheduled_at=None, estimated=None, group=None, level_id=None, notes=None)` → `{status, message}`
  - `set_meeting_participants(meeting, users)` → `{status, message}`
  - `list_meetings(project=None)` → `{meetings: [...]}`
  - `mark_meeting_done(meeting)` / `reopen_meeting(meeting)` → `{status, message}`
  - `meeting_invitable_users(project, txt="")` → `{users: [{user, full_name}]}`

- [ ] **Step 1: Confirm `json` import**

At the top of `vernon_project/api/mobile.py`, ensure `import json` is present (most Frappe API modules already import it). If absent, add `import json` next to the other imports.

- [ ] **Step 2: Write the failing test**

`vernon_project/api/test_meeting_api.py`:
```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api import mobile


class TestMeetingApi(unittest.TestCase):
	def setUp(self):
		for email, first in (("api_u1@example.com", "A1"), ("api_u2@example.com", "A2")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": first,
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group", "project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Meeting API Project",
			"brand": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "api_u1@example.com"},
				{"user": "api_u2@example.com"},
			],
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Meeting", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Meeting", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_create_then_list(self):
		res = mobile.create_meeting(
			project=self.project.name, title="Kickoff",
			participants='["api_u1@example.com", "api_u2@example.com"]',
		)
		self.assertEqual(res["status"], "success")
		listed = mobile.list_meetings(project=self.project.name)["meetings"]
		self.assertEqual(len(listed), 1)
		self.assertEqual(listed[0]["title"], "Kickoff")
		self.assertEqual(sorted(listed[0]["participants"]), ["api_u1@example.com", "api_u2@example.com"])

	def test_invitable_users_are_team(self):
		users = mobile.meeting_invitable_users(project=self.project.name)["users"]
		emails = {u["user"] for u in users}
		self.assertIn("api_u1@example.com", emails)
		self.assertNotIn("nobody@example.com", emails)

	def test_mark_done_awards(self):
		res = mobile.create_meeting(
			project=self.project.name, title="Retro",
			participants='["api_u1@example.com"]',
		)
		name = res["name"]
		done = mobile.mark_meeting_done(meeting=name)
		self.assertEqual(done["status"], "success")
		rows = frappe.get_all("Point Ledger", filters={"meeting": name}, pluck="name")
		self.assertEqual(len(rows), 1)
```

- [ ] **Step 3: Run to verify it fails**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.api.test_meeting_api`
Expected: FAILS with `AttributeError: module 'vernon_project.api.mobile' has no attribute 'create_meeting'`.

- [ ] **Step 4: Implement the endpoints**

Append to `vernon_project/api/mobile.py`:
```python
# ---------------------------------------------------------------------------
# Meetings
# ---------------------------------------------------------------------------

MEETING_SCHEDULED = "⚪️ Scheduled"
MEETING_DONE = "✅ Done"


def _meeting_can_manage(doc):
	user = frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	owner, leader = frappe.get_value("Project", doc.project, ["project_owner", "project_leader"])
	return user in (doc.organizer, owner, leader)


@frappe.whitelist()
def create_meeting(project, title, scheduled_at=None, estimated=0, group=None,
				   level_id=None, participants=None, notes=None):
	try:
		if not frappe.db.exists("Project", project):
			return {"status": "error", "message": "Project not found."}
		user = frappe.session.user
		owner, leader = frappe.get_value("Project", project, ["project_owner", "project_leader"])
		if "System Manager" not in frappe.get_roles(user) and user not in (owner, leader):
			return {"status": "error", "message": "Only the Project Owner or Leader can create meetings."}
		rows = json.loads(participants) if isinstance(participants, str) else (participants or [])
		doc = frappe.get_doc({
			"doctype": "Meeting",
			"project": project,
			"title": title,
			"organizer": user,
			"scheduled_at": scheduled_at,
			"estimated": int(estimated or 0),
			"group": group,
			"level_id": level_id,
			"notes": notes,
			"status": MEETING_SCHEDULED,
			"participants": [{"user": u} for u in rows if u],
		})
		doc.insert()
		return {"status": "success", "message": "Meeting created.", "name": doc.name}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def update_meeting(meeting, title=None, scheduled_at=None, estimated=None,
				   group=None, level_id=None, notes=None):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot edit this meeting."}
		if doc.status == MEETING_DONE:
			return {"status": "error", "message": "A completed meeting cannot be edited."}
		if title is not None:
			doc.title = title
		if scheduled_at is not None:
			doc.scheduled_at = scheduled_at
		if estimated is not None:
			doc.estimated = int(estimated or 0)
		if group is not None:
			doc.group = group
		if level_id is not None:
			doc.level_id = level_id
		if notes is not None:
			doc.notes = notes
		doc.save()
		return {"status": "success", "message": "Meeting updated."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def set_meeting_participants(meeting, users):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot edit this meeting."}
		if doc.status == MEETING_DONE:
			return {"status": "error", "message": "A completed meeting cannot be edited."}
		rows = json.loads(users) if isinstance(users, str) else (users or [])
		doc.set("participants", [{"user": u} for u in rows if u])
		doc.save()
		return {"status": "success", "message": "Participants updated."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def list_meetings(project=None):
	filters = {}
	if project:
		filters["project"] = project
	rows = frappe.get_list(
		"Meeting",
		filters=filters,
		fields=["name", "title", "project", "organizer", "scheduled_at",
				"estimated", "point", "status"],
		order_by="scheduled_at desc",
	)
	user = frappe.session.user
	roles = frappe.get_roles(user)
	for r in rows:
		r["participants"] = frappe.get_all(
			"Meeting Participant",
			filters={"parent": r["name"], "parenttype": "Meeting"},
			pluck="user",
		)
		owner, leader = frappe.get_value("Project", r["project"], ["project_owner", "project_leader"])
		r["can_mark_done"] = (
			"System Manager" in roles or user in (r["organizer"], owner, leader)
		)
	return {"meetings": rows}


@frappe.whitelist()
def mark_meeting_done(meeting):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "Only the organizer or Project Owner/Leader can mark this done."}
		if doc.status == MEETING_DONE:
			return {"status": "success", "message": "Already done."}
		doc.status = MEETING_DONE
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Meeting marked done; points awarded."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def reopen_meeting(meeting):
	try:
		doc = frappe.get_doc("Meeting", meeting)
		if not _meeting_can_manage(doc):
			return {"status": "error", "message": "You cannot reopen this meeting."}
		if doc.status == MEETING_SCHEDULED:
			return {"status": "success", "message": "Already scheduled."}
		doc.status = MEETING_SCHEDULED
		doc.save(ignore_permissions=True)
		return {"status": "success", "message": "Meeting reopened; points removed."}
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}


@frappe.whitelist()
def meeting_invitable_users(project, txt=""):
	if not project:
		return {"users": []}
	team = frappe.get_all(
		"Project Team",
		filters={"parent": project, "parenttype": "Project"},
		pluck="user",
	)
	if not team:
		return {"users": []}
	like = f"%{txt}%"
	rows = frappe.db.sql(
		"""SELECT name AS user, full_name FROM `tabUser`
		   WHERE name IN %(team)s AND (name LIKE %(like)s OR full_name LIKE %(like)s)
		   ORDER BY full_name""",
		{"team": tuple(team), "like": like},
		as_dict=True,
	)
	return {"users": rows}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bench --site dev.vernon.id run-tests --module vernon_project.api.test_meeting_api`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_meeting_api.py
git commit -m "feat(api): meeting create/update/list/participants/done/reopen/invitable endpoints"
```

---

### Task 7: Shared frontend layer — types, api methods, query hooks

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces TS types `Meeting`, `MeetingListItem`; `mobileApi` methods `createMeeting`, `updateMeeting`, `listMeetings`, `setMeetingParticipants`, `markMeetingDone`, `reopenMeeting`, `meetingInvitableUsers`; query keys `keys.meetings`/`keys.meeting(n)` and hooks `useMeetings`, `useCreateMeeting`, `useMarkMeetingDone`, `useReopenMeeting`, `useMeetingInvitableUsers`.
- Consumed by Tasks 8 and 9.

- [ ] **Step 1: Add types**

Append to `frontend/src/lib/types.ts`:
```typescript
export interface MeetingListItem {
  name: string
  title: string
  project: string
  organizer: string
  scheduled_at: string | null
  estimated: number
  point: number
  status: string
  participants: string[]
  can_mark_done: boolean
}

export interface MeetingInvitableUser {
  user: string
  full_name: string
}
```

- [ ] **Step 2: Add api methods**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object (alongside the existing methods, using the existing `M` constant = `'vernon_project.api.mobile.'`), add:
```typescript
  createMeeting: (fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string; name?: string }>(M + 'create_meeting', fields),
  updateMeeting: (fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string }>(M + 'update_meeting', fields),
  listMeetings: (project?: string) =>
    api.get<{ meetings: import('./types').MeetingListItem[] }>(M + 'list_meetings', {
      ...(project ? { project } : {}),
    }),
  setMeetingParticipants: (meeting: string, users: string[]) =>
    api.post<{ status: string; message: string }>(M + 'set_meeting_participants', {
      meeting,
      users: JSON.stringify(users),
    }),
  markMeetingDone: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'mark_meeting_done', { meeting }),
  reopenMeeting: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'reopen_meeting', { meeting }),
  meetingInvitableUsers: (project: string, txt = '') =>
    api.get<{ users: import('./types').MeetingInvitableUser[] }>(M + 'meeting_invitable_users', {
      project,
      txt,
    }),
```

- [ ] **Step 3: Add query keys + hooks**

In `frontend/src/hooks/useData.ts`:

In the `keys` object add:
```typescript
  meetings: ['meetings'] as const,
  meeting: (n: string) => ['meeting', n] as const,
```

At the end of the file add:
```typescript
export const useMeetings = (project?: string) =>
  useQuery({
    queryKey: project ? (['meetings', project] as const) : keys.meetings,
    queryFn: () => mobileApi.listMeetings(project),
  })

export const useMeetingInvitableUsers = (project: string) =>
  useQuery({
    queryKey: ['meeting-invitable', project] as const,
    queryFn: () => mobileApi.meetingInvitableUsers(project),
    enabled: !!project,
  })

export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const res = await mobileApi.createMeeting(fields)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
    },
  })
}

export function useMarkMeetingDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: string) => {
      const res = await mobileApi.markMeetingDone(meeting)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useReopenMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: string) => {
      const res = await mobileApi.reopenMeeting(meeting)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
      qc.invalidateQueries({ queryKey: keys.wallet })
    },
  })
}
```
If `useData.ts` does not already import `mobileApi`, `useQuery`, `useMutation`, `useQueryClient`, confirm the existing imports at the top of the file include them (they are used by existing hooks like `useCreateProjectItem`); reuse the same import lines — do not add duplicates.

- [ ] **Step 4: Typecheck the mobile app**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend
npx tsc --noEmit
```
Expected: no errors referencing the new code.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(frontend): meeting types, api methods, query hooks (shared)"
```

---

### Task 8: Mobile UI — Meetings screen, create sheet, mark-done

**Files:**
- Create: `frontend/src/components/CreateMeetingSheet.tsx`
- Create: `frontend/src/screens/MeetingsScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes Task 7 hooks. `CreateMeetingSheet` props: `{ open: boolean; onClose: () => void; project: string }`. `MeetingsScreen` is the route element for `/meetings`.

- [ ] **Step 1: Create the meeting list + project picker screen**

`frontend/src/screens/MeetingsScreen.tsx`:
```tsx
import { useState } from 'react'
import { Plus, Check, Users } from 'lucide-react'
import { useProjects } from '../hooks/useData'
import { useMeetings, useMarkMeetingDone, useReopenMeeting } from '../hooks/useData'
import { SearchableSelect } from '../components/SearchableSelect'
import { CreateMeetingSheet } from '../components/CreateMeetingSheet'
import { useToast } from '../components/Toast'

export function MeetingsScreen() {
  const toast = useToast()
  const projects = useProjects()
  const [project, setProject] = useState('')
  const [sheet, setSheet] = useState(false)
  const meetings = useMeetings(project || undefined)
  const markDone = useMarkMeetingDone()
  const reopen = useReopenMeeting()

  const projectOptions =
    (projects.data ?? []).map((p: { name: string; project_name?: string }) => ({
      value: p.name,
      label: p.project_name ?? p.name,
    }))

  const onDone = (name: string) =>
    markDone.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })
  const onReopen = (name: string) =>
    reopen.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Meetings</h1>
        <button
          disabled={!project}
          onClick={() => setSheet(true)}
          className="flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      <div className="mb-4">
        <SearchableSelect
          value={project}
          onChange={setProject}
          options={projectOptions}
          placeholder="Pick a project…"
        />
      </div>

      {!project && (
        <p className="text-sm text-slate-500">Select a project to see its meetings.</p>
      )}

      <div className="flex flex-col gap-3">
        {(meetings.data?.meetings ?? []).map((m) => (
          <div key={m.name} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 dark:text-slate-50">{m.title}</span>
              <span className="text-xs text-slate-500">{m.status}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {m.participants.length}
              </span>
              <span>{Math.round(m.point)} pts each</span>
              {m.scheduled_at && <span>{m.scheduled_at}</span>}
            </div>
            {m.can_mark_done && (
              <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                {m.status === '✅ Done' ? (
                  <button
                    onClick={() => onReopen(m.name)}
                    className="text-sm font-semibold text-slate-500"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => onDone(m.name)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300"
                  >
                    <Check className="h-4 w-4" /> Mark done & award points
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {project && (
        <CreateMeetingSheet open={sheet} onClose={() => setSheet(false)} project={project} />
      )}
    </div>
  )
}
```
Note: `useProjects` already exists in `useData.ts` and returns the project list used elsewhere; if its item shape differs, adapt the `projectOptions` mapping to the actual fields (the existing Projects screen shows the correct field names). `SearchableSelect` and `useToast` are existing components.

- [ ] **Step 2: Create the create sheet**

`frontend/src/components/CreateMeetingSheet.tsx`:
```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { MultiSelectSearch } from './MultiSelectSearch'
import { useCreateMeeting, useMeetingInvitableUsers } from '../hooks/useData'
import { useToast } from './Toast'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function CreateMeetingSheet({ open, onClose, project }: Props) {
  const toast = useToast()
  const create = useCreateMeeting()
  const invitable = useMeetingInvitableUsers(project)

  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [participants, setParticipants] = useState<string[]>([])

  const reset = () => {
    setTitle('')
    setScheduledAt('')
    setEstimated('')
    setNotes('')
    setParticipants([])
  }
  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    const fields: Record<string, unknown> = {
      project,
      title: title.trim(),
      participants: JSON.stringify(participants),
    }
    if (scheduledAt) fields.scheduled_at = scheduledAt
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    create.mutate(fields, {
      onSuccess: () => {
        toast('success', 'Meeting created')
        close()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

  const options = (invitable.data?.users ?? []).map((u) => ({
    value: u.user,
    label: u.full_name || u.user,
  }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">New meeting</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <input
            className={field}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={field}
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <input
            className={field}
            type="number"
            placeholder="Estimated minutes"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
          />
          <MultiSelectSearch
            value={participants}
            onChange={setParticipants}
            options={options}
            placeholder="Invite team members…"
          />
          <textarea
            className={field}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            onClick={submit}
            disabled={create.isPending}
            className="mt-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.tsx`, add inside `<Routes>` (next to the `/notes` routes):
```tsx
          <Route path="/meetings" element={<MeetingsScreen />} />
```
and add the import at the top with the other screen imports:
```tsx
import { MeetingsScreen } from './screens/MeetingsScreen'
```
If `App.tsx` keeps screens in a different folder than `screens/`, place `MeetingsScreen.tsx` in that folder instead and adjust the import path. Add a nav entry to the app's bottom navigation if the project exposes one (mirror how `/notes` or `/projects` is linked); otherwise the route is reachable directly.

- [ ] **Step 4: Build the mobile app**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend
npm run build
```
Expected: build succeeds, emits new hashed assets and regenerates `www/m.html`.

- [ ] **Step 5: Manual verification**

Run `bench --site dev.vernon.id clear-cache`, open `/m`, go to Meetings, pick a project, create a meeting inviting two team members, then Mark done. Confirm the toast says points awarded and the participants' wallet/points reflect the award.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/CreateMeetingSheet.tsx frontend/src/screens/MeetingsScreen.tsx frontend/src/App.tsx www/m.html vernon_project/public 2>/dev/null; git add -A frontend www
git commit -m "feat(m): meetings screen, create sheet, mark-done"
```

---

### Task 9: Desktop UI — Meetings page on /w

**Files:**
- Create: `frontend-web/src/pages/Meetings.tsx`
- Create: `frontend-web/src/components/CreateMeetingDialog.tsx`
- Modify: `frontend-web/src/App.tsx`

**Interfaces:**
- Consumes the SAME Task 7 hooks via the `@/` alias (`@/hooks/useData`, `@/components/MultiSelectSearch`). Desktop wraps the form in the web `Dialog` overlay (`@web/components/overlays/Dialog`) instead of a bottom sheet.

- [ ] **Step 1: Create the desktop create dialog**

`frontend-web/src/components/CreateMeetingDialog.tsx`:
```tsx
import { useState } from 'react'
import { Dialog } from '@web/components/overlays/Dialog'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useCreateMeeting, useMeetingInvitableUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function CreateMeetingDialog({ open, onClose, project }: Props) {
  const toast = useToast()
  const create = useCreateMeeting()
  const invitable = useMeetingInvitableUsers(project)

  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [participants, setParticipants] = useState<string[]>([])

  const close = () => {
    setTitle('')
    setScheduledAt('')
    setEstimated('')
    setNotes('')
    setParticipants([])
    onClose()
  }

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    const fields: Record<string, unknown> = {
      project,
      title: title.trim(),
      participants: JSON.stringify(participants),
    }
    if (scheduledAt) fields.scheduled_at = scheduledAt
    if (estimated) fields.estimated = Number(estimated)
    if (notes) fields.notes = notes
    create.mutate(fields, {
      onSuccess: () => {
        toast('success', 'Meeting created')
        close()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null
  const field =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100'
  const options = (invitable.data?.users ?? []).map((u) => ({
    value: u.user,
    label: u.full_name || u.user,
  }))

  return (
    <Dialog open={open} onClose={close} title="New meeting">
      <div className="flex flex-col gap-3">
        <input className={field} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={field} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <input className={field} type="number" placeholder="Estimated minutes" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        <MultiSelectSearch value={participants} onChange={setParticipants} options={options} placeholder="Invite team members…" />
        <textarea className={field} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button onClick={submit} disabled={create.isPending} className="rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Create
        </button>
      </div>
    </Dialog>
  )
}
```
Note: confirm the actual prop signature of `@web/components/overlays/Dialog` (open/onClose/title/children). If it differs, adapt the wrapper props to match — the inner form is unchanged.

- [ ] **Step 2: Create the desktop Meetings page**

`frontend-web/src/pages/Meetings.tsx`:
```tsx
import { useState } from 'react'
import { useProjects, useMeetings, useMarkMeetingDone, useReopenMeeting } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { CreateMeetingDialog } from '../components/CreateMeetingDialog'

export function Meetings() {
  const toast = useToast()
  const projects = useProjects()
  const [project, setProject] = useState('')
  const [dialog, setDialog] = useState(false)
  const meetings = useMeetings(project || undefined)
  const markDone = useMarkMeetingDone()
  const reopen = useReopenMeeting()

  const projectOptions = (projects.data ?? []).map((p: { name: string; project_name?: string }) => ({
    value: p.name,
    label: p.project_name ?? p.name,
  }))

  const onDone = (name: string) =>
    markDone.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })
  const onReopen = (name: string) =>
    reopen.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Meetings</h1>
        <button
          disabled={!project}
          onClick={() => setDialog(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          New meeting
        </button>
      </div>

      <div className="mb-6 max-w-sm">
        <SearchableSelect value={project} onChange={setProject} options={projectOptions} placeholder="Pick a project…" />
      </div>

      <div className="flex flex-col gap-3">
        {(meetings.data?.meetings ?? []).map((m) => (
          <div key={m.name} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-50">{m.title}</div>
              <div className="text-xs text-slate-500">
                {m.participants.length} invited · {Math.round(m.point)} pts each · {m.status}
              </div>
            </div>
            {m.can_mark_done &&
              (m.status === '✅ Done' ? (
                <button onClick={() => onReopen(m.name)} className="text-sm font-semibold text-slate-500">
                  Reopen
                </button>
              ) : (
                <button onClick={() => onDone(m.name)} className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  Mark done & award
                </button>
              ))}
          </div>
        ))}
      </div>

      {project && <CreateMeetingDialog open={dialog} onClose={() => setDialog(false)} project={project} />}
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

In `frontend-web/src/App.tsx`, add the import and route mirroring the existing pages:
```tsx
import { Meetings } from './pages/Meetings'
```
```tsx
          <Route path="/meetings" element={<Meetings />} />
```
Add a left-nav entry in `AppShell` mirroring an existing page link (e.g. the way `Projects` or `Leaderboard` is listed) so the page is reachable.

- [ ] **Step 4: Build the desktop app**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web
npm run build
```
Expected: build succeeds, regenerates `www/w.html` and hashed assets.

- [ ] **Step 5: Manual verification**

`bench --site dev.vernon.id clear-cache`, open `/w`, Meetings page, create a meeting, Mark done, confirm award and toast.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A frontend-web www
git commit -m "feat(w): meetings page, create dialog, mark-done"
```

---

## Self-Review

**Spec coverage:**
- Meeting + Meeting Participant doctypes → Task 1. ✓
- Points via Group/level → Task 2. ✓
- Invitees restricted to Project Team → Task 3 (controller) + Task 6 (`meeting_invitable_users`). ✓
- Award on Done, idempotent, remove on reopen, notify → Task 4. ✓
- Point Ledger extension (meeting/source/role) → Task 1. ✓
- Permissions mirroring Project Todo → Task 5. ✓
- Mobile API endpoints → Task 6. ✓
- Surfaces /m and /w → Tasks 7–9 (shared layer once, per-app UI). ✓
- YAGNI cuts (no approval chain/recurrence/per-participant/calendar/timing) → honored; status has only two states, flat award. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full content. Two explicit "confirm the real signature" notes (Projects item shape; web `Dialog` props) are verification instructions, not placeholders — the surrounding code is complete and adaptation is mechanical.

**Type consistency:** Status strings `⚪️ Scheduled` / `✅ Done` identical across JSON, controller (`MEETING_SCHEDULED`/`MEETING_DONE`, `DONE`), API, and UI comparisons. Ledger fields (`meeting`, `role="Participant"`, `source="Meeting"`, `points_earned`) consistent between Task 4 and Task 1's schema. API method names match between `lib/api.ts` (Task 7) and endpoints (Task 6): `create_meeting`, `update_meeting`, `list_meetings`, `set_meeting_participants`, `mark_meeting_done`, `reopen_meeting`, `meeting_invitable_users`. Hook names consistent between Task 7 and Tasks 8–9.
