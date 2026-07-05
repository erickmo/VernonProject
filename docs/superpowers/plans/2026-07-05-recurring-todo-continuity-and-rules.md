# Recurring Project Todo — Continuity + Richer Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Project Todo` richer recurrence rules (every-N, weekly-on-weekdays, monthly day-of-month, monthly Nth-weekday) and make the recurring *series* continuity-tracked and self-healing, with dates rolling forward relative to each occurrence.

**Architecture:** Enhance the existing occurrence chain (no new doctype). Pure, frappe-free date math lives in a new `recurrence.py` (unit-tested with no site). Generation is routed through one shared helper used by both the on-complete trigger and a rewritten self-healing daily scheduler; the migrating `next_occurrence` flag is retired and series state is derived. Frontend gets one shared `<RecurrenceEditor>` + `summarizeRecurrence`.

**Tech Stack:** Frappe (Python 3.11), MariaDB, React + TypeScript + Vite (frontend), TanStack Query.

## Global Constraints

- Doctype: `Project Todo` (standalone). App: `vernon_project`. Repo: `/home/frappe/frappe-bench/apps/vernon_project`.
- Live-deploy repo: **source-only commits, no worktrees, run implementers serially** (shared working tree). Do NOT `git commit` unless the human explicitly approves; each task's "Commit" step is staged for the human's go-ahead.
- Weekday codes are the CSV tokens `MON,TUE,WED,THU,FRI,SAT,SUN`; internal indexes are ISO `Monday=0 … Sunday=6` (Python `date.weekday()`).
- Status string constants already in the controller: Planned `"⚪️ Planned"`, Done `"🟠 Done"`, Checked `"🔷 Checked By PL"`, Completed `"✅ Completed"`, Cancelled `"🚫 Cancelled"`.
- Series root key everywhere: `COALESCE(NULLIF(original_todo,''), name)` — roots have empty `original_todo`; never a plain `GROUP BY original_todo`.
- `recurring_paused` is authoritative **on the series root**.
- Pure-lib test run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence`
- Site test run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module <dotted.module>` (confirm the app is installed on `dev.vernon.id`; if not, pick a site that has `vernon_project`).
- Frontend verify: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`

---

## File Structure

- **Create** `vernon_project/vernon_project/doctype/project_todo/recurrence.py` — pure date math (`Rule`, `next_occurrence`, `first_on_or_after`, weekday parsing).
- **Create** `vernon_project/vernon_project/doctype/project_todo/test_recurrence.py` — standalone (no-site) tests for the above.
- **Modify** `vernon_project/vernon_project/doctype/project_todo/project_todo.json` — new rule fields; `original_todo` Data→Link.
- **Modify** `vernon_project/vernon_project/doctype/project_todo/project_todo.py` — rule accessor, rewritten `calculate_next_occurrence`, rule validation, shared generation helpers, retire `next_occurrence` arming.
- **Create** `vernon_project/patches/v1_0/null_dangling_original_todo.py` + append to `vernon_project/patches.txt`.
- **Modify** `vernon_project/tasks.py` — self-healing `create_recurring_todos`.
- **Modify** `vernon_project/api/mobile.py` — detail `recurring{}` (rule fields + derived `state`/`next_fire`), `update_todo` allowlist.
- **Modify** `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`, `vernon_project/test_tasks.py` — generation/scheduler tests; drop `next_occurrence` assertions.
- **Create** `frontend/src/lib/recurrence.ts` — `Recurrence` type, `emptyRecurrence`, `serializeRecurrence`, `summarizeRecurrence`, `recurrenceFromDetail`.
- **Create** `frontend/src/components/RecurrenceEditor.tsx` — shared editor.
- **Modify** `frontend/src/lib/types.ts`, `frontend/src/components/CreateProjectItemSheet.tsx`, `frontend/src/pages/ProjectItemScreen.tsx`, `frontend/src/lib/duplicateTodo.ts`.

---

## Task 1: Doctype fields + Data→Link migration

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json`
- Create: `vernon_project/patches/v1_0/null_dangling_original_todo.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Produces (fields all `depends_on: "eval:doc.is_recurring==1"`): `recurring_interval` (Int, default 1), `recurring_weekdays` (Data), `recurring_monthly_mode` (Select `Day of Month\nNth Weekday`, default `Day of Month`), `recurring_day_of_month` (Int), `recurring_nth` (Select `First\nSecond\nThird\nFourth\nLast`, default `First`), `recurring_paused` (Check, default 0). `original_todo` becomes `Link` → `Project Todo` (keep `read_only:1, hidden:1`).

- [ ] **Step 1: Add the new fields to `project_todo.json`.** Insert into the `fields` array inside the existing `recurring_section` group (after `recurring_frequency`, before/around `recurring_until`/`column_break_recurring`), and add each new `fieldname` to `field_order`:

```json
{ "fieldname": "recurring_interval", "fieldtype": "Int", "label": "Repeat Every (N)", "default": "1", "depends_on": "eval:doc.is_recurring==1" },
{ "fieldname": "recurring_weekdays", "fieldtype": "Data", "label": "Weekdays (CSV MON,THU)", "depends_on": "eval:doc.recurring_frequency=='Weekly' || (doc.recurring_frequency=='Monthly' && doc.recurring_monthly_mode=='Nth Weekday')" },
{ "fieldname": "recurring_monthly_mode", "fieldtype": "Select", "label": "Monthly Mode", "options": "Day of Month\nNth Weekday", "default": "Day of Month", "depends_on": "eval:doc.recurring_frequency=='Monthly'" },
{ "fieldname": "recurring_day_of_month", "fieldtype": "Int", "label": "Day of Month (1-31)", "depends_on": "eval:doc.recurring_frequency=='Monthly' && doc.recurring_monthly_mode=='Day of Month'" },
{ "fieldname": "recurring_nth", "fieldtype": "Select", "label": "Nth Weekday", "options": "First\nSecond\nThird\nFourth\nLast", "default": "First", "depends_on": "eval:doc.recurring_frequency=='Monthly' && doc.recurring_monthly_mode=='Nth Weekday'" },
{ "fieldname": "recurring_paused", "fieldtype": "Check", "label": "Paused", "default": "0", "depends_on": "eval:doc.is_recurring==1" }
```

- [ ] **Step 2: Change `original_todo` to a Link.** Find its field def (currently `"fieldtype": "Data"`, `read_only:1`, `hidden:1`) and change to:

```json
{ "fieldname": "original_todo", "fieldtype": "Link", "label": "Original Todo", "options": "Project Todo", "read_only": 1, "hidden": 1 }
```

- [ ] **Step 3: Write the dangling-null patch** at `vernon_project/patches/v1_0/null_dangling_original_todo.py`:

```python
# Null any original_todo that doesn't resolve to an existing Project Todo, so the
# Data->Link conversion never fails link validation on a later save.
import frappe


