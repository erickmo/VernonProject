# Daily Verse (Ayat Harian) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt into a daily scripture verse ("Ayat Harian") in Bahasa Indonesia, matched to their religion, shown on the /m and /w home screens.

**Architecture:** Two new self-editable fields on Employee Profile (`religion`, `verse_enabled`). A whitelisted `get_daily_verse()` reads the caller's religion, returns today's verse from a per-(religion,date) `Daily Verse` cache doctype, fetching from an external Bahasa API on the first request of the day. Only Islam/Kristen/Katolik have Bahasa APIs, so only those get the feature; the other three religions show a "not yet available" note and no toggle. Frontend: one shared react-query hook, two thin home cards (one per design system) + settings controls on /m and /w.

**Tech Stack:** Frappe (Python), MariaDB, React + TypeScript + @tanstack/react-query, Tailwind. External: quran.com API v4 (Islam), bolls.life API (Bible, TB Indonesian).

## Global Constraints

- Live site (`project.vernon.id`), code-first. Deploy = `bench migrate` (schema) → `bench restart` (Python) → `npm run build` in `frontend/` and `frontend-web/` (frontend). Never `git checkout` another branch in the live dir.
- Supported religions (have a Bahasa API): **Islam, Kristen, Katolik**. Constant: `SUPPORTED = {"Islam", "Kristen", "Katolik"}`. Hindu/Buddha/Konghucu store religion but get no verse and no toggle.
- All user-facing copy in **Bahasa Indonesia**.
- No native `alert/confirm/prompt` anywhere (use existing dialog/toast).
- `git add` only the files this plan touches — the user works in parallel on the same repo.
- Determinism: never use `random`/`Math.random` for the daily pick — use a hash of the date string, so concurrent workers agree and the cache write is idempotent.
- Frappe module for new doctype: `Vernon Project`.
- Repo root: `/home/frappe/frappe-bench/apps/vernon_project`. App Python path prefix: `vernon_project.`.

---

### Task 1: Schema — Employee Profile fields + `Daily Verse` doctype

**Files:**
- Modify: `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json`
- Create: `vernon_project/vernon_project/doctype/daily_verse/__init__.py`
- Create: `vernon_project/vernon_project/doctype/daily_verse/daily_verse.json`
- Create: `vernon_project/vernon_project/doctype/daily_verse/daily_verse.py`

**Interfaces:**
- Produces: Employee Profile gains `religion` (Select, permlevel 0) and `verse_enabled` (Check, permlevel 0). New doctype `Daily Verse` with fields `religion`, `verse_date`, `reference`, `text`, `source`; docname = `{religion}-{verse_date}`.

- [ ] **Step 1: Add the two fields to Employee Profile**

In `employee_profile.json`, find the `personal_section` block (the fields `home_address`, `emergency_contact_*` follow it). Add `religion` and `verse_enabled` immediately after `personal_section` in BOTH the `field_order` array and the `fields` array.

In `field_order`, insert after `"personal_section"`:
```json
  "religion",
  "verse_enabled",
```

In `fields`, insert after the `personal_section` field object:
```json
  {"fieldname": "religion", "fieldtype": "Select", "label": "Agama", "options": "\nIslam\nKristen\nKatolik\nHindu\nBuddha\nKonghucu"},
  {"fieldname": "verse_enabled", "fieldtype": "Check", "label": "Tampilkan Ayat Harian", "default": "0"},
```
Both omit `permlevel` (defaults to 0 = self-editable), matching `home_address`.

- [ ] **Step 2: Create the `Daily Verse` doctype files**

`vernon_project/vernon_project/doctype/daily_verse/__init__.py` — empty file.

`vernon_project/vernon_project/doctype/daily_verse/daily_verse.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "format:{religion}-{verse_date}",
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "religion",
  "verse_date",
  "reference",
  "text",
  "source"
 ],
 "fields": [
  {"fieldname": "religion", "fieldtype": "Data", "label": "Religion", "reqd": 1, "in_list_view": 1},
  {"fieldname": "verse_date", "fieldtype": "Date", "label": "Verse Date", "reqd": 1, "in_list_view": 1},
  {"fieldname": "reference", "fieldtype": "Data", "label": "Reference", "in_list_view": 1},
  {"fieldname": "text", "fieldtype": "Small Text", "label": "Text"},
  {"fieldname": "source", "fieldtype": "Data", "label": "Source"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Daily Verse",
 "naming_rule": "Expression",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```

