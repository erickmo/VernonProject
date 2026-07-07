# LMS ("Learn") — Design Spec

**Date:** 2026-07-07
**App:** `vernon_project` (Frappe + two React frontends: `/m` mobile, `/w` web)
**Status:** Phase 1 spec — approved, ready for implementation plan
**User-facing label:** **Learn** (route `/learn`)

---

## 1. Goal & scope

Add an internal Learning Management System to `vernon_project` serving two audiences at once:

1. **Team training** — members browse a catalog, take courses, mark lessons complete, earn points that flow into the existing gamification economy.
2. **Onboarding / compliance** — admins assign required courses to specific users with a due date and track completion; overdue learners get nudged.

A course is a flat, ordered list of lessons. Each lesson can carry rich text, an embedded video, and downloadable file attachments (any combination). Completing all lessons in a course completes the course and mints points.

The feature mirrors the existing **Extra Income** feature end-to-end (doctypes + role-gated `api/*.py` + shared `api.ts`/`useData.ts`/`types.ts` + learner & admin screens on both frontends). It reuses the **Point Ledger** reward engine rather than inventing a new economy.

### Explicitly deferred to Phase 2 (separate spec)
- **Quiz / assessment** (Course Quiz / Question / Option doctypes, grading, completion gated on pass score).
- **Certificates** (user chose points-only reward).
- **Modules layer** (Course → Module → Lesson). Phase 1 is flat Course → Lesson; add grouping only if courses grow large.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Purpose | Team training **and** onboarding/compliance |
| Lesson content | Rich text + video (URL embed) + file attachments (quiz → P2) |
| Reward | Mint points to **Point Ledger** on course completion (no certificate) |
| Assignment model | **Both** admin-assign (required, due date) **and** self-enroll (optional catalog) — one Enrollment doctype, `assigned` flag |
| Frontends | Full learner **and** admin UI on **both** `/m` and `/w` |
| Manage role | New **`LMS Manager`** role, gated alongside `System Manager` |
| Structure | **Flat** Course → Lessons (ordered by `position`) |
| Quiz | **Phase 2** |
| Leaderboard | Learning points **count** toward the productivity leaderboard (no exclusion) |
| Overdue nudge | **Included** — daily scheduler notifies users with assigned courses past `due_date` |
| Label | **Learn** |

---

## 3. Data model

Five doctypes; two are child tables. Module for all = `Vernon Project`. Naming rule `Random` (autoname `hash`) for master/transaction doctypes so titles can be renamed freely and API creates without a name prompt.

### 3.1 Course (master)
| Field | Type | Notes |
|---|---|---|
| `title` | Data | reqd, in_list_view |
| `category` | Data | optional grouping label |
| `summary` | Small Text | one-line catalog blurb |
| `description` | Text Editor | rich overview |
| `cover_image` | Attach Image | optional |
| `points_reward` | Float | minted on course completion; admin sets |
| `estimated_minutes` | Int | optional |
| `status` | Select `Draft\nPublished\nArchived` | default `Draft`; only `Published` shows in learner catalog |

Permissions: `System Manager` full; `LMS Manager` full; `All` read. Controller: minimal `Document` subclass (helpers live in `api/lms.py`).

### 3.2 Course Lesson (standalone)
Standalone (not a child of Course) because it is a Link target for progress rows **and** owns its own `files` child table (Frappe cannot nest child tables inside child tables).

| Field | Type | Notes |
|---|---|---|
| `course` | Link → Course | reqd, indexed |
| `title` | Data | reqd |
| `position` | Int | ordering within course (0-based) |
| `body` | Text Editor | article content, optional |
| `video_url` | Data | embed URL (YouTube/Vimeo), optional |
| `estimated_minutes` | Int | optional |
| `files` | Table → Course Lesson File | optional attachments |

Any combination of `body` / `video_url` / `files` renders; no strict `content_type` field. Permissions same as Course.

### 3.3 Course Lesson File (child of Course Lesson)
| Field | Type | Notes |
|---|---|---|
| `file` | Attach | reqd |
| `label` | Data | display name |

### 3.4 Course Enrollment (one per user × course)
| Field | Type | Notes |
|---|---|---|
| `course` | Link → Course | reqd, indexed |
| `user` | Link → User | reqd, read-only (session or admin-set) |
| `assigned` | Check | 1 = admin-assigned (required); 0 = self-enrolled |
| `assigned_by` | Link → User | set when assigned |
| `due_date` | Date | optional; drives overdue |
| `status` | Select `Assigned\nIn Progress\nCompleted` | derived; `Overdue` is computed at read (due_date passed & not Completed), not stored |
| `completed_on` | Datetime | set when all lessons done |
| `progress_pct` | Float | cached, recomputed on each lesson-complete |
| `lessons_done` | Table → Course Lesson Progress | completed-lesson rows |

