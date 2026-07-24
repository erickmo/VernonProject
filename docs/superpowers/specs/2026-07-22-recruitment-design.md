# Recruitment / Hiring — Design Spec

_2026-07-22 · vernon_project_

## Goal

A full recruitment process inside vernon_project:

- HR posts **job openings**; anyone (public or logged-in) can apply.
- Application = CV/resume upload + an **interview test taken as part of applying**
  (MCQ auto-scored + free-text manually graded by HR).
- HR can **schedule interviews** (reusing the existing Meeting doctype → shows on Calendar).
- HR can **blacklist by KTP number** (soft flag: a blacklisted KTP still submits, but the
  application is auto-flagged for HR).
- HR can **contact applicants via WhatsApp** by clicking the phone number
  (`wa.me` deep-link, prefilled Bahasa message for invite / accept / reject).

Decisions locked with the user (2026-07-22):
applicants = **public + logged-in**; test = **part of applying**, **MCQ auto + free-text manual**;
scheduling = **reuse Meeting/Calendar**; blacklist = **soft flag**; public intake surface =
**server-rendered www Jinja** (rebuild `/careers`), recommended default.

## Data model — 3 doctypes + 2 child tables

All `module: Vernon Project`. KTP + CV mirror the `Employee Profile` sensitive-field pattern
(`permlevel: 1`, private attachment) so only HR can read them back.

### Job Opening (`autoname: hash`)
`title`, `slug` (unique, URL key), `brand` (Link Brand), `location`, `employment_type`
(Select), `description` (Text Editor), `requirements` (Text Editor), `status`
(Draft/Open/Closed), `posted_by` (Link User, ro), `posted_on` (Date), `closes_on` (Date),
`questions` (Table → Job Test Question).

### Job Test Question (child)
`question_text`, `qtype` (Multiple Choice / True/False / Free Text), `options` (one per line,
MCQ/TF), `correct_answer` (exact option text; blank = Free Text), `points` (Int, default 1).

### Job Application (`autoname: hash`)
Identity: `job_opening` (Link), `full_name`, `email`, `phone`, `nik_ktp` (permlevel 1),
`cv` (Attach private, permlevel 1), `cover_letter`, `applicant_user` (Link User, ro — set if
logged-in). Pipeline: `status` (Submitted→Screening→Interview→Offered→Hired/Rejected),
`blacklist_flag` (Check ro), `blacklist_reason` (ro), `submitted_on` (ro). Test: `score`
(Float ro), `max_score` (Float ro), `grading_status` (Auto-scored / Needs Grading / Graded),
`answers` (Table → Job Application Answer). Interview: `interview_meeting` (Link Meeting, ro).

### Job Application Answer (child)
`question_text` (ro), `qtype`, `answer`, `is_correct` (Check ro — MCQ auto),
`points_awarded` (Float — auto for MCQ, manual for free-text), `max_points` (Int ro).

### Recruitment Blacklist (`autoname: field:nik_ktp` — unique per KTP)
`nik_ktp` (unique), `full_name`, `reason`, `blacklisted_by` (ro), `blacklisted_on` (ro).
Whole doctype gated to HR Manager + System Manager (it IS a list of KTPs).

## Permissions / roles
Admin gated with the existing **HR Manager** role (+ System Manager). Job Application carries a
`permlevel: 1` permission row (HR Manager + System Manager) for KTP/CV. Public intake writes via
a guest endpoint with `ignore_permissions=True`, so applicants can submit KTP/CV they never get
to read back.

## API — `vernon_project/api/recruitment.py`
- **Guest** (`allow_guest=True`, rate-limited via `frappe.rate_limiter`):
  `list_open_jobs()`, `get_job(slug)` (opening + questions, no correct answers leaked),
  `submit_application` (multipart: identity + CV file + answers JSON) → validate, save CV
  (`is_private=1`, PDF/doc allowlist), auto-score MCQ/TF, set `grading_status`, blacklist lookup
  → soft flag, insert.
- **HR** (`_require_hr()` = HR Manager|System Manager): `list_applications(job, status)`,
  `get_application(name)`, `grade_answer` / `save_grading`, `set_status`, `schedule_interview`
  (creates a Meeting, links `interview_meeting`), `wa_link(phone, template)` helper (normalize
  `08xx`→`628xx`, prefilled Bahasa text), blacklist add/remove, opening CRUD.

## Scoring rule
On submit: for each MCQ/TF answer, `is_correct = (answer == correct_answer)`,
`points_awarded = points if correct else 0`. Free-text → `points_awarded = null` (pending).
`max_score = Σ points`. `score = Σ points_awarded`. `grading_status = "Needs Grading"` if any
free-text question exists, else `"Auto-scored"`. HR grading fills free-text `points_awarded`
then `"Graded"`.

## Frontend
- **Public intake (Phase 1):** rebuild www `/careers` → real openings list + `/careers/<slug>`
  detail with application form + test (server-rendered Jinja + vanilla JS, one guest POST).
- **HR admin (Phase 2), both /m + /w:** openings CRUD, application pipeline + grading, WA button,
  schedule-interview, blacklist management.
- **Logged-in apply (Phase 3), both /m + /w:** browse openings + prefilled apply + take test.

## Phasing
1. Backend domain + public intake (doctypes, `recruitment.py`, www careers, gen_docs cluster).
2. HR admin SPA (both frontends).
3. Logged-in in-app apply (both frontends).
Then: `gen_docs.py` regen, What's New entry, live verification.

## Reuse (no new infra)
Meeting + Resource Booking (interview scheduling/conflict), `upload_reward_image` pattern
(private CV upload w/ MIME+ext+size allowlist), `User.phone` (WA), Employee Profile permlevel-1
(KTP), HR Manager role, `frappe.rate_limiter` (guest spam guard, per VernonCorp).

## Out of scope (YAGNI)
Reusable test/question bank (test lives on the job); offer-letter generation; email
notifications (WA covers contact); applicant self-service account/portal login.
