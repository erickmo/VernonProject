# Proctored Application Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public job application into a timed, proctored, multi-step wizard: apply-once per vacancy, a new ketelitian test + bigger personality/logic banks, per-test server-enforced timers, and tab/focus + no-JS anti-cheat (count & flag).

**Architecture:** The public www `apply.html` becomes a vanilla-JS step machine. A new `start_test` guest endpoint stamps a per-test start time in `frappe.cache()` (keyed by a localStorage `attempt_id`), so the countdown is server-authoritative and reload-proof; `submit_application` recomputes elapsed server-side and flags over-time. Ketelitian reuses the scored-MCQ machinery. Anti-cheat (visibility/blur/multi-tab) is client-reported and stored as flags for HR; no-JS can't submit at all.

**Tech Stack:** Frappe (Python whitelisted API + doctypes + `frappe.cache`), server-rendered www (Jinja + vanilla JS), React SPA ×2 (`frontend/` `/m`, `frontend-web/` `/w`), shared TS in `frontend/src` (`@`).

## Global Constraints

- **Both frontends** for HR SPA changes; the applicant wizard is the single public www surface.
- **Bahasa Indonesia** for all copy + baked items.
- **Never leak scoring keys** — ketelitian items served via `public_ketelitian()` (strips `answer`); a test asserts it.
- **Apply-once** = reject when a Job Application exists for `(job, nik_ktp)` OR `(job, email)`; pre-check at wizard start + re-enforce in `submit_application`.
- **Timer is server-authoritative**: elapsed derived from the server-stamped `start_at` in cache, never client-reported. Over-time is **flagged, not blocked** (user's flag-don't-block choice). `GRACE_SEC = 15`.
- **Anti-cheat = count & flag** (violations recorded + shown to HR; applicant still finishes). NOT hard-fail.
- **No-JS fails by construction**: wizard + submit are JS-only + a `<noscript>` block.
- `attempt_id`: client UUID persisted in `localStorage` keyed by job slug (reload reuses it → timer doesn't reset).
- **Live site** `project.vernon.id`: doctype JSON → `bench --site project.vernon.id migrate`; Python → `sudo /usr/local/bin/tj-restart`; SPA → `npm run build` per frontend; www Jinja → `bench --site project.vernon.id clear-website-cache`. Frontend ship also needs SW cache bump (`frontend/sw-custom.js` `ASSET_CACHE` → copied to `www/vernon_sw.js`) + Cloudflare purge (`~/.cf_token`, zone `bd13d791fab46ac955b9b068edefc049`) or users get a stale/blank bundle.
- **Self-check convention**: pure Python carries a runnable `_selfcheck()`; run with the bench venv python `/home/frappe/frappe-bench/env/bin/python` (bare python3 lacks frappe for recruitment.py; recruitment_instruments.py is pure and runs on either).
- **What's New** (`App Release` row) at the end; Bahasa, one bullet/line, `published=1`, `platform Both`, semver bump from the newest row (currently 1.40.0 → 1.41.0). Insert via the project CLAUDE.md one-liner.
- **Untracked live files**: `recruitment.py`, `recruitment_instruments.py`, the doctype JSONs, `apply.py/html`, and the recruitment `.tsx` screens are tracked from the prior feature EXCEPT some recruitment base files remain the user's untracked WIP — `git add` explicit feature paths only, never `-A`.
- Commit after every task on `main`; the user works in parallel — stage only this plan's files.

---

### Task 1: Ketelitian scoring + seed bank (code structure)

**Files:**
- Modify: `vernon_project/api/recruitment_instruments.py`

**Interfaces:**
- Produces: `KETELITIAN_ITEMS` (seed), `public_ketelitian() -> list` (strips `answer`), `ketelitian_qdefs() -> list` (→ `_score_answers` defs), extended `_selfcheck`.
- Consumes: existing `public_*`, `_selfcheck` structure.

Ketelitian items are two kinds:
- `{"id","kind":"pair","left","right","answer":"Sama"|"Beda","points":1}`
- `{"id","kind":"odd","text","options":[...],"answer","points":1}`

- [ ] **Step 1: Add the seed bank + functions**

After `LOGIC_ITEMS`:
```python
# --- Ketelitian (clerical accuracy): same/different pairs + odd-one-out. Scored correct/incorrect.
KETELITIAN_ITEMS = [
    {"id": "k1", "kind": "pair", "left": "4837-XK-92", "right": "4837-XK-92", "answer": "Sama", "points": 1},
    {"id": "k2", "kind": "pair", "left": "Andi Wijaya", "right": "Andi Wjaya", "answer": "Beda", "points": 1},
    {"id": "k3", "kind": "odd", "text": "Mana yang berbeda?", "options": ["55210", "55210", "55120", "55210"], "answer": "55120", "points": 1},
]
PAIR_OPTIONS = ["Sama", "Beda"]
```

After `logic_qdefs()`:
```python
def public_ketelitian():
    out = []
    for it in KETELITIAN_ITEMS:
        if it["kind"] == "pair":
            out.append({"id": it["id"], "kind": "pair", "left": it["left"], "right": it["right"]})
        else:
            out.append({"id": it["id"], "kind": "odd", "text": it["text"], "options": list(it["options"])})
    return out


def ketelitian_qdefs():
    """→ _score_answers question defs. Pair items use Sama/Beda options; odd items use their options."""
    defs = []
    for it in KETELITIAN_ITEMS:
        opts = PAIR_OPTIONS if it["kind"] == "pair" else it["options"]
        defs.append({"question_text": it.get("text") or f'{it.get("left")} / {it.get("right")}',
                     "qtype": "Multiple Choice", "correct_answer": it["answer"],
                     "points": int(it.get("points", 1))})
    return defs
```

- [ ] **Step 2: Extend the self-check** — before the final `print` in `_selfcheck()`:

```python
    # Ketelitian: pair answer in Sama/Beda; odd answer in its options; public strips answer.
    for it in KETELITIAN_ITEMS:
        if it["kind"] == "pair":
            assert it["answer"] in PAIR_OPTIONS, it["id"]
        else:
            assert it["answer"] in it["options"], it["id"]
    for it in public_ketelitian():
        assert "answer" not in it, it["id"]
        assert it["kind"] in ("pair", "odd")
    assert len(ketelitian_qdefs()) == len(KETELITIAN_ITEMS)
```

- [ ] **Step 3: Run the self-check, verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment_instruments.py`
Expected: `recruitment_instruments selfcheck ok`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/recruitment_instruments.py
git commit -m "feat(recruitment): ketelitian bank scaffolding + scoring + self-check"
```

---

### Task 2: Generate full banks (ketelitian 20, personality 40, logic 20)

**Files:**
- Modify: `vernon_project/api/recruitment_instruments.py`

**Interfaces:**
- Consumes: the schemas from Task 1 + existing `BIGFIVE_ITEMS`/`LOGIC_ITEMS` shapes.
- Produces: `KETELITIAN_ITEMS` (~20 mixed), `BIGFIVE_ITEMS` (40, 8/trait), `LOGIC_ITEMS` (~20).

- [ ] **Step 1: Run a content-generation + validation Workflow**

Author + run a Workflow that generates and adversarially validates, in Bahasa:
- **Ketelitian ~20**: ~half `pair` (realistic codes/NIK-like/names/dates where `answer` is correctly Sama/Beda — introduce subtle single-char diffs for Beda), ~half `odd` (4 options, exactly one different, `answer` byte-identical to that option). Validator re-checks each pair's Sama/Beda verdict char-by-char and each odd's unique-different option.
- **Big Five 40** (8 per trait O/C/E/A/N, ~40% reverse balanced, single-idea first-person, natural Bahasa). Same rules as the existing bank.
- **Logic 20** (number series / syllogism / analogy / basic quantitative; one defensibly-correct answer byte-identical to an option; re-solved by a validator).

Emit three Python-literal lists matching the Task-1 / existing schemas. Structural rules the self-check enforces: ketelitian pair.answer ∈ {Sama,Beda}, odd.answer ∈ options; Big Five 8/trait; logic answer ∈ options.

- [ ] **Step 2: Splice the validated lists into the module**

Replace `KETELITIAN_ITEMS`, `BIGFIVE_ITEMS`, `LOGIC_ITEMS` with the generated lists (opaque ids `k1..`, `bf1..`, `l1..`; keep `points`). Keep all functions unchanged.

- [ ] **Step 3: Extend the self-check with counts** — before the final `print`:

```python
    assert len(KETELITIAN_ITEMS) >= 16, len(KETELITIAN_ITEMS)
    assert len(BIGFIVE_ITEMS) == 8 * len(BIGFIVE_TRAITS), len(BIGFIVE_ITEMS)
    for t in BIGFIVE_TRAITS:
        assert sum(1 for it in BIGFIVE_ITEMS if it["trait"] == t) == 8, t
    assert len(LOGIC_ITEMS) >= 16, len(LOGIC_ITEMS)
    assert any(it["kind"] == "pair" for it in KETELITIAN_ITEMS) and any(it["kind"] == "odd" for it in KETELITIAN_ITEMS)
```
(Update the existing Big Five count assert from `5 *` to `8 *`.)

- [ ] **Step 4: Run the self-check, verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 vernon_project/api/recruitment_instruments.py`
Expected: `recruitment_instruments selfcheck ok`

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/recruitment_instruments.py
git commit -m "feat(recruitment): full ketelitian bank + expanded personality/logic banks"
```

---

### Task 3: Doctype fields (ketelitian toggle, per-test timers, violations/timing)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/job_opening/job_opening.json`
- Modify: `vernon_project/vernon_project/doctype/job_application/job_application.json`

**Interfaces:**
- Produces (Job Opening): `test_ketelitian` (Check); `time_jobspecific/time_disc/time_personality/time_logical/time_ketelitian` (Int minutes).
- Produces (Job Application): `attempt_id` (Data), `test_violations` (Int), `violation_detail` (Small Text), `test_timing` (Code/JSON), `ketelitian_score`/`ketelitian_max` (Float); `email` gains `search_index`.

- [ ] **Step 1: Job Opening fields**

In `field_order`, after `test_logical` add `"test_ketelitian"`; after the target sections add a timing section:
```
"section_break_time", "time_jobspecific", "time_disc", "time_personality", "time_logical", "time_ketelitian"
```
Append to `fields`:
```json
{"fieldname": "test_ketelitian", "fieldtype": "Check", "label": "Ketelitian (accuracy) test"},
{"fieldname": "section_break_time", "fieldtype": "Section Break", "label": "Per-test time limits (minutes, 0 = untimed)"},
{"fieldname": "time_jobspecific", "fieldtype": "Int", "label": "Time — Job-specific (min)", "default": "6"},
{"fieldname": "time_disc", "fieldtype": "Int", "label": "Time — DISC (min)", "default": "5", "depends_on": "eval:doc.test_disc"},
{"fieldname": "time_personality", "fieldtype": "Int", "label": "Time — Personality (min)", "default": "6", "depends_on": "eval:doc.test_personality"},
{"fieldname": "time_logical", "fieldtype": "Int", "label": "Time — Logical (min)", "default": "8", "depends_on": "eval:doc.test_logical"},
{"fieldname": "time_ketelitian", "fieldtype": "Int", "label": "Time — Ketelitian (min)", "default": "4", "depends_on": "eval:doc.test_ketelitian"}
```

- [ ] **Step 2: Job Application fields**

In `field_order`, after `overall_fit` add:
```
"attempt_id", "test_violations", "violation_detail", "test_timing", "ketelitian_score", "ketelitian_max"
```
Append to `fields`:
```json
{"fieldname": "attempt_id", "fieldtype": "Data", "label": "Attempt ID", "read_only": 1},
{"fieldname": "test_violations", "fieldtype": "Int", "label": "Proctor Violations", "read_only": 1, "in_list_view": 1},
{"fieldname": "violation_detail", "fieldtype": "Small Text", "label": "Violation Detail", "read_only": 1},
{"fieldname": "test_timing", "fieldtype": "Code", "label": "Test Timing (JSON)", "options": "JSON", "read_only": 1},
{"fieldname": "ketelitian_score", "fieldtype": "Float", "label": "Ketelitian Score", "read_only": 1},
{"fieldname": "ketelitian_max", "fieldtype": "Float", "label": "Ketelitian Max", "read_only": 1}
```
Also add `"search_index": 1` to the existing `email` field def (for the dedup lookup).

- [ ] **Step 3: Migrate + verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Verify: `bench --site project.vernon.id console <<'EOF'` →
`print(frappe.get_meta("Job Opening").has_field("time_disc"), frappe.get_meta("Job Application").has_field("test_timing"))` → `EOF`
Expected: `True True`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/job_opening/job_opening.json vernon_project/vernon_project/doctype/job_application/job_application.json
git commit -m "feat(recruitment): ketelitian toggle, per-test time limits, violation/timing fields"
```

---

### Task 4: Backend — dedup, timer gate, ketelitian scoring, violations

**Files:**
- Modify: `vernon_project/api/recruitment.py`

**Interfaces:**
- Consumes: `recruitment_instruments` (Task 1/2), existing `_score_answers`/`_enabled_tests`/`_overall_fit`/`get_job`/`submit_application`/`save_opening`/`get_application`.
- Produces: `check_can_apply`, `start_test`, `_already_applied`, `_test_timing`; updated `_enabled_tests`/`_overall_fit`; ketelitian in get_job/submit/get_application; ketelitian+time in save_opening.

- [ ] **Step 1: Add failing self-check assertions** — in `_selfcheck()` before `print`:

```python
    op2 = frappe._dict({"test_disc": 0, "test_personality": 0, "test_logical": 1, "test_ketelitian": 1})
    assert _enabled_tests(op2) == {"disc": False, "personality": False, "logical": True, "ketelitian": True}
    # overall_fit: logical 8/10=80, ketelitian 9/10=90 → 85
    en = {"disc": False, "personality": False, "logical": True, "ketelitian": True}
    assert _overall_fit(None, None, {"logical": (8, 10), "ketelitian": (9, 10)}, en) == 85.0
    assert _overall_fit(None, None, {}, {"disc": False, "personality": False, "logical": False, "ketelitian": False}) is None
```

- [ ] **Step 2: Run self-check, verify it fails**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && /home/frappe/frappe-bench/env/bin/python vernon_project/api/recruitment.py`
Expected: FAIL — `KeyError: 'ketelitian'` (or AssertionError on `_enabled_tests`).

- [ ] **Step 3: Update `_enabled_tests` and `_overall_fit`**

Replace `_enabled_tests`:
```python
def _enabled_tests(opening):
    return {"disc": bool(opening.get("test_disc")),
            "personality": bool(opening.get("test_personality")),
            "logical": bool(opening.get("test_logical")),
            "ketelitian": bool(opening.get("test_ketelitian"))}
```
Replace `_overall_fit` (new signature — `scores` dict for the aptitude tests):
```python
def _overall_fit(disc_fit, personality_fit, scores, enabled):
    """Mean of enabled contributors: disc_fit, personality_fit, and % of each aptitude test."""
    parts = []
    if enabled["disc"] and disc_fit is not None:
        parts.append(disc_fit)
    if enabled["personality"] and personality_fit is not None:
        parts.append(personality_fit)
    for k in ("logical", "ketelitian"):
        if enabled.get(k):
            s, m = scores.get(k, (0, 0))
            if m:
                parts.append(100.0 * s / m)
    return round(sum(parts) / len(parts), 1) if parts else None
```

- [ ] **Step 4: Add constants + dedup + timer helpers**

After `_enabled_tests`:
```python
TIMED_TESTS = ("jobspecific", "disc", "personality", "logical", "ketelitian")
TIME_FIELD = {"jobspecific": "time_jobspecific", "disc": "time_disc", "personality": "time_personality",
              "logical": "time_logical", "ketelitian": "time_ketelitian"}
GRACE_SEC = 15


def _already_applied(opening_name, nik, email):
    if nik and frappe.db.exists("Job Application", {"job_opening": opening_name, "nik_ktp": nik}):
        return True
    if email and frappe.db.exists("Job Application", {"job_opening": opening_name, "email": email}):
        return True
    return False


def _clean_attempt(attempt_id):
    a = re.sub(r"[^A-Za-z0-9-]", "", attempt_id or "")[:64]
    if not a:
        frappe.throw("Sesi tes tidak valid.")
    return a


def _test_timing(attempt_id, opening, enabled):
    """Recompute per-test elapsed from the server-stamped cache start. Never trusts the client clock."""
    from frappe.utils import now_datetime
    now = now_datetime().timestamp()
    cache = frappe.cache()
    out = {}
    for t in TIMED_TESTS:
        on = (t == "jobspecific" and opening.questions) or enabled.get(t)
        if not on:
            continue
        limit_sec = int(opening.get(TIME_FIELD[t]) or 0) * 60
        if not limit_sec:
            continue
        raw = cache.get_value(f"recruit_timer:{attempt_id}:{t}")
        if not raw:
            out[t] = {"elapsed": None, "limit": limit_sec, "expired": True}
            continue
        data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
        elapsed = round(now - float(data["start_at"]))
        out[t] = {"elapsed": elapsed, "limit": limit_sec, "expired": elapsed > limit_sec + GRACE_SEC}
    return out
```

- [ ] **Step 5: Add `check_can_apply` and `start_test` endpoints**

```python
@frappe.whitelist(allow_guest=True)
@rate_limit(key="can_apply", limit=30, seconds=3600)
def check_can_apply(job, nik_ktp=None, email=None):
    name = frappe.db.get_value("Job Opening", {"slug": job, "status": "Open"}, "name")
    if not name:
        return {"ok": False, "reason": "Lowongan tidak ditemukan atau sudah ditutup."}
    if _already_applied(name, (nik_ktp or "").strip(), (email or "").strip()):
        return {"ok": False, "reason": "Kamu sudah pernah melamar posisi ini."}
    return {"ok": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="start_test", limit=120, seconds=3600)
def start_test(attempt_id, job, test):
    from frappe.utils import now_datetime
    attempt_id = _clean_attempt(attempt_id)
    if test not in TIMED_TESTS:
        frappe.throw("Tes tidak dikenal.")
    name = frappe.db.get_value("Job Opening", {"slug": job, "status": "Open"}, "name")
    if not name:
        frappe.throw("Lowongan tidak ditemukan.", frappe.DoesNotExistError)
    limit_sec = int(frappe.db.get_value("Job Opening", name, TIME_FIELD[test]) or 0) * 60
    key = f"recruit_timer:{attempt_id}:{test}"
    cache = frappe.cache()
    raw = cache.get_value(key)
    now = now_datetime().timestamp()
    if raw:
        data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
        remaining = max(0, int(data["limit_sec"] - (now - float(data["start_at"]))))
        return {"remaining_sec": remaining, "limit_sec": int(data["limit_sec"])}
    data = {"start_at": now, "limit_sec": limit_sec}
    cache.set_value(key, json.dumps(data), expires_in_sec=limit_sec + GRACE_SEC + 300)
    return {"remaining_sec": limit_sec, "limit_sec": limit_sec}
```

- [ ] **Step 6: `get_job` — serve ketelitian + time limits**

In `get_job`, in the returned dict (after the logic items) add:
```python
        "test_ketelitian": 1 if tests["ketelitian"] else 0,
        "ketelitian_items": ri.public_ketelitian() if tests["ketelitian"] else [],
        "time_limits": {t: int(doc.get(TIME_FIELD[t]) or 0) for t in TIMED_TESTS},
```

- [ ] **Step 7: `submit_application` — dedup, ketelitian, timing, violations, overall_fit**

Change the signature to accept the new params:
```python
def submit_application(job=None, full_name=None, email=None, phone=None, nik_ktp=None,
                       cover_letter=None, answers=None, company_website=None,
                       disc_answers=None, personality_answers=None, logical_answers=None,
                       ketelitian_answers=None, attempt_id=None, violations=None, violation_reasons=None):
```
After the opening is resolved (`opening = frappe.get_doc(...)`) and BEFORE scoring, enforce apply-once:
```python
    if _already_applied(name, nik_ktp, email):
        frappe.throw("Kamu sudah pernah melamar posisi ini.")
```
In the tests block, after the logical scoring, add ketelitian (mirrors logical):
```python
    ketelitian_score = ketelitian_max = 0.0
    if tests["ketelitian"]:
        ka = _loadjson(ketelitian_answers, [])
        ka = ka if isinstance(ka, list) else []
        krows, ks, km, _ = _score_answers(ri.ketelitian_qdefs(), ka)
        for r in krows:
            r["test"] = "Ketelitian"
        if len(ka) < len(ri.KETELITIAN_ITEMS):
            frappe.throw("Mohon jawab semua soal tes ketelitian.")
        rows += krows
        ketelitian_score, ketelitian_max = ks, km
        score += ks
        max_score += km
```
Update the `overall_fit` call to the new signature + pass ketelitian:
```python
    overall_fit = _overall_fit(disc_fit, personality_fit,
                               {"logical": (logical_score, logical_max),
                                "ketelitian": (ketelitian_score, ketelitian_max)}, tests)
```
Compute timing + violations before the insert:
```python
    aid = _clean_attempt(attempt_id) if attempt_id else ""
    timing = _test_timing(aid, opening, tests) if aid else {}
    try:
        vcount = int(violations or 0)
    except (TypeError, ValueError):
        vcount = 0
    vreasons = _loadjson(violation_reasons, [])
    vreasons = [str(x)[:60] for x in vreasons] if isinstance(vreasons, list) else []
    vdetail = ", ".join(sorted(set(vreasons)))[:1000]
```
Add these keys to the `frappe.get_doc({...})` payload:
```python
        "attempt_id": aid,
        "ketelitian_score": ketelitian_score, "ketelitian_max": ketelitian_max,
        "test_timing": json.dumps(timing) if timing else None,
        "test_violations": vcount, "violation_detail": vdetail,
```

- [ ] **Step 8: `save_opening` — persist ketelitian + time fields**

Add params `test_ketelitian=None` and `times=None` to the signature. Before `doc.save`:
```python
    doc.test_ketelitian = cint(test_ketelitian)
    tm = json.loads(times) if isinstance(times, str) else (times or {})
    for f in ("time_jobspecific", "time_disc", "time_personality", "time_logical", "time_ketelitian"):
        if tm.get(f) is not None:
            doc.set(f, cint(tm.get(f)))
```

- [ ] **Step 9: `get_application` — return ketelitian + violations + timing**

Add to the returned dict:
```python
        "ketelitian_score": doc.ketelitian_score, "ketelitian_max": doc.ketelitian_max,
        "test_violations": doc.test_violations, "violation_detail": doc.violation_detail,
        "test_timing": json.loads(doc.test_timing) if doc.test_timing else None,
        "test_ketelitian": frappe.db.get_value("Job Opening", doc.job_opening, "test_ketelitian"),
```
Also add `"test": a.test` is already present from the prior feature — leave.

- [ ] **Step 10: Extend `_leakcheck`** — add ketelitian to the guarded blob:

```python
    blob = _j.dumps({"disc": ri.public_disc(), "big": ri.public_bigfive(),
                     "logic": ri.public_logic(), "ket": ri.public_ketelitian()})
```

- [ ] **Step 11: Run checks + restart**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && /home/frappe/frappe-bench/env/bin/python vernon_project/api/recruitment.py`
Expected: `recruitment selfcheck ok` then `recruitment leakcheck ok`
Then: `sudo /usr/local/bin/tj-restart`

- [ ] **Step 12: Commit**

```bash
git add vernon_project/api/recruitment.py
git commit -m "feat(recruitment): apply-once, server timer gate, ketelitian scoring, proctor flags"
```

---

### Task 5: Shared TS types + api client

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `JobOpeningDoc` gains `test_ketelitian?` + `time_*?` + `times?`; `JobApplicationDetail` gains ketelitian/violation/timing fields; `TestTiming` type; `saveOpening` sends them.

- [ ] **Step 1: Extend types**

In `JobOpeningDoc` add:
```typescript
  test_ketelitian?: 0 | 1
  time_jobspecific?: number
  time_disc?: number
  time_personality?: number
  time_logical?: number
  time_ketelitian?: number
  times?: Record<string, number>
```
Add:
```typescript
export interface TestTiming { [test: string]: { elapsed: number | null; limit: number; expired: boolean } }
```
In `JobApplicationDetail` add:
```typescript
  ketelitian_score: number | null
  ketelitian_max: number | null
  test_violations: number | null
  violation_detail: string | null
  test_timing: TestTiming | null
  test_ketelitian?: 0 | 1
```
In `JobApplicationListItem` add `test_violations?: number | null`.

- [ ] **Step 2: Wire `saveOpening`** — add to the posted body:
```typescript
      test_ketelitian: v.test_ketelitian ? 1 : 0,
      times: JSON.stringify(v.times ?? {}),
```

- [ ] **Step 3: Typecheck both**

Run: `cd frontend && npx tsc --noEmit` and `cd frontend-web && npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(recruitment): TS types for ketelitian, timers, proctor flags"
```

---

### Task 6: Wizard rewrite — `apply.py` + `apply.html`

**Files:**
- Modify: `vernon_project/www/apply.py`
- Modify: `vernon_project/www/apply.html`

**Interfaces:**
- Consumes: `get_job`-shaped data (apply.py builds its own from the doc); the `check_can_apply`, `start_test`, `submit_application` endpoints.
- Produces: a stepped, timed, proctored applicant flow.

- [ ] **Step 1: `apply.py` — serve ketelitian + time limits + labels**

Add to the `job` dict (mirroring the existing test additions):
```python
            job["test_ketelitian"] = int(doc.test_ketelitian or 0)
            job["ketelitian_items"] = ri.public_ketelitian() if doc.test_ketelitian else []
            job["time_limits"] = {
                "jobspecific": int(doc.time_jobspecific or 0), "disc": int(doc.time_disc or 0),
                "personality": int(doc.time_personality or 0), "logical": int(doc.time_logical or 0),
                "ketelitian": int(doc.time_ketelitian or 0)}
```
Add Bahasa labels to `context.t`:
```python
        "wiz_consent_title": p({"id": "Sebelum mulai", "en": "Before you start"}),
        "wiz_rules": p({"id": "Tes ini memakai waktu per bagian dan dipantau. Tetap di tab ini, jangan berpindah aplikasi, dan pastikan JavaScript aktif. Kamu hanya bisa melamar satu kali.", "en": "This test is timed per section and monitored. Stay on this tab, don't switch apps, and keep JavaScript on. You may apply only once."}),
        "wiz_start": p({"id": "Mulai", "en": "Start"}),
        "wiz_next": p({"id": "Lanjut", "en": "Next"}),
        "wiz_review": p({"id": "Tinjau & kirim", "en": "Review & submit"}),
        "wiz_time_left": p({"id": "Sisa waktu", "en": "Time left"}),
        "wiz_time_up": p({"id": "Waktu habis untuk bagian ini.", "en": "Time is up for this section."}),
        "wiz_violation": p({"id": "Peringatan: kamu meninggalkan tes. Ini dicatat.", "en": "Warning: you left the test. This is recorded."}),
        "wiz_dup": p({"id": "Kamu sudah pernah melamar posisi ini.", "en": "You have already applied for this role."}),
        "ket_title": p({"id": "Tes Ketelitian", "en": "Accuracy test"}),
        "ket_same": p({"id": "Sama", "en": "Same"}), "ket_diff": p({"id": "Beda", "en": "Different"}),
        "nojs": p({"id": "Tes membutuhkan JavaScript aktif untuk melamar. Aktifkan JavaScript lalu muat ulang.", "en": "This test requires JavaScript. Enable it and reload."}),
```

- [ ] **Step 2: `apply.html` — noscript + wizard shell**

Replace the `{% block content %}` job branch's single `<form>` with a stepped shell. Immediately inside `{% if job %}` add the noscript gate:
```html
    <noscript>
      <div class="mt-8 rounded-2xl bg-rose/10 border border-rose/30 text-rose px-5 py-4 font-semibold">{{ t.nojs }}</div>
    </noscript>
```
Wrap the whole applicant UI in `<div id="wiz" class="hidden">` (revealed by JS — so no-JS shows only the noscript + role info, never the form). Keep the role header visible. Build the step containers:
```html
    <div id="wiz" class="hidden mt-10">
      <div id="wiz-error" class="hidden mb-4 rounded-xl bg-rose/10 border border-rose/30 text-rose px-4 py-3 text-sm font-medium"></div>
      <div id="wiz-violation" class="hidden mb-4 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 text-sm font-semibold"></div>

      <!-- step: consent -->
      <section data-step="consent" class="wiz-step">
        <h2 class="font-display text-2xl font-bold text-brand-900">{{ t.wiz_consent_title }}</h2>
        <p class="mt-3 text-brand-800/85 leading-relaxed">{{ t.wiz_rules }}</p>
        <button type="button" id="btn-consent" class="mt-6 px-7 py-3.5 rounded-xl font-semibold bg-brand-600 text-white shadow-card hover:bg-brand-700 transition-all">{{ t.wiz_start }}</button>
      </section>

      <!-- step: identity (the existing identity fields + CV, moved here, no <form>) -->
      <section data-step="identity" class="wiz-step hidden">
        {# honeypot #}
        <div class="absolute w-px h-px -m-px overflow-hidden" aria-hidden="true"><input type="text" id="f-company_website" tabindex="-1" autocomplete="off"></div>
        <!-- name/email/phone/nik/cv/cover_letter inputs with ids f-full_name, f-email, f-phone, f-nik_ktp, f-cv, f-cover_letter (same markup/classes as the pre-wizard form, `id=` instead of `name=`) -->
        <button type="button" id="btn-identity" class="mt-6 px-7 py-3.5 rounded-xl font-semibold bg-brand-600 text-white shadow-card">{{ t.wiz_next }}</button>
      </section>

      <!-- one timed step container per enabled test, hidden; populated by JS from job data -->
      <section data-step="test" data-test-key="" class="wiz-step hidden">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-2xl font-bold text-brand-900" data-test-title></h2>
          <span class="rounded-full bg-brand-100 text-brand-800 px-3 py-1 text-sm font-bold tabular-nums" data-timer>--:--</span>
        </div>
        <div data-test-body class="mt-5 space-y-5"></div>
        <button type="button" data-test-next class="mt-6 px-7 py-3.5 rounded-xl font-semibold bg-brand-600 text-white shadow-card">{{ t.wiz_next }}</button>
      </section>

      <!-- step: review/submit -->
      <section data-step="review" class="wiz-step hidden">
        <h2 class="font-display text-2xl font-bold text-brand-900">{{ t.wiz_review }}</h2>
        <p class="mt-2 text-sm text-brand-800/70" id="review-summary"></p>
        <button type="button" id="btn-submit" class="mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold bg-brand-600 text-white shadow-card disabled:opacity-60">
          <span id="submit-text">{{ t.submit }}</span>
        </button>
      </section>

      <div id="apply-thanks" class="hidden mt-4 rounded-2xl bg-brand-50 border border-brand-200 shadow-card p-8 text-center">
        <h2 class="font-display text-2xl font-bold text-brand-900">{{ t.thanks_title }}</h2>
        <p class="mt-3 text-brand-800/80">{{ t.thanks_body }}</p>
      </div>
    </div>
```
Render the per-test QUESTION MARKUP as JS-built DOM (not Jinja loops), driven by the data passed in Step 3 — so the timed step template can be reused for each test. (The existing Jinja test blocks from the prior feature are removed; the item data now flows through the JS `TESTS` structure.)

- [ ] **Step 3: `apply.html` — the wizard controller script**

Replace the existing `{% block scripts %}` script with the wizard. Complete script:
```html
{% block scripts %}
{% if job %}
<script>
(function () {
  var SLUG = {{ job.slug | tojson }};
  var CSRF = "{{ frappe.session.csrf_token }}";
  var T = {{ t | tojson }};
  var JOB = {{ {
      "questions": job.questions, "test_disc": job.test_disc, "disc_items": job.disc_items,
      "test_personality": job.test_personality, "bigfive_items": job.bigfive_items,
      "test_logical": job.test_logical, "logic_items": job.logic_items,
      "test_ketelitian": job.test_ketelitian, "ketelitian_items": job.ketelitian_items,
      "time_limits": job.time_limits
    } | tojson }};

  // --- attempt id (persist across reload so the server timer doesn't reset)
  var AKEY = 'vernon-apply-attempt:' + SLUG;
  var ATTEMPT = localStorage.getItem(AKEY);
  if (!ATTEMPT) { ATTEMPT = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); localStorage.setItem(AKEY, ATTEMPT); }

  var wiz = document.getElementById('wiz');
  var errBox = document.getElementById('wiz-error');
  var vioBox = document.getElementById('wiz-violation');
  wiz.classList.remove('hidden');  // JS present → reveal the wizard (no-JS never gets here)

  function showError(m) { errBox.textContent = m || T.err_generic; errBox.classList.remove('hidden'); errBox.scrollIntoView({behavior:'smooth',block:'center'}); }
  function clearError() { errBox.classList.add('hidden'); }

  // --- proctor: count & flag (never block)
  var violations = 0, reasons = {}, inTest = false, lastVio = 0;
  function violation(reason) {
    if (!inTest) return;
    var now = Date.now(); if (now - lastVio < 500) return; lastVio = now;
    violations++; reasons[reason] = 1;
    vioBox.textContent = T.wiz_violation; vioBox.classList.remove('hidden');
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) violation('pindah tab/aplikasi'); });
  window.addEventListener('blur', function () { violation('kehilangan fokus'); });
  var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('vernon-apply-' + SLUG) : null;
  if (bc) { bc.onmessage = function (e) { if (e.data && e.data.attempt !== ATTEMPT) violation('tab lain terdeteksi'); }; }
  function announce() { if (bc) bc.postMessage({ attempt: ATTEMPT }); }

  // --- build the ordered list of enabled test steps
  var TEST_DEFS = [
    { key: 'jobspecific', on: JOB.questions && JOB.questions.length, title: T.test_title, items: JOB.questions, render: renderQuestion, collect: collectQuestion },
    { key: 'disc', on: JOB.test_disc, title: T.disc_title, items: JOB.disc_items, render: renderDisc, collect: collectDisc },
    { key: 'personality', on: JOB.test_personality, title: T.big_title, items: JOB.bigfive_items, render: renderBig, collect: collectBig },
    { key: 'logical', on: JOB.test_logical, title: T.logic_title, items: JOB.logic_items, render: renderLogic, collect: collectLogic },
    { key: 'ketelitian', on: JOB.test_ketelitian, title: T.ket_title, items: JOB.ketelitian_items, render: renderKet, collect: collectKet }
  ].filter(function (d) { return d.on; });

  // answer stores
  var A = { questions: {}, disc: {}, personality: {}, logical: {}, ketelitian: {} };

  // --- step machine
  var steps = ['consent', 'identity'].concat(TEST_DEFS.map(function () { return 'test'; })).concat(['review']);
  var testStepAt = {}; // step index -> TEST_DEFS index
  (function () { var ti = 0; steps.forEach(function (s, i) { if (s === 'test') { testStepAt[i] = ti++; } }); })();
  var cur = 0, curTimer = null;

  function show(i) {
    cur = i;
    var secs = wiz.querySelectorAll('.wiz-step');
    // hide all
    for (var j = 0; j < secs.length; j++) secs[j].classList.add('hidden');
    var kind = steps[i];
    inTest = (kind === 'test');
    clearError(); vioBox.classList.add('hidden');
    if (kind === 'consent') return wiz.querySelector('[data-step="consent"]').classList.remove('hidden');
    if (kind === 'identity') return wiz.querySelector('[data-step="identity"]').classList.remove('hidden');
    if (kind === 'review') { buildReview(); return wiz.querySelector('[data-step="review"]').classList.remove('hidden'); }
    // test step: reuse the single [data-step=test] template
    enterTest(TEST_DEFS[testStepAt[i]]);
  }
  function next() { if (curTimer) { clearInterval(curTimer); curTimer = null; } show(cur + 1); }

  // --- test step
  var tpl = wiz.querySelector('[data-step="test"]');
  function enterTest(def) {
    tpl.classList.remove('hidden');
    tpl.querySelector('[data-test-title]').textContent = def.title;
    var body = tpl.querySelector('[data-test-body]'); body.innerHTML = '';
    def.items.forEach(function (it, idx) { body.appendChild(def.render(it, idx)); });
    tpl.querySelector('[data-test-next]').onclick = function () {
      if (!def.collect(def, true)) return; // validate complete before manual advance
      next();
    };
    announce();
    startTimer(def, tpl.querySelector('[data-timer]'));
  }
  var prevTestKey = null;
  function startTimer(def, el) {
    // ALWAYS call start_test on entry (even for an untimed test) so the server can
    // stamp the PREVIOUS test's end — that is what makes per-test server elapsed accurate.
    var body = { attempt_id: ATTEMPT, job: SLUG, test: def.key };
    if (prevTestKey && prevTestKey !== def.key) body.prev = prevTestKey;
    prevTestKey = def.key;
    fetch('/api/method/vernon_project.api.recruitment.start_test', {
      method: 'POST', headers: { 'X-Frappe-CSRF-Token': CSRF, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      var m = d.message || {};
      if (!m.limit_sec) { el.textContent = ''; return; } // untimed
      tick(m.remaining_sec || 0, el, def);
    }).catch(function () { el.textContent = ''; });
  }
  function tick(remaining, el, def) {
    function render() {
      var m = Math.floor(remaining / 60), s = remaining % 60;
      el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (remaining <= 0) { clearInterval(curTimer); curTimer = null; def.collect(def, false); lockTest(); showError(T.wiz_time_up); setTimeout(next, 1200); return; }
      remaining--;
    }
    render(); curTimer = setInterval(render, 1000);
  }
  function lockTest() { tpl.querySelectorAll('input,button,textarea').forEach(function (n) { if (n.getAttribute('data-test-next') === null) n.disabled = true; }); }

  // --- per-test renderers (build DOM) + collectors (write into A, return complete?)
  function radio(name, value, label) {
    var l = document.createElement('label'); l.className = 'flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-brand-50 cursor-pointer';
    var i = document.createElement('input'); i.type = 'radio'; i.name = name; i.value = value; i.className = 'text-brand-600';
    var s = document.createElement('span'); s.className = 'text-brand-900'; s.textContent = label;
    l.appendChild(i); l.appendChild(s); return l;
  }
  function fieldset(legendText) { var fs = document.createElement('fieldset'); fs.className = 'space-y-2'; var lg = document.createElement('legend'); lg.className = 'text-sm font-semibold text-brand-900'; lg.textContent = legendText; fs.appendChild(lg); return fs; }

  function renderQuestion(q, i) {
    var fs = fieldset((i + 1) + '. ' + q.question_text);
    if (q.qtype === 'Free Text') { var ta = document.createElement('textarea'); ta.rows = 3; ta.name = 'q_' + q.idx; ta.className = 'w-full rounded-xl border border-paper-edge bg-paper-card px-4 py-3'; fs.appendChild(ta); }
    else { var opts = q.options && q.options.length ? q.options : (q.qtype === 'True/False' ? ['True', 'False'] : []); opts.forEach(function (o) { fs.appendChild(radio('q_' + q.idx, o, o)); }); }
    return fs;
  }
  function collectQuestion(def, requireAll) {
    A.questions = def.items.map(function (q) { var el = tpl.querySelector('[name="q_' + q.idx + '"]:checked') || tpl.querySelector('textarea[name="q_' + q.idx + '"]'); return el ? (el.value || '') : ''; });
    return true; // job-specific may include optional free-text; don't hard-require
  }
  function renderDisc(it) {
    var fs = fieldset(''); fs.querySelector('legend').remove();
    var head = document.createElement('div'); head.className = 'grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-semibold text-brand-700'; head.innerHTML = '<span></span><span>' + T.disc_most + '</span><span>' + T.disc_least + '</span>'; fs.appendChild(head);
    it.words.forEach(function (w, wi) {
      var row = document.createElement('div'); row.className = 'grid grid-cols-[1fr_auto_auto] gap-2 items-center';
      row.innerHTML = '<span class="text-brand-900">' + w + '</span>';
      var m = document.createElement('input'); m.type = 'radio'; m.name = 'dm_' + it.id; m.value = wi;
      var l = document.createElement('input'); l.type = 'radio'; l.name = 'dl_' + it.id; l.value = wi;
      row.appendChild(m); row.appendChild(l); fs.appendChild(row);
    });
    return fs;
  }
  function collectDisc(def, requireAll) {
    var ok = true; A.disc = {};
    def.items.forEach(function (it) {
      var m = tpl.querySelector('[name="dm_' + it.id + '"]:checked'), l = tpl.querySelector('[name="dl_' + it.id + '"]:checked');
      if (m && l && m.value !== l.value) A.disc[it.id] = { most: parseInt(m.value, 10), least: parseInt(l.value, 10) };
      else ok = false;
    });
    if (requireAll && !ok) { showError(T.incomplete); return false; } return true;
  }
  function renderBig(it, i) {
    var fs = fieldset((i + 1) + '. ' + it.text);
    var wrap = document.createElement('div'); wrap.className = 'flex justify-between gap-2';
    for (var n = 1; n <= 5; n++) { (function (v) { var l = document.createElement('label'); l.className = 'flex-1 text-center rounded-lg border border-paper-edge py-2 cursor-pointer hover:bg-brand-50'; var i2 = document.createElement('input'); i2.type = 'radio'; i2.name = 'bf_' + it.id; i2.value = v; i2.className = 'sr-only'; var s = document.createElement('span'); s.textContent = v; l.appendChild(i2); l.appendChild(s); wrap.appendChild(l); })(n); }
    fs.appendChild(wrap); return fs;
  }
  function collectBig(def, requireAll) {
    var ok = true; A.personality = {};
    def.items.forEach(function (it) { var f = tpl.querySelector('[name="bf_' + it.id + '"]:checked'); if (f) A.personality[it.id] = parseInt(f.value, 10); else ok = false; });
    if (requireAll && !ok) { showError(T.incomplete); return false; } return true;
  }
  function renderLogic(it, i) {
    var fs = fieldset((i + 1) + '. ' + it.text); it.options.forEach(function (o) { fs.appendChild(radio('lg_' + it.id, o, o)); }); return fs;
  }
  function collectLogic(def, requireAll) {
    var ok = true; A.logical = def.items.map(function (it) { var f = tpl.querySelector('[name="lg_' + it.id + '"]:checked'); if (!f) ok = false; return f ? f.value : ''; });
    if (requireAll && !ok) { showError(T.incomplete); return false; } return true;
  }
  function renderKet(it, i) {
    if (it.kind === 'pair') {
      var fs = fieldset((i + 1) + '.');
      var pair = document.createElement('div'); pair.className = 'flex items-center gap-4 font-mono text-brand-900'; pair.innerHTML = '<span>' + it.left + '</span><span class="text-brand-400">vs</span><span>' + it.right + '</span>'; fs.appendChild(pair);
      fs.appendChild(radio('kt_' + it.id, 'Sama', T.ket_same)); fs.appendChild(radio('kt_' + it.id, 'Beda', T.ket_diff)); return fs;
    }
    var fs2 = fieldset((i + 1) + '. ' + it.text); it.options.forEach(function (o) { fs2.appendChild(radio('kt_' + it.id, o, o)); }); return fs2;
  }
  function collectKet(def, requireAll) {
    var ok = true; A.ketelitian = def.items.map(function (it) { var f = tpl.querySelector('[name="kt_' + it.id + '"]:checked'); if (!f) ok = false; return f ? f.value : ''; });
    if (requireAll && !ok) { showError(T.incomplete); return false; } return true;
  }

  // --- consent + identity + review + submit
  document.getElementById('btn-consent').onclick = function () { next(); };
  document.getElementById('btn-identity').onclick = function () {
    var name = val('f-full_name'), email = val('f-email'), phone = val('f-phone'), nik = val('f-nik_ktp');
    var cv = document.getElementById('f-cv');
    if (!name || !email || !phone || !nik || !(cv.files && cv.files[0])) { showError(T.err_generic); return; }
    fetch('/api/method/vernon_project.api.recruitment.check_can_apply?job=' + encodeURIComponent(SLUG) + '&nik_ktp=' + encodeURIComponent(nik) + '&email=' + encodeURIComponent(email), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); }).then(function (d) {
        var m = d.message || {}; if (!m.ok) { showError(m.reason || T.wiz_dup); return; } next();
      }).catch(function () { next(); }); // network fail → let them proceed; submit re-checks
  };
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function buildReview() { document.getElementById('review-summary').textContent = TEST_DEFS.map(function (d) { return d.title; }).join(' · '); }

  document.getElementById('btn-submit').onclick = function () {
    var btn = this, txt = document.getElementById('submit-text'); btn.disabled = true; txt.textContent = T.sending;
    var fd = new FormData();
    fd.append('job', SLUG); fd.append('full_name', val('f-full_name')); fd.append('email', val('f-email'));
    fd.append('phone', val('f-phone')); fd.append('nik_ktp', val('f-nik_ktp')); fd.append('cover_letter', val('f-cover_letter'));
    fd.append('company_website', val('f-company_website'));
    fd.append('answers', JSON.stringify(A.questions || []));
    fd.append('disc_answers', JSON.stringify(A.disc)); fd.append('personality_answers', JSON.stringify(A.personality));
    fd.append('logical_answers', JSON.stringify(A.logical)); fd.append('ketelitian_answers', JSON.stringify(A.ketelitian));
    fd.append('attempt_id', ATTEMPT); fd.append('violations', String(violations));
    fd.append('violation_reasons', JSON.stringify(Object.keys(reasons)));
    var cv = document.getElementById('f-cv'); if (cv.files && cv.files[0]) fd.append('cv', cv.files[0]);
    fetch('/api/method/vernon_project.api.recruitment.submit_application', { method: 'POST', headers: { 'X-Frappe-CSRF-Token': CSRF }, body: fd })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        var m = r.d && r.d.message;
        if (r.ok && m && m.ok) { localStorage.removeItem(AKEY); wiz.querySelector('[data-step="review"]').classList.add('hidden'); document.getElementById('apply-thanks').classList.remove('hidden'); return; }
        var msg = T.err_generic; try { if (r.d && r.d._server_messages) { var arr = JSON.parse(r.d._server_messages); if (arr.length) msg = JSON.parse(arr[0]).message || msg; } } catch (_) {}
        showError(msg);
      }).catch(function () { showError(T.err_generic); })
      .finally(function () { btn.disabled = false; txt.textContent = T.submit; });
  };

  show(0);
})();
</script>
{% endif %}
{% endblock %}
```

- [ ] **Step 4: Deploy www + smoke test**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-website-cache`
Create a throwaway Open opening with all tests + short time limits via console. Then:
- `curl -s 'https://project.vernon.id/apply?job=<slug>' | grep -c 'id="wiz"'` → 1
- `curl -s 'https://project.vernon.id/apply?job=<slug>' | grep -c 'noscript'` → ≥1
Delete the throwaway opening after.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/www/apply.py vernon_project/www/apply.html
git commit -m "feat(recruitment): proctored timed wizard on public apply (steps, timers, anti-cheat, dedup, no-JS)"
```

---

### Task 7: SPA opening editor — ketelitian toggle + per-test times (both frontends)

**Files:**
- Modify: `frontend/src/pages/RecruitmentOpeningFormScreen.tsx`
- Modify: `frontend-web/src/pages/RecruitmentOpeningForm.tsx`

**Interfaces:** Consumes `recruitmentApi.getOpening/saveOpening`, `JobOpeningDoc`.

- [ ] **Step 1: Mobile** — add `testKetelitian` state + `times` state:
```typescript
  const [testKetelitian, setTestKetelitian] = useState(false)
  const [times, setTimes] = useState<Record<string, number>>({})
