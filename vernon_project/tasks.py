# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate, nowdate


def create_recurring_todos():
	"""
	Scheduled task (daily) to roll recurring todos forward.

	Policy: when a recurring todo's `next_occurrence` date has arrived, create the
	next occurrence **regardless of whether the current one is done**, so the
	cadence never stalls. The current todo, if not completed, simply remains open
	and is surfaced as a "missed" past occurrence (derived from the series, since a
	newer occurrence now exists). After spawning, the head's `next_occurrence` is
	cleared so it is processed exactly once; the new occurrence becomes the head.
	"""
	today = nowdate()

	heads = frappe.db.sql("""
		SELECT
			pt.name, pt.parent, pt.to_do, pt.assigned_to, pt.deadline, pt.estimated,
			pt.notes, pt.recurring_frequency, pt.recurring_until, pt.next_occurrence,
			pt.original_todo, pt.status
		FROM `tabProject Todo` pt
		WHERE pt.is_recurring = 1
		AND pt.recurring_frequency IS NOT NULL
		AND pt.recurring_frequency != ''
		AND pt.next_occurrence IS NOT NULL
		AND pt.next_occurrence <= %s
	""", (today,), as_dict=True)

	created_count = 0

	for h in heads:
		try:
			parent_doc = frappe.get_doc("Project Detail", h.parent)
			head_row = next((t for t in parent_doc.todo if t.name == h.name), None)
			if not head_row:
				continue

			next_date = h.next_occurrence

			# Past the recurrence end date: stop the series.
			if h.recurring_until and getdate(next_date) > getdate(h.recurring_until):
				head_row.next_occurrence = None
				parent_doc.save(ignore_permissions=True)
				continue

			# Skip if the next occurrence already exists (idempotent / dedup).
			exists = frappe.db.exists("Project Todo", {
				"parent": h.parent,
				"to_do": h.to_do,
				"deadline": next_date,
				"assigned_to": h.assigned_to,
			})

			if not exists:
				following = head_row.calculate_next_occurrence(next_date)
				parent_doc.append("todo", {
					"to_do": h.to_do,
					"assigned_to": h.assigned_to,
					"deadline": next_date,
					"estimated": h.estimated,
					"notes": h.notes,
					"is_recurring": 1,
					"recurring_frequency": h.recurring_frequency,
					"recurring_until": h.recurring_until,
					"next_occurrence": following,
					"original_todo": h.original_todo or h.name,
					"status": "⚪️ Planned",
				})
				created_count += 1

			# Mark the head as processed so it never spawns again.
			head_row.next_occurrence = None
			parent_doc.save(ignore_permissions=True)

		except Exception as e:
			frappe.log_error(f"Error creating recurring todo: {str(e)}", "Recurring Todo Error")
			continue

	if created_count > 0:
		frappe.db.commit()
		frappe.logger().info(f"Created {created_count} recurring todos")

	return created_count
