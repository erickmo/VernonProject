app_name = "vernon_project"
app_title = "Vernon Project"
app_publisher = "Vernon"
app_description = "Project management"
app_email = "help@vernon.id"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "vernon_project",
# 		"logo": "/assets/vernon_project/logo.png",
# 		"title": "Vernon Project",
# 		"route": "/vernon_project",
# 		"has_permission": "vernon_project.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/vernon_project/css/vernon_project.css"
app_include_js = "/assets/vernon_project/js/desk_navbar.js"

# Website
# -------
# The docs in apps/vernon_project/docs are NOT served from public/. A symlink
# (public/docs -> ../../docs) used to expose them at /assets/vernon_project/docs/,
# but nginx serves /assets as static files, so Frappe auth never runs on that path
# and the whole docs tree — including docs/superpowers/ internal design specs — was
# world-readable. Symlink and redirect both removed; www/docs.py now serves /docs
# to logged-in users only. Do not re-add a symlink or anything under public/.
website_redirects = [
	# Desktop app moved /web -> /w; keep old links working (preserve sub-path).
	{"source": r"/web/(.*)", "target": r"/w/\1"},
	{"source": r"/web/?$", "target": "/w"},
]

# SPA shells (React) — mobile PWA at /m, desktop at /w. The build copies each
# index.html to www/m.html and www/w.html; these rules route every /m/* and /w/*
# path back to its page so client-side routing (React Router) works on deep links
# and refreshes.
website_route_rules = [
	{"from_route": "/m/<path:app_path>", "to_route": "m"},
	{"from_route": "/w/<path:app_path>", "to_route": "w"},
	# Login-gated docs. Unlike /m and /w there is no www/docs.html: TemplatePage needs a
	# Jinja template and cannot emit raw .css/.js/.md bytes, so the DocsPage renderer below
	# serves the files. This rule only parks the sub-path in form_dict.app_path.
	{"from_route": "/docs/<path:app_path>", "to_route": "docs"},
]

# Custom renderers are tried before frappe's built-ins, so DocsPage owns /docs and can
# enforce the Guest check that /assets never could. See www/docs.py.
page_renderer = ["vernon_project.www.docs.DocsPage"]

# include js, css files in header of web template
# web_include_css = "/assets/vernon_project/css/vernon_project.css"
# web_include_js = "/assets/vernon_project/js/vernon_project.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "vernon_project/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "vernon_project/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "vernon_project.utils.jinja_methods",
# 	"filters": "vernon_project.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "vernon_project.install.before_install"
# after_install = "vernon_project.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "vernon_project.uninstall.before_uninstall"
# after_uninstall = "vernon_project.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "vernon_project.utils.before_app_install"
# after_app_install = "vernon_project.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "vernon_project.utils.before_app_uninstall"
# after_app_uninstall = "vernon_project.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "vernon_project.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"Project": "vernon_project.vernon_project.doctype.project.project.get_permission_query_conditions",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.get_permission_query_conditions",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.get_permission_query_conditions",
	"Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.get_permission_query_conditions",
	"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.get_permission_query_conditions",
	"Meeting": "vernon_project.vernon_project.doctype.meeting.meeting.get_permission_query_conditions",
	"Resource Booking": "vernon_project.vernon_project.doctype.resource_booking.resource_booking.get_permission_query_conditions",
	"Employee Profile": "vernon_project.vernon_project.doctype.employee_profile.employee_profile.get_permission_query_conditions",
	"Income Opportunity Claim": "vernon_project.vernon_project.doctype.income_opportunity_claim.income_opportunity_claim.get_permission_query_conditions",
	"Course Enrollment": "vernon_project.vernon_project.doctype.course_enrollment.course_enrollment.get_permission_query_conditions",
}

has_permission = {
	"Project": "vernon_project.vernon_project.doctype.project.project.has_permission",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.has_permission",
	"Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.has_permission",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.has_permission",
	"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.has_permission",
	"Meeting": "vernon_project.vernon_project.doctype.meeting.meeting.has_permission",
	"Resource Booking": "vernon_project.vernon_project.doctype.resource_booking.resource_booking.has_permission",
	"Employee Profile": "vernon_project.vernon_project.doctype.employee_profile.employee_profile.has_permission",
	"Income Opportunity Claim": "vernon_project.vernon_project.doctype.income_opportunity_claim.income_opportunity_claim.has_permission",
	"Course Enrollment": "vernon_project.vernon_project.doctype.course_enrollment.course_enrollment.has_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Shift Assignment": {
		"on_update": "vernon_project.attendance.triggers.shift_assignment_changed",
		"on_trash": "vernon_project.attendance.triggers.shift_assignment_changed",
	},
	"Attendance Exception": {
		"on_update": "vernon_project.attendance.triggers.exception_changed",
		"on_trash": "vernon_project.attendance.triggers.exception_trashed",
	},
	"Attendance Holiday List": {
		"on_update": "vernon_project.attendance.triggers.holiday_list_changed",
	},
	"Brand": {
		"on_update": "vernon_project.attendance.triggers.brand_changed",
	},
	"Employee Profile": {
		"after_insert": "vernon_project.attendance.cuti_ledger.grant_on_profile_create",
	},
	"User": {
		"on_update": "vernon_project.user_offboarding.transfer_open_todos_on_disable",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"vernon_project.tasks.create_recurring_todos",
		"vernon_project.tasks.notify_due_todos",
		"vernon_project.tasks.notify_comeback_nudge",
		"vernon_project.attendance.engine.nightly_finalize",
		"vernon_project.tasks.notify_overdue_courses",
		"vernon_project.api.superpowers.notify_recognition_gate",
	],
	# Jan 1, 01:00 — mint every employee's annual cuti Grant row for the new year.
	"cron": {
		"0 1 1 1 *": [
			"vernon_project.attendance.cuti_ledger.grant_annual_cuti",
		],
	},
}

# Testing
# -------

# before_tests = "vernon_project.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "vernon_project.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "vernon_project.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["vernon_project.utils.before_request"]
# Stop browsers heuristically caching the /m and /w SPA shells (they reference
# content-hashed assets deleted on each build → blank page until manual refresh).
after_request = ["vernon_project.website.no_store_spa_shell"]

# Job Events
# ----------
# before_job = ["vernon_project.utils.before_job"]
# after_job = ["vernon_project.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"vernon_project.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

