# Copyright (c) 2026, Vernon and contributors
# See license.txt

import threading
import unittest

import frappe
from vernon_project.tests.no_leak import NoLeakMixin, needs_real_commits

DETAIL = "PD-PRJ-2601-00002-00005"
ASSIGNEE = "mo@vernon.id"
TITLE = "ZZ idempotency probe"
GROUP = "Engineering"
LEVEL = "41bb5abde7"


def _payload(**over):
	base = {
		"doctype": "Project Todo",
		"project_detail": DETAIL,
		"to_do": TITLE,
		"assigned_to": ASSIGNEE,
		"status": "⚪️ Planned",
		"group": GROUP,
		"level_id": LEVEL,
		"estimated": 60,
		"start_date": "2026-09-12",
		"deadline": "2026-09-12",
	}
	base.update(over)
	return base


class TestProjectTodoIdempotency(NoLeakMixin, unittest.TestCase):
	"""Owner report: "Sometimes a user click save on form and data created twice or
	more." Measured on this site before the fix: 37 duplicate pairs created within 30s
	of each other, 9 of them in the same second, across 20 dates and 5 creators, 18 of
	the 37 owned by real humans.

	The frontend already disables submit while the request is in flight
	(CreateProjectItemSheet.tsx `disabled={create.isPending}`), so the surviving cause
	is a retry after an apparently-failed-but-actually-succeeded save. That retry is a
	SECOND request, which no client-side guard can catch.

	The guard cannot be a unique index on business identity: 589 identity-groups
	already exist legitimately (recurring series -- the worst is x59 spread over 66
	days), and a unique key would block them, which the todo's own acceptance criteria
	forbid. Nor can it be a SELECT-then-insert check: at this bench's REPEATABLE READ
	the loser's read predates the winner's commit, which is the same check-then-write
	that produced the Midtrans, cuti-reconcile and annual-grant races.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._clean()
		self._begin_request()

	def tearDown(self):
		self._end_request()
		self._clean()

	# The guard only binds an HTTP request -- a scheduler, patch, bench call or test
	# fixture creates todos in bulk and legitimately repeats an identity. So these
	# tests have to stand in for a browser.
	def _begin_request(self):
		frappe.local.request = frappe._dict(method="POST", path="/api/method/frappe.client.insert")
		frappe.local.flags.pop("vp_todo_saves_seen", None)

	def _end_request(self):
		frappe.local.request = None
		frappe.local.flags.pop("vp_todo_saves_seen", None)

	def _next_request(self):
		"""A retry is a SECOND request: same session, fresh per-request state."""
		frappe.local.flags.pop("vp_todo_saves_seen", None)

	def _clean(self):
		# The concurrency test COMMITS on independent connections, so rollback alone
		# cannot clear it.
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"to_do": ["like", "ZZ idempotency%"]}, pluck="name"):
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True, delete_permanently=True)
		frappe.db.commit()
		frappe.cache.delete_keys("vp_todo_create:")

	def _count(self, title=TITLE):
		"""This session's view, including its own uncommitted inserts."""
		return frappe.db.count("Project Todo", {"to_do": title})

	def _count_committed(self, title=TITLE):
		"""What is actually committed. The rollback drops this session's snapshot so we
		can see rows the concurrency test's independent connections committed -- and it
		would also discard our OWN uncommitted inserts, so only the concurrency test
		may use it."""
		frappe.db.rollback()
		return frappe.db.count("Project Todo", {"to_do": title})

	# --- the bug ----------------------------------------------------------------
	def test_an_identical_second_save_inside_the_window_is_refused(self):
		frappe.get_doc(_payload()).insert(ignore_permissions=True)
		self._next_request()
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(_payload()).insert(ignore_permissions=True)

	@needs_real_commits  # second connection: holding the commit removes the contention it pins
	def test_two_concurrent_identical_saves_create_exactly_one_todo(self):
		"""The retry arriving while the first request is still in flight. Two real
		connections, released together -- a SELECT-then-insert guard also fails this."""
		site, sites_path = frappe.local.site, frappe.local.sites_path
		ready, go = threading.Barrier(2), threading.Event()
		errors, made = [], []

		def run():
			frappe.init(site=site, sites_path=sites_path)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				frappe.local.request = frappe._dict(
					method="POST", path="/api/method/frappe.client.insert")
				ready.wait(timeout=20)
				go.wait(timeout=20)
				doc = frappe.get_doc(_payload())
				doc.insert(ignore_permissions=True)
				frappe.db.commit()
				made.append(doc.name)
			except Exception as e:
				errors.append(type(e).__name__)
			finally:
				frappe.destroy()

		threads = [threading.Thread(target=run) for _ in range(2)]
		for t in threads:
			t.start()
		go.set()
		for t in threads:
			t.join(60)

		landed = self._count_committed()
		self.assertEqual(
			landed, 1,
			f"concurrent identical saves persisted {landed} todos; made={made} errors={errors}",
		)
		self.assertEqual(len(made), 1, f"both inserts reported success: {made}")

	# --- pins: what must STILL be allowed ---------------------------------------
	def test_a_recurring_occurrence_is_not_blocked(self):
		"""589 identity-groups are legitimate recurring series. An occurrence carries
		the series root in original_todo and repeats the identity by design."""
		first = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		second = frappe.get_doc(_payload(original_todo=first.name)).insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Project Todo", second.name))

	def test_todos_differing_only_in_deadline_both_insert(self):
		"""Why deadline and start_date are in the identity: without them the guard
		would refuse distinct todos (589 groups by the looser key, 57 by this one)."""
		frappe.get_doc(_payload()).insert(ignore_permissions=True)
		other = frappe.get_doc(_payload(deadline="2026-09-19")).insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Project Todo", other.name))
		self.assertEqual(self._count(), 2)

	def test_the_same_identity_inserts_again_once_the_window_passes(self):
		"""The guard is a 15s window, not a permanent constraint: the same real todo
		may legitimately be created again later."""
		frappe.get_doc(_payload()).insert(ignore_permissions=True)
		self._next_request()
		frappe.cache.delete_keys("vp_todo_create:")  # stand in for the TTL expiring
		again = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Project Todo", again.name))

	def test_one_request_may_fan_out_identical_todos(self):
		"""api/project.py's template fan-out creates N todos in ONE request, and two
		template rows can legitimately match. A retry is always a SECOND request."""
		first = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		second = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		self.assertNotEqual(first.name, second.name)
		self.assertEqual(self._count(), 2)

	def test_a_server_side_bulk_create_is_not_blocked(self):
		"""No HTTP request: the scheduler, patches and bench calls repeat identities by
		design and have no browser that could double-submit."""
		self._end_request()
		a = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		b = frappe.get_doc(_payload()).insert(ignore_permissions=True)
		self.assertNotEqual(a.name, b.name)
		self.assertEqual(self._count(), 2)

	def test_the_cross_app_create_api_still_works(self):
		"""api/mobile.create_todo is the vedu_erp-facing door; it must keep working."""
		from vernon_project.api.mobile import create_todo

		out = create_todo(
			project_detail=DETAIL, to_do=TITLE + " api", assigned_to=ASSIGNEE,
			start_date="2026-09-12", deadline="2026-09-12", group=GROUP,
			level_id=LEVEL, estimated=60,
		)
		self.assertTrue(out)


if __name__ == "__main__":
	unittest.main()
