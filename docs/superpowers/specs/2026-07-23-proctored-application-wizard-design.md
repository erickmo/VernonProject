# Proctored Application Wizard — Design Spec

_2026-07-23 · vernon_project · extends the recruitment interview-assessment feature_

## Goal

Turn the public job application into a **proctored, timed, multi-step wizard**, prevent duplicate
applications, add a new **ketelitian** (clerical-accuracy) test plus more personality/logic items,
and add lightweight anti-cheat (tab/focus detection, per-test countdowns, no-JS block) with the
timer **enforced server-side**.

Decisions locked with the user (2026-07-23):
- **Apply-once** = block a repeat application when `(job, nik_ktp)` **or** `(job, email)` already
  exists; checked at wizard start and re-enforced on submit.
- **Anti-cheat** = **count & flag, don't block** (violations recorded + shown to HR; the applicant
  still finishes). _Explicitly chosen over hard-fail — proctoring false-positives (calls,
  notifications) would wrongly reject honest applicants._
- **Timer** = **per-test** countdowns, HR sets minutes per opening; **server-authoritative** (time
  measured from a server-stamped start, client cannot fake it).
- **Ketelitian** = **mixed** bank: same/different pairs + odd-one-out, scored correct/incorrect.
- Bigger banks: personality 25→~40 (8/trait), logika 10→~20.

## 1. Wizard (rewrite `www/apply.html` → vanilla-JS state machine)

Still the public www surface (Jinja shell + vanilla JS; no build, no login). The current single
`<form>` becomes a step machine driven by JS:

| Step | Content | Timed | Anti-cheat |
|---|---|---|---|
| 0 Consent | Rules: timed per-test, stay on this tab, JS required, one attempt. "Mulai". | no | — |
| 1 Identity + CV | name/email/phone/NIK/CV/cover letter. Dedup pre-check on entry. | no | — |
| 2…N Tests | one step **per enabled test** (job-specific, DISC, personality, logika, ketelitian). Countdown shown; auto-lock + advance at expiry. | **yes** | active |
| Final Review + Submit | summary → one guest POST. | no | — |

- **No-JS**: a `<noscript>` block renders "Tes membutuhkan JavaScript aktif untuk melamar." The
  wizard and the submit are entirely JS-driven, so a no-JS client cannot progress or POST ⇒ fails by
  construction. No server branch needed.
- **attempt_id**: a UUID generated once and **persisted in `localStorage` keyed by job slug**, so a
  page reload reuses the same id → `start_test` returns the same server-stamped `start_at` and the
  countdown does **not** reset on reload (closes the reload-to-reset-timer loophole). Also stored on
  the application for audit. (Clearing localStorage mints a new id but also loses all answers, and
  apply-once still blocks a completed re-submit.)
- Test step order is deterministic (job-specific, DISC, personality, logika, ketelitian — only the
  enabled ones). Each timed step calls `start_test` on entry.

## 2. Apply-once

