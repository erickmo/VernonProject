import frappe
from frappe.model.document import Document


class CourseEnrollment(Document):
	def validate(self):
		# One enrollment per (course, user).
		dupe = frappe.db.exists(
			"Course Enrollment",
			{"course": self.course, "user": self.user, "name": ("!=", self.name)},
		)
		if dupe:
			frappe.throw("Already enrolled in this course.")


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
