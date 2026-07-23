# Interview Assessment (DISC + Personality + Logical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three structured assessments (DISC behavioural profile, Big Five personality, logical/problem-solving aptitude) to the recruitment interview test — baked question banks, per-job toggle, profile + target-fit results.

**Architecture:** DISC & Big Five ship as immutable Python question banks (`recruitment_instruments.py`, pure, self-checked) with server-side scoring; scoring keys are never sent to applicants. Logical reuses the existing scored-MCQ machinery. HR toggles which tests apply per opening and sets a target profile; the applicant takes enabled tests in the public www apply form; HR reviews profile bars + fit % in the SPA (both /m and /w).

**Tech Stack:** Frappe (Python doctypes + whitelisted API), server-rendered www (Jinja + vanilla JS), React SPA ×2 (`frontend/` mobile `/m`, `frontend-web/` web `/w`), shared TS in `frontend/src` imported as `@`.

## Global Constraints

- **Both frontends.** Every HR-facing SPA change ships to `frontend/` (`/m`) AND `frontend-web/` (`/w`). Applicant test-taking is the single public www surface (`/apply`), not the SPA.
- **Bahasa Indonesia** for all applicant/HR copy and all baked items.
- **Never leak scoring keys.** `get_job` (guest) must strip DISC `axis`, Big Five `trait`/`reverse`, and logical `answer`/`points` before returning items. Enforced by a test.
- **All enabled tests required** to submit an application; incomplete submit is rejected server-side.
- **Fit is transparent:** `fit = round(100 − mean(|applicant_axis − target_axis|), 1)`, clamped `[0,100]`; blank target axis defaults to 50.
- **No new doctypes** (banks live in code); reuse existing `answers` table + `score`/`max_score`/`grading_status` for scored tests.
- **Live site** `project.vernon.id` — one DB, no staging. Deploy: doctype JSON → `bench --site project.vernon.id migrate`; Python → `sudo /usr/local/bin/tj-restart`; SPA → `npm run build` in each frontend; www Jinja → `bench --site project.vernon.id clear-website-cache` (no build).
- **Self-check convention:** pure Python logic carries a runnable `_selfcheck()` under `if __name__ == "__main__":` (mirrors `recruitment.py`). No JS test framework exists in this repo — frontend is verified by `tsc`/build + live E2E.
- **What's New** (`App Release` row) required at the end since a user-visible change ships; Bahasa, one bullet/line, `published=1`, `platform` correct, semver bump. See project CLAUDE.md for the insert one-liner.
- Commit after every task. Branch is `main`; commit only files this plan touches (user works in parallel — `git add` explicit paths only).

---

### Task 1: Baked instrument banks + pure scoring

**Files:**
- Create: `vernon_project/api/recruitment_instruments.py`

**Interfaces:**
- Produces:
  - `DISC_ITEMS: list[dict]` — each `{"id": str, "words": [{"text": str, "axis": "D"|"I"|"S"|"C"} ×4]}`
  - `BIGFIVE_ITEMS: list[dict]` — each `{"id": str, "text": str, "trait": "O"|"C"|"E"|"A"|"N", "reverse": bool}`
  - `LOGIC_ITEMS: list[dict]` — each `{"id": str, "text": str, "options": [str], "answer": str, "points": int}`
  - `DISC_AXES = ("D","I","S","C")`, `BIGFIVE_TRAITS = ("O","C","E","A","N")`
  - `public_disc() -> list` / `public_bigfive() -> list` / `public_logic() -> list` — items with scoring keys stripped (for guest `get_job`).
  - `score_disc(answers: dict) -> tuple[dict, str]` — `answers = {item_id: {"most": int, "least": int}}` (word indices) → `(scores{axis:0-100}, dominant_type)`.
  - `score_bigfive(answers: dict) -> dict` — `answers = {item_id: int1-5}` → `scores{trait:0-100}`.
  - `logic_qdefs() -> list` — LOGIC_ITEMS reshaped to `_score_answers` question defs (`question_text/qtype/correct_answer/points`).
  - `fit(scores: dict, target: dict, axes: tuple) -> float`

- [ ] **Step 1: Write the module with pure structures, scoring, and self-check**

Start with a SMALL valid seed bank (full 63 items land in Task 2). Seed: 3 DISC items, 5 Big Five (one per trait), 2 logical — enough for the self-check to pass and scoring to be exercised.

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Baked psychometric instrument banks for the recruitment interview test.

Pure module — no frappe import, no site needed. DISC & Big Five are standard
instruments (same items for every job) and must never be HR-editable, so they
live in code. Scoring keys (DISC axis, Big Five trait/reverse, logical answer)
never reach the applicant: `public_*()` strips them before the guest API sends
items to the browser.

