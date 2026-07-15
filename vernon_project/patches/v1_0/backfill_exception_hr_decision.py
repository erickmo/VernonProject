import frappe


def execute():
	"""Seed hr_decision from the pre-HR parent status.

	Before HR existed, `status` was the unanimous-leader verdict and was the
	whole truth. Now `status` mirrors `hr_decision`, so any historical row left
	at the Pending default would derive back to Pending on its next save and
	silently un-excuse attendance days that were legitimately excused.
	Idempotent: only touches rows still out of sync.
	"""
	frappe.db.sql(
		"""
		UPDATE `tabAttendance Exception`
		SET hr_decision = status
		WHERE hr_decision IS NULL OR hr_decision != status
		"""
	)
	frappe.db.commit()