- `check_can_apply(job, nik_ktp, email)` (guest): returns `{ok, reason}`; `ok=false` if a Job
  Application exists for this opening with the same `nik_ktp` OR the same `email`. Called when the
  applicant leaves Step 1 (so they don't waste time on the tests).
- `submit_application` re-checks the same condition before insert (race-safe; the pre-check is UX,
  the submit check is the guard). Bahasa message: "Kamu sudah pernah melamar posisi ini."
- Not a DB `unique` constraint (two different columns, either of which blocks) — enforced in code
  with an indexed lookup on `nik_ktp` and `email` (both already columns on Job Application).

## 3. Timer — server-authoritative, per test

Endpoint `start_test(attempt_id, job, test)` (guest, rate-limited):
- Cache key `recruit_timer:{attempt_id}:{test}` in `frappe.cache()`.
- First call: stamp `start_at = now`, store `{start_at, limit_sec}` with TTL = `limit_sec + grace +
  buffer`; return `{start_at, limit_sec}`.
- Repeat call (same attempt+test): return the **existing** `start_at` (no reset — a client cannot
  restart its own countdown).
- `limit_sec` comes from the opening's `time_<test>` (minutes × 60).

Client shows a countdown from `start_at + limit_sec`; at 0 it locks that test's inputs and advances.

On `submit_application`, for each timed test the backend recomputes
`elapsed = submit_time − cached start_at`. If the cache entry is **missing** (expired/never started)
or `elapsed > limit_sec + grace`, that test is flagged `expired` in `test_timing`. **This is the
gate: elapsed is derived from the server's stamped start, never from client-reported time.** Per the
"flag-don't-block" decision, an expired test is recorded + flagged for HR (answers still scored, but
HR sees "waktu habis") rather than hard-rejected. `grace = 15s` (covers network/JS lag).

`test_timing` shape: `{ "disc": {"elapsed": 214, "limit": 360, "expired": false}, "logical": {...}, … }`.

## 4. Anti-cheat (client-reported, flag-only)

Active only during timed test steps:
- `document.visibilitychange` → `document.hidden` ⇒ violation "pindah tab/aplikasi".
- `window.blur` ⇒ violation "kehilangan fokus" (debounced vs the visibility event so one switch isn't
  double-counted).
- Multi-tab: a `BroadcastChannel('vernon-apply')` + `localStorage` lock; if another tab announces an
  active test for the same attempt ⇒ violation "tab lain terdeteksi".
- Split-screen is **not reliably detectable**; blur/visibility approximate it.

Each violation increments a client counter with a reason list, sent on submit as
`violations` (int) + `violation_reasons` (list). Stored as `test_violations` (Int) +
`violation_detail` (Small Text, deduped reason summary). HR sees e.g. "Fokus hilang 3× — pindah tab,
tab lain terdeteksi". **Honest limit:** a determined tamperer can disable the client listeners, so
this is soft signal; the server timer (§3) and the no-JS block (§1) are the enforceable parts.

## 5. Instrument banks — regenerate via validation workflow

`recruitment_instruments.py` gains a ketelitian bank and grows the others:
- **KETELITIAN_ITEMS** (~20, new): mixed —
  - same/different: `{"id","kind":"pair","left","right","answer":"Sama"|"Beda","points":1}` rendered
    as two strings + Sama/Beda buttons.
  - odd-one-out: `{"id","kind":"odd","text","options":[...],"answer","points":1}` (standard MCQ).
  - Both score correct/incorrect. Public form strips `answer`.
- **BIGFIVE_ITEMS** 25→40 (8 per trait, ~40% reverse, balanced).
- **LOGIC_ITEMS** 10→20.
- Self-check extended: ketelitian answer ∈ options (odd) or ∈ {Sama,Beda} (pair); counts.
- Scoring: `score_ketelitian(answers)` reuses the correct/incorrect pattern → `(score, max)`; served
  stripped via `public_ketelitian()`.

## 6. Data model changes

### Job Opening (add)
- `test_ketelitian` (Check).
- Per-test time limits (Int minutes, `depends_on` the matching toggle; 0 = untimed):
  `time_jobspecific`, `time_disc`, `time_personality`, `time_logical`, `time_ketelitian`
  (defaults 6/5/6/8/4).

### Job Application (add)
- `attempt_id` (Data, ro).
- `test_violations` (Int, ro, `in_list_view`), `violation_detail` (Small Text, ro).
- `test_timing` (Code/JSON, ro).
- `ketelitian_score` (Float, ro), `ketelitian_max` (Float, ro).
- Dedup enforced in code (no schema change beyond existing `nik_ktp`/`email` columns; add
  `search_index` on `email`).

### Scoring / fit
`overall_fit` extends to include ketelitian %: mean of enabled {disc_fit, personality_fit, logical%,
ketelitian%}. Ketelitian is a scored aptitude test (no target profile), like logical.

## 7. API — `recruitment.py`

- `check_can_apply(job, nik_ktp, email)` — guest, dedup pre-check.
- `start_test(attempt_id, job, test)` — guest, timer stamp (§3).
- `get_job(slug)` — also return `test_ketelitian` + `ketelitian_items` (stripped) + the per-test
  `time_*` limits (client needs limits to render countdowns).
- `submit_application` — accept `attempt_id`, `ketelitian_answers`, `violations`,
  `violation_reasons`; enforce apply-once; score ketelitian; compute `test_timing` from the cache;
  persist violations/timing; recompute `overall_fit` with ketelitian.
- `save_opening` — persist `test_ketelitian` + the 5 `time_*` fields.
- `get_application` — return violations, timing, ketelitian score.

## 8. Frontend — www + both SPAs

- **www `apply.html`/`apply.py`**: the wizard (§1) — the largest piece. Consent, step machine,
  per-test countdown timers, anti-cheat listeners, dedup pre-check call, noscript block, per-test
  `start_test` calls, review, submit with the new payload.
- **SPA opening editor** (both /m + /w): ketelitian toggle + 5 per-test time inputs (minutes).
- **SPA application detail** (both /m + /w): violations count + reasons, per-test timing (over-time
  flags), ketelitian score bar/subtotal.
- **api.ts**: types for the new opening fields, ketelitian result, violations, timing.

## 9. Phasing

1. **Banks**: regenerate personality(40)/logic(20) + new ketelitian(20) via validation workflow;
   `score_ketelitian` + `public_ketelitian` + self-check.
2. **Backend**: doctype fields (toggles/time/violations/timing/ketelitian); `check_can_apply`,
   `start_test`, apply-once enforce, ketelitian scoring, timing gate, violations persist; migrate.
3. **Wizard**: rewrite `apply.html`/`apply.py` — steps, timers, anti-cheat, dedup, noscript.
4. **SPA**: api.ts types; opening editor (ketelitian + times); application detail (violations/timing/
   ketelitian) — both frontends.
5. **Ship**: gen_docs, build both, SW bump, CF purge, restart, What's New, live E2E (incl. a real
   dedup + timer-expiry + violation round-trip).

## 10. Reuse (no new infra)

Existing scored-answer machinery (ketelitian + logical), `frappe.cache()` (timer state — no session
doctype), `frappe.rate_limiter` (guest endpoints), the existing wizard-less form's honeypot/CSRF/CV
upload, existing DISC/BigFive scoring + fit, existing SPA screens.

## 11. Out of scope (YAGNI)

Webcam/screen proctoring; server-side enforcement of tab-switching (undetectable server-side —
client-reported only); question randomization per applicant; resumable half-finished attempts
(a reload restarts the wizard; the server timer keeps its stamp within TTL so reload doesn't grant
more time); per-test retakes; hard-fail on violation (explicitly declined).