def execute():
    frappe.db.sql(
        """
        UPDATE `tabProject Todo` t
        LEFT JOIN `tabProject Todo` r ON r.name = t.original_todo
        SET t.original_todo = NULL
        WHERE t.original_todo IS NOT NULL AND t.original_todo != '' AND r.name IS NULL
        """
    )
```

- [ ] **Step 4: Register the patch.** Append to `vernon_project/patches.txt` (under the post-migrate section, at the end):

```
vernon_project.patches.v1_0.null_dangling_original_todo
```

- [ ] **Step 5: Apply + verify schema and data.**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site dev.vernon.id migrate
bench --site dev.vernon.id console <<'PY'
import frappe
meta = frappe.get_meta("Project Todo")
for f in ["recurring_interval","recurring_weekdays","recurring_monthly_mode","recurring_day_of_month","recurring_nth","recurring_paused"]:
    assert meta.get_field(f), f"missing {f}"
assert meta.get_field("original_todo").fieldtype == "Link", "original_todo not Link"
bad = frappe.db.sql("""SELECT COUNT(*) FROM `tabProject Todo` t LEFT JOIN `tabProject Todo` r ON r.name=t.original_todo WHERE t.original_todo IS NOT NULL AND t.original_todo!='' AND r.name IS NULL""")[0][0]
assert bad == 0, f"{bad} dangling original_todo remain"
print("schema+data OK")
PY
```
Expected: `schema+data OK`.

- [ ] **Step 6: Commit (staged for human approval).**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/patches/v1_0/null_dangling_original_todo.py vernon_project/patches.txt
git commit -m "feat(recurring): add rule fields; original_todo Data->Link + dangling-null patch"
```

---

## Task 2: Pure recurrence date library (fully TDD, no site)

**Files:**
- Create: `vernon_project/vernon_project/doctype/project_todo/recurrence.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_recurrence.py`

**Interfaces:**
- Produces:
  - `parse_weekdays(csv: str) -> list[int]` (sorted ISO idxs; raises `ValueError` on unknown token; empty→`[]`)
  - `format_weekdays(idxs) -> str` (canonical CSV)
  - `@dataclass Rule(frequency, interval=1, weekdays=(), monthly_mode="Day of Month", day_of_month=None, nth="First")` with `.normalized()`
  - `next_occurrence(from_deadline: date, rule: Rule) -> date | None`
  - `first_on_or_after(day: date, rule: Rule) -> date`

- [ ] **Step 1: Write the failing tests** at `test_recurrence.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# Standalone (no-site) check of recurrence date math.
# Run: cd apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence
from datetime import date

from vernon_project.vernon_project.doctype.project_todo.recurrence import (
    Rule, next_occurrence, first_on_or_after, parse_weekdays, format_weekdays,
)

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def _r(**kw):
    return Rule(**kw)


def test_parse_weekdays():
    assert parse_weekdays("") == []
    assert parse_weekdays(None) == []
    assert parse_weekdays("thu,mon") == [MON, THU]
    assert parse_weekdays("MON, MON ,thu") == [MON, THU]
    assert format_weekdays([THU, MON]) == "MON,THU"
    try:
        parse_weekdays("FUN"); assert False
    except ValueError:
        pass


def test_daily():
    assert next_occurrence(date(2026, 7, 5), _r(frequency="Daily")) == date(2026, 7, 6)
    assert next_occurrence(date(2026, 7, 5), _r(frequency="Daily", interval=3)) == date(2026, 7, 8)


def test_weekly_legacy_plus7_all_start_days():
    # Empty weekdays must collapse to +7*interval for every start weekday incl Sunday.
    for start in range(7):
        d = date(2026, 7, 6 + start)  # 2026-07-06 is a Monday
        assert next_occurrence(d, _r(frequency="Weekly")) == date(2026, 7, 13 + start)
        assert next_occurrence(d, _r(frequency="Weekly", interval=2)) == date(2026, 7, 20 + start)


def test_weekly_strictly_after():
    # from_deadline lands on a selected weekday -> next must NOT equal it.
    d = date(2026, 7, 6)  # Monday
    n = next_occurrence(d, _r(frequency="Weekly", weekdays=(MON, THU)))
    assert n == date(2026, 7, 9) and n != d  # Thu same week


def test_weekly_multiweekday_interval2_no_dropped_days():
    # Mon+Thu every 2 weeks: Mon, Thu, (skip a week), Mon, Thu — no Monday dropped.
    r = _r(frequency="Weekly", weekdays=(MON, THU), interval=2)
    d = date(2026, 7, 6)  # Mon w0
    d = next_occurrence(d, r); assert d == date(2026, 7, 9)   # Thu w0
    d = next_occurrence(d, r); assert d == date(2026, 7, 20)  # Mon w2
    d = next_occurrence(d, r); assert d == date(2026, 7, 23)  # Thu w2
    d = next_occurrence(d, r); assert d == date(2026, 8, 3)   # Mon w4


def test_monthly_day_of_month_fixed_anchor_restores():
    r = _r(frequency="Monthly", day_of_month=31)
    d = date(2026, 1, 31)
    d = next_occurrence(d, r); assert d == date(2026, 2, 28)  # clamp
    d = next_occurrence(d, r); assert d == date(2026, 3, 31)  # RESTORE to 31
    d = next_occurrence(d, r); assert d == date(2026, 4, 30)


