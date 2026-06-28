# QR Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees scan a rotating per-station QR with the mobile app; scans are matched to shift-based schedules to compute late / early-leave / absence with point penalties, accounting for per-brand holidays, WFH, and approved leave. Schedules are effective-dated and retroactive edits recalculate affected days. Admins manage schedules and view the attendance report on web `/w`.

**Architecture:** Raw immutable `Attendance Scan` events are the source of truth. A pure core `evaluate_day()` computes a day's status+penalty from plain inputs; `recompute_daily()` gathers those inputs from the DB, writes a derived `Daily Attendance` row, and upserts a negative `Point Ledger` penalty row. Recompute fires on scan, on schedule/holiday/exception change, and nightly. The dynamic QR is stateless HMAC-TOTP (stdlib `hmac`).

**Tech Stack:** Frappe v15 (Python ≥3.10), React 18 + React Router 6 + TanStack Query (two Vite frontends), Tailwind. New npm dep: `html5-qrcode` (mobile only). No new Python deps.

## Global Constraints

- Python files use **TAB indentation** (`pyproject.toml` `[tool.ruff.format] indent-style = "tab"`). Every Python snippet below is tab-indented.
- New doctypes: `"module": "Vernon Project"`; folder `vernon_project/vernon_project/doctype/<snake>/` holds exactly `__init__.py` (empty), `<snake>.json`, `<snake>.py` (`class CamelName(Document)`).
- Dotted-path conventions: top-level module fns = `vernon_project.<mod>.<fn>`; doctype controller fns = `vernon_project.vernon_project.doctype.<dt>.<dt>.<fn>`. The package root for `vernon_project.X` is `vernon_project/vernon_project/`.
- Settings reads use `frappe.db.get_single_value("Vernon Settings", "<field>")`.
- User balance is `sum(Point Ledger.points_earned)` (`api/mobile.py:_user_balance`) — penalties are **negative `points_earned`**, so balance updates automatically; do NOT touch `_user_balance`.
- All time is server-side: `now_datetime()`, `nowdate()`, `getdate()`, `get_datetime()`. v1 supports **same-day shifts only** (`end_time > start_time`).
- Tests: plain `unittest.TestCase` (NOT FrappeTestCase). Run from `/home/frappe/frappe-bench`: `bench --site project.vernon.id run-tests --module <dotted.module>`.
- Deploy: new/changed doctype JSON → `bench --site project.vernon.id migrate`; Python → `bench restart`; frontend → `npm run build` in the relevant `frontend*/` dir.
- Frontend import aliases: mobile `@` = `frontend/src`; web `@web` = `frontend-web/src`, and web `@` = `frontend/src` (shared lib/hooks). Web reuses the mobile `api`/`mobileApi`/`resource`/hooks — no separate web client.
- Admin web pages gate with `{canManageAttendance(b) && <Route/>}`; employee scan/report screens are open to any logged-in user (backend checks enrollment).

---

## Phase A — Backend data model

New doctypes + extensions + settings. Verification per task = `bench migrate` succeeds and the doctype/field exists; no pytest here (logic tests are Phase B).

### Task A1: Attendance Station doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_station/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/attendance_station/attendance_station.json`
- Create: `vernon_project/vernon_project/doctype/attendance_station/attendance_station.py`

**Interfaces:**
- Produces: doctype `Attendance Station` with fields `station_name` (Data, unique, the docname), `location`, `secret_key` (server-only HMAC key), `display_key` (kiosk auth key), `active`. `secret_key`/`display_key` auto-generated on insert.

- [ ] **Step 1: Write `__init__.py`** — create the empty file.

