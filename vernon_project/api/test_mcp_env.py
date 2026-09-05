"""Dotenv parsing behind the MCP connector URL. Pure — no site, no DB, no frappe.

Run: `python3 vernon_project/api/test_mcp_env.py`
"""

import ast
from pathlib import Path

# Import without pulling in frappe: grab just the pure function out of the module.
_SRC = Path(__file__).with_name("api_token.py").read_text()
_FN = next(
	n for n in ast.parse(_SRC).body
	if isinstance(n, ast.FunctionDef) and n.name == "mcp_token_from_env"
)
_ns = {}
exec(compile(ast.Module(body=[_FN], type_ignores=[]), "<api_token>", "exec"), _ns)
mcp_token_from_env = _ns["mcp_token_from_env"]


def check():
	# Normal file: token found, host taken from the env.
	assert mcp_token_from_env("VERNON_MCP_TOKEN=abc\nVERNON_MCP_HOST=mcp.example\n") == ("abc", "mcp.example")
	# Comments, blanks and junk lines are skipped; quotes stripped.
	assert mcp_token_from_env('# c\n\nnoequals\nVERNON_MCP_TOKEN="a=b"\n') == ("a=b", "mcp.vernon.id")
	# Missing/empty token must be falsy so the caller falls back to the placeholder.
	assert mcp_token_from_env("VERNON_API_KEY=x\n")[0] is None
	assert not mcp_token_from_env("VERNON_MCP_TOKEN=\n")[0]
	return "mcp_token_from_env: all assertions passed"


if __name__ == "__main__":
	print(check())
