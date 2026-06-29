import frappe
from frappe.tests.utils import FrappeTestCase


class TestAvatarGamificationSettings(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_save_drops_invalid_asset(self):
		from vernon_project.api.mobile import save_gamification_settings, get_gamification_settings
		import json
		save_gamification_settings(achievements=json.dumps([
			{"code": "t1", "title": "T", "icon": "⭐", "condition": "todos_completed",
			 "threshold": 5, "reward_points": 1, "reward_asset": "NoSuchAsset", "is_tier": 0, "color": ""}]))
		rows = get_gamification_settings()["achievements"]
		r = [a for a in rows if a["code"] == "t1"][0]
		self.assertIn(r["reward_asset"], (None, ""))

	def test_save_drops_incomplete_row(self):
		from vernon_project.api.mobile import save_gamification_settings, get_gamification_settings
		import json
		save_gamification_settings(achievements=json.dumps([
			{"code": "keep", "title": "Keep", "icon": "⭐", "condition": "todos_completed",
			 "threshold": 5, "reward_points": 1, "reward_asset": "", "is_tier": 0, "color": ""},
			{"code": "", "title": "", "icon": "", "condition": "", "threshold": 0,
			 "reward_points": 0, "reward_asset": "", "is_tier": 0, "color": ""}]))
		codes = [a["code"] for a in get_gamification_settings()["achievements"]]
		self.assertIn("keep", codes)
		self.assertNotIn("", codes)
