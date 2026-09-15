import json

import frappe
from frappe.utils import now_datetime, today

from vernon_project.api.mobile import _notify

MANAGE_ROLES = ("System Manager", "LMS Manager")


def _can_manage(user=None):
	user = user or frappe.session.user
	roles = set(frappe.get_roles(user))
	return any(r in roles for r in MANAGE_ROLES)


def _require_manage():
	if not _can_manage():
		frappe.throw("Not permitted", frappe.PermissionError)


def _require_login():
	if frappe.session.user == "Guest":
		frappe.throw("Login required", frappe.PermissionError)


def _lesson_count(course):
	return frappe.db.count("Course Lesson", {"course": course})


def _enrollment(course, user):
	name = frappe.db.exists("Course Enrollment", {"course": course, "user": user})
	return frappe.get_doc("Course Enrollment", name) if name else None


def _recompute(enr, course_points=None):
	"""Recompute progress_pct/status; mint points on first 100%. Returns points awarded."""
	total = _lesson_count(enr.course)
	done = len(enr.lessons_done or [])
	enr.progress_pct = round(100.0 * done / total, 1) if total else 0.0
	awarded = 0.0
	if total and done >= total:
		if enr.status != "Completed":
			enr.status = "Completed"
			enr.completed_on = now_datetime()
		awarded = _mint_points(enr.course, enr.user, course_points)
	elif done > 0:
		enr.status = "In Progress"
	else:
		enr.status = "Assigned" if enr.assigned else "In Progress"
	return awarded


def _mint_points(course, user, course_points=None):
	# Locking read, not frappe.db.exists: under REPEATABLE READ a plain read returns
	# this request's old snapshot, so a completion committed by a concurrent request
	# (a double-tap on the last lesson) was invisible and the course paid out twice.
	# complete_lesson's get_lock can't fix that; it is released before commit.
	if frappe.db.sql(
		"select name from `tabPoint Ledger` where course = %s and user = %s limit 1 for update",
		(course, user),
	):
		return 0.0
	if course_points is None:
		course_points = frappe.db.get_value("Course", course, "points_reward") or 0
	course_points = float(course_points)
	if course_points <= 0:
		return 0.0
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": user,
		"source": "Learning",
		"course": course,
		"points_earned": course_points,
		"point": course_points,
		"credited_on": now_datetime(),
	}).insert(ignore_permissions=True)
	return course_points


def _effective_status(enr, ref_today):
	if enr.status != "Completed" and enr.assigned and enr.due_date and str(enr.due_date) < ref_today:
		return enr.status, True
	return enr.status, False


@frappe.whitelist()
def get_catalog():
	"""The published course catalogue, with the caller's own progress on each.

	Any logged-in user; Guest gets frappe.PermissionError. Takes no arguments. Only
	Published courses appear — Draft and Archived ones are invisible here even to an
	LMS Manager, who sees them through `manage_courses`.

	Returns `{"courses": [...]}` ordered by modified desc. Each card carries the
	course fields plus `lesson_count`, and the caller's own `my_status`
	("Assigned" / "In Progress" / "Completed", or null when not enrolled) and
	`my_progress` (percent, 0.0 when not enrolled)."""
	_require_login()
	user = frappe.session.user
	rows = frappe.get_all(
		"Course",
		filters={"status": "Published"},
		fields=["name", "title", "category", "summary", "cover_image", "points_reward", "estimated_minutes"],
		order_by="modified desc",
	)
	for c in rows:
		c["lesson_count"] = _lesson_count(c["name"])
		enr = _enrollment(c["name"], user)
		c["my_status"] = enr.status if enr else None
		c["my_progress"] = enr.progress_pct if enr else 0.0
	return {"courses": rows}


