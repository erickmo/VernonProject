# Cuti Categories with Per-Category Limits — Design

**Date:** 2026-07-16
**Status:** Approved for planning

## Goal

Today a leave request is one generic `exception_type = "Leave"` drawing on a single
annual quota (`annual_leave_quota`, default 12, tracked per calendar year in
`leave_quota.py`). We want **multiple leave categories**, each with its **own limit**,
seeded from Indonesian statutory law (UU 13/2003 as amended by UU Cipta Kerja 11/2020 /
PP 35/2021, and UU 4/2024 KIA), and **admin-customizable from inside the apps** (/m and /w).

Enforcement is **hard-block at request time** (chosen): an over-limit, wrong-gender, or
missing-proof request cannot be submitted.

The **WFH** path (`exception_type = "WFH"`) is deliberately untouched throughout.

## Non-goals

- No payroll / wage-scale logic (site has no hrms; the statutory 100/75/50/25 sick-wage
  and maternity-wage scales are out of scope). A `paid` flag is stored for display only.
- No per-event *count* cap (e.g. "max 2 bereavements/year") — per-event limits cap the
  **length of one request**, not how many times per year. YAGNI until asked.
- No workflow change: leaders advise, HR gives final approval (unchanged from 2026-07-15).

## Data model

### New doctype: `Leave Type`

Admin-customizable category. Autoname by field (`leave_name`) or hash — hash is safer
against renames; use `hash` with `leave_name` unique.

| field | type | notes |
|---|---|---|
| `leave_name` | Data, unique, reqd | Bahasa name shown in the picker, e.g. "Cuti Tahunan" |
| `enabled` | Check, default 1 | hide without deleting; disabled types never appear in the picker |
| `limit_kind` | Select, reqd | `Annual Quota` \| `Per Event` \| `Documented` |
| `day_limit` | Int | Annual: days/year. Per Event: max **calendar** days per request. Documented: ignored. |
| `gender` | Select, default `Any` | `Any` \| `Male` \| `Female` — gate |
| `requires_proof` | Check | request must carry a `proof` attachment to submit |
| `paid` | Check, default 1 | **display only**, no payroll effect (per user request) |
| `is_default_annual` | Check | the ONE type wired to the existing per-employee `annual_leave_quota` / `prior_leave_taken`. At most one may be set. |
| `description` | Small Text | picker helper copy (Bahasa) |
| `sort_order` | Int | picker order |

Permissions: `System Manager` full; `HR Manager` create/read/write/delete (they own the
config). Read exposed to all via the whitelisted `list_leave_types` — the doctype itself
stays desk-gated.

### `Attendance Exception` (existing) — add two fields

- `leave_type` — Link → `Leave Type`. **Required when `exception_type = "Leave"`**, null for WFH.
- `proof` — Attach. Populated when the chosen type has `requires_proof`.

`exception_type` (WFH\|Leave), `status`, `hr_decision`, `approvers`, etc. all unchanged.

### `Employee Profile` (existing) — add one field

- `gender` — Select `Male\nFemale` (blank allowed), in `personal_section`. Needed for the
  gender gate; no gender field exists today. Editable by self and admin (same permlevel
  path as other personal fields; added to the profile edit whitelist in `mobile.py`).

`annual_leave_quota` and `prior_leave_taken` are unchanged in meaning but now scope to the
**default-annual** Leave Type (the one with `is_default_annual = 1`, i.e. Cuti Tahunan).

## Engine (`vernon_project/attendance/leave_quota.py`) — authoritative

The existing year-slice + working-days machinery stays; it becomes **per-leave-type**.

New: `check_request(employee, leave_type_name, from_date, to_date, has_proof) -> None`
throws a Bahasa `frappe.ValidationError` on any violation, returns silently if OK. Called
from `request_exception`. Rules, evaluated in order:

