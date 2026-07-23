# Interview Assessment — DISC + Personality + Logical — Design Spec

_2026-07-23 · vernon_project_

## Goal

Extend the recruitment "interview test" (spec `2026-07-22-recruitment-design.md`) with three
structured assessments an applicant takes as part of applying:

1. **DISC** — behavioural profile (Dominance / Influence / Steadiness / Conscientiousness).
2. **Personality & character** — Big Five / OCEAN (Openness, Conscientiousness, Extraversion,
   Agreeableness, Neuroticism).
3. **Logical thinking & problem solving** — scored aptitude test (correct/incorrect).

Decisions locked with the user (2026-07-23):
- **Authoring = baked batteries (hybrid).** DISC + Personality ship as built-in validated question
  banks in Python; HR never authors them. Logical = a baked general-aptitude MCQ bank. The existing
  per-job authored `questions` table stays for job-specific knowledge questions.
- **Selection = per-job toggle.** HR enables which of {DISC, Personality, Logical} apply to each
  opening (job-specific `questions` remain independently available).
- **Result = profile + target fit.** DISC & Personality produce descriptive profiles (no pass/fail)
  **plus** a fit % against a per-job target profile HR sets. Logical keeps a numeric score.

Defaults locked: items in **Bahasa Indonesia**; DISC ~28 forced-choice items, Big Five ~25 Likert
items, Logical ~10 MCQ; **all enabled tests required** to submit; fit is transparent
distance-based (no black box).

## Two kinds of test

| Test | Kind | Authored | Stored where | Output |
|---|---|---|---|---|
| DISC | profile | baked (code) | `psych_result` JSON + flat fields | D/I/S/C 0–100, dominant type, `disc_fit` |
| Personality | profile | baked (code) | `psych_result` JSON + flat fields | O/C/E/A/N 0–100, `personality_fit` |
| Logical | scored | baked MCQ bank | existing `answers` table | correct/total → `logical_score`/`logical_max` |
| Job-specific | scored | authored per job (unchanged) | existing `answers` table | folds into `score`/`max_score` |

Profile tests are **descriptive** — no right/wrong. Scored tests reuse the recruitment spec's
existing auto-score + free-text grading machinery.

## Baked instrument banks — `vernon_project/api/recruitment_instruments.py`

Standard instruments live in code, not doctypes (they rarely change, are the same for every job, and
must never be HR-editable). One module exposes the banks and the scoring maps. **Scoring keys are
never sent to the client** — the API strips them before returning items to an applicant.

### DISC (forced-choice, ~28 items)
Each item = one group of 4 Bahasa adjectives, one mapped to each axis D/I/S/C. Respondent picks the
one **MOST** like them and the one **LEAST** like them.

```python
DISC_ITEMS = [
  {"id": "d1", "words": [
     {"text": "Tegas",     "axis": "D"},
     {"text": "Ceria",     "axis": "I"},
     {"text": "Sabar",     "axis": "S"},
     {"text": "Teliti",    "axis": "C"}],
  }, ... ]  # ~28 items, each axis appears once per item
```

Scoring: `most` → +1 to that axis, `least` → −1 to that axis. Sum per axis across items → raw
score in `[-28, +28]`. Normalize to 0–100: `norm = round((raw + N) / (2N) * 100)` where `N` = item
count. Dominant type = axis with highest norm (ties → concatenate, e.g. `"DI"`).

### Big Five / OCEAN (Likert 1–5, ~25 items)
5 items per trait; some **reverse-scored** (`reverse: true`). Respondent rates agreement 1
(Sangat tidak setuju) – 5 (Sangat setuju).

```python
BIGFIVE_ITEMS = [
  {"id": "o1", "text": "Saya suka mencoba hal-hal baru.", "trait": "O", "reverse": False},
  {"id": "n3", "text": "Saya jarang merasa cemas.",       "trait": "N", "reverse": True}, ... ]
```

