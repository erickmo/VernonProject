# Employee Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete employee/HR data (background, legal/ID, birthdate, expertise, training, leave quota, contract) to vernon_project as a User-keyed Employee Profile doctype, with self-service + admin editing and a leave-quota gate on cuti approval.

**Architecture:** One 1:1-with-User `Employee Profile` doctype (+ 3 child tables) mirrors `Attendance Profile`'s shape. Soft fields (permlevel 0) are self-editable on `/m`; legal/contract/quota (permlevel 1) are admin-only on `/w`. Leave balance is computed on read (no ledger) and enforced in `Attendance Exception.validate()`. Native `User` fields (phone/birthdate/bio) are reused, not duplicated.

**Tech Stack:** Frappe v15 (Python), MariaDB, React/TS frontends (`frontend/` = mobile `/m`, `frontend-web/` = web `/w`), served by `vernon_project/api/mobile.py` + `api/attendance.py`.

## Global Constraints

- **Live site, code-first, NO test DB.** Verification is `bench migrate` / `bench restart` / `npm build` + read-only `bench console` smoke checks + pure-logic `__main__` self-checks (mirror `attendance/approval.py`). Do NOT write pytest suites against a DB. (memory: `vernon-live-site-codefirst`)
- **Deploy mechanics:** schema → `bench --site project.vernon.id migrate`; Python → `bench restart`; frontend → `npm run build` in the app dir. (memory: `vernon-deploy-mechanics`)
- **Parallel user / git:** stage ONLY files you create or edit for a task (`git add <exact paths>`), never `git add -A`. Re-check `git status` before each commit. (memory: `vernon-user-parallel-remote-control`)
- **Roles that exist here:** only `System Manager`, `All`, `Project Owner/Leader/Admin/Team`, `Group Manager`, `Marketplace Manager`, `Points Granter`. **Never** reference `HR Manager` or `Vernon User` in a permission row — a non-existent role aborts `bench migrate`.
- **No native alert/confirm/prompt** in frontend — use the dialog/modal pattern. (memory: `vernon-no-alert-use-dialog`)
- **`frontend/src/lib/types.ts` and `api.ts` and `hooks/useData.ts` are SHARED (`@`) by both frontends** — additive edits only. (memory: `vernon-two-frontends`)
- Module for all new doctypes: `Vernon Project`.

---

## File Structure

**New (backend):**
- `vernon_project/vernon_project/doctype/employee_education/employee_education.json` — child: schooling rows.
- `vernon_project/vernon_project/doctype/employee_skill/employee_skill.json` — child: freeform skill + proficiency.
- `vernon_project/vernon_project/doctype/employee_training/employee_training.json` — child: training + cert attach.
- `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json` — the 1:1 doctype.
- `vernon_project/vernon_project/doctype/employee_profile/employee_profile.py` — controller + permission fns + `_ensure_employee_profile`.
- `vernon_project/vernon_project/doctype/employee_profile/__init__.py`, and `__init__.py` in each new child doctype dir.
- `vernon_project/attendance/leave_quota.py` — pure `year_slices` (self-checked) + DB helpers (`working_days`, `used_days`, `effective_quota`).
- `vernon_project/patches/v1_0/backfill_employee_profile.py` — backfill existing users.

**Modified (backend):**
- `vernon_project/hooks.py` — register `Employee Profile` in `permission_query_conditions` + `has_permission`.
- `vernon_project/patches.txt` — add the backfill patch under `[post_model_sync]`.
- `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` — add `default_annual_leave_quota`.
- `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.py` — add `validate()` quota gate.
- `vernon_project/api/mobile.py` — extend `bootstrap()`; add `update_my_profile`, `get_employee_profile`, `update_employee_profile`.

**Modified (frontend):**
- `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts` — shared API + types.
- `frontend/src/pages/Profile.tsx` — `/m` self-edit section + leave chip.
- `frontend-web/src/pages/UserForm.tsx` — `/w` admin editor groups.

---

# PHASE 1 — Doctype + permissions + provisioning

### Task 1: Child table doctypes (Education, Skill, Training)

**Files:**
- Create: `vernon_project/vernon_project/doctype/employee_education/employee_education.json`
- Create: `vernon_project/vernon_project/doctype/employee_education/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/employee_skill/employee_skill.json`
- Create: `vernon_project/vernon_project/doctype/employee_skill/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/employee_training/employee_training.json`
- Create: `vernon_project/vernon_project/doctype/employee_training/__init__.py` (empty)

**Interfaces:**
- Produces: child doctypes `Employee Education`, `Employee Skill`, `Employee Training` (all `istable: 1`) referenced by Task 2's Table fields.