- [ ] **Step 2: Write the JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:station_name",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["station_name", "location", "active", "secret_key", "display_key"],
 "fields": [
  {"fieldname": "station_name", "fieldtype": "Data", "label": "Station Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "location", "fieldtype": "Small Text", "label": "Location"},
  {"fieldname": "active", "fieldtype": "Check", "label": "Active", "default": "1", "in_list_view": 1},
  {"fieldname": "secret_key", "fieldtype": "Data", "label": "Secret Key", "read_only": 1, "no_copy": 1, "hidden": 1},
  {"fieldname": "display_key", "fieldtype": "Data", "label": "Display Key", "read_only": 1, "no_copy": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Station",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "show_title_field_in_link": 1,
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "title_field": "station_name",
 "track_changes": 1
}
```

- [ ] **Step 3: Write the controller** (generates keys on insert)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AttendanceStation(Document):
	def before_insert(self):
		if not self.secret_key:
			self.secret_key = frappe.generate_hash(length=40)
		if not self.display_key:
			self.display_key = frappe.generate_hash(length=24)
```

- [ ] **Step 4: Migrate + verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id console` →
```python
import frappe
s = frappe.get_doc({"doctype": "Attendance Station", "station_name": "Front Desk", "location": "HQ"}).insert(ignore_permissions=True)
print(bool(s.secret_key), bool(s.display_key))  # expect: True True
frappe.db.rollback()
```
Expected: `True True`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_station/
git commit -m "feat(attendance): Attendance Station doctype with rotating-QR keys"
```

### Task A2: Shift Template doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/shift_template/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/shift_template/shift_template.json`
- Create: `vernon_project/vernon_project/doctype/shift_template/shift_template.py`

**Interfaces:**
- Produces: doctype `Shift Template` with `shift_name` (Data, unique, docname), `start_time` (Time), `end_time` (Time). Validates `end_time > start_time` (same-day only, v1).

- [ ] **Step 1: Write `__init__.py`** — empty file.

- [ ] **Step 2: Write the JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:shift_name",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["shift_name", "start_time", "end_time"],
 "fields": [
  {"fieldname": "shift_name", "fieldtype": "Data", "label": "Shift Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "start_time", "fieldtype": "Time", "label": "Start Time", "reqd": 1, "in_list_view": 1},
  {"fieldname": "end_time", "fieldtype": "Time", "label": "End Time", "reqd": 1, "in_list_view": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Shift Template",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "show_title_field_in_link": 1,
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "title_field": "shift_name",
 "track_changes": 1
}
```

- [ ] **Step 3: Write the controller**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_time


class ShiftTemplate(Document):
	def validate(self):
		if get_time(self.end_time) <= get_time(self.start_time):
			frappe.throw(_("End Time must be after Start Time. Overnight shifts are not supported."))
```

- [ ] **Step 4: Migrate + verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then console:
```python
import frappe
frappe.get_doc({"doctype": "Shift Template", "shift_name": "Morning", "start_time": "09:00:00", "end_time": "17:00:00"}).insert(ignore_permissions=True)
print(frappe.db.exists("Shift Template", "Morning"))  # expect: Morning
frappe.db.rollback()
```
Expected: prints `Morning`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/shift_template/
git commit -m "feat(attendance): Shift Template doctype (same-day window)"
```

### Task A3: Attendance Profile doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_profile/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/attendance_profile/attendance_profile.json`
- Create: `vernon_project/vernon_project/doctype/attendance_profile/attendance_profile.py` (`class AttendanceProfile(Document): pass`)

**Interfaces:**
- Produces: doctype `Attendance Profile`, one per User (docname = user). Fields `user` (Link User, unique), `brand` (Link Brand), `enrolled_from` (Date), `active` (Check). This is the employee→brand anchor used to resolve holidays.

- [ ] **Step 1: Write `__init__.py`** — empty file.

- [ ] **Step 2: Write the JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:user",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user", "brand", "enrolled_from", "active"],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "unique": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "brand", "fieldtype": "Link", "label": "Brand", "options": "Brand", "reqd": 1, "in_list_view": 1},
  {"fieldname": "enrolled_from", "fieldtype": "Date", "label": "Enrolled From", "reqd": 1, "in_list_view": 1},
  {"fieldname": "active", "fieldtype": "Check", "label": "Active", "default": "1", "in_list_view": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Profile",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 1
}
```

- [ ] **Step 3: Write the controller**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceProfile(Document):
	pass
```

- [ ] **Step 4: Migrate + verify** — `bench --site project.vernon.id migrate`; console: `frappe.db.exists("DocType", "Attendance Profile")` → truthy.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_profile/
git commit -m "feat(attendance): Attendance Profile doctype (employee->brand anchor)"
```

### Task A4: Shift Assignment doctype (schema only; recompute trigger wired in Phase C)

**Files:**
- Create: `vernon_project/vernon_project/doctype/shift_assignment/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/shift_assignment/shift_assignment.json`
- Create: `vernon_project/vernon_project/doctype/shift_assignment/shift_assignment.py` (`pass` for now)

**Interfaces:**
- Produces: doctype `Shift Assignment` — effective-dated weekly schedule. Fields `employee` (Link User), `shift_template` (Link Shift Template), weekday checks `monday`…`sunday`, `effective_from` (Date), `effective_to` (Date, optional). One assignment may cover several weekdays. Resolution: most recent `effective_from ≤ D ≤ (effective_to or ∞)` whose weekday(D) check is set.

- [ ] **Step 1: Write `__init__.py`** — empty file.

- [ ] **Step 2: Write the JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["employee", "shift_template", "effective_from", "effective_to", "days_section", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
 "fields": [
  {"fieldname": "employee", "fieldtype": "Link", "label": "Employee", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "shift_template", "fieldtype": "Link", "label": "Shift Template", "options": "Shift Template", "reqd": 1, "in_list_view": 1},
  {"fieldname": "effective_from", "fieldtype": "Date", "label": "Effective From", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "effective_to", "fieldtype": "Date", "label": "Effective To (optional)"},
  {"fieldname": "days_section", "fieldtype": "Section Break", "label": "Working Days"},
  {"fieldname": "monday", "fieldtype": "Check", "label": "Monday"},
  {"fieldname": "tuesday", "fieldtype": "Check", "label": "Tuesday"},
  {"fieldname": "wednesday", "fieldtype": "Check", "label": "Wednesday"},
  {"fieldname": "thursday", "fieldtype": "Check", "label": "Thursday"},
  {"fieldname": "friday", "fieldtype": "Check", "label": "Friday"},
  {"fieldname": "saturday", "fieldtype": "Check", "label": "Saturday"},
  {"fieldname": "sunday", "fieldtype": "Check", "label": "Sunday"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Shift Assignment",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 1
}
```

- [ ] **Step 3: Write the controller** (`pass` — trigger added in Task C4)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class ShiftAssignment(Document):
	pass
```

- [ ] **Step 4: Migrate + verify** — `bench --site project.vernon.id migrate`; console: `frappe.db.exists("DocType", "Shift Assignment")` → truthy.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/shift_assignment/
git commit -m "feat(attendance): Shift Assignment doctype (effective-dated weekdays)"
```

### Task A5: Holiday List + Holiday child doctypes

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_holiday/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/attendance_holiday/attendance_holiday.json` (child, istable)
- Create: `vernon_project/vernon_project/doctype/attendance_holiday/attendance_holiday.py` (`pass`)
- Create: `vernon_project/vernon_project/doctype/attendance_holiday_list/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/attendance_holiday_list/attendance_holiday_list.json`
- Create: `vernon_project/vernon_project/doctype/attendance_holiday_list/attendance_holiday_list.py` (`pass`; recompute trigger added Task C4)

> Names are prefixed `Attendance Holiday`/`Attendance Holiday List` to avoid colliding with ERPNext's core `Holiday`/`Holiday List` doctypes (ERPNext is installed on this bench).

**Interfaces:**
- Produces: child `Attendance Holiday` (`holiday_date` Date, `description` Data); parent `Attendance Holiday List` (`list_name` Data unique docname, `holidays` Table → Attendance Holiday). Referenced by `Brand.holiday_list` (Task A8).

- [ ] **Step 1: Write both `__init__.py`** — empty files.

- [ ] **Step 2: Write child `attendance_holiday.json`**

```json
{
 "actions": [],
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["holiday_date", "description"],
 "fields": [
  {"fieldname": "holiday_date", "fieldtype": "Date", "label": "Date", "reqd": 1, "in_list_view": 1},
  {"fieldname": "description", "fieldtype": "Data", "label": "Description", "in_list_view": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Holiday",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Write parent `attendance_holiday_list.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:list_name",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["list_name", "holidays"],
 "fields": [
  {"fieldname": "list_name", "fieldtype": "Data", "label": "List Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "holidays", "fieldtype": "Table", "label": "Holidays", "options": "Attendance Holiday"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Holiday List",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "show_title_field_in_link": 1,
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "title_field": "list_name",
 "track_changes": 1
}
```

- [ ] **Step 4: Write both controllers** (`pass`)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceHoliday(Document):
	pass
```
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceHolidayList(Document):
	pass
```

- [ ] **Step 5: Migrate + verify** — `bench --site project.vernon.id migrate`; console: create a list with one holiday row, confirm it saves.
```python
import frappe
d = frappe.get_doc({"doctype": "Attendance Holiday List", "list_name": "ID Public 2026", "holidays": [{"holiday_date": "2026-08-17", "description": "Independence Day"}]}).insert(ignore_permissions=True)
print(len(d.holidays))  # expect: 1
frappe.db.rollback()
```

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_holiday/ vernon_project/vernon_project/doctype/attendance_holiday_list/
git commit -m "feat(attendance): Attendance Holiday List + child doctypes"
```

### Task A6: Attendance Exception doctype (schema only; trigger in Phase C)

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_exception/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json`
- Create: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.py` (`pass`)

**Interfaces:**
- Produces: doctype `Attendance Exception` — `employee` (Link User), `from_date`/`to_date` (Date), `exception_type` (Select `WFH`/`Leave`), `reason` (Small Text), `status` (Select `Pending`/`Approved`/`Rejected`, default Pending), `approver` (Link User). Approved rows make covered dates excused.

- [ ] **Step 1: Write `__init__.py`** — empty file.

- [ ] **Step 2: Write the JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["employee", "exception_type", "from_date", "to_date", "status", "approver", "reason"],
 "fields": [
  {"fieldname": "employee", "fieldtype": "Link", "label": "Employee", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "exception_type", "fieldtype": "Select", "label": "Type", "options": "WFH\nLeave", "reqd": 1, "in_list_view": 1},
  {"fieldname": "from_date", "fieldtype": "Date", "label": "From Date", "reqd": 1, "in_list_view": 1},
  {"fieldname": "to_date", "fieldtype": "Date", "label": "To Date", "reqd": 1, "in_list_view": 1},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Pending\nApproved\nRejected", "default": "Pending", "in_list_view": 1},
  {"fieldname": "approver", "fieldtype": "Link", "label": "Approver", "options": "User", "read_only": 1},
  {"fieldname": "reason", "fieldtype": "Small Text", "label": "Reason"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Exception",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 1
}
```

- [ ] **Step 3: Write the controller** (`pass`)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceException(Document):
	pass
```

- [ ] **Step 4: Migrate + verify** — `bench --site project.vernon.id migrate`; console `frappe.db.exists("DocType", "Attendance Exception")` truthy.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_exception/
git commit -m "feat(attendance): Attendance Exception doctype (WFH/Leave)"
```

### Task A7: Attendance Scan + Daily Attendance doctypes

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_scan/{__init__.py,attendance_scan.json,attendance_scan.py}`
- Create: `vernon_project/vernon_project/doctype/daily_attendance/{__init__.py,daily_attendance.json,daily_attendance.py}`

**Interfaces:**
- Produces: `Attendance Scan` (raw event: `employee`, `station`, `scan_time` Datetime, `token_counter` Int). `Daily Attendance` (derived: `employee`, `attendance_date`, `shift_template`, `expected_start`/`expected_end` Datetime, `status` Select [9 values], `first_scan`/`last_scan` Datetime, `station_first`/`station_last` Link, `late_minutes`/`early_minutes` Int, `penalty_points` Float). Both controllers are `pass`; written only via API/engine.
- One-row-per-`(employee, attendance_date)` is enforced by the engine's check-then-upsert in `recompute_daily` (Task B3) — the same idempotency mechanism the existing `Point Ledger` upserts use (this codebase has no composite-unique DB indexes). On a small live site the recompute callers all funnel through that check; the rare concurrent-insert race is acceptable for v1.
- `status` options (exact, order matters for the Select): `OffDay\nHoliday\nExcused-WFH\nExcused-Leave\nPresent\nLate\nEarlyLeave\nLate+EarlyLeave\nAbsent`.

- [ ] **Step 1: Write both `__init__.py`** — empty.

- [ ] **Step 2: Write `attendance_scan.json`**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["employee", "station", "scan_time", "token_counter"],
 "fields": [
  {"fieldname": "employee", "fieldtype": "Link", "label": "Employee", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "station", "fieldtype": "Link", "label": "Station", "options": "Attendance Station", "reqd": 1, "in_list_view": 1},
  {"fieldname": "scan_time", "fieldtype": "Datetime", "label": "Scan Time", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "token_counter", "fieldtype": "Int", "label": "Token Counter", "read_only": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Scan",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```

- [ ] **Step 3: Write `daily_attendance.json`**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["employee", "attendance_date", "status", "shift_template", "expected_start", "expected_end", "first_scan", "last_scan", "station_first", "station_last", "late_minutes", "early_minutes", "penalty_points"],
 "fields": [
  {"fieldname": "employee", "fieldtype": "Link", "label": "Employee", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "attendance_date", "fieldtype": "Date", "label": "Date", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "OffDay\nHoliday\nExcused-WFH\nExcused-Leave\nPresent\nLate\nEarlyLeave\nLate+EarlyLeave\nAbsent", "in_list_view": 1},
  {"fieldname": "shift_template", "fieldtype": "Link", "label": "Shift Template", "options": "Shift Template"},
  {"fieldname": "expected_start", "fieldtype": "Datetime", "label": "Expected Start"},
  {"fieldname": "expected_end", "fieldtype": "Datetime", "label": "Expected End"},
  {"fieldname": "first_scan", "fieldtype": "Datetime", "label": "First Scan"},
  {"fieldname": "last_scan", "fieldtype": "Datetime", "label": "Last Scan"},
  {"fieldname": "station_first", "fieldtype": "Link", "label": "First Station", "options": "Attendance Station"},
  {"fieldname": "station_last", "fieldtype": "Link", "label": "Last Station", "options": "Attendance Station"},
  {"fieldname": "late_minutes", "fieldtype": "Int", "label": "Late Minutes"},
  {"fieldname": "early_minutes", "fieldtype": "Int", "label": "Early-Leave Minutes"},
  {"fieldname": "penalty_points", "fieldtype": "Float", "label": "Penalty Points"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Daily Attendance",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```

- [ ] **Step 4: Write both controllers** (`pass`)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceScan(Document):
	pass
```
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DailyAttendance(Document):
	pass
```

- [ ] **Step 5: Migrate + verify** — `bench --site project.vernon.id migrate`; console both `frappe.db.exists("DocType", ...)` truthy.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_scan/ vernon_project/vernon_project/doctype/daily_attendance/
git commit -m "feat(attendance): Attendance Scan + Daily Attendance doctypes"
```

### Task A8: Extend Brand + Point Ledger

**Files:**
- Modify: `vernon_project/vernon_project/doctype/brand/brand.json` (add `holiday_list` field + field_order entry)
- Modify: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json` (add `attendance` link + extend `source` options + field_order entry)

**Interfaces:**
- Produces: `Brand.holiday_list` (Link Attendance Holiday List) — resolves an employee's holidays. `Point Ledger.attendance` (Link Daily Attendance, search_index) + `source` option `Attendance` — the idempotent key + tag for penalty rows.

- [ ] **Step 1: Add `holiday_list` to Brand**

In `brand.json`, append `"holiday_list"` to the `field_order` array, and add this object to `fields`:
```json
{"fieldname": "holiday_list", "fieldtype": "Link", "label": "Holiday List", "options": "Attendance Holiday List"}
```

- [ ] **Step 2: Extend Point Ledger**

In `point_ledger.json`: (a) change the `source` field's `options` from `"Todo\nGrant\nGift\nMeeting"` to `"Todo\nGrant\nGift\nMeeting\nAttendance"`; (b) append `"attendance"` to `field_order` (after `meeting`); (c) add to `fields`:
```json
{"fieldname": "attendance", "fieldtype": "Link", "label": "Attendance", "options": "Daily Attendance", "search_index": 1}
```

- [ ] **Step 3: Migrate + verify**

Run: `bench --site project.vernon.id migrate`; console:
```python
import frappe
print("holiday_list" in frappe.get_meta("Brand").as_dict()["__field_order"] if False else bool(frappe.get_meta("Brand").get_field("holiday_list")))  # True
print(bool(frappe.get_meta("Point Ledger").get_field("attendance")))  # True
print("Attendance" in frappe.get_meta("Point Ledger").get_field("source").options)  # True
```
Expected: `True` / `True` / `True`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/brand/brand.json vernon_project/vernon_project/doctype/point_ledger/point_ledger.json
git commit -m "feat(attendance): link Brand->Holiday List, add Attendance source to Point Ledger"
```

### Task A9: Vernon Settings fields + seed patch

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` (add 6 fields)
- Create: `vernon_project/patches/v1_0/seed_attendance_settings.py`
- Modify: `vernon_project/patches.txt` (register the patch)

**Interfaces:**
- Produces: Vernon Settings fields `attendance_enabled` (Check), `qr_validity_seconds` (Int, default 30), `attendance_grace_minutes` (Int, default 5), `late_penalty_per_minute` (Float), `early_leave_penalty_per_minute` (Float), `absence_penalty` (Float). Read via `frappe.db.get_single_value`.

- [ ] **Step 1: Add fields to `vernon_settings.json`** — append all six fieldnames to `field_order` and add to `fields`:
```json
{"fieldname": "attendance_section", "fieldtype": "Section Break", "label": "Attendance"},
{"fieldname": "attendance_enabled", "fieldtype": "Check", "label": "Attendance Enabled", "default": "0"},
{"fieldname": "qr_validity_seconds", "fieldtype": "Int", "label": "QR Validity (seconds)", "non_negative": 1, "default": "30", "description": "How long each rotating station QR token stays valid."},
{"fieldname": "attendance_grace_minutes", "fieldtype": "Int", "label": "Grace Minutes", "non_negative": 1, "default": "5", "description": "Minutes of tolerance before late / early-leave is penalised."},
{"fieldname": "late_penalty_per_minute", "fieldtype": "Float", "label": "Late Penalty (points/min)", "non_negative": 1, "default": "0"},
{"fieldname": "early_leave_penalty_per_minute", "fieldtype": "Float", "label": "Early-Leave Penalty (points/min)", "non_negative": 1, "default": "0"},
{"fieldname": "absence_penalty", "fieldtype": "Float", "label": "Absence Penalty (flat points)", "non_negative": 1, "default": "0"}
```
(Add `"attendance_section"` to `field_order` first, then the six fieldnames.)

- [ ] **Step 2: Write the seed patch** `vernon_project/patches/v1_0/seed_attendance_settings.py`

```python
# Copyright (c) 2026, Vernon and contributors

import frappe


def execute():
	defaults = {
		"qr_validity_seconds": 30,
		"attendance_grace_minutes": 5,
		"late_penalty_per_minute": 0,
		"early_leave_penalty_per_minute": 0,
		"absence_penalty": 0,
	}
	for field, value in defaults.items():
		if frappe.db.get_single_value("Vernon Settings", field) is None:
			frappe.db.set_single_value("Vernon Settings", field, value)
```

- [ ] **Step 3: Register in `patches.txt`** — append under the `[post_model_sync]` section (match the existing seed-patch lines):
```
vernon_project.patches.v1_0.seed_attendance_settings
```

- [ ] **Step 4: Migrate + verify**

Run: `bench --site project.vernon.id migrate`; console:
```python
import frappe
print(frappe.db.get_single_value("Vernon Settings", "qr_validity_seconds"))  # expect: 30
print(frappe.db.get_single_value("Vernon Settings", "attendance_grace_minutes"))  # expect: 5
```

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/patches/v1_0/seed_attendance_settings.py vernon_project/patches.txt
git commit -m "feat(attendance): Vernon Settings fields + seed defaults"
```

---

## Phase B — Core logic (QR token + recompute engine)

Module dir: `vernon_project/attendance/` → dotted `vernon_project.attendance.*`. This phase contains the **only** pytest in the plan (the money path), test-first.

### Task B1: QR token module (`qr.py`)

**Files:**
- Create: `vernon_project/attendance/__init__.py` (empty)
- Create: `vernon_project/attendance/qr.py`

**Interfaces:**
- Produces: `current_payload(station_name) -> {"station": str, "counter": int, "token": str}` and `verify(station_name, counter, token) -> bool`. Stateless HMAC-TOTP over the station's `secret_key`; window = `Vernon Settings.qr_validity_seconds`; accepts current counter and the one just before it (clock-skew tolerance).

- [ ] **Step 1: Write `__init__.py`** — empty file.

- [ ] **Step 2: Write `qr.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import hmac
import time

import frappe
from frappe.utils import cint


def _window():
	return cint(frappe.db.get_single_value("Vernon Settings", "qr_validity_seconds")) or 30


def _token(secret, counter):
	return hmac.new(secret.encode(), str(counter).encode(), hashlib.sha256).hexdigest()[:8]


def current_payload(station_name):
	"""Live rotating QR payload for a station's kiosk display."""
	secret = frappe.db.get_value("Attendance Station", station_name, "secret_key")
	counter = int(time.time()) // _window()
	return {"station": station_name, "counter": counter, "token": _token(secret, counter)}


def verify(station_name, counter, token):
	"""True if token matches the current or immediately-previous window."""
	secret = frappe.db.get_value("Attendance Station", station_name, "secret_key")
	if not secret:
		return False
	try:
		counter = int(counter)
	except (TypeError, ValueError):
		return False
	now_counter = int(time.time()) // _window()
	if counter not in (now_counter, now_counter - 1):
		return False
	return hmac.compare_digest(str(token), _token(secret, counter))
```

- [ ] **Step 3: Smoke-check in console**

Run: `bench --site project.vernon.id console`
```python
from vernon_project.attendance import qr
import frappe
s = frappe.get_doc({"doctype": "Attendance Station", "station_name": "QRTest"}).insert(ignore_permissions=True)
p = qr.current_payload("QRTest")
print(qr.verify("QRTest", p["counter"], p["token"]))      # True
print(qr.verify("QRTest", p["counter"], "deadbeef"))       # False
frappe.db.rollback()
```
Expected: `True` then `False`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/attendance/__init__.py vernon_project/attendance/qr.py
git commit -m "feat(attendance): stateless HMAC-TOTP QR token module"
```

### Task B2: Pure penalty core `evaluate_day()` — TEST FIRST

**Files:**
- Create: `vernon_project/attendance/engine.py` (this task adds only `evaluate_day` + helpers)
- Create: `vernon_project/attendance/test_attendance_engine.py`

**Interfaces:**
- Produces: `evaluate_day(*, has_assignment, expected_start, expected_end, exception_type, is_holiday, scans, grace_minutes, late_rate, early_rate, absence_penalty) -> dict`. Pure (stdlib `datetime` only, no `frappe`). Returns keys: `status, late_minutes, early_minutes, penalty_points, first_scan, last_scan`. `scans` is a list of `datetime`. `exception_type` is `"WFH"`, `"Leave"`, or `None`. Decision order: no assignment → `OffDay`; Leave → `Excused-Leave`; WFH → `Excused-WFH`; holiday → `Holiday`; no scans → `Absent`; else compute late/early beyond grace.

- [ ] **Step 1: Write the failing test** `test_attendance_engine.py`

```python
# Copyright (c) 2026, Vernon and contributors

import unittest
from datetime import datetime

from vernon_project.attendance.engine import evaluate_day


def _args(**over):
	base = dict(
		has_assignment=True,
		expected_start=datetime(2026, 6, 1, 9, 0, 0),
		expected_end=datetime(2026, 6, 1, 17, 0, 0),
		exception_type=None,
		is_holiday=False,
		scans=[],
		grace_minutes=5,
		late_rate=2.0,
		early_rate=3.0,
		absence_penalty=50.0,
	)
	base.update(over)
	return base


class TestEvaluateDay(unittest.TestCase):
	def test_off_day_when_no_assignment(self):
		r = evaluate_day(**_args(has_assignment=False))
		self.assertEqual(r["status"], "OffDay")
		self.assertEqual(r["penalty_points"], 0)

	def test_leave_excused(self):
		r = evaluate_day(**_args(exception_type="Leave", scans=[]))
		self.assertEqual(r["status"], "Excused-Leave")
		self.assertEqual(r["penalty_points"], 0)

	def test_wfh_excused_without_scan(self):
		r = evaluate_day(**_args(exception_type="WFH", scans=[]))
		self.assertEqual(r["status"], "Excused-WFH")
		self.assertEqual(r["penalty_points"], 0)

	def test_holiday_excused(self):
		r = evaluate_day(**_args(is_holiday=True, scans=[]))
		self.assertEqual(r["status"], "Holiday")
		self.assertEqual(r["penalty_points"], 0)

	def test_absent_when_working_day_no_scans(self):
		r = evaluate_day(**_args(scans=[]))
		self.assertEqual(r["status"], "Absent")
		self.assertEqual(r["penalty_points"], 50.0)

	def test_present_within_grace(self):
		# in at 09:04 (within 5 min grace), out at 17:00 exactly
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 4), datetime(2026, 6, 1, 17, 0)]))
		self.assertEqual(r["status"], "Present")
		self.assertEqual(r["late_minutes"], 0)
		self.assertEqual(r["early_minutes"], 0)
		self.assertEqual(r["penalty_points"], 0)

	def test_late_beyond_grace(self):
		# in at 09:20 -> 20 raw - 5 grace = 15 late min * 2.0 = 30
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 20), datetime(2026, 6, 1, 17, 0)]))
		self.assertEqual(r["status"], "Late")
		self.assertEqual(r["late_minutes"], 15)
		self.assertEqual(r["penalty_points"], 30.0)

	def test_early_leave_beyond_grace(self):
		# out at 16:40 -> 20 raw - 5 = 15 early min * 3.0 = 45
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 0), datetime(2026, 6, 1, 16, 40)]))
		self.assertEqual(r["status"], "EarlyLeave")
		self.assertEqual(r["early_minutes"], 15)
		self.assertEqual(r["penalty_points"], 45.0)

	def test_late_and_early(self):
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 20), datetime(2026, 6, 1, 16, 40)]))
		self.assertEqual(r["status"], "Late+EarlyLeave")
		self.assertEqual(r["penalty_points"], 30.0 + 45.0)

	def test_first_and_last_scan_used(self):
		# many scans: earliest = check-in, latest = check-out
		scans = [
			datetime(2026, 6, 1, 12, 0),
			datetime(2026, 6, 1, 9, 2),
			datetime(2026, 6, 1, 17, 1),
			datetime(2026, 6, 1, 13, 0),
		]
		r = evaluate_day(**_args(scans=scans))
		self.assertEqual(r["first_scan"], datetime(2026, 6, 1, 9, 2))
		self.assertEqual(r["last_scan"], datetime(2026, 6, 1, 17, 1))
		self.assertEqual(r["status"], "Present")


if __name__ == "__main__":
	unittest.main()
```

- [ ] **Step 2: Run the test — verify it FAILS**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.attendance.test_attendance_engine`
Expected: FAIL / ImportError — `evaluate_day` doesn't exist yet.

- [ ] **Step 3: Write `evaluate_day` in `engine.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# evaluate_day is pure (stdlib only) so it imports nothing here; the DB-bound
# shell in Task B3 adds the frappe imports.

WEEKDAY_FIELDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _result(status, late_minutes=0, early_minutes=0, penalty_points=0, first_scan=None, last_scan=None):
	return {
		"status": status,
		"late_minutes": late_minutes,
		"early_minutes": early_minutes,
		"penalty_points": penalty_points,
		"first_scan": first_scan,
		"last_scan": last_scan,
	}


def evaluate_day(*, has_assignment, expected_start, expected_end, exception_type,
				 is_holiday, scans, grace_minutes, late_rate, early_rate, absence_penalty):
	"""Pure: compute a day's attendance status + penalty from plain inputs."""
	if not has_assignment:
		return _result("OffDay")
	if exception_type == "Leave":
		return _result("Excused-Leave")
	if exception_type == "WFH":
		return _result("Excused-WFH")
	if is_holiday:
		return _result("Holiday")
	if not scans:
		return _result("Absent", penalty_points=absence_penalty)

	first = min(scans)
	last = max(scans)
	raw_late = int((first - expected_start).total_seconds() // 60)
	# early-leave only when a DISTINCT checkout exists; a lone scan is a check-in
	raw_early = int((expected_end - last).total_seconds() // 60) if last > first else 0
	late_min = max(0, raw_late - grace_minutes)
	early_min = max(0, raw_early - grace_minutes)
	penalty = late_min * late_rate + early_min * early_rate

	if late_min and early_min:
		status = "Late+EarlyLeave"
	elif late_min:
		status = "Late"
	elif early_min:
		status = "EarlyLeave"
	else:
		status = "Present"
	return _result(status, late_minutes=late_min, early_minutes=early_min,
				   penalty_points=penalty, first_scan=first, last_scan=last)
```

- [ ] **Step 4: Run the test — verify it PASSES**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.attendance.test_attendance_engine`
Expected: PASS (10 tests OK).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/attendance/engine.py vernon_project/attendance/test_attendance_engine.py
git commit -m "feat(attendance): pure evaluate_day penalty core + unit tests"
```

### Task B3: DB-bound `recompute_daily` + range + nightly

**Files:**
- Modify: `vernon_project/attendance/engine.py` (append the IO shell below `evaluate_day`)

**Interfaces:**
- Consumes: `evaluate_day` (B2), `Vernon Settings` fields (A9), doctypes from Phase A.
- Produces:
  - `recompute_daily(employee, date) -> dict | None` — gathers inputs, upserts `Daily Attendance` (keyed `(employee, attendance_date)`) + `Point Ledger` penalty (keyed `attendance`), returns the result dict (or `None` if employee not enrolled / date before enrolment).
  - `recompute_range(employee, from_date, to_date)` — iterate days, clamped so nothing past today is computed.
  - `nightly_finalize()` — recompute *yesterday* for every active profile (scheduler entry).
- These are called by API (Phase C scan) and hooks/scheduler (Phase C wiring).

- [ ] **Step 1: Append the IO shell to `engine.py`**

```python
def _active_profile(employee):
	row = frappe.db.get_value(
		"Attendance Profile", {"user": employee, "active": 1},
		["name", "brand", "enrolled_from"], as_dict=True,
	)
	return row


def _assignment_for(employee, date):
	"""Most recent effective Shift Assignment covering `date` whose weekday is set."""
	weekday_field = WEEKDAY_FIELDS[getdate(date).weekday()]
	rows = frappe.get_all(
		"Shift Assignment",
		filters={
			"employee": employee,
			"effective_from": ["<=", date],
			weekday_field: 1,
		},
		or_filters=[["effective_to", ">=", date], ["effective_to", "is", "not set"]],
		fields=["shift_template", "effective_from"],
		order_by="effective_from desc",
		limit=1,
	)
	return rows[0] if rows else None


def _approved_exception(employee, date):
	rows = frappe.get_all(
		"Attendance Exception",
		filters={
			"employee": employee,
			"status": "Approved",
			"from_date": ["<=", date],
			"to_date": [">=", date],
		},
		fields=["exception_type"],
		order_by="exception_type asc",  # 'Leave' < 'WFH' -> Leave wins ties
		limit=1,
	)
	return rows[0].exception_type if rows else None


def _is_holiday(brand, date):
	holiday_list = frappe.db.get_value("Brand", brand, "holiday_list")
	if not holiday_list:
		return False
	return bool(frappe.db.exists(
		"Attendance Holiday",
		{"parent": holiday_list, "parenttype": "Attendance Holiday List", "holiday_date": date},
	))


def _scans_on(employee, date):
	rows = frappe.get_all(
		"Attendance Scan",
		filters={"employee": employee, "scan_time": ["between", [f"{date} 00:00:00", f"{date} 23:59:59"]]},
		fields=["scan_time", "station"],
		order_by="scan_time asc",
	)
	return rows


def recompute_daily(employee, date):
	"""Rebuild Daily Attendance for (employee, date) from current sources. Idempotent."""
	date = getdate(date)
	if date > getdate(nowdate()):
		return None  # never compute the future; direct callers rely on this guard
	profile = _active_profile(employee)
	if not profile or getdate(profile.enrolled_from) > date:
		return None

	assignment = _assignment_for(employee, date)
	expected_start = expected_end = None
	shift_template = None
	if assignment:
		shift_template = assignment.shift_template
		start_t, end_t = frappe.db.get_value("Shift Template", shift_template, ["start_time", "end_time"])
		expected_start = get_datetime(f"{date} {start_t}")
		expected_end = get_datetime(f"{date} {end_t}")

	scan_rows = _scans_on(employee, date)
	result = evaluate_day(
		has_assignment=bool(assignment),
		expected_start=expected_start,
		expected_end=expected_end,
		exception_type=_approved_exception(employee, date),
		is_holiday=_is_holiday(profile.brand, date),
		scans=[get_datetime(r.scan_time) for r in scan_rows],
		grace_minutes=cint(frappe.db.get_single_value("Vernon Settings", "attendance_grace_minutes")),
		late_rate=flt(frappe.db.get_single_value("Vernon Settings", "late_penalty_per_minute")),
		early_rate=flt(frappe.db.get_single_value("Vernon Settings", "early_leave_penalty_per_minute")),
		absence_penalty=flt(frappe.db.get_single_value("Vernon Settings", "absence_penalty")),
	)

	values = {
		"employee": employee,
		"attendance_date": date,
		"status": result["status"],
		"shift_template": shift_template,
		"expected_start": expected_start,
		"expected_end": expected_end,
		"first_scan": result["first_scan"],
		"last_scan": result["last_scan"],
		"station_first": scan_rows[0].station if scan_rows else None,
		"station_last": scan_rows[-1].station if scan_rows else None,
		"late_minutes": result["late_minutes"],
		"early_minutes": result["early_minutes"],
		"penalty_points": result["penalty_points"],
	}
	existing = frappe.db.exists("Daily Attendance", {"employee": employee, "attendance_date": date})
	if existing:
		doc = frappe.get_doc("Daily Attendance", existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Daily Attendance", **values})
		doc.insert(ignore_permissions=True)

	_upsert_penalty_ledger(doc.name, employee, result["penalty_points"])
	return result


def _upsert_penalty_ledger(daily_name, employee, penalty_points):
	"""Idempotent negative Point Ledger row keyed on the Daily Attendance docname."""
	values = {
		"user": employee,
		"source": "Attendance",
		"attendance": daily_name,
		"points_earned": -flt(penalty_points),
		"credited_on": now_datetime(),
	}
	existing = frappe.db.exists("Point Ledger", {"attendance": daily_name})
	if existing:
		doc = frappe.get_doc("Point Ledger", existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": "Point Ledger", **values}).insert(ignore_permissions=True)


def recompute_range(employee, from_date, to_date):
	"""Recompute each day in [from_date, min(to_date, today)]. Never computes the future."""
	today = getdate(nowdate())
	start = getdate(from_date)
	end = min(getdate(to_date), today) if to_date else today
	d = start
	while d <= end:
		recompute_daily(employee, d)
		d = add_days(d, 1)


def nightly_finalize():
	"""Scheduled daily: finalise yesterday for every active employee."""
	yesterday = add_days(nowdate(), -1)
	for emp in frappe.get_all("Attendance Profile", filters={"active": 1}, pluck="user"):
		try:
			recompute_daily(emp, yesterday)
		except Exception:
			frappe.log_error(title="attendance nightly_finalize failed")
```

- [ ] **Step 2: Add the import block** at the top of `engine.py` (below the license header, above `WEEKDAY_FIELDS`):
```python
import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowdate
```

- [ ] **Step 3: Verify the pure test still passes** (no regression)

Run: `bench --site project.vernon.id run-tests --module vernon_project.attendance.test_attendance_engine`
Expected: PASS (10 OK).

- [ ] **Step 4: End-to-end console smoke** (real DB)

Run: `bench --site project.vernon.id console`
```python
import frappe
from frappe.utils import nowdate
from vernon_project.attendance.engine import recompute_daily
# Pick any existing user with a Brand-less profile for a quick OffDay check:
u = frappe.db.get_value("User", {"enabled": 1, "name": ["!=", "Administrator"]}, "name")
frappe.get_doc({"doctype": "Attendance Profile", "user": u, "brand": frappe.db.get_value("Brand", {}, "name"), "enrolled_from": "2026-01-01"}).insert(ignore_permissions=True)
print(recompute_daily(u, nowdate()))  # no assignment -> {'status': 'OffDay', ...}
frappe.db.rollback()
```
Expected: dict with `'status': 'OffDay'`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/attendance/engine.py
git commit -m "feat(attendance): recompute_daily/range + nightly finalize + penalty ledger upsert"
```

---

## Phase C — API endpoints + hooks wiring

### Task C1: Whitelisted API (`api/attendance.py`)

**Files:**
- Create: `vernon_project/api/attendance.py`

**Interfaces:**
- Consumes: `qr` (B1), `recompute_daily` (B3).
- Produces (whitelisted dotted base `vernon_project.api.attendance.`):
  - `station_token(station, key)` — kiosk poll; `allow_guest=True`, gated by `display_key`; returns `current_payload`.
  - `attendance_scan(station, counter, token)` — logged-in; enrollment-checked; verifies token, inserts `Attendance Scan`, recomputes today; returns `{status, message?, daily?}`.
  - `my_attendance(limit=30)` — logged-in; returns recent `Daily Attendance` rows for the session user.
  - `request_exception(from_date, to_date, exception_type, reason=None)` — logged-in; creates a Pending `Attendance Exception`.

- [ ] **Step 1: Write `api/attendance.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hmac

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from vernon_project.attendance import qr
from vernon_project.attendance.engine import recompute_daily


@frappe.whitelist(allow_guest=True)
def station_token(station, key):
	"""Kiosk display polls this for the live rotating QR payload. Gated by display_key."""
	if not frappe.db.get_single_value("Vernon Settings", "attendance_enabled"):
		frappe.throw(_("Attendance is disabled"), frappe.PermissionError)
	display_key = frappe.db.get_value("Attendance Station", station, "display_key")
	if not display_key or not hmac.compare_digest(str(key), str(display_key)):
		frappe.throw(_("Invalid station key"), frappe.PermissionError)
	return qr.current_payload(station)


@frappe.whitelist()
def attendance_scan(station, counter, token):
	"""Employee scans a station QR. Returns recomputed status for today."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if not frappe.db.get_single_value("Vernon Settings", "attendance_enabled"):
		return {"status": "error", "message": _("Attendance is currently disabled.")}
	if not frappe.db.exists("Attendance Profile", {"user": user, "active": 1}):
		return {"status": "error", "message": _("You are not enrolled in attendance.")}
	if not frappe.db.get_value("Attendance Station", station, "active"):
		return {"status": "error", "message": _("Unknown or inactive station.")}
	if not qr.verify(station, counter, token):
		return {"status": "error", "message": _("QR expired — scan the live code again.")}

	frappe.get_doc({
		"doctype": "Attendance Scan",
		"employee": user,
		"station": station,
		"scan_time": now_datetime(),
		"token_counter": cint(counter),
	}).insert(ignore_permissions=True)

	daily = recompute_daily(user, nowdate())
	return {"status": "ok", "daily": _serialize(daily)}


def _serialize(daily):
	if not daily:
		return None
	return {
		"status": daily["status"],
		"late_minutes": daily["late_minutes"],
		"early_minutes": daily["early_minutes"],
		"penalty_points": daily["penalty_points"],
		"first_scan": str(daily["first_scan"]) if daily["first_scan"] else None,
		"last_scan": str(daily["last_scan"]) if daily["last_scan"] else None,
	}


@frappe.whitelist()
def my_attendance(limit=30):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	rows = frappe.get_all(
		"Daily Attendance",
		filters={"employee": user},
		fields=["attendance_date", "status", "first_scan", "last_scan",
				"late_minutes", "early_minutes", "penalty_points"],
		order_by="attendance_date desc",
		limit=cint(limit),
	)
	return {"status": "ok", "rows": rows}


@frappe.whitelist()
def request_exception(from_date, to_date, exception_type, reason=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if exception_type not in ("WFH", "Leave"):
		return {"status": "error", "message": _("Invalid type.")}
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"reason": reason,
		"status": "Pending",
	}).insert(ignore_permissions=True)
	return {"status": "ok", "name": doc.name}
```

- [ ] **Step 2: Verify it imports** — `bench --site project.vernon.id console` → `import vernon_project.api.attendance` (no error).

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/attendance.py
git commit -m "feat(attendance): scan / my_attendance / request_exception / station_token API"
```

### Task C2: Admin report endpoint

**Files:**
- Modify: `vernon_project/api/attendance.py` (append)

**Interfaces:**
- Produces: `attendance_report(from_date, to_date, employee=None, brand=None, status=None)` — System-Manager-only; returns `{columns, rows, stats}` where rows are `Daily Attendance` joined to the employee's brand (via Attendance Profile), filtered, plus summary counts. Consumed by the web report page (Task E1).

- [ ] **Step 1: Append to `api/attendance.py`**

```python
def _require_attendance_admin():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist()
def attendance_report(from_date, to_date, employee=None, brand=None, status=None):
	"""Daily Attendance rows for the admin report, with summary stats."""
	_require_attendance_admin()
	conditions = ["da.attendance_date BETWEEN %(from_date)s AND %(to_date)s"]
	params = {"from_date": from_date, "to_date": to_date}
	if employee:
		conditions.append("da.employee = %(employee)s")
		params["employee"] = employee
	if status:
		conditions.append("da.status = %(status)s")
		params["status"] = status
	if brand:
		conditions.append("ap.brand = %(brand)s")
		params["brand"] = brand
	where = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT da.employee, ap.brand, da.attendance_date, da.status,
			   da.first_scan, da.last_scan, da.late_minutes, da.early_minutes,
			   da.penalty_points
		FROM `tabDaily Attendance` da
		LEFT JOIN `tabAttendance Profile` ap ON ap.user = da.employee
		WHERE {where}
		ORDER BY da.attendance_date DESC, da.employee ASC
		""",
		params,
		as_dict=True,
	)

	stats = {"present": 0, "late": 0, "absent": 0, "excused": 0, "penalty": 0.0}
	for r in rows:
		stats["penalty"] += float(r.penalty_points or 0)
		if r.status in ("Present",):
			stats["present"] += 1
		elif r.status in ("Late", "EarlyLeave", "Late+EarlyLeave"):
			stats["late"] += 1
		elif r.status == "Absent":
			stats["absent"] += 1
		elif r.status in ("Excused-WFH", "Excused-Leave", "Holiday", "OffDay"):
			stats["excused"] += 1

	columns = [
		{"label": "Employee", "fieldname": "employee", "fieldtype": "Link"},
		{"label": "Brand", "fieldname": "brand", "fieldtype": "Data"},
		{"label": "Date", "fieldname": "attendance_date", "fieldtype": "Date"},
		{"label": "Status", "fieldname": "status", "fieldtype": "Data"},
		{"label": "In", "fieldname": "first_scan", "fieldtype": "Datetime"},
		{"label": "Out", "fieldname": "last_scan", "fieldtype": "Datetime"},
		{"label": "Late (min)", "fieldname": "late_minutes", "fieldtype": "Int"},
		{"label": "Early (min)", "fieldname": "early_minutes", "fieldtype": "Int"},
		{"label": "Penalty", "fieldname": "penalty_points", "fieldtype": "Float"},
	]
	return {"columns": columns, "rows": rows, "stats": stats}
```

- [ ] **Step 2: Console smoke** — `import vernon_project.api.attendance` then call `attendance_report(from_date="2026-06-01", to_date="2026-06-30")` as Administrator returns a dict with `columns`/`rows`/`stats`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/attendance.py
git commit -m "feat(attendance): admin attendance_report endpoint with stats"
```

### Task C3: Recompute trigger functions (`triggers.py`)

**Files:**
- Create: `vernon_project/attendance/triggers.py`

**Interfaces:**
- Consumes: `recompute_range`, `recompute_daily` (B3).
- Produces: `(doc, method=None)` handlers `shift_assignment_changed`, `exception_changed`, `holiday_list_changed`, `brand_changed` — wired via `doc_events` in Task C4. Each recomputes only affected employee/date pairs (recompute_daily/range skip future dates). `holiday_list_changed` and `brand_changed` recompute the **union of old and new** holiday dates so un-marking a holiday or re-pointing a brand flips the affected days back.

- [ ] **Step 1: Write `triggers.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# ponytail: recompute runs synchronously inside the triggering save. Ranges are
# bounded to enrolled past/today dates, so this is fine for normal schedules.
# If an assignment ever spans years, switch these to frappe.enqueue.

import frappe
from frappe.utils import nowdate

from vernon_project.attendance.engine import recompute_daily, recompute_range


def shift_assignment_changed(doc, method=None):
	recompute_range(doc.employee, doc.effective_from, doc.effective_to or nowdate())


def exception_changed(doc, method=None):
	recompute_range(doc.employee, doc.from_date, doc.to_date)


def _employees_for_brand(brand):
	return frappe.get_all("Attendance Profile", filters={"brand": brand, "active": 1}, pluck="user")


def _list_dates(holiday_list):
	if not holiday_list:
		return set()
	return set(frappe.get_all(
		"Attendance Holiday",
		filters={"parent": holiday_list, "parenttype": "Attendance Holiday List"},
		pluck="holiday_date",
	))


def holiday_list_changed(doc, method=None):
	# Recompute dates currently in the list AND any removed in this edit, for
	# every employee whose brand points at this list. recompute_daily skips
	# future dates internally.
	old = doc.get_doc_before_save()
	dates = {h.holiday_date for h in doc.holidays}
	if old:
		dates |= {h.holiday_date for h in old.holidays}
	brands = frappe.get_all("Brand", filters={"holiday_list": doc.name}, pluck="name")
	for brand in brands:
		for emp in _employees_for_brand(brand):
			for d in dates:
				recompute_daily(emp, d)


def brand_changed(doc, method=None):
	# When a Brand's holiday_list is (re)assigned, recompute its employees over
	# the union of the old and new lists' holiday dates.
	old = doc.get_doc_before_save()
	old_list = old.holiday_list if old else None
	if old_list == doc.holiday_list:
		return
	dates = _list_dates(old_list) | _list_dates(doc.holiday_list)
	for emp in _employees_for_brand(doc.name):
		for d in dates:
			recompute_daily(emp, d)
```

- [ ] **Step 2: Commit**

```bash
git add vernon_project/attendance/triggers.py
git commit -m "feat(attendance): recompute trigger handlers for schedule/exception/holiday edits"
```

### Task C4: Wire `hooks.py` (doc_events + scheduler)

**Files:**
- Modify: `vernon_project/vernon_project/hooks.py`

**Interfaces:**
- Consumes: `triggers.py` (C3), `engine.nightly_finalize` (B3).
- Produces: `doc_events` for `Shift Assignment` / `Attendance Exception` / `Attendance Holiday List` / `Brand`; nightly scheduler entry. This is what makes retroactive schedule edits AND brand→holiday-list assignment recalculate, and finalizes absences nightly.

- [ ] **Step 1: Replace the empty `doc_events` placeholder** (hooks.py ~line 173) with:

```python
doc_events = {
	"Shift Assignment": {
		"on_update": "vernon_project.attendance.triggers.shift_assignment_changed",
		"on_trash": "vernon_project.attendance.triggers.shift_assignment_changed",
	},
	"Attendance Exception": {
		"on_update": "vernon_project.attendance.triggers.exception_changed",
	},
	"Attendance Holiday List": {
		"on_update": "vernon_project.attendance.triggers.holiday_list_changed",
	},
	"Brand": {
		"on_update": "vernon_project.attendance.triggers.brand_changed",
	},
}
```
> No `after_insert` for `Shift Assignment`: Frappe fires `on_update` during insert too, so `on_update` alone covers creation (avoids a double recompute).

- [ ] **Step 2: Add the nightly scheduler entry** — change the existing `scheduler_events["daily"]` list (hooks.py ~line 183) to include the new function:

```python
scheduler_events = {
	"daily": [
		"vernon_project.tasks.create_recurring_todos",
		"vernon_project.tasks.notify_due_todos",
		"vernon_project.attendance.engine.nightly_finalize"
	]
}
```

- [ ] **Step 3: Apply + restart + verify wiring**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench restart`
Then console — confirm the hook resolves:
```python
import frappe
print("Shift Assignment" in frappe.get_hooks("doc_events"))  # True
```
Expected: `True`.

- [ ] **Step 4: Full integration smoke** (scan → late → penalty ledger)

Run: `bench --site project.vernon.id console`
```python
import frappe
from frappe.utils import nowdate
from vernon_project.attendance.engine import recompute_daily
from vernon_project.attendance import qr

# fixtures
u = frappe.db.get_value("User", {"enabled": 1, "name": ["!=", "Administrator"]}, "name")
b = frappe.db.get_value("Brand", {}, "name")
frappe.get_doc({"doctype":"Attendance Profile","user":u,"brand":b,"enrolled_from":"2026-01-01"}).insert(ignore_permissions=True)
frappe.get_doc({"doctype":"Shift Template","shift_name":"ZT","start_time":"09:00:00","end_time":"17:00:00"}).insert(ignore_permissions=True)
sa = {"doctype":"Shift Assignment","employee":u,"shift_template":"ZT","effective_from":"2026-01-01"}
for d in ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]: sa[d]=1
frappe.get_doc(sa).insert(ignore_permissions=True)
st = frappe.get_doc({"doctype":"Attendance Station","station_name":"ZS"}).insert(ignore_permissions=True)
# simulate a scan now (will be 'Late' unless before 09:05)
frappe.get_doc({"doctype":"Attendance Scan","employee":u,"station":"ZS","scan_time":frappe.utils.now_datetime()}).insert(ignore_permissions=True)
res = recompute_daily(u, nowdate())
print(res["status"], res["penalty_points"])
print(frappe.db.get_value("Point Ledger", {"attendance": frappe.db.get_value("Daily Attendance", {"employee":u}, "name")}, "points_earned"))
frappe.db.rollback()
```
Expected: a status string + a penalty, and the Point Ledger `points_earned` equals `-penalty`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/hooks.py
git commit -m "feat(attendance): wire doc_events recompute triggers + nightly scheduler"
```

---

## Phase D — Mobile frontend (`frontend/`)

Employee scan + my-attendance + request leave/WFH. Verification per task = `npm run build` typechecks (and manual scan in Phase F). All file paths under `/home/frappe/frappe-bench/apps/vernon_project/frontend/`.

### Task D1: Add the QR-scanner dependency + API methods + hooks

**Files:**
- Modify: `frontend/package.json` (add `html5-qrcode`)
- Modify: `frontend/src/lib/api.ts` (add attendance methods)
- Modify: `frontend/src/hooks/useData.ts` (add keys + hooks)

**Interfaces:**
- Produces: `mobileApi.stationToken/attendanceScan/myAttendance/requestException`; `keys.myAttendance`; `useMyAttendance()` query, `useScanAttendance()` + `useRequestException()` mutations.

- [ ] **Step 1: Add the dependency**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm install html5-qrcode@^2.3.8`
(adds `"html5-qrcode": "^2.3.8"` to `dependencies`.)

- [ ] **Step 2: Add attendance methods to `src/lib/api.ts`**

Find the line `const M = 'vernon_project.api.mobile.'` and add directly after it:
```ts
const A = 'vernon_project.api.attendance.'
```
Then inside the `export const mobileApi = {` object, add these methods (place before the closing `}`):
```ts
  stationToken: (station: string, key: string) =>
    api.get<{ station: string; counter: number; token: string }>(A + 'station_token', { station, key }),
  attendanceScan: (station: string, counter: number, token: string) =>
    api.post<{
      status: string
      message?: string
      daily?: {
        status: string
        late_minutes: number
        early_minutes: number
        penalty_points: number
        first_scan: string | null
        last_scan: string | null
      } | null
    }>(A + 'attendance_scan', { station, counter, token }),
  myAttendance: (limit = 30) =>
    api.get<{
      status: string
      rows: {
        attendance_date: string
        status: string
        first_scan: string | null
        last_scan: string | null
        late_minutes: number
        early_minutes: number
        penalty_points: number
      }[]
    }>(A + 'my_attendance', { limit }),
  requestException: (from_date: string, to_date: string, exception_type: 'WFH' | 'Leave', reason?: string) =>
    api.post<{ status: string; message?: string; name?: string }>(A + 'request_exception', {
      from_date,
      to_date,
      exception_type,
      reason,
    }),
```

- [ ] **Step 3: Add hooks to `src/hooks/useData.ts`**

In the `keys` object add: `myAttendance: ['my-attendance'] as const,`
Then append these hooks at the end of the file:
```ts
export function useMyAttendance() {
  return useQuery({
    queryKey: keys.myAttendance,
    queryFn: () => mobileApi.myAttendance() as Promise<{
      status: string
      rows: {
        attendance_date: string
        status: string
        first_scan: string | null
        last_scan: string | null
        late_minutes: number
        early_minutes: number
        penalty_points: number
      }[]
    }>,
  })
}

export function useScanAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { station: string; counter: number; token: string }) => {
      const res = await mobileApi.attendanceScan(vars.station, vars.counter, vars.token)
      if (res.status !== 'ok') throw new Error(res.message || 'Scan failed')
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.myAttendance }),
  })
}

export function useRequestException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { from_date: string; to_date: string; exception_type: 'WFH' | 'Leave'; reason?: string }) => {
      const res = await mobileApi.requestException(vars.from_date, vars.to_date, vars.exception_type, vars.reason)
      if (res.status !== 'ok') throw new Error(res.message || 'Request failed')
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.myAttendance }),
  })
}
```
(If `useQueryClient`/`useMutation` aren't already imported at the top of `useData.ts`, they are — the file already uses them for existing mutations like `useCreateMeeting`.)

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds (no TS errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(attendance/mobile): html5-qrcode dep + attendance api methods/hooks"
```

### Task D2: Scan screen (`Scan.tsx`)

**Files:**
- Create: `frontend/src/pages/Scan.tsx`

**Interfaces:**
- Consumes: `html5-qrcode`, `useScanAttendance`.
- Produces: `<Scan/>` default export — opens the camera, decodes a station QR (`{station,counter,token}` JSON), calls the scan mutation, shows a Soft-Pop result card with `animate-pop`.

- [ ] **Step 1: Write `src/pages/Scan.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, XCircle, QrCode } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useScanAttendance } from '@/hooks/useData'

type Result = { ok: boolean; title: string; detail: string }

const REGION_ID = 'qr-reader-region'

export default function Scan() {
  const scan = useScanAttendance()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const qrRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const qr = new Html5Qrcode(REGION_ID)
    qrRef.current = qr
    let stopped = false

    const onDecode = async (text: string) => {
      if (busy.current) return
      let payload: { station: string; counter: number; token: string }
      try {
        payload = JSON.parse(text)
      } catch {
        return // not our QR; keep scanning
      }
      if (!payload.station || payload.token == null) return
      busy.current = true
      try {
        const res = await scan.mutateAsync(payload)
        const d = res.daily
        const late = d?.late_minutes ?? 0
        const early = d?.early_minutes ?? 0
        const pen = d?.penalty_points ?? 0
        const bits: string[] = []
        if (late) bits.push(`late ${late} min`)
        if (early) bits.push(`left ${early} min early`)
        if (pen) bits.push(`−${pen} pts`)
        setResult({
          ok: true,
          title: d?.status === 'Present' ? 'Checked in · on time' : `Recorded · ${d?.status ?? ''}`,
          detail: bits.join(' · ') || 'No penalty',
        })
      } catch (e) {
        setResult({ ok: false, title: 'Scan failed', detail: (e as Error).message })
      } finally {
        // allow another scan after a short cooldown
        setTimeout(() => (busy.current = false), 1500)
      }
    }

    qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onDecode, () => {})
      .catch((e) => setError(e?.message || 'Camera unavailable'))

    return () => {
      stopped = true
      qr.stop().then(() => qr.clear()).catch(() => {})
      void stopped
    }
  }, [scan])

  return (
    <DetailScreen title="Scan attendance">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-paper-edge bg-black dark:border-slate-700">
          <div id={REGION_ID} className="aspect-square w-full" />
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            {error}
          </div>
        )}

        {scan.isPending && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner className="h-4 w-4" /> Recording…
          </div>
        )}

        {result && (
          <div
            className={`animate-pop flex items-center gap-3 rounded-2xl border p-4 shadow-card ${
              result.ok
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/15'
                : 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/15'
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-7 w-7 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-stone-800 dark:text-slate-100">{result.title}</p>
              <p className="text-sm text-stone-500 dark:text-slate-400">{result.detail}</p>
            </div>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-stone-400">
          <QrCode className="h-4 w-4" /> Point the camera at the station screen. The code refreshes every few seconds.
        </p>
      </div>
    </DetailScreen>
  )
}
```

> If `DetailScreen` doesn't accept a bare `title` without a `right` slot, confirm its props match the `NoteFormScreen.tsx` usage (it does — `right` is optional). No change needed.

- [ ] **Step 2: Typecheck** — `npm run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Scan.tsx
git commit -m "feat(attendance/mobile): camera QR scan screen"
```

### Task D3: My Attendance + Request Leave screens

**Files:**
- Create: `frontend/src/pages/MyAttendance.tsx`
- Create: `frontend/src/pages/RequestException.tsx`

**Interfaces:**
- Consumes: `useMyAttendance`, `useRequestException`.
- Produces: `<MyAttendance/>` (recent days list + links to Scan and Request) and `<RequestException/>` (WFH/Leave form).

- [ ] **Step 1: Write `src/pages/MyAttendance.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import { QrCode, CalendarPlus, ChevronRight } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { Spinner, EmptyState, Pill } from '@/components/ui'
import { useMyAttendance } from '@/hooks/useData'

const STATUS_TONE: Record<string, string> = {
  Present: 'text-emerald-700 bg-emerald-50',
  Late: 'text-amber-700 bg-amber-50',
  EarlyLeave: 'text-amber-700 bg-amber-50',
  'Late+EarlyLeave': 'text-amber-700 bg-amber-50',
  Absent: 'text-rose-700 bg-rose-50',
  'Excused-WFH': 'text-sky-700 bg-sky-50',
  'Excused-Leave': 'text-sky-700 bg-sky-50',
  Holiday: 'text-violet-700 bg-violet-50',
  OffDay: 'text-stone-500 bg-stone-100',
}

export default function MyAttendance() {
  const navigate = useNavigate()
  const { data, isLoading } = useMyAttendance()
  const rows = data?.rows ?? []

  return (
    <TabScreen title="My attendance" subtitle="Your recent days">
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-card active:scale-[0.99]"
        >
          <QrCode className="h-5 w-5" /> Scan
        </button>
        <button
          onClick={() => navigate('/attendance/request')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-paper-card py-3 font-semibold text-stone-700 shadow-card active:scale-[0.99] dark:bg-slate-800 dark:text-slate-100"
        >
          <CalendarPlus className="h-5 w-5" /> Request leave
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={QrCode} title="No attendance yet" subtitle="Scan a station to check in." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.attendance_date}
              className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{r.attendance_date}</p>
                <p className="truncate text-xs text-stone-400">
                  {r.first_scan ? `In ${r.first_scan.slice(11, 16)}` : '—'}
                  {r.last_scan ? ` · Out ${r.last_scan.slice(11, 16)}` : ''}
                  {r.penalty_points ? ` · −${r.penalty_points} pts` : ''}
                </p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_TONE[r.status] || 'bg-stone-100 text-stone-600'}`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </TabScreen>
  )
}
```
> If `Pill` isn't exported from `@/components/ui`, drop the import — the status chip above uses a plain `<span>`, not `Pill`. (Listed in import only for parity; remove if unused to satisfy lint.)

- [ ] **Step 2: Write `src/pages/RequestException.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

export default function RequestException() {
  const navigate = useNavigate()
  const toast = useToast()
  const req = useRequestException()
  const [type, setType] = useState<'WFH' | 'Leave'>('Leave')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const submit = async () => {
    if (!from || !to) {
      toast('error', 'Pick both dates')
      return
    }
    try {
      await req.mutateAsync({ from_date: from, to_date: to, exception_type: type, reason })
      toast('success', 'Request submitted')
      navigate('/attendance')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Request leave / WFH">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Type</label>
          <div className="flex gap-2">
            {(['Leave', 'WFH'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                  type === t
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">From</label>
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">To</label>
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Reason</label>
          <textarea className={field + ' min-h-[90px] resize-y'} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button
          onClick={submit}
          disabled={req.isPending}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Submit request
        </button>
      </div>
    </DetailScreen>
  )
}
```
> Uses native `<input type="date">` (Global Constraint: native over picker libs). `useToast()` returns a `toast(level, message)` function (`level` = `'error' | 'success' | 'info'`) — confirm the signature in `frontend/src/components/Toast.tsx` and match it; do NOT use `toast.show(...)`.

- [ ] **Step 3: Typecheck** — `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MyAttendance.tsx frontend/src/pages/RequestException.tsx
git commit -m "feat(attendance/mobile): my-attendance list + leave/WFH request"
```

### Task D4: Register routes + launcher

**Files:**
- Modify: `frontend/src/App.tsx` (imports + routes)
- Modify: the mobile profile/menu screen that lists links like `/wallet`, `/leaderboard`, `/notes` (add an "Attendance" entry)

**Interfaces:**
- Produces: routes `/scan`, `/attendance`, `/attendance/request`; one launcher link reachable from the profile menu.

- [ ] **Step 1: Add imports to `src/App.tsx`** (next to the other page imports):
```tsx
import Scan from './pages/Scan'
import MyAttendance from './pages/MyAttendance'
import RequestException from './pages/RequestException'
```

- [ ] **Step 2: Add routes** inside `<Routes>` (place among the non-gated routes, e.g. after `<Route path="/reports" ... />`):
```tsx
        <Route path="/scan" element={<Scan />} />
        <Route path="/attendance" element={<MyAttendance />} />
        <Route path="/attendance/request" element={<RequestException />} />
```

- [ ] **Step 3: Add a launcher link in the profile menu**

Locate the menu list that renders the existing profile links:
Run: `grep -rn "to=\"/wallet\"" frontend/src/pages/`
In that same list/array, add an entry pointing to `/attendance` labelled "Attendance" with a lucide `QrCode` icon, following the exact shape of the neighbouring entries (import `QrCode` from `lucide-react` in that file if not already present). Example entry shape if it's an array of `{ to, label, icon }`:
```tsx
  { to: '/attendance', label: 'Attendance', icon: QrCode },
```
If the links are inline `<NavLink>`/`<button>` elements rather than an array, add one matching element copied from the `/wallet` link, swapping `to`, label, and icon.

- [ ] **Step 4: Typecheck** — `npm run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/
git commit -m "feat(attendance/mobile): routes + profile launcher"
```

---

## Phase E — Web admin frontend (`frontend-web/`)

Admin "separate page": report, schedules, stations + kiosk, exceptions queue, holiday lists. Web reuses the shared mobile `api`/`resource`/hooks (alias `@` = `frontend/src`). Verification = `npm run build` in `frontend-web/` typechecks (+ manual in Phase F).

### Task E1: Web wiring — gate helper, report API/hook, QR-encoder dep

**Files:**
- Modify: `frontend/src/hooks/useData.ts` (add `canManageAttendance` + `useAttendanceReport`)
- Modify: `frontend/src/lib/api.ts` (add `attendanceReport` method)
- Modify: `frontend-web/package.json` (add `qrcode` for the kiosk)

**Interfaces:**
- Produces: `canManageAttendance(boot)` (System Manager), `mobileApi.attendanceReport(...)`, `useAttendanceReport(filters, enabled)`. `qrcode` dep available to the kiosk page.

- [ ] **Step 1: Add the gate helper to `frontend/src/hooks/useData.ts`** (next to the other `canManageX` helpers):
```ts
// ponytail: System Manager only for v1. Add an 'Attendance Manager' role + check here if delegation is needed.
export function canManageAttendance(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}
```

- [ ] **Step 2: Add the report method to `frontend/src/lib/api.ts`** (inside `mobileApi`, near the other attendance methods; `A` is already defined in Task D1):
```ts
  attendanceReport: (filters: {
    from_date: string
    to_date: string
    employee?: string
    brand?: string
    status?: string
  }) =>
    api.get<{
      columns: { label: string; fieldname: string; fieldtype: string }[]
      rows: Record<string, unknown>[]
      stats: { present: number; late: number; absent: number; excused: number; penalty: number }
    }>(A + 'attendance_report', filters),
```

- [ ] **Step 3: Add the report hook to `frontend/src/hooks/useData.ts`**:
```ts
export function useAttendanceReport(
  filters: { from_date: string; to_date: string; employee?: string; brand?: string; status?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['attendance-report', filters],
    queryFn: () => mobileApi.attendanceReport(filters),
    enabled,
    staleTime: 1000 * 30,
  })
}
```

- [ ] **Step 4: Add the QR-encoder dep**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm install qrcode@^1.5.4 && npm install -D @types/qrcode`

- [ ] **Step 5: Typecheck both frontends**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useData.ts frontend/src/lib/api.ts frontend-web/package.json frontend-web/package-lock.json
git commit -m "feat(attendance/web): gate helper, report api/hook, qrcode dep"
```

### Task E2: Attendance Report page (`AttendanceReport.tsx`)

**Files:**
- Create: `frontend-web/src/pages/AttendanceReport.tsx`

**Interfaces:**
- Consumes: `useAttendanceReport`, `useBoot`, `canManageAttendance`, `resource` (for brand/employee options), `BentoGrid/BentoTile/BentoStat`.
- Produces: `<AttendanceReport/>` — date-range + employee + brand + status filters, stat tiles, table, CSV download (via the already-installed `xlsx`).

- [ ] **Step 1: Write `frontend-web/src/pages/AttendanceReport.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance, useAttendanceReport } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

const STATUSES = ['', 'Present', 'Late', 'EarlyLeave', 'Late+EarlyLeave', 'Absent', 'Excused-WFH', 'Excused-Leave', 'Holiday', 'OffDay']

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function AttendanceReport() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [fromDate, setFromDate] = useState(isoDaysAgo(30))
  const [toDate, setToDate] = useState(isoDaysAgo(0))
  const [employee, setEmployee] = useState('')
  const [brand, setBrand] = useState('')
  const [status, setStatus] = useState('')
  const [brands, setBrands] = useState<{ name: string }[]>([])

  useEffect(() => {
    resource.list<{ name: string }[]>('Brand', { fields: ['name'], limit: 0 }).then(setBrands).catch(() => {})
  }, [])

  const filters = useMemo(
    () => ({ from_date: fromDate, to_date: toDate, employee: employee || undefined, brand: brand || undefined, status: status || undefined }),
    [fromDate, toDate, employee, brand, status],
  )
  const { data, isFetching } = useAttendanceReport(filters, !!fromDate && !!toDate)

  const downloadCsv = () => {
    if (!data) return
    const aoa = [
      data.columns.map((c) => c.label),
      ...data.rows.map((r) => data.columns.map((c) => r[c.fieldname] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `attendance_${fromDate}_${toDate}.csv`, { bookType: 'csv' })
  }

  if (blocked) return null
  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Attendance Report</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">From
              <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">To
              <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Employee
              <input className={inputCls} placeholder="user id (optional)" value={employee} onChange={(e) => setEmployee(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Brand
              <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {brands.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Status
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
              </select>
            </label>
            <button
              onClick={downloadCsv}
              disabled={!data || !data.rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            {isFetching && <Spinner className="h-4 w-4 text-brand-500" />}
          </div>
        </BentoTile>

        {data && (
          <>
            <BentoTile span="sm" tone="tint" accent="emerald"><BentoStat value={data.stats.present} label="Present" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="amber"><BentoStat value={data.stats.late} label="Late / early" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="rose"><BentoStat value={data.stats.absent} label="Absent" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={Math.round(data.stats.penalty)} label="Penalty pts" /></BentoTile>
          </>
        )}

        <BentoTile span="full" tone="plain">
          {!data ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : data.rows.length === 0 ? (
            <EmptyState icon={Download} title="No rows" subtitle="No attendance for these filters." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>{data.columns.map((c) => <th key={c.fieldname} className="px-4 py-2.5">{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {data.columns.map((c) => (
                        <td key={c.fieldname} className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-200">
                          {String(r[c.fieldname] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `cd frontend-web && npm run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/AttendanceReport.tsx
git commit -m "feat(attendance/web): attendance report page with stats + CSV"
```

### Task E3: Stations admin + Kiosk display

**Files:**
- Create: `frontend-web/src/pages/Stations.tsx`
- Create: `frontend-web/src/pages/Kiosk.tsx`

**Interfaces:**
- Consumes: `resource` (CRUD `Attendance Station`), `mobileApi.stationToken`, `qrcode`, `BentoGrid/BentoTile`.
- Produces: `<Stations/>` (list + create + per-row "Open kiosk" link with the station's `display_key`), `<Kiosk/>` (chrome-less fullscreen route `/kiosk/:station?key=...` that polls `station_token` and re-renders the rotating QR).

- [ ] **Step 1: Write `frontend-web/src/pages/Stations.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Plus, Monitor, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

type Station = { name: string; station_name: string; location?: string; active: number; display_key: string }

export default function Stations() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [list, setList] = useState<Station[] | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () =>
    resource
      .list<Station[]>('Attendance Station', { fields: ['name', 'station_name', 'location', 'active', 'display_key'], limit: 0 })
      .then(setList)
      .catch(() => setList([]))
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await resource.create('Attendance Station', { station_name: name, location })
      setName('')
      setLocation('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Stations</h1>
      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={list?.length ?? 0} label="stations" /></BentoTile>
        <BentoTile span="wide" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Name
              <input className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Location
              <input className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add station
            </button>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={Monitor} title="No stations" subtitle="Add a station to display its QR." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Station</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Active</th><th className="px-4 py-2.5">Kiosk</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((s) => (
                    <tr key={s.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{s.station_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{s.location || '—'}</td>
                      <td className="px-4 py-2.5">{s.active ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-2.5">
                        <a
                          href={`/w/kiosk/${encodeURIComponent(s.name)}?key=${encodeURIComponent(s.display_key)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          <Monitor className="h-4 w-4" /> Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
      <p className="flex items-center gap-1.5 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5" /> Open the kiosk link on the screen at each station.</p>
    </div>
  )
}
```

- [ ] **Step 2: Write `frontend-web/src/pages/Kiosk.tsx`** (chrome-less; no AppShell, no admin gate — auth is the `display_key`)

```tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { mobileApi } from '@/lib/api'

export default function Kiosk() {
  const { station = '' } = useParams()
  const [params] = useSearchParams()
  const key = params.get('key') || ''
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stationName, setStationName] = useState(station)

  useEffect(() => {
    let alive = true
    let timer: number

    const tick = async () => {
      try {
        const payload = await mobileApi.stationToken(station, key)
        if (!alive) return
        setStationName(payload.station)
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, JSON.stringify(payload), { width: 320, margin: 1 })
        }
        setError(null)
      } catch (e) {
        if (alive) setError((e as Error).message || 'Station error')
      }
      // re-poll a bit faster than the validity window so the code never goes stale on screen
      timer = window.setTimeout(tick, 5000)
    }
    tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [station, key])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-white">
      <h1 className="text-3xl font-bold">{stationName}</h1>
      {error ? (
        <p className="text-rose-400">{error}</p>
      ) : (
        <div className="rounded-2xl bg-white p-4">
          <canvas ref={canvasRef} />
        </div>
      )}
      <p className="text-sm text-slate-400">Scan with the Vernon app to check in / out</p>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck** — `cd frontend-web && npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Stations.tsx frontend-web/src/pages/Kiosk.tsx
git commit -m "feat(attendance/web): stations admin + rotating-QR kiosk page"
```

### Task E4: Schedules admin (Shift Templates + Shift Assignments)

**Files:**
- Create: `frontend-web/src/pages/Schedules.tsx`

**Interfaces:**
- Consumes: `resource` (CRUD `Shift Template`, `Shift Assignment`), `BentoGrid/BentoTile`.
- Produces: `<Schedules/>` — create/list shift templates; create/list shift assignments (employee, template, weekday checkboxes, effective dates). Saving an assignment triggers backend recompute automatically (Task C4).

- [ ] **Step 1: Write `frontend-web/src/pages/Schedules.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Tpl = { name: string; shift_name: string; start_time: string; end_time: string }
type Asg = { name: string; employee: string; shift_template: string; effective_from: string; effective_to?: string }

const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm'

export default function Schedules() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [tpls, setTpls] = useState<Tpl[] | null>(null)
  const [asgs, setAsgs] = useState<Asg[] | null>(null)
  const [tplForm, setTplForm] = useState({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
  const [asgForm, setAsgForm] = useState<{ employee: string; shift_template: string; effective_from: string; effective_to: string; days: Record<string, boolean> }>(
    { employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} },
  )

  const load = () => {
    resource.list<Tpl[]>('Shift Template', { fields: ['name', 'shift_name', 'start_time', 'end_time'], limit: 0 }).then(setTpls).catch(() => setTpls([]))
    resource.list<Asg[]>('Shift Assignment', { fields: ['name', 'employee', 'shift_template', 'effective_from', 'effective_to'], limit: 0 }).then(setAsgs).catch(() => setAsgs([]))
  }
  useEffect(() => {
    load()
  }, [])

  const addTpl = async () => {
    if (!tplForm.shift_name.trim()) return
    await resource.create('Shift Template', tplForm)
    setTplForm({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
    load()
  }

  const addAsg = async () => {
    if (!asgForm.employee || !asgForm.shift_template || !asgForm.effective_from) return
    const doc: Record<string, unknown> = {
      employee: asgForm.employee,
      shift_template: asgForm.shift_template,
      effective_from: asgForm.effective_from,
      effective_to: asgForm.effective_to || null,
    }
    for (const d of DAYS) doc[d] = asgForm.days[d] ? 1 : 0
    await resource.create('Shift Assignment', doc)
    setAsgForm({ employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Schedules</h1>
      <BentoGrid>
        {/* Shift templates */}
        <BentoTile span="lg" tone="plain" title="Shift templates">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <input className={inputCls} placeholder="Name" value={tplForm.shift_name} onChange={(e) => setTplForm({ ...tplForm, shift_name: e.target.value })} />
            <input type="time" className={inputCls} value={tplForm.start_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, start_time: e.target.value + ':00' })} />
            <input type="time" className={inputCls} value={tplForm.end_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, end_time: e.target.value + ':00' })} />
            <button onClick={addTpl} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /></button>
          </div>
          {tpls === null ? <Spinner /> : tpls.length === 0 ? <EmptyState icon={Plus} title="No templates" subtitle="Add a shift window." /> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {tpls.map((t) => <li key={t.name} className="py-2">{t.shift_name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</li>)}
            </ul>
          )}
        </BentoTile>

        {/* Shift assignments */}
        <BentoTile span="lg" tone="plain" title="Assignments">
          <div className="mb-3 flex flex-col gap-2">
            <input className={inputCls} placeholder="Employee (user id)" value={asgForm.employee} onChange={(e) => setAsgForm({ ...asgForm, employee: e.target.value })} />
            <select className={inputCls} value={asgForm.shift_template} onChange={(e) => setAsgForm({ ...asgForm, shift_template: e.target.value })}>
              <option value="">Shift template…</option>
              {(tpls ?? []).map((t) => <option key={t.name} value={t.name}>{t.shift_name}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={asgForm.effective_from} onChange={(e) => setAsgForm({ ...asgForm, effective_from: e.target.value })} />
              <input type="date" className={inputCls} value={asgForm.effective_to} onChange={(e) => setAsgForm({ ...asgForm, effective_to: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAsgForm({ ...asgForm, days: { ...asgForm.days, [d]: !asgForm.days[d] } })}
                  className={`rounded-md border px-2 py-1 text-xs capitalize ${asgForm.days[d] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <button onClick={addAsg} className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Add assignment</button>
          </div>
          {asgs === null ? <Spinner /> : asgs.length === 0 ? <EmptyState icon={Plus} title="No assignments" subtitle="Assign a shift to an employee." /> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {asgs.map((a) => <li key={a.name} className="py-2">{a.employee} · {a.shift_template} · from {a.effective_from}{a.effective_to ? ` to ${a.effective_to}` : ''}</li>)}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
      <p className="text-xs text-slate-400">Editing an assignment automatically recalculates affected past days.</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `cd frontend-web && npm run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Schedules.tsx
git commit -m "feat(attendance/web): schedules admin (templates + effective-dated assignments)"
```

### Task E5: Exceptions queue + Holiday Lists admin

**Files:**
- Create: `frontend-web/src/pages/Exceptions.tsx`
- Create: `frontend-web/src/pages/HolidayLists.tsx`

**Interfaces:**
- Consumes: `resource` (update `Attendance Exception` status; CRUD `Attendance Holiday List`; update `Brand.holiday_list`), `useBoot`.
- Produces: `<Exceptions/>` (approve/reject pending WFH/Leave — approval triggers backend recompute via C4), `<HolidayLists/>` (create lists with dates; assign a list to each brand).

- [ ] **Step 1: Write `frontend-web/src/pages/Exceptions.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'

type Exc = { name: string; employee: string; exception_type: string; from_date: string; to_date: string; status: string; reason?: string }

export default function Exceptions() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [list, setList] = useState<Exc[] | null>(null)
  const load = () =>
    resource
      .list<Exc[]>('Attendance Exception', {
        filters: { status: 'Pending' },
        fields: ['name', 'employee', 'exception_type', 'from_date', 'to_date', 'status', 'reason'],
        limit: 0,
      })
      .then(setList)
      .catch(() => setList([]))
  useEffect(() => {
    load()
  }, [])

  const decide = async (name: string, status: 'Approved' | 'Rejected') => {
    await resource.update('Attendance Exception', name, { status, approver: boot?.user })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Leave / WFH requests</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="No pending requests." />
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((e) => (
                <div key={e.name} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{e.employee} · {e.exception_type}</p>
                    <p className="text-xs text-slate-500">{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</p>
                  </div>
                  <button onClick={() => decide(e.name, 'Approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Approve</button>
                  <button onClick={() => decide(e.name, 'Rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"><X className="h-4 w-4" /> Reject</button>
                </div>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
```

- [ ] **Step 2: Write `frontend-web/src/pages/HolidayLists.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'

type HList = { name: string; list_name: string }
type Brand = { name: string; holiday_list?: string }
const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm'

export default function HolidayLists() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [lists, setLists] = useState<HList[] | null>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [listName, setListName] = useState('')
  const [dates, setDates] = useState('') // one ISO date per line

  const load = () => {
    resource.list<HList[]>('Attendance Holiday List', { fields: ['name', 'list_name'], limit: 0 }).then(setLists).catch(() => setLists([]))
    resource.list<Brand[]>('Brand', { fields: ['name', 'holiday_list'], limit: 0 }).then(setBrands).catch(() => setBrands([]))
  }
  useEffect(() => {
    load()
  }, [])

  const createList = async () => {
    if (!listName.trim()) return
    const holidays = dates
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((d) => ({ holiday_date: d }))
    await resource.create('Attendance Holiday List', { list_name: listName, holidays })
    setListName('')
    setDates('')
    load()
  }

  const assign = async (brand: string, holiday_list: string) => {
    await resource.update('Brand', brand, { holiday_list: holiday_list || null })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Holiday Lists</h1>
      <BentoGrid>
        <BentoTile span="lg" tone="plain" title="Create list">
          <div className="flex flex-col gap-2">
            <input className={inputCls} placeholder="List name" value={listName} onChange={(e) => setListName(e.target.value)} />
            <textarea className={inputCls + ' min-h-[120px] font-mono'} placeholder={'2026-08-17\n2026-12-25'} value={dates} onChange={(e) => setDates(e.target.value)} />
            <button onClick={createList} className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Create list</button>
          </div>
          {lists === null ? <Spinner /> : lists.length === 0 ? <EmptyState icon={Plus} title="No lists" subtitle="Create one above." /> : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {lists.map((l) => <li key={l.name} className="py-2">{l.list_name}</li>)}
            </ul>
          )}
        </BentoTile>

        <BentoTile span="lg" tone="plain" title="Assign to brands">
          {brands === null ? <Spinner /> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {brands.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{b.name}</span>
                  <select className={inputCls} value={b.holiday_list || ''} onChange={(e) => assign(b.name, e.target.value)}>
                    <option value="">No holidays</option>
                    {(lists ?? []).map((l) => <option key={l.name} value={l.name}>{l.list_name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck** — `cd frontend-web && npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Exceptions.tsx frontend-web/src/pages/HolidayLists.tsx
git commit -m "feat(attendance/web): exceptions approval queue + holiday lists admin"
```

### Task E6: Register web routes + nav

**Files:**
- Modify: `frontend-web/src/App.tsx` (imports + gated routes + chrome-less kiosk route)
- Modify: `frontend-web/src/components/AppShell.tsx` (admin nav entries + SECTION breadcrumbs)

**Interfaces:**
- Produces: gated routes `/attendance-report`, `/attendance/stations`, `/attendance/schedules`, `/attendance/exceptions`, `/attendance/holidays` (inside AppShell); chrome-less `/kiosk/:station` (outside AppShell); matching admin sidebar entries.

- [ ] **Step 1: Add imports to `frontend-web/src/App.tsx`** (with the other `@web/pages/*` imports), and add `canManageAttendance` to the existing `from '@/hooks/useData'` import list:
```tsx
import AttendanceReport from '@web/pages/AttendanceReport'
import Stations from '@web/pages/Stations'
import Schedules from '@web/pages/Schedules'
import Exceptions from '@web/pages/Exceptions'
import HolidayLists from '@web/pages/HolidayLists'
import Kiosk from '@web/pages/Kiosk'
```

- [ ] **Step 2: Add gated routes** inside the `<Route element={<AppShell />}>` block (alongside the other `canManageX` route groups):
```tsx
          {canManageAttendance(b) && (
            <>
              <Route path="/attendance-report" element={<AttendanceReport />} />
              <Route path="/attendance/stations" element={<Stations />} />
              <Route path="/attendance/schedules" element={<Schedules />} />
              <Route path="/attendance/exceptions" element={<Exceptions />} />
              <Route path="/attendance/holidays" element={<HolidayLists />} />
            </>
          )}
```

- [ ] **Step 3: Add the chrome-less kiosk route + bypass the login wall**

(a) Add the route OUTSIDE the `<Route element={<AppShell />}>` wrapper, as a sibling inside `<Routes>` (no sidebar/header), intentionally ungated (auth = `display_key`):
```tsx
        <Route path="/kiosk/:station" element={<Kiosk />} />
        <Route element={<AppShell />}>
          {/* ...existing routes... */}
        </Route>
```
(Add the `<Route path="/kiosk/:station" .../>` line immediately before the existing `<Route element={<AppShell />}>` opening tag.)

(b) The web `App()` returns `<Login/>`/`<Splash/>` whenever `useBoot()` is loading or 401/403s — a logged-out kiosk device would never reach the route. Short-circuit it: at the **top of the `App()` body, after the hooks are declared but before `if (boot.isLoading) return <Splash />`**, add:
```tsx
  // Kiosk runs on unattended (often logged-out) station screens; it only needs
  // the allow_guest station_token endpoint, so render it before the login wall.
  if (window.location.pathname.includes('/kiosk/')) {
    return (
      <Routes>
        <Route path="/kiosk/:station" element={<Kiosk />} />
      </Routes>
    )
  }
```
Hooks (`useBoot()`, `useState`, `useEffect`) must remain called unconditionally above this early return — never put the `if` before them.

- [ ] **Step 4: Add admin nav + breadcrumb entries to `frontend-web/src/components/AppShell.tsx`**

Add `canManageAttendance` to the `from '@/hooks/useData'` import. In the `admin` array (built per-render), append:
```tsx
    ...(canManageAttendance(b) ? [{ to: '/attendance-report', label: 'Attendance', icon: QrCode } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/schedules', label: 'Schedules', icon: CalendarDays } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/stations', label: 'Stations', icon: Monitor } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/exceptions', label: 'Leave/WFH', icon: Inbox } as NavItem] : []),
    ...(canManageAttendance(b) ? [{ to: '/attendance/holidays', label: 'Holidays', icon: CalendarDays } as NavItem] : []),
```
Import any missing icons (`QrCode`, `Monitor`) from `lucide-react` at the top of `AppShell.tsx` (`CalendarDays`, `Inbox` are already imported). Then add `SECTION` map entries. **Important:** `SECTION` is keyed by the **first path segment only** (the breadcrumb builder splits `pathname` and looks up the leading segment), and each value must match the existing entry shape (`{ label, to }` — copy an existing entry like the `wallet`/`reports` one to confirm the exact keys). So all five new pages share the `attendance` (and `attendance-report`) segments — they get one shared breadcrumb, not five distinct ones:
```tsx
  'attendance-report': { label: 'Attendance', to: '/attendance-report' },
  'attendance': { label: 'Attendance', to: '/attendance-report' },
```
(Do NOT use leading-slash or sub-path keys like `'/attendance/stations'` — they never match the first-segment lookup. Per-subpage breadcrumbs aren't expressible with this map; the shared label is fine.)

- [ ] **Step 5: Typecheck** — `cd frontend-web && npm run build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/App.tsx frontend-web/src/components/AppShell.tsx
git commit -m "feat(attendance/web): routes + admin nav (kiosk route chrome-less)"
```

---

## Phase F — Deploy + manual verification (live site)

Site is **live** (`project.vernon.id`, no staging). Build, deploy, then walk the end-to-end flow. No new pytest here — the engine is covered in B2; everything else is verified by behaviour.

### Task F1: Build + deploy

**Files:** none (build/deploy only)

- [ ] **Step 1: Build both frontends**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both write into `vernon_project/public/...` and refresh `www/m.html` / `www/w.html`.

- [ ] **Step 2: Migrate + restart**

```bash
cd /home/frappe/frappe-bench
bench --site project.vernon.id migrate
bench restart
```
Expected: migrate applies any remaining doctype/field changes and the seed patch; restart reloads Python (hooks/scheduler/API).

- [ ] **Step 3: Turn the feature on** — `bench --site project.vernon.id console`:
```python
import frappe
frappe.db.set_single_value("Vernon Settings", "attendance_enabled", 1)
frappe.db.set_single_value("Vernon Settings", "late_penalty_per_minute", 2)
frappe.db.set_single_value("Vernon Settings", "early_leave_penalty_per_minute", 2)
frappe.db.set_single_value("Vernon Settings", "absence_penalty", 50)
frappe.db.commit()
```

- [ ] **Step 4: Commit the built assets** (the build writes hashed JS/CSS + `www/*.html`):
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html
git commit -m "build(attendance): deploy mobile + web frontends"
```
> Re-check `git status` first and stage only attendance-related build outputs (the user may have other unbuilt changes in the working tree).

### Task F2: Manual end-to-end verification

**Files:** none

Walk these on the live site. Each line is a check; if one fails, debug before claiming done.

- [ ] **Setup (web `/w`, as a System Manager):**
  - `/attendance/stations` → add station "Front Desk". Row shows an "Open" kiosk link.
  - `/attendance/schedules` → add a "Morning" template 09:00–17:00; add an assignment for your own user, Mon–Sun, effective_from a past date.
  - In console, ensure your user has an active `Attendance Profile` with a brand (create if needed).

- [ ] **Kiosk + scan:**
  - Open the station "Open" link → fullscreen QR renders and refreshes every ~5s.
  - On a phone, log into `/m`, open Attendance → Scan → point at the kiosk QR. Expect a result card (checked in / late ± penalty).
  - Re-scan a screenshot of the QR taken >1 window ago → rejected ("QR expired").

- [ ] **Status correctness:**
  - `/m` → My attendance shows today with the right status and penalty.
  - `/attendance-report` (web) → today's row appears; stat tiles count it; CSV downloads.
  - Console: `Point Ledger` has a row `source=Attendance`, `attendance=<daily>`, `points_earned = -penalty`; the user's wallet balance dropped by the penalty.

- [ ] **Excused paths:**
  - `/m` → Request leave for today (Leave) → `/attendance/exceptions` (web) approve it → report row flips to `Excused-Leave`, penalty 0, ledger row now 0.
  - Repeat with WFH (no scan needed) → `Excused-WFH`.
  - `/attendance/holidays` → create a list containing today, assign it to your brand → report row flips to `Holiday`, penalty 0.

- [ ] **Retroactive recompute (the headline requirement):**
  - Pick a past working day where you were Absent. Edit the assignment (e.g. change `effective_from`, or uncheck that weekday) so that day becomes an off day → save → report row for that past day recalculates to `OffDay`, its penalty ledger row goes to 0. Confirms "set schedule after the date, recalculate".

- [ ] **Nightly:** (optional) run `bench --site project.vernon.id execute vernon_project.attendance.engine.nightly_finalize` → yesterday's Absent rows are finalized for all enrolled users.

- [ ] **Final commit** (if any build assets changed during verification): none expected; confirm `git status` clean for attendance files.

---

## Notes for the implementer

- **Do not** modify `_user_balance` — negative `points_earned` rows make balances correct automatically.
- **Recursion safety:** recompute writes only to `Daily Attendance` + `Point Ledger`, neither of which has `doc_events`. Never add a `doc_event` to those two doctypes that writes back into the triggering doctype.
- **Doctype naming:** the holiday doctypes are `Attendance Holiday` / `Attendance Holiday List` (NOT `Holiday`/`Holiday List`) to avoid colliding with ERPNext core on this bench.
- **v1 limits (documented, deferred):** same-day shifts only; no half-day/partial leave; no geofencing/GPS; no photo-on-scan. These are intentional — add only when asked.
- **Token security:** `secret_key` never leaves the server; the kiosk authenticates with `display_key`; scans are timestamped server-side; tokens accept only the current/previous window.

