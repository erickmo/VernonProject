# Cuti Categories with Per-Category Limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single generic "Leave" quota with admin-customizable leave categories (Leave Type), each carrying its own statutory limit, gender gate, and proof rule, hard-blocked at request time.

**Architecture:** New `Leave Type` doctype holds each category's rule. `Attendance Exception` gains `leave_type` + `proof`. `leave_quota.py` generalizes per-type (annual working-day quota / per-event calendar cap / documented). Both frontends get a category picker on the request form and an in-app admin CRUD screen. A patch seeds 12 statutory defaults and backfills legacy rows to Cuti Tahunan.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), React + TypeScript (two Vite frontends: `frontend/`=mobile /m, `frontend-web/`=web /w), Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-16-cuti-categories-design.md`

## Global Constraints

- Two frontends: `frontend/` (mobile /m, alias `@`=frontend/src) and `frontend-web/` (web /w, alias `@web`=frontend-web/src, `@`=shared frontend/src). Shared hooks/types live in `frontend/src` and are imported by both.
- No native `<select>` anywhere — use `SearchableSelect` (single) / `MultiSelectSearch` (multi); `onChange` receives the **value**, not an event.
- /w date fields use `@web/components/DatePicker`; /m keeps native `<input type="date">` (existing RequestException pattern).
- Never `alert`/`confirm`/`prompt` — use the app's dialog/toast.
- After adding a DocType or whitelisted endpoint: `python3 scripts/gen_docs.py`, commit `docs/assets/data.js`. Generator exits non-zero if the new doctype is missing from `CLUSTERS` (scripts/gen_docs.py:33).
- Live site `project.vernon.id`, **no test DB**. Backend correctness is checked by the pure `python leave_quota.py` self-check; everything else by `tsc`/build + live endpoint calls after deploy. Do NOT scaffold a test DB.
- All user-facing copy and enforcement messages in **Bahasa Indonesia**.
- Deploy: `bench --site project.vernon.id migrate` (schema/patch), `sudo /usr/local/bin/tj-restart` (Python), `npm run build` in each frontend. Purge Cloudflare + bump SW asset version only if a blank-bundle occurs.
- `git add` only the files you touched (the user commits in parallel on this branch).
- After ship: one `App Release` row (What's New, Bahasa, published=1) — Task 12.
- Backend admin gate for leave-type config = `_is_hr(user)` (System Manager | HR Manager). Picker gate = any logged-in user.

## File Structure

**Create:**
- `vernon_project/vernon_project/doctype/leave_type/leave_type.json` — category doctype
- `vernon_project/vernon_project/doctype/leave_type/leave_type.py` — empty controller
- `vernon_project/vernon_project/doctype/leave_type/__init__.py`
- `vernon_project/patches/v1_0/seed_leave_types.py` — seed 12 + backfill
- `frontend/src/pages/LeaveTypesAdmin.tsx` — mobile admin screen
- `frontend-web/src/pages/LeaveTypesAdmin.tsx` — web admin screen

**Modify:**
- `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json` — +leave_type, +proof
- `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json` — +gender
- `vernon_project/attendance/leave_quota.py` — per-type engine + check_request + self-check
- `vernon_project/api/attendance.py` — request_exception, list_leave_types, admin CRUD, _shape_exception_rows
- `vernon_project/api/mobile.py` — gender in profile get/self-edit; leave summary unchanged
- `vernon_project/patches.txt` — register seed patch
- `scripts/gen_docs.py` — add "Leave Type" to CLUSTERS
- `docs/assets/data.js` — regenerated
- `frontend/src/lib/types.ts` — LeaveType type + request payload
- `frontend/src/lib/api.ts` + `frontend/src/hooks/useData.ts` — hooks
- `frontend/src/pages/RequestException.tsx` + `frontend-web/src/pages/RequestException.tsx` — picker
- `frontend/src/pages/MyExceptions.tsx` + `frontend-web/src/pages/MyExceptions.tsx` — type label
- `frontend/src/pages/Profile.tsx` + web profile — gender field
- `frontend/src/App.tsx` + `frontend-web/src/App.tsx` — admin route
- `frontend/src/hooks/useData.ts` (mobile nav) + `frontend-web/src/lib/nav.ts` — admin nav entry

---

### Task 1: `Leave Type` doctype + gen_docs registration

**Files:**
- Create: `vernon_project/vernon_project/doctype/leave_type/leave_type.json`
- Create: `vernon_project/vernon_project/doctype/leave_type/leave_type.py`
- Create: `vernon_project/vernon_project/doctype/leave_type/__init__.py`
- Modify: `scripts/gen_docs.py:51` area (CLUSTERS attendance cluster members)
- Modify: `docs/assets/data.js` (regenerated)

**Interfaces:**
- Produces: doctype `Leave Type` with fields `leave_name, enabled, limit_kind, day_limit, gender, requires_proof, paid, is_default_annual, description, sort_order`.

- [ ] **Step 1: Create the controller and init**

`leave_type.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LeaveType(Document):
	pass
```
`__init__.py`: empty file.

- [ ] **Step 2: Create the doctype JSON**

`leave_type.json`:
```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:leave_name",
 "creation": "2026-07-16 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["leave_name", "enabled", "limit_kind", "day_limit", "gender", "requires_proof", "paid", "is_default_annual", "description", "sort_order"],
 "fields": [
  {"fieldname": "leave_name", "fieldtype": "Data", "label": "Leave Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "enabled", "fieldtype": "Check", "label": "Enabled", "default": "1", "in_list_view": 1},
  {"fieldname": "limit_kind", "fieldtype": "Select", "label": "Limit Kind", "options": "Annual Quota\nPer Event\nDocumented", "reqd": 1, "default": "Per Event", "in_list_view": 1},
  {"fieldname": "day_limit", "fieldtype": "Int", "label": "Day Limit", "description": "Annual: days/year. Per Event: max calendar days per request. Documented: ignored."},
  {"fieldname": "gender", "fieldtype": "Select", "label": "Gender", "options": "Any\nMale\nFemale", "default": "Any"},
  {"fieldname": "requires_proof", "fieldtype": "Check", "label": "Requires Proof", "default": "0"},
  {"fieldname": "paid", "fieldtype": "Check", "label": "Paid", "default": "1"},
  {"fieldname": "is_default_annual", "fieldtype": "Check", "label": "Is Default Annual", "default": "0", "description": "The one type wired to the per-employee annual_leave_quota. At most one."},
  {"fieldname": "description", "fieldtype": "Small Text", "label": "Description"},
  {"fieldname": "sort_order", "fieldtype": "Int", "label": "Sort Order"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-16 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Leave Type",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "HR Manager", "create": 1, "delete": 1, "read": 1, "report": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "sort_order",
 "sort_order": "ASC",
 "states": [],
 "track_changes": 1
}
```

- [ ] **Step 3: Register in gen_docs CLUSTERS**

In `scripts/gen_docs.py`, find the attendance cluster members list (near line 51, the tuple containing `"Attendance Exception", "Attendance Exception Approver", "Attendance Holiday"`) and add `"Leave Type"` to that same members list.

- [ ] **Step 4: Migrate + regenerate docs + verify**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
cd apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```
Expected: migrate creates `Leave Type`; gen_docs exits 0 (no "tidak ada di CLUSTERS" error); data.js shows doctype count bumped.

- [ ] **Step 5: Commit**
```bash
git add vernon_project/vernon_project/doctype/leave_type scripts/gen_docs.py docs/assets/data.js
git commit -m "feat(cuti): add Leave Type doctype"
```

---

### Task 2: Schema fields on Attendance Exception + Employee Profile

**Files:**
- Modify: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json`
- Modify: `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json`

**Interfaces:**
- Produces: `Attendance Exception.leave_type` (Link→Leave Type), `.proof` (Attach); `Employee Profile.gender` (Select Male/Female).

- [ ] **Step 1: Add fields to Attendance Exception**

In `attendance_exception.json`, add to `field_order` after `"exception_type"`: `"leave_type"`, and after `"reason"`: `"proof"`. Add these field dicts to `fields`:
```json
{"fieldname": "leave_type", "fieldtype": "Link", "label": "Leave Type", "options": "Leave Type", "in_list_view": 1},
{"fieldname": "proof", "fieldtype": "Attach", "label": "Proof"}
```

- [ ] **Step 2: Add gender to Employee Profile**

In `employee_profile.json`, add `"gender"` to `field_order` right after `"personal_section"` (so it sits in the personal block). Add to `fields`:
```json
{"fieldname": "gender", "fieldtype": "Select", "label": "Gender", "options": "\nMale\nFemale"}
```
(Leading blank option = allowed-unset.)

- [ ] **Step 3: Migrate + verify**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'EOF'
import frappe
print("leave_type" in frappe.get_meta("Attendance Exception").get_valid_columns())
print("gender" in frappe.get_meta("Employee Profile").get_valid_columns())
EOF
```
Expected: both `True`.

- [ ] **Step 4: Commit**
```bash
git add vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json vernon_project/vernon_project/doctype/employee_profile/employee_profile.json
git commit -m "feat(cuti): add leave_type/proof to Attendance Exception, gender to Employee Profile"
```

---

### Task 3: Engine — `leave_quota.py` per-type + `check_request`

**Files:**
- Modify: `vernon_project/attendance/leave_quota.py`

**Interfaces:**
- Consumes: existing `year_slices`, `working_days`, `effective_quota`, `prior_taken`.
- Produces:
  - `used_days(employee, year, exclude=None, leave_type=None) -> int` (adds `leave_type` filter; None = the default-annual type name, resolved internally).
  - `calendar_days(from_date, to_date) -> int`
  - `default_annual_type() -> str | None`
  - `check_request(employee, leave_type_name, from_date, to_date, has_proof) -> None` (raises `frappe.ValidationError` on violation).

- [ ] **Step 1: Extend the pure self-check (failing first)**

At the bottom `if __name__ == "__main__":` block, add before the print:
```python
	# calendar_days is pure — inclusive span.
	assert calendar_days("2026-03-01", "2026-03-03") == 3
	assert calendar_days("2026-03-01", "2026-03-01") == 1
	assert calendar_days("2026-12-31", "2027-01-02") == 3
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/vernon_project/attendance && python3 leave_quota.py`
Expected: `NameError: name 'calendar_days' is not defined`.

- [ ] **Step 3: Add `calendar_days` (pure)**

After `year_slices`:
```python
def calendar_days(from_date, to_date):
	"""Inclusive calendar-day span. Pure. Per-event statutory limits count calendar days."""
	def _d(v):
		return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
	return (_d(to_date) - _d(from_date)).days + 1
```

- [ ] **Step 4: Run self-check — verify it passes**

Run: `python3 leave_quota.py`
Expected: `leave_quota self-check OK`.

- [ ] **Step 5: Add `leave_type` filter to `used_days` + `default_annual_type`**

Replace `used_days` and add the resolver:
```python
def default_annual_type():
	"""Name of the Leave Type flagged is_default_annual (the annual pool). None if unseeded."""
	import frappe
	return frappe.db.get_value("Leave Type", {"is_default_annual": 1, "enabled": 1}, "name")


def used_days(employee, year, exclude=None, leave_type=None):
	"""Working-days of this employee's Leave exceptions (Approved OR Pending) in `year`
	for the given leave_type (defaults to the annual pool)."""
	import frappe

	lt = leave_type or default_annual_type()
	ys, ye = f"{year}-01-01", f"{year}-12-31"
	filters = {
		"employee": employee,
		"exception_type": "Leave",
		"leave_type": lt,
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
```
Note: `used_including_prior` (used by the summary) calls `used_days(employee, year)` with no leave_type → resolves to the annual pool, preserving today's behavior.

- [ ] **Step 6: Add `check_request`**

Append:
```python
_GENDER_LABEL = {"Male": "laki-laki", "Female": "perempuan"}


def check_request(employee, leave_type_name, from_date, to_date, has_proof):
	"""Raise frappe.ValidationError (Bahasa) if this leave request violates its type's
	gender / proof / limit rules. Silent if OK. Authoritative — called by request_exception."""
	import frappe
	from frappe import _
	from frappe.utils import getdate, nowdate

	t = frappe.db.get_value(
		"Leave Type",
		{"name": leave_type_name, "enabled": 1},
		["name", "leave_name", "limit_kind", "day_limit", "gender", "requires_proof", "is_default_annual"],
		as_dict=True,
	)
	if not t:
		frappe.throw(_("Pilih kategori cuti."))

	# 1. Gender
	if t.gender and t.gender != "Any":
		emp_gender = frappe.db.get_value("Employee Profile", {"user": employee}, "gender")
		if not emp_gender:
			frappe.throw(_("Lengkapi jenis kelamin di profil Anda untuk mengajukan {0}.").format(t.leave_name))
		if emp_gender != t.gender:
			frappe.throw(_("{0} hanya untuk karyawan {1}.").format(t.leave_name, _GENDER_LABEL.get(t.gender, t.gender)))

	# 2. Proof
	if t.requires_proof and not has_proof:
		frappe.throw(_("{0} wajib melampirkan lampiran pendukung.").format(t.leave_name))

	# 3. Limit by kind
	if t.limit_kind == "Documented":
		return
	if t.limit_kind == "Per Event":
		span = calendar_days(from_date, to_date)
		if t.day_limit and span > t.day_limit:
			frappe.throw(_("{0} maksimal {1} hari per pengajuan.").format(t.leave_name, t.day_limit))
		return
	# Annual Quota
	requested = 0
	for (y, s, e) in year_slices(from_date, to_date):
		requested += working_days(employee, s, e)
	# Ceiling: default-annual type honours the per-employee override + prior balance.
	year = getdate(from_date).year
	if t.is_default_annual:
		ceiling = effective_quota(employee)
		used = used_days(employee, year, leave_type=t.name)
		if year == getdate(nowdate()).year:
			ceiling += 0  # prior_taken is added to `used`, not ceiling
			used += prior_taken(employee)
	else:
		ceiling = int(t.day_limit or 0)
		used = used_days(employee, year, leave_type=t.name)
	if used + requested > ceiling:
		remaining = max(ceiling - used, 0)
		frappe.throw(_("Sisa {0} Anda {1} hari, tidak cukup untuk {2} hari.").format(t.leave_name, remaining, requested))
```
Note on cross-year annual requests: only the `from_date` year's ceiling is checked here (matches today's single-year quota model; a Dec→Jan annual leave is rare and the existing code never enforced multi-year either). `ponytail: single-year check, extend to per-slice if cross-year annual leave becomes common.`

- [ ] **Step 7: Run the pure self-check again**

Run: `python3 leave_quota.py`
Expected: `leave_quota self-check OK` (the frappe-importing functions aren't exercised by the pure check — unchanged).

- [ ] **Step 8: Commit**
```bash
git add vernon_project/attendance/leave_quota.py
git commit -m "feat(cuti): per-type leave engine with check_request"
```

---

### Task 4: Seed + backfill patch

**Files:**
- Create: `vernon_project/patches/v1_0/seed_leave_types.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Consumes: `Leave Type` doctype (Task 1), `Attendance Exception.leave_type` (Task 2).
- Produces: 12 seeded Leave Types; legacy Leave rows backfilled to "Cuti Tahunan".

- [ ] **Step 1: Write the patch**

`seed_leave_types.py`:
```python
# Seed the 12 statutory Indonesian leave categories and backfill legacy rows.
# Idempotent: get_or_create by leave_name. Sources: UU 13/2003 (Pasal 79(3),
# 81, 82, 93(4)) as amended by UU Cipta Kerja, and UU 4/2024 (KIA, maternity).
import frappe

# (leave_name, limit_kind, day_limit, gender, requires_proof, is_default_annual, sort_order)
# Maternity seeded at the 6-month ceiling (180), not the 3-month floor, so a
# proof-backed extension under UU 4/2024 is not hard-blocked. Admin may lower to 90.
SEEDS = [
	("Cuti Tahunan",               "Annual Quota", 12,  "Any",    0, 1, 10),
	("Cuti Sakit",                 "Documented",   0,   "Any",    1, 0, 20),
	("Cuti Melahirkan",            "Per Event",    180, "Female", 0, 0, 30),
	("Cuti Keguguran",             "Per Event",    45,  "Female", 1, 0, 40),
	("Cuti Haid",                  "Per Event",    2,   "Female", 0, 0, 50),
	("Cuti Menikah",               "Per Event",    3,   "Any",    0, 0, 60),
	("Cuti Menikahkan Anak",       "Per Event",    2,   "Any",    0, 0, 70),
	("Cuti Khitan Anak",           "Per Event",    2,   "Any",    0, 0, 80),
	("Cuti Baptis Anak",           "Per Event",    2,   "Any",    0, 0, 90),
	("Cuti Pendamping",            "Per Event",    2,   "Male",   0, 0, 100),
	("Cuti Duka (Keluarga Inti)",  "Per Event",    2,   "Any",    0, 0, 110),
	("Cuti Duka (Serumah)",        "Per Event",    1,   "Any",    0, 0, 120),
]


def execute():
	for name, kind, limit, gender, proof, default_annual, order in SEEDS:
		if frappe.db.exists("Leave Type", name):
			continue
		frappe.get_doc({
			"doctype": "Leave Type",
			"leave_name": name,
			"enabled": 1,
			"limit_kind": kind,
			"day_limit": limit,
			"gender": gender,
			"requires_proof": proof,
			"paid": 1,
			"is_default_annual": default_annual,
			"sort_order": order,
		}).insert(ignore_permissions=True)

	# Backfill: legacy Leave rows had no category -> the historical single pool.
	frappe.db.sql(
		"""UPDATE `tabAttendance Exception`
		   SET leave_type = 'Cuti Tahunan'
		   WHERE exception_type = 'Leave' AND (leave_type IS NULL OR leave_type = '')"""
	)
	frappe.db.commit()
```

- [ ] **Step 2: Register in patches.txt**

Append to `vernon_project/patches.txt` (after the last line `...backfill_exception_hr_decision`):
```
vernon_project.patches.v1_0.seed_leave_types
```

- [ ] **Step 3: Run + verify**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'EOF'
import frappe
print("types:", frappe.db.count("Leave Type"))
print("default:", frappe.db.get_value("Leave Type", {"is_default_annual": 1}, "name"))
print("legacy null:", frappe.db.count("Attendance Exception", {"exception_type": "Leave", "leave_type": ["in", [None, ""]]}))
EOF
```
Expected: `types: 12`, `default: Cuti Tahunan`, `legacy null: 0`.

- [ ] **Step 4: Commit**
```bash
git add vernon_project/patches/v1_0/seed_leave_types.py vernon_project/patches.txt
git commit -m "feat(cuti): seed 12 statutory leave types + backfill legacy rows"
```

---

### Task 5: API — request, list, row shaping

**Files:**
- Modify: `vernon_project/api/attendance.py:267-295` (request_exception), `:344-369` (_shape_exception_rows)

**Interfaces:**
- Consumes: `check_request` (Task 3).
- Produces:
  - `request_exception(from_date, to_date, exception_type, reason=None, leave_type=None, proof=None)`
  - `list_leave_types()` → list of enabled type dicts
  - `_shape_exception_rows` rows include `leave_type`

- [ ] **Step 1: Rewrite `request_exception`**

Replace the function body (keep the decorator + signature line updated):
```python
@frappe.whitelist()
def request_exception(from_date, to_date, exception_type, reason=None, leave_type=None, proof=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if exception_type not in ("WFH", "Leave"):
		return {"status": "error", "message": _("Invalid type.")}
	if getdate(to_date) < getdate(from_date):
		return {"status": "error", "message": _("To Date cannot be before From Date.")}
	if exception_type == "Leave":
		if not leave_type:
			return {"status": "error", "message": _("Pilih kategori cuti.")}
		# Authoritative gate — raises frappe.ValidationError (Bahasa) on violation.
		from vernon_project.attendance.leave_quota import check_request
		check_request(user, leave_type, from_date, to_date, has_proof=bool(proof))
	else:
		leave_type = None
		proof = None
	leaders = _leaders_for_employee(user)
	approvers = [{"approver": leader, "decision": "Pending"} for leader in leaders]
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"leave_type": leave_type,
		"proof": proof,
		"reason": reason,
		"status": "Pending",
		"hr_decision": "Pending",
		"approvers": approvers,
	}).insert(ignore_permissions=True)
	if leaders:
		_notify_leaders_new_request(doc, leaders)
	_notify_hr_new_request(doc)
	return {"status": "ok", "name": doc.name, "approval_status": "Pending"}
```

- [ ] **Step 2: Add `list_leave_types`**

Add near `my_leaders`. Filters by the caller's gender server-side (authoritative — the backend knows the user's gender), so the frontend picker renders the returned list directly with no client-side gender logic. A gender-gated type is hidden until the user sets their gender; `check_request` still blocks any mismatch defensively.
```python
@frappe.whitelist()
def list_leave_types():
	"""Enabled leave categories the caller may pick, filtered by their gender."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	emp_gender = frappe.db.get_value("Employee Profile", {"user": user}, "gender")
	rows = frappe.get_all(
		"Leave Type",
		filters={"enabled": 1},
		fields=["name", "leave_name", "limit_kind", "day_limit", "gender",
		        "requires_proof", "paid", "is_default_annual", "description", "sort_order"],
		order_by="sort_order asc",
	)
	# Keep Any + the caller's own gender; drop the other gender's types.
	rows = [r for r in rows if r.gender == "Any" or (emp_gender and r.gender == emp_gender)]
	return {"status": "ok", "types": rows}
```

- [ ] **Step 3: Add `leave_type` to `_shape_exception_rows`**

In `_shape_exception_rows`, add `"leave_type"` to the `fields=[...]` list of the `frappe.get_all("Attendance Exception", ...)` call.

- [ ] **Step 4: Verify via console (NO restart — console loads current code in a one-off process; live workers stay on old code until the gated Task 12 deploy)**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
print(frappe.call("vernon_project.api.attendance.list_leave_types")["types"][0])
EOF
```
Expected: first type dict printed (Cuti Tahunan, Annual Quota). Do NOT run `request_exception` for a *valid* leave here — it inserts a real row and notifies HR; only the blocked-path test in Task 12 is safe (it throws before insert).

- [ ] **Step 5: Commit**
```bash
git add vernon_project/api/attendance.py
git commit -m "feat(cuti): enforce leave_type in request_exception + list_leave_types"
```

---

### Task 6: API — admin CRUD + profile gender

**Files:**
- Modify: `vernon_project/api/attendance.py` (admin CRUD near list_leave_types)
- Modify: `vernon_project/api/mobile.py` (self personal fields ~line 28-31, `update_my_profile` ~5345, `get_my_profile` return)

**Interfaces:**
- Consumes: `_is_hr` (attendance.py), `Leave Type` doctype.
- Produces: `admin_list_leave_types()`, `save_leave_type(...)`, `delete_leave_type(name)`; gender in profile get/self-edit.

- [ ] **Step 1: Add admin CRUD to attendance.py**
```python
_LEAVE_TYPE_FIELDS = ("leave_name", "enabled", "limit_kind", "day_limit", "gender",
                      "requires_proof", "paid", "is_default_annual", "description", "sort_order")


@frappe.whitelist()
def admin_list_leave_types():
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	rows = frappe.get_all("Leave Type", fields=["name", *_LEAVE_TYPE_FIELDS], order_by="sort_order asc")
	return {"status": "ok", "types": rows}


@frappe.whitelist()
def save_leave_type(name=None, **fields):
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if fields.get("limit_kind") and fields["limit_kind"] not in ("Annual Quota", "Per Event", "Documented"):
		frappe.throw(_("Invalid limit kind."))
	if fields.get("gender") and fields["gender"] not in ("Any", "Male", "Female"):
		frappe.throw(_("Invalid gender."))
	doc = frappe.get_doc("Leave Type", name) if name else frappe.new_doc("Leave Type")
	for f in _LEAVE_TYPE_FIELDS:
		if f in fields and fields[f] is not None:
			doc.set(f, fields[f])
	doc.save(ignore_permissions=True)
	# At most one default-annual type — dedupe AFTER save so doc.name is final.
	if int(doc.is_default_annual or 0) == 1:
		frappe.db.sql("UPDATE `tabLeave Type` SET is_default_annual = 0 WHERE name != %s", (doc.name,))
	frappe.db.commit()
	return {"status": "ok", "name": doc.name}


@frappe.whitelist()
def delete_leave_type(name):
	if not _is_hr(frappe.session.user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if frappe.db.get_value("Leave Type", name, "is_default_annual"):
		return {"status": "error", "message": _("Kategori cuti tahunan default tidak dapat dihapus.")}
	if frappe.db.exists("Attendance Exception", {"leave_type": name}):
		return {"status": "error", "message": _("Kategori dipakai pengajuan yang ada; nonaktifkan saja.")}
	frappe.delete_doc("Leave Type", name, ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}
```

- [ ] **Step 2: Add gender to profile self-edit (mobile.py)**

- In the self personal-fields tuple (mobile.py ~line 28-31, the `EMPLOYEE_SELF_*` list containing `home_address`, `religion`, etc.), add `"gender"`.
- In `get_my_profile` (the function returning `data` with `full_name`/`phone`/`birthdate`), the doc `as_dict()` already includes `gender` since it's a profile field — confirm it's returned; if the return whitelists specific fields, add `data["gender"] = ep.gender`.
- In `update_my_profile` (~line 5345): add `gender=None` to the signature and include `"gender"` in the loop that sets personal fields (the `for f in (...)` block near line 5369), or add an explicit `if gender is not None: doc.set("gender", gender)`.

- [ ] **Step 3: Verify via console (NO restart — see Task 5 Step 4)**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
print(frappe.call("vernon_project.api.attendance.admin_list_leave_types")["types"][0]["leave_name"])
EOF
```
Expected: `Cuti Tahunan`.

- [ ] **Step 4: Commit**
```bash
git add vernon_project/api/attendance.py vernon_project/api/mobile.py
git commit -m "feat(cuti): admin CRUD for leave types + gender profile field"
```

---

### Task 7: Shared frontend types + hooks

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces (importable by both apps via `@`):
  - type `LeaveType { name; leave_name; limit_kind: 'Annual Quota'|'Per Event'|'Documented'; day_limit: number; gender: 'Any'|'Male'|'Female'; requires_proof: 0|1; paid: 0|1; is_default_annual: 0|1; description?: string; sort_order: number }`
  - `useLeaveTypes()` → `LeaveType[]`
  - `useAdminLeaveTypes()`, `useSaveLeaveType()`, `useDeleteLeaveType()`
  - `useRequestException()` mutation payload extended with `leave_type?`, `proof?`

- [ ] **Step 1: Add the type**

In `types.ts`:
```typescript
export type LeaveType = {
  name: string
  leave_name: string
  limit_kind: 'Annual Quota' | 'Per Event' | 'Documented'
  day_limit: number
  gender: 'Any' | 'Male' | 'Female'
  requires_proof: 0 | 1
  paid: 0 | 1
  is_default_annual: 0 | 1
  description?: string
  sort_order: number
}
```

Also add `leave_type` to the exception row type so MyExceptions can render it. Find `AttendanceExceptionRow` in `types.ts` and add `leave_type?: string`.

Also add `gender` to the self-editable soft profile type so the profile screen can edit it — find `EmployeeSoft` in `types.ts` (the user recently added `focus_mode?: FocusMode` to it) and add `gender?: 'Male' | 'Female'`.

**CODEBASE PATTERN (authoritative — the plan's earlier `api.call` sketch was wrong):** attendance endpoints are typed methods on the `mobileApi` object in `frontend/src/lib/api.ts` using the `A` prefix (`A = 'vernon_project.api.attendance.'`), e.g. `requestException`/`myLeaders` at api.ts:522/544. Hooks in `useData.ts` call `mobileApi.X(...)`. Follow that — do NOT use `api.call`.

- [ ] **Step 2: Add methods to `mobileApi` (api.ts) + extend `requestException`**

In `frontend/src/lib/api.ts`, in the `mobileApi` object next to `requestException`/`myLeaders`:
```typescript
  listLeaveTypes: () =>
    api.get<{ status: string; types: import('./types').LeaveType[] }>(A + 'list_leave_types'),
  adminListLeaveTypes: () =>
    api.get<{ status: string; types: import('./types').LeaveType[] }>(A + 'admin_list_leave_types'),
  saveLeaveType: (payload: Partial<import('./types').LeaveType> & { name?: string }) =>
    api.post<{ status: string; name?: string; message?: string }>(A + 'save_leave_type', payload),
  deleteLeaveType: (name: string) =>
    api.post<{ status: string; message?: string }>(A + 'delete_leave_type', { name }),
```
And extend the existing `requestException` to carry the two new optional args:
```typescript
  requestException: (from_date: string, to_date: string, exception_type: 'WFH' | 'Leave', reason?: string, leave_type?: string, proof?: string) =>
    api.post<{ status: string; message?: string; name?: string }>(A + 'request_exception', {
      from_date, to_date, exception_type, reason, leave_type, proof,
    }),
```
Also forward `gender` in the existing `updateMyProfile` method (api.ts ~577) so the profile screen can save it — the user just added `focus_mode` there; add `gender` to that same posted payload object.

- [ ] **Step 3: Add hooks + extend `useRequestException` (useData.ts)**

Extend the existing `useRequestException` mutation vars to `{ from_date; to_date; exception_type: 'WFH'|'Leave'; reason?; leave_type?; proof? }` and pass `vars.leave_type, vars.proof` into `mobileApi.requestException(...)`. Add:
```typescript
export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => (await mobileApi.listLeaveTypes()).types,
  })
}

export function useAdminLeaveTypes() {
  return useQuery({
    queryKey: ['admin-leave-types'],
    queryFn: async () => (await mobileApi.adminListLeaveTypes()).types,
  })
}

export function useSaveLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<LeaveType> & { name?: string }) => mobileApi.saveLeaveType(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leave-types'] }); qc.invalidateQueries({ queryKey: ['leave-types'] }) },
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => mobileApi.deleteLeaveType(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leave-types'] }); qc.invalidateQueries({ queryKey: ['leave-types'] }) },
  })
}
```
Import `LeaveType` from `@/lib/types` if `useData.ts` doesn't already. (`useMyProfile` is the current-user profile hook already used by `Profile.tsx` — reuse whatever that file imports; if the hook has a different name, use that.)

- [ ] **Step 4: Typecheck both apps**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd ../frontend-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend/src/lib/api.ts
git commit -m "feat(cuti): shared leave-type types + hooks"
```

---

### Task 8: Mobile request form + MyExceptions label + profile gender

**Files:**
- Modify: `frontend/src/pages/RequestException.tsx`, `frontend/src/pages/MyExceptions.tsx`, `frontend/src/pages/Profile.tsx`

**Interfaces:**
- Consumes: `useLeaveTypes`, extended `useRequestException` (Task 7).

- [ ] **Step 1: Rewrite mobile RequestException with a category picker**

Replace `frontend/src/pages/RequestException.tsx`:
```tsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders, useLeaveTypes } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

export default function RequestException() {
  const navigate = useNavigate()
  const toast = useToast()
  const req = useRequestException()
  const { data: leaders, isLoading: leadersLoading } = useMyLeaders()
  const { data: types } = useLeaveTypes()
  const [type, setType] = useState<'WFH' | 'Leave'>('Leave')
  const [leaveType, setLeaveType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [proof, setProof] = useState('')

  // list_leave_types already filters by the caller's gender server-side.
  const selectable = types || []
  const chosen = selectable.find((t) => t.name === leaveType)

  const hint = useMemo(() => {
    if (!chosen) return ''
    if (chosen.limit_kind === 'Annual Quota') return 'Kuota cuti tahunan Anda berlaku untuk kategori ini.'
    if (chosen.limit_kind === 'Per Event') return `Maksimal ${chosen.day_limit} hari per pengajuan.`
    return chosen.requires_proof ? 'Wajib melampirkan lampiran pendukung.' : 'Tanpa batas hari.'
  }, [chosen])

  const submit = async () => {
    if (!from || !to) return toast('error', 'Pilih kedua tanggal')
    if (type === 'Leave' && !leaveType) return toast('error', 'Pilih kategori cuti')
    if (type === 'Leave' && chosen?.requires_proof && !proof) return toast('error', 'Lampiran wajib diisi')
    try {
      await req.mutateAsync({
        from_date: from, to_date: to, exception_type: type, reason,
        ...(type === 'Leave' ? { leave_type: leaveType, proof } : {}),
      })
      toast('success', 'Pengajuan terkirim')
      navigate('/attendance')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Ajukan Cuti / WFH">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Tipe</label>
          <div className="flex gap-2">
            {(['Leave', 'WFH'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                  type === t ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}>
                {t === 'Leave' ? 'Cuti' : 'WFH'}
              </button>
            ))}
          </div>
        </div>

        {type === 'Leave' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Kategori Cuti</label>
            <div className="flex flex-col gap-1.5">
              {selectable.map((t) => (
                <button key={t.name} onClick={() => setLeaveType(t.name)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    leaveType === t.name ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700'}`}>
                  {t.leave_name}
                </button>
              ))}
            </div>
            {hint && <p className="mt-1.5 text-xs text-brand-700">{hint}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Dari</label>
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Sampai</label>
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {type === 'Leave' && chosen?.requires_proof && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Lampiran (URL/berkas)</label>
            <input className={field} value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Tautan surat dokter, dll." />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Alasan</label>
          <textarea className={field + ' min-h-[90px] resize-y'} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="rounded-2xl border border-paper-edge bg-paper-card p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold text-stone-500">Siapa yang meninjau</p>
          {leadersLoading ? <div className="py-2"><Spinner className="h-4 w-4" /></div>
            : leaders && leaders.length > 0 ? (
              <>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {leaders.map((l) => (
                    <li key={l} className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-slate-200">
                      <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" /> {l}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-stone-400">Leader memberi masukan. HR memberi persetujuan akhir.</p>
              </>
            ) : <p className="mt-1 text-xs text-stone-400">Langsung ke HR.</p>}
        </div>

        <button onClick={submit} disabled={req.isPending}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white active:scale-95 disabled:opacity-50">
          {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Kirim pengajuan
        </button>
      </div>
    </DetailScreen>
  )
}
```
(If `useMyProfile` isn't the exact hook name for the current user's profile, use the one already imported in `Profile.tsx`.)

- [ ] **Step 2: Show the category label in MyExceptions**

In `frontend/src/pages/MyExceptions.tsx`, where each row renders its type (currently "Cuti"/"WFH" from `exception_type`), show `row.leave_type || (row.exception_type === 'Leave' ? 'Cuti' : 'WFH')`. Add `leave_type` to the row type if the file declares one locally.

- [ ] **Step 3: Add a gender field to the mobile profile edit**

The user just added a `focus_mode` self-edit to `frontend/src/pages/Profile.tsx` (Select on Employee Profile, saved via `useSaveMyProfile`/`updateMyProfile`) — **gender is the same kind of field; mirror that pattern exactly.** Read how `focus_mode` is read (current value) and written in Profile.tsx, then add a gender picker (Laki-laki/Perempuan → values `Male`/`Female`) the same way, saving `{ gender }` through the same self-profile mutation. The `EmployeeSoft` type + api.ts `updateMyProfile` payload were already extended in Task 7 — do not re-edit them here.

- [ ] **Step 4: Typecheck only (no build — deploy is Task 12)**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors. **Do NOT run `npm run build`** — it writes into the live-served `public/` and would deploy all current working-tree WIP. The one deploy build happens in Task 12.

- [ ] **Step 5: Commit (source only, never bundles)**
```bash
git add frontend/src/pages/RequestException.tsx frontend/src/pages/MyExceptions.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(cuti): mobile category picker + gender profile field"
```

---

### Task 9: Web request form + MyExceptions label + profile gender

**Files:**
- Modify: `frontend-web/src/pages/RequestException.tsx`, `frontend-web/src/pages/MyExceptions.tsx`, web profile page

**Interfaces:**
- Consumes: `useLeaveTypes`, extended `useRequestException`. Uses `@web/components/DatePicker` and `SearchableSelect`.

- [ ] **Step 1: Rewrite web RequestException with a SearchableSelect category picker**

Replace `frontend-web/src/pages/RequestException.tsx` — same logic as Task 8, but:
- keep the `BentoGrid`/`BentoTile` shell already in the file,
- use `<DatePicker value={from} onChange={setFrom} />` / `<DatePicker value={to} onChange={setTo} min={from || undefined} />` for dates,
- use `SearchableSelect` for the category (import from the web components; `options` = `selectable.map(t => ({ value: t.name, label: t.leave_name }))`, `onChange` receives the value), gated behind `type === 'Leave'`,
- render the same Bahasa `hint` under the picker and the proof input when `chosen?.requires_proof`,
- keep the "Who reviews this" tile.

Full component:
```tsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders, useLeaveTypes } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DatePicker } from '@web/components/DatePicker'
import { SearchableSelect } from '@web/components/SearchableSelect'

export default function RequestException() {
  const navigate = useNavigate()
  const toast = useToast()
  const req = useRequestException()
  const { data: leaders, isLoading: leadersLoading } = useMyLeaders()
  const { data: types } = useLeaveTypes()
  const [type, setType] = useState<'WFH' | 'Leave'>('Leave')
  const [leaveType, setLeaveType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [proof, setProof] = useState('')

  // list_leave_types already filters by the caller's gender server-side.
  const selectable = types || []
  const chosen = selectable.find((t) => t.name === leaveType)
  const hint = useMemo(() => {
    if (!chosen) return ''
    if (chosen.limit_kind === 'Annual Quota') return 'Kuota cuti tahunan Anda berlaku untuk kategori ini.'
    if (chosen.limit_kind === 'Per Event') return `Maksimal ${chosen.day_limit} hari per pengajuan.`
    return chosen.requires_proof ? 'Wajib melampirkan lampiran pendukung.' : 'Tanpa batas hari.'
  }, [chosen])

  const submit = async () => {
    if (!from || !to) return toast('error', 'Pilih kedua tanggal')
    if (type === 'Leave' && !leaveType) return toast('error', 'Pilih kategori cuti')
    if (type === 'Leave' && chosen?.requires_proof && !proof) return toast('error', 'Lampiran wajib diisi')
    try {
      await req.mutateAsync({
        from_date: from, to_date: to, exception_type: type, reason,
        ...(type === 'Leave' ? { leave_type: leaveType, proof } : {}),
      })
      toast('success', 'Pengajuan terkirim')
      navigate('/attendance/my-requests')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Ajukan Cuti / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex max-w-xl flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Tipe</label>
              <div className="flex gap-2">
                {(['Leave', 'WFH'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
                      type === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted'}`}>
                    {t === 'Leave' ? 'Cuti' : 'WFH'}
                  </button>
                ))}
              </div>
            </div>

            {type === 'Leave' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Kategori Cuti</label>
                <SearchableSelect
                  value={leaveType}
                  onChange={setLeaveType}
                  options={selectable.map((t) => ({ value: t.name, label: t.leave_name }))}
                  placeholder="Pilih kategori"
                />
                {hint && <p className="mt-1.5 text-xs text-brand-700">{hint}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Dari</label>
                <DatePicker value={from} onChange={setFrom} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Sampai</label>
                <DatePicker value={to} onChange={setTo} min={from || undefined} />
              </div>
            </div>

            {type === 'Leave' && chosen?.requires_proof && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Lampiran (URL/berkas)</label>
                <input className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink"
                  value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Tautan surat dokter, dll." />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Alasan</label>
              <textarea className="w-full min-h-[90px] resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink"
                value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="rounded-2xl border border-line p-3">
              <p className="text-xs font-semibold text-muted">Siapa yang meninjau</p>
              {leadersLoading ? <div className="py-2"><Spinner className="h-4 w-4" /></div>
                : leaders && leaders.length > 0 ? (
                  <>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {leaders.map((l) => (
                        <li key={l} className="flex items-center gap-1.5 text-sm text-ink">
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted" /> {l}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">Leader memberi masukan. HR memberi persetujuan akhir.</p>
                  </>
                ) : <p className="mt-1 text-xs text-muted">Langsung ke HR.</p>}
            </div>

            <button onClick={submit} disabled={req.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-50">
              {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Kirim pengajuan
            </button>
          </div>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
```
(Confirm the `SearchableSelect` import path + prop names against an existing web page that uses it; adjust `options`/`onChange` to match.)

- [ ] **Step 2: MyExceptions label (web)** — same edit as Task 8 Step 2, in `frontend-web/src/pages/MyExceptions.tsx`.

- [ ] **Step 3: Gender field in the web profile edit** — same as Task 8 Step 3, using web `SearchableSelect`.

- [ ] **Step 4: Typecheck only (no build — deploy is Task 12)**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
```
Expected: no errors. **Do NOT run `npm run build`** (see Task 8 Step 4).

- [ ] **Step 5: Commit (source only, never bundles)**
```bash
git add frontend-web/src/pages/RequestException.tsx frontend-web/src/pages/MyExceptions.tsx frontend-web/src/pages/Profile.tsx
git commit -m "feat(cuti): web category picker + gender profile field"
```

---

### Task 10: Mobile admin screen — Leave Types

**Files:**
- Create: `frontend/src/pages/LeaveTypesAdmin.tsx`
- Modify: `frontend/src/App.tsx` (route), mobile nav (the More/admin menu that gates by `canHrApprove`)

**Interfaces:**
- Consumes: `useAdminLeaveTypes`, `useSaveLeaveType`, `useDeleteLeaveType`, `canHrApprove`.

- [ ] **Step 1: Build the screen**

`frontend/src/pages/LeaveTypesAdmin.tsx`:
```tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Dialog' // use the app's dialog hook; adjust import
import { useAdminLeaveTypes, useSaveLeaveType, useDeleteLeaveType } from '@/hooks/useData'
import type { LeaveType } from '@/lib/types'

const KINDS = ['Annual Quota', 'Per Event', 'Documented'] as const
const GENDERS = ['Any', 'Male', 'Female'] as const
const field = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700'

export default function LeaveTypesAdmin() {
  const { data: types, isLoading } = useAdminLeaveTypes()
  const save = useSaveLeaveType()
  const del = useDeleteLeaveType()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Partial<LeaveType> | null>(null)

  const submit = async () => {
    if (!editing?.leave_name) return toast('error', 'Nama wajib diisi')
    try {
      await save.mutateAsync(editing)
      toast('success', 'Tersimpan'); setEditing(null)
    } catch (e) { toast('error', (e as Error).message) }
  }
  const remove = async (t: LeaveType) => {
    if (!(await confirm(`Hapus ${t.leave_name}?`))) return
    const r: any = await del.mutateAsync(t.name)
    if (r?.message) toast('error', r.message); else toast('success', 'Terhapus')
  }

  if (isLoading) return <DetailScreen title="Kategori Cuti"><Spinner className="h-5 w-5" /></DetailScreen>

  return (
    <DetailScreen title="Kategori Cuti">
      <div className="flex flex-col gap-3">
        <button onClick={() => setEditing({ limit_kind: 'Per Event', gender: 'Any', enabled: 1, paid: 1, day_limit: 0 })}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Tambah kategori
        </button>

        {(types || []).map((t) => (
          <div key={t.name} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <button onClick={() => setEditing(t)} className="text-left">
                <p className="text-sm font-semibold">{t.leave_name} {t.enabled ? '' : '(nonaktif)'}</p>
                <p className="text-xs text-slate-500">
                  {t.limit_kind}{t.limit_kind !== 'Documented' ? ` · ${t.day_limit} hari` : ''}
                  {t.gender !== 'Any' ? ` · ${t.gender}` : ''}{t.requires_proof ? ' · lampiran' : ''}
                </p>
              </button>
              {!t.is_default_annual && (
                <button onClick={() => remove(t)} className="p-1 text-rose-500"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        ))}

        {editing && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3 dark:bg-slate-800">
            <p className="mb-2 text-sm font-semibold">{editing.name ? 'Edit' : 'Kategori baru'}</p>
            <div className="flex flex-col gap-2">
              <input className={field} placeholder="Nama (mis. Cuti Tahunan)" value={editing.leave_name || ''}
                onChange={(e) => setEditing({ ...editing, leave_name: e.target.value })} />
              <div className="flex gap-2">
                {KINDS.map((k) => (
                  <button key={k} onClick={() => setEditing({ ...editing, limit_kind: k })}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${editing.limit_kind === k ? 'border-brand-600 bg-brand-100' : 'border-slate-200'}`}>{k}</button>
                ))}
              </div>
              {editing.limit_kind !== 'Documented' && (
                <input className={field} type="number" placeholder="Batas hari" value={editing.day_limit ?? 0}
                  onChange={(e) => setEditing({ ...editing, day_limit: Number(e.target.value) })} />
              )}
              <div className="flex gap-2">
                {GENDERS.map((g) => (
                  <button key={g} onClick={() => setEditing({ ...editing, gender: g })}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${editing.gender === g ? 'border-brand-600 bg-brand-100' : 'border-slate-200'}`}>{g}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.requires_proof}
                onChange={(e) => setEditing({ ...editing, requires_proof: e.target.checked ? 1 : 0 })} /> Wajib lampiran</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled !== 0}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })} /> Aktif</label>
              <div className="flex gap-2">
                <button onClick={submit} disabled={save.isPending} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white">Simpan</button>
                <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm">Batal</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
```
(Adjust the confirm-dialog import to the app's actual dialog hook — never use native `confirm`.)

- [ ] **Step 2: Add the route**

In `frontend/src/App.tsx`, import `LeaveTypesAdmin` and add a route `<Route path="/attendance/leave-types" element={<LeaveTypesAdmin />} />` alongside the other attendance routes.

- [ ] **Step 3: Add the nav entry (gated by canHrApprove)**

In the mobile admin/More menu builder, add a "Kategori Cuti" entry pointing to `/attendance/leave-types`, shown when `canHrApprove(boot)` — mirror how the HR cuti inbox (`/attendance/exceptions`) entry is gated.

- [ ] **Step 4: Typecheck only + commit (no build)**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
# git add ONLY the files you actually changed (LeaveTypesAdmin.tsx, App.tsx, and the
# mobile nav-menu file you edited). Never `npm run build`, never add public/ bundles.
git add frontend/src/pages/LeaveTypesAdmin.tsx frontend/src/App.tsx <mobile-nav-file-you-edited>
git commit -m "feat(cuti): mobile leave-types admin screen"
```

---

### Task 11: Web admin screen — Leave Types

**Files:**
- Create: `frontend-web/src/pages/LeaveTypesAdmin.tsx`
- Modify: `frontend-web/src/App.tsx` (route), `frontend-web/src/lib/nav.ts` (nav entry)

**Interfaces:**
- Consumes: same hooks as Task 10; web components (`SearchableSelect`, form drawer or inline card), `canHrApprove`.

- [ ] **Step 1: Build the web screen**

`frontend-web/src/pages/LeaveTypesAdmin.tsx` — same data flow as Task 10, rendered in the web idiom (a `DataTable` or card list + an inline edit card or the web form drawer). Use web `SearchableSelect` for `limit_kind` and `gender` (options as `{value,label}`), the app's dialog for delete confirm, and toast for feedback. Reuse the `useAdminLeaveTypes`/`useSaveLeaveType`/`useDeleteLeaveType` hooks. Keep all copy Bahasa. Full skeleton:
```tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@web/components/Dialog' // adjust to the actual web dialog hook
import { SearchableSelect } from '@web/components/SearchableSelect'
import { useAdminLeaveTypes, useSaveLeaveType, useDeleteLeaveType } from '@/hooks/useData'
import type { LeaveType } from '@/lib/types'

const KINDS = [{ value: 'Annual Quota', label: 'Annual Quota' }, { value: 'Per Event', label: 'Per Event' }, { value: 'Documented', label: 'Documented' }]
const GENDERS = [{ value: 'Any', label: 'Any' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]

export default function LeaveTypesAdmin() {
  const { data: types, isLoading } = useAdminLeaveTypes()
  const save = useSaveLeaveType(); const del = useDeleteLeaveType()
  const toast = useToast(); const confirm = useConfirm()
  const [editing, setEditing] = useState<Partial<LeaveType> | null>(null)

  const submit = async () => {
    if (!editing?.leave_name) return toast('error', 'Nama wajib diisi')
    try { await save.mutateAsync(editing); toast('success', 'Tersimpan'); setEditing(null) }
    catch (e) { toast('error', (e as Error).message) }
  }
  const remove = async (t: LeaveType) => {
    if (!(await confirm(`Hapus ${t.leave_name}?`))) return
    const r: any = await del.mutateAsync(t.name)
    if (r?.message) toast('error', r.message); else toast('success', 'Terhapus')
  }

  if (isLoading) return <Spinner className="h-5 w-5" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Kategori Cuti</h1>
        <button onClick={() => setEditing({ limit_kind: 'Per Event', gender: 'Any', enabled: 1, paid: 1, day_limit: 0 })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Tambah</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(types || []).map((t) => (
          <div key={t.name} className="flex items-center justify-between rounded-xl border border-line p-3">
            <button className="text-left" onClick={() => setEditing(t)}>
              <p className="text-sm font-semibold text-ink">{t.leave_name}{t.enabled ? '' : ' (nonaktif)'}</p>
              <p className="text-xs text-muted">{t.limit_kind}{t.limit_kind !== 'Documented' ? ` · ${t.day_limit} hari` : ''}{t.gender !== 'Any' ? ` · ${t.gender}` : ''}{t.requires_proof ? ' · lampiran' : ''}</p>
            </button>
            {!t.is_default_annual && <button onClick={() => remove(t)} className="p-1 text-rose-500"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
      {editing && (
        <div className="max-w-md space-y-2 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold text-ink">{editing.name ? 'Edit' : 'Kategori baru'}</p>
          <input className="w-full rounded-xl border border-line px-3 py-2 text-sm" placeholder="Nama" value={editing.leave_name || ''} onChange={(e) => setEditing({ ...editing, leave_name: e.target.value })} />
          <SearchableSelect value={editing.limit_kind} onChange={(v) => setEditing({ ...editing, limit_kind: v as LeaveType['limit_kind'] })} options={KINDS} />
          {editing.limit_kind !== 'Documented' && (
            <input type="number" className="w-full rounded-xl border border-line px-3 py-2 text-sm" placeholder="Batas hari" value={editing.day_limit ?? 0} onChange={(e) => setEditing({ ...editing, day_limit: Number(e.target.value) })} />
          )}
          <SearchableSelect value={editing.gender} onChange={(v) => setEditing({ ...editing, gender: v as LeaveType['gender'] })} options={GENDERS} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.requires_proof} onChange={(e) => setEditing({ ...editing, requires_proof: e.target.checked ? 1 : 0 })} /> Wajib lampiran</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled !== 0} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })} /> Aktif</label>
          <div className="flex gap-2">
            <button onClick={submit} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white">Simpan</button>
            <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-line py-2 text-sm">Batal</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Route + nav**

- `frontend-web/src/App.tsx`: import + `<Route path="/attendance/leave-types" element={<LeaveTypesAdmin />} />`.
- `frontend-web/src/lib/nav.ts`: in the attendance group, add `{ to: '/attendance/leave-types', label: 'Leave Types', sub: 'Cuti categories & limits', icon: CalendarDays }` inside the `if (canHrApprove(b)) { ... }` block (next to the exceptions inbox `unshift`), so HR sees it.

- [ ] **Step 3: Typecheck only + commit (no build)**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
git add frontend-web/src/pages/LeaveTypesAdmin.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(cuti): web leave-types admin screen"
```
Never `npm run build`; never add `public/` bundles.

---

### Task 12: Deploy, live verification, What's New

**Files:**
- Modify: `vernon_project/public/frontend/version.json`, `vernon_project/public/frontend_web/version.json` (build bumps these), `docs/assets/data.js` (endpoints changed → regen)
- Create: an `App Release` row on the live site

- [ ] **Step 1: Full deploy**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
sudo /usr/local/bin/tj-restart
# frontends already built in Tasks 8-11; if not: build both now.
cd apps/vernon_project && python3 scripts/gen_docs.py   # endpoints added -> regen
git add docs/assets/data.js && git commit -m "docs(cuti): regen docs data for leave-type endpoints" || true
```

- [ ] **Step 2: Live endpoint verification (one blocked request per kind)**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
# picker returns 12
print("types:", len(frappe.call("vernon_project.api.attendance.list_leave_types")["types"]))
# per-event over-limit blocks
try:
    frappe.call("vernon_project.api.attendance.request_exception",
        from_date="2026-08-01", to_date="2026-08-10", exception_type="Leave", leave_type="Cuti Menikah")
    print("PER-EVENT: NOT blocked (BUG)")
except frappe.ValidationError as e:
    print("PER-EVENT blocked OK:", str(e)[:60])
EOF
```
Expected: `types: 12`; `PER-EVENT blocked OK: Cuti Menikah maksimal 3 hari ...`. (Clean up any test row created.)

- [ ] **Step 3: Verify the built bundles actually contain the feature**

Per CLAUDE.md, confirm the shipped bundle (named in `public/frontend{,_web}/index.html`) contains a distinctive new string:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -l "Kategori Cuti" vernon_project/public/frontend/assets/*.js vernon_project/public/frontend_web/assets/*.js
```
Expected: both bundles match. If not, the feature isn't shipped — do not write What's New.

- [ ] **Step 4: Insert the App Release row (What's New, Bahasa)**

Newest existing row's version → bump minor (new feature). Write `/tmp/claude-1000/.../releases.json`:
```json
[{"version": "X.Y.0", "release_date": "2026-07-16", "platform": "Both",
  "title": "Kategori Cuti Sesuai Aturan",
  "notes": "Ajukan cuti per kategori: tahunan, sakit, melahirkan, menikah, duka, dan lainnya\nSetiap kategori punya batas hari sendiri sesuai ketentuan\nBeberapa cuti minta lampiran pendukung (mis. surat dokter)\nCuti khusus perempuan/laki-laki otomatis menyesuaikan profil Anda\nHR bisa mengatur daftar & batas kategori langsung di aplikasi"}]
```
Insert (one self-contained line per CLAUDE.md):
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/72f869de-0f0c-400c-bfac-6f550f3acf19/scratchpad/releases.json"))])
frappe.db.commit()
EOF
```
Then verify: `frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")` returns the new row. (Determine `X.Y.0` by reading the newest existing App Release version first.)

- [ ] **Step 5: Final commit (any remaining tracked changes)**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend/version.json vernon_project/public/frontend_web/version.json
git commit -m "build(cuti): ship leave categories to both frontends" || true
```

---

## Self-Review

**Spec coverage:**
- Leave Type doctype (fields incl. `paid`, `is_default_annual`) → Task 1. ✓
- leave_type/proof on Attendance Exception, gender on Employee Profile → Task 2. ✓
- Per-kind engine (annual working-days / per-event calendar / documented), gender + proof gates, hard block → Task 3. ✓
- Seed 12 statutory + backfill → Task 4. ✓
- request_exception enforcement + list_leave_types + row shaping → Task 5. ✓
- In-app admin CRUD + gender self-edit → Tasks 6, 10, 11. ✓
- Both request forms with picker + inline rule + proof → Tasks 8, 9. ✓
- MyExceptions label → Tasks 8, 9. ✓
- gen_docs + data.js → Tasks 1, 12. ✓
- What's New → Task 12. ✓

**Type consistency:** `LeaveType` fields (Task 7) match doctype fields (Task 1) and `list_leave_types` output (Task 5). `check_request(employee, leave_type_name, from_date, to_date, has_proof)` signature consistent between Task 3 (def) and Task 5 (call). Hook names (`useLeaveTypes`/`useAdminLeaveTypes`/`useSaveLeaveType`/`useDeleteLeaveType`) consistent across Tasks 7–11.

**Known ceilings (ponytail):** annual single-year check; only default-annual honours per-employee override; `paid` display-only; maternity ceiling-not-tiered. All documented in the spec.