```
In the `getOpening().then`:
```typescript
        setTestKetelitian(!!o.test_ketelitian)
        setTimes({
          time_jobspecific: o.time_jobspecific ?? 6, time_disc: o.time_disc ?? 5,
          time_personality: o.time_personality ?? 6, time_logical: o.time_logical ?? 8,
          time_ketelitian: o.time_ketelitian ?? 4,
        })
```
For a NEW opening (no name) seed the same defaults in the initial `useState` for `times`.
In `saveOpening({...})` add: `test_ketelitian: testKetelitian ? 1 : 0, times,`.
Add `Ketelitian` to the toggle list (fourth checkbox) and add a "Waktu per tes (menit)" number grid for the 5 `time_*` keys (reuse a small number input; clamp on blur, 0–120). Only render a time input for tests that are enabled (jobspecific always; others gated on their toggle).

- [ ] **Step 2: Web** — mirror in `RecruitmentOpeningForm.tsx` with its tile styling (same state, load, save additions, ketelitian checkbox, time inputs).

- [ ] **Step 3: Typecheck both** — `npx tsc --noEmit` in each → no errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/RecruitmentOpeningFormScreen.tsx frontend-web/src/pages/RecruitmentOpeningForm.tsx
git commit -m "feat(recruitment): opening editor ketelitian toggle + per-test time limits (both frontends)"
```

