# Employee Profile — Design Spec

**Date:** 2026-07-05
**Status:** Approved (design), ready for implementation planning
**Scope:** Complete employee/HR data for vernon_project — background, legal/ID, birthdate, expertise, training, leave quota, contract — on the live `project.vernon.id` site.

---

## Context & constraints

- `project.vernon.id` runs **only `frappe` + `vernon_project`**. ERPNext / HRMS are **not** installed and will **not** be installed (installing an ERP for HR fields would bloat a deliberately lean live site, and would still miss expertise/training/Indonesia legal IDs).
- A "person" is a **core Frappe `User`** record. Every existing person-keyed doctype links to `User` (attendance, points, todos, cuti). Today the app stores **zero** HR/personal/legal/employment master data (only a `custom_member_type` field on User).
- Leave/cuti already exists as **Attendance Exception** (`exception_type='Leave'`), approved by all Ongoing-project leaders (unanimity). It is currently **ungated / unlimited** — no quota.
- Code-first, live-site conventions apply: schema via `bench migrate`, Python via `bench restart`, frontend via `npm build`. See project memory `vernon-deploy-mechanics`.

## Locked product decisions

| Decision | Choice |
|---|---|
| Who edits | **Self-service + admin.** User edits own soft fields on `/m`; legal/contract/leave-quota are admin-only on `/w`. |
| Leave quota | **Fixed annual quota**, balance computed on read (no ledger), **gates** cuti approval. |
| Expertise | **Freeform skill tags** (skill + proficiency), independent of the Group taxonomy. |
| Legal fields | **Standard Indonesia set + document attachments** (scanned KTP/NPWP/contract). |
| Leave day count | **Working days** (exclude weekends + holidays) — Indonesia cuti tahunan is counted in hari kerja. |
| Field reuse | `phone` / `birthdate` / `bio` / `gender` **reuse native core `User` fields** — not duplicated on Employee Profile. |

---

## 1. Doctype: Employee Profile

- **Module:** Vernon Project
- **autoname:** `field:user`, **`naming_rule: "By fieldname"`** (mirror `attendance_profile.json` exactly — 1:1, one row per User, named by user id).
- `user`: Link → User, `unique: 1`, `reqd: 1`.

permlevel legend: **0 = self-editable soft field** (mobile `/m`); **1 = admin-only sensitive** (web `/w`, System Manager).

### Anchor
| fieldname | fieldtype | options | permlevel |
|---|---|---|---|
| `user` | Link | User | 1 (server-set at provisioning) |

### Personal (soft, permlevel 0)
| fieldname | fieldtype | options |
|---|---|---|
| `home_address` | Small Text | — |
| `emergency_contact_name` | Data | — |
| `emergency_contact_phone` | Data | — |
| `emergency_contact_relation` | Data | — |

> **Reused from core `User` — NOT recreated here:** `phone` (User.phone), `birthdate` (User.birth_date), `bio` (User.bio), `gender` (User.gender). The self-edit endpoint writes these to the caller's own User row. Avoids two sources of truth.

### Background (soft, permlevel 0)
| fieldname | fieldtype | options |
|---|---|---|
| `education` | Table | Employee Education |

### Expertise (soft, permlevel 0)
| fieldname | fieldtype | options |
|---|---|---|
| `skills` | Table | Employee Skill |

### Training (soft, permlevel 0)
| fieldname | fieldtype | options |
|---|---|---|
| `trainings` | Table | Employee Training |

### Legal / ID (admin-only, permlevel 1)
| fieldname | fieldtype | options |
|---|---|---|
| `nik_ktp` | Data | — |
| `npwp` | Data | — |
| `bpjs_kesehatan` | Data | — |
| `bpjs_ketenagakerjaan` | Data | — |
| `bank_name` | Data | — |
| `bank_account_no` | Data | — |
| `bank_account_holder` | Data | — |
| `attach_ktp` | Attach | **private** (`is_private: 1`) |
| `attach_npwp` | Attach | **private** (`is_private: 1`) |