Uniqueness: exactly one enrollment per `(course, user)` — enforced in `validate()`.
Permissions: `System Manager` / `LMS Manager` full; `All` read (scoped: users see only their own via `get_permission_query_conditions` + `has_permission`, mirroring `income_opportunity_claim`).

### 3.5 Course Lesson Progress (child of Course Enrollment)
| Field | Type | Notes |
|---|---|---|
| `lesson` | Link → Course Lesson | reqd |
| `completed_on` | Datetime | set on append |

Marking a lesson complete = append a row if `(lesson)` not already present, recompute `progress_pct` = done/total, and if 100% set `status=Completed` + mint points. Idempotent by row existence.

### 3.6 Point Ledger reuse (no new doctype)
- Add `Learning` to the existing `source` Select options.
- Add `course` (Link → Course, indexed) field.
Completion mints one ledger row `{user, source:"Learning", course, points_earned, point, credited_on}`, idempotent by `frappe.db.exists("Point Ledger", {"course": course, "user": user})`. Learning points are **not** added to the productivity leaderboard exclusion list, so they count on the board and in lifetime score/level/badges automatically (all derived live from Point Ledger).

---

## 4. Backend — `vernon_project/api/lms.py`

`MANAGE_ROLES = ("System Manager", "LMS Manager")`; `_can_manage(user)` / `_require_manage()` — same shape as `api/income.py`. Admin writes use `ignore_permissions=True` (API-level auth is the trust boundary).

### 4.1 Learner endpoints (logged-in; Guest rejected)
| Method | Signature | Behavior |
|---|---|---|
| `get_catalog` | `()` | Published courses + caller's enrollment status per course |
| `get_course` | `(name)` | Course + ordered lessons (with body/video/files) + caller's completed-lesson set + enrollment |
| `enroll` | `(course)` | Self-enroll: create `Course Enrollment` (`assigned=0`) if none exists; `user = session.user` |
| `complete_lesson` | `(course, lesson)` | Append progress row (idempotent) → recompute `progress_pct` → if all lessons done: `status=Completed`, `completed_on`, **mint points**; returns new progress |
| `my_learning` | `()` | Caller's enrollments (assigned + self) with status + computed overdue + due dates |

### 4.2 Admin endpoints (`_require_manage`)
| Method | Signature | Behavior |
|---|---|---|
| `manage_courses` | `()` | All courses (any status) + enrolled/completed counts |
| `save_course` | `(title, points_reward, status, name=None, category=None, summary=None, description=None, cover_image=None, estimated_minutes=None)` | Upsert Course |
| `save_lesson` | `(course, title, name=None, position=None, body=None, video_url=None, estimated_minutes=None, files=None)` | Upsert Course Lesson (+ replace `files` child rows) |
| `delete_lesson` | `(name)` | Delete a lesson |
| `delete_course` | `(name)` | Delete a course (+ its lessons/enrollments) |
| `assign_course` | `(course, users, due_date=None)` | For each user: create `Course Enrollment` (`assigned=1`, `assigned_by`, `due_date`) if none exists; `_notify(user, "Learning", ...)` |
| `course_report` | `(course)` | Per-user completion dashboard: enrollment list with status / progress / overdue |

### 4.3 Points mint (inside `complete_lesson`, mirrors the todo pattern)
```python
if not frappe.db.exists("Point Ledger", {"course": course, "user": user}):
    frappe.get_doc({
        "doctype": "Point Ledger",
        "user": user,
        "source": "Learning",
        "course": course,
        "points_earned": course_points,
        "point": course_points,
        "credited_on": now_datetime(),
    }).insert(ignore_permissions=True)
```

**Known simplification (ponytail):** if an admin adds a new lesson to an already-completed course, that course's `progress_pct` drops below 100 and it reverts to `In Progress`; the points already minted stay (the `exists` guard prevents double-mint, and it will not re-mint when re-completed). Acceptable — documented, not a bug. Upgrade path: version courses or snapshot lesson count at completion if this becomes a real problem.

---

## 5. Frontend (both apps)

Shared layer lives in `frontend/src` (alias `@`, consumed by both frontends):
- `lib/api.ts` → add `lmsApi` namespace (`const LMS = 'vernon_project.api.lms.'`) with one wrapper per endpoint above.
- `hooks/useData.ts` → React Query hooks (`useCatalog`, `useCourse`, `useMyLearning`, `useManageCourses`, mutations) + gate helper `canManageLms(boot)` (checks `System Manager` | `LMS Manager`).
- `lib/types.ts` → LMS response/entity types.