def test_monthly_day_of_month_legacy_drifts():
    # Empty anchor: derives from occurrence deadline day (preserves old clamp-drift).
    r = _r(frequency="Monthly")
    d = date(2026, 1, 31)
    d = next_occurrence(d, r); assert d == date(2026, 2, 28)
    d = next_occurrence(d, r); assert d == date(2026, 3, 28)  # stuck on 28 (legacy)


def test_monthly_day_interval3():
    r = _r(frequency="Monthly", day_of_month=15, interval=3)
    assert next_occurrence(date(2026, 1, 15), r) == date(2026, 4, 15)


def test_monthly_nth_weekday():
    # 2nd Tuesday each month.
    r = _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(TUE,), nth="Second")
    assert next_occurrence(date(2026, 1, 13), r) == date(2026, 2, 10)
    # Last Friday.
    r2 = _r(frequency="Monthly", monthly_mode="Nth Weekday", weekdays=(FRI,), nth="Last")
    assert next_occurrence(date(2026, 1, 30), r2) == date(2026, 2, 27)


def test_first_on_or_after():
    r = _r(frequency="Weekly", weekdays=(MON, THU))
    assert first_on_or_after(date(2026, 7, 7), r) == date(2026, 7, 9)  # Tue -> Thu
    rm = _r(frequency="Monthly", day_of_month=15)
    assert first_on_or_after(date(2026, 7, 20), rm) == date(2026, 8, 15)


def _run():
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print(f"{name} ok")


if __name__ == "__main__":
    _run()
```

- [ ] **Step 2: Run to verify failure.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence`
Expected: `ModuleNotFoundError: ... recurrence` (module not yet created).

- [ ] **Step 3: Implement `recurrence.py`:**

```python
# Copyright (c) 2026, Vernon and contributors
# Pure, frappe-free recurrence date math for Project Todo.
# Tests: python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]  # ISO Mon=0..Sun=6
_IDX = {c: i for i, c in enumerate(_CODES)}
_NTH = {"First": 1, "Second": 2, "Third": 3, "Fourth": 4, "Last": -1}


def parse_weekdays(csv):
    if not csv:
        return []
    out = set()
    for tok in str(csv).split(","):
        t = tok.strip().upper()
        if not t:
            continue
        if t not in _IDX:
            raise ValueError(f"Unknown weekday: {tok!r}")
        out.add(_IDX[t])
    return sorted(out)


def format_weekdays(idxs):
    return ",".join(_CODES[i] for i in sorted(set(idxs)))


@dataclass
class Rule:
    frequency: str
    interval: int = 1
    weekdays: tuple = ()
    monthly_mode: str = "Day of Month"
    day_of_month: "int | None" = None
    nth: str = "First"

    def normalized(self):
        return Rule(
            frequency=self.frequency,
            interval=max(1, int(self.interval or 1)),
            weekdays=tuple(sorted(set(self.weekdays or ()))),
            monthly_mode=self.monthly_mode or "Day of Month",
            day_of_month=(int(self.day_of_month) if self.day_of_month else None),
            nth=self.nth or "First",
        )


def _dim(y, m):
    return calendar.monthrange(y, m)[1]


def _add_months(y, m, n):
    idx = (m - 1) + n
    return y + idx // 12, idx % 12 + 1


def _nth_weekday(y, m, weekday, nth):
    n = _NTH[nth]
    if n == -1:
        d = date(y, m, _dim(y, m))
        return d - timedelta(days=(d.weekday() - weekday) % 7)
    first = date(y, m, 1)
    return first + timedelta(days=((weekday - first.weekday()) % 7) + 7 * (n - 1))


def _weekly(frm, r):
    wds = sorted(set(r.weekdays)) or [frm.weekday()]
    for wd in wds:
        cand = frm + timedelta(days=(wd - frm.weekday()))
        if cand > frm:  # strictly after, same ISO week
            return cand
    monday = frm - timedelta(days=frm.weekday())
    return (monday + timedelta(days=7 * r.interval)) + timedelta(days=wds[0])


def _monthly_day(frm, r):
    y, m = _add_months(frm.year, frm.month, r.interval)
    anchor = r.day_of_month or frm.day
    return date(y, m, min(anchor, _dim(y, m)))


def _monthly_nth(frm, r):
    y, m = _add_months(frm.year, frm.month, r.interval)
    wd = r.weekdays[0] if r.weekdays else frm.weekday()
    return _nth_weekday(y, m, wd, r.nth)


def next_occurrence(from_deadline, rule):
    r = rule.normalized()
    if r.frequency == "Daily":
        return from_deadline + timedelta(days=r.interval)
    if r.frequency == "Weekly":
        return _weekly(from_deadline, r)
    if r.frequency == "Monthly":
        return _monthly_nth(from_deadline, r) if r.monthly_mode == "Nth Weekday" else _monthly_day(from_deadline, r)
    return None


def first_on_or_after(day, rule):
    """First rule-matching date on/after `day` (ignores interval phase; used on resume)."""
    r = rule.normalized()
    if r.frequency == "Daily":
        return day
    if r.frequency == "Weekly":
        wds = sorted(set(r.weekdays)) or [day.weekday()]
        for i in range(7):
            d = day + timedelta(days=i)
            if d.weekday() in wds:
                return d
    if r.frequency == "Monthly":
        y, m = day.year, day.month
        for _ in range(2):
            if r.monthly_mode == "Nth Weekday":
                wd = r.weekdays[0] if r.weekdays else day.weekday()
                d = _nth_weekday(y, m, wd, r.nth)
            else:
                anchor = r.day_of_month or day.day
                d = date(y, m, min(anchor, _dim(y, m)))
            if d >= day:
                return d
            y, m = _add_months(y, m, 1)
    return day
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence`
Expected: each `test_* ok` line, no assertion errors.

- [ ] **Step 5: Commit (staged).**

```bash
git add vernon_project/vernon_project/doctype/project_todo/recurrence.py vernon_project/vernon_project/doctype/project_todo/test_recurrence.py
git commit -m "feat(recurring): pure frappe-free recurrence date lib + tests"
```

---