### Contract / Employment (admin-only, permlevel 1)
| fieldname | fieldtype | options |
|---|---|---|
| `employment_status` | Select | `Permanent\nContract\nProbation\nIntern` |
| `job_title` | Data | — |
| `date_joined` | Date | — |
| `contract_start` | Date | — |
| `contract_end` | Date | — |
| `attach_contract` | Attach | **private** (`is_private: 1`) |

### Leave (admin-only, permlevel 1)
| fieldname | fieldtype | options |
|---|---|---|
| `annual_leave_quota` | Int | optional per-employee override; blank ⇒ global default |

**All permlevel-1 fields:** `user`, `nik_ktp`, `npwp`, `bpjs_kesehatan`, `bpjs_ketenagakerjaan`, `bank_name`, `bank_account_no`, `bank_account_holder`, `attach_ktp`, `attach_npwp`, `employment_status`, `job_title`, `date_joined`, `contract_start`, `contract_end`, `attach_contract`, `annual_leave_quota`.

## 2. Child tables

All `istable: 1`, `editable_grid: 1`. Parent = Employee Profile via the Table fields above. Child permission follows the parent field's permlevel (all three parents are permlevel 0 ⇒ self-editable).

**Employee Skill** (→ `skills`): `skill` (Data, reqd), `proficiency` (Select `Beginner\nIntermediate\nAdvanced\nExpert`). Freeform — independent of Group taxonomy.

**Employee Training** (→ `trainings`): `title` (Data, reqd), `provider` (Data), `training_date` (Date), `certificate` (Attach, **private**), `expiry_date` (Date).

**Employee Education** (→ `education`): `level` (Select `SD\nSMP\nSMA/SMK\nD3\nS1\nS2\nS3`), `institution` (Data), `major` (Data), `year` (Int).

## 3. Permission model (two layers — both required)

### 3a. Field-level (Desk / `/api/resource`) — permlevel + role rows
`permissions` array on Employee Profile:
- **Level 0** (soft fields): `{"role": "All", "read": 1, "write": 1, "create": 0, "delete": 0}` — fenced to the caller's own row by the record-level hook (3b).
- **Level 1** (sensitive fields): `{"role": "System Manager", "permlevel": 1, "read": 1, "write": 1}`.

> Do **not** reference `HR Manager` or `Vernon User` — neither role exists on this site; a perm row pointing at a non-existent role **aborts `bench migrate`**. If non-admin HR staff must manage legal fields later, create an `HR Manager` role in a `post_model_sync` patch (mirror `patches/v1_0/add_points_granter_role.py`) and add a permlevel-1 row for it then.

### 3b. Record-level self-scoping (own row only)
`employee_profile.py`, registered in `hooks.py` (`permission_query_conditions` + `has_permission` dicts, ~lines 140 / 151):
- `get_permission_query_conditions(user)` → `""` for System Manager (sees all); else `` `tabEmployee Profile`.`user` = <escaped user> ``.
- `has_permission(doc, ptype, user)` → System Manager → True; `doc.user == user` → True; else False (all ptypes).

> Port **only** the own-row + System Manager branches. Do **NOT** copy Personal Note's `shares`/`shared_user` read-widening branch — Employee Profile has no shares child table; copying it either throws `AttributeError` (fail-closed) or opens an unintended read grant on PII.

