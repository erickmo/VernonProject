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


if __name__ == "__main__":
    unittest.main()
