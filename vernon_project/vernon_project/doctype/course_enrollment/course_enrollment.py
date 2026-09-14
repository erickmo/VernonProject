import frappe
from frappe.model.document import Document


class CourseEnrollment(Document):
	def validate(self):
		# One enrollment per (course, user). A plain read, so it races (and under
		# REPEATABLE READ it can answer from a snapshot older than the other
		# request's commit) — on_doctype_update's unique index is the real backstop.
		dupe = frappe.db.exists(
			"Course Enrollment",
			{"course": self.course, "user": self.user, "name": ("!=", self.name)},
		)
		if dupe:
			frappe.throw("Already enrolled in this course.")


def on_doctype_update():
	# One enrollment per (course, user). validate() checks then inserts, and that
	# races: two concurrent calls both find nothing and both insert, leaving a
	# learner with two progress rows on one course. The unique index is the real
	# backstop — isolation-independent, and it covers every write path (enroll,
	# complete_lesson's implicit enrollment, assign_course) rather than one endpoint.
	#
	# Declared here so FRESH INSTALLS index automatically (patches are skipped on
	# install); patches/v1_0/course_enrollment_unique_index is the other half, so
	# existing sites pick it up on migrate. add_unique is idempotent.
	frappe.db.add_unique(
		"Course Enrollment", ["course", "user"], constraint_name="unique_enrollment_per_course"
	)


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user) or "LMS Manager" in frappe.get_roles(user):
		return ""
	return f"(`tabCourse Enrollment`.`user` = {frappe.db.escape(user)})"


def has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user) or "LMS Manager" in frappe.get_roles(user):
		return True
	return doc.user == user
