# Copyright (c) 2026, Vernon and Contributors
# See license.txt
"""Todo issues: a todo can carry other todos as its issues (`issue_of`), and an
issue counts as resolved once it reaches Completed (done AND approved)."""

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import (
	STATUS_CANCELLED, STATUS_CHECKED, STATUS_COMPLETED, STATUS_DONE, STATUS_PLANNED,
	issue_counts, is_issue_resolved,
)


# --- pure counting -------------------------------------------------------------------

class TestIssueCounts(unittest.TestCase):
	def test_empty(self):
		self.assertEqual(issue_counts([]), {"open": 0, "resolved": 0, "cancelled": 0})

	def test_completed_is_resolved(self):
		self.assertEqual(
			issue_counts([STATUS_COMPLETED]), {"open": 0, "resolved": 1, "cancelled": 0}
		)

	def test_every_pre_approval_status_is_open(self):
		# Done and Checked are NOT resolved — an issue resolves only once it is
		# both done and fully approved (Completed).
		self.assertEqual(
			issue_counts([STATUS_PLANNED, STATUS_DONE, STATUS_CHECKED]),
			{"open": 3, "resolved": 0, "cancelled": 0},
		)

	def test_cancelled_counts_as_neither(self):
		self.assertEqual(
			issue_counts([STATUS_CANCELLED]), {"open": 0, "resolved": 0, "cancelled": 1}
		)

	def test_mixed(self):
		self.assertEqual(
			issue_counts([STATUS_PLANNED, STATUS_COMPLETED, STATUS_CANCELLED, STATUS_DONE]),
			{"open": 2, "resolved": 1, "cancelled": 1},
		)

	def test_unknown_status_is_open_not_resolved(self):
		self.assertEqual(issue_counts(["something else"]), {"open": 1, "resolved": 0, "cancelled": 0})

	def test_is_issue_resolved(self):
		self.assertTrue(is_issue_resolved(STATUS_COMPLETED))
		for s in (STATUS_PLANNED, STATUS_DONE, STATUS_CHECKED, STATUS_CANCELLED, None, ""):
			self.assertFalse(is_issue_resolved(s), s)


# --- controller + endpoints ----------------------------------------------------------

class TodoIssueFixture(unittest.TestCase):
	"""One project / detail / host todo, plus a helper to spawn issue todos."""

	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("Group", "Test Group Issues"):
			frappe.get_doc({
				"doctype": "Group",
				"group_name": "Test Group Issues",
				"base_rate_per_minute": 1,
				"levels": [{
					"type_name": "General", "level_name": "L1",
					"level_id": "ISSUELVL1", "difficulty_percent": 100,
				}],
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Todo Issues Project",
			"brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 90),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Issues Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name,
			"title": "Issues Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 60),
		}).insert(ignore_permissions=True)
		self.host = self._todo("host task")
		self.spawned = []
		frappe.db.commit()

	def _todo(self, title, **kw):
		doc = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.detail.name,
			"to_do": title,
			"assigned_to": "Administrator",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"group": "Test Group Issues",
			"level_id": "ISSUELVL1",
			"estimated": 30,
			"status": STATUS_PLANNED,
			**kw,
		}).insert(ignore_permissions=True)
		if hasattr(self, "spawned"):
			self.spawned.append(doc.name)
		return doc

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in reversed(getattr(self, "spawned", [])):
			if frappe.db.exists("Project Todo", name):
				frappe.db.set_value("Project Todo", name, {"issue_of": None, "status": STATUS_PLANNED},
					update_modified=False)
		if frappe.db.exists("Project Todo", self.host.name):
			frappe.db.set_value("Project Todo", self.host.name, "status", STATUS_PLANNED,
				update_modified=False)
		for name in reversed(getattr(self, "spawned", [])):
			if frappe.db.exists("Project Todo", name):
				frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		for dt, name in (
			("Project Todo", self.host.name),
			("Project Detail", self.detail.name),
			("Glossary", self.gl.name),
			("Project", self.project.name),
		):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()


