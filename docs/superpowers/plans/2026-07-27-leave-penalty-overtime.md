# Leave-Penalty & Overtime-Bonus Quota Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accrue lateness/early-leave minutes and HR-approved overtime, and once either crosses a configurable 8-hour threshold, deduct or grant one leave day — all numbers admin-configurable globally with per-Brand overrides, nothing hard-coded.

**Architecture:** New settings live in the existing `Vernon Settings` single with same-named per-`Brand` overrides (gated by one `override_leave_rules` check), resolved Brand-first-then-global. Lateness accrues from existing `Daily Attendance.late_minutes`/`early_minutes` (no new log doctype); overtime accrues from a new `Overtime Entry` doctype (HR create → System Manager approve). Both effects post signed rows to the existing `Cuti Ledger` via **idempotent floor-count reconcile** (ledger row count == accrued_minutes // threshold), so re-runs self-heal and turning the toggle off removes the rows.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), React (`frontend/` mobile `/m`, `frontend-web/` web `/w`), shared logic in `frontend/src` (imported as `@`).

## Global Constraints

- **No hard-coded numbers.** The 8h threshold, the 1-day unit, every toggle — read from settings. No literal `480`/`8`/`1` in logic.
- **Both frontends.** Every UI change ships to `/m` AND `/w`. Rebuild both bundles before "done".
- **Default OFF.** `late_penalty_enabled` and `overtime_bonus_enabled` default `0`. Feature inert until an admin enables it.
- **Idempotent ledger.** Never blind-increment. Ledger rows are `count == accrued // threshold`; reconcile to target.
- **Per-calendar-year** accrual, aligned to the annual Grant cycle (natural reset Jan 1).
- **"User group" ⇒ Brand** (see spec). User↔Brand via active `Attendance Profile` row.
- **Deploy:** schema change ⇒ `bench --site project.vernon.id migrate`; Python change ⇒ `sudo /usr/local/bin/tj-restart`; frontend ⇒ `npm run build` in each frontend dir.
- **Docs:** new doctype ⇒ add to `scripts/gen_docs.py` CLUSTERS, run `python3 scripts/gen_docs.py`, commit `docs/assets/data.js`.

---

### Task 1: Pure accrual/reconcile math + settings resolver (`leave_rules.py`)

The testable core, import-safe (frappe imported lazily) so `python3` runs its self-check.

**Files:**
- Create: `vernon_project/attendance/leave_rules.py`

**Interfaces:**
- Produces:
  - `days_owed(accrued_minutes: int, threshold: int) -> int` — `threshold<=0 → 0`, else `accrued // threshold`.
  - `reconcile_delta(existing_count: int, target_count: int) -> int` — `target - existing` (positive = insert N, negative = delete N).
  - `resolve(employee: str) -> dict` — resolved settings for a user: keys `late_penalty_enabled, count_early_leave_in_penalty, lateness_deduction_threshold_minutes, overtime_bonus_enabled, overtime_bonus_threshold_minutes` (bool/bool/int/bool/int). Brand override wins when the user's active Brand has `override_leave_rules=1`.
  - `SETTING_FIELDS: list[str]` — the five field names (single source for API + resolver).

- [ ] **Step 1: Write the failing self-check**

```python
# at bottom of vernon_project/attendance/leave_rules.py
if __name__ == "__main__":
    assert days_owed(0, 480) == 0
    assert days_owed(479, 480) == 0
    assert days_owed(480, 480) == 1
    assert days_owed(961, 480) == 2
    assert days_owed(100, 0) == 0          # threshold 0 never divides
    assert reconcile_delta(0, 2) == 2      # need to insert 2
    assert reconcile_delta(3, 1) == -2     # delete 2 (e.g. toggle turned off shrank target)
    assert reconcile_delta(2, 2) == 0
    print("leave_rules self-check OK")
```

- [ ] **Step 2: Run it, verify it fails**

Run: `python3 vernon_project/attendance/leave_rules.py`
Expected: `NameError: name 'days_owed' is not defined`

- [ ] **Step 3: Implement the module**

```python
"""Leave-quota rules: lateness/early-leave penalties and overtime bonuses.

Pure math (days_owed/reconcile_delta) is frappe-free so it self-checks under
plain python3. DB-touching helpers import frappe lazily.
All numbers come from Vernon Settings (with per-Brand override); nothing here
hard-codes a threshold or day-unit.
"""

SETTING_FIELDS = [
    "late_penalty_enabled",
    "count_early_leave_in_penalty",
    "lateness_deduction_threshold_minutes",
    "overtime_bonus_enabled",
    "overtime_bonus_threshold_minutes",
]

_BOOL_FIELDS = {"late_penalty_enabled", "count_early_leave_in_penalty", "overtime_bonus_enabled"}


def days_owed(accrued_minutes, threshold):
    """Whole leave days represented by accrued minutes. threshold<=0 disables."""
    threshold = int(threshold or 0)
    if threshold <= 0:
        return 0
    return int(accrued_minutes or 0) // threshold


def reconcile_delta(existing_count, target_count):
    """How many rows to add (+) or remove (-) to reach the target count."""
    return int(target_count) - int(existing_count)


def resolve(employee):
    """Resolved leave-rule settings for a user: Brand override else global."""
    import frappe
    from vernon_project.attendance.leave_quota import _brand_for

    out = {}
    for f in SETTING_FIELDS:
        v = frappe.db.get_single_value("Vernon Settings", f)
        out[f] = bool(v) if f in _BOOL_FIELDS else int(v or 0)

    brand = _brand_for(employee)
    if brand and frappe.db.get_value("Brand", brand, "override_leave_rules"):
        for f in SETTING_FIELDS:
            v = frappe.db.get_value("Brand", brand, f)
            out[f] = bool(v) if f in _BOOL_FIELDS else int(v or 0)
    return out
```

- [ ] **Step 4: Run the self-check, verify it passes**

Run: `python3 vernon_project/attendance/leave_rules.py`
Expected: `leave_rules self-check OK`

- [ ] **Step 5: Commit**

```bash
git add vernon_project/attendance/leave_rules.py
git commit -m "feat(attendance): leave-rules pure math + settings resolver"
```

---

### Task 2: Schema — settings fields, Brand overrides, Cuti entry_types, Overtime Entry doctype

All JSON schema changes together so a single `migrate` applies them.

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`
- Modify: `vernon_project/vernon_project/doctype/brand/brand.json`
- Modify: `vernon_project/vernon_project/doctype/cuti_ledger/cuti_ledger.json`
- Create: `vernon_project/vernon_project/doctype/overtime_entry/overtime_entry.json`
- Create: `vernon_project/vernon_project/doctype/overtime_entry/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/overtime_entry/overtime_entry.py`

**Interfaces:**
- Produces: doctype `Overtime Entry` with fields `employee`(Link User,reqd), `date`(Date,reqd), `minutes`(Int,reqd), `reason`(Small Text), `assigned_by`(Link User,read_only), `status`(Select `Pending\nApproved\nRejected`, default Pending), `approved_by`(Link User,read_only), `approved_on`(Datetime,read_only). Controller `OvertimeEntry` with `validate` (only System Manager may set Approved; stamp approver) and `on_update`/`on_trash` → `reconcile_overtime`.

- [ ] **Step 1: Add the five fields + section to `vernon_settings.json`**

Add to `field_order` (after `show_auto_approve`) and `fields`:

```json
{ "fieldname": "leave_rules_section", "fieldtype": "Section Break", "label": "Leave Rules" },
{ "fieldname": "late_penalty_enabled", "fieldtype": "Check", "label": "Deduct leave for lateness/early-leave", "default": "0" },
{ "fieldname": "count_early_leave_in_penalty", "fieldtype": "Check", "label": "Include early-leave minutes", "default": "1" },
{ "fieldname": "lateness_deduction_threshold_minutes", "fieldtype": "Int", "label": "Lateness minutes per 1 day deducted", "default": "480" },
{ "fieldname": "overtime_bonus_enabled", "fieldtype": "Check", "label": "Grant leave for approved overtime", "default": "0" },
{ "fieldname": "overtime_bonus_threshold_minutes", "fieldtype": "Int", "label": "Overtime minutes per 1 day granted", "default": "480" }
```

- [ ] **Step 2: Add override toggle + same fields to `brand.json`**

Add `override_leave_rules` (Check, label "Override global leave rules") and the same five fields to BOTH `fields` and `field_order`. **Also add the already-present-but-unordered `default_annual_leave_quota` to `field_order`** (bug noted in spec — it's in `fields`, missing from `field_order`).

- [ ] **Step 3: Add entry_type options to `cuti_ledger.json`**

Change the `entry_type` field `options` from
`"Grant\nCuti\nCuti Bersama\nCarry-over\nBonus\nCorrection"` to
`"Grant\nCuti\nCuti Bersama\nCarry-over\nBonus\nCorrection\nLate Penalty\nOvertime Bonus"`.

- [ ] **Step 4: Create `overtime_entry.json`**

```json
{
 "actions": [], "creation": "2026-07-27 00:00:00", "doctype": "DocType",
 "engine": "InnoDB", "field_order": ["employee","date","minutes","reason","status","assigned_by","approved_by","approved_on"],
 "fields": [
  {"fieldname":"employee","fieldtype":"Link","options":"User","label":"Employee","reqd":1,"in_list_view":1},
  {"fieldname":"date","fieldtype":"Date","label":"Date","reqd":1,"in_list_view":1},
  {"fieldname":"minutes","fieldtype":"Int","label":"Extra Minutes","reqd":1,"in_list_view":1},
  {"fieldname":"reason","fieldtype":"Small Text","label":"Reason"},
  {"fieldname":"status","fieldtype":"Select","options":"Pending\nApproved\nRejected","default":"Pending","label":"Status","in_list_view":1},
  {"fieldname":"assigned_by","fieldtype":"Link","options":"User","label":"Assigned By","read_only":1},
  {"fieldname":"approved_by","fieldtype":"Link","options":"User","label":"Approved By","read_only":1},
  {"fieldname":"approved_on","fieldtype":"Datetime","label":"Approved On","read_only":1}
 ],
 "index_web_pages_for_search": 1, "links": [], "modified": "2026-07-27 00:00:00",
 "modified_by": "Administrator", "module": "Vernon Project", "name": "Overtime Entry",
 "naming_rule": "Random", "autoname": "hash", "owner": "Administrator",
 "permissions": [
  {"role":"System Manager","create":1,"read":1,"write":1,"delete":1,"report":1},
  {"role":"HR Manager","create":1,"read":1,"write":1,"delete":1,"report":1}
 ],
 "sort_field": "modified", "sort_order": "DESC", "states": []
}
```

- [ ] **Step 5: Create `overtime_entry.py` controller**

```python
import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class OvertimeEntry(Document):
    def validate(self):
        if self.status == "Approved":
            if "System Manager" not in frappe.get_roles():
                frappe.throw("Only a System Manager can approve overtime.")
            self.approved_by = frappe.session.user
            self.approved_on = self.approved_on or now_datetime()
        else:
            self.approved_by = None
            self.approved_on = None
        if not self.assigned_by:
            self.assigned_by = frappe.session.user

    def on_update(self):
        from vernon_project.attendance.leave_rules import reconcile_overtime
        reconcile_overtime(self.employee, int(self.date[:4]))

    def on_trash(self):
        from vernon_project.attendance.leave_rules import reconcile_overtime
        reconcile_overtime(self.employee, int(self.date[:4]))
```

- [ ] **Step 6: Empty `__init__.py`**

Create `vernon_project/vernon_project/doctype/overtime_entry/__init__.py` (empty file).

- [ ] **Step 7: Migrate + verify doctype exists**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id console <<'EOF'`
`print(frappe.get_meta("Overtime Entry").get_field("status").options)`
`print(frappe.get_meta("Cuti Ledger").get_field("entry_type").options)`
`EOF`
Expected: overtime status `Pending\nApproved\nRejected`; entry_type includes `Late Penalty`, `Overtime Bonus`.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/vernon_project/doctype/brand/brand.json vernon_project/vernon_project/doctype/cuti_ledger/cuti_ledger.json vernon_project/vernon_project/doctype/overtime_entry/
git commit -m "feat: schema for leave-rules settings, brand overrides, overtime entry"
```

---

### Task 3: Ledger reconcile helpers + wire lateness & overtime reconcile

Add the DB reconcile to `leave_rules.py` (uses Task 1 pure math + Task 2 schema), plus a generic ledger reconcile in `cuti_ledger.py`, and call the penalty reconcile from `nightly_finalize`.

**Files:**
- Modify: `vernon_project/attendance/cuti_ledger.py` (add `reconcile_signed`)
- Modify: `vernon_project/attendance/leave_rules.py` (add `accrued_penalty_minutes`, `reconcile_penalty`, `reconcile_overtime`, `accrual_status`)
- Modify: `vernon_project/attendance/engine.py` (call `reconcile_penalty` in `nightly_finalize`)

**Interfaces:**
- Consumes: `days_owed`, `reconcile_delta`, `resolve` (Task 1); `Cuti Ledger`, `Overtime Entry`, `Daily Attendance` (Task 2 + existing).
- Produces:
  - `cuti_ledger.reconcile_signed(employee, year, entry_type, unit_days, target_count, reason)` — makes the count of rows keyed (employee, year, entry_type) equal `target_count`; each row `days = unit_days` (signed). Inserts/deletes the delta. Returns final count.
  - `leave_rules.reconcile_penalty(employee, year)` / `reconcile_overtime(employee, year)` — compute target via `days_owed`, call `reconcile_signed` (unit `-1` / `+1`). No-op-to-zero when the toggle is off (target 0 ⇒ rows removed).
  - `leave_rules.accrual_status(employee, year) -> dict` — `{late_accrued, late_threshold, late_enabled, overtime_accrued, overtime_threshold, overtime_enabled}` for the UI.

- [ ] **Step 1: Add `reconcile_signed` to `cuti_ledger.py`**

```python
def reconcile_signed(employee, year, entry_type, unit_days, target_count, reason):
    """Force the number of (employee, year, entry_type) rows to target_count.
    Each row carries days=unit_days (signed). Idempotent."""
    names = frappe.get_all(
        "Cuti Ledger",
        filters={"employee": employee, "year": year, "entry_type": entry_type},
        pluck="name",
    )
    existing = len(names)
    target = max(0, int(target_count))
    if target > existing:
        for _ in range(target - existing):
            frappe.get_doc({
                "doctype": "Cuti Ledger", "employee": employee, "year": year,
                "entry_type": entry_type, "days": unit_days, "reason": reason,
                "posted_by": frappe.session.user, "posted_on": frappe.utils.now_datetime(),
            }).insert(ignore_permissions=True)
    elif target < existing:
        for name in names[: existing - target]:
            frappe.delete_doc("Cuti Ledger", name, ignore_permissions=True, force=True)
    return target
```

- [ ] **Step 2: Add accrual + reconcile to `leave_rules.py`**

```python
def accrued_penalty_minutes(employee, year, count_early):
    import frappe
    rows = frappe.get_all(
        "Daily Attendance",
        filters={"employee": employee, "attendance_date": ["between", [f"{year}-01-01", f"{year}-12-31"]]},
        fields=["late_minutes", "early_minutes"],
    )
    total = 0
    for r in rows:
        total += int(r.late_minutes or 0)
        if count_early:
            total += int(r.early_minutes or 0)
    return total


def _approved_overtime_minutes(employee, year):
    import frappe
    rows = frappe.get_all(
        "Overtime Entry",
        filters={"employee": employee, "status": "Approved",
                 "date": ["between", [f"{year}-01-01", f"{year}-12-31"]]},
        fields=["minutes"],
    )
    return sum(int(r.minutes or 0) for r in rows)


def reconcile_penalty(employee, year):
    from vernon_project.attendance import cuti_ledger
    s = resolve(employee)
    if not s["late_penalty_enabled"]:
        target = 0
    else:
        accrued = accrued_penalty_minutes(employee, year, s["count_early_leave_in_penalty"])
        target = days_owed(accrued, s["lateness_deduction_threshold_minutes"])
    return cuti_ledger.reconcile_signed(employee, year, "Late Penalty", -1, target,
                                        "Auto: lateness/early-leave accrual")


def reconcile_overtime(employee, year):
    from vernon_project.attendance import cuti_ledger
    s = resolve(employee)
    if not s["overtime_bonus_enabled"]:
        target = 0
    else:
        accrued = _approved_overtime_minutes(employee, year)
        target = days_owed(accrued, s["overtime_bonus_threshold_minutes"])
    return cuti_ledger.reconcile_signed(employee, year, "Overtime Bonus", 1, target,
                                        "Auto: approved overtime accrual")


def accrual_status(employee, year):
    s = resolve(employee)
    return {
        "late_enabled": s["late_penalty_enabled"],
        "late_threshold": s["lateness_deduction_threshold_minutes"],
        "late_accrued": accrued_penalty_minutes(employee, year, s["count_early_leave_in_penalty"]),
        "overtime_enabled": s["overtime_bonus_enabled"],
        "overtime_threshold": s["overtime_bonus_threshold_minutes"],
        "overtime_accrued": _approved_overtime_minutes(employee, year),
    }
```

- [ ] **Step 3: Call `reconcile_penalty` in `nightly_finalize`**

In `engine.py::nightly_finalize`, after each active employee's `recompute_daily(...)` for yesterday, add (inside the per-employee loop, wrapped so one failure doesn't abort the batch):

```python
            try:
                from vernon_project.attendance.leave_rules import reconcile_penalty
                reconcile_penalty(emp, int(nowdate()[:4]))
            except Exception:
                frappe.log_error(frappe.get_traceback(), "reconcile_penalty failed")
```

(Match the loop's actual employee var name and existing `nowdate` import — read the function first.)

- [ ] **Step 4: Verify reconcile in console**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'`
```python
import frappe
from vernon_project.attendance import leave_rules
# pick a user with attendance; force settings on in-memory is hard — instead test the pure path:
print(leave_rules.days_owed(500, 480))   # 1
print(leave_rules.reconcile_delta(0, 1)) # 1
frappe.db.rollback()
```
`EOF`
Expected: `1` then `1`. (Full DB reconcile is exercised in Task 6 E2E once a toggle is enabled.)

- [ ] **Step 5: Restart + commit**

```bash
sudo /usr/local/bin/tj-restart
git add vernon_project/attendance/cuti_ledger.py vernon_project/attendance/leave_rules.py vernon_project/attendance/engine.py
git commit -m "feat(attendance): reconcile late-penalty & overtime-bonus ledger rows"
```

---

### Task 4: API — overtime CRUD/approve + settings fields + accrual status in bootstrap

**Files:**
- Create: `vernon_project/api/overtime.py`
- Modify: `vernon_project/api/mobile.py` (extend `get_app_settings`/`save_app_settings` field lists; add `leave_rules` to `bootstrap()`)

**Interfaces:**
- Consumes: `leave_rules.accrual_status`, `reconcile_overtime`; `Overtime Entry`.
- Produces (all `@frappe.whitelist`):
  - `overtime.list_overtime(employee=None, status=None, year=None)` — own for anyone, any for HR/SysMgr.
  - `overtime.create_overtime(employee, date, minutes, reason=None)` — HR/SysMgr only; inserts Pending.
  - `overtime.set_status(name, status)` — Approved requires System Manager (controller enforces); returns the doc.
  - `overtime.delete_overtime(name)` — HR/SysMgr only.
  - `overtime.my_leave_rules_status()` — `accrual_status(frappe.session.user, current_year)`.
  - `mobile.bootstrap()` gains `"leave_rules": accrual_status(user, year)` for the current user.
  - `get_app_settings`/`save_app_settings` include the five new fields.

- [ ] **Step 1: Write `api/overtime.py`** (role helper mirrors `mobile._is_hr` — check its real name first via grep and reuse it)

```python
import frappe
from frappe.utils import nowdate

def _can_manage():
    roles = set(frappe.get_roles())
    if not ({"HR Manager", "System Manager"} & roles):
        frappe.throw("Not permitted", frappe.PermissionError)

@frappe.whitelist()
def list_overtime(employee=None, status=None, year=None):
    user = frappe.session.user
    roles = set(frappe.get_roles())
    is_mgr = bool({"HR Manager", "System Manager"} & roles)
    filters = {}
    if not is_mgr:
        filters["employee"] = user
    elif employee:
        filters["employee"] = employee
    if status:
        filters["status"] = status
    if year:
        filters["date"] = ["between", [f"{year}-01-01", f"{year}-12-31"]]
    return frappe.get_all("Overtime Entry", filters=filters,
        fields=["name","employee","date","minutes","reason","status","assigned_by","approved_by","approved_on"],
        order_by="date desc")

@frappe.whitelist()
def create_overtime(employee, date, minutes, reason=None):
    _can_manage()
    doc = frappe.get_doc({"doctype":"Overtime Entry","employee":employee,"date":date,
        "minutes":int(minutes),"reason":reason,"status":"Pending"}).insert()
    return doc.name

@frappe.whitelist()
def set_status(name, status):
    _can_manage()
    doc = frappe.get_doc("Overtime Entry", name)
    doc.status = status                # controller enforces SysMgr-for-Approved
    doc.save()
    return {"name": doc.name, "status": doc.status}

@frappe.whitelist()
def delete_overtime(name):
    _can_manage()
    frappe.delete_doc("Overtime Entry", name)
    return {"ok": True}

@frappe.whitelist()
def my_leave_rules_status():
    from vernon_project.attendance.leave_rules import accrual_status
    return accrual_status(frappe.session.user, int(nowdate()[:4]))
```

- [ ] **Step 2: Extend `get_app_settings`/`save_app_settings`** in `mobile.py`

Read both functions first. Add the five `leave_rules.SETTING_FIELDS` to whatever field list each iterates (import `from vernon_project.attendance.leave_rules import SETTING_FIELDS` and extend, so the list stays single-sourced). Preserve the `_require_settings_manager()` gate on save.

- [ ] **Step 3: Add `leave_rules` to `bootstrap()`**

In `mobile.py::bootstrap()`, near the existing `"leave"` key (~L755):

```python
    from vernon_project.attendance.leave_rules import accrual_status
    out["leave_rules"] = accrual_status(user, int(frappe.utils.nowdate()[:4]))
```

(match the actual result-dict variable name in `bootstrap`.)

- [ ] **Step 4: Restart + verify each endpoint**

```bash
sudo /usr/local/bin/tj-restart
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
print(frappe.call("vernon_project.api.overtime.my_leave_rules_status"))
print("leave_rules" in frappe.call("vernon_project.api.mobile.bootstrap"))
EOF
```
Expected: a status dict; `True`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/overtime.py vernon_project/api/mobile.py
git commit -m "feat(api): overtime CRUD/approve, leave-rules settings & accrual in bootstrap"
```

---

### Task 5: Frontends — settings fields, overtime screens, accrual progress (`/m` + `/w`)

Both frontends. Shared API + types in `frontend/src` (`@`); presentation per platform.

**Files:**
- Modify: `frontend/src/lib/types.ts` (shared) — add `LeaveRulesStatus`, `OvertimeEntry` types; extend settings type with the five fields.
- Modify: `frontend/src/lib/api.ts` — add `listOvertime/createOvertime/setOvertimeStatus/deleteOvertime/myLeaveRulesStatus`.
- Modify (mobile `/m`): the admin settings screen (grep `get_app_settings` consumer), the Cuti/attendance screen for the accrual progress row, and a new overtime screen + route.
- Modify (web `/w`): `frontend-web/src/...` equivalents (settings editor, overtime page, accrual tile).

**Interfaces:**
- Consumes: Task 4 endpoints.
- Produces: admin can edit the five settings (global; per-Brand override lives in the Brand editor — extend it too if one exists, else note global-only in UI); HR can create overtime + SysMgr approve; employees see accrual progress.

- [ ] **Step 1: Add shared API + types**

Add to `frontend/src/lib/api.ts` (mirror existing `frappeCall` style) and `types.ts`:

```ts
export interface OvertimeEntry { name:string; employee:string; date:string; minutes:number; reason?:string; status:'Pending'|'Approved'|'Rejected'; assigned_by?:string; approved_by?:string; approved_on?:string; }
export interface LeaveRulesStatus { late_enabled:boolean; late_threshold:number; late_accrued:number; overtime_enabled:boolean; overtime_threshold:number; overtime_accrued:number; }
export const listOvertime = (p:{employee?:string;status?:string;year?:number}={}) => frappeCall('vernon_project.api.overtime.list_overtime', p);
export const createOvertime = (p:{employee:string;date:string;minutes:number;reason?:string}) => frappeCall('vernon_project.api.overtime.create_overtime', p);
export const setOvertimeStatus = (p:{name:string;status:string}) => frappeCall('vernon_project.api.overtime.set_status', p);
export const deleteOvertime = (p:{name:string}) => frappeCall('vernon_project.api.overtime.delete_overtime', p);
export const myLeaveRulesStatus = () => frappeCall('vernon_project.api.overtime.my_leave_rules_status', {});
```

(Use the codebase's actual call wrapper name — grep `api.ts` for the existing pattern before writing.)

- [ ] **Step 2: Settings editor — add the five fields (both frontends)**

Find the admin settings form (grep both `frontend*/src` for `get_app_settings`/`save_app_settings` / `getAppSettings`). Add a "Aturan Cuti" group with: two toggles (late/overtime enabled), "Include early-leave" toggle, two number inputs (thresholds). Use the app's existing form primitives (NumField-style number input, toggle). No native inputs.

- [ ] **Step 3: Overtime screen (both frontends)**

New route/screen "Lembur" (Overtime): a list (HR sees all, filter by employee via the app's SearchableSelect; employees see own), a create form (employee SearchableSelect + DatePicker + minutes number field + reason), row actions Approve/Reject (guarded to SysMgr for Approve) and Delete. Follow platform card/table conventions (mobile Soft-Pop card list; web DataTable/drawer). Add to nav where other HR screens live (grep `nav.ts` / mobile menu).

- [ ] **Step 4: Accrual progress row (both frontends)**

On the existing Cuti ledger screen (`CutiLedgerScreen.tsx` / `CutiLedger.tsx`), read `myLeaveRulesStatus` (or `boot.leave_rules`) and render, only when the toggle is enabled for the user: "Keterlambatan: {late_accrued}/{late_threshold} menit → potong 1 hari" and "Lembur: {overtime_accrued}/{overtime_threshold} menit → tambah 1 hari", each as a small progress bar.

- [ ] **Step 5: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed, new hashed bundles under `vernon_project/public/frontend{,_web}/assets/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend-web/src vernon_project/public/frontend vernon_project/public/frontend_web
git commit -m "feat(web,mobile): leave-rule settings, overtime screen, accrual progress"
```

---

### Task 6: Docs, live E2E, What's New decision

**Files:**
- Modify: `scripts/gen_docs.py` (add `Overtime Entry` to CLUSTERS)
- Modify: `docs/assets/data.js` (regenerated)

- [ ] **Step 1: Add `Overtime Entry` to `gen_docs.py` CLUSTERS, regenerate**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```
Expected: exit 0 (non-zero means the doctype is missing from CLUSTERS — add it), data.js changed.

- [ ] **Step 2: Live E2E — enable toggles on a test user, confirm ledger moves**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
from vernon_project.attendance import leave_rules
frappe.db.set_single_value("Vernon Settings", "overtime_bonus_enabled", 1)
frappe.db.set_single_value("Vernon Settings", "overtime_bonus_threshold_minutes", 480)
u = "Administrator"; y = int(frappe.utils.nowdate()[:4])
ot = frappe.get_doc(dict(doctype="Overtime Entry", employee=u, date=frappe.utils.nowdate(), minutes=480, status="Approved")).insert(ignore_permissions=True)
print("bonus rows:", frappe.db.count("Cuti Ledger", {"employee":u,"year":y,"entry_type":"Overtime Bonus"}))  # expect 1
frappe.delete_doc("Overtime Entry", ot.name, ignore_permissions=True, force=True)
print("after delete:", frappe.db.count("Cuti Ledger", {"employee":u,"year":y,"entry_type":"Overtime Bonus"}))  # expect 0
frappe.db.set_single_value("Vernon Settings", "overtime_bonus_enabled", 0)
frappe.db.commit()
EOF
```
Expected: `bonus rows: 1` then `after delete: 0` (idempotent reconcile + reversible).

- [ ] **Step 3: Commit docs**

```bash
git add scripts/gen_docs.py docs/assets/data.js
git commit -m "docs: register Overtime Entry doctype in generated docs data"
```

- [ ] **Step 4: What's New decision**

Feature ships **default-OFF** (inert). Per project CLAUDE.md, a setting defaulting to off "does nothing until an admin sets it — don't announce it." **Skip the What's New entry** unless the user asks to enable it globally. Note this explicitly in the final recap.

---

## Self-Review

**Spec coverage:**
- "settings globally overrideable per user group" → Task 2 (Vernon Settings + Brand fields), Task 1 `resolve` (Brand-first). ✓
- "reduce leave quota if late or leave early" → Task 3 `reconcile_penalty` (−1 rows). ✓
- "temporary log … deduct once it reach 8 hours" → derived from Daily Attendance; threshold setting; Task 3. ✓
- "extra hours assigned by HR + approved by System Manager add time" → Task 2 Overtime Entry + controller gate; Task 4 API. ✓
- "reach 8 hours → grant 1 day" → Task 3 `reconcile_overtime` (+1 rows). ✓
- "all numbers in settings, no hard-coded" → Task 1/2 settings fields, resolver; no literals. ✓
- Both frontends → Task 5. ✓  Docs → Task 6. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `days_owed`, `reconcile_delta`, `resolve`, `reconcile_signed`, `reconcile_penalty`, `reconcile_overtime`, `accrual_status`, `SETTING_FIELDS` used consistently across Tasks 1/3/4. `LeaveRulesStatus` keys match `accrual_status` return keys. Overtime status enum consistent (`Pending/Approved/Rejected`).