### 5.1 Mobile (`frontend/src/pages/`, `*Screen.tsx`, paper-* tokens)
- `LearnScreen.tsx` — tabs **Catalog** (published courses, self-enroll) + **My Learning** (my enrollments, assigned/overdue badges).
- `CourseScreen.tsx` — ordered lesson list, in-page lesson viewer (rich text + video embed + file downloads), **Mark complete** per lesson, course progress bar.
- `LmsAdminScreen.tsx` — Courses / Lessons editor, Assign sheet, Course report. Gated.
- Routes added to `frontend/src/App.tsx` (admin route wrapped in `canManageLms(boot)`).
- Menu entries in `frontend/src/pages/Profile.tsx` "Me": **Learn** → `/learn`; **Manage Learning** (gated) → `/learn-admin`.
- Home shortcut surfacing assigned/overdue count.

### 5.2 Web (`frontend-web/src/pages/`, `*.tsx`, semantic tokens + Page/Section/bento)
- `Learn.tsx`, `Course.tsx`, `LmsAdmin.tsx` (same responsibilities as mobile).
- Routes added to `frontend-web/src/App.tsx` under `<AppShell>` (admin gated).
- Nav entry in `frontend-web/src/lib/nav.ts` (label **Learn**, icon `BookOpen`) + section mapping in `AppShell.tsx` SECTION dict. Admin entry gated via `canManageLms`.

---

## 6. Role, notifications, scheduler

### 6.1 Role
`vernon_project/patches/v1_0/add_lms_manager_role.py` — idempotent create of `Role` `LMS Manager` (`desk_access=0`), registered in `patches.txt` under `[post_model_sync]`. Doctype JSON `permissions` arrays reference `LMS Manager` directly.

### 6.2 Notifications
Add `Learning` to the `type` Select options in `vernon_notification.json`. `assign_course` calls `_notify(user, "Learning", "Course assigned", ...)` (import `from vernon_project.api.mobile import _notify`).
**Gotcha (memory):** notification `type` must be a capitalized Select option present in the JSON or `_notify` silently swallows it. `Learning` is added to the options string.

### 6.3 Overdue nudge (scheduler)
`vernon_project/tasks.py` → `notify_overdue_courses()`: for each `Course Enrollment` where `assigned=1`, `status != Completed`, `due_date < today`, `_notify(user, "Learning", "Course overdue", ...)`. Registered under `scheduler_events["daily"]` in `hooks.py`. (ponytail: one nudge per overdue enrollment per day; add a dedupe/last-notified guard only if users complain of noise.)

---

## 7. Deploy (live site, code-first — no test DB)

1. `bench migrate` — installs the 5 doctypes, the new Point Ledger `course` field + `Learning` source option, the `Learning` notification type, and runs the `add_lms_manager_role` patch.
2. `bench restart` — loads new Python (`api/lms.py`, `tasks.py`, controllers).
3. `npm run build` in **both** `frontend/` and `frontend-web/`.

Never `git checkout` another branch in the live dir. Grant `LMS Manager` to the intended admin(s) after migrate. Admins must create + publish at least one course before learners see a catalog.

---

## 8. Testing

Per project convention (live site, tests deferred to a final phase): manual browser verification on `project.vernon.id` after deploy — create/publish a course as `LMS Manager`, self-enroll + complete as a member (assert points minted once, leaderboard reflects), assign a course + confirm notification + overdue nudge, verify admin dashboard counts. Automated tests (mirroring `test_events.py` / `test_report.py` patterns) added in the final testing phase, not Phase 1.

---

## 9. File manifest (Phase 1)

**New — backend**
- `vernon_project/vernon_project/doctype/course/{course.json,course.py,__init__.py}`
- `vernon_project/vernon_project/doctype/course_lesson/{...}`
- `vernon_project/vernon_project/doctype/course_lesson_file/{...}` (child)
- `vernon_project/vernon_project/doctype/course_enrollment/{...}`
- `vernon_project/vernon_project/doctype/course_lesson_progress/{...}` (child)
- `vernon_project/api/lms.py`
- `vernon_project/patches/v1_0/add_lms_manager_role.py`

**Edited — backend**
- `point_ledger.json` (+`course` field, +`Learning` source)
- `vernon_notification.json` (+`Learning` type)
- `tasks.py` (+`notify_overdue_courses`)
- `hooks.py` (+scheduler entry)
- `patches.txt` (+role patch)

**New — frontend**
- `frontend/src/pages/{LearnScreen,CourseScreen,LmsAdminScreen}.tsx`
- `frontend-web/src/pages/{Learn,Course,LmsAdmin}.tsx`

**Edited — frontend**
- `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`, `frontend/src/lib/types.ts`
- `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx`
- `frontend-web/src/App.tsx`, `frontend-web/src/lib/nav.ts`, `frontend-web/src/components/AppShell.tsx`