`vernon_project/vernon_project/doctype/daily_verse/daily_verse.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DailyVerse(Document):
	pass
```

- [ ] **Step 3: Migrate**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error; output mentions syncing `Daily Verse`.

- [ ] **Step 4: Verify schema landed**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'PY'
import frappe
print("religion" in frappe.get_meta("Employee Profile").get_valid_columns())
print("verse_enabled" in frappe.get_meta("Employee Profile").get_valid_columns())
print(frappe.db.exists("DocType", "Daily Verse"))
PY
```
Expected: `True`, `True`, `Daily Verse`.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/employee_profile/employee_profile.json vernon_project/vernon_project/doctype/daily_verse/
git commit -m "feat(hr): schema for daily verse — Employee Profile religion+toggle, Daily Verse cache"
```

---

### Task 2: Backend verse module (`verse.py`) — pure logic, fetchers, `get_daily_verse`

**Files:**
- Create: `vernon_project/vernon_project/api/verse.py`
- Test: `vernon_project/vernon_project/api/test_verse.py`

**Interfaces:**
- Consumes: `Daily Verse` doctype (Task 1); Employee Profile `religion`/`verse_enabled` (Task 1).
- Produces:
  - `SUPPORTED: set[str]`
  - `pick_index(date_str: str, n: int) -> int` — deterministic index in `[0, n)`.
  - `strip_html(text: str) -> str`
  - `get_daily_verse() -> dict | None` — whitelisted; returns `{"reference": str, "text": str}` or `None`.

- [ ] **Step 1: Write the failing test for the pure helpers**

`vernon_project/vernon_project/api/test_verse.py`:
```python
import unittest

from vernon_project.vernon_project.api.verse import pick_index, strip_html


class TestVerseHelpers(unittest.TestCase):
	def test_pick_index_deterministic(self):
		# Same date + same pool size -> same index, every call.
		a = pick_index("2026-07-05", 40)
		b = pick_index("2026-07-05", 40)
		self.assertEqual(a, b)

	def test_pick_index_in_range(self):
		for d in ("2026-01-01", "2026-07-05", "2026-12-31"):
			self.assertTrue(0 <= pick_index(d, 40) < 40)

	def test_pick_index_varies_by_date(self):
		# Different dates should not all collapse to one index.
		idxs = {pick_index(f"2026-07-{d:02d}", 40) for d in range(1, 29)}
		self.assertGreater(len(idxs), 1)

	def test_strip_html_removes_tags(self):
		self.assertEqual(
			strip_html('teks<sup foot_note="1">1</sup> lanjut'),
			"teks lanjut",
		)

	def test_strip_html_collapses_whitespace(self):
		self.assertEqual(strip_html("a   b\n c"), "a b c")


if __name__ == "__main__":
	unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.api.test_verse`
Expected: FAIL — `ModuleNotFoundError`/`ImportError` (verse.py not created yet).

- [ ] **Step 3: Write `verse.py`**