---

### Task 8: SPA application detail — violations, timing, ketelitian (both frontends)

**Files:**
- Modify: `frontend/src/pages/RecruitmentApplicationScreen.tsx`
- Modify: `frontend-web/src/pages/RecruitmentApplication.tsx`

**Interfaces:** Consumes `JobApplicationDetail` (with `test_violations`, `violation_detail`, `test_timing`, `ketelitian_score/max`).

- [ ] **Step 1: Mobile** — in the assessment block:
- Add a ketelitian subtotal row (like the logical one) when `app.ketelitian_max`:
```tsx
            {!!app.ketelitian_max && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <span className="text-sm font-bold text-stone-800 dark:text-slate-100">Ketelitian</span>
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{app.ketelitian_score} / {app.ketelitian_max}</span>
              </div>
            )}
```
- Add a proctor block when `app.test_violations != null`:
```tsx
            {app.test_violations != null && (
              <div className={`rounded-xl border p-3 ${app.test_violations ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700'}`}>
                <p className="text-sm font-bold text-stone-800 dark:text-slate-100">Proctor: {app.test_violations} pelanggaran</p>
                {!!app.violation_detail && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{app.violation_detail}</p>}
                {app.test_timing && Object.entries(app.test_timing).some(([, v]) => v.expired) && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Waktu habis: {Object.entries(app.test_timing).filter(([, v]) => v.expired).map(([k]) => k).join(', ')}</p>
                )}
              </div>
            )}