## Task 3: Controller — rule accessor, `calculate_next_occurrence` rewrite, rule validation, retire arming

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`

**Interfaces:**
- Consumes: `recurrence.Rule`, `recurrence.next_occurrence`, `recurrence.parse_weekdays`, `recurrence.format_weekdays`.
- Produces (methods on `ProjectTodo`): `_rule() -> Rule`; `calculate_next_occurrence(from_date) -> date | None` (unchanged signature — reads the rule off `self`); `validate_recurrence_rule()`.

- [ ] **Step 1: Add the rule accessor + rewrite `calculate_next_occurrence`.** Replace the existing `calculate_next_occurrence` (currently ~lines 635-649) with:

```python
    def _rule(self):
        from .recurrence import Rule, parse_weekdays
        return Rule(
            frequency=self.recurring_frequency,
            interval=self.recurring_interval or 1,
            weekdays=tuple(parse_weekdays(self.recurring_weekdays)),
            monthly_mode=self.recurring_monthly_mode or "Day of Month",
            day_of_month=int(self.recurring_day_of_month) if self.recurring_day_of_month else None,
            nth=self.recurring_nth or "First",
        )

    def calculate_next_occurrence(self, from_date):
        """Next occurrence date from `from_date` using this todo's rule. None if not recurring."""
        from .recurrence import next_occurrence
        if not from_date or not self.recurring_frequency:
            return None
        return next_occurrence(getdate(from_date), self._rule())
```

- [ ] **Step 2: Add rule validation.** Add this method and call it from `validate()` (add `self.validate_recurrence_rule()` in the `validate()` body, near the other validators):

```python
    def validate_recurrence_rule(self):
        if not self.is_recurring:
            return
        from .recurrence import parse_weekdays, format_weekdays
        self.recurring_interval = max(1, int(self.recurring_interval or 1))
        idxs = parse_weekdays(self.recurring_weekdays)  # raises on bad token
        self.recurring_weekdays = format_weekdays(idxs)
        if self.recurring_day_of_month:
            d = int(self.recurring_day_of_month)
            if d < 1 or d > 31:
                frappe.throw(_("Day of month must be between 1 and 31."))
        if self.recurring_frequency == "Monthly" and self.recurring_monthly_mode == "Nth Weekday" and len(idxs) != 1:
            frappe.throw(_("Nth-weekday recurrence needs exactly one weekday."))
```

- [ ] **Step 3: Retire the `next_occurrence` arming.** Delete the re-arm block in `validate()` (currently ~lines 26-35, the `if self.is_recurring and ... not self.next_occurrence ...: self.next_occurrence = self.calculate_next_occurrence(self.deadline)` block). It is replaced by the self-heal scheduler in Task 5.

- [ ] **Step 4: Verify import + syntax.**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id console <<'PY'
import frappe
d = frappe.new_doc("Project Todo")
d.recurring_frequency = "Weekly"; d.recurring_weekdays = "thu,mon"; d.is_recurring = 1
d.validate_recurrence_rule()
assert d.recurring_weekdays == "MON,THU", d.recurring_weekdays
from datetime import date
assert d.calculate_next_occurrence(date(2026,7,6)) == date(2026,7,9)
print("controller rule OK")
PY`
Expected: `controller rule OK`.

- [ ] **Step 5: Commit (staged).**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py
git commit -m "feat(recurring): rule accessor + rich calculate_next_occurrence + validation; retire next_occurrence arming"
```

---

## Task 4: Controller — shared generation helpers + route on-complete through them

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

**Interfaces:**
- Produces (module-level functions): `series_root(name, original_todo)`, `latest_occurrence(root) -> frappe._dict|None`, `occurrence_exists(root, deadline) -> bool`, `generate_next(anchor, force=False) -> Document|None`, `build_occurrence(anchor, next_date) -> Document`.
- `generate_next` guarantees: honors root `recurring_paused`, `recurring_until`, resume-clamp (no backfill), the "don't over-generate ahead" gate (only when `force` or `next_date <= today`), series-root row lock + `(series_root, deadline)` dedup.

- [ ] **Step 1: Write failing tests.** Append to `test_project_todo.py` (reuse the file's existing fixture helpers for creating a project/detail/group + a todo; mirror how existing recurring tests build one). Add:

```python
    def test_oncomplete_generates_next_with_rule_and_shift(self):
        t = self._make_recurring_todo(frequency="Weekly", weekdays="MON,THU",
                                      start_date="2026-07-06", deadline="2026-07-06",
                                      leader_deadline="2026-07-07")
        t.status = "✅ Completed"; t.save(ignore_permissions=True)
        nxt = frappe.get_all("Project Todo", filters={"original_todo": t.name}, fields=["deadline","start_date","leader_deadline"])
        assert nxt and str(nxt[0].deadline) == "2026-07-09", nxt   # Thu same week
        # span + leader delta preserved (all +3 days)
        assert str(nxt[0].start_date) == "2026-07-09" and str(nxt[0].leader_deadline) == "2026-07-10", nxt

    def test_paused_blocks_oncomplete(self):
        t = self._make_recurring_todo(frequency="Daily", start_date="2026-07-06", deadline="2026-07-06")
        frappe.db.set_value("Project Todo", t.name, "recurring_paused", 1)
        t.reload(); t.status = "✅ Completed"; t.save(ignore_permissions=True)
        assert not frappe.get_all("Project Todo", filters={"original_todo": t.name}), "paused series generated"
```

Add a `_make_recurring_todo(**over)` helper to the test class that builds a valid Planned `Project Todo` (fill the required group/level/project_detail from existing fixtures) with `is_recurring=1` and the passed rule fields.

- [ ] **Step 2: Run to verify failure.**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
Expected: FAIL (`generate_next`/helpers not defined, or no child created).

- [ ] **Step 3: Implement the helpers** (module-level, place near `create_next_occurrence`). Also add the `nowdate` import if missing (already imported).

```python
_ROLL = ("name, project_detail, to_do, assigned_to, start_date, deadline, leader_deadline, "
         "owner_deadline, estimated, notes, `group`, level, level_id, status, is_recurring, "
         "recurring_frequency, recurring_interval, recurring_weekdays, recurring_monthly_mode, "
         "recurring_day_of_month, recurring_nth, recurring_until, original_todo")


def series_root(name, original_todo):
    return original_todo or name