Scoring: per answer `v` (1–5), effective = `6 - v` if `reverse` else `v`. Per trait: mean of its 5
effective values → map 1–5 to 0–100: `norm = round((mean - 1) / 4 * 100)`.

### Logical (MCQ, ~10 items)
Standard MCQ with a single correct option. Reuses the scored-question shape.

```python
LOGIC_ITEMS = [
  {"id": "l1", "text": "...", "options": ["A","B","C","D"], "answer": "B", "points": 1}, ... ]
```

Scoring: `is_correct = (answer == correct)`, `points_awarded = points if correct else 0`. No
free-text → always auto-scored.

### Content generation
The ~63 baked items (28 DISC + 25 Big Five + 10 logical) are the heavy deliverable. Generate them
via a validation Workflow: draft Bahasa items → adversarially check axis/trait mapping, reverse-score
correctness, cultural fit, answer-key correctness → only validated items land in the module. A tiny
`__main__`/`demo()` self-check asserts: every DISC item has exactly one word per axis; every trait
has exactly 5 Big Five items; every logic answer is one of its options; normalization stays in
0–100 at the extremes.

## Data model changes (no new doctypes)

### Job Opening (add fields)
- `test_disc`, `test_personality`, `test_logical` — Check (default 0). Section "Standard Assessments".
- DISC target (only when `test_disc`): `target_d`, `target_i`, `target_s`, `target_c` — Int 0–100,
  `depends_on: eval:doc.test_disc`.
- Big Five target (only when `test_personality`): `target_o`, `target_c_big`, `target_e`, `target_a`,
  `target_n` — Int 0–100, `depends_on: eval:doc.test_personality`. (`target_c_big` avoids collision
  with DISC `target_c`.)
- Existing `questions` table unchanged.

### Job Application (add fields)
- `psych_result` — JSON/Code. Raw DISC & Big Five answers + computed axes/traits + fits. Single
  source of truth for the profile bars the SPA renders.
- Flat read-only fields (for list view, filtering, pipeline ranking):
  `disc_type` (Data), `disc_fit` (Float), `personality_fit` (Float),
  `logical_score` (Float), `logical_max` (Float),
  `overall_fit` (Float, `in_list_view: 1`, `in_standard_filter: 1`).
- Scored logical answers reuse the existing `answers` table + `score`/`max_score`/`grading_status`.

### Job Application Answer (add field)
- `test` — Data, read-only. Tags each scored answer `"Logical"` or `"Job-Specific"` so the SPA shows
  each subtotal. Existing fields (`question_text`, `qtype`, `answer`, `is_correct`, `points_awarded`,
  `max_points`) unchanged. DISC/Big Five answers do **not** go here (no right/wrong) — they live in
  `psych_result`.

`psych_result` shape:
```json
{
  "disc":       {"answers": {"d1": {"most": "D", "least": "S"}, ...},
                 "scores": {"D": 72, "I": 40, "S": 25, "C": 55}, "type": "D", "fit": 68.0},
  "personality":{"answers": {"o1": 4, "n3": 2, ...},
                 "scores": {"O": 60, "C": 80, "E": 45, "A": 70, "N": 30}, "fit": 74.0}
}
```

## Scoring & fit — in `vernon_project/api/recruitment.py`

On `submit_application`, after the existing job-specific scoring:
1. If `test_logical`: score the baked logical answers → append to `answers` table tagged
   `"Logical"`, set `logical_score`/`logical_max`, add into `score`/`max_score`.
2. If `test_disc`: score DISC → `psych_result.disc`, set `disc_type`, `disc_fit`.
3. If `test_personality`: score Big Five → `psych_result.personality`, set `personality_fit`.
4. `overall_fit` = mean of the enabled contributors:
   `disc_fit` (if DISC), `personality_fit` (if personality),
   `logical_pct = 100*logical_score/logical_max` (if logical & max>0). No enabled contributor →
   `overall_fit = null`.