```

- [ ] **Step 2: Web** — mirror in `RecruitmentApplication.tsx` (tile styling; same ketelitian subtotal + proctor/timing block).

- [ ] **Step 3: Typecheck both** — `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/RecruitmentApplicationScreen.tsx frontend-web/src/pages/RecruitmentApplication.tsx
git commit -m "feat(recruitment): application detail ketelitian score + proctor violations/timing (both frontends)"
```

---

### Task 9: Build, deploy, docs, verify, What's New

**Files:** built bundles under `vernon_project/public/frontend{,_web}/`; `frontend/sw-custom.js`; `docs/assets/data.js`.

- [ ] **Step 1: Build both bundles**
Run: `cd frontend && npm run build`; `cd frontend-web && npm run build`. Confirm feature strings (`Ketelitian`, `time_disc`) in the new hashed bundles.

- [ ] **Step 2: Deploy backend/schema** (already migrated/restarted in Tasks 3/4; re-run to be safe)
Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && sudo /usr/local/bin/tj-restart`

- [ ] **Step 3: SW bump + www + Cloudflare**
Bump `ASSET_CACHE` in `frontend/sw-custom.js` (v19 → v20, add a comment), `cp frontend/sw-custom.js vernon_project/www/vernon_sw.js`, `bench --site project.vernon.id clear-website-cache`, then CF purge:
```bash
TOKEN=$(cat ~/.cf_token); curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4/zones/bd13d791fab46ac955b9b068edefc049/purge_cache" --data '{"purge_everything":true}'
```
Verify `/m` + `/w` serve the new hashes at HTTP 200 full size.