`vernon_project/vernon_project/api/verse.py`:
```python
# Daily Verse (Ayat Harian): per-religion daily scripture in Bahasa Indonesia.
# Only Islam/Kristen/Katolik have a Bahasa API; others get nothing (feature hidden).

import hashlib
import re

import frappe
import requests

SUPPORTED = {"Islam", "Kristen", "Katolik"}

_TIMEOUT = 8

# Curated, well-known Bible references shared by Kristen + Katolik (same Bible).
# Tuple: (Indonesian label, bolls.life book number, chapter, verse).
# Book numbers follow the standard 66-book Protestant order used by bolls.life.
BIBLE_VERSES = [
	("Yohanes 3:16", 43, 3, 16),
	("Yohanes 14:6", 43, 14, 6),
	("Yohanes 15:5", 43, 15, 5),
	("Yohanes 16:33", 43, 16, 33),
	("Filipi 4:13", 50, 4, 13),
	("Filipi 4:6", 50, 4, 6),
	("Filipi 4:7", 50, 4, 7),
	("Yeremia 29:11", 24, 29, 11),
	("Amsal 3:5", 20, 3, 5),
	("Amsal 3:6", 20, 3, 6),
	("Amsal 16:3", 20, 16, 3),
	("Amsal 17:17", 20, 17, 17),
	("Roma 8:28", 45, 8, 28),
	("Roma 12:2", 45, 12, 2),
	("Yesaya 41:10", 23, 41, 10),
	("Yesaya 40:31", 23, 40, 31),
	("Mazmur 23:1", 19, 23, 1),
	("Mazmur 23:4", 19, 23, 4),
	("Mazmur 27:1", 19, 27, 1),
	("Mazmur 37:4", 19, 37, 4),
	("Mazmur 118:24", 19, 118, 24),
	("Mazmur 121:1", 19, 121, 1),
	("Mazmur 121:2", 19, 121, 2),
	("Matius 6:33", 40, 6, 33),
	("Matius 11:28", 40, 11, 28),
	("Matius 5:16", 40, 5, 16),
	("1 Korintus 13:4", 46, 13, 4),
	("1 Korintus 13:13", 46, 13, 13),
	("1 Korintus 10:13", 46, 10, 13),
	("Galatia 5:22", 48, 5, 22),
	("Efesus 2:8", 49, 2, 8),
	("Efesus 6:10", 49, 6, 10),
	("Kolose 3:23", 51, 3, 23),
	("1 Tesalonika 5:16", 52, 5, 16),
	("1 Tesalonika 5:17", 52, 5, 17),
	("Ibrani 11:1", 58, 11, 1),
	("Ibrani 13:5", 58, 13, 5),
	("Yakobus 1:2", 59, 1, 2),
	("Yakobus 1:12", 59, 1, 12),
	("1 Petrus 5:7", 60, 5, 7),
	("1 Yohanes 4:19", 62, 4, 19),
	("Wahyu 21:4", 66, 21, 4),
	("Ulangan 31:6", 5, 31, 6),
	("Yosua 1:9", 6, 1, 9),
]


def pick_index(date_str, n):
	"""Deterministic index in [0, n) from a date string. No RNG -> concurrent
	workers agree and the cache write is idempotent."""
	h = hashlib.sha1(date_str.encode()).hexdigest()
	return int(h, 16) % n


def strip_html(text):
	"""Remove HTML/footnote tags and collapse whitespace."""
	if not text:
		return ""
	text = re.sub(r"<[^>]+>", "", text)
	return re.sub(r"\s+", " ", text).strip()


def _fetch_islam(date_str):
	"""quran.com v4: a random verse with the Indonesian (Kemenag, id 33)
	translation. Cached once/day, so 'random' is stable for the day."""
	r = requests.get(
		"https://api.quran.com/api/v4/verses/random",
		params={"language": "id", "translations": "33", "fields": "verse_key"},
		timeout=_TIMEOUT,
	)
	r.raise_for_status()
	v = r.json()["verse"]
	text = strip_html(v["translations"][0]["text"])
	return {"reference": f"QS {v['verse_key']}", "text": text, "source": "quran.com"}


def _fetch_bible(date_str):
	"""Pick a well-known verse by date, fetch its Terjemahan Baru text from
	bolls.life. Shared by Kristen + Katolik."""
	label, book, chapter, verse = BIBLE_VERSES[pick_index(date_str, len(BIBLE_VERSES))]
	r = requests.get(
		f"https://bolls.life/get-verse/TB/{book}/{chapter}/{verse}/",
		timeout=_TIMEOUT,
	)
	r.raise_for_status()
	text = strip_html(r.json().get("text", ""))
	return {"reference": label, "text": text, "source": "bolls.life"}


def _fetch(religion, date_str):
	if religion == "Islam":
		return _fetch_islam(date_str)
	# Kristen + Katolik share the Bible.
	return _fetch_bible(date_str)


@frappe.whitelist()
def get_daily_verse():
	"""Return today's verse {reference, text} for the caller, or None when the
	feature is off, the religion is unsupported, or the fetch fails."""
	user = frappe.session.user
	if user == "Guest":
		return None

	prof = frappe.db.get_value(
		"Employee Profile", {"user": user}, ["religion", "verse_enabled"], as_dict=True
	)
	if not prof or not prof.verse_enabled:
		return None
	religion = prof.religion
	if religion not in SUPPORTED:
		return None

	today = frappe.utils.today()
	name = f"{religion}-{today}"

	cached = frappe.db.get_value("Daily Verse", name, ["reference", "text"], as_dict=True)
	if cached:
		return {"reference": cached.reference, "text": cached.text}

	try:
		data = _fetch(religion, today)
	except Exception:
		# Transient outage: log and show nothing. Not cached -> retries next request.
		frappe.log_error(title="Daily Verse fetch failed", message=frappe.get_traceback())
		return None

	if not data.get("text"):
		return None

	try:
		frappe.get_doc(
			{
				"doctype": "Daily Verse",
				"religion": religion,
				"verse_date": today,
				"reference": data["reference"],
				"text": data["text"],
				"source": data["source"],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	except frappe.exceptions.DuplicateEntryError:
		# Another request won the race for today; use its row.
		row = frappe.db.get_value("Daily Verse", name, ["reference", "text"], as_dict=True)
		if row:
			return {"reference": row.reference, "text": row.text}

	return {"reference": data["reference"], "text": data["text"]}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.api.test_verse`
