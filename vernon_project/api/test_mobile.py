# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import get_project_detail, get_team_wall, PROTECTED_USERS


class TestMobileGetWorkItem(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({
				"doctype": "Brand",
				"brand_name": "Test Customer",
			}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Mobile WorkItem Test",
			"brand": "Test Customer",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)

		grouping = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Mobile Grouping",
			"project": self.project.name,
		})
		grouping.insert(ignore_permissions=True)
		self.grouping = grouping.name

		self.detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Mobile Detail",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 10,
		})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_can_create_and_team_present(self):
		result = get_project_detail(self.detail.name)
		self.assertIn("can_create", result)
		self.assertIn("team", result)
		self.assertIsInstance(result["team"], list)
		# Administrator is owner/leader + System Manager -> can create
		self.assertTrue(result["can_create"])


class TestMobileGetProjectExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Extras Test Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Extras Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_project_has_raw_leads_and_groupings(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		self.assertEqual(r["project_owner"], "Administrator")
		self.assertEqual(r["project_leader"], "Administrator")
		self.assertIn("brand", r)
		self.assertIn("Extras Grouping", r["groupings"])


class TestMobileFormOptions(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", "fo_lead@example.com"):
			frappe.get_doc({"doctype": "User", "email": "fo_lead@example.com",
				"first_name": "FO", "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", "fo_lead@example.com").add_roles("Project Owner")
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_form_options_for_non_system_manager(self):
		from vernon_project.api.mobile import get_form_options
		# A Project Owner (NOT System Manager) must still get the user list,
		# even though /api/resource/User is System-Manager-only.
		frappe.set_user("fo_lead@example.com")
		try:
			r = get_form_options()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("brands", r)
		self.assertTrue(len(r["users"]) > 0)
		self.assertTrue(any(o["value"] == "fo_lead@example.com" for o in r["users"]))
		self.assertTrue(all("value" in o and "label" in o for o in r["users"]))


class TestMobileGetWorkItemExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "WI Extras Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "WIX Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "WIX Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_work_item_has_edit_fields(self):
		from vernon_project.api.mobile import get_project_detail
		r = get_project_detail(self.detail.name)
		self.assertTrue(r["can_edit"])
		self.assertEqual(r["grouping"], self.gl.name)
		self.assertIn("WIX Grouping", r["groupings"])


class TestMobileGetProjectTeam(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in ("tm_member@example.com", "tm_assignee@example.com"):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email,
					"first_name": email.split("@")[0], "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Team Roster Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "tm_member@example.com"}],
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Roster Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Roster Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		self.detail.insert(ignore_permissions=True)
		# One open todo assigned to a formal team member (assignee must be a team
		# member: Project Todo enforces validate_assigned_to_team_member).
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "Open task", "assigned_to": "tm_member@example.com",
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"group": "Test Group", "level": "1"}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		# Delete linked Project Todos first so Project Detail.on_trash doesn't block.
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_team_includes_zero_load_members_and_flags(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		by_user = {m["user"]: m for m in r["team"]}
		# Owner/leader (Administrator) present, flagged, even though they have no load.
		self.assertIn("Administrator", by_user)
		self.assertTrue(by_user["Administrator"]["is_owner"])
		self.assertTrue(by_user["Administrator"]["is_leader"])
		self.assertTrue(by_user["Administrator"]["is_member"])
		self.assertEqual(by_user["Administrator"]["open_todos"], 0)
		# Formal Project Team member carrying the open todo appears with load.
		self.assertIn("tm_member@example.com", by_user)
		self.assertTrue(by_user["tm_member@example.com"]["is_member"])
		self.assertEqual(by_user["tm_member@example.com"]["open_todos"], 1)
		# Owner is first in order.
		self.assertEqual(r["team"][0]["user"], "Administrator")

	def test_member_workload_open_only_by_default(self):
		from vernon_project.api.mobile import get_member_workload
		rows = get_member_workload(self.project.name, "tm_member@example.com")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["to_do"], "Open task")
		self.assertEqual(rows[0]["project_detail"], self.detail.name)
		self.assertEqual(rows[0]["project_detail_title"], "Roster Detail")
		self.assertEqual(rows[0]["status_key"], "planned")
		# A roster member with no todos returns an empty list.
		self.assertEqual(get_member_workload(self.project.name, "Administrator"), [])

	def test_member_workload_permission(self):
		from vernon_project.api.mobile import get_member_workload
		frappe.set_user("tm_assignee@example.com")  # not on any visible project here
		try:
			with self.assertRaises(frappe.PermissionError):
				get_member_workload(self.project.name, "tm_assignee@example.com")
		finally:
			frappe.set_user("Administrator")

	def test_project_detail_items_are_lightweight(self):
		from vernon_project.api.mobile import get_project_detail
		r = get_project_detail(self.detail.name)
		self.assertIn("project_items", r)
		self.assertEqual(len(r["project_items"]), 1)
		item = r["project_items"][0]
		# lightweight shape: link-row fields present, heavy fields absent
		self.assertEqual(item["to_do"], "Open task")
		self.assertIn("status_key", item)
		self.assertIn("assigned_to_name", item)
		self.assertNotIn("notes", item)
		self.assertNotIn("timeline", item)

	def test_project_item_links_to_its_detail(self):
		from vernon_project.api.mobile import get_project_item
		r = get_project_item(self.todo.name)
		self.assertEqual(r["project_detail"], self.detail.name)
		self.assertEqual(r["project_detail_title"], "Roster Detail")
		self.assertEqual(r["project"], self.project.name)

	def test_team_order_owner_then_leader(self):
		from vernon_project.api.mobile import get_project
		# Create a project where owner and leader are distinct users.
		# Add Administrator to team_members so _visible_projects() includes it
		# (get_permission_query_conditions filters by ownership/membership).
		proj = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Owner Leader Order Project",
			"brand": "Test Customer",
			"project_owner": "tm_member@example.com",
			"project_leader": "tm_assignee@example.com",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		})
		proj.insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			r = get_project(proj.name)
			team = r["team"]
			self.assertTrue(team[0]["is_owner"])
			self.assertTrue(team[1]["is_leader"])
			self.assertNotEqual(team[0]["user"], team[1]["user"])
		finally:
			frappe.delete_doc("Project", proj.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_comment_roundtrip_all_levels(self):
		from vernon_project.api.mobile import add_comment, get_comments
		cases = [
			("Project", self.project.name),
			("Project Detail", self.detail.name),
			("Project Todo", self.todo.name),
		]
		for dt, dn in cases:
			added = add_comment(dt, dn, f"hello {dt}")
			self.assertEqual(added["content"], f"hello {dt}")
			rows = get_comments(dt, dn)
			self.assertTrue(any(c["content"] == f"hello {dt}" for c in rows))
			self.assertIn("by_name", rows[0])
			self.assertIn("at_human", rows[0])
			mine = [c for c in rows if c["content"] == f"hello {dt}"][0]
			self.assertEqual(mine["by"], frappe.session.user)
			self.assertTrue(mine["by_name"])

	def test_comment_rejects_unknown_doctype(self):
		from vernon_project.api.mobile import add_comment
		with self.assertRaises(frappe.ValidationError):
			add_comment("User", "Administrator", "nope")

	def test_comment_rejects_invisible_project(self):
		from vernon_project.api.mobile import get_comments
		frappe.set_user("tm_assignee@example.com")  # not on this project
		try:
			with self.assertRaises(frappe.PermissionError):
				get_comments("Project", self.project.name)
		finally:
			frappe.set_user("Administrator")


class TestMobileWallet(unittest.TestCase):
	"""Money paths: gift (zero-sum transfer) and redeem (instant deduct). These
	mutate balances, so a regression here loses or mints points silently."""

	A = "wallet_a@example.com"
	B = "wallet_b@example.com"
	REWARD = "Test Reward"

	def setUp(self):
		frappe.set_user("Administrator")
		for email in (self.A, self.B):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		self._clear_money()
		# Seed user A with 100 spendable points (Point Ledger only requires `user`).
		frappe.get_doc({
			"doctype": "Point Ledger", "user": self.A, "points_earned": 100, "point": 100,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		self._clear_money()
		frappe.db.commit()

	def _clear_money(self):
		frappe.db.delete("Reward Redemption", {"user": ["in", (self.A, self.B)]})
		frappe.db.delete("Point Ledger", {"user": ["in", (self.A, self.B)]})
		if frappe.db.exists("Marketplace Reward", self.REWARD):
			frappe.delete_doc("Marketplace Reward", self.REWARD, force=True, ignore_permissions=True)

	def _make_reward(self, point_cost=40, stock=2, active=1):
		return frappe.get_doc({
			"doctype": "Marketplace Reward", "reward_name": self.REWARD,
			"point_cost": point_cost, "stock_quantity": stock, "active": active,
		}).insert(ignore_permissions=True).name

	def test_user_balance_counts_ledger(self):
		from vernon_project.api.mobile import _user_balance
		earned, redeemed, balance = _user_balance(self.A)
		self.assertEqual((earned, redeemed, balance), (100, 0, 100))

	def test_gift_points_is_zero_sum(self):
		from vernon_project.api.mobile import gift_points, _user_balance
		frappe.set_user(self.A)
		try:
			gift_points(self.B, 30)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(_user_balance(self.A)[2], 70)
		self.assertEqual(_user_balance(self.B)[2], 30)
		# Zero-sum: total earned across both users is unchanged by the transfer.
		total = frappe.db.sql(
			"select coalesce(sum(points_earned),0) from `tabPoint Ledger` where user in (%s,%s)",
			(self.A, self.B),
		)[0][0]
		self.assertEqual(float(total), 100)

	def test_gift_rejects_overdraft_self_and_fraction(self):
		from vernon_project.api.mobile import gift_points
		frappe.set_user(self.A)
		try:
			with self.assertRaises(frappe.ValidationError):
				gift_points(self.B, 1000)  # more than balance
			with self.assertRaises(frappe.ValidationError):
				gift_points(self.A, 10)  # cannot gift yourself
			with self.assertRaises(frappe.ValidationError):
				gift_points(self.B, 1.5)  # whole numbers only
		finally:
			frappe.set_user("Administrator")

	def test_redeem_deducts_balance_and_stock(self):
		from vernon_project.api.mobile import redeem_reward, _user_balance
		name = self._make_reward(point_cost=40, stock=2)
		frappe.db.commit()
		frappe.set_user(self.A)
		try:
			res = redeem_reward(name)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["balance"], 60)
		self.assertEqual(frappe.db.get_value("Marketplace Reward", name, "stock_quantity"), 1)
		self.assertEqual(_user_balance(self.A)[2], 60)
		self.assertTrue(frappe.db.exists("Reward Redemption", res["redemption"]))

	def test_redeem_rejects_overdraft_and_inactive(self):
		from vernon_project.api.mobile import redeem_reward
		frappe.set_user(self.A)
		try:
			name = self._make_reward(point_cost=1000, stock=2)
			frappe.db.commit()
			with self.assertRaises(frappe.ValidationError):
				redeem_reward(name)  # cost exceeds balance
			frappe.set_user("Administrator")
			frappe.db.set_value("Marketplace Reward", name, {"point_cost": 10, "active": 0})
			frappe.db.commit()
			frappe.set_user(self.A)
			with self.assertRaises(frappe.ValidationError):
				redeem_reward(name)  # inactive reward
		finally:
			frappe.set_user("Administrator")


class TestTeamWall(unittest.TestCase):
	def setUp(self):
		self.enabled_user = "team_wall_enabled@example.com"
		self.disabled_user = "team_wall_disabled@example.com"
		for email, enabled in ((self.enabled_user, 1), (self.disabled_user, 0)):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User",
					"email": email,
					"first_name": "Wall",
					"enabled": enabled,
				}).insert(ignore_permissions=True)
			else:
				frappe.db.set_value("User", email, "enabled", enabled)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for email in (self.enabled_user, self.disabled_user):
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_returns_enabled_excludes_disabled_and_protected(self):
		names = {u["name"] for u in get_team_wall()["users"]}
		self.assertIn(self.enabled_user, names)
		self.assertNotIn(self.disabled_user, names)
		for protected in PROTECTED_USERS:
			self.assertNotIn(protected, names)


class TestMobileRecurring(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group Recurring"):
			frappe.get_doc({
				"doctype": "Group",
				"group_name": "Test Group Recurring",
				"base_rate_per_minute": 1,
				"levels": [{
					"type_name": "General", "level_name": "L1",
					"level_id": "TESTLVL1", "difficulty_percent": 100,
				}],
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Mobile Recurring Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 90),
			"team_members": [{"user": "Administrator"}],
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "MobRec Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "MobRec Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 60)})
		self.detail.insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.detail.name,
			"to_do": "rec task",
			"assigned_to": "Administrator",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"group": "Test Group Recurring",
			"level_id": "TESTLVL1",
			"status": "⚪️ Planned",
			"is_recurring": 1,
			"recurring_frequency": "Weekly",
			"recurring_weekdays": "MON,THU",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for dt, name in (
			("Project Todo", self.todo.name),
			("Project Detail", self.detail.name),
			("Glossary", self.gl.name),
			("Project", self.project.name),
		):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_recurring_detail_and_update(self):
		from vernon_project.api.mobile import get_project_item, update_todo
		rec = get_project_item(self.todo.name)["recurring"]
		self.assertEqual(rec["interval"], 1)
		self.assertEqual(rec["weekdays"], "MON,THU")
		self.assertEqual(rec["state"], "active")
		self.assertTrue(rec["next_fire"])

		update_todo(
			project_item=self.todo.name,
			to_do="rec task",
			start_date=nowdate(),
			deadline=add_days(nowdate(), 7),
			is_recurring=1,
			recurring_frequency="Weekly",
			recurring_weekdays="MON,FRI",
			recurring_paused=1,
		)
		frappe.db.commit()
		rec2 = get_project_item(self.todo.name)["recurring"]
		self.assertEqual(rec2["weekdays"], "MON,FRI")
		self.assertTrue(rec2["paused"])
		self.assertEqual(rec2["state"], "paused")

		# Bug regression: disabling recurring must clear recurring_paused on the series root.
		update_todo(
			project_item=self.todo.name,
			to_do="rec task",
			start_date=nowdate(),
			deadline=add_days(nowdate(), 7),
			is_recurring=0,
		)
		frappe.db.commit()
		rec3 = get_project_item(self.todo.name).get("recurring")
		self.assertFalse(rec3.get("paused"), "disabling recurring must clear recurring_paused")
		self.assertIsNone(rec3.get("state"), "state must be None when recurring is off")

		# Re-enabling must also start in active (not paused) state.
		update_todo(
			project_item=self.todo.name,
			to_do="rec task",
			start_date=nowdate(),
			deadline=add_days(nowdate(), 7),
			is_recurring=1,
			recurring_frequency="Weekly",
			recurring_weekdays="MON",
		)
		frappe.db.commit()
		rec4 = get_project_item(self.todo.name)["recurring"]
		self.assertFalse(rec4["paused"], "re-enabled recurring must not be paused")
		self.assertEqual(rec4["state"], "active", "re-enabled recurring must be active")