@frappe.whitelist()
def get_course(name):
	"""One course with its ordered lessons and the caller's enrollment.

	Any logged-in user for a Published course; Guest gets frappe.PermissionError.
	`name` is the Course document name. An unknown course raises a plain
	frappe.ValidationError ("Course not found"), while a real but unpublished one
	(Draft/Archived) raises frappe.PermissionError unless the caller holds System
	Manager or LMS Manager — so the two failures are distinguishable.

	Returns `{"course": {...}, "lessons": [...], "enrollment": {...} | null}`.
	Lessons come back in `position` order with their body, video_url, attached
	`files`, and a per-lesson `done` flag reflecting THIS caller's progress.
	`enrollment` is null when the caller has never enrolled — that is the normal
	state for browsing, not an error."""
	_require_login()
	user = frappe.session.user
	course = frappe.db.get_value(
		"Course", name,
		["name", "title", "category", "summary", "description", "cover_image", "points_reward", "estimated_minutes", "status"],
		as_dict=True,
	)
	if not course:
		frappe.throw("Course not found")
	if course.status != "Published" and not _can_manage():
		frappe.throw("Not permitted", frappe.PermissionError)
	lessons = frappe.get_all(
		"Course Lesson",
		filters={"course": name},
		fields=["name", "title", "position", "body", "video_url", "estimated_minutes"],
		order_by="position asc",
	)
	enr = _enrollment(name, user)
	done = {r.lesson for r in enr.lessons_done} if enr else set()
	for ls in lessons:
		ls["files"] = frappe.get_all(
			"Course Lesson File", filters={"parent": ls["name"]},
			fields=["file", "label"], order_by="idx asc",
		)
		ls["done"] = ls["name"] in done
	enrollment = None
	if enr:
		enrollment = {
			"name": enr.name, "assigned": enr.assigned, "due_date": enr.due_date,
			"status": enr.status, "progress_pct": enr.progress_pct, "completed_on": enr.completed_on,
		}
	return {"course": course, "lessons": lessons, "enrollment": enrollment}


@frappe.whitelist()
def enroll(course):
	"""Serialized per user on the same lock complete_lesson takes, held across a
	whole transaction — see complete_lesson for why releasing before commit let a
	second call read "not enrolled" from a stale snapshot and insert a duplicate."""
	_require_login()
	user = frappe.session.user
	if frappe.db.get_value("Course", course, "status") != "Published":
		frappe.throw("Course not available")
	lock_key = f"vernon_lms:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		frappe.db.commit()  # fresh snapshot: see any enrollment committed before we got the lock
		existing = _enrollment(course, user)
		if existing:
			return {"ok": True, "name": existing.name}
		doc = frappe.get_doc({
			"doctype": "Course Enrollment", "course": course, "user": user,
			"assigned": 0, "status": "In Progress",
		}).insert(ignore_permissions=True)
		frappe.db.commit()  # before release_lock, so the next caller sees this enrollment
		return {"ok": True, "name": doc.name}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


@frappe.whitelist()
def complete_lesson(course, lesson):
	"""Row-locked (see mobile.py's vernon_spend/vernon_gami pattern): without a
	lock, two concurrent calls for the same last lesson of a course can both
	pass _mint_points' `frappe.db.exists("Point Ledger", ...)` check before
	either has inserted, minting points twice for one completion -- confirmed
	live (6gb7lcr41q-adjacent concurrency probe, 2026-09-10): 1 double-mint in
	8 genuinely-concurrent trials, the other 7 either deadlocked or hit a
	TimestampMismatchError on enr.save() -- so even short of a double-mint,
	the endpoint was unreliable under ordinary double-tap/retry concurrency.

	The lock spans a whole transaction (same as open_task_crate): commit right
	after taking it so every read below is a fresh snapshot, and commit before
	releasing it so the next caller sees these rows. Releasing before commit left
	the IMPLICIT enrollment below racing -- a second call reading its pre-commit
	snapshot found no enrollment and inserted a duplicate for the same
	(course, user), which nothing in the schema forbids.

	ponytail: assign_course creates enrollments without this lock, so an admin
	assignment racing a self-enrol can still duplicate. The unique index on
	(course, user) is the backstop that covers every path -- see
	patches/v1_0/course_enrollment_unique_index.py, which binds on migrate."""
	_require_login()
	user = frappe.session.user
	if frappe.db.get_value("Course Lesson", lesson, "course") != course:
		frappe.throw("Lesson does not belong to course")
	lock_key = f"vernon_lms:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		frappe.db.commit()  # fresh snapshot: see any completion committed before we got the lock
		enr = _enrollment(course, user)
		if not enr:
			# Enrolling yourself here has to answer to the same gate as enroll():
			# Course and Course Lesson are readable by role "All", so an unpublished
			# course's name, lessons and points_reward are all listable, and without
			# this a draft course could be completed and paid out before it ships.
			# Only the IMPLICIT path is gated -- an enrollment that already exists
			# keeps working, so unpublishing a course mid-flight strands nobody, and
			# assign_course stays deliberately status-agnostic.
			if frappe.db.get_value("Course", course, "status") != "Published":
				frappe.throw("Course not available")
			enr = frappe.get_doc({
				"doctype": "Course Enrollment", "course": course, "user": user,
				"assigned": 0, "status": "In Progress",
			})
			enr.insert(ignore_permissions=True)
		if not any(r.lesson == lesson for r in enr.lessons_done):
			enr.append("lessons_done", {"lesson": lesson, "completed_on": now_datetime()})
		awarded = _recompute(enr)
		enr.save(ignore_permissions=True)
		frappe.db.commit()  # before release_lock, so the next call sees this enrollment
		return {
			"ok": True, "progress_pct": enr.progress_pct,
			"completed": enr.status == "Completed", "points_awarded": awarded,
		}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