**Fit formula** (transparent, no black box):
`fit = round(100 - mean(|applicant_axis_norm - target_axis_norm|), 1)`, clamped to `[0, 100]`,
over the axes of that instrument (DISC: D/I/S/C; Big Five: O/C/E/A/N). Target axes default to 50 if
HR left them blank (neutral → fit reflects how extreme the applicant is, still meaningful).

A `demo()`/`test_*.py` self-check asserts: identical applicant==target → fit 100; opposite extremes
→ fit 0; overall_fit averages only enabled tests.

## API changes — `recruitment.py`

- `get_job(slug)` (guest): additionally return `{test_disc, test_personality, test_logical}` and, for
  each enabled test, its baked items **with scoring keys stripped** (DISC: words+axes hidden→just
  `text` per option; Big Five: `text` only, no `trait`/`reverse`; Logical: `text`+`options`, no
  `answer`). Client renders the forms from this.
- `submit_application`: accept `disc_answers`, `personality_answers`, `logical_answers` in the
  payload alongside existing job-specific answers; validate all enabled tests are complete (reject
  incomplete submit); score server-side per above; persist.
- `get_application(name)` (HR): return `psych_result` + flat fit/score fields + per-test subtotals so
  the admin detail can render bars.
- Opening CRUD already round-trips arbitrary fields → the 3 toggles + target fields ride along; no
  new endpoint. Verify the CRUD whitelist passes them through.

Scoring-key leakage is the one security-relevant boundary: assert in a test that `get_job` output
contains no `axis`, `trait`, `reverse`, or `answer` keys.

## Frontend — both /m + /w + public www

Extends the existing recruitment UI (Phase 2/3 already shipped 2026-07-23).

- **Apply form** (www `/careers/<slug>` + logged-in SPA apply, `frontend` + `frontend-web`): render a
  section per enabled test.
  - DISC: per item, pick MOST + LEAST from 4 words (radio columns; enforce most≠least).
  - Big Five: Likert 1–5 row per statement.
  - Logical: MCQ (reuse existing question renderer).
  - Block submit until every enabled test complete.
- **Opening editor** (SPA admin, both frontends): 3 toggles; when a profile test is on, show its
  target sliders (0–100 per axis). Reuse existing SearchableSelect/number conventions; targets are
  0–100 sliders/NumField.
- **Application detail** (SPA admin, both frontends): DISC bars (D/I/S/C) + dominant type badge,
  OCEAN bars, fit % per test, logical score, and `overall_fit` headline. Pipeline list sortable/
  filterable by `overall_fit`.

Shared logic (item rendering, answer state, client-side completeness check) lives in `frontend/src`
(imported as `@` by web); each frontend keeps only its presentation (mobile Soft-Pop cards / web
bento tiles).

## Phasing

1. **Backend**: `recruitment_instruments.py` (banks + scoring + self-check), doctype field additions
   (Job Opening, Job Application, Job Application Answer), `recruitment.py` scoring/fit/leak-strip,
   migrate.
2. **Content Workflow**: generate + adversarially validate the 63 Bahasa items into the module.
3. **Frontend**: apply-form test sections, opening-editor toggles+targets, application-detail
   profile bars — both /m + /w + www. Rebuild both bundles.
4. **Finish**: `gen_docs.py` regen, What's New entry (both platforms), live verify one enabled test
   end-to-end per platform.

## Reuse (no new infra)

Existing `answers` table + `score`/`max_score`/`grading_status` + free-text grading (logical rides
these); existing opening CRUD whitelist (toggles/targets ride along); existing question renderer
(logical MCQ); existing recruitment SPA screens + www careers/apply; `frappe.rate_limiter` guest
guard; permlevel-1 privacy already on Job Application.

## Out of scope (YAGNI)

Editable/versioned instrument banks (they're code); norm-referenced percentile scoring against a
population (raw normalization only); per-question timing; separate assessment retake flow; DISC
"least" weighting variants beyond ±1; multi-language item sets (Bahasa only).
