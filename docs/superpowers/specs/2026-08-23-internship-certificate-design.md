# Internship Certificate + Intern Score — design

**Date:** 2026-08-23
**Goal:** issue an internship certificate that carries a QR code proving it is authentic,
and give every intern a score that explains what they actually did.

## Why

An intern finishing a placement leaves with nothing they can show a future employer. A PDF
alone is worthless — anyone can retype it. The QR turns the certificate into a claim a
stranger can check against this app in one scan.

The score answers the second half: a certificate that only says "Budi magang di sini" is
polite but empty. Two numbers go on it, deliberately kept apart:

- **Nilai Kinerja (auto)** — derived from what the app already recorded: todos completed,
  deadlines met, attendance, points, courses finished. Nobody types it.
- **Nilai Penilaian (rubrik)** — what the project leader judges: discipline, quality,
  initiative, collaboration, communication.

They are shown **side by side, never averaged into one**. Averaging would hide exactly the
interesting case — the intern whose numbers are mediocre but whose leader rates them highly,
or the reverse. A reader deserves to see both.

## Approach: derive standing, freeze on issue

The auto score is **never stored** while it is live. A pure function computes it on demand
from Point Ledger / Project Todo / Daily Attendance / Course Enrollment. This follows the
app's existing rule (see `vernon-gamification-derives-from-point-ledger`): the ledger is the
truth, derived numbers are views.

At the moment HR publishes a certificate, both scores and the whole breakdown are **frozen**
into the certificate row as JSON. From then on the certificate never changes, even if the
intern's todos are later edited, reassigned, or deleted. A published certificate is a
historical record, not a live query.

Rejected alternatives:

- **An `Intern Score` doctype holding periodic snapshots** — a second source of truth for the
  same number, plus a sync job to keep it wrong in a new way.
- **Score fields on Employee Profile** — one score per intern forever; no per-project,
  per-period certificate, which is the whole point.

## Data model

Two new DocTypes.

### `Internship Certificate`

| Field | Type | Notes |
|---|---|---|
| `intern` | Link User | required |
| `project` | Link Project | optional — a certificate may span the whole placement |
| `position` | Data | e.g. "Frontend Developer Intern" |
| `period_start`, `period_end` | Date | required; end >= start |
| `status` | Select | `Draft` / `Pending HR` / `Published` / `Revoked` |
| `cert_no` | Data | unique, minted at publish: `VRN/CERT/YYYY/NNNN` |
| `verify_code` | Data | unique, unguessable (22 chars), minted at publish |
| `auto_score` | Float | frozen at publish |
| `rubric_score` | Float | frozen at publish |
| `grade` | Data | letter derived from the two, frozen at publish |
| `breakdown_json` | Small Text | frozen auto-score components |
| `rubric` | Table | `Internship Certificate Rubric` |
| `summary` | Small Text | leader's free-text remark, printed on the certificate |
| `issued_on` | Date | publish date |
| `published_by` | Link User | the HR user who published |
| `revoked_on` | Date, `revoke_reason` | Small Text |

`autoname: hash` like `Overtime Entry` / `Cuti Ledger`. `cert_no` is a separate human-facing
field so a draft has no number — an unissued certificate must not look issued.

### `Internship Certificate Rubric` (child)

`label` (Data), `weight` (Float), `score` (Float 0-100), `comment` (Small Text).

Rubric *definition* — the five labels and their weights — is a constant in code
(`RUBRIC` in `api/intern_score.py`), not an admin-editable doctype. YAGNI: no one has asked
to change the weights, and a configurable rubric means every historical certificate needs to
remember which version it was scored under.

## Score engine — `api/intern_score.py`

One pure function, zero DB access, so it can be exhaustively unit-tested:

```python
compute_auto_score(todos, attendance, points, courses, period) -> {
    "auto_score": 0..100,
    "grade": "A" | "B" | "C" | "D",
    "components": [{"key", "label", "value", "weight", "points", "detail"}],
}
```

Five components, weights summing to 100:

| Key | Label (id) | Weight | Measures |
|---|---|---|---|
| `completion` | Penyelesaian Tugas | 30 | completed / assigned todos in period |
| `timeliness` | Ketepatan Waktu | 25 | completed on or before deadline |
| `attendance` | Kehadiran | 20 | present days / scheduled days |
| `contribution` | Kontribusi Poin | 15 | points earned, scaled against a target |
| `learning` | Pembelajaran | 10 | courses completed / enrolled |

**A component with no denominator is dropped, not scored zero,** and the remaining weights
are renormalised. An intern who was never enrolled in a course must not be punished for the
`learning` component — this is the single most important rule in the engine and it has its
own tests.

`compute_rubric_score(rows)` is the weighted mean of the leader's rubric lines, ignoring
unscored lines. Grade bands: A >= 85, B >= 70, C >= 55, else D.

## Flow

```
leader drafts  ->  Pending HR  ->  HR publishes  ->  Published  ->  (HR revokes) -> Revoked
     Draft            ^                                                  |
       ^--------------+  HR sends back                                   |
```