@frappe.whitelist()
def my_learning():
	"""The caller's own course enrollments, most recently touched first.

	Any logged-in user; Guest gets frappe.PermissionError. Takes no arguments and is
	always frappe.session.user's own — there is no argument for reading someone
	else's progress (`course_report` is the manager view, per course).

	Returns `{"enrollments": [...]}`, each with course, `course_title`, status
	("Assigned" / "In Progress" / "Completed"), progress_pct, due_date, completed_on,
	the `assigned` flag, and a computed `overdue`. Note `overdue` is true only for
	an ASSIGNED, not-yet-Completed course past its due date: a self-enrolled course
	is never marked overdue no matter how old its due date."""
	_require_login()
	user = frappe.session.user
	ref_today = today()
	rows = frappe.get_all(
		"Course Enrollment", filters={"user": user},
		fields=["name", "course", "assigned", "due_date", "status", "progress_pct", "completed_on"],
		order_by="modified desc",
	)
	out = []
	for r in rows:
		overdue = bool(r.status != "Completed" and r.assigned and r.due_date and str(r.due_date) < ref_today)
		out.append({
			**r,
			"course_title": frappe.db.get_value("Course", r.course, "title"),
			"overdue": overdue,
		})
	return {"enrollments": out}


# ── Admin endpoints ────────────────────────────────────────────────────────────

@frappe.whitelist()
def manage_courses():
	"""Every course in any status, with enrollment counts, for the LMS console.

	Gate: System Manager or LMS Manager; anyone else gets frappe.PermissionError.
	Takes no arguments.

	This is the counterpart to `get_catalog`: Draft and Archived courses are
	included here. Returns `{"courses": [...]}` ordered by modified desc, each with
	`lesson_count`, `enrolled` (total enrollments) and `completed`. Note these
	counts are over ALL enrollments ever created, so `enrolled` does not shrink when
	someone finishes — `completed` is a subset of it, not a separate group."""
	_require_manage()
	rows = frappe.get_all(
		"Course",
		fields=["name", "title", "category", "status", "points_reward"],
		order_by="modified desc",
	)
	for c in rows:
		c["lesson_count"] = _lesson_count(c["name"])
		c["enrolled"] = frappe.db.count("Course Enrollment", {"course": c["name"]})
		c["completed"] = frappe.db.count("Course Enrollment", {"course": c["name"], "status": "Completed"})
	return {"courses": rows}


@frappe.whitelist()
def save_course(title, points_reward, status, name=None, category=None, summary=None,
                description=None, cover_image=None, estimated_minutes=None):
	"""Create or update a Course.

	Gated by `_require_manage()` (System Manager or LMS Manager). `name` omitted
	creates a new course, otherwise it edits that one. The required fields (title,
	points_reward, status) are always written; optional fields (category, summary,
	description, cover_image, estimated_minutes) only when the caller sends a value, so
	a partial edit (e.g. a status toggle) never blanks existing data.

	Returns `{"ok": True, "name"}`.
	"""
	_require_manage()
	# ponytail: required fields always written; optional only when caller sent a value — prevents
	# blanking existing data when the edit form omits a field (e.g. quick status toggle).
	values = {"title": title, "points_reward": points_reward, "status": status}
	for k, v in {"category": category, "summary": summary, "description": description,
	             "cover_image": cover_image, "estimated_minutes": estimated_minutes}.items():
		if v is not None:
			values[k] = v
	if name:
		doc = frappe.get_doc("Course", name)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Course", **values})
		doc.insert(ignore_permissions=True)
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def save_lesson(course, title, name=None, position=None, body=None, video_url=None,
                estimated_minutes=None, files=None):
	"""Create or update a Course Lesson, including its attached files.

	Gated by `_require_manage()` (System Manager or LMS Manager). `name` omitted
	creates a new lesson, otherwise it edits that one. `files` (a list, or a JSON
	string of one, of `{file, label}`) REPLACES the lesson's file rows.

	`course` is the parent Course id. Returns `{"ok": True, "name"}`.
	"""
	_require_manage()
	file_rows = json.loads(files) if isinstance(files, str) else (files or [])
	values = {
		"course": course, "title": title, "position": position or 0, "body": body,
		"video_url": video_url, "estimated_minutes": estimated_minutes,
	}
	if name:
		doc = frappe.get_doc("Course Lesson", name)
		doc.update(values)
	else:
		doc = frappe.get_doc({"doctype": "Course Lesson", **values})
	doc.set("files", [])
	for f in file_rows:
		doc.append("files", {"file": f.get("file"), "label": f.get("label")})
	doc.save(ignore_permissions=True) if name else doc.insert(ignore_permissions=True)
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def delete_lesson(name):
	"""Delete a Course Lesson.

	Gated by `_require_manage()` (System Manager or LMS Manager). `name` is the Course
	Lesson id. Returns `{"ok": True}`.
	"""
	_require_manage()
	frappe.delete_doc("Course Lesson", name, ignore_permissions=True, force=1)
	return {"ok": True}


