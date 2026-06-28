import frappe


def execute():
	from vernon_project.api.mobile import seed_avatar_assets
	seed_avatar_assets()
