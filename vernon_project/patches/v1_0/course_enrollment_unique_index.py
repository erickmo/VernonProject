import frappe

# Existing-site half of the index the LMS enrollment-race fix needs.
# on_doctype_update() only re-runs when a doctype is re-synced, and patches are
# skipped on fresh installs -- so the index is declared in both places. Both are
# idempotent.


def execute():
	# Backstop for the duplicate-enrollment race in api/lms.py (enroll,
	# complete_lesson's implicit enrollment, assign_course) and for
	# CourseEnrollment.validate's check-then-insert.
	# Checked against live data before shipping: 0 Course Enrollment rows, hence 0
	# duplicate (course, user) groups, so the constraint applies cleanly. If a future
	# site IS dirty this raises rather than silently skipping -- dedupe (keep the row
	# with the most lessons_done), then re-run.
	frappe.db.add_unique(
		"Course Enrollment", ["course", "user"], constraint_name="unique_enrollment_per_course"
	)
