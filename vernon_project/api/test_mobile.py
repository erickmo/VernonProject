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


class TestMobileDeleteUser(unittest.TestCase):
	def setUp(self):
		self.user = "del_target@example.com"
		if not frappe.db.exists("User", self.user):
			frappe.get_doc({"doctype": "User", "email": self.user,
				"first_name": "Del"}).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", self.user):
			frappe.delete_doc("User", self.user, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_deletes_unassigned_user(self):
		from vernon_project.api.mobile import delete_user
		delete_user(self.user)
		self.assertFalse(frappe.db.exists("User", self.user))

	def test_non_system_manager_forbidden(self):
		from vernon_project.api.mobile import delete_user
		frappe.set_user(self.user)  # target has no roles -> not a System Manager
		try:
			with self.assertRaises(frappe.PermissionError):
				delete_user("someone@example.com")
		finally:
			frappe.set_user("Administrator")

	def test_protected_user_blocked(self):
		from vernon_project.api.mobile import delete_user
		with self.assertRaises(frappe.ValidationError):
			delete_user("Guest")

	def test_self_delete_blocked(self):
		from vernon_project.api.mobile import delete_user
		frappe.get_doc("User", self.user).add_roles("System Manager")
		frappe.set_user(self.user)
		try:
			with self.assertRaises(frappe.ValidationError):
				delete_user(self.user)
		finally:
			frappe.set_user("Administrator")


class TestUserPointsLog(unittest.TestCase):
	"""Transparent earned-points log: any logged-in user reads any user's earned
	credits (Grant + Gift excluded); Guest and missing users are rejected."""

	def setUp(self):
		self.target = "uplog_target@example.com"
		self.viewer = "uplog_viewer@example.com"  # plain user, no admin roles
		for email, fn in ((self.target, "Target"), (self.viewer, "Viewer")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": fn,
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		# Ledger: two earned (Todo), one Grant, one Gift — all for the target.
		self._ledger = []
		for src, amt in (("Todo", 10), ("Todo", 5), ("Grant", 100), ("Gift", 50)):
			d = frappe.get_doc({"doctype": "Point Ledger", "user": self.target,
				"source": src, "points_earned": amt, "credited_on": frappe.utils.now_datetime()}
			).insert(ignore_permissions=True)
			self._ledger.append(d.name)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for n in self._ledger:
			if frappe.db.exists("Point Ledger", n):
				frappe.delete_doc("Point Ledger", n, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_any_user_reads_earned_log_without_grant_or_gift(self):
		from vernon_project.api.mobile import get_user_points_log
		frappe.set_user(self.viewer)
		try:
			out = get_user_points_log(self.target)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(out["user"], self.target)
		# Only the two Todo credits (10 + 5); Grant/Gift excluded.
		self.assertEqual(len(out["rows"]), 2)
		self.assertEqual(out["total_earned"], 15)
		self.assertTrue(all(r["kind"] == "credit" for r in out["rows"]))

	def test_guest_rejected(self):
		from vernon_project.api.mobile import get_user_points_log
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.PermissionError):
				get_user_points_log(self.target)
		finally:
			frappe.set_user("Administrator")

	def test_missing_user_rejected(self):
		from vernon_project.api.mobile import get_user_points_log
		with self.assertRaises(frappe.DoesNotExistError):
			get_user_points_log("nobody@example.com")


class TestDeleteProjectAndDetail(unittest.TestCase):
	def setUp(self):
		from vernon_project.api.mobile import delete_project_detail
		self.delete_project_detail = delete_project_detail
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		# A non-manager user for the permission test.
		if not frappe.db.exists("User", "del_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "del_outsider@example.com",
				"first_name": "Del Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Delete Test Project",
			"brand": "Test Customer", "project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Delete Grouping",
			"project": self.project.name}).insert(ignore_permissions=True).name
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Delete Detail",
			"grouping": self.grouping, "project_deadline": add_days(nowdate(), 30), "estimated": 10,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Project Todo", {"project": self.project.name})
		for dt, name in (("Project Detail", self.detail.name), ("Glossary", self.grouping),
				("Project", self.project.name)):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _add_todo(self):
		t = frappe.get_doc({"doctype": "Project Todo", "project": self.project.name,
			"project_detail": self.detail.name, "to_do": "blocker", "status": "⚪️ Planned"})
		t.flags.ignore_validate = True
		t.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		return t.name

	def test_delete_detail_blocked_when_todo_exists(self):
		self._add_todo()
		with self.assertRaises(frappe.ValidationError):
			self.delete_project_detail(self.detail.name)
		self.assertTrue(frappe.db.exists("Project Detail", self.detail.name))

	def test_delete_detail_succeeds_when_empty(self):
		self.delete_project_detail(self.detail.name)
		self.assertFalse(frappe.db.exists("Project Detail", self.detail.name))

	def test_delete_detail_permission_denied_for_outsider(self):
		frappe.set_user("del_outsider@example.com")
		with self.assertRaises(frappe.PermissionError):
			self.delete_project_detail(self.detail.name)
		frappe.set_user("Administrator")
		self.assertTrue(frappe.db.exists("Project Detail", self.detail.name))

	def test_delete_project_blocked_when_todo_exists(self):
		from vernon_project.api.mobile import delete_project
		self._add_todo()
		with self.assertRaises(frappe.ValidationError):
			delete_project(self.project.name)
		self.assertTrue(frappe.db.exists("Project", self.project.name))

	def test_delete_project_blocked_when_point_ledger_exists(self):
		from vernon_project.api.mobile import delete_project
		pl = frappe.get_doc({"doctype": "Point Ledger", "user": "Administrator",
			"project": self.project.name, "point": 5})
		pl.flags.ignore_validate = True
		pl.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		try:
			with self.assertRaises(frappe.ValidationError):
				delete_project(self.project.name)
			self.assertTrue(frappe.db.exists("Project", self.project.name))
		finally:
			frappe.delete_doc("Point Ledger", pl.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_delete_project_cascades_detail_glossary_meeting(self):
		from vernon_project.api.mobile import delete_project
		meeting = frappe.get_doc({"doctype": "Meeting", "project": self.project.name,
			"title": "Del Meeting", "meeting_date": nowdate()})
		meeting.flags.ignore_validate = True
		meeting.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		detail_name, grouping_name, meeting_name = self.detail.name, self.grouping, meeting.name
		delete_project(self.project.name)
		self.assertFalse(frappe.db.exists("Project", self.project.name))
		self.assertFalse(frappe.db.exists("Project Detail", detail_name))
		self.assertFalse(frappe.db.exists("Glossary", grouping_name))
		self.assertFalse(frappe.db.exists("Meeting", meeting_name))

	def test_delete_project_allowed_for_leader_non_owner(self):
		from vernon_project.api.mobile import delete_project
		if not frappe.db.exists("User", "del_leader@example.com"):
			frappe.get_doc({"doctype": "User", "email": "del_leader@example.com",
				"first_name": "Del Leader", "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.db.set_value("Project", self.project.name, "project_leader", "del_leader@example.com")
		frappe.db.commit()
		frappe.set_user("del_leader@example.com")
		try:
			delete_project(self.project.name)
		finally:
			frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("Project", self.project.name))

	def test_get_project_detail_exposes_can_delete(self):
		from vernon_project.api.mobile import get_project_detail
		r = get_project_detail(self.detail.name)
		self.assertIn("can_delete", r)
		self.assertTrue(r["can_delete"])  # Administrator is owner/leader + SM

	def test_delete_project_clears_blocked_by_on_other_projects(self):
		from vernon_project.api.mobile import delete_project
		blocker = frappe.get_doc({
			"doctype": "Project", "project_name": "Del Blocker", "brand": self.project.brand,
			"project_owner": "Administrator", "project_leader": "Administrator", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		other = frappe.get_doc({
			"doctype": "Project", "project_name": "Del Blocked", "brand": self.project.brand,
			"project_owner": "Administrator", "project_leader": "Administrator", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30), "blocked_by": blocker.name,
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			delete_project(blocker.name)
			self.assertFalse(frappe.db.exists("Project", blocker.name))
			self.assertIsNone(frappe.db.get_value("Project", other.name, "blocked_by"))
		finally:
			if frappe.db.exists("Project", other.name):
				frappe.delete_doc("Project", other.name, force=True, ignore_permissions=True)
			if frappe.db.exists("Project", blocker.name):
				frappe.delete_doc("Project", blocker.name, force=True, ignore_permissions=True)
			frappe.db.commit()


class TestMoveProjectDetail(unittest.TestCase):
	def setUp(self):
		from vernon_project.api.mobile import move_project_detail, list_move_destinations
		self.move_project_detail = move_project_detail
		self.list_move_destinations = list_move_destinations
		# Reuse any existing Brand: Project.brand is mandatory and Brand now requires
		# a company, so we don't fabricate one.
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		# owner of both projects (non System Manager), a dest team member, an
		# assignee who is on nobody's team, and a total stranger.
		for email in ("mv_owner@example.com", "mv_member@example.com",
				"mv_outsider@example.com", "mv_stranger@example.com"):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email,
					"first_name": email.split("@")[0], "send_welcome_email": 0}).insert(ignore_permissions=True)
		# Project.validate_lead_roles gates owner/leader on these roles.
		for email in ("mv_owner@example.com", "mv_stranger@example.com"):
			frappe.get_doc("User", email).add_roles("Project Owner", "Project Leader")
		self.source = frappe.get_doc({
			"doctype": "Project", "project_name": "Move Source",
			"brand": self.brand, "project_owner": "mv_owner@example.com",
			"project_leader": "mv_owner@example.com", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		self.dest = frappe.get_doc({
			"doctype": "Project", "project_name": "Move Dest",
			"brand": self.brand, "project_owner": "mv_owner@example.com",
			"project_leader": "mv_owner@example.com", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "mv_member@example.com"}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Move Grouping",
			"project": self.source.name}).insert(ignore_permissions=True).name
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.source.name, "title": "Move Detail",
			"grouping": self.grouping, "glossaries": [{"glossary": self.grouping}],
			"project_deadline": add_days(nowdate(), 30), "estimated": 10,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
		for p in (self.source.name, self.dest.name):
			frappe.db.delete("Point Ledger", {"project": p})
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)
		for p in (self.source.name, self.dest.name):
			if frappe.db.exists("Project", p):
				frappe.delete_doc("Project", p, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _add_todo(self, assigned_to):
		# ignore_validate bypasses validate_assigned_to_team_member so we can pin an
		# arbitrary assignee (the move's own membership check is what's under test).
		t = frappe.get_doc({"doctype": "Project Todo", "project": self.source.name,
			"project_detail": self.detail.name, "to_do": "task", "assigned_to": assigned_to,
			"status": "⚪️ Planned"})
		t.flags.ignore_validate = True
		t.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		return t.name

	def test_non_owner_denied(self):
		frappe.set_user("mv_stranger@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				self.move_project_detail(self.detail.name, self.dest.name)
		finally:
			frappe.set_user("Administrator")

	def test_owner_of_source_but_not_dest_denied(self):
		dest2 = frappe.get_doc({
			"doctype": "Project", "project_name": "Move Dest Foreign",
			"brand": self.brand, "project_owner": "mv_stranger@example.com",
			"project_leader": "mv_stranger@example.com", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user("mv_owner@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				self.move_project_detail(self.detail.name, dest2.name)
		finally:
			frappe.set_user("Administrator")
			frappe.delete_doc("Project", dest2.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_blocked_when_assignee_not_on_dest_team(self):
		todo = self._add_todo("mv_outsider@example.com")
		pl = frappe.get_doc({"doctype": "Point Ledger", "user": "mv_outsider@example.com",
			"project": self.source.name, "todo": todo, "point": 5})
		pl.flags.ignore_validate = True
		pl.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		frappe.set_user("mv_owner@example.com")
		try:
			r = self.move_project_detail(self.detail.name, self.dest.name)
		finally:
			frappe.set_user("Administrator")
		self.assertFalse(r["ok"])
		self.assertEqual(len(r["blocked"]), 1)
		self.assertEqual(r["blocked"][0]["user"], "mv_outsider@example.com")
		self.assertEqual(r["blocked"][0]["todo"], todo)
		# No writes: detail, todo and point history all still on the source project.
		self.assertEqual(frappe.db.get_value("Project Detail", self.detail.name, "project"), self.source.name)
		self.assertEqual(frappe.db.get_value("Project Todo", todo, "project"), self.source.name)
		self.assertEqual(frappe.db.get_value("Point Ledger", pl.name, "project"), self.source.name)

	def test_success_moves_detail_todos_and_points(self):
		# Assignees: dest owner (== leader) and a dest team member -> all valid.
		t1 = self._add_todo("mv_owner@example.com")
		t2 = self._add_todo("mv_member@example.com")
		pl = frappe.get_doc({"doctype": "Point Ledger", "user": "mv_member@example.com",
			"project": self.source.name, "todo": t2, "point": 5})
		pl.flags.ignore_validate = True
		pl.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		frappe.set_user("mv_owner@example.com")
		try:
			r = self.move_project_detail(self.detail.name, self.dest.name)
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(r["ok"])
		self.assertEqual(r["moved_todos"], 2)
		moved = frappe.get_doc("Project Detail", self.detail.name)
		self.assertEqual(moved.project, self.dest.name)
		self.assertIsNone(moved.grouping)
		self.assertEqual(len(moved.glossaries), 0)
		self.assertEqual(frappe.db.get_value("Project Todo", t1, "project"), self.dest.name)
		self.assertEqual(frappe.db.get_value("Project Todo", t2, "project"), self.dest.name)
		self.assertEqual(frappe.db.get_value("Point Ledger", pl.name, "project"), self.dest.name)

	def test_unassigned_todo_never_blocks(self):
		self._add_todo(None)
		frappe.set_user("mv_owner@example.com")
		try:
			r = self.move_project_detail(self.detail.name, self.dest.name)
		finally:
			frappe.set_user("Administrator")
		self.assertTrue(r["ok"])
		self.assertEqual(frappe.db.get_value("Project Detail", self.detail.name, "project"), self.dest.name)

	def test_list_destinations_excludes_source_and_foreign_and_closed(self):
		# A project owned by someone else, and a Closed project the owner owns:
		# neither may appear for the non-System-Manager owner.
		foreign = frappe.get_doc({
			"doctype": "Project", "project_name": "Move Dest Not Mine",
			"brand": self.brand, "project_owner": "mv_stranger@example.com",
			"project_leader": "mv_stranger@example.com", "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		closed = frappe.get_doc({
			"doctype": "Project", "project_name": "Move Dest Closed",
			"brand": self.brand, "project_owner": "mv_owner@example.com",
			"project_leader": "mv_owner@example.com", "status": "Closed",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user("mv_owner@example.com")
		try:
			names = {p["name"] for p in self.list_move_destinations(self.detail.name)}
		finally:
			frappe.set_user("Administrator")
			for p in (foreign.name, closed.name):
				frappe.delete_doc("Project", p, force=True, ignore_permissions=True)
			frappe.db.commit()
		self.assertIn(self.dest.name, names)
		self.assertNotIn(self.source.name, names)
		self.assertNotIn(foreign.name, names)
		self.assertNotIn(closed.name, names)
