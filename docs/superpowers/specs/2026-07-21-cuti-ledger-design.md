# Cuti Ledger — design spec

Date: 2026-07-21. Status: approved, implementing.

## Goal

Turn the annual leave (cuti) quota from a **live-derived** number into a **fully-materialized
append-only ledger**. Every grant, every approved cuti, every cuti-bersama day, and every HR
adjustment is a persisted row. Remaining leave = `SUM(days)` over the rows. Adds what the system
lacks today: HR can post manual adjustments (carry-over, bonus, correction) and users get a
running-balance statement.

This replaces the derive-from-exceptions logic in `attendance/leave_quota.py`.

## Decisions (locked with user 2026-07-21)

1. **Fully-materialized.** `remaining = SUM(ledger)`. Rip out derive-from-exceptions.
2. **Pending does NOT reserve.** Cuti debit minted only on **approval**; deleted on later
   reject/cancel. Over-booking is caught at the **second approval** (validate still throws), not at
   request time. Documented tradeoff.
3. **Cuti bersama materialized.** One row per employee × per cuti-bersama period; re-minted for all
   employees when the cuti-bersama source is edited.
4. **Grant via Jan-1 scheduler** + mint-on-Employee-Profile-create (new hires) + HR "re-mint grant"
   button (quota edits). Cron alone would miss mid-year hires and drift on quota edits; the two
   extras close that hole.

## Scope boundary

Only the **default-annual** leave type (`Leave Type.is_default_annual = 1`) flows through the ledger
— that is the quota "account". Per-Event and Documented leave types keep their existing per-request
ceilings in `check_request` unchanged; they are NOT a running balance and never mint ledger rows.

## Doctype: `Cuti Ledger`

Append-only. Empty controller (`pass` Document) — all logic in callers, exactly like `Point Ledger`.

| field | type | notes |
|---|---|---|
| `employee` | Link → User | reqd, indexed |
| `entry_type` | Select | `Grant\nCuti\nCuti Bersama\nCarry-over\nBonus\nCorrection` reqd |
| `leave_type` | Link → Leave Type | the default-annual type (for Grant/Cuti/Cuti Bersama rows) |
| `days` | Float | signed: Grant/Carry-over/Bonus `+`, Cuti/Cuti Bersama `−`, Correction `±` |
| `year` | Int | reqd, indexed — the annual slice this row belongs to |
| `exception` | Link → Attendance Exception | idempotency key for `Cuti` rows (unique-ish per exception) |
| `from_date` / `to_date` | Date | display span (Cuti / Cuti Bersama) |
| `reason` | Small Text | adjustment note / cuti-bersama label |
| `posted_by` | Link → User | audit (HR user or "Administrator" for auto rows) |
| `posted_on` | Datetime | audit |

Index on `(employee, year)`. No permlevel gymnastics — endpoints gate access.

## Balance computation (the one true formula)

```
remaining(employee, year) =
    SUM(Cuti Ledger.days WHERE employee, year)
    − cuti_bersama_days_still_derived?   # NO — cuti bersama is now materialized as rows, already in SUM
```

Since cuti bersama is materialized (decision 3), `remaining = SUM(days)` — nothing subtracted at
read. `effective_quota` is no longer a live divisor; it is the **input** to Grant minting only.

## Engine changes (`attendance/leave_quota.py`)

- New helper module `attendance/cuti_ledger.py` (or add to leave_quota.py) with:
  - `ensure_grant(employee, year)` — idempotent upsert of the Grant row from `effective_quota`.
    Keyed on `(employee, year, entry_type='Grant', leave_type=default_annual)`.
  - `mint_cuti(exception)` — on approval of a default-annual Leave exception, upsert a `Cuti` debit
    row keyed on `exception` name, `days = −working_days(employee, from, to)`.
  - `remove_cuti(exception)` — on reject/cancel, delete the `Cuti` row keyed on `exception`.
  - `mint_cuti_bersama(employee, period)` / re-mint-all on cuti-bersama source edit.
  - `post_adjustment(employee, entry_type, days, year, reason, posted_by)` — HR adjustments.
  - `remaining(employee, year)` / `balance_summary(employee, year)` — the SUM readers.
- Rewrite `check_request(...)`: for the default-annual type, compute `used`/`remaining` from
  `remaining(employee, year)` (ledger SUM) instead of `used_days + cuti_bersama + prior`. Keep
  gender/proof rules and Per-Event/Documented ceilings untouched.