### 3c. Mobile API enforcement — explicit field allowlist, NOT permlevel
Mobile endpoints save with `ignore_permissions=True`, which **bypasses** permlevel field-stripping and the record-level fence. Therefore:
- **Self read** (`bootstrap`): project **only** the named soft fields + `{quota, used, remaining}`. Never spread the doc; never include legal/contract/quota fieldnames.
- **Self write** (`update_my_profile`): assign **only** explicit named soft params (+ own User native fields). Never `doc.update(payload)` / `**kwargs`. Add a guard that payload keys ⊆ the soft allowlist (drop unknown keys). Child tables (skills/trainings/education): `json.loads` then `doc.set()` with explicit child subfield names (mirror `mobile.py:1695`), never assign raw dicts.
- **Admin read** (`get_employee_profile(user)`) and **admin write** (`update_employee_profile(user, ...)`): `_require_system_manager()` (mobile.py:26) as the **first line** — mirror `list_users()` at mobile.py:1858.

### 3d. Attachment privacy
`attach_ktp`, `attach_npwp`, `attach_contract`, and training `certificate` **must** be private (`is_private: 1`). Native Frappe `Attach` defaults to public files served unauthenticated at `/files/<name>`; permlevel protects the field value, not the file. Private routes access through Frappe's authenticated file handler.

## 4. Leave quota engine

- **Global default:** new field `default_annual_leave_quota` (Int, default 12) on **Vernon Settings** (existing Single doctype). Effective quota for a user = `Employee Profile.annual_leave_quota` if set, else the Vernon Settings default. Avoids storing the same constant on every row.
- **Day count = working days**, excluding weekends and holidays, via existing helpers `_assignment_for()` (`attendance/engine.py:66`) and `_is_holiday()` (`engine.py:100`). Half-day leave is **out of scope** (no half-day field on Attendance Exception).
- **No ledger** — `used` computed on read. Import fix: add `date_diff` to the `frappe.utils` import in `attendance.py` (currently `cint, getdate, now_datetime, nowdate`).