class TestIssueLinkValidation(TodoIssueFixture):
	def test_links_to_another_todo(self):
		issue = self._todo("broken login", issue_of=self.host.name)
		self.assertEqual(
			frappe.db.get_value("Project Todo", issue.name, "issue_of"), self.host.name
		)

	def test_self_link_rejected(self):
		self.host.issue_of = self.host.name
		with self.assertRaises(frappe.ValidationError):
			self.host.save(ignore_permissions=True)
		self.host.reload()

	def test_direct_cycle_rejected(self):
		issue = self._todo("cycle a", issue_of=self.host.name)
		self.host.issue_of = issue.name
		with self.assertRaises(frappe.ValidationError):
			self.host.save(ignore_permissions=True)
		self.host.reload()

	def test_deep_cycle_rejected(self):
		a = self._todo("chain a", issue_of=self.host.name)
		b = self._todo("chain b", issue_of=a.name)
		self.host.issue_of = b.name
		with self.assertRaises(frappe.ValidationError):
			self.host.save(ignore_permissions=True)
		self.host.reload()

	def test_nesting_without_a_cycle_is_allowed(self):
		a = self._todo("issue of host", issue_of=self.host.name)
		b = self._todo("issue of the issue", issue_of=a.name)
		self.assertEqual(frappe.db.get_value("Project Todo", b.name, "issue_of"), a.name)

	def test_missing_host_is_rejected(self):
		with self.assertRaises(Exception):
			self._todo("orphan", issue_of="Project Todo-does-not-exist")

	def test_deleting_the_host_detaches_its_issues(self):
		host = self._todo("disposable host")
		issue = self._todo("its issue", issue_of=host.name)
		frappe.delete_doc("Project Todo", host.name, force=True, ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Project Todo", issue.name))
		self.assertIsNone(frappe.db.get_value("Project Todo", issue.name, "issue_of"))


class TestIssueResolution(TodoIssueFixture):
	def test_issue_resolves_only_when_completed(self):
		from vernon_project.api.mobile import get_project_item

		issue = self._todo("needs fixing", issue_of=self.host.name)
		for status, resolved in (
			(STATUS_PLANNED, False), (STATUS_DONE, False),
			(STATUS_CHECKED, False), (STATUS_COMPLETED, True),
		):
			frappe.db.set_value("Project Todo", issue.name, "status", status, update_modified=False)
			row = get_project_item(self.host.name)["issues"][0]
			self.assertEqual(row["resolved"], resolved, status)

	def test_host_detail_lists_issues_with_counts(self):
		from vernon_project.api.mobile import get_project_item

		self._todo("issue open", issue_of=self.host.name)
		done = self._todo("issue done", issue_of=self.host.name)
		dropped = self._todo("issue dropped", issue_of=self.host.name)
		frappe.db.set_value("Project Todo", done.name, "status", STATUS_COMPLETED, update_modified=False)
		frappe.db.set_value("Project Todo", dropped.name, "status", STATUS_CANCELLED, update_modified=False)

		data = get_project_item(self.host.name)
		self.assertEqual(len(data["issues"]), 3)
		self.assertEqual(data["issue_counts"], {"open": 1, "resolved": 1, "cancelled": 1})
		self.assertTrue(all("to_do" in i and "status_key" in i for i in data["issues"]))

	def test_a_todo_without_issues_reports_empty(self):
		from vernon_project.api.mobile import get_project_item

		data = get_project_item(self.host.name)
		self.assertEqual(data["issues"], [])
		self.assertEqual(data["issue_counts"], {"open": 0, "resolved": 0, "cancelled": 0})
		self.assertIsNone(data["issue_of"])

	def test_issue_detail_carries_the_backlink(self):
		from vernon_project.api.mobile import get_project_item

		issue = self._todo("child", issue_of=self.host.name)
		data = get_project_item(issue.name)
		self.assertEqual(data["issue_of"], self.host.name)
		self.assertEqual(data["issue_of_title"], self.host.to_do)
		self.assertEqual(data["issue_of_status_key"], "planned")

	def test_can_report_issue_follows_can_create(self):
		from vernon_project.api.mobile import get_project_item

		data = get_project_item(self.host.name)
		self.assertEqual(data["can_report_issue"], data["can_create"])

	def test_open_issue_count_rides_on_list_rows(self):
		from vernon_project.api.mobile import get_project_detail

		issue = self._todo("blocker issue", issue_of=self.host.name)
		rows = {t["name"]: t for t in get_project_detail(self.detail.name)["project_items"]}
		self.assertEqual(rows[self.host.name]["open_issues"], 1)
		self.assertEqual(rows[issue.name]["open_issues"], 0)
		self.assertEqual(rows[issue.name]["issue_of"], self.host.name)

		frappe.db.set_value("Project Todo", issue.name, "status", STATUS_COMPLETED, update_modified=False)
		rows = {t["name"]: t for t in get_project_detail(self.detail.name)["project_items"]}
		self.assertEqual(rows[self.host.name]["open_issues"], 0)

	def test_cancelled_issue_is_not_counted_as_open(self):
		from vernon_project.api.mobile import get_project_detail

		issue = self._todo("dropped issue", issue_of=self.host.name)
		frappe.db.set_value("Project Todo", issue.name, "status", STATUS_CANCELLED, update_modified=False)
		rows = {t["name"]: t for t in get_project_detail(self.detail.name)["project_items"]}
		self.assertEqual(rows[self.host.name]["open_issues"], 0)

	def test_completing_an_issue_notifies_the_reporter_and_host_assignee(self):
		import vernon_project.api.mobile as mob

		issue = self._todo("notify me", issue_of=self.host.name)
		sent = []
		orig = mob._notify
		mob._notify = lambda **kw: sent.append(kw)
		try:
			doc = frappe.get_doc("Project Todo", issue.name)
			doc.status = STATUS_COMPLETED
			doc.save(ignore_permissions=True)
		finally:
			mob._notify = orig
		resolved = [s for s in sent if "issue" in (s.get("title") or "").lower()]
		self.assertTrue(resolved, f"no issue-resolved notification in {sent}")
		# Both the reporter and the host task's assignee are told (same user here).
		self.assertIn(self.host.assigned_to, {r["recipient"] for r in resolved})
		self.assertIn(issue.owner, {r["recipient"] for r in resolved})
		self.assertTrue(all(r["reference_name"] == self.host.name for r in resolved))

	def test_completing_a_plain_todo_sends_no_issue_notification(self):
		import vernon_project.api.mobile as mob

		plain = self._todo("no host")
		sent = []
		orig = mob._notify
		mob._notify = lambda **kw: sent.append(kw)
		try:
			doc = frappe.get_doc("Project Todo", plain.name)
			doc.status = STATUS_COMPLETED
			doc.save(ignore_permissions=True)
		finally:
			mob._notify = orig
		self.assertFalse([s for s in sent if "issue" in (s.get("title") or "").lower()])