- Rewrite `attendance_exception._check_leave_quota` (validate gate) to read ledger remaining.
- Rewrite `mobile._leave_balance(user)` → `{quota, used, remaining, prior, cuti_bersama}` sourced
  from ledger SUMs (quota = SUM of Grant+Carry-over+Bonus+Correction positives; used = −SUM of
  Cuti+Cuti Bersama; remaining = net). Keep the return keys identical so the boot payload/frontends
  don't break.

## Hooks (`hooks.py`)

- `doc_events`: Attendance Exception `on_update`/approval path → `mint_cuti` when it becomes
  Approved default-annual Leave; reject/cancel → `remove_cuti`. Employee Profile `after_insert` →
  `ensure_grant(current year)`. Cuti-bersama source doctype `on_update` → re-mint all.
- `scheduler_events.on_yearly` (or a `cron` on Jan 1) → `ensure_grant(all active employees, new year)`.

## API (`api/cuti_ledger.py`, `@frappe.whitelist()`)

Reuse the HR gate helper from `api/attendance.py` (HR Manager / System Manager).

- `get_cuti_ledger(employee=None, year=None)` → self (or any, if HR) — `{status, year, rows:[...],
  summary:{quota, used, remaining}}`. Rows carry a computed running `balance` for the statement UI,
  newest or oldest-first (oldest-first so running balance reads top-down).
- `post_cuti_adjustment(employee, entry_type, days, year, reason)` — HR only. `entry_type` ∈
  {Carry-over, Bonus, Correction}. reason reqd. Returns new row + summary.
- `remint_grant(employee, year)` — HR only. Re-runs `ensure_grant` (for quota edits). Returns summary.

## Migration patch (`patches/` + patches.txt), idempotent

Backfill in this order, each keyed for idempotency (safe to re-run):
1. Grant per (employee, year) from `effective_quota` — keyed `(employee, year, Grant)`.
2. Opening row from `Employee Profile.prior_leave_taken` for the current year — keyed
   `(employee, year, Correction, reason='opening prior_leave_taken')` — as a **debit** (prior taken
   reduces remaining).
3. Cuti per historical **Approved default-annual** Attendance Exception — keyed on `exception`.
4. Cuti Bersama per employee × period — keyed `(employee, year, Cuti Bersama, from_date)`.

**Verify after backfill:** for a sample of users, `remaining` from the new ledger == the old derived
`_leave_balance.remaining`. Log any drift. Do NOT go live if balances shift unexpectedly. Backup
first (live site, real balances — see memory `frappe-bench-delete-gotchas`).

## Frontends (both, per CLAUDE.md)

Shared logic in `frontend/src` (imported as `@` by web). Per-platform presentation.

- **Personal statement "Riwayat Cuti"**: list of ledger rows with running balance + summary card
  (quota / used / remaining). Mobile: on `MyInfoScreen` (or a linked sub-screen). Web: new personal
  card (web currently shows balance only in admin UserForm — add a personal one).
- **HR adjust UI**: form to post Carry-over / Bonus / Correction for an employee (+ "re-mint grant"
  button). Mobile: on the HR/admin leave screens. Web: on `Exceptions`/UserForm admin area.
- New endpoints wired in `frontend/src/lib/api.ts` (+ web mirror if separate).

## Ship chores

- Add `Cuti Ledger` to `scripts/gen_docs.py` CLUSTERS; run `python3 scripts/gen_docs.py`; commit
  `docs/assets/data.js`.
- `bench migrate` (doctype), `sudo /usr/local/bin/tj-restart` (Python), rebuild BOTH bundles.
- App Release (What's New) row after it is live — Bahasa, `Both`, published=1, semver bump.

## Known-hazard checklist (live data — verify, don't assume)

- **Double-count**: cuti debits must come ONLY from ledger rows after cutover — no path may still
  sum exceptions AND ledger. Grep every caller of `used_days`/`_leave_balance`/`check_request`.
- **Reject after approve**: `remove_cuti` must fire on every un-approve path (reject, cancel, delete,
  edit-back-to-pending). Miss one → phantom debit sticks.
- **Quota edit**: editing `annual_leave_quota` after the grant is minted does nothing until
  `remint_grant`. Wire the UserForm save to call it (or document the button).
- **Non-annual types**: must NOT mint rows and must NOT be summed into remaining.
- **Cuti-bersama edit**: re-mint must delete stale rows for removed/changed periods, not just add.