Expected: PASS (5 tests, OK).

- [ ] **Step 5: Smoke-test the live fetchers once (network)**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'PY'
from vernon_project.vernon_project.api import verse
print(verse._fetch_islam("2026-07-05"))
print(verse._fetch_bible("2026-07-05"))
PY
```
Expected: two dicts, each with a non-empty Indonesian `text` and a `reference` (`QS ...` and a Bible label). If either errors, the API changed — fix the parse before continuing.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/api/verse.py vernon_project/vernon_project/api/test_verse.py
git commit -m "feat(hr): daily verse backend — quran.com + bolls.life fetch, cached per religion/day"
```

---

### Task 3: Wire self-profile read + write (`mobile.py`)

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (`EMPLOYEE_SOFT_FIELDS` ~line 28; `update_my_profile` ~line 5113)

**Interfaces:**
- Consumes: Employee Profile `religion`/`verse_enabled` (Task 1).
- Produces: `bootstrap().employee` now includes `religion` + `verse_enabled`; `update_my_profile(...)` accepts and persists both.

- [ ] **Step 1: Add the fields to `EMPLOYEE_SOFT_FIELDS` (drives the bootstrap read)**

At `vernon_project/vernon_project/api/mobile.py` ~line 28, change:
```python
EMPLOYEE_SOFT_FIELDS = (
	"home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
)
```
to:
```python
EMPLOYEE_SOFT_FIELDS = (
	"home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
	"religion", "verse_enabled",
)
```

- [ ] **Step 2: Accept + persist the fields in `update_my_profile`**

In `update_my_profile` (~line 5113), add the two params to the signature:
```python
def update_my_profile(
	phone=None, birthdate=None, bio=None,
	home_address=None, emergency_contact_name=None,
	emergency_contact_phone=None, emergency_contact_relation=None,
	education=None, skills=None, trainings=None,
	religion=None, verse_enabled=None,
):
```

Then, right after the existing soft-field loop (the block that does
`for f in ("home_address", ...): ... doc.set(f, val)`), add:
```python
	if religion is not None:
		doc.set("religion", religion)
	if verse_enabled is not None:
		doc.set("verse_enabled", int(verse_enabled))
```

- [ ] **Step 3: Restart + verify round-trip**

Run: `cd /home/frappe/frappe-bench && bench restart`