- [ ] **Step 4: Docs**
Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py` then commit `docs/assets/data.js` if changed (new endpoints `check_can_apply`/`start_test` → endpoint count changes).

- [ ] **Step 5: Live E2E**
Via console, create an Open opening with ketelitian + short time limits + targets. Then through the real endpoints: `check_can_apply` (fresh → ok), `start_test` (returns remaining_sec; second call returns a smaller remaining), `submit_application` with complete answers incl. `ketelitian_answers` + `attempt_id` + `violations=2` → assert `get_application` returns `ketelitian_score`, `test_violations==2`, `test_timing` populated, `overall_fit` sane; then call `check_can_apply` again with the same NIK/email → `ok=false` (dedup). Also submit a second application with the same NIK → expect the throw. Clean up.

- [ ] **Step 6: What's New**
Insert an `App Release` 1.41.0 (Both, published, `release_date` today), Bahasa bullets, via the CLAUDE.md one-liner; verify via `get_app_releases` for Mobile + Web.

- [ ] **Step 7: Commit build**
```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js frontend/sw-custom.js docs/assets/data.js
git commit -m "build(recruitment): ship proctored wizard bundles + docs"
```

---

## Self-Review

**Spec coverage:** wizard §1 → Task 6; apply-once §2 → Tasks 4/6; server timer §3 → Tasks 4/6; anti-cheat §4 → Task 6 (persist Task 4); banks §5 → Tasks 1/2; data model §6 → Task 3; API §7 → Task 4; frontend §8 → Tasks 5/6/7/8; ship → Task 9. ✓

**Placeholder scan:** Task 2's items are generated (data) with structural asserts. Task 6's per-test question markup is JS-built from the `TESTS` structure — the full controller script is given. No "TODO"/hand-waves.

**Type consistency:** `_overall_fit(disc_fit, personality_fit, scores, enabled)` new 4-arg signature used consistently in Task 4 (definition, self-check, submit call). `test_timing` shape `{test:{elapsed,limit,expired}}` identical across Task 4 (`_test_timing`), Task 5 (`TestTiming`), Task 8 (consume). `time_*` field names identical across Tasks 3/4/5/6/7. `attempt_id`/`violations`/`violation_reasons` payload keys match between Task 6 (submit) and Task 4 (`submit_application` params).