def latest_occurrence(root):
    rows = frappe.db.sql(
        f"SELECT {_ROLL} FROM `tabProject Todo` WHERE name=%(r)s OR original_todo=%(r)s "
        "ORDER BY deadline DESC, creation DESC LIMIT 1",
        {"r": root}, as_dict=True,
    )
    return rows[0] if rows else None


def occurrence_exists(root, deadline):
    return bool(frappe.db.sql(
        "SELECT 1 FROM `tabProject Todo` WHERE (name=%(r)s OR original_todo=%(r)s) "
        "AND deadline=%(d)s LIMIT 1",
        {"r": root, "d": deadline},
    ))


def build_occurrence(anchor, next_date):
    old_dl = getdate(anchor.deadline)
    delta = (getdate(next_date) - old_dl).days

    def shift(v):
        return add_days(getdate(v), delta) if v else None

    doc = frappe.get_doc({
        "doctype": "Project Todo",
        "project_detail": anchor.project_detail,
        "to_do": anchor.to_do,
        "assigned_to": anchor.assigned_to,
        # start_date is effectively required; keep the span, fall back to next_date.
        "start_date": shift(anchor.start_date) or next_date,
        "deadline": next_date,
        "leader_deadline": shift(anchor.leader_deadline),
        "owner_deadline": shift(anchor.owner_deadline),
        "estimated": anchor.estimated,
        "notes": anchor.notes,
        "group": anchor.get("group"),
        "level": anchor.level,
        "level_id": anchor.level_id,
        "is_recurring": 1,
        "recurring_frequency": anchor.recurring_frequency,
        "recurring_interval": anchor.recurring_interval,
        "recurring_weekdays": anchor.recurring_weekdays,
        "recurring_monthly_mode": anchor.recurring_monthly_mode,
        "recurring_day_of_month": anchor.recurring_day_of_month,
        "recurring_nth": anchor.recurring_nth,
        "recurring_until": anchor.recurring_until,
        "original_todo": series_root(anchor.name, anchor.original_todo),
        "status": "⚪️ Planned",
    })
    doc.insert(ignore_permissions=True)
    return doc


def generate_next(anchor, force=False):
    """Idempotent single-step roll-forward for a series. Returns the new doc or None.

    force=True (on-complete): queue the successor immediately.
    force=False (scheduler): only when the computed date has arrived (<= today), so a
    still-open future occurrence is never pre-generated.
    """
    if not anchor or not anchor.is_recurring or not anchor.recurring_frequency:
        return None
    root = series_root(anchor.name, anchor.original_todo)
    if frappe.db.get_value("Project Todo", root, "recurring_paused"):
        return None
    head = frappe.get_doc("Project Todo", anchor.name)
    next_date = head.calculate_next_occurrence(anchor.deadline)
    if not next_date:
        return None
    next_date = getdate(next_date)
    today = getdate(nowdate())
    if next_date < today:  # long gap / resume: skip the missed window, don't backfill
        from .recurrence import first_on_or_after
        next_date = getdate(first_on_or_after(today, head._rule()))
    if anchor.recurring_until and next_date > getdate(anchor.recurring_until):
        return None
    if not force and next_date > today:
        return None
    # Serialize the on-complete txn and the scheduler txn on the series root, then dedup.
    frappe.db.sql("SELECT name FROM `tabProject Todo` WHERE name=%s FOR UPDATE", root)
    if occurrence_exists(root, next_date):
        return None
    return build_occurrence(anchor, next_date)
```

- [ ] **Step 4: Route the on-complete path through `generate_next`.** In `on_change`, replace the `if self.is_recurring: self.create_next_occurrence()` call with:

```python
                if self.is_recurring:
                    generate_next(self, force=True)
```

Then delete the now-unused `create_next_occurrence` method (its logic is fully replaced by `generate_next` + `build_occurrence`).

- [ ] **Step 5: Run tests to verify they pass.**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
Expected: PASS (new tests + existing suite; update any existing test that asserted on `next_occurrence` — see Task 5 Step 6).

- [ ] **Step 6: Commit (staged).**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat(recurring): shared generate_next/build_occurrence; route on-complete; paused+shift"
```

---

## Task 5: Self-healing daily scheduler

**Files:**
- Modify: `vernon_project/tasks.py`
- Test: `vernon_project/test_tasks.py` (or a site-based `test_recurring_scheduler.py` if the current `test_tasks.py` is no-site only — see Step 1)

**Interfaces:**
- Consumes: `project_todo.series_root/latest_occurrence/generate_next`.
- Produces: rewritten `create_recurring_todos() -> int`.

- [ ] **Step 1: Write failing tests.** The existing `test_tasks.py` is a no-site module (`_due_message`). Scheduler tests need a site, so add them to `test_project_todo.py`'s site-based `TestCase` (keeps one site suite) as new methods:

```python
    def test_scheduler_self_heals_after_intermediate_delete(self):
        # Build a 3-occurrence daily chain, delete the middle, scheduler still advances.
        root = self._make_recurring_todo(frequency="Daily", start_date="2026-07-01", deadline="2026-07-01")
        from vernon_project.vernon_project.doctype.project_todo.project_todo import build_occurrence, latest_occurrence
        # simulate two past occurrences by direct build off latest
        # (freeze "today" by choosing deadlines <= today at run; use recent dates)
        # ... assert create_recurring_todos() creates the next after deleting an intermediate.

    def test_scheduler_does_not_backfill_after_pause(self):
        # Pause, let time gap, resume -> next fire clamped to >= today (no burst).
        ...
```

Keep these focused; the pure date math is already covered in Task 2. At minimum assert: (a) a series with a past-due latest occurrence gets exactly one new occurrence on a scheduler run; (b) a paused series gets none; (c) an ended (past `recurring_until`) series gets none.

- [ ] **Step 2: Run to verify failure.**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
Expected: FAIL.

- [ ] **Step 3: Rewrite `create_recurring_todos`** in `tasks.py` (replace the whole function):

