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
	if frappe.db.exists("Point Ledger", {"course": course, "user": user}):
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
	_require_login()
	user = frappe.session.user
	if frappe.db.get_value("Course", course, "status") != "Published":
		frappe.throw("Course not available")
	existing = _enrollment(course, user)
	if existing:
		return {"ok": True, "name": existing.name}
	doc = frappe.get_doc({
		"doctype": "Course Enrollment", "course": course, "user": user,
		"assigned": 0, "status": "In Progress",
	}).insert(ignore_permissions=True)
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def complete_lesson(course, lesson):
	_require_login()
	user = frappe.session.user
	if frappe.db.get_value("Course Lesson", lesson, "course") != course:
		frappe.throw("Lesson does not belong to course")
	enr = _enrollment(course, user)
	if not enr:
		enr = frappe.get_doc({
			"doctype": "Course Enrollment", "course": course, "user": user,
			"assigned": 0, "status": "In Progress",
		})
		enr.insert(ignore_permissions=True)
	if not any(r.lesson == lesson for r in enr.lessons_done):
		enr.append("lessons_done", {"lesson": lesson, "completed_on": now_datetime()})
	awarded = _recompute(enr)
	enr.save(ignore_permissions=True)
	return {
		"ok": True, "progress_pct": enr.progress_pct,
		"completed": enr.status == "Completed", "points_awarded": awarded,
	}


@frappe.whitelist()
def my_learning():
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
	_require_manage()
	values = {
		"title": title, "points_reward": points_reward, "status": status,
		"category": category, "summary": summary, "description": description,
		"cover_image": cover_image, "estimated_minutes": estimated_minutes,
	}
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
	_require_manage()
	frappe.delete_doc("Course Lesson", name, ignore_permissions=True, force=1)
	return {"ok": True}


@frappe.whitelist()
def delete_course(name):
	_require_manage()
	for ls in frappe.get_all("Course Lesson", filters={"course": name}, pluck="name"):
		frappe.delete_doc("Course Lesson", ls, ignore_permissions=True, force=1)
	for enr in frappe.get_all("Course Enrollment", filters={"course": name}, pluck="name"):
		frappe.delete_doc("Course Enrollment", enr, ignore_permissions=True, force=1)
	frappe.delete_doc("Course", name, ignore_permissions=True, force=1)
	return {"ok": True}


@frappe.whitelist()
def assign_course(course, users, due_date=None):
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
