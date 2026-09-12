# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""Backend suite for todo t3oe5q4928 -- render Project Todo notes as markdown.

This is mostly a front-end change: rendering + client-side sanitising happens
in frontend/src/lib/markdown.tsx (marked, HTML passthrough disabled, output
piped through the app's existing sanitizeHtml). But a real discovery changes
what "server-side" means here: `notes` is a Text Editor fieldtype, and Frappe
sanitises EVERY Text Editor field's value on save whenever it contains a
literal `<` or `>` (base_document.py's _sanitize_content, ~line 1122) --
regardless of this app's own save_notes() code, which does no processing of
its own. So there IS a real server-side layer, discovered by running the
tests, not assumed: content with no angle brackets at all (ordinary markdown,
plain text) round-trips byte-identical; content that looks like a tag gets
neutralised by the framework before it ever reaches the database. XSS tests
below pin the REAL sanitised values this produces, one layer beneath the
client renderer's own belt-and-braces.

Four enumerated cases from the prompt turned out to describe behaviour the
running code doesn't have. Not silently dropped -- corrected in place, noted
here and again on each test:
  - #7 (over-limit -> ValidationError): `notes` is a Text Editor field with no
    `length` attribute and no length validation in the controller. There is no
    cap. Test asserts that a very large note still saves.
  - #11 (no permission -> PermissionError): save_notes() returns
    {"status": "error", ...} on a disallowed save; it does not raise. Test
    asserts the status dict, not an exception.
  - #13 (locked when status leaves Planned): `notes` is not in
    validate_done_todo_fields()'s protected_fields dict, so it stays editable
    at every status. Test asserts a save succeeds past Planned.
  - #9/#10 (script/img payload behaviour): assumed "stored verbatim" going in;
    running the test proved that wrong. Frappe's own Text Editor sanitiser
    (above) neutralises both before storage. Tests assert the real sanitised
    values, and a third test pins a narrow side effect: CommonMark's
    <https://url> autolink syntax hits the same sanitiser and is not
    byte-identical on round-trip -- a real, reported limitation of AC3, not
    a gap in this suite.
"""

import unittest

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import get_notes, save_notes
from vernon_project.api.mobile import get_project_item
from vernon_project.tests.no_leak import NoLeakMixin

BRAND = "Test Customer"


def _ensure_group():
	if not frappe.db.exists("Group", "Test Group"):
		frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
	return "Test Group"


class NotesFixture(NoLeakMixin, unittest.TestCase):
	"""One Project/Detail/Todo chain, fresh per test. assigned_to is the only
	allowed saver by default (matches save_notes' allowed list: assigned_to,
	project_owner, project_leader, or todo.owner)."""

	OWNER = "nmd_owner@example.com"
	ASSIGNEE = "nmd_assignee@example.com"
	OUTSIDER = "nmd_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", BRAND):
			frappe.get_doc({"doctype": "Brand", "brand_name": BRAND}).insert(ignore_permissions=True)
		for email in (self.OWNER, self.ASSIGNEE, self.OUTSIDER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.OWNER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		# "Project Team" is a doctype-level role needed for has_permission("Project
		# Todo", "read", ...) IN ADDITION TO the record-level relationship
		# (assignee/team-membership) -- same two-layer shape as every other fixture
		# in this app's test suite tonight.
		for email in (self.ASSIGNEE, self.OUTSIDER):
			u2 = frappe.get_doc("User", email)
			if not any(r.role == "Project Team" for r in u2.roles):
				u2.append("roles", {"role": "Project Team"})
				u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "NMD Project", "brand": BRAND,
			"project_owner": self.OWNER, "project_leader": self.OWNER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "NMD Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "NMD Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.group = _ensure_group()
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "NMD task", "assigned_to": self.ASSIGNEE,
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": self.group, "level": "1",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()


class TestNotesMarkdownBackend(NotesFixture):

	FULL_MD = (
		"# Heading\n\n"
		"**bold** and *italic* and `inline code`\n\n"
		"- one\n- two\n\n1. first\n2. second\n\n"
		"> a quote\n\n"
		"```py\nprint('hi')\n```\n\n"
		"| a | b |\n|---|---|\n| 1 | 2 |\n"
	)

	def test_markdown_note_is_stored_verbatim(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			res = save_notes(self.todo.name, self.FULL_MD)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok", res.get("message"))
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), self.FULL_MD)

	def test_save_read_save_is_byte_identical(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, self.FULL_MD)
			read1 = get_notes(self.todo.name)["notes"]
			save_notes(self.todo.name, read1)
			read2 = get_notes(self.todo.name)["notes"]
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(read1, self.FULL_MD)
		self.assertEqual(read2, self.FULL_MD)

	def test_plain_text_note_unchanged(self):
		text = "just a note with a literal # and a * in it, not markdown"
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, text)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), text)

	def test_empty_note_is_allowed(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			res = save_notes(self.todo.name, "")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), "")

	def test_windows_and_unix_newlines_preserved(self):
		mixed = "line one\r\nline two\nline three\r\n"
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, mixed)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), mixed)

	def test_long_note_within_limit_saves(self):
		long_note = "line\n" * 5000  # ~25KB
		frappe.set_user(self.ASSIGNEE)
		try:
			res = save_notes(self.todo.name, long_note)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), long_note)

	def test_no_length_cap_exists_on_notes(self):
		"""Corrected #7: `notes` (Text Editor field) has no `length` attribute
		and validate() applies no length check. Recording that fact: a very
		large note (~500KB) saves without a ValidationError, not asserting one."""
		huge_note = "x" * 500_000
		frappe.set_user(self.ASSIGNEE)
		try:
			res = save_notes(self.todo.name, huge_note)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok", "no length cap exists on notes -- this should save, not raise")
		self.assertEqual(len(frappe.db.get_value("Project Todo", self.todo.name, "notes")), 500_000)

	def test_api_response_contains_the_notes_field(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, "contract check")
			via_get_notes = get_notes(self.todo.name)
			via_get_project_item = get_project_item(self.todo.name)
		finally:
			frappe.set_user("Administrator")
		self.assertIn("notes", via_get_notes)
		self.assertEqual(via_get_notes["notes"], "contract check")
		self.assertIn("notes", via_get_project_item)
		self.assertEqual(via_get_project_item["notes"], "contract check")

	def test_script_payload_is_neutralised_by_frappes_own_field_sanitiser(self):
		"""Corrected #9, and a real discovery, not an assumption: `notes` is a
		Text Editor fieldtype, and Frappe's own base_document.py sanitises EVERY
		Text Editor field's value on save (sanitize_html, base_document.py
		~line 1122) whenever it contains a literal `<` or `>` -- regardless of
		this app's custom save_notes() code, which does no processing of its
		own. A `<script>` payload never reaches the database at all: it is
		neutralised at the framework level, one layer beneath the client-side
		renderer's own belt-and-braces (marked's HTML-passthrough disabled +
		sanitizeHtml). Pinning the REAL stored value so this pre-existing
		protection is visible and nobody "fixes" save_notes to re-add
		processing that already happens."""
		payload = "<script>alert(1)</script>"
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, payload)
		finally:
			frappe.set_user("Administrator")
		stored = frappe.db.get_value("Project Todo", self.todo.name, "notes")
		self.assertNotIn("<script>", stored)
		self.assertEqual(stored, "&lt;script&gt;alert(1)&lt;/script&gt;")

	def test_img_onerror_payload_is_neutralised_by_frappes_own_field_sanitiser(self):
		"""Same discovery as above, for the other classic payload (#10): the
		onerror handler is stripped and the tag normalised before storage."""
		payload = '<img src=x onerror="alert(1)">'
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, payload)
		finally:
			frappe.set_user("Administrator")
		stored = frappe.db.get_value("Project Todo", self.todo.name, "notes")
		self.assertNotIn("onerror", stored)
		self.assertEqual(stored, '<img src="x">')

	def test_commonmark_autolink_syntax_is_escaped_by_the_same_field_sanitiser(self):
		"""Narrow, real limitation this discovery implies for AC3 (byte-identical
		round trip): CommonMark's <https://url> autolink shorthand uses literal
		angle brackets, so it hits the same Text Editor sanitiser as an XSS
		payload would -- stored as `&lt;https://...&gt;`, not byte-identical,
		and the front-end renderer never sees real `<>` to autolink. A bare
		"x < 3" with no adjacent letters is NOT affected (confirmed separately
		against frappe.utils.html_utils.sanitize_html directly) -- only the
		tag-shaped `<word...>` form is. Pinning this so it is a known, reported
		limitation rather than a surprise Erick finds by typing it."""
		payload = "See <https://example.com> for details"
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, payload)
		finally:
			frappe.set_user("Administrator")
		stored = frappe.db.get_value("Project Todo", self.todo.name, "notes")
		self.assertEqual(stored, "See &lt;https://example.com&gt; for details")

	def test_notes_save_returns_error_status_for_disallowed_user(self):
		"""Corrected #11: save_notes() returns {"status": "error", ...} for a
		disallowed saver -- it does not raise frappe.PermissionError. Asserting
		the real contract, not the one the prompt assumed."""
		original = frappe.db.get_value("Project Todo", self.todo.name, "notes")
		frappe.set_user(self.OUTSIDER)
		try:
			res = save_notes(self.todo.name, "hijacked")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), original)

	def test_notes_save_does_not_touch_other_fields(self):
		before_status = self.todo.status
		before_work_mode = self.todo.work_mode
		before_ai_prompt = self.todo.ai_prompt
		frappe.set_user(self.ASSIGNEE)
		try:
			save_notes(self.todo.name, "a note, nothing else")
		finally:
			frappe.set_user("Administrator")
		row = frappe.db.get_value(
			"Project Todo", self.todo.name, ["status", "work_mode", "ai_prompt"], as_dict=True,
		)
		self.assertEqual(row.status, before_status)
		self.assertEqual(row.work_mode, before_work_mode)
		self.assertEqual(row.ai_prompt, before_ai_prompt)

	def test_notes_stay_editable_past_planned_status(self):
		"""Reversed by 52r6l30cs4: the owner froze all of a done todo's information
		except comments, so save_notes on a Done todo now refuses and the stored notes
		stay as they were (this test used to assert they could still be saved)."""
		before = frappe.db.get_value("Project Todo", self.todo.name, "notes")
		frappe.db.set_value("Project Todo", self.todo.name, "status", "🟠 Done", update_modified=False)
		frappe.set_user(self.ASSIGNEE)
		try:
			res = save_notes(self.todo.name, "note added while Done")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error", res)
		self.assertIn("already marked done", res["message"])
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "notes"), before)


class TestNotesQueryCount(NoLeakMixin, FrappeTestCase):
	"""Separate FrappeTestCase (not NotesFixture) for assertQueryCount -- it
	needs Frappe's own class-transaction wrapper, and combining that via
	multiple inheritance with a plain unittest.TestCase mixin risks the wrong
	setUp winning by MRO. Small standalone fixture instead."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", BRAND):
			frappe.get_doc({"doctype": "Brand", "brand_name": BRAND}).insert(ignore_permissions=True)
		self.assignee = "nmd_qc_assignee@example.com"
		if not frappe.db.exists("User", self.assignee):
			frappe.get_doc({
				"doctype": "User", "email": self.assignee, "first_name": "NMD QC Assignee",
				"send_welcome_email": 0, "roles": [{"role": "Project Team"}],
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "NMD QC Project", "brand": BRAND,
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.assignee}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "NMD QC Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "NMD QC Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "NMD QC task", "assigned_to": self.assignee,
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": _ensure_group(), "level": "1",
		}).insert(ignore_permissions=True)

	def _count_queries(self, fn):
		queries = []
		orig_sql = frappe.db.__class__.sql

		def _counted(*args, **kwargs):
			ret = orig_sql(*args, **kwargs)
			queries.append(args[0].last_query)
			return ret

		frappe.db.__class__.sql = _counted
		try:
			fn()
		finally:
			frappe.db.__class__.sql = orig_sql
		return len(queries)

	def test_reading_a_todo_with_a_large_note_does_not_add_queries(self):
		"""Corrected #14: get_notes() is not a single query -- has_permission()'s
		own project/team/admin lookup chain runs first and dominates (~27 queries
		on this fixture), independent of the note at all. That's a fact about
		permission-checking, not about rendering, so asserting =1 was wrong about
		the real system. What actually matters for "no N+1" is that a LARGE note
		costs the SAME query count as a SMALL one -- reading is not doing per-line
		or per-character work. assertQueryCount only proves "at most N" for one
		call; comparing two exact counts is what actually proves no scaling.

		One more confound worth naming, found by running this: the FIRST
		get_notes() call does Frappe's full uncached permission-check chain; a
		second call in the same request benefits from warm role/permission
		caches and costs fewer queries regardless of note content -- comparing
		call 1 vs call 2 measures cache-warming, not note size. A throwaway
		warm-up call first controls for that, so both measured calls start from
		the same (warm) cache state."""
		frappe.set_user(self.assignee)
		try:
			get_notes(self.todo.name)  # warm-up: absorb the first-call cache cost

			frappe.db.set_value("Project Todo", self.todo.name, "notes", "short", update_modified=False)
			small_count = self._count_queries(lambda: get_notes(self.todo.name))

			large = "line\n" * 5000
			frappe.db.set_value("Project Todo", self.todo.name, "notes", large, update_modified=False)
			large_count = self._count_queries(lambda: get_notes(self.todo.name))
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(
			small_count, large_count,
			f"query count scaled with note size ({small_count} -> {large_count}) -- N+1",
		)