- [ ] **Step 1: Create `employee_education.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["level", "institution", "major", "year"],
 "fields": [
  {"fieldname": "level", "fieldtype": "Select", "label": "Level", "options": "\nSD\nSMP\nSMA/SMK\nD3\nS1\nS2\nS3", "in_list_view": 1, "columns": 2},
  {"fieldname": "institution", "fieldtype": "Data", "label": "Institution", "in_list_view": 1, "columns": 4},
  {"fieldname": "major", "fieldtype": "Data", "label": "Major", "in_list_view": 1, "columns": 3},
  {"fieldname": "year", "fieldtype": "Int", "label": "Year", "in_list_view": 1, "columns": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Employee Education",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 2: Create `employee_skill.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["skill", "proficiency"],
 "fields": [
  {"fieldname": "skill", "fieldtype": "Data", "label": "Skill", "reqd": 1, "in_list_view": 1, "columns": 6},
  {"fieldname": "proficiency", "fieldtype": "Select", "label": "Proficiency", "options": "Beginner\nIntermediate\nAdvanced\nExpert", "default": "Intermediate", "in_list_view": 1, "columns": 3}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Employee Skill",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create `employee_training.json`**

```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["title", "provider", "training_date", "certificate", "expiry_date"],
 "fields": [
  {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1, "columns": 4},
  {"fieldname": "provider", "fieldtype": "Data", "label": "Provider", "in_list_view": 1, "columns": 3},
  {"fieldname": "training_date", "fieldtype": "Date", "label": "Date", "in_list_view": 1, "columns": 2},
  {"fieldname": "certificate", "fieldtype": "Attach", "label": "Certificate", "is_private": 1, "columns": 1},
  {"fieldname": "expiry_date", "fieldtype": "Date", "label": "Expiry", "columns": 2}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Employee Training",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 4: Create the three empty `__init__.py` files**

```bash
touch vernon_project/vernon_project/doctype/employee_education/__init__.py \
      vernon_project/vernon_project/doctype/employee_skill/__init__.py \
      vernon_project/vernon_project/doctype/employee_training/__init__.py
```

- [ ] **Step 5: Validate JSON parses**

Run: `python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('vernon_project/vernon_project/doctype/employee_*/*.json')]; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/employee_education vernon_project/vernon_project/doctype/employee_skill vernon_project/vernon_project/doctype/employee_training
git commit -m "feat(hr): employee education/skill/training child doctypes"
```

---

### Task 2: Employee Profile doctype JSON

**Files:**
- Create: `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json`

**Interfaces:**
- Consumes: `Employee Education`, `Employee Skill`, `Employee Training` (Task 1) as Table options; core `User`.
- Produces: doctype `Employee Profile`, autoname `field:user`, with permlevel-0 soft fields + permlevel-1 sensitive fields; consumed by Tasks 3–8.

- [ ] **Step 1: Create `employee_profile.json`** (section breaks organize the Desk form; `depends_on` not needed)

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "field:user",
 "naming_rule": "By fieldname",
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "user",
  "personal_section", "home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
  "background_section", "education", "skills", "trainings",
  "legal_section", "nik_ktp", "npwp", "bpjs_kesehatan", "bpjs_ketenagakerjaan", "bank_name", "bank_account_no", "bank_account_holder", "attach_ktp", "attach_npwp",
  "contract_section", "employment_status", "job_title", "date_joined", "contract_start", "contract_end", "attach_contract",
  "leave_section", "annual_leave_quota"
 ],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "unique": 1, "in_list_view": 1, "search_index": 1, "permlevel": 1},

  {"fieldname": "personal_section", "fieldtype": "Section Break", "label": "Personal"},
  {"fieldname": "home_address", "fieldtype": "Small Text", "label": "Home Address"},
  {"fieldname": "emergency_contact_name", "fieldtype": "Data", "label": "Emergency Contact Name"},
  {"fieldname": "emergency_contact_phone", "fieldtype": "Data", "label": "Emergency Contact Phone"},
  {"fieldname": "emergency_contact_relation", "fieldtype": "Data", "label": "Emergency Contact Relation"},

  {"fieldname": "background_section", "fieldtype": "Section Break", "label": "Background, Expertise & Training"},
  {"fieldname": "education", "fieldtype": "Table", "label": "Education", "options": "Employee Education"},
  {"fieldname": "skills", "fieldtype": "Table", "label": "Skills", "options": "Employee Skill"},
  {"fieldname": "trainings", "fieldtype": "Table", "label": "Training", "options": "Employee Training"},

  {"fieldname": "legal_section", "fieldtype": "Section Break", "label": "Legal / ID (admin only)"},
  {"fieldname": "nik_ktp", "fieldtype": "Data", "label": "NIK (KTP)", "permlevel": 1},
  {"fieldname": "npwp", "fieldtype": "Data", "label": "NPWP", "permlevel": 1},
  {"fieldname": "bpjs_kesehatan", "fieldtype": "Data", "label": "BPJS Kesehatan", "permlevel": 1},
  {"fieldname": "bpjs_ketenagakerjaan", "fieldtype": "Data", "label": "BPJS Ketenagakerjaan", "permlevel": 1},
  {"fieldname": "bank_name", "fieldtype": "Data", "label": "Bank Name", "permlevel": 1},
  {"fieldname": "bank_account_no", "fieldtype": "Data", "label": "Bank Account No", "permlevel": 1},
  {"fieldname": "bank_account_holder", "fieldtype": "Data", "label": "Bank Account Holder", "permlevel": 1},
  {"fieldname": "attach_ktp", "fieldtype": "Attach", "label": "KTP Scan", "permlevel": 1, "is_private": 1},
  {"fieldname": "attach_npwp", "fieldtype": "Attach", "label": "NPWP Scan", "permlevel": 1, "is_private": 1},

  {"fieldname": "contract_section", "fieldtype": "Section Break", "label": "Contract / Employment (admin only)"},
  {"fieldname": "employment_status", "fieldtype": "Select", "label": "Employment Status", "options": "\nPermanent\nContract\nProbation\nIntern", "permlevel": 1},
  {"fieldname": "job_title", "fieldtype": "Data", "label": "Job Title", "permlevel": 1},
  {"fieldname": "date_joined", "fieldtype": "Date", "label": "Date Joined", "permlevel": 1},
  {"fieldname": "contract_start", "fieldtype": "Date", "label": "Contract Start", "permlevel": 1},
  {"fieldname": "contract_end", "fieldtype": "Date", "label": "Contract End", "permlevel": 1},
  {"fieldname": "attach_contract", "fieldtype": "Attach", "label": "Signed Contract", "permlevel": 1, "is_private": 1},

  {"fieldname": "leave_section", "fieldtype": "Section Break", "label": "Leave (admin only)"},
  {"fieldname": "annual_leave_quota", "fieldtype": "Int", "label": "Annual Leave Quota (blank = global default)", "permlevel": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Employee Profile",
 "owner": "Administrator",
 "permissions": [
  {"role": "All", "read": 1, "write": 1, "create": 0, "delete": 0},
  {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "share": 1, "email": 1},
  {"role": "System Manager", "permlevel": 1, "read": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 1
}
```