Then:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
from vernon_project.vernon_project.api import mobile
mobile.update_my_profile(religion="Kristen", verse_enabled=1)
print(mobile.bootstrap()["employee"].get("religion"), mobile.bootstrap()["employee"].get("verse_enabled"))
PY
```
Expected: `Kristen 1`.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(hr): expose+persist religion & verse toggle via self profile"
```

---

### Task 4: Frontend shared plumbing — types, api client, hook

**Files:**
- Modify: `frontend/src/lib/types.ts` (`EmployeeSoft` ~line 866)
- Modify: `frontend/src/lib/api.ts` (`mobileApi` ~line 101)
- Modify: `frontend/src/hooks/useData.ts` (`keys` ~line 52; add hook)

**Interfaces:**
- Consumes: `get_daily_verse` (Task 2); `bootstrap` employee fields (Task 3).
- Produces:
  - `EmployeeSoft.religion?: string`, `EmployeeSoft.verse_enabled?: 0 | 1`.
  - Type `DailyVerse = { reference: string; text: string } | null`.
  - `mobileApi.dailyVerse(): Promise<DailyVerse>`.
  - `useDailyVerse()` react-query hook — only enabled when the toggle is on and religion is supported.

Note: `mobileApi.updateMyProfile` already spreads `...payload` of type `Partial<EmployeeSoft>`, so extending `EmployeeSoft` (Step 1) is enough to send the new fields — no api.ts change to the update path.

- [ ] **Step 1: Extend the shared type**

In `frontend/src/lib/types.ts`, change `EmployeeSoft` (~line 866) to add two fields:
```typescript
export type EmployeeSoft = {
  phone?: string; birthdate?: string; bio?: string;
  home_address?: string;
  emergency_contact_name?: string; emergency_contact_phone?: string; emergency_contact_relation?: string;
  education?: EmployeeChildEducation[]; skills?: EmployeeChildSkill[]; trainings?: EmployeeChildTraining[];
  religion?: string; verse_enabled?: 0 | 1;
}
```

Add the verse response type nearby (e.g. right after `EmployeeSoft`):
```typescript
export type DailyVerse = { reference: string; text: string } | null
```

- [ ] **Step 2: Add the api client method**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object (after `bootstrap`/`dashboard` entries, ~line 103), add:
```typescript
  dailyVerse: () => api.get<import('./types').DailyVerse>(M + 'get_daily_verse'),
```
(`M` is already `'vernon_project.api.mobile.'`; but `get_daily_verse` lives in `verse.py`. Use the full path instead — add this exact line:)
```typescript
  dailyVerse: () => api.get<import('./types').DailyVerse>('vernon_project.vernon_project.api.verse.get_daily_verse'),
```
Keep only the second form.

- [ ] **Step 3: Add the query key + hook**

In `frontend/src/hooks/useData.ts`, add to the `keys` object (~line 106, after `employeeProfile`):
```typescript
  dailyVerse: ['daily-verse'] as const,
```

Then add the hook (place it near `useBoot`, ~line 110):
```typescript
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik'])

export function useDailyVerse() {
  const { data: boot } = useBoot()
  const emp = boot?.employee
  const on = !!emp?.verse_enabled && !!emp?.religion && VERSE_SUPPORTED.has(emp.religion)
  return useQuery({
    queryKey: keys.dailyVerse,
    queryFn: () => mobileApi.dailyVerse(),
    enabled: on,
    staleTime: 6 * 60 * 60 * 1000, // once every 6h is plenty for a daily verse
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors (or only pre-existing unrelated ones — none should reference the changed lines).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(hr): /m shared plumbing for daily verse — type, api, useDailyVerse hook"
```

---

### Task 5: /m settings — religion select + verse toggle in `MyInfoScreen`

**Files:**
- Modify: `frontend/src/pages/MyInfoScreen.tsx`

**Interfaces:**
- Consumes: `EmployeeSoft.religion`/`verse_enabled` (Task 4); `useSaveMyProfile` (existing).
- Produces: UI to set religion + toggle the verse, saved via the existing `doSave` payload.

- [ ] **Step 1: Add state + hydration + save payload**

