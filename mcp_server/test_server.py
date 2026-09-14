"""call_api_method must never let a bare exception escape — the MCPServer
runtime replaces any exception that isn't ToolError with a message-free
"Error executing tool call_api_method", discarding exactly the HTTP status +
Frappe error text a caller needs to self-correct. Run: python3 test_server.py
(inside mcp_server/.venv)."""
import unittest
from unittest.mock import Mock, patch

import requests

import server as srv
from mcp.server.mcpserver.exceptions import ToolError

METHOD = next(iter(srv._KNOWN))  # any real whitelisted method; content doesn't matter here


class TestCallApiMethod(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(srv, "API_KEY", "k")
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(srv, "API_SECRET", "s")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_unknown_method_raises_tool_error(self):
        with self.assertRaises(ToolError):
            srv.call_api_method("not.a.real.method")

    def test_non_2xx_response_raises_tool_error_with_detail(self):
        resp = Mock(ok=False, status_code=403)
        resp.json.return_value = {"exception": "frappe.exceptions.PermissionError: nope"}
        with patch.object(srv.requests, "post", return_value=resp):
            with self.assertRaises(ToolError) as ctx:
                srv.call_api_method(METHOD)
        self.assertIn("403", str(ctx.exception))
        self.assertIn("PermissionError", str(ctx.exception))

    def test_non_json_response_raises_tool_error_not_bare_valueerror(self):
        resp = Mock(ok=False, status_code=502)
        resp.json.side_effect = ValueError("not json")
        resp.text = "<html>Bad Gateway</html>"
        with patch.object(srv.requests, "post", return_value=resp):
            with self.assertRaises(ToolError) as ctx:
                srv.call_api_method(METHOD)
        self.assertIn("502", str(ctx.exception))

    def test_connection_failure_raises_tool_error(self):
        with patch.object(srv.requests, "post", side_effect=requests.ConnectionError("refused")):
            with self.assertRaises(ToolError) as ctx:
                srv.call_api_method(METHOD)
        self.assertIn("refused", str(ctx.exception))

    def test_success_returns_message_body(self):
        resp = Mock(ok=True, status_code=200)
        resp.json.return_value = {"message": {"created_todos": 0}}
        with patch.object(srv.requests, "post", return_value=resp):
            self.assertEqual(srv.call_api_method(METHOD), {"created_todos": 0})




class TestManifestDocumentsAiInProgress(unittest.TestCase):
    """The scanned docstring IS the tool description an MCP client reads, so an
    agent can only drive `ai_in_progress` if update_todo's docstring names it and
    says what it means. This is what breaks if someone trims that docstring back
    to its old one-liner — the flag would still work and no agent would know."""

    def _doc(self, method):
        return next(t["doc"] for t in srv._MANIFEST if t["method"] == method)

    def test_update_todo_description_names_the_flag_and_its_gate(self):
        doc = self._doc("vernon_project.api.mobile.update_todo")
        self.assertIn("ai_in_progress", doc)
        self.assertIn("work_mode", doc)  # the tag an agent must set first

    def test_update_todo_description_does_not_call_it_a_phase(self):
        # ir3j5rjmk6 asked whether this should become "AI tag = 4". It must not:
        # the ladder is monotonic and this flag is not. Say so where agents read.
        doc = self._doc("vernon_project.api.mobile.update_todo")
        self.assertIn("NOT a fourth AI phase", doc)


# Every @frappe.whitelist() in vernon_project/api is published as an MCP tool whose
# DESCRIPTION IS ITS DOCSTRING, verbatim. So an argument the docstring never names is
# an argument no agent can use correctly — on the writes because guessing one mutates
# data, and on the reads because guessing one quietly returns the wrong rows. These
# two tuples pin the audited set; the rest of the 319-tool manifest is still being
# worked through, so this is a floor to grow, not a finished job.
AUDITED_WRITE_TOOLS = (
    "vernon_project.api.mobile.update_my_profile",
    "vernon_project.api.mobile.create_todo",
    "vernon_project.api.mobile.update_todo",
    "vernon_project.api.employee_admin.save_user_with_profile",
    "vernon_project.api.focus.save_timer",
    "vernon_project.api.announcement.save_announcement",
    "vernon_project.api.attendance.request_exception",
)

# The reads an MCP client reaches for first. Same rule, and the same test below runs
# over both tuples — the split is only so a reviewer can see which slice is which.
AUDITED_READ_TOOLS = (
    "vernon_project.api.attendance.my_attendance",
    "vernon_project.api.attendance.my_exceptions",
    "vernon_project.api.attendance.pending_exception_approvals",
    "vernon_project.api.attendance.attendance_report",
    "vernon_project.api.attendance.admin_list_leave_types",
    "vernon_project.api.mobile.get_notifications",
    "vernon_project.api.mobile.get_project_detail",
    "vernon_project.api.mobile.run_report",
    "vernon_project.api.mobile.get_team_activity",
    "vernon_project.api.mobile.get_user_points_log",
    "vernon_project.api.mobile.get_leaderboard",
    "vernon_project.api.mobile.list_meetings",
    "vernon_project.api.mobile.meeting_invitable_users",
    "vernon_project.api.mobile.get_crate_status",
    "vernon_project.api.mobile.get_gamification",
    "vernon_project.api.mobile.get_gamification_settings",
    "vernon_project.api.project_todo.search_todos",
    "vernon_project.api.teguran.get_teguran_all",
    "vernon_project.api.certificate.list_certificates",
    "vernon_project.api.certificate.my_score",
)


def _tool(method):
    return next(t for t in srv._MANIFEST if t["method"] == method)


def _optional_args(signature):
    """Argument names carrying a default, read back off the scanned signature."""
    inner = signature[signature.index("(") + 1 : signature.rindex(")")]
    out, depth, part = [], 0, ""
    for ch in inner:  # a default can itself contain a comma, e.g. f(x=(1, 2))
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(part)
            part = ""
        else:
            part += ch
    out.append(part)
    return [p.split("=")[0].strip() for p in out if "=" in p]


class TestAuditedToolsDocumentTheirArguments(unittest.TestCase):
    def _tool(self, method):
        return _tool(method)

    def test_every_optional_argument_is_named_in_the_description(self):
        for method in AUDITED_WRITE_TOOLS + AUDITED_READ_TOOLS:
            tool = _tool(method)
            doc = tool["doc"]
            self.assertTrue(doc.strip(), f"{method} has an empty MCP description")
            for arg in _optional_args(tool["signature"]):
                self.assertIn(arg, doc, f"{method}: optional arg {arg!r} is undocumented")

    def test_the_audited_names_are_all_real_tools(self):
        """A typo in either tuple would otherwise make the loop above scan nothing
        for that entry and still pass."""
        known = {t["method"] for t in srv._MANIFEST}
        for method in AUDITED_WRITE_TOOLS + AUDITED_READ_TOOLS:
            self.assertIn(method, known, f"{method} is not in the scanned manifest")

    def test_omission_is_documented_as_safe_on_the_repaired_arguments(self):
        """roles, enabled and published used to be written on every call, so
        omitting one stripped a user's roles, re-enabled a disabled account, or
        unpublished a live banner. They are guarded now — and the descriptions have
        to SAY they are guarded, because an agent that still believes the old
        behaviour will keep sending defensive values it no longer needs, and an
        agent that never knew it cannot tell [] from "not editing roles"."""
        admin = self._tool("vernon_project.api.employee_admin.save_user_with_profile")["doc"]
        self.assertIn('EVERY argument means "leave as is" when omitted', admin)
        self.assertIn("send [] to clear them", admin)

        ann = self._tool("vernon_project.api.announcement.save_announcement")["doc"]
        self.assertIn('Omitted means "leave as is"', ann)

    def test_the_replace_not_append_child_tables_stay_flagged(self):
        """This one is NOT a bug and was not changed: present means replace. It is
        the wrapper in api.ts that has to omit them, and its comment says so."""
        profile = self._tool("vernon_project.api.mobile.update_my_profile")["doc"]
        self.assertIn("REPLACES the whole table", profile)

    def test_request_exception_warns_that_failures_arrive_as_200(self):
        """Its refusals are a normal 200 with status:"error", so a caller that only
        checks the HTTP status reports a rejected leave request as filed."""
        doc = self._tool("vernon_project.api.attendance.request_exception")["doc"]
        self.assertIn('"status": "error"', doc)

    def test_save_timer_warns_agents_off_inventing_tracked_time(self):
        doc = self._tool("vernon_project.api.focus.save_timer")["doc"]
        self.assertIn("focus.set_note", doc)


class TestAuditedReadToolsWarnAboutTheirTraps(unittest.TestCase):
    """A read that silently returns the wrong rows is worse than one that fails:
    the agent reports the number it got. These are the six shapes where the
    description is the only thing standing between a caller and a confident wrong
    answer, so each one has to keep saying so."""

    def _doc(self, method):
        return _tool(method)["doc"]

    def test_get_gamification_is_declared_a_write(self):
        """It is named get_ and it GRANTS: level rewards, achievement points and
        avatar assets land on every call. An agent polling it to read a level is
        awarding points as a side effect."""
        doc = self._doc("vernon_project.api.mobile.get_gamification")
        self.assertIn("GRANTS", doc)
        self.assertIn("do not poll it", doc)

    def test_run_report_admits_it_truncates_rows_but_not_total(self):
        """rows stops at 300, total does not, and there is no offset — so above
        300 the rest is unreachable rather than paginated."""
        doc = self._doc("vernon_project.api.mobile.run_report")
        self.assertIn("TRUNCATED", doc)
        self.assertIn("300", doc)

    def test_get_project_detail_warns_the_counts_outlive_the_filter(self):
        """include_cancelled filters the array and not the counters, so counting
        project_items under-reports by exactly cancelled_count."""
        doc = self._doc("vernon_project.api.mobile.get_project_detail")
        self.assertIn("Do not derive counts by", doc)

    def test_leaderboard_brand_filter_names_what_it_drops(self):
        """brand JOINs through Project, so every project-less ledger row (gifts,
        daily, achievements, most Recognition) leaves the board when it is set."""
        doc = self._doc("vernon_project.api.mobile.get_leaderboard")
        self.assertIn("no project", doc)
        self.assertIn("silently coerced", doc)  # a typo'd period is not rejected

    def test_meeting_invitable_users_warns_that_it_never_raises(self):
        """No permission, no project, no team and no match are the same empty
        success, so an empty list is not evidence of an empty team."""
        doc = self._doc("vernon_project.api.mobile.meeting_invitable_users")
        self.assertIn("NEVER raises", doc)

    def test_my_score_warns_the_future_clamp_is_defaults_only(self):
        """An explicitly supplied future period_end is not pulled back to today,
        so it scores over days not yet worked."""
        doc = self._doc("vernon_project.api.certificate.my_score")
        self.assertIn("explicitly supplied pair is NOT", doc)

    def test_the_capped_reads_say_the_cap_is_a_ceiling_not_a_page(self):
        """Each of these clamps limit and offers no offset, so the clamp is the
        most the endpoint can ever reach — worth saying, because the caller's own
        larger limit comes back as success."""
        for method, cap in (
            ("vernon_project.api.attendance.my_attendance", "200"),
            ("vernon_project.api.attendance.my_exceptions", "200"),
            ("vernon_project.api.mobile.get_user_points_log", "500"),
        ):
            doc = self._doc(method)
            self.assertIn(cap, doc, f"{method} does not name its cap")
            self.assertIn("ceiling", doc, f"{method} does not call the cap a ceiling")


# NOTE: this must stay at the BOTTOM. It used to sit mid-file, and since the module
# body runs top to bottom, every test class defined below it was never collected —
# the file printed OK while silently skipping them.
if __name__ == "__main__":
    unittest.main()