```python
def create_recurring_todos():
    """Daily: roll each active recurring series forward by one step when due.

    Keys off the LATEST occurrence per series (COALESCE(original_todo,name)) rather than a
    migrating next_occurrence flag, so a deleted/cancelled occurrence cannot strand the series.
    generate_next() enforces paused/until/resume-clamp/dedup internally.
    """
    from vernon_project.vernon_project.doctype.project_todo.project_todo import (
        latest_occurrence, generate_next,
    )

    roots = frappe.db.sql(
        """
        SELECT DISTINCT COALESCE(NULLIF(original_todo,''), name) AS root
        FROM `tabProject Todo`
        WHERE is_recurring = 1 AND recurring_frequency IS NOT NULL AND recurring_frequency != ''
        """,
        as_dict=True,
    )

    created = 0
    for r in roots:
        try:
            anchor = latest_occurrence(r.root)
            if anchor and generate_next(anchor):  # scheduler path: force=False
                created += 1
                frappe.db.commit()
        except Exception as e:
            frappe.db.rollback()
            frappe.log_error(f"Error creating recurring todo: {e}", "Recurring Todo Error")

    if created:
        frappe.logger().info(f"Created {created} recurring todos")
    return created
```

Remove the now-dead imports in `tasks.py` if `add_days`/`getdate` are no longer used by this function (keep those still used by `notify_*`).

- [ ] **Step 4: Run tests to verify they pass.**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo`
Expected: PASS.

- [ ] **Step 5: Confirm the no-site `test_tasks.py` still passes** (unchanged `_due_message`).

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.test_tasks`
Expected: `test_due_message ok`.

- [ ] **Step 6: Purge stale `next_occurrence` assertions.** Grep and fix any test asserting the old arming behavior:

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && grep -rn "next_occurrence" vernon_project --include=test_*.py`
For each hit that asserts arming, replace with an assertion on the generated occurrence (via `original_todo` series query). Re-run the module.

- [ ] **Step 7: Commit (staged).**

```bash
git add vernon_project/tasks.py vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat(recurring): self-healing latest-occurrence scheduler; drop next_occurrence flag"
```

---

## Task 6: API — detail `recurring{}` (rule + derived state) and `update_todo` allowlist

**Files:**
- Modify: `vernon_project/api/mobile.py`
- Test: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Produces: detail `shaped["recurring"]` gains `interval, weekdays, monthly_mode, day_of_month, nth, paused, state, next_fire`; `update_todo` accepts + persists the six new rule params (paused written to the series root).

- [ ] **Step 1: Widen the detail fetch.** In the detail endpoint, extend the `extra = frappe.get_value("Project Todo", project_item, [...])` field list (currently `is_recurring, recurring_frequency, recurring_until, original_todo`) to also fetch: `recurring_interval, recurring_weekdays, recurring_monthly_mode, recurring_day_of_month, recurring_nth, recurring_paused`.

- [ ] **Step 2: Build the widened `recurring{}` + derived state.** Replace the `shaped["recurring"] = {...}` block with (place it AFTER the `sib` occurrence list is built so `sib` is in scope; `sib` is sorted deadline ASC):

```python
    is_rec = bool(extra.get("is_recurring"))
    root_name = extra.get("original_todo") or project_item
    paused = bool(frappe.db.get_value("Project Todo", root_name, "recurring_paused"))
    next_fire = None
    if is_rec and sib:
        latest = sib[-1]  # max deadline
        head = frappe.get_doc("Project Todo", latest["name"])
        nf = head.calculate_next_occurrence(latest["deadline"])
        next_fire = str(nf) if nf else None
    until = extra.get("recurring_until")
    ended = is_rec and (next_fire is None or (until and getdate(next_fire) > getdate(until)))
    shaped["recurring"] = {
        "is_recurring": is_rec,
        "frequency": extra.get("recurring_frequency"),
        "interval": extra.get("recurring_interval") or 1,
        "weekdays": extra.get("recurring_weekdays") or "",
        "monthly_mode": extra.get("recurring_monthly_mode") or "Day of Month",
        "day_of_month": extra.get("recurring_day_of_month"),
        "nth": extra.get("recurring_nth") or "First",
        "until": str(until) if until else None,
        "paused": paused,
        "state": (None if not is_rec else ("paused" if paused else ("ended" if ended else "active"))),
        "next_fire": next_fire,
    }
```

- [ ] **Step 3: Extend `update_todo`.** Add the six params to the function signature (`recurring_interval=None, recurring_weekdays=None, recurring_monthly_mode=None, recurring_day_of_month=None, recurring_nth=None, recurring_paused=None`). In the body's recurring-assignment block, set the rule fields on `row` when recurring, and write pause to the series root; remove the old `next_occurrence` re-arm lines:

```python
        row.recurring_interval = cint(recurring_interval) or 1
        row.recurring_weekdays = recurring_weekdays or ""
        row.recurring_monthly_mode = recurring_monthly_mode or "Day of Month"
        row.recurring_day_of_month = cint(recurring_day_of_month) or None
        row.recurring_nth = recurring_nth or "First"
        # pause is a series-level flag, stored on the root
        from vernon_project.vernon_project.doctype.project_todo.project_todo import series_root
        frappe.db.set_value("Project Todo", series_root(row.name, row.original_todo),
                            "recurring_paused", cint(recurring_paused))
```

Ensure `cint` is imported from `frappe.utils`. When `is_recurring` is turned off, also clear the new rule fields (mirror the existing frequency/until clear).

- [ ] **Step 4: Write + run an API test** in `test_mobile.py` asserting the detail returns the new keys and `update_todo` persists a Weekly/MON,THU rule and paused=1 on the root. Run:

`cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 5: Commit (staged).**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(recurring): API detail rule fields + derived series state; update_todo allowlist"
```

---

## Task 7: Frontend — `recurrence.ts` helpers + `<RecurrenceEditor>` + types

**Files:**
- Create: `frontend/src/lib/recurrence.ts`
- Create: `frontend/src/components/RecurrenceEditor.tsx`
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Produces: `Recurrence` type, `emptyRecurrence`, `serializeRecurrence(r): Record<string,unknown>`, `summarizeRecurrence(r): string`, `recurrenceFromDetail(d): Recurrence`; `<RecurrenceEditor value onChange />`.

- [ ] **Step 1: Widen the detail type.** In `types.ts`, replace the `recurring:` shape on `ProjectItemDetail` with:

```ts
  recurring: {
    is_recurring: boolean
    frequency: string | null
    interval: number
    weekdays: string
    monthly_mode: string
    day_of_month: number | null
    nth: string
    until: string | null
    paused: boolean
    state: 'active' | 'paused' | 'ended' | null
    next_fire: string | null
  }
