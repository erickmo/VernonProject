import frappe


def execute():
	from vernon_project.api.mobile import seed_gamification_settings
	seed_gamification_settings()