- A **leader** (project owner / leader / admin of a project the intern works on) creates a
  draft, fills the rubric and summary, and submits it for approval.
- An **HR Manager** (or System Manager) publishes. Publishing mints `cert_no` + `verify_code`
  and freezes both scores. This is the only transition that makes a certificate real.
- **Revoke is one-way and keeps the row.** Deleting would make the QR resolve to NOT FOUND,
  which reads as "this app has never heard of this certificate" — wrong and unhelpful.
  A revoked code must say *revoked*, with its date.
- One intern may hold several certificates (different projects/periods). A second
  `Published` certificate for the same intern+project+period is refused.

## QR + public verification

The QR encodes `https://project.vernon.id/verify/<verify_code>` — a URL, so any phone camera
resolves it without an app.

`www/verify.py` + `verify.html`, routed by `website_route_rules`, bilingual through the
existing `_i18n` helper, rate-limited like `careers`. Guest-readable.

The page shows a large **VALID / REVOKED / NOT FOUND** banner, then the intern's name,
period, position, project, both scores, the auto-score component breakdown and the rubric
lines (the full breakdown, as decided).

`verify_code` is 22 random URL-safe characters, so the page cannot be enumerated. That is the
whole access control: knowing the code (i.e. holding the certificate) is the permission. No
sequential ids are ever exposed publicly — `cert_no` is printed on the paper but is not the
lookup key.

## PDF

Jinja template rendered server-side, then `frappe.utils.pdf.get_pdf` (wkhtmltopdf 0.12.6.1
is installed on this host and works).

The QR is embedded as a **PNG data URI** generated by `segno` (pure Python, no transitive
dependencies, added to `pyproject.toml`). PNG rather than SVG deliberately: this wkhtmltopdf
build renders inline SVG unreliably.

Only a `Published` certificate produces a PDF. Draft download is refused, not watermarked —
a watermarked draft still ends up screenshotted into a CV.

## Frontends — both, per CLAUDE.md

`/certificates` on `/m` (Soft-Pop cards) and `/w` (bento + DataTable), sharing hooks and
types from `frontend/src`.

- **Intern:** own certificates, live score card with the component breakdown, Download PDF.
- **Leader:** their interns; "Buat Sertifikat" puts the rubric form **beside** the live auto
  breakdown, so the subjective score is entered while looking at the objective one.
- **HR:** approval queue; publish / send back / revoke.

### `(i)` help, on the things that genuinely confuse

- why there are two scores and why they are not averaged
- why the live score moves but an issued one never does
- what the QR actually proves (this app issued it; not that the work was good)
- what a dropped component means ("no courses enrolled — this part is not counted")
- what revoked means, and that the QR keeps working after revocation

## Testing

Pure functions first (`unittest`, no DB — matching `test_intern_allocation.py`):

- every component at 0%, 100%, and partial
- missing denominators dropped and weights renormalised, including *all* components missing
- period with no working days; period_end before period_start
- rubric with no scored lines, one line, all lines; weights summing to something other than 100
- grade boundaries at exactly 85 / 70 / 55
- clamping: a score can never leave 0..100

Then the endpoint/state-machine tests: permission scope per role, illegal transitions,
publish freezing, duplicate publish refused, revoke keeping the row, verify lookup for
valid / revoked / unknown codes.

## What changed during implementation

Four things the design did not anticipate, all found by building it:

- **`Internship Certificate Rubric.scored` (Check).** A Frappe `Float` column cannot store
  `None` — it writes `0.0`. So every criterion a leader skipped came back looking like a
  scored zero and dragged the rubric down: a rubric that should have read 86.0 read 43.0.
  The flag is what keeps "not judged" and "judged zero" apart. The pure engine still
  accepts `score: None` for rows built in memory.

- **`my_score` endpoint.** The design only ever showed an intern their score on a
  certificate — which means meeting it for the first time on the way out. `my_score`
  returns the caller's own live score over their Employee Profile contract dates
  (falling back to the last 180 days), and both frontends lead with it.

- **`issuable_interns` endpoint.** Picking the intern out of every user account is how a
  certificate ends up on the wrong person. The picker is scoped to interns the caller
  actually leads.

- **The PDF layout is shaped by three measured wkhtmltopdf facts**, each of which
  silently produced a two-page or half-blank certificate. They are documented in the
  template itself: the printable band is 180mm rather than 210mm (frappe overrides the
  caller's margins with 15mm when the HTML has no header/footer div); QtWebKit paginates
  on any explicit `<body>` height; and QtWebKit has neither flexbox nor the `inset`
  shorthand, so rows stacked and the decorative frame never drew.

Also: the QR forces `https` even though `frappe.utils.get_url()` returns `http` on this
site (no `host_name` in site_config). A URL printed onto paper cannot be corrected later.

## Deliberately not built

No admin-editable rubric weights. No bulk issue. No email delivery. No certificate templates
or themes. Add when someone asks.