1. **Gender.** If `type.gender != "Any"`: read Employee Profile `gender`. Mismatch → block.
   Unset employee gender against a gender-gated type → block ("Lengkapi jenis kelamin di
   profil Anda.").
2. **Proof.** If `type.requires_proof` and not `has_proof` → block.
3. **Limit by kind:**
   - **Annual Quota** — `used_days(employee, year, leave_type=name)` per calendar-year
     slice (working-days: shift day and not holiday, exactly as today), plus this
     request's working-days. For the default-annual type the ceiling is `effective_quota`
     (Employee Profile override, else Vernon Settings default, else 12) **plus** the
     current-year `prior_leave_taken`. For any other annual type the ceiling is
     `type.day_limit` (no per-employee override — see ceiling note). Block if
     `used + requested > ceiling`.
   - **Per Event** — count **calendar** days in `[from, to]` inclusive. Block if
     `span > type.day_limit`. (Statute counts calendar days: "3 hari menikah", "3 bulan
     melahirkan". No cross-year or working-day logic; a single request is one event.)
   - **Documented** — no numeric limit. (Proof already checked in step 2.)

`used_days` gains a `leave_type` filter; today's callers pass the default-annual type name
so historical math is preserved. Pending + Approved both reserve quota (unchanged).

**Pure self-check** (`python leave_quota.py`) extends to cover: per-event calendar-day
span, annual working-day count unchanged, year-split unchanged.

### Ceiling notes (`ponytail:`)

- Only the **default-annual** type honours the per-employee `annual_leave_quota` override.
  A second Annual-Quota type (unusual) uses its flat `day_limit` for everyone. Upgrade path
  if ever needed: a child table of per-employee per-type overrides. Not built now.
- `prior_leave_taken` is a single current-year opening balance and applies only to the
  default-annual type — same limitation as today.

## API (`vernon_project/api/attendance.py` + `mobile.py`)

- `request_exception(from_date, to_date, exception_type, reason=None, leave_type=None, proof=None)`
  - WFH: unchanged.
  - Leave: `leave_type` required (else Bahasa error); load the type; call
    `check_request(...)`; store `leave_type` + `proof` on the doc.
- `list_leave_types()` (whitelisted, any logged-in user) → enabled types:
  `{name, leave_name, limit_kind, day_limit, gender, requires_proof, paid, description,
  is_default_annual, sort_order}`, ordered by `sort_order`. Frontend filters selectable by
  the caller's gender and shows the rest greyed with the reason.
- Leave summary (`_leave_balance` / the profile/attendance summary endpoint): keeps the
  annual-quota card (remaining for the default-annual type). Optionally lists this year's
  usage per type — nice-to-have, include if cheap.
- `_shape_exception_rows` adds `leave_type` to its field list so lists/my-requests render
  the category label.

### Admin CRUD (in-app, gated `System Manager` | `HR Manager`)

- `admin_list_leave_types()` — all types incl. disabled, for the admin screen.
- `save_leave_type(name=None, **fields)` — create or update; enforces at most one
  `is_default_annual`; validates `limit_kind`, `gender` enums.
- `delete_leave_type(name)` — refuse if it's `is_default_annual` or if any Attendance
  Exception references it (protect history); else delete.

## Frontend — both `/m` (frontend) and `/w` (frontend-web)

### Request form (`RequestException.tsx`, both)

When "Cuti" is selected, render a **Leave Type picker** (mobile: styled buttons/native-free
per conventions; web: `SearchableSelect`) from `list_leave_types`, filtered to the user's
gender. On select, show the type's rule inline:

- Annual → "Sisa cuti tahunan: N hari"
- Per Event → "Maksimal N hari per pengajuan"
- `requires_proof` → a file attach control + "Wajib melampirkan {proof label}"

Submit passes `leave_type` (+ `proof` when required). Backend re-validates (source of truth).
WFH selection hides the picker entirely — identical to today.

### Admin screen (both, new)

A "Kategori Cuti / Leave Types" admin screen alongside the existing admin screens (near
Employee admin / attendance settings; exact mount decided in the plan). Lists all types,
edit via form/drawer (web: form drawer per convention; mobile: detail screen). Fields map
1:1 to the doctype. Gated to `System Manager` | `HR Manager` in the nav gate.

### Summary / MyExceptions (both)

Each request row shows its `leave_type` label (falls back to "Cuti" for legacy null rows,
though the backfill removes those). Annual-quota card unchanged.

## Seed + backfill patch (`patches/v1_0/seed_leave_types.py`)

Idempotent (`get_or_create` by `leave_name`). Seeds the 12 statutory defaults:

| leave_name | limit_kind | day_limit | gender | proof | paid | default_annual | source |
|---|---|---|---|---|---|---|---|
| Cuti Tahunan | Annual Quota | 12 | Any | no | yes | **yes** | Pasal 79(3) jo. Cipta Kerja |
| Cuti Sakit | Documented | 0 | Any | yes | yes | no | Pasal 93(3) |
| Cuti Melahirkan | Per Event | 180 | Female | no | yes | no | UU 4/2024 Pasal 4 |
| Cuti Keguguran | Per Event | 45 | Female | yes | yes | no | Pasal 82(2) |
| Cuti Haid | Per Event | 2 | Female | no | yes | no | Pasal 81(1) |
| Cuti Menikah | Per Event | 3 | Any | no | yes | no | Pasal 93(4)a |
| Cuti Menikahkan Anak | Per Event | 2 | Any | no | yes | no | Pasal 93(4)b |
| Cuti Khitan Anak | Per Event | 2 | Any | no | yes | no | Pasal 93(4)c |
| Cuti Baptis Anak | Per Event | 2 | Any | no | yes | no | Pasal 93(4)d |
| Cuti Pendamping | Per Event | 2 | Male | no | yes | no | Pasal 93(4)e |
| Cuti Duka (Keluarga Inti) | Per Event | 2 | Any | no | yes | no | Pasal 93(4)f |
| Cuti Duka (Serumah) | Per Event | 1 | Any | no | yes | no | Pasal 93(4)g |

Notes baked into the patch as comments:
- **Maternity seeded at the 6-month ceiling (180)**, not the 3-month floor, so a legitimate
  proof-backed extension under UU 4/2024 isn't hard-blocked. Admin can lower to 90.
- Not seeded (available for admin to add later): Cuti Ibadah/Haji (Pasal 80 + 93(2)e),
  Izin Kewajiban Negara (93(2)d), Izin Tugas Serikat (93(2)), Cuti Besar/istirahat panjang
  (Pasal 79(4-5), now conditional post-Cipta-Kerja). Kept out to keep the default list focused.

**Backfill:** every existing `Attendance Exception` with `exception_type = "Leave"` and null
`leave_type` → set to **Cuti Tahunan** (the historical single pool), so quota math is
identical after migration. Pure UPDATE, idempotent.

## Enforcement messages (Bahasa)

- Over annual: `Sisa cuti tahunan Anda {n} hari, tidak cukup untuk {m} hari.`
- Over per-event: `{leave_name} maksimal {limit} hari per pengajuan.`
- Gender mismatch: `{leave_name} hanya untuk karyawan {gender_label}.`
- Gender unset: `Lengkapi jenis kelamin di profil Anda untuk mengajukan {leave_name}.`
- Missing proof: `{leave_name} wajib melampirkan lampiran pendukung.`
- Missing leave_type: `Pilih kategori cuti.`

## Compatibility / migration

- Legacy rows backfilled to Cuti Tahunan → no behavior change for existing quota.
- `effective_quota` / `prior_taken` continue to serve the default-annual type only.
- WFH untouched; attendance engine, approvals, notifications unchanged.

## Testing

- `leave_quota.py` pure self-check extended (per-event span, annual unchanged). Runs with
  `python leave_quota.py`, no bench.
- Live site has no test DB (project convention) → integration tests deferred; verify
  through real endpoints post-deploy (`list_leave_types`, a blocked request per kind).

## Deploy checklist

- `bench migrate` (new doctype + fields + seed/backfill patch)
- `bench restart` (Python: engine + API)
- Rebuild both frontends
- Regenerate docs data (`python3 scripts/gen_docs.py`) — new doctype + endpoints
- App Release row (What's New, Bahasa) after it ships — this is user-visible

## Ceilings summary (`ponytail:`)

- One default-annual type honours per-employee overrides; others use flat `day_limit`.
- Per-event caps request length, not yearly frequency.
- `paid` is display-only.
- Maternity extension is a raised ceiling + proof, not a two-tier 90/180 rule.