@frappe.whitelist()
def delete_course(name):
	"""Delete a Course and everything under it.

	Gated by `_require_manage()` (System Manager or LMS Manager). Cascade: removes the
	course's Lessons and all its Course Enrollments (learner progress included), then
	the Course itself. `name` is the Course id. Returns `{"ok": True}`.
	"""
	_require_manage()
	for ls in frappe.get_all("Course Lesson", filters={"course": name}, pluck="name"):
		frappe.delete_doc("Course Lesson", ls, ignore_permissions=True, force=1)
	for enr in frappe.get_all("Course Enrollment", filters={"course": name}, pluck="name"):
		frappe.delete_doc("Course Enrollment", enr, ignore_permissions=True, force=1)
	frappe.delete_doc("Course", name, ignore_permissions=True, force=1)
	return {"ok": True}


@frappe.whitelist()
def assign_course(course, users, due_date=None):
	"""Assign a Course to one or more users, enrolling and notifying each.

	Gated by `_require_manage()` (System Manager or LMS Manager). `users` is a list (or
	JSON string of one) of user ids; a user already enrolled is skipped, so re-assigning
	is safe. Each new enrollment is marked assigned (with `assigned_by`/`due_date`) and
	the learner is notified.

	Returns `{"ok": True, "created"}` — how many new enrollments were made.
	"""
	_require_manage()
	user_list = json.loads(users) if isinstance(users, str) else users
	title = frappe.db.get_value("Course", course, "title")
	actor = frappe.session.user
	created = 0
	for u in user_list:
		if _enrollment(course, u):
			continue
		frappe.get_doc({
			"doctype": "Course Enrollment", "course": course, "user": u,
			"assigned": 1, "assigned_by": actor, "due_date": due_date, "status": "Assigned",
		}).insert(ignore_permissions=True)
		created += 1
		body = f'You have been assigned the course “{title}”.'
		if due_date:
			body += f" Due {due_date}."
		_notify(u, "Learning", "Course assigned", body, "Course", course, actor)
	return {"ok": True, "created": created}


@frappe.whitelist()
def course_report(course):
	"""Per-learner progress on ONE course, for the LMS console.

	Gate: System Manager or LMS Manager; anyone else gets frappe.PermissionError.
	`course` is the Course document name and is required.

	Returns `{"course_title": ..., "rows": [...]}` ordered by status then user, each
	row carrying user, `user_name`, the `assigned` flag, due_date, status,
	progress_pct, completed_on and a computed `overdue` (assigned-only, same rule as
	`my_learning`). Rows are enrollments, so someone who never enrolled does not
	appear at all — an empty report is "nobody enrolled", not "nobody started".

	An unknown course name is not rejected: it returns a null course_title and no
	rows."""
	_require_manage()
	ref_today = today()
	rows = frappe.get_all(
		"Course Enrollment", filters={"course": course},
		fields=["user", "assigned", "due_date", "status", "progress_pct", "completed_on"],
		order_by="status asc, user asc",
	)
	for r in rows:
		r["user_name"] = frappe.db.get_value("User", r.user, "full_name")
		r["overdue"] = bool(r.status != "Completed" and r.assigned and r.due_date and str(r.due_date) < ref_today)
	return {"course_title": frappe.db.get_value("Course", course, "title"), "rows": rows}


@frappe.whitelist()
def list_assignable_users():
	"""Users an LMS manager may assign a course to, for the assignee picker.

	Gate: System Manager or LMS Manager; anyone else gets frappe.PermissionError.
	Takes no arguments and is not searchable — it returns the whole list, ordered by
	full_name, with no paging.

	Scope is every ENABLED User except the protected system accounts (the
	PROTECTED_USERS set shared with the mobile API). It is not scoped to a project,
	a team or a brand, so this is the full staff list.

	Returns `{"users": [{"name", "full_name"}]}`."""
	_require_manage()
	from vernon_project.api.mobile import PROTECTED_USERS
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", list(PROTECTED_USERS)], "enabled": 1},
		fields=["name", "full_name"],
		order_by="full_name asc",
		limit_page_length=0,
	)
	return {"users": users}