In `MyInfoScreen.tsx`, add state after the `trainings` state (~line 31):
```typescript
  const [religion, setReligion] = useState(employee?.religion ?? '')
  const [verseEnabled, setVerseEnabled] = useState<boolean>(!!employee?.verse_enabled)
```

In the one-shot hydration `useEffect` (~line 35), add inside the `if (employee && !hydrated)` block:
```typescript
      setReligion(employee.religion ?? '')
      setVerseEnabled(!!employee.verse_enabled)
```

In `doSave` (~line 52), add to the object passed to `save.mutate`:
```typescript
        religion, verse_enabled: verseEnabled ? 1 : 0,
```
so it reads:
```typescript
      { phone, birthdate, bio, home_address: homeAddress,
        emergency_contact_name: ecName, emergency_contact_phone: ecPhone, emergency_contact_relation: ecRelation,
        skills, education, trainings,
        religion, verse_enabled: verseEnabled ? 1 : 0 },
```

- [ ] **Step 2: Add the UI section**

Add a `RELIGIONS` const near the top consts (~line 13):
```typescript
const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik'])
```

Insert this block inside the "Personal" section, right after the Home Address `<label>` (~line 115, before that section's closing `</div>`):
```tsx
        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> Agama</span>
          <select value={religion} onChange={(e) => setReligion(e.target.value)} className={INPUT_CLS}>
            <option value="">— Pilih —</option>
            {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        {VERSE_SUPPORTED.has(religion) ? (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <span className="text-sm font-medium text-stone-600 dark:text-slate-300">Ayat Harian</span>
            <input type="checkbox" checked={verseEnabled} onChange={(e) => setVerseEnabled(e.target.checked)}
              className="h-5 w-5 accent-brand-600" />
          </label>
        ) : religion ? (
          <p className="text-xs text-stone-400 dark:text-slate-500">Ayat Harian belum tersedia untuk agama ini.</p>
        ) : null}
```
(`BookOpen` is already imported in this file.)

- [ ] **Step 3: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/MyInfoScreen.tsx
git commit -m "feat(hr): /m My Info — religion select + Ayat Harian toggle"
```

---

### Task 6: /m home card — `VerseCard` in `Today.tsx`

**Files:**
- Modify: `frontend/src/pages/Today.tsx`

**Interfaces:**
- Consumes: `useDailyVerse` (Task 4).
- Produces: a Soft Pop verse card rendered at the top of the home feed when a verse exists.

- [ ] **Step 1: Import the hook + icon**

In `Today.tsx`, add `useDailyVerse` to the existing `@/hooks/useData` import (~line 44):
```typescript
import { useBoot, useDashboard, useProjects, useWallet, useHomeBanners, useDailyVerse } from '@/hooks/useData'
```
Ensure `BookOpen` is imported from `lucide-react` (add it to the existing lucide import if absent).

- [ ] **Step 2: Add the `VerseCard` component**

Add above `export default function Today()` (~line 163):
```tsx
function VerseCard() {
  const { data: verse } = useDailyVerse()
  if (!verse) return null
  return (
    <div className="mt-4 rounded-2xl border border-brand-100 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/15 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-brand-700 dark:text-brand-300">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Ayat Hari Ini</span>
      </div>
      <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200">“{verse.text}”</p>
      <p className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400">— {verse.reference}</p>
    </div>
  )
}
```

- [ ] **Step 3: Render it in the feed**

In the `Today` return, insert `<VerseCard />` right after `<RecapCard />` (~line 426):
```tsx
              {/* Weekly recap — auto-surfaces Mon–Wed, dismissible per week */}
              <RecapCard />

              {/* Daily verse — only when the user enabled Ayat Harian */}
              <VerseCard />
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/Today.tsx
git commit -m "feat(hr): /m home — Ayat Hari Ini card"
```

---

### Task 7: /w settings — `VerseSettingsTile` in `Me.tsx`

**Files:**
- Modify: `frontend-web/src/pages/Me.tsx`

**Interfaces:**
- Consumes: `useBoot`, `useSaveMyProfile` (shared `@/hooks/useData`); `EmployeeSoft` fields (Task 4).
- Produces: a Bento settings tile to set religion + toggle the verse on /w.

Note: `@/hooks/useData` in `frontend-web` resolves to the SHARED `frontend/src/hooks/useData.ts` (the `@` alias). `useSaveMyProfile` and `useDailyVerse` are already defined there — no /w-specific hook needed.

- [ ] **Step 1: Extend imports**

In `Me.tsx`, add `useSaveMyProfile` to the `@/hooks/useData` import (~line 4) and `BookOpen` to the lucide import:
```typescript
import { useBoot, usePasskeys, useEnrollPasskey, useRevokePasskey, useAvatarCatalog, useGamification, useClaimDaily, useSaveMyProfile } from '@/hooks/useData'
```
Add these hooks/state where the other tile components live (see Step 2 — the tile is self-contained). Ensure `useState`/`useEffect` are imported (they already are in this file for other tiles).

- [ ] **Step 2: Add the `VerseSettingsTile` component**

Add a new tile component at the bottom of `Me.tsx` (alongside `GamificationTile`, `PasskeyTile`, etc.):
```tsx
const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik'])

function VerseSettingsTile() {
  const { data: boot } = useBoot()
  const emp = boot?.employee
  const save = useSaveMyProfile()
  const toast = useToast()
  const [religion, setReligion] = useState('')
  const [verseEnabled, setVerseEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (emp && !hydrated) {
      setReligion(emp.religion ?? '')
      setVerseEnabled(!!emp.verse_enabled)
      setHydrated(true)
    }
  }, [emp, hydrated])

  const persist = (nextReligion: string, nextOn: boolean) => {
    save.mutate(
      { religion: nextReligion, verse_enabled: nextOn ? 1 : 0 },
      {
        onSuccess: () => toast('success', 'Tersimpan'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
      },
    )
  }

  return (
    <BentoTile span="md" tone="tint" accent="violet" title="Ayat Harian" icon={BookOpen}>
      <div className="mt-1 space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Agama</span>
          <select
            value={religion}
            onChange={(e) => { const v = e.target.value; setReligion(v); persist(v, verseEnabled) }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">— Pilih —</option>
            {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {VERSE_SUPPORTED.has(religion) ? (
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">Tampilkan ayat di beranda</span>
            <input
              type="checkbox"
              checked={verseEnabled}
              onChange={(e) => { const on = e.target.checked; setVerseEnabled(on); persist(religion, on) }}
              className="h-5 w-5 accent-violet-600"
            />
          </label>
        ) : religion ? (
          <p className="text-xs text-muted">Belum tersedia untuk agama ini.</p>
        ) : null}
      </div>
    </BentoTile>
  )
}
```
Ensure `useToast` is imported in `Me.tsx` (add `import { useToast } from '@/components/Toast'` if absent — check the existing tiles; `GamificationTile` already uses `useToast`, so the import exists).

- [ ] **Step 3: Render the tile in the grid**

In the `Me` component's `<BentoGrid>` (~line 106), add the tile after `<PasskeyTile />`:
```tsx
        <PasskeyTile />
        <VerseSettingsTile />
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Me.tsx
git commit -m "feat(hr): /w Me — Ayat Harian settings tile (religion + toggle)"
```

---

### Task 8: /w home card — `VerseCard` in `Home.tsx`

**Files:**
- Modify: `frontend-web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `useDailyVerse` (shared hook, Task 4).
- Produces: a flat-Notion verse card at the top of the /w home, below the KPI strip.

- [ ] **Step 1: Import the hook + icon**

In `Home.tsx`, add `useDailyVerse` to the existing `@/hooks/useData` import (~line 9 block) and ensure `BookOpen` is imported from `lucide-react`.

- [ ] **Step 2: Add the `VerseCard` component**

Add near the other small components (above `export default function Home()`, ~line 189):
```tsx
function VerseCard() {
  const { data: verse } = useDailyVerse()
  if (!verse) return null
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-5">
      <div className="mb-2 flex items-center gap-2 text-muted">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Ayat Hari Ini</span>
      </div>
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink">“{verse.text}”</p>
      <p className="mt-2 text-sm font-medium text-muted">— {verse.reference}</p>
    </div>
  )
}
```

- [ ] **Step 3: Render it after the KPI strip**

In the `Home` return, insert `<VerseCard />` right after the KPI-strip `</div>` (~line 309), before the `{/* main work grid */}` comment:
```tsx
      </div>

      {/* Daily verse — only when the user enabled Ayat Harian */}
      <VerseCard />

      {/* main work grid */}
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Home.tsx
git commit -m "feat(hr): /w home — Ayat Hari Ini card"
```

---

### Task 9: Build + deploy + live verification

**Files:** none (build artifacts committed per repo convention — see Step 3).

- [ ] **Step 1: Build both frontends**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed, no type errors.

- [ ] **Step 2: Migrate + restart (in case not already done)**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench restart
```
Expected: clean.

- [ ] **Step 3: Commit built bundles**

The repo commits built /m and /w bundles (see recent `build(hr): rebuild ...` commits). Stage whatever the builds changed under the served asset dirs:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add -A -- '*/public/*' vernon_project/public 2>/dev/null || true
git status --short
```
Review the listed files are only build outputs, then:
```bash
git commit -m "build(hr): rebuild /m + /w bundles — Ayat Harian"
```

- [ ] **Step 4: Manual live verification**

In a browser logged in as a real user:
1. /m → My Info → set Agama = `Islam`, enable Ayat Harian, Save. Reload /m home → "Ayat Hari Ini" card shows an Indonesian Quran verse.
2. Change Agama to `Kristen` → home card shows an Indonesian Bible verse.
3. Change Agama to `Hindu` → toggle disappears, "belum tersedia" note shows; home card gone.
4. /w → Me → Ayat Harian tile mirrors the same state; /w Home shows the card.
5. Confirm the same verse persists on repeated reloads within the day (cache hit).

Expected: all five behave as described. If a card is blank/missing while enabled+supported, check `frappe.log_error` for a "Daily Verse fetch failed" entry (API outage).

---

## Self-Review

**Spec coverage:**
- Religion field on Employee Profile (6 options, self-editable) → Task 1. ✓
- `verse_enabled` toggle → Task 1 (field), Tasks 5 & 7 (UI). ✓
- `Daily Verse` cache doctype, one row per (religion, date) → Task 1 (autoname format). ✓
- `get_daily_verse` with enabled/supported gating, cache-or-fetch, failure→None-uncached, race handling → Task 2. ✓
- Islam via quran.com Indonesian translation; Kristen/Katolik via curated refs + bolls.life TB → Task 2. ✓
- SUPPORTED = 3 religions; others hidden toggle + note → Tasks 2, 4 (hook gate), 5, 7. ✓
- Self-profile read (bootstrap) + write (update_my_profile) → Task 3. ✓
- Shared hook, per-system cards → Task 4 (hook), Task 6 (/m card), Task 8 (/w card). ✓
- HTML strip + deterministic date pick, with tests → Task 2 (test_verse.py). ✓
- Deploy: migrate → restart → build ×2 → live verify → Task 9. ✓
- Out of scope (push, Hindu/Buddha/Konghucu verses, shared card, purge job) → not built. ✓

**Placeholder scan:** No TBD/TODO. The one deferral ("add BookOpen if absent", "add useToast if absent") gives the exact import line to add and the reason it may already exist. Every code step has full code.

**Type consistency:** `DailyVerse` type (Task 4) matches `get_daily_verse` return `{reference, text}` (Task 2). `verse_enabled` is `0 | 1` in the type, sent as `verseEnabled ? 1 : 0` (Tasks 5, 7), cast `int(verse_enabled)` server-side (Task 3), read as `!!emp.verse_enabled` (hook + tiles). `pick_index`/`strip_html`/`SUPPORTED` names identical across verse.py, test_verse.py, and the plan. `VERSE_SUPPORTED` set duplicated in hook + both settings screens with the same 3 members — intentional (small, avoids a shared import for a 3-item set).
