"""be86ciu75f: warn System Managers when no scheduled job has run for an hour, and let
them turn the scheduler back on. Runs against the live site, so nothing here may page
a real person or flip the real flag: _notify, enable_scheduler and the Redis keys are
all patched to test-only doubles."""
import unittest
from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.utils import now_datetime

import vernon_project.api.scheduler_health as sh
from vernon_project.tests.no_leak import NoLeakMixin

TEST_KEYS = {"_HEALTH_KEY": "vp_test_sched_health", "_NOTIFIED_KEY": "vp_test_sched_notified"}


PLAIN = "sched-health-plain@example.com"


class TestSchedulerHealth(NoLeakMixin, unittest.TestCase):
	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Employee Profile", filters={"user": PLAIN}, pluck="name"):
			frappe.delete_doc("Employee Profile", name, force=True, ignore_permissions=True)
		if frappe.db.exists("User", PLAIN):
			frappe.delete_doc("User", PLAIN, force=True, ignore_permissions=True)
		frappe.db.commit()

	def setUp(self):
		frappe.set_user("Administrator")
		self.keys = [patch.object(sh, k, v) for k, v in TEST_KEYS.items()]
		for p in self.keys:
			p.start()
		frappe.cache.delete_value(list(TEST_KEYS.values()))
		frappe.cache.delete(frappe.cache.make_key(TEST_KEYS["_NOTIFIED_KEY"]))
		self.sent = []
		self.notify = patch("vernon_project.api.mobile._notify", side_effect=lambda **kw: self.sent.append(kw))
		self.notify.start()

	def tearDown(self):
		self.notify.stop()
		frappe.cache.delete_value(list(TEST_KEYS.values()))
		frappe.cache.delete(frappe.cache.make_key(TEST_KEYS["_NOTIFIED_KEY"]))
		for p in self.keys:
			p.stop()
		frappe.set_user("Administrator")

	def health_at(self, minutes_ago, disabled=False):
		last = now_datetime() - timedelta(minutes=minutes_ago)
		with patch.object(sh, "_last_run", return_value=last), patch(
			"frappe.utils.scheduler.is_scheduler_disabled", return_value=disabled
		):
			return sh.scheduler_health(fresh=True)

	def test_a_short_pause_is_healthy_an_hour_of_silence_is_not(self):
		# A test run turns the flag off for minutes; jobs ran just before it: no alarm.
		self.assertTrue(self.health_at(10, disabled=True)["ok"])
		h = self.health_at(90, disabled=True)
		self.assertEqual((h["ok"], h["reason"]), (False, "disabled"))
		# Flag on but nothing ran (the scheduler process is dead): still caught.
		self.assertEqual(self.health_at(90, disabled=False)["reason"], "stalled")

	def test_one_notification_per_outage_to_enabled_system_managers(self):
		down = {"ok": False, "reason": "disabled", "last_run": "x", "last_run_human": "2 jam lalu"}
		up = {"ok": True, "reason": None, "last_run": "x", "last_run_human": "baru saja"}
		admins = set(frappe.get_all("User", filters={"enabled": 1, "name": ["in", sh._admins() or [""]]}, pluck="name"))
		with patch.object(sh, "scheduler_health", return_value=down):
			sh.check_and_notify()
			sh.check_and_notify()  # second boot of the same outage: silent
		self.assertEqual({m["recipient"] for m in self.sent}, admins)
		self.assertEqual(len(self.sent), len(admins))
		self.assertTrue(all(m["type"] == "Warning" for m in self.sent))
		self.assertIn("mo@vernon.id", admins)  # Erick Mo, as the owner asked
		with patch.object(sh, "scheduler_health", return_value=up):
			sh.check_and_notify()  # recovered: flag cleared
		with patch.object(sh, "scheduler_health", return_value=down):
			sh.check_and_notify()  # a new outage notifies again
		self.assertEqual(len(self.sent), 2 * len(admins))

	def test_bootstrap_shows_scheduler_only_to_system_managers(self):
		from vernon_project.api.mobile import bootstrap

		down = {"ok": False, "reason": "disabled", "last_run": "x", "last_run_human": "2 jam lalu"}
		with patch.object(sh, "check_and_notify", return_value=down):
			self.assertEqual(bootstrap()["scheduler"], down)  # Administrator is a System Manager
			user = PLAIN
			if not frappe.db.exists("User", user):
				frappe.get_doc({"doctype": "User", "email": user, "first_name": "Plain", "send_welcome_email": 0}).insert(
					ignore_permissions=True
				)
			frappe.set_user(user)
			self.assertIsNone(bootstrap()["scheduler"])

	def test_enable_needs_system_manager_and_turns_the_flag_on(self):
		with patch("frappe.utils.scheduler.enable_scheduler") as enable:
			frappe.set_user(PLAIN if frappe.db.exists("User", PLAIN) else "Guest")
			with self.assertRaises(frappe.PermissionError):
				sh.enable_scheduler()
			enable.assert_not_called()
			frappe.set_user("Administrator")
			with patch.object(sh, "_last_run", return_value=now_datetime()):
				res = sh.enable_scheduler()
			enable.assert_called_once()
			self.assertTrue(res["enabled"])

	def test_a_scheduler_paused_in_site_config_is_explained_not_flipped(self):
		with patch("frappe.utils.scheduler.enable_scheduler") as enable, patch.dict(frappe.local.conf, {"pause_scheduler": 1}):
			with self.assertRaises(frappe.ValidationError):
				sh.enable_scheduler()
			enable.assert_not_called()