> Note: `annual_leave_quota` has **no** `default` — blank/0 means "use the Vernon Settings global default" (Task 6 `effective_quota` treats falsy as unset). Consequence: you cannot set a per-employee explicit 0-quota; a 0-quota employee needs the global default set to 0. Acceptable for launch.

- [ ] **Step 2: Validate JSON parses**

Run: `python3 -c "import json; json.load(open('vernon_project/vernon_project/doctype/employee_profile/employee_profile.json')); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/doctype/employee_profile/employee_profile.json
git commit -m "feat(hr): Employee Profile doctype (1:1 User, permlevel split)"
```

---

### Task 3: Employee Profile controller — permissions + provisioning

**Files:**
- Create: `vernon_project/vernon_project/doctype/employee_profile/employee_profile.py`
- Create: `vernon_project/vernon_project/doctype/employee_profile/__init__.py` (empty)
- Modify: `vernon_project/hooks.py` (`permission_query_conditions` ~line 143, `has_permission` ~line 153)

**Interfaces:**
- Produces:
  - `get_permission_query_conditions(user=None) -> str`
  - `has_permission(doc, ptype="read", user=None) -> bool`
  - `_ensure_employee_profile(user) -> Document` (get-or-create, dup-safe) — consumed by Tasks 6, 8.

- [ ] **Step 1: Create `employee_profile.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class EmployeeProfile(Document):
	pass


def get_permission_query_conditions(user=None):
	"""Desk/list scoping: System Manager sees all, everyone else only their own row."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""
	return f"`tabEmployee Profile`.`user` = {frappe.db.escape(user)}"


def has_permission(doc, ptype="read", user=None):
	"""Own-row + System Manager only. NO share-widening (unlike Personal Note)."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.user == user


def _ensure_employee_profile(user):
	"""Get-or-create the 1:1 Employee Profile for `user`. Idempotent + race-safe."""
	name = frappe.db.exists("Employee Profile", {"user": user})
	if name:
		return frappe.get_doc("Employee Profile", name)
	try:
		doc = frappe.new_doc("Employee Profile")
		doc.user = user
		doc.insert(ignore_permissions=True)
		return doc
	except frappe.DuplicateEntryError:
		# lost a first-touch race; the other insert won — re-fetch
		return frappe.get_doc("Employee Profile", {"user": user})
```

- [ ] **Step 2: Create the empty `__init__.py`**

```bash
touch vernon_project/vernon_project/doctype/employee_profile/__init__.py
```

- [ ] **Step 3: Register both permission hooks in `hooks.py`**

In the `permission_query_conditions` dict (after the `"Resource Booking"` line ~150), add:

```python
	"Employee Profile": "vernon_project.vernon_project.doctype.employee_profile.employee_profile.get_permission_query_conditions",
```

In the `has_permission` dict (after its `"Resource Booking"` line), add:

```python
	"Employee Profile": "vernon_project.vernon_project.doctype.employee_profile.employee_profile.has_permission",
```

- [ ] **Step 4: Verify import resolves (syntax + path)**

Run: `python3 -c "import ast; ast.parse(open('vernon_project/vernon_project/doctype/employee_profile/employee_profile.py').read()); ast.parse(open('vernon_project/hooks.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/employee_profile/employee_profile.py vernon_project/vernon_project/doctype/employee_profile/__init__.py vernon_project/hooks.py
git commit -m "feat(hr): Employee Profile perms (own-row) + lazy provisioning"
```

---

### Task 4: Vernon Settings — global leave-quota default

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`

**Interfaces:**
- Produces: single-value `Vernon Settings.default_annual_leave_quota` (Int) — read by Task 6 `effective_quota`.

> `vernon_settings.json` may already be modified in the working tree (parallel work). Re-read it before editing and insert additively.

- [ ] **Step 1: Add the field to `field_order`** — append `"default_annual_leave_quota"` after `"absence_penalty"` inside the `attendance_section` group (keep it near the other attendance settings). If a `leave` section is preferred, add a `"leave_section"` Section Break before it; minimal version just appends the field.

Change the `field_order` array to include, right after `"absence_penalty"`:

```json
  "absence_penalty", "default_annual_leave_quota",
```

- [ ] **Step 2: Add the field definition** to the `fields` array (anywhere; place next to `absence_penalty`):

```json
  {"fieldname": "default_annual_leave_quota", "fieldtype": "Int", "label": "Default Annual Leave Quota (days)", "default": "12", "non_negative": 1},
```

- [ ] **Step 3: Validate JSON parses**

Run: `python3 -c "import json; d=json.load(open('vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json')); assert 'default_annual_leave_quota' in d['field_order']; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json
git commit -m "feat(hr): default_annual_leave_quota in Vernon Settings"
```

---

### Task 5: Backfill patch for existing users

**Files:**
- Create: `vernon_project/patches/v1_0/backfill_employee_profile.py`
- Modify: `vernon_project/patches.txt` (under `[post_model_sync]`)

**Interfaces:**
- Consumes: `_ensure_employee_profile` (Task 3).

- [ ] **Step 1: Create the patch**

```python
# Copyright (c) 2026, Vernon and contributors
import frappe

