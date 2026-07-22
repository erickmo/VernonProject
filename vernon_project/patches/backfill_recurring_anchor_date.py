# Copyright (c) 2026, Vernon and contributors
# One-time: seed recurring_anchor_date = deadline for existing recurring todos, so the
# next-occurrence math (which now uses the anchor date as its rule basis) matches the
# pre-exception behavior. New occurrences set the anchor themselves in build_occurrence.
import frappe


def execute():
	frappe.db.sql(
		"""
		UPDATE `tabProject Todo`
		SET recurring_anchor_date = deadline
		WHERE is_recurring = 1
		  AND (recurring_anchor_date IS NULL OR recurring_anchor_date = '')
		  AND deadline IS NOT NULL
		"""
	)