Run `python3 vernon_project/api/recruitment_instruments.py` to self-check.
"""

DISC_AXES = ("D", "I", "S", "C")
BIGFIVE_TRAITS = ("O", "C", "E", "A", "N")

# --- DISC: forced-choice. Each item = 4 words, one per axis. Applicant picks
#     the word MOST like them and the word LEAST like them. (Seed — Task 2 fills to ~28.)
DISC_ITEMS = [
    {"id": "d1", "words": [
        {"text": "Tegas", "axis": "D"}, {"text": "Ceria", "axis": "I"},
        {"text": "Sabar", "axis": "S"}, {"text": "Teliti", "axis": "C"}]},
    {"id": "d2", "words": [
        {"text": "Berani ambil keputusan", "axis": "D"}, {"text": "Suka bergaul", "axis": "I"},
        {"text": "Setia mendukung", "axis": "S"}, {"text": "Cermat", "axis": "C"}]},
    {"id": "d3", "words": [
        {"text": "Kompetitif", "axis": "D"}, {"text": "Antusias", "axis": "I"},
        {"text": "Tenang", "axis": "S"}, {"text": "Analitis", "axis": "C"}]},
]

# --- Big Five / OCEAN: Likert 1-5. `reverse` items are reverse-scored.
BIGFIVE_ITEMS = [
    {"id": "o1", "text": "Saya suka mencoba hal-hal baru.", "trait": "O", "reverse": False},
    {"id": "c1", "text": "Saya selalu menyelesaikan pekerjaan tepat waktu.", "trait": "C", "reverse": False},
    {"id": "e1", "text": "Saya merasa berenergi saat berada di keramaian.", "trait": "E", "reverse": False},
    {"id": "a1", "text": "Saya mudah berempati pada perasaan orang lain.", "trait": "A", "reverse": False},
    {"id": "n1", "text": "Saya jarang merasa cemas.", "trait": "N", "reverse": True},
]

# --- Logical / problem-solving: single-correct MCQ.
LOGIC_ITEMS = [
    {"id": "l1", "text": "2, 4, 6, 8, … berapa angka berikutnya?",
     "options": ["9", "10", "11", "12"], "answer": "10", "points": 1},
    {"id": "l2", "text": "Jika semua kucing adalah hewan, dan Mimi adalah kucing, maka Mimi adalah…",
     "options": ["Tumbuhan", "Hewan", "Bukan keduanya", "Tidak dapat ditentukan"],
     "answer": "Hewan", "points": 1},
]


# ----------------------------------------------------------------- public (stripped)

def public_disc():
    return [{"id": it["id"], "words": [w["text"] for w in it["words"]]} for it in DISC_ITEMS]


def public_bigfive():
    return [{"id": it["id"], "text": it["text"]} for it in BIGFIVE_ITEMS]


def public_logic():
    return [{"id": it["id"], "text": it["text"], "options": list(it["options"])} for it in LOGIC_ITEMS]


def logic_qdefs():
    """Reshape LOGIC_ITEMS to _score_answers question defs (all Multiple Choice)."""
    return [{"question_text": it["text"], "qtype": "Multiple Choice",
             "correct_answer": it["answer"], "points": int(it.get("points") or 1)}
            for it in LOGIC_ITEMS]


# ----------------------------------------------------------------- scoring

def score_disc(answers):
    """answers = {item_id: {"most": word_idx, "least": word_idx}}. → (scores 0-100, dominant)."""
    answers = answers or {}
    raw = {a: 0 for a in DISC_AXES}
    for it in DISC_ITEMS:
        a = answers.get(it["id"]) or {}
        m, l = a.get("most"), a.get("least")
        words = it["words"]
        if isinstance(m, int) and 0 <= m < len(words):
            raw[words[m]["axis"]] += 1
        if isinstance(l, int) and 0 <= l < len(words) and l != m:
            raw[words[l]["axis"]] -= 1
    n = len(DISC_ITEMS)
    if not n:
        return {a: 0 for a in DISC_AXES}, ""
    scores = {a: round((raw[a] + n) / (2 * n) * 100) for a in DISC_AXES}
    top = max(raw.values())
    dominant = "".join(a for a in DISC_AXES if raw[a] == top)
    return scores, dominant


def score_bigfive(answers):
    """answers = {item_id: 1..5}. → scores {trait: 0-100} (mean of reverse-adjusted, mapped 1-5→0-100)."""
    answers = answers or {}
    by_trait = {t: [] for t in BIGFIVE_TRAITS}
    for it in BIGFIVE_ITEMS:
        v = answers.get(it["id"])
        if not isinstance(v, (int, float)) or not (1 <= v <= 5):
            continue
        eff = (6 - v) if it["reverse"] else v
        by_trait[it["trait"]].append(eff)
    scores = {}
    for t in BIGFIVE_TRAITS:
        vals = by_trait[t]
        scores[t] = round((sum(vals) / len(vals) - 1) / 4 * 100) if vals else 0
    return scores


def fit(scores, target, axes):
    """Transparent distance-based fit. Blank target axis → 50 (neutral)."""
    if not scores:
        return 0.0
    diffs = []
    for a in axes:
        tv = (target or {}).get(a)
        tv = 50 if tv is None else tv
        diffs.append(abs((scores.get(a) or 0) - tv))
    return round(max(0.0, min(100.0, 100 - sum(diffs) / len(diffs))), 1)


# ----------------------------------------------------------------- self-check

def _selfcheck():
    # structural: DISC one word per axis, unique
    for it in DISC_ITEMS:
        axes = [w["axis"] for w in it["words"]]
        assert sorted(axes) == list("CDIS"), (it["id"], axes)
    # structural: every Big Five trait present, reverse is bool
    seen = {it["trait"] for it in BIGFIVE_ITEMS}
    assert seen == set(BIGFIVE_TRAITS), seen
    assert all(isinstance(it["reverse"], bool) for it in BIGFIVE_ITEMS)
    # structural: every logical answer is one of its options
    for it in LOGIC_ITEMS:
        assert it["answer"] in it["options"], it["id"]
    # stripped output leaks nothing
    for it in public_disc():
        assert set(it.keys()) == {"id", "words"} and all(isinstance(w, str) for w in it["words"])
    for it in public_bigfive():
        assert set(it.keys()) == {"id", "text"}
    for it in public_logic():
        assert set(it.keys()) == {"id", "text", "options"}
    # DISC scoring: pick axis-D word most, axis-S word least across all items → D high, S low
    ans = {}
    for it in DISC_ITEMS:
        di = next(i for i, w in enumerate(it["words"]) if w["axis"] == "D")
        si = next(i for i, w in enumerate(it["words"]) if w["axis"] == "S")
        ans[it["id"]] = {"most": di, "least": si}
    scores, dom = score_disc(ans)
    assert scores["D"] == 100 and scores["S"] == 0, scores
    assert dom == "D", dom
    # Big Five: all 5s. Reverse items invert → O/C/E/A =100, N (reverse) =0
    b = score_bigfive({it["id"]: 5 for it in BIGFIVE_ITEMS})
    assert b["O"] == 100 and b["N"] == 0, b
    # fit: identical → 100, opposite → 0, blank target → distance from 50
    assert fit({"D": 80, "I": 40, "S": 20, "C": 60}, {"D": 80, "I": 40, "S": 20, "C": 60}, DISC_AXES) == 100.0
    assert fit({"D": 100, "I": 100, "S": 100, "C": 100}, {"D": 0, "I": 0, "S": 0, "C": 0}, DISC_AXES) == 0.0
    assert fit({"D": 50, "I": 50, "S": 50, "C": 50}, {}, DISC_AXES) == 100.0
    print("recruitment_instruments selfcheck ok")


if __name__ == "__main__":
    _selfcheck()
```

- [ ] **Step 2: Run the self-check, verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment_instruments.py`
Expected: `recruitment_instruments selfcheck ok`

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/recruitment_instruments.py
git commit -m "feat(recruitment): baked DISC/BigFive/logical instrument banks + scoring"
```

---

### Task 2: Generate & validate the full 63-item Bahasa banks

**Files:**
- Modify: `vernon_project/api/recruitment_instruments.py` (replace the three seed lists with full banks)

**Interfaces:**
- Consumes: the list schemas + `_selfcheck()` from Task 1 (unchanged).
- Produces: `DISC_ITEMS` (~28), `BIGFIVE_ITEMS` (~25, 5 per trait, a mix of `reverse`), `LOGIC_ITEMS` (~10) — same shapes, more rows.

This task's content is generated by a validation Workflow (the psychometrics must not be garbage), then hand-verified against the self-check.

- [ ] **Step 1: Run a content-generation + validation Workflow**

Author and run a Workflow that, in parallel: (a) drafts ~28 DISC forced-choice items (4 Bahasa adjectives, one mapped to each of D/I/S/C, natural workplace language), ~25 Big Five items (5 per trait, ~40% reverse-keyed, clearly worded, no double-barrels), and ~10 logical/problem-solving MCQs (number series, syllogism, pattern, basic quantitative — single unambiguous correct option); then (b) an adversarial validator pass per item checks: DISC — exactly one word per axis, no synonym bleed across axes; Big Five — correct trait assignment and reverse flag, not double-barreled, culturally neutral for Indonesia; Logical — exactly one defensible correct answer, distractors plausible. Only items passing validation are emitted. Emit as three Python-literal lists matching the Task 1 schema.

Structural rules the generated data MUST satisfy (the self-check enforces them):
- each DISC item: `sorted(axis for each word) == ["C","D","I","S"]`
- Big Five: `{it["trait"]} == {"O","C","E","A","N"}`, each trait exactly 5 items, `reverse` is a real bool
- each logical item: `answer in options`, ≥3 options

- [ ] **Step 2: Paste the validated lists into `recruitment_instruments.py`**

Replace the seed `DISC_ITEMS`, `BIGFIVE_ITEMS`, `LOGIC_ITEMS` with the generated lists. Keep all functions and the self-check unchanged.

- [ ] **Step 3: Extend the self-check with count assertions**

Add to `_selfcheck()` (before the `print`):

```python
    assert len(DISC_ITEMS) >= 20, len(DISC_ITEMS)
    assert len(BIGFIVE_ITEMS) == 5 * len(BIGFIVE_TRAITS), len(BIGFIVE_ITEMS)
    for t in BIGFIVE_TRAITS:
        assert sum(1 for it in BIGFIVE_ITEMS if it["trait"] == t) == 5, t
    assert len(LOGIC_ITEMS) >= 8, len(LOGIC_ITEMS)
    assert any(it["reverse"] for it in BIGFIVE_ITEMS), "need some reverse-keyed items"
```

- [ ] **Step 4: Run the self-check, verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment_instruments.py`
Expected: `recruitment_instruments selfcheck ok`

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/recruitment_instruments.py
git commit -m "feat(recruitment): full validated Bahasa DISC/BigFive/logical item banks"
```

---

### Task 3: Doctype fields — toggles, targets, results, answer tag

**Files:**
- Modify: `vernon_project/vernon_project/doctype/job_opening/job_opening.json`
- Modify: `vernon_project/vernon_project/doctype/job_application/job_application.json`
- Modify: `vernon_project/vernon_project/doctype/job_application_answer/job_application_answer.json`

**Interfaces:**
- Produces (Job Opening fields): `test_disc`, `test_personality`, `test_logical` (Check); DISC targets `target_d/target_i/target_s/target_c` (Int); Big Five targets `target_o/target_c_big/target_e/target_a/target_n` (Int).
- Produces (Job Application fields): `psych_result` (Code/JSON), `disc_type` (Data), `disc_fit`/`personality_fit`/`logical_score`/`logical_max`/`overall_fit` (Float, read-only).
- Produces (Job Application Answer field): `test` (Data, read-only).

- [ ] **Step 1: Add Job Opening fields**

In `job_opening.json`, extend `field_order` — after `"questions"` add:
```
"section_break_std", "test_disc", "test_personality", "test_logical",
"section_break_disc_t", "target_d", "target_i", "target_s", "target_c",
"section_break_big_t", "target_o", "target_c_big", "target_e", "target_a", "target_n"
```
Append to `fields`:
```json
{"fieldname": "section_break_std", "fieldtype": "Section Break", "label": "Standard Assessments"},
{"fieldname": "test_disc", "fieldtype": "Check", "label": "DISC test"},
{"fieldname": "test_personality", "fieldtype": "Check", "label": "Personality (Big Five) test"},
{"fieldname": "test_logical", "fieldtype": "Check", "label": "Logical & problem-solving test"},
{"fieldname": "section_break_disc_t", "fieldtype": "Section Break", "label": "DISC target profile", "depends_on": "eval:doc.test_disc"},
{"fieldname": "target_d", "fieldtype": "Int", "label": "Target D", "depends_on": "eval:doc.test_disc"},
{"fieldname": "target_i", "fieldtype": "Int", "label": "Target I", "depends_on": "eval:doc.test_disc"},
{"fieldname": "target_s", "fieldtype": "Int", "label": "Target S", "depends_on": "eval:doc.test_disc"},
{"fieldname": "target_c", "fieldtype": "Int", "label": "Target C", "depends_on": "eval:doc.test_disc"},
{"fieldname": "section_break_big_t", "fieldtype": "Section Break", "label": "Personality target profile", "depends_on": "eval:doc.test_personality"},
{"fieldname": "target_o", "fieldtype": "Int", "label": "Target O", "depends_on": "eval:doc.test_personality"},
{"fieldname": "target_c_big", "fieldtype": "Int", "label": "Target C (Conscientiousness)", "depends_on": "eval:doc.test_personality"},
{"fieldname": "target_e", "fieldtype": "Int", "label": "Target E", "depends_on": "eval:doc.test_personality"},
{"fieldname": "target_a", "fieldtype": "Int", "label": "Target A", "depends_on": "eval:doc.test_personality"},
{"fieldname": "target_n", "fieldtype": "Int", "label": "Target N", "depends_on": "eval:doc.test_personality"}
```

- [ ] **Step 2: Add Job Application fields**

In `job_application.json`, extend `field_order` — after `"answers"` (inside the test section) add:
```
"psych_result", "disc_type", "disc_fit", "personality_fit", "logical_score", "logical_max", "overall_fit"
```
Append to `fields`:
```json
{"fieldname": "psych_result", "fieldtype": "Code", "label": "Assessment Result (JSON)", "options": "JSON", "read_only": 1},
{"fieldname": "disc_type", "fieldtype": "Data", "label": "DISC Type", "read_only": 1, "in_list_view": 1},
{"fieldname": "disc_fit", "fieldtype": "Float", "label": "DISC Fit %", "read_only": 1},
{"fieldname": "personality_fit", "fieldtype": "Float", "label": "Personality Fit %", "read_only": 1},
{"fieldname": "logical_score", "fieldtype": "Float", "label": "Logical Score", "read_only": 1},
{"fieldname": "logical_max", "fieldtype": "Float", "label": "Logical Max", "read_only": 1},
{"fieldname": "overall_fit", "fieldtype": "Float", "label": "Overall Fit %", "read_only": 1, "in_list_view": 1, "in_standard_filter": 1}
```

- [ ] **Step 3: Add the Job Application Answer `test` tag**

In `job_application_answer.json`, add `"test"` to `field_order` (after `"qtype"`), and to `fields`:
```json
{"fieldname": "test", "fieldtype": "Data", "label": "Test", "read_only": 1}
```

- [ ] **Step 4: Migrate the live site**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error; new columns exist. Verify:
`bench --site project.vernon.id console <<'EOF'`
`print(frappe.get_meta("Job Application").has_field("overall_fit"), frappe.get_meta("Job Opening").has_field("test_disc"))`
`EOF`
Expected: `True True`

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/job_opening/job_opening.json \
        vernon_project/vernon_project/doctype/job_application/job_application.json \
        vernon_project/vernon_project/doctype/job_application_answer/job_application_answer.json
git commit -m "feat(recruitment): assessment toggles, target profiles, result fields"
```

---

### Task 4: API — serve tests, score on submit, expose results

**Files:**
- Modify: `vernon_project/api/recruitment.py`

**Interfaces:**
- Consumes: `recruitment_instruments` (Task 1/2), existing `_score_answers`/`_require_hr`/`_normalize_wa`.
- Produces: `get_job` returns `test_disc/test_personality/test_logical` + `disc_items/bigfive_items/logic_items` (stripped); `submit_application` accepts `disc_answers/personality_answers/logical_answers` (JSON) and persists scored results; `get_application` returns `psych_result` + fit/score fields; `save_opening` persists toggles+targets; `APP_LIST_FIELDS` gains `overall_fit`, `disc_type`.

- [ ] **Step 1: Add scoring assertions to the existing self-check (failing first)**

In `recruitment.py` `_selfcheck()`, before `print(...)`, add:
```python
    from vernon_project.api import recruitment_instruments as ri
    # enabled-tests helper filters correctly
    op = frappe._dict({"test_disc": 1, "test_personality": 0, "test_logical": 1})
    assert _enabled_tests(op) == {"disc": True, "personality": False, "logical": True}
    # overall_fit averages only enabled contributors
    assert _overall_fit(70.0, None, 8, 10, {"disc": True, "personality": False, "logical": True}) == 75.0
    assert _overall_fit(None, None, 0, 0, {"disc": False, "personality": False, "logical": False}) is None
```

- [ ] **Step 2: Run the self-check, verify it fails**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment.py`
Expected: FAIL — `NameError: name '_enabled_tests' is not defined`

- [ ] **Step 3: Add the two pure helpers**

After `_score_answers` in `recruitment.py`:
```python
def _enabled_tests(opening):
    return {"disc": bool(opening.get("test_disc")),
            "personality": bool(opening.get("test_personality")),
            "logical": bool(opening.get("test_logical"))}


def _overall_fit(disc_fit, personality_fit, logical_score, logical_max, enabled):
    """Mean of enabled contributors: disc_fit, personality_fit, logical %. None if nothing enabled."""
    parts = []
    if enabled["disc"] and disc_fit is not None:
        parts.append(disc_fit)
    if enabled["personality"] and personality_fit is not None:
        parts.append(personality_fit)
    if enabled["logical"] and logical_max:
        parts.append(100.0 * logical_score / logical_max)
    return round(sum(parts) / len(parts), 1) if parts else None
```

- [ ] **Step 4: Run the self-check, verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment.py`
Expected: `recruitment selfcheck ok`

- [ ] **Step 5: Extend `get_job` to serve enabled tests (stripped)**

Add the import at the top of `recruitment.py` (after `from frappe.utils import ...`):
```python
from vernon_project.api import recruitment_instruments as ri
```
In `get_job`, before `return {`, and add keys to the returned dict:
```python
    tests = _enabled_tests(doc)
```
Add to the returned dict (after `"questions": questions,`):
```python
        "test_disc": 1 if tests["disc"] else 0,
        "test_personality": 1 if tests["personality"] else 0,
        "test_logical": 1 if tests["logical"] else 0,
        "disc_items": ri.public_disc() if tests["disc"] else [],
        "bigfive_items": ri.public_bigfive() if tests["personality"] else [],
        "logic_items": ri.public_logic() if tests["logical"] else [],
```

- [ ] **Step 6: Score the new tests in `submit_application`**

Change the signature to accept the new answer payloads:
```python
def submit_application(job=None, full_name=None, email=None, phone=None, nik_ktp=None,
                       cover_letter=None, answers=None, company_website=None,
                       disc_answers=None, personality_answers=None, logical_answers=None):
```
After the existing job-specific `rows, score, max_score, grading_status = _score_answers(...)` block, insert:
```python
    tests = _enabled_tests(opening)

    def _loadjson(v, default):
        try:
            return json.loads(v) if isinstance(v, str) else (v if v is not None else default)
        except ValueError:
            return default

    # tag existing job-specific rows
    for r in rows:
        r["test"] = "Job-Specific"

    logical_score = logical_max = 0.0
    if tests["logical"]:
        la = _loadjson(logical_answers, [])
        lrows, ls, lm, _ = _score_answers(ri.logic_qdefs(), la)
        for r in lrows:
            r["test"] = "Logical"
        if len(la) < len(ri.LOGIC_ITEMS):
            frappe.throw("Mohon jawab semua soal tes logika.")
        rows += lrows
        logical_score, logical_max = ls, lm
        score += ls
        max_score += lm

    psych = {}
    disc_type = None
    disc_fit = personality_fit = None
    if tests["disc"]:
        da = _loadjson(disc_answers, {})
        if len([1 for it in ri.DISC_ITEMS if da.get(it["id"])]) < len(ri.DISC_ITEMS):
            frappe.throw("Mohon lengkapi tes DISC.")
        dscores, disc_type = ri.score_disc(da)
        disc_fit = ri.fit(dscores, {
            "D": opening.target_d, "I": opening.target_i,
            "S": opening.target_s, "C": opening.target_c}, ri.DISC_AXES)
        psych["disc"] = {"answers": da, "scores": dscores, "type": disc_type, "fit": disc_fit}
    if tests["personality"]:
        pa = _loadjson(personality_answers, {})
        if len([1 for it in ri.BIGFIVE_ITEMS if pa.get(it["id"]) is not None]) < len(ri.BIGFIVE_ITEMS):
            frappe.throw("Mohon lengkapi tes kepribadian.")
        pscores = ri.score_bigfive(pa)
        personality_fit = ri.fit(pscores, {
            "O": opening.target_o, "C": opening.target_c_big, "E": opening.target_e,
            "A": opening.target_a, "N": opening.target_n}, ri.BIGFIVE_TRAITS)
        psych["personality"] = {"answers": pa, "scores": pscores, "fit": personality_fit}

    overall_fit = _overall_fit(disc_fit, personality_fit, logical_score, logical_max, tests)
```
Then add these keys to the `frappe.get_doc({...})` payload (alongside `"answers": rows,`):
```python
        "psych_result": json.dumps(psych) if psych else None,
        "disc_type": disc_type, "disc_fit": disc_fit, "personality_fit": personality_fit,
        "logical_score": logical_score, "logical_max": logical_max, "overall_fit": overall_fit,
```

- [ ] **Step 7: Return results from `get_application`; persist toggles/targets in `save_opening`; widen list fields**

In `get_application`, add to the returned dict (after `"grading_status": doc.grading_status,`):
```python
        "psych_result": json.loads(doc.psych_result) if doc.psych_result else None,
        "disc_type": doc.disc_type, "disc_fit": doc.disc_fit,
        "personality_fit": doc.personality_fit, "logical_score": doc.logical_score,
        "logical_max": doc.logical_max, "overall_fit": doc.overall_fit,
        "test_disc": frappe.db.get_value("Job Opening", doc.job_opening, "test_disc"),
        "test_personality": frappe.db.get_value("Job Opening", doc.job_opening, "test_personality"),
        "test_logical": frappe.db.get_value("Job Opening", doc.job_opening, "test_logical"),
```
Also add `"test"` to each answer row in that method's `answers` comprehension:
```python
            "max_points": a.max_points, "test": a.test} for i, a in enumerate(doc.answers)],
```
In `save_opening`, add params to the signature:
```python
def save_opening(name=None, title=None, brand=None, location=None, employment_type=None,
                 description=None, requirements=None, status=None, closes_on=None,
                 slug=None, questions=None, test_disc=None, test_personality=None,
                 test_logical=None, targets=None):
```
Before `doc.save(...)`:
```python
    from frappe.utils import cint
    doc.test_disc = cint(test_disc)
    doc.test_personality = cint(test_personality)
    doc.test_logical = cint(test_logical)
    tg = json.loads(targets) if isinstance(targets, str) else (targets or {})
    for f in ("target_d", "target_i", "target_s", "target_c",
              "target_o", "target_c_big", "target_e", "target_a", "target_n"):
        doc.set(f, cint(tg.get(f)))
```
Add `"overall_fit"` and `"disc_type"` to `APP_LIST_FIELDS`.

- [ ] **Step 8: Add a leak-guard + scoring self-check (site-context, run via console)**

Add a module-level function (not in `_selfcheck`, since it needs the instruments only, not a site):
```python
def _leakcheck():
    """No scoring key escapes to the guest payload."""
    import json as _j
    blob = _j.dumps({"disc": ri.public_disc(), "big": ri.public_bigfive(), "logic": ri.public_logic()})
    for banned in ('"axis"', '"trait"', '"reverse"', '"answer"', '"correct_answer"'):
        assert banned not in blob, banned
    print("recruitment leakcheck ok")
```
Call it from `__main__`:
```python
if __name__ == "__main__":
    _selfcheck()
    _leakcheck()
```

- [ ] **Step 9: Run both checks + restart, verify**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment.py`
Expected: `recruitment selfcheck ok` then `recruitment leakcheck ok`
Then: `sudo /usr/local/bin/tj-restart`

- [ ] **Step 10: Commit**

```bash
git add vernon_project/api/recruitment.py
git commit -m "feat(recruitment): serve enabled tests, score DISC/BigFive/logical, expose fit"
```

---

### Task 5: Shared TS types + api client

**Files:**
- Modify: `frontend/src/lib/api.ts` (recruitment section, ~line 1193–1342)

**Interfaces:**
- Consumes: existing `api.get/api.post`, `recruitmentApi`.
- Produces: `JobOpeningDoc` gains `test_disc?/test_personality?/test_logical?: 0|1` and `targets?: Record<string, number>`; `JobApplicationDetail` gains the psych result fields; `PsychResult` type; `saveOpening` sends the new fields.

- [ ] **Step 1: Extend the interfaces**

In `JobOpeningDoc`, add:
```typescript
  test_disc?: 0 | 1
  test_personality?: 0 | 1
  test_logical?: 0 | 1
  targets?: Record<string, number>
  // flat target fields returned by getOpening (doc.as_dict()); read on load in Task 7
  target_d?: number; target_i?: number; target_s?: number; target_c?: number
  target_o?: number; target_c_big?: number; target_e?: number; target_a?: number; target_n?: number
```
Add a result type before `JobApplicationDetail`:
```typescript
export interface PsychResult {
  disc?: { answers: Record<string, { most: number; least: number }>; scores: Record<string, number>; type: string; fit: number }
  personality?: { answers: Record<string, number>; scores: Record<string, number>; fit: number }
}
```
In `JobApplicationAnswer`, add `test?: string`.
In `JobApplicationDetail`, add:
```typescript
  psych_result: PsychResult | null
  disc_type: string | null
  disc_fit: number | null
  personality_fit: number | null
  logical_score: number | null
  logical_max: number | null
  overall_fit: number | null
  test_disc?: 0 | 1
  test_personality?: 0 | 1
  test_logical?: 0 | 1
```
In `JobApplicationListItem`, add `overall_fit?: number | null` and `disc_type?: string | null`.

- [ ] **Step 2: Send the new fields in `saveOpening`**

In `recruitmentApi.saveOpening`, add to the posted body:
```typescript
      test_disc: v.test_disc ? 1 : 0,
      test_personality: v.test_personality ? 1 : 0,
      test_logical: v.test_logical ? 1 : 0,
      targets: JSON.stringify(v.targets ?? {}),
```

- [ ] **Step 3: Typecheck both frontends**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no errors (web imports these types via `@`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(recruitment): TS types + api client for assessment tests"
```

---

### Task 6: Public www apply form — render & submit the tests

**Files:**
- Modify: `vernon_project/www/apply.py`
- Modify: `vernon_project/www/apply.html`

**Interfaces:**
- Consumes: `get_job`-shaped data (but www builds its own context from the doc). Adds `disc_items/bigfive_items/logic_items` + toggles + Bahasa labels to `context`.
- Produces: three extra hidden inputs in the POST (`disc_answers`, `personality_answers`, `logical_answers` as JSON).

- [ ] **Step 1: Build the test context in `apply.py`**

Add the import at top: `from vernon_project.api import recruitment_instruments as ri`.
Inside `if name:`, after building `job = {...}` (extend the dict) add the three item lists + toggles:
```python
            job["test_disc"] = int(doc.test_disc or 0)
            job["test_personality"] = int(doc.test_personality or 0)
            job["test_logical"] = int(doc.test_logical or 0)
            job["disc_items"] = ri.public_disc() if doc.test_disc else []
            job["bigfive_items"] = ri.public_bigfive() if doc.test_personality else []
            job["logic_items"] = ri.public_logic() if doc.test_logical else []
```
Add Bahasa labels to `context.t`:
```python
        "disc_title": p({"id": "Tes DISC", "en": "DISC test"}),
        "disc_lead": p({"id": "Untuk tiap baris, pilih satu kata yang PALING dan satu yang PALING TIDAK menggambarkan kamu.",
                        "en": "For each row, pick the word MOST and the word LEAST like you."}),
        "disc_most": p({"id": "Paling", "en": "Most"}),
        "disc_least": p({"id": "Paling tidak", "en": "Least"}),
        "big_title": p({"id": "Tes Kepribadian", "en": "Personality test"}),
        "big_lead": p({"id": "Seberapa setuju kamu dengan tiap pernyataan?", "en": "How much do you agree?"}),
        "big_1": p({"id": "Sangat tidak setuju", "en": "Strongly disagree"}),
        "big_5": p({"id": "Sangat setuju", "en": "Strongly agree"}),
        "logic_title": p({"id": "Tes Logika & Pemecahan Masalah", "en": "Logical & problem-solving test"}),
        "incomplete": p({"id": "Mohon lengkapi semua tes sebelum mengirim.", "en": "Please complete every test before submitting."}),
```

- [ ] **Step 2: Render the three test blocks in `apply.html`**

After the existing `{% if job.questions %}…{% endif %}` block (before the submit button), add:
```html
      {% if job.test_disc %}
      <div class="rounded-2xl bg-paper-card/70 border border-paper-edge shadow-card p-6 space-y-5" data-disc>
        <div><h3 class="font-display text-xl font-bold text-brand-900">{{ t.disc_title }}</h3>
          <p class="mt-1 text-sm text-brand-800/70">{{ t.disc_lead }}</p></div>
        {% for it in job.disc_items %}
        <fieldset class="space-y-2" data-disc-item="{{ it.id }}">
          <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs font-semibold text-brand-700">
            <span></span><span>{{ t.disc_most }}</span><span>{{ t.disc_least }}</span>
          </div>
          {% for w in it.words %}
          <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span class="text-brand-900">{{ w }}</span>
            <input type="radio" name="disc_most_{{ it.id }}" value="{{ loop.index0 }}" class="text-brand-600">
            <input type="radio" name="disc_least_{{ it.id }}" value="{{ loop.index0 }}" class="text-rose-500">
          </div>
          {% endfor %}
        </fieldset>
        {% endfor %}
      </div>
      {% endif %}

      {% if job.test_personality %}
      <div class="rounded-2xl bg-paper-card/70 border border-paper-edge shadow-card p-6 space-y-5" data-big>
        <div><h3 class="font-display text-xl font-bold text-brand-900">{{ t.big_title }}</h3>
          <p class="mt-1 text-sm text-brand-800/70">{{ t.big_lead }}</p></div>
        {% for it in job.bigfive_items %}
        <fieldset class="space-y-1.5" data-big-item="{{ it.id }}">
          <legend class="text-sm text-brand-900">{{ loop.index }}. {{ it.text }}</legend>
          <div class="flex items-center justify-between gap-1 text-[11px] text-brand-700/70">
            <span>{{ t.big_1 }}</span><span>{{ t.big_5 }}</span></div>
          <div class="flex justify-between gap-2">
            {% for n in [1,2,3,4,5] %}
            <label class="flex-1 text-center rounded-lg border border-paper-edge py-2 cursor-pointer hover:bg-brand-50">
              <input type="radio" name="big_{{ it.id }}" value="{{ n }}" class="sr-only peer">
              <span class="peer-checked:font-bold peer-checked:text-brand-700">{{ n }}</span>
            </label>
            {% endfor %}
          </div>
        </fieldset>
        {% endfor %}
      </div>
      {% endif %}

      {% if job.test_logical %}
      <div class="rounded-2xl bg-paper-card/70 border border-paper-edge shadow-card p-6 space-y-5" data-logic>
        <div><h3 class="font-display text-xl font-bold text-brand-900">{{ t.logic_title }}</h3></div>
        {% for it in job.logic_items %}
        <fieldset class="space-y-2" data-logic-item="{{ it.id }}">
          <legend class="text-sm font-semibold text-brand-900">{{ loop.index }}. {{ it.text }}</legend>
          {% for opt in it.options %}
          <label class="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-brand-50 cursor-pointer">
            <input type="radio" name="logic_{{ it.id }}" value="{{ opt }}" class="text-brand-600">
            <span class="text-brand-900">{{ opt }}</span>
          </label>
          {% endfor %}
        </fieldset>
        {% endfor %}
      </div>
      {% endif %}
```

- [ ] **Step 3: Collect answers + gate completeness in the submit script**

In the `<script>` block, add JSON blobs after the existing `QUESTIONS` var:
```javascript
    var DISC = {{ job.disc_items | tojson }};
    var BIG = {{ job.bigfive_items | tojson }};
    var LOGIC = {{ job.logic_items | tojson }};
```
Inside the submit handler, after building `answers` and before `var fd = new FormData()`:
```javascript
      var discAns = {}, bigAns = {}, logicAns = [];
      for (var di = 0; di < DISC.length; di++) {
        var id = DISC[di].id;
        var m = form.elements['disc_most_' + id], l = form.elements['disc_least_' + id];
        if (!m || m.value === '' || !l || l.value === '' || m.value === l.value) { showError(T.incomplete); return; }
        discAns[id] = { most: parseInt(m.value, 10), least: parseInt(l.value, 10) };
      }
      for (var bi = 0; bi < BIG.length; bi++) {
        var bid = BIG[bi].id, bf = form.elements['big_' + bid];
        if (!bf || bf.value === '') { showError(T.incomplete); return; }
        bigAns[bid] = parseInt(bf.value, 10);
      }
      logicAns = LOGIC.map(function (q) {
        var f = form.elements['logic_' + q.id];
        return f ? (f.value || '') : '';
      });
      if (LOGIC.length && logicAns.some(function (v) { return !v; })) { showError(T.incomplete); return; }
```
And append to the FormData (after `fd.append('answers', ...)`):
```javascript
      fd.append('disc_answers', JSON.stringify(discAns));
      fd.append('personality_answers', JSON.stringify(bigAns));
      fd.append('logical_answers', JSON.stringify(logicAns));
```
(Guard: DISC `most !== least` is enforced above; the server re-checks by ignoring `least==most`.)

- [ ] **Step 4: Deploy www (no build) + smoke-test render**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-website-cache`
Create a throwaway Open opening with all three tests on (console), then:
Run: `curl -s 'https://project.vernon.id/apply?job=<slug>' | grep -c data-disc-item`
Expected: count == number of DISC items (>0). Repeat grep for `data-big-item`, `data-logic-item`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/www/apply.py vernon_project/www/apply.html
git commit -m "feat(recruitment): render & submit DISC/personality/logical on public apply form"
```

---

### Task 7: SPA opening editor — toggles + target sliders (both /m + /w)

**Files:**
- Modify: `frontend/src/pages/RecruitmentOpeningFormScreen.tsx`
- Modify: `frontend-web/src/pages/RecruitmentOpeningForm.tsx`

**Interfaces:**
- Consumes: `recruitmentApi.getOpening/saveOpening`, `JobOpeningDoc` (with `test_disc/…/targets`).
- Produces: the saved opening carries toggles + targets.

- [ ] **Step 1: Mobile — add state, load, render, save**

In `RecruitmentOpeningFormScreen.tsx` add state (near the other `useState`s):
```typescript
  const [testDisc, setTestDisc] = useState(false)
  const [testPersonality, setTestPersonality] = useState(false)
  const [testLogical, setTestLogical] = useState(false)
  const [targets, setTargets] = useState<Record<string, number>>({})
```
In the `getOpening(...).then((o) => {…})` block, add:
```typescript
        setTestDisc(!!o.test_disc)
        setTestPersonality(!!o.test_personality)
        setTestLogical(!!o.test_logical)
        setTargets(o.targets ?? {})
```
> Note: `getOpening` returns the raw doc (`doc.as_dict()`), so `test_disc`/`target_*` come back as top-level fields. Build `targets` from them: replace the line above with a gather —
```typescript
        setTargets({
          target_d: o.target_d ?? 0, target_i: o.target_i ?? 0, target_s: o.target_s ?? 0, target_c: o.target_c ?? 0,
          target_o: o.target_o ?? 0, target_c_big: o.target_c_big ?? 0, target_e: o.target_e ?? 0,
          target_a: o.target_a ?? 0, target_n: o.target_n ?? 0,
        })
```
(and add those optional fields to `JobOpeningDoc` in api.ts Task 5 — extend it with `target_d?…target_n?: number`.)

In `save()`, add to the `saveOpening({...})` payload:
```typescript
        test_disc: testDisc ? 1 : 0,
        test_personality: testPersonality ? 1 : 0,
        test_logical: testLogical ? 1 : 0,
        targets,
```
Add a UI card before the "Soal tes" card:
```tsx
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Tes standar</p>
          {([['DISC', testDisc, setTestDisc], ['Kepribadian (Big Five)', testPersonality, setTestPersonality], ['Logika & pemecahan masalah', testLogical, setTestLogical]] as const).map(([lbl, val, set]) => (
            <label key={lbl} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              {lbl}
            </label>
          ))}
          {testDisc && <TargetGrid label="Target DISC" keys={['target_d','target_i','target_s','target_c']} labels={['D','I','S','C']} targets={targets} setTargets={setTargets} />}
          {testPersonality && <TargetGrid label="Target Kepribadian" keys={['target_o','target_c_big','target_e','target_a','target_n']} labels={['O','C','E','A','N']} targets={targets} setTargets={setTargets} />}
        </div>
```
Add the `TargetGrid` helper component at the bottom of the file:
```tsx
function TargetGrid({ label, keys, labels, targets, setTargets }: {
  label: string; keys: string[]; labels: string[]
  targets: Record<string, number>; setTargets: (u: (t: Record<string, number>) => Record<string, number>) => void
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label} (0–100)</p>
      <div className="grid grid-cols-5 gap-2">
        {keys.map((k, i) => (
          <label key={k} className="text-center">
            <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">{labels[i]}</span>
            <input type="number" min={0} max={100} value={targets[k] ?? 0}
              onChange={(e) => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setTargets((t) => ({ ...t, [k]: n })) }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-1 py-1 text-center text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </label>
        ))}
      </div>
    </div>
  )
}
```
> `min/max` on the number input clamps on commit, not per keystroke (avoids the controlled-input clamp trap).

- [ ] **Step 2: Web — mirror the same in `RecruitmentOpeningForm.tsx`**

Read `frontend-web/src/pages/RecruitmentOpeningForm.tsx` first to match its bento/tile styling and its existing state names. Add the identical state (`testDisc/testPersonality/testLogical/targets`), the same load-gather, the same `saveOpening` payload additions, and a target-grid block styled as a web tile (reuse the file's existing card classes; the checkbox + numeric-grid markup is the same, only the wrapper classes differ). Web uses the shared `NumField`/number convention if present in that file — match whatever the sibling questions editor uses.

- [ ] **Step 3: Typecheck both**

Run: `cd .../frontend && npx tsc --noEmit` and `cd .../frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RecruitmentOpeningFormScreen.tsx frontend-web/src/pages/RecruitmentOpeningForm.tsx
git commit -m "feat(recruitment): opening editor test toggles + target profile (both frontends)"
```

---

### Task 8: SPA application detail — profile bars + fit + logical subtotal (both /m + /w)

**Files:**
- Modify: `frontend/src/pages/RecruitmentApplicationScreen.tsx`
- Modify: `frontend-web/src/pages/RecruitmentApplication.tsx`

**Interfaces:**
- Consumes: `getApplication` → `JobApplicationDetail` (with `psych_result`, `disc_type`, `*_fit`, `logical_score/max`, `overall_fit`).
- Produces: (display only).

- [ ] **Step 1: Mobile — render an assessment card**

Read `RecruitmentApplicationScreen.tsx` to find where `score`/`answers` render. Add, above or beside that, an assessment block driven by the detail object. Add a shared bar component at the bottom of the file:
```tsx
function Bars({ title, scores, order, fit }: {
  title: string; scores: Record<string, number>; order: string[]; fit: number | null
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-800 dark:text-slate-100">{title}</span>
        {fit != null && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Fit {fit}%</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-8 text-xs font-bold text-slate-500">{k}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${scores[k] ?? 0}%` }} />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{scores[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```
Where the detail renders (using the loaded `app: JobApplicationDetail`):
```tsx
        {(app.psych_result || app.logical_max) && (
          <div className="flex flex-col gap-3">
            {app.overall_fit != null && (
              <div className="rounded-xl bg-brand-600 p-3 text-white">
                <p className="text-xs opacity-80">Kecocokan keseluruhan</p>
                <p className="text-2xl font-bold">{app.overall_fit}%</p>
              </div>
            )}
            {app.psych_result?.disc && (
              <Bars title={`DISC — dominan ${app.disc_type}`} scores={app.psych_result.disc.scores}
                order={['D', 'I', 'S', 'C']} fit={app.disc_fit} />
            )}
            {app.psych_result?.personality && (
              <Bars title="Kepribadian (Big Five)" scores={app.psych_result.personality.scores}
                order={['O', 'C', 'E', 'A', 'N']} fit={app.personality_fit} />
            )}
            {!!app.logical_max && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <span className="text-sm font-bold text-stone-800 dark:text-slate-100">Logika</span>
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{app.logical_score} / {app.logical_max}</span>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 2: Web — mirror in `RecruitmentApplication.tsx`**

Read the file, add the same assessment block using its web tile styling (same `Bars` logic, web classes). Keep the `overall_fit` headline, DISC/OCEAN bars, and logical subtotal.

- [ ] **Step 3: Optional — surface `overall_fit` in the applications list**

In `RecruitmentApplicationsScreen.tsx` / `RecruitmentApplications.tsx`, if the list rows show score, add an `overall_fit`% chip when present (`row.overall_fit != null`). Small, additive.

- [ ] **Step 4: Typecheck both**

Run: `cd .../frontend && npx tsc --noEmit` and `cd .../frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RecruitmentApplicationScreen.tsx frontend-web/src/pages/RecruitmentApplication.tsx \
        frontend/src/pages/RecruitmentApplicationsScreen.tsx frontend-web/src/pages/RecruitmentApplications.tsx
git commit -m "feat(recruitment): application detail assessment bars + fit (both frontends)"
```

---

### Task 9: Build, deploy, docs, verify, What's New

**Files:**
- Modify: built bundles under `vernon_project/public/frontend{,_web}/` (generated)
- Modify: `docs/assets/data.js` (generated, only if changed)

- [ ] **Step 1: Build both bundles**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: both succeed; new hashed assets under each `public/frontend{,_web}/assets/`.

- [ ] **Step 2: Deploy Python + schema (already migrated/restarted in Tasks 3–4; re-run to be safe)**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && sudo /usr/local/bin/tj-restart`

- [ ] **Step 3: Docs staleness check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js`
Expected: no diff (no new doctype/endpoint/hook — only fields + reshaped payloads). If it errors on a missing cluster, no new doctype was added, so investigate; if it prints a diff, commit `docs/assets/data.js`.

- [ ] **Step 4: Live E2E verify (one enabled test end-to-end per surface)**

Via console, create/reuse an Open opening with all three tests on and a DISC/BigFive target set. Then:
- Public: `curl` the `/apply?job=<slug>` page → assert the three `data-*-item` blocks render (Task 6 Step 4).
- Submit a full application through the real endpoint (console `frappe.call('vernon_project.api.recruitment.submit_application', ...)` with complete `disc_answers/personality_answers/logical_answers`), then `frappe.call('...get_application', name=...)` and assert `overall_fit`, `disc_type`, `psych_result.disc.scores`, `logical_score` are populated and sane.
- HR SPA: load the application detail on `/m` and `/w`, confirm bars + fit render.

- [ ] **Step 5: Add the What's New (`App Release`) row**

Write `/tmp/claude-*/releases.json` with one row (Bahasa, `platform` `Both`, semver bump from the newest existing row, `release_date` today `2026-07-23`), e.g. notes (one bullet per line):
```
Tes lamaran kerja kini lengkap: DISC, kepribadian, dan tes logika (/m & /w)
HR bisa memilih tes mana yang dipakai per lowongan
Hasil tampil sebagai grafik profil + persentase kecocokan dengan target
```
Insert via the project CLAUDE.md one-liner (`bench --site project.vernon.id console` heredoc, `insert(ignore_permissions=True)`, `frappe.db.commit()`), then verify with `frappe.call('vernon_project.api.app_release.get_app_releases', platform='Mobile')`.

- [ ] **Step 6: Commit the build + any docs**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web docs/assets/data.js
git commit -m "build(recruitment): ship interview assessment bundles + docs"
```

---

## Self-Review

**Spec coverage:**
- DISC / Personality / Logical baked banks → Tasks 1–2. ✓
- Per-job toggle → Task 3 (fields), 6/7 (UI). ✓
- Profile + target fit → Task 1 (`fit`), 3 (target fields), 4 (compute), 8 (display). ✓
- No scoring-key leak → Task 1 `public_*` + Task 4 `_leakcheck`. ✓
- All-enabled-required → Task 4 submit guards + Task 6 client gate. ✓
- Both frontends → Tasks 7–8 (mobile + web files each). ✓
- Public www apply surface → Task 6. ✓
- gen_docs + What's New → Task 9. ✓

**Placeholder scan:** Task 2's 63 items are generated by a Workflow (data, not plan code) with explicit structural asserts — not a "TODO". All other steps carry complete code. No "handle errors"/"add validation" hand-waves.

**Type consistency:** `psych_result` shape identical across Task 1 (`psych[...]` dict), Task 4 (persist/return), Task 5 (`PsychResult` TS), Task 8 (consume). `target_c` (DISC) vs `target_c_big` (Big Five) consistent in Tasks 3/4/5/7. `_enabled_tests`/`_overall_fit` signatures match between Task 4 definition and self-check.