from vernon_project.vernon_project.doctype.employee_profile.employee_profile import (
	_ensure_employee_profile,
)


def execute():
	"""Provision an empty Employee Profile for every enabled human User. Idempotent."""
	for u in frappe.get_all("User", filters={"enabled": 1}, pluck="name"):
		if u in ("Administrator", "Guest"):
			continue
		if not frappe.db.exists("Employee Profile", {"user": u}):
			_ensure_employee_profile(u)
	frappe.db.commit()
```

- [ ] **Step 2: Register in `patches.txt`** — add under the `[post_model_sync]` section (so the doctype exists before the patch runs):

```
vernon_project.patches.v1_0.backfill_employee_profile
```

- [ ] **Step 3: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('vernon_project/patches/v1_0/backfill_employee_profile.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/patches/v1_0/backfill_employee_profile.py vernon_project/patches.txt
git commit -m "feat(hr): backfill Employee Profile for existing users"
```

---

### Task 6 (Phase 1 verification): Migrate + smoke test

**Files:** none (deploy + verify).

- [ ] **Step 1: Migrate the live site** (creates the 4 doctypes, Settings field, runs the backfill patch)

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error; log shows the backfill patch applied. If it aborts on a Role validation error, a permission row references a non-existent role — fix Task 2/Task 3 (only `All` + `System Manager` allowed).

- [ ] **Step 2: Smoke — doctype exists and users were backfilled** (read-only)

Run:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
print("doctype:", frappe.db.exists("DocType", "Employee Profile"))
print("profiles:", frappe.db.count("Employee Profile"))
print("enabled users:", frappe.db.count("User", {"enabled": 1}))
PY
```
Expected: `doctype: Employee Profile`; `profiles:` ≈ enabled users minus Administrator/Guest (non-zero).

- [ ] **Step 3: Smoke — own-row permission fence** (read-only; pick any two non-admin user emails `A` and `B` from the site)

Run:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.vernon_project.doctype.employee_profile.employee_profile import has_permission, get_permission_query_conditions
A = frappe.get_all("User", filters={"enabled":1,"name":["not in",["Administrator","Guest"]]}, pluck="name")[0]
docA = frappe.get_doc("Employee Profile", {"user": A})
frappe.set_user(A)
print("A sees own:", has_permission(docA, "read", A))          # True
print("cond:", get_permission_query_conditions(A))              # tabEmployee Profile.user = 'A'
frappe.set_user("Administrator")
PY
```
Expected: `A sees own: True`; condition string scopes to A.

- [ ] **Step 4: Commit** (nothing to commit — verification only). If migrate required a fix, that fix was committed in its own task above.

---

# PHASE 2 — Leave quota gate

### Task 7: Leave-quota helper module (with self-check)

**Files:**
- Create: `vernon_project/attendance/leave_quota.py`

**Interfaces:**
- Consumes: `attendance/engine.py` `_assignment_for`, `_is_holiday` (existing); `Employee Profile.annual_leave_quota`; `Vernon Settings.default_annual_leave_quota`.
- Produces:
  - `year_slices(from_date, to_date) -> list[tuple[int, date, date]]` (pure)
  - `working_days(employee, start, end) -> int`
  - `effective_quota(employee) -> int`
  - `used_days(employee, year, exclude=None) -> int`
  - Consumed by Task 8.

- [ ] **Step 1: Create `leave_quota.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Leave-quota computation. `year_slices` is pure (no frappe) so it self-checks
# via `python leave_quota.py`, mirroring attendance/approval.py.

from datetime import date

DEFAULT_QUOTA = 12


def year_slices(from_date, to_date):
	"""Split an inclusive [from, to] span into per-calendar-year (year, start, end) slices.

	A cross-year leave (Dec 28 -> Jan 3) consumes from BOTH years' quotas.
	Accepts date objects or ISO strings.
	"""
	def _d(v):
		return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])

	start, end = _d(from_date), _d(to_date)
	slices = []
	y = start.year
	while y <= end.year:
		ys, ye = date(y, 1, 1), date(y, 12, 31)
		slices.append((y, max(start, ys), min(end, ye)))
		y += 1
	return slices


def working_days(employee, start, end):
	"""Count working days in [start, end]: has a shift assignment that weekday AND not a holiday.

	Reuses attendance.engine helpers. An employee with no shift assignments counts 0
	(not on the attendance/shift system) -> their leave never consumes quota.
	"""
	import frappe
	from frappe.utils import add_days, getdate

	from vernon_project.attendance.engine import _assignment_for, _is_holiday

	brand = frappe.db.get_value("Attendance Profile", {"user": employee, "active": 1}, "brand")
	d, last, n = getdate(start), getdate(end), 0
	while d <= last:
		if _assignment_for(employee, d) and not (brand and _is_holiday(brand, d)):
			n += 1
		d = add_days(d, 1)
	return n


def effective_quota(employee):
	"""Per-employee override if set (non-zero), else the Vernon Settings global default."""
	import frappe

	q = frappe.db.get_value("Employee Profile", {"user": employee}, "annual_leave_quota")
	if q:
		return int(q)
	default = frappe.db.get_single_value("Vernon Settings", "default_annual_leave_quota")
	return int(default or DEFAULT_QUOTA)


def used_days(employee, year, exclude=None):
	"""Working-days of this employee's Leave exceptions (Approved OR Pending) in `year`.

	Pending counts too, so a still-pending request reserves quota and closes the
	sequential double-book (two requests each fitting alone but not together).
	`exclude` drops the row being validated (its own days are added by the caller).
	"""
	import frappe

	ys, ye = f"{year}-01-01", f"{year}-12-31"
	filters = {
		"employee": employee,
		"exception_type": "Leave",
		"status": ["in", ["Approved", "Pending"]],
		"from_date": ["<=", ye],
		"to_date": [">=", ys],
	}
	if exclude:
		filters["name"] = ["!=", exclude]
	total = 0
	for r in frappe.get_all("Attendance Exception", filters=filters, fields=["from_date", "to_date"]):
		for (y, s, e) in year_slices(r.from_date, r.to_date):
			if y == year:
				total += working_days(employee, s, e)
	return total


if __name__ == "__main__":
	# Pure self-check for the year-split (no DB). Run: python leave_quota.py
	assert year_slices("2026-03-01", "2026-03-05") == [(2026, date(2026, 3, 1), date(2026, 3, 5))]
	xs = year_slices("2026-12-28", "2027-01-03")
	assert xs == [
		(2026, date(2026, 12, 28), date(2026, 12, 31)),
		(2027, date(2027, 1, 1), date(2027, 1, 3)),
	], xs
	assert year_slices("2026-06-10", "2026-06-10") == [(2026, date(2026, 6, 10), date(2026, 6, 10))]
	print("leave_quota self-check OK")
```

