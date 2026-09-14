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


# Every @frappe.whitelist() in vernon_project/api is published as an MCP tool whose
# DESCRIPTION IS ITS DOCSTRING, verbatim. So for a write endpoint, an argument the
# docstring never names is an argument no agent can use correctly — and on the six
# below, several of them mutate data when guessed wrong. These pin the audited set;
# 28% of the 319-tool manifest still has no description at all, so this is a floor
# to grow, not a finished job.
# mobile.update_todo belongs in this set and is audited on the ai/ir3j5rjmk6 branch,
# which carries both its docstring and its own assertions. It is left out HERE so this
# branch is green standing alone; add it to this tuple once the two have merged.
AUDITED_WRITE_TOOLS = (
    "vernon_project.api.mobile.update_my_profile",
    "vernon_project.api.mobile.create_todo",
    "vernon_project.api.employee_admin.save_user_with_profile",
    "vernon_project.api.focus.save_timer",
    "vernon_project.api.announcement.save_announcement",
    "vernon_project.api.attendance.request_exception",
)


class TestAuditedWriteToolsDocumentTheirArguments(unittest.TestCase):
    def _tool(self, method):
        return next(t for t in srv._MANIFEST if t["method"] == method)

    def _optional_args(self, signature):
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

    def test_every_optional_argument_is_named_in_the_description(self):
        for method in AUDITED_WRITE_TOOLS:
            tool = self._tool(method)
            doc = tool["doc"]
            self.assertTrue(doc.strip(), f"{method} has an empty MCP description")
            for arg in self._optional_args(tool["signature"]):
                self.assertIn(arg, doc, f"{method}: optional arg {arg!r} is undocumented")

    def test_the_destructive_defaults_are_spelled_out(self):
        """Four arguments do NOT mean "leave as is" when omitted. An agent that
        assumes they do will strip a user's roles, re-enable a disabled account,
        unpublish a live banner, or wipe a child table. Say so, or nobody knows."""
        admin = self._tool("vernon_project.api.employee_admin.save_user_with_profile")["doc"]
        self.assertIn("STRIPS EVERY VERNON ROLE", admin)
        self.assertIn("RE-ENABLES", admin)

        profile = self._tool("vernon_project.api.mobile.update_my_profile")["doc"]
        self.assertIn("REPLACES the whole table", profile)

        ann = self._tool("vernon_project.api.announcement.save_announcement")["doc"]
        self.assertIn("DEFAULTS TO 0", ann)

    def test_request_exception_warns_that_failures_arrive_as_200(self):
        """Its refusals are a normal 200 with status:"error", so a caller that only
        checks the HTTP status reports a rejected leave request as filed."""
        doc = self._tool("vernon_project.api.attendance.request_exception")["doc"]
        self.assertIn('"status": "error"', doc)

    def test_save_timer_warns_agents_off_inventing_tracked_time(self):
        doc = self._tool("vernon_project.api.focus.save_timer")["doc"]
        self.assertIn("focus.set_note", doc)


# NOTE: this must stay at the BOTTOM. It used to sit mid-file, and since the module
# body runs top to bottom, every test class defined below it was never collected —
# the file reported OK while silently skipping them.
if __name__ == "__main__":
    unittest.main()