### Enforcement — in Attendance Exception `validate()` (covers approval path AND Desk edits)
On save where `status == "Approved"` and `exception_type == "Leave"` and the actor is **not** a System-Manager override:
1. Split the span into per-calendar-year slices (a Dec→Jan span consumes from both years' quotas).
2. For each touched year: `used(year)` = working-days of that employee's other `Leave` exceptions in that year with `status in (Approved, Pending)`, **excluding this doc** (`name != doc.name`); add this slice's working-days; assert `used + slice ≤ effective_quota(year)`, else `frappe.throw("Leave quota exceeded: N day(s) remaining, M requested.")`.
3. Missing Employee Profile ⇒ fall back to the global default (do **not** resolve to 0 — `or 0` would hard-block every leave for un-provisioned users).
4. **System Manager override bypasses** the check (preserves the existing no-leader / deadlock escape hatch).

> Counting `Pending + Approved` (excluding self) closes the two-simultaneous-requests double-book across sequential saves. A true same-instant race remains theoretically possible. `# ponytail: pending+approved count closes sequential double-book; add a per-employee row lock (SELECT ... FOR UPDATE) only if simultaneous approvals prove to be a real problem.`

**Read-side balance** for UI: expose `{quota, used, remaining}` from the profile/bootstrap endpoint using the same working-days helper.

## 5. Provisioning + backfill

- **Per-user:** lazy `_ensure_employee_profile(user)` — `frappe.db.exists` → get-or-create, `insert(ignore_permissions=True)`. Wrap the insert to swallow the `unique:1` duplicate on a first-touch race and re-fetch. No User `after_insert` hook (consistent with this app — Attendance Profile isn't auto-provisioned either; a hook would only cover new users and still need a backfill).
- **Backfill:** patch `vernon_project.patches.v1_0.backfill_employee_profile` (in `patches.txt` under `[post_model_sync]`), iterating enabled Users (skip Administrator/Guest), reusing `_ensure_employee_profile`. Idempotent. Convention mirrors `patches/v1_0/add_member_type_field.py`.

## 6. Frontend plan

### Backend endpoints (`vernon_project/api/mobile.py`)
1. **Self read:** extend `bootstrap()` (mobile.py:642-667) — `_ensure_employee_profile(user)`, merge **soft fields only** + `{quota, used, remaining}`.
2. **Admin read:** `get_employee_profile(user)` — `_require_system_manager()`-gated, returns all fields incl. legal.
3. **Self write (NEW):** `update_my_profile(...)` — named soft params + own User native fields (phone/birthdate/bio/gender), allowlist-guarded (see 3c).
4. **Admin write (NEW):** `update_employee_profile(user, ...)` — `_require_system_manager()`-gated, writes all fields.

### `/m` mobile — self-profile (`frontend/src/pages/Profile.tsx`, route `/me`)
Editable Soft-Pop section: home_address + emergency contact + (native) phone/birthdate/bio + skills/trainings/education child-row editors + read-only leave-balance chip (`remaining / quota`). New `mobileApi.updateMyProfile` in `frontend/src/lib/api.ts`, hook in `useData.ts`.

### `/w` web — admin editor (`frontend-web/src/pages/UserForm.tsx`, `canManageUsers`-gated)
Add Legal/ID, Contract/Employment, Leave-quota groups + private file uploads (native Frappe Attach upload). Extend `UserFormPayload` in `frontend/src/lib/types.ts` (shared). Consumes `updateEmployeeProfile`.

## 7. Phasing (each independently shippable)

**Phase 1 — Doctype + perms + provisioning.** Employee Profile + 3 child tables; permlevel-1 tagging + role rows (System Manager only); private attach flags; `employee_profile.py` (`has_permission`, `get_permission_query_conditions`, `_ensure_employee_profile`); register in `hooks.py`; `default_annual_leave_quota` on Vernon Settings; backfill patch. → `bench migrate`. Deliverable: Desk-editable, self-scoped, all users provisioned.

**Phase 2 — Leave quota gate.** `date_diff` import; working-days helper (reuse engine.py); quota check in Attendance Exception `validate()` (per-year split, Pending+Approved count, admin bypass, missing-profile fallback). → `bench restart`. Deliverable: cuti approval blocked when quota exceeded.

**Phase 3 — Frontend.** 3a: `bootstrap` read extension + `/m` Profile self-edit + `update_my_profile`. 3b: `update_employee_profile` + `/w` UserForm admin fields + leave-balance display. → npm build (mobile, web).

---

## Files touched

**New:**
- `vernon_project/vernon_project/doctype/employee_profile/{employee_profile.json,employee_profile.py}`
- `vernon_project/vernon_project/doctype/employee_skill/employee_skill.json`
- `vernon_project/vernon_project/doctype/employee_training/employee_training.json`
- `vernon_project/vernon_project/doctype/employee_education/employee_education.json`
- `vernon_project/patches/v1_0/backfill_employee_profile.py`

**Edit:**
- `vernon_project/patches.txt` (add backfill under `[post_model_sync]`)
- `vernon_project/hooks.py` (`permission_query_conditions`, `has_permission`)
- `vernon_project/api/attendance.py` (`date_diff` import; working-days helper) and Attendance Exception `validate()` (quota gate)
- `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` (`default_annual_leave_quota`)
- `vernon_project/api/mobile.py` (`bootstrap` read extension; new self/admin endpoints)
- `frontend/src/pages/Profile.tsx`, `frontend/src/lib/{api.ts,types.ts}`, `frontend/src/hooks/useData.ts`
- `frontend-web/src/pages/UserForm.tsx`

## Explicitly skipped (YAGNI — add when)
- Separate leave ledger → compute-on-read covers it. Add when quota history / audit / carryover is needed.
- User `after_insert` hook → lazy get-or-create + backfill covers it.
- Proration by `date_joined` → fixed annual quota chosen; `date_joined` stays decorative for leave (present to drive proration later).
- Half-day leave → no half-day field; whole working-days only.
- Per-employee row lock on quota → Pending+Approved count covers sequential double-book; add lock only if simultaneous approvals prove real.
- `HR Manager` role → System Manager only; add role-patch + permlevel-1 row when non-admin HR staff need legal-field access.