- [ ] **Step 2: Run the pure self-check (no DB needed)**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/attendance/leave_quota.py`
Expected: `leave_quota self-check OK`

- [ ] **Step 3: Commit**

```bash
git add vernon_project/attendance/leave_quota.py
git commit -m "feat(hr): leave-quota helpers (year-split, working-days, balance)"
```

---

### Task 8: Enforce quota in Attendance Exception.validate()

**Files:**
- Modify: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.py`

**Interfaces:**
- Consumes: `leave_quota.year_slices/working_days/used_days/effective_quota` (Task 7).
- Behavior: on any save where `status == "Approved"` and `exception_type == "Leave"` by a **non-System-Manager** session, block if any touched year would exceed quota. Runs on the approval path (`_vote_exception` → `doc.save()`), on auto-approve inserts (`request_exception` with no leaders), AND on Desk edits — all route through `validate()`.

- [ ] **Step 1: Replace the controller body** (currently just `pass`)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from vernon_project.attendance.leave_quota import (
	effective_quota,
	used_days,
	working_days,
	year_slices,
)


class AttendanceException(Document):
	def validate(self):
		self._check_leave_quota()

	def _check_leave_quota(self):
		# Only gate a Leave that is (becoming) Approved.
		if self.status != "Approved" or self.exception_type != "Leave":
			return
		# System Manager override bypasses quota — preserves the deadlock/no-leader
		# escape hatch in api/attendance.py _vote_exception (admin branch).
		if "System Manager" in frappe.get_roles(frappe.session.user):
			return
		quota = effective_quota(self.employee)
		for (year, start, end) in year_slices(self.from_date, self.to_date):
			req = working_days(self.employee, start, end)
			if req <= 0:
				continue
			used = used_days(self.employee, year, exclude=self.name)
			if used + req > quota:
				remaining = quota - used
				frappe.throw(
					_("Leave quota exceeded for {0}: {1} day(s) remaining, {2} requested.").format(
						year, remaining, req
					)
				)
```

- [ ] **Step 2: Restart to load the new Python**

Run: `cd /home/frappe/frappe-bench && bench restart`
Expected: workers restart cleanly.

- [ ] **Step 3: Smoke — quota blocks over-limit leave** (careful, live site; use a real non-admin user, clean up after)

Run:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
from frappe.utils import nowdate, add_days
# pick a user enrolled with an active attendance profile + a shift (so working_days > 0)
prof = frappe.get_all("Attendance Profile", filters={"active":1}, pluck="user")
u = next((x for x in prof if frappe.db.exists("Shift Assignment", {"employee": x})), None)
print("test user:", u)
# set a tiny quota to force the block
ep = frappe.get_doc("Employee Profile", {"user": u}); ep.annual_leave_quota = 1; ep.save(ignore_permissions=True)
frappe.db.commit()
# act as the user, auto-approve path (no leaders) or force status Approved
frappe.set_user(u)
try:
    doc = frappe.get_doc({"doctype":"Attendance Exception","employee":u,
        "exception_type":"Leave","from_date":nowdate(),"to_date":add_days(nowdate(),20),
        "status":"Approved","approvers":[]})
    doc.insert(ignore_permissions=True)
    print("NO BLOCK (unexpected):", doc.name)
    doc.delete(ignore_permissions=True)
except frappe.ValidationError as e:
    print("BLOCKED as expected:", str(e))
finally:
    frappe.set_user("Administrator")
    ep = frappe.get_doc("Employee Profile", {"user": u}); ep.annual_leave_quota = 0; ep.save(ignore_permissions=True)
    frappe.db.commit()
PY
```
Expected: `BLOCKED as expected: ... Leave quota exceeded ...`. (Quota reset to 0 = default afterward.)

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.py
git commit -m "feat(hr): gate cuti approval on annual leave quota"
```

---

# PHASE 3 — Frontend (backend API + /m self-edit + /w admin)

### Task 9: Mobile API endpoints (read/self-write/admin)

**Files:**
- Modify: `vernon_project/api/mobile.py`

**Interfaces:**
- Consumes: `_ensure_employee_profile` (Task 3), `leave_quota` helpers (Task 7), `_require_system_manager` (mobile.py:26).
- Produces (whitelisted):
  - extended `bootstrap()` return with `"employee": {soft fields}` + `"leave": {quota, used, remaining}`.
  - `update_my_profile(**soft) -> {"status":"ok"}` — self-write allowlist.
  - `get_employee_profile(user) -> {all fields}` — admin read.
  - `update_employee_profile(user, **all) -> {"status":"ok"}` — admin write.

- [ ] **Step 1: Add module imports** near the top of `mobile.py` (after existing imports). Verify `json` is already imported (it is — used at mobile.py:1745); add the two app imports:

```python
from vernon_project.vernon_project.doctype.employee_profile.employee_profile import _ensure_employee_profile
from vernon_project.attendance.leave_quota import effective_quota, used_days, working_days, year_slices
```

- [ ] **Step 2: Add a shared soft-field allowlist + leave-balance helper** (module level, near the other module constants around mobile.py:23):

```python
# Employee Profile self-editable soft fields (mobile /m). Legal/contract/quota are NOT here.
EMPLOYEE_SOFT_FIELDS = (
	"home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
)
EMPLOYEE_SOFT_CHILDREN = {
	"education": ("level", "institution", "major", "year"),
	"skills": ("skill", "proficiency"),
	"trainings": ("title", "provider", "training_date", "certificate", "expiry_date"),
}
# Native User fields reused instead of duplicating on Employee Profile.
EMPLOYEE_USER_FIELDS = ("phone", "birth_date", "bio")