```

- [ ] **Step 2: Create `recurrence.ts`:**

```ts
export type Frequency = 'Daily' | 'Weekly' | 'Monthly'
export type MonthlyMode = 'Day of Month' | 'Nth Weekday'
export type Nth = 'First' | 'Second' | 'Third' | 'Fourth' | 'Last'

export interface Recurrence {
  isRecurring: boolean
  frequency: Frequency
  interval: number
  weekdays: string // CSV MON,THU
  monthlyMode: MonthlyMode
  dayOfMonth: number | null
  nth: Nth
  until: string
}

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export const emptyRecurrence: Recurrence = {
  isRecurring: false, frequency: 'Daily', interval: 1, weekdays: '',
  monthlyMode: 'Day of Month', dayOfMonth: null, nth: 'First', until: '',
}

export function serializeRecurrence(r: Recurrence): Record<string, unknown> {
  if (!r.isRecurring) return { is_recurring: 0 }
  return {
    is_recurring: 1,
    recurring_frequency: r.frequency,
    recurring_interval: r.interval || 1,
    recurring_weekdays: r.frequency === 'Weekly' || (r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday') ? r.weekdays : '',
    recurring_monthly_mode: r.frequency === 'Monthly' ? r.monthlyMode : 'Day of Month',
    recurring_day_of_month: r.frequency === 'Monthly' && r.monthlyMode === 'Day of Month' ? r.dayOfMonth : null,
    recurring_nth: r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday' ? r.nth : 'First',
    ...(r.until ? { recurring_until: r.until } : {}),
  }
}

const WD_LABEL: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }

export function summarizeRecurrence(r: Recurrence): string {
  if (!r.isRecurring) return ''
  const n = r.interval || 1
  const every = (unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`)
  if (r.frequency === 'Daily') return every('day')
  if (r.frequency === 'Weekly') {
    const days = r.weekdays ? r.weekdays.split(',').map((d) => WD_LABEL[d] ?? d).join(', ') : ''
    return days ? `${every('week')} on ${days}` : every('week')
  }
  if (r.monthlyMode === 'Nth Weekday') {
    const day = r.weekdays ? (WD_LABEL[r.weekdays.split(',')[0]] ?? '') : ''
    return `${r.nth} ${day} ${every('month')}`
  }
  return `${every('month')}${r.dayOfMonth ? ` on day ${r.dayOfMonth}` : ''}`
}

export function recurrenceFromDetail(d: {
  is_recurring: boolean; frequency: string | null; interval?: number; weekdays?: string
  monthly_mode?: string; day_of_month?: number | null; nth?: string; until?: string | null
}): Recurrence {
  return {
    isRecurring: !!d.is_recurring,
    frequency: (d.frequency as Frequency) || 'Daily',
    interval: d.interval || 1,
    weekdays: d.weekdays || '',
    monthlyMode: (d.monthly_mode as MonthlyMode) || 'Day of Month',
    dayOfMonth: d.day_of_month ?? null,
    nth: (d.nth as Nth) || 'First',
    until: d.until ?? '',
  }
}
```

- [ ] **Step 3: Create `RecurrenceEditor.tsx`** — a controlled editor. Enforce single-weekday in Nth mode (radio-style) and multi in Weekly. Match the create sheet's field styling (`SearchableSelect` for frequency; native inputs otherwise):

```tsx
import { SearchableSelect } from '@/components/SearchableSelect'
import { WEEKDAYS, type Recurrence } from '@/lib/recurrence'

const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

export function RecurrenceEditor({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch })
  const isNth = value.frequency === 'Monthly' && value.monthlyMode === 'Nth Weekday'
  const showWeekdays = value.frequency === 'Weekly' || isNth
  const selected = new Set(value.weekdays ? value.weekdays.split(',') : [])
  const toggleDay = (d: string) => {
    if (isNth) return set({ weekdays: d }) // exactly one
    const next = new Set(selected); next.has(d) ? next.delete(d) : next.add(d)
    set({ weekdays: WEEKDAYS.filter((w) => next.has(w)).join(',') })
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={value.isRecurring} onChange={(e) => set({ isRecurring: e.target.checked })} />
        Recurring
      </label>
      {value.isRecurring && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">Frequency
              <SearchableSelect value={value.frequency} onChange={(v) => set({ frequency: v as Recurrence['frequency'] })}
                options={['Daily', 'Weekly', 'Monthly'].map((s) => ({ value: s, label: s }))} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">Every (N)
              <input type="number" min={1} className={field + ' mt-1'} value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          </div>
          {showWeekdays && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={'rounded-lg px-2 py-1 text-xs font-medium ' + (selected.has(d) ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                  {d[0] + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {value.frequency === 'Monthly' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">Monthly by
                <SearchableSelect value={value.monthlyMode} onChange={(v) => set({ monthlyMode: v as Recurrence['monthlyMode'] })}
                  options={['Day of Month', 'Nth Weekday'].map((s) => ({ value: s, label: s }))} />
              </label>
              {value.monthlyMode === 'Day of Month' ? (
                <label className="text-sm text-slate-600 dark:text-slate-300">Day (1-31)
                  <input type="number" min={1} max={31} className={field + ' mt-1'} value={value.dayOfMonth ?? ''}
                    onChange={(e) => set({ dayOfMonth: e.target.value ? Number(e.target.value) : null })} />
                </label>
              ) : (
                <label className="text-sm text-slate-600 dark:text-slate-300">Which
                  <SearchableSelect value={value.nth} onChange={(v) => set({ nth: v as Recurrence['nth'] })}
                    options={['First', 'Second', 'Third', 'Fourth', 'Last'].map((s) => ({ value: s, label: s }))} />
                </label>
              )}
            </div>
          )}
          <label className="text-sm text-slate-600 dark:text-slate-300">Until
            <input type="date" className={field + ' mt-1'} value={value.until} onChange={(e) => set({ until: e.target.value })} />
          </label>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors (other files still reference the old shape until Task 8 — if so, proceed to Task 8 and typecheck at its end).

- [ ] **Step 5: Commit (staged).**

```bash
git add frontend/src/lib/recurrence.ts frontend/src/components/RecurrenceEditor.tsx frontend/src/lib/types.ts
git commit -m "feat(recurring): shared Recurrence type, editor, serialize/summarize helpers"
```

---

## Task 8: Frontend — wire editor into create, edit, duplicate; display state

**Files:**
- Modify: `frontend/src/components/CreateProjectItemSheet.tsx`
- Modify: `frontend/src/pages/ProjectItemScreen.tsx`
- Modify: `frontend/src/lib/duplicateTodo.ts`

**Interfaces:**
- Consumes: `Recurrence`, `emptyRecurrence`, `serializeRecurrence`, `summarizeRecurrence`, `recurrenceFromDetail`, `<RecurrenceEditor>`.

- [ ] **Step 1: CreateProjectItemSheet** — replace the three recurrence `useState`s (`isRecurring/frequency/until`, lines ~38-40), the reset (line ~72), the submit payload (lines ~103-107), and the recurrence JSX (lines ~252-268) with a single `recurrence` state and the shared editor:

```tsx
// state
const [recurrence, setRecurrence] = useState<Recurrence>(
  initial ? recurrenceFromDetail({ is_recurring: initial.isRecurring ?? false, frequency: initial.frequency ?? null,
    interval: initial.interval, weekdays: initial.weekdays, monthly_mode: initial.monthlyMode,
    day_of_month: initial.dayOfMonth, nth: initial.nth, until: initial.until }) : emptyRecurrence)
// reset(): setRecurrence(emptyRecurrence)
// submit(): Object.assign(fields, serializeRecurrence(recurrence))
// JSX (replace the checkbox+frequency+until block):
<RecurrenceEditor value={recurrence} onChange={setRecurrence} />
```

Add imports for the helpers/editor. Remove the now-unused `SearchableSelect` recurrence usage if no longer referenced elsewhere in the file.

- [ ] **Step 2: ProjectItemScreen edit** — same swap for the edit form: replace `recurring/freq/until` state (lines ~108-110), the save payload (lines ~181-186 → `Object.assign(fields, serializeRecurrence(recurrence))`), and the editor JSX (lines ~345-374) with `<RecurrenceEditor value={recurrence} onChange={setRecurrence} />`, seeded via `recurrenceFromDetail(data.recurring)`.

- [ ] **Step 3: ProjectItemScreen display** — replace the `Repeats {frequency}` pill (line ~1100) with the human summary, and add series state + next fire to the Recurrence history panel; **change the panel gate** from `data.occurrences.length > 1` to `data.recurring.is_recurring`:

```tsx
// badge:
<Repeat className="h-3.5 w-3.5" /> {summarizeRecurrence(recurrenceFromDetail(data.recurring))}
// history panel header (add under the title):
{data.recurring.is_recurring && (
  <p className="text-[11px] text-slate-400">
    {data.recurring.state === 'paused' ? 'Paused'
      : data.recurring.state === 'ended' ? 'Ended'
      : data.recurring.next_fire ? `Next: ${data.recurring.next_fire}` : 'Active'}
  </p>
)}
```

- [ ] **Step 4: duplicateTodo** — extend `CreateTodoInitial` with `interval?, weekdays?, monthlyMode?, dayOfMonth?, nth?` and map them in `todoDuplicateInitial` from `data.recurring` so a duplicated rule survives:

```ts
// in todoDuplicateInitial():
interval: data.recurring.interval, weekdays: data.recurring.weekdays,
monthlyMode: data.recurring.monthly_mode, dayOfMonth: data.recurring.day_of_month, nth: data.recurring.nth,
```

- [ ] **Step 5: Typecheck + build.**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`
Expected: no TS errors; build succeeds.

- [ ] **Step 6: Commit (staged).**

```bash
git add frontend/src/components/CreateProjectItemSheet.tsx frontend/src/pages/ProjectItemScreen.tsx frontend/src/lib/duplicateTodo.ts
git commit -m "feat(recurring): wire RecurrenceEditor into create/edit/duplicate + series-state display"
```

---

## Task 9: Full verification

- [ ] **Step 1: Pure lib.** `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.vernon_project.doctype.project_todo.test_recurrence` → all ok.
- [ ] **Step 2: Backend suites.** `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_todo.test_project_todo` and `... --module vernon_project.api.test_mobile` → PASS.
- [ ] **Step 3: No-site tasks test.** `cd /home/frappe/frappe-bench/apps/vernon_project && python -m vernon_project.test_tasks` → ok.
- [ ] **Step 4: Frontend.** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 5: Grep for leftovers.** `grep -rn "next_occurrence" vernon_project --include=*.py | grep -v test_` → only intentional/none; `grep -rn "create_next_occurrence" vernon_project` → none (fully replaced).
- [ ] **Step 6: Present the staged commits to the human for approval before pushing.**

---

## Self-Review

**Spec coverage:** Goal 1 (continuity) → Tasks 4/5/6 (self-heal, series state, next_fire). Goal 2 (rules) → Tasks 1/2/7. Goal 3 (relative dates) → Task 4 `build_occurrence` shift + Task 2 date lib. Migration → Task 1. Every §12 decision from the spec is realized: fixed-anchor day-of-month (Task 2 `test_monthly_day_of_month_fixed_anchor_restores`), Nth reuses `recurring_weekdays` + exactly-one validation (Tasks 2/3), pause on root (Tasks 4/6), cancel=skip (latest_occurrence anchors regardless of status), next_occurrence retired (Tasks 3/5), CSV validated (Task 3).

**Placeholder scan:** Task 5 Step 1 tests are described rather than fully coded because they depend on the existing `test_project_todo.py` fixture helpers (project/detail/group scaffolding) that the implementer must read; the assertions and commands are concrete. All logic files have complete code.

**Type consistency:** `calculate_next_occurrence(from_date)` keeps its single-arg signature (reads rule off `self`) across all call sites (controller, scheduler, mobile). `series_root`, `generate_next(anchor, force)`, `build_occurrence(anchor, next_date)` names match between Tasks 4/5/6. Frontend `Recurrence` field names match between `recurrence.ts`, `RecurrenceEditor`, and the wiring in Task 8.