def _leave_balance(user):
	from frappe.utils import getdate, nowdate
	yr = getdate(nowdate()).year
	quota = effective_quota(user)
	used = used_days(user, yr)
	return {"quota": quota, "used": used, "remaining": quota - used}
```

- [ ] **Step 3: Extend `bootstrap()`** — before its `return {...}` (mobile.py ~665), add:

```python
	ep = _ensure_employee_profile(user)
	uf = frappe.get_value("User", user, ["phone", "birth_date", "bio"], as_dict=True) or {}
	employee = {f: ep.get(f) for f in EMPLOYEE_SOFT_FIELDS}
	employee["phone"] = uf.get("phone")
	employee["birthdate"] = uf.get("birth_date")
	employee["bio"] = uf.get("bio")
	employee["education"] = [r.as_dict() for r in ep.education]
	employee["skills"] = [r.as_dict() for r in ep.skills]
	employee["trainings"] = [r.as_dict() for r in ep.trainings]
```

Then add two keys to the returned dict (do NOT include any legal/contract/quota field):

```python
		"employee": employee,
		"leave": _leave_balance(user),
```

- [ ] **Step 4: Add the self-write endpoint** (anywhere after `_leave_balance`). Explicit named params + allowlist guard; child tables set with explicit subfields (mirror mobile.py:1745-1755). Never `doc.update(payload)`.

```python
@frappe.whitelist()
def update_my_profile(
	phone=None, birthdate=None, bio=None,
	home_address=None, emergency_contact_name=None,
	emergency_contact_phone=None, emergency_contact_relation=None,
	education=None, skills=None, trainings=None,
):
	"""Self-service: caller edits ONLY their own soft fields. Legal/contract/quota unreachable here."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)

	# Native User fields (reused, not duplicated).
	user_updates = {}
	if phone is not None:
		user_updates["phone"] = phone
	if birthdate is not None:
		user_updates["birth_date"] = birthdate or None
	if bio is not None:
		user_updates["bio"] = bio
	if user_updates:
		frappe.db.set_value("User", user, user_updates)

	doc = _ensure_employee_profile(user)
	for f in ("home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation"):
		val = locals().get(f)
		if val is not None:
			doc.set(f, val)

	def _rows(raw):
		return json.loads(raw) if isinstance(raw, str) else (raw or [])

	if education is not None:
		doc.set("education", [])
		for r in _rows(education):
			doc.append("education", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["education"]})
	if skills is not None:
		doc.set("skills", [])
		for r in _rows(skills):
			doc.append("skills", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["skills"]})
	if trainings is not None:
		doc.set("trainings", [])
		for r in _rows(trainings):
			doc.append("trainings", {k: r.get(k) for k in EMPLOYEE_SOFT_CHILDREN["trainings"]})

	doc.save(ignore_permissions=True)
	return {"status": "ok"}
```

- [ ] **Step 5: Add the admin read + write endpoints** — both `_require_system_manager()`-gated on the first line:

```python
@frappe.whitelist()
def get_employee_profile(user):
	"""Admin: full profile incl. legal/contract/quota for any user."""
	_require_system_manager()
	ep = _ensure_employee_profile(user)
	uf = frappe.get_value("User", user, ["full_name", "phone", "birth_date", "bio"], as_dict=True) or {}
	data = ep.as_dict()
	data["full_name"] = uf.get("full_name")
	data["phone"] = uf.get("phone")
	data["birthdate"] = uf.get("birth_date")
	data["bio"] = uf.get("bio")
	data["leave"] = _leave_balance(user)
	return data


@frappe.whitelist()
def update_employee_profile(
	user, nik_ktp=None, npwp=None, bpjs_kesehatan=None, bpjs_ketenagakerjaan=None,
	bank_name=None, bank_account_no=None, bank_account_holder=None,
	employment_status=None, job_title=None, date_joined=None,
	contract_start=None, contract_end=None, annual_leave_quota=None,
):
	"""Admin: edit legal/contract/quota fields for any user."""
	_require_system_manager()
	doc = _ensure_employee_profile(user)
	fields = (
		"nik_ktp", "npwp", "bpjs_kesehatan", "bpjs_ketenagakerjaan",
		"bank_name", "bank_account_no", "bank_account_holder",
		"employment_status", "job_title", "date_joined", "contract_start", "contract_end",
	)
	for f in fields:
		val = locals().get(f)
		if val is not None:
			doc.set(f, val)
	if annual_leave_quota is not None:
		doc.annual_leave_quota = int(annual_leave_quota or 0)
	doc.save(ignore_permissions=True)
	return {"status": "ok"}
```

> Attachments (`attach_ktp/npwp/contract`, cert) upload via Frappe's standard `/api/method/upload_file` from the web form (native, private) and are not set through this endpoint — the file URL is written by the upload, or add explicit params later if the web form posts them.

- [ ] **Step 6: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('vernon_project/api/mobile.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 7: Restart + smoke the self-write allowlist** (a raw legal field in the payload must NOT persist)

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api.mobile import update_my_profile
u = frappe.get_all("User", filters={"enabled":1,"name":["not in",["Administrator","Guest"]]}, pluck="name")[0]
frappe.set_user(u)
frappe.local.form_dict = frappe._dict()  # ensure clean
update_my_profile(home_address="Jl. Test 1")
frappe.set_user("Administrator")
ep = frappe.get_doc("Employee Profile", {"user": u})
print("home_address set:", ep.home_address)   # Jl. Test 1
print("nik untouched:", ep.nik_ktp)           # None/empty (not writable via self path)
PY
```
Expected: `home_address set: Jl. Test 1`; `nik untouched:` empty.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(hr): mobile API — self-edit soft fields, admin edit all, leave balance"
```

---

### Task 10: Shared API client + types

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Consumes: the four backend endpoints (Task 9).
- Produces: `mobileApi.updateMyProfile`, `mobileApi.getEmployeeProfile`, `mobileApi.updateEmployeeProfile`; `EmployeeProfile` + `LeaveBalance` types; a `useEmployeeProfile`-style hook (or extend the existing bootstrap hook).

> These are additive edits to SHARED files. Read each file first to match its exact export style (the codebase's `mobileApi` object shape and `types.ts` conventions). Do not restructure.

- [ ] **Step 1: Add types** to `frontend/src/lib/types.ts`:

```ts
export type EmployeeChildEducation = { level?: string; institution?: string; major?: string; year?: number };
export type EmployeeChildSkill = { skill: string; proficiency?: string };
export type EmployeeChildTraining = { title: string; provider?: string; training_date?: string; certificate?: string; expiry_date?: string };

export type EmployeeSoft = {
  phone?: string; birthdate?: string; bio?: string;
  home_address?: string;
  emergency_contact_name?: string; emergency_contact_phone?: string; emergency_contact_relation?: string;
  education?: EmployeeChildEducation[]; skills?: EmployeeChildSkill[]; trainings?: EmployeeChildTraining[];
};

export type LeaveBalance = { quota: number; used: number; remaining: number };

// Admin view adds the sensitive fields:
export type EmployeeProfileAdmin = EmployeeSoft & {
  full_name?: string;
  nik_ktp?: string; npwp?: string; bpjs_kesehatan?: string; bpjs_ketenagakerjaan?: string;
  bank_name?: string; bank_account_no?: string; bank_account_holder?: string;
  employment_status?: string; job_title?: string; date_joined?: string;
  contract_start?: string; contract_end?: string; annual_leave_quota?: number;
  leave?: LeaveBalance;
};
```

- [ ] **Step 2: Add API methods** to the `mobileApi` object in `frontend/src/lib/api.ts` (match the existing call helper — likely a `call(method, args)` wrapper):

```ts
  updateMyProfile: (payload: Partial<EmployeeSoft>) =>
    call('vernon_project.api.mobile.update_my_profile', {
      ...payload,
      education: JSON.stringify(payload.education ?? []),
      skills: JSON.stringify(payload.skills ?? []),
      trainings: JSON.stringify(payload.trainings ?? []),
    }),
  getEmployeeProfile: (user: string) =>
    call('vernon_project.api.mobile.get_employee_profile', { user }),
  updateEmployeeProfile: (user: string, payload: Record<string, unknown>) =>
    call('vernon_project.api.mobile.update_employee_profile', { user, ...payload }),
```

(Import the new types at the top of `api.ts` if that file references types directly.)

- [ ] **Step 3: Surface `employee` + `leave` from bootstrap** in `frontend/src/hooks/useData.ts` — the bootstrap hook already fetches `bootstrap()`; expose the new `employee` and `leave` keys through its return type (they arrive automatically in the response; just widen the type / pass-through). Add a mutation helper if the hook layer wraps mutations:

```ts
// in the bootstrap/me hook return, the response now includes `employee` and `leave`.
// Add a save helper:
const saveMyProfile = async (payload: Partial<EmployeeSoft>) => {
  await mobileApi.updateMyProfile(payload);
  await refetchBootstrap(); // reuse whatever the hook uses to refresh
};
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors in the edited files. (Pre-existing errors elsewhere are out of scope — confirm none are in `types.ts`/`api.ts`/`useData.ts`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(hr): shared API client + types for employee profile"
```

---

### Task 11: `/m` self-profile edit + leave chip

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

**Interfaces:**
- Consumes: bootstrap `employee` + `leave` (Task 10), `mobileApi.updateMyProfile` / `saveMyProfile`.

> `Profile.tsx` is ~20KB. **Read it first** and follow its existing Soft-Pop patterns (paper-* tokens, lucide icons, existing form controls) — memory `vernon-mobile-softpop-design`. Add a self-contained "My Info" section; do not restructure the file.

- [ ] **Step 1: Read `Profile.tsx`** to find where sections render and which form primitives/save pattern it uses.

Run: `sed -n '1,60p' frontend/src/pages/Profile.tsx` (then scan for the section list / existing edit controls).

- [ ] **Step 2: Add an editable "My Info" section** rendering, from bootstrap `employee`:
  - text inputs: `phone`, `birthdate` (native `<input type="date">`), `bio`, `home_address`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relation`.
  - editable lists for `skills` (skill + proficiency select), `education`, `trainings` (with native private file upload for certificate — use the app's existing upload helper if present; otherwise skip cert upload in v1 and note it).
  - a read-only leave chip: `{leave.remaining} / {leave.quota} days left` (`leave.used` in a tooltip/subtext).
  - Save button → `saveMyProfile(payload)`; on error show the app's dialog/toast (NOT native alert — memory `vernon-no-alert-use-dialog`).

Follow the existing control markup exactly. Keep legal/contract/quota fields OUT of this screen.

- [ ] **Step 3: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Profile.tsx
git commit -m "feat(hr): /m self-profile edit (soft fields) + leave balance chip"
```

---

### Task 12: `/w` admin employee editor

**Files:**
- Modify: `frontend-web/src/pages/UserForm.tsx`

**Interfaces:**
- Consumes: `mobileApi.getEmployeeProfile(user)`, `mobileApi.updateEmployeeProfile(user, payload)` (Task 10).

> `UserForm.tsx` is ~13KB and already the admin user editor (gated by `canManageUsers`). **Read it first**; follow its flat-Notion patterns (memory `vernon-web-layout-convention`). Add field groups; reuse its existing save/section scaffolding.

- [ ] **Step 1: Read `UserForm.tsx`** to find its load (on mount) and save handlers and the gating check.

Run: `sed -n '1,60p' frontend-web/src/pages/UserForm.tsx`

- [ ] **Step 2: On form load**, also `getEmployeeProfile(user)` and populate three new field groups:
  - **Legal/ID:** `nik_ktp`, `npwp`, `bpjs_kesehatan`, `bpjs_ketenagakerjaan`, `bank_name`, `bank_account_no`, `bank_account_holder`, + private Attach uploads for `attach_ktp`, `attach_npwp` (use Frappe `/api/method/upload_file` with `is_private=1`; if the app has an existing upload helper, reuse it).
  - **Contract:** `employment_status` (select), `job_title`, `date_joined`, `contract_start`, `contract_end`, + `attach_contract` upload.
  - **Leave:** `annual_leave_quota` (number) + read-only `leave.remaining / leave.quota` display.

- [ ] **Step 3: On save**, call `updateEmployeeProfile(user, { ...legal, ...contract, annual_leave_quota })` alongside the existing user save. Show success/error via the app dialog (not native alert).

- [ ] **Step 4: Type-check + build**

Run: `cd frontend-web && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/UserForm.tsx
git commit -m "feat(hr): /w admin editor for legal/contract/leave-quota fields"
```

---

### Task 13 (Phase 3 verification): End-to-end smoke

**Files:** none.

- [ ] **Step 1: Rebuild both bundles** (if not already built in Tasks 11/12)

Run: `cd frontend && npm run build && cd ../frontend-web && npm run build`
Expected: both succeed.

- [ ] **Step 2: Manual check on `project.vernon.id`** (browser):
  - `/m` → Profile → edit phone/address/skill → save → reload → persists; leave chip shows `remaining / quota`.
  - `/w` → Users → open a user → edit NIK + quota → save → reload → persists; a non-admin `/m` session cannot see NIK.
  - Request a Leave over the user's quota → approval is blocked with the quota message; a System Manager can still override.

- [ ] **Step 3: Confirm attachment privacy** — upload a KTP scan, copy its `/private/files/...` URL, open it while logged out → access denied (not served). If it serves publicly, the Attach field's `is_private` didn't apply — fix the upload call to pass `is_private=1`.

---

## Self-Review (against the spec)

**Spec coverage:** background → `bio`/`education` (Tasks 2,9,11) ✓; legal/ID + attachments → Task 2 legal fields + private Attach (Tasks 2,12) ✓; birthdate → reused `User.birth_date` (Tasks 9,11) ✓; expertise → `skills` child (Tasks 1,11) ✓; training → `trainings` child (Tasks 1,11) ✓; leave quota → Settings default + `annual_leave_quota` + `validate()` gate (Tasks 4,7,8) ✓; contract → contract fields (Tasks 2,12) ✓. Permissions two-layer (permlevel + record-level + API allowlist) → Tasks 2,3,9 ✓. Provisioning + backfill → Tasks 3,5 ✓. All hardening fixes folded: roles = System Manager/All only (Global Constraints, Task 2); `date_diff` avoided (used `date_diff`-free `working_days`); private attachments (Tasks 1,2); admin read gated (Task 9 Step 5); year-split + Pending+Approved + admin bypass + missing-profile→default (Tasks 7,8); validate() covers Desk edits (Task 8). ✓

**Placeholder scan:** Backend Tasks 1–9 contain complete code. Frontend Tasks 11–12 intentionally specify contract + field list + pattern-to-mirror rather than reproducing 20KB screens verbatim (the target files must be read and matched); each has exact endpoints, field names, verification commands. No `TBD`/`handle edge cases`/`add validation` left abstract.

**Type consistency:** endpoint names match across Task 9 (Python) ↔ Task 10 (`updateMyProfile`/`getEmployeeProfile`/`updateEmployeeProfile`); child subfield names match Task 1 JSON ↔ Task 9 `EMPLOYEE_SOFT_CHILDREN` ↔ Task 10 types; `annual_leave_quota`, `leave.{quota,used,remaining}` consistent Tasks 4/7/8/9/10.
