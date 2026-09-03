# vernon_project MCP server

Exposes vernon_project's whitelisted `api/*.py` functions as two MCP tools —
`list_api_methods` (discover) and `call_api_method` (invoke) — so an MCP
client (Claude Code, Claude Desktop) can call the live site the same way the
mobile/web frontends do. No frappe import: it's an isolated venv that talks
to `project.vernon.id` over HTTP with an API key, so it never touches the
shared bench venv. Frappe's own `@frappe.whitelist()` + doc-permission checks
do all the access control, scoped to whichever user the key belongs to.

## Setup (one-time)

```bash
cd mcp_server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Generate an API key/secret for the user you want the server to act as (their
existing permissions apply to every call):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
u = frappe.get_doc("User", "mo@vernon.id")
secret = u.api_secret if u.api_key else None
if not u.api_key:
    u.api_key = frappe.generate_hash(length=15)
    secret = frappe.generate_hash(length=15)
    u.api_secret = secret
    u.save(ignore_permissions=True)
    frappe.db.commit()
print("key:", u.api_key, "secret:", secret or "(already set — see User doctype, secret not re-shown)")
EOF
```

Paste `key`/`secret` into `mcp_server/.env` (`VERNON_API_KEY` / `VERNON_API_SECRET`).
`.env` and `.venv/` are gitignored — never commit them.

Claude Code picks this server up automatically from the project's `.mcp.json`
(run `/mcp` inside a session in this repo to check its status).

## Tools

- `list_api_methods(search="")` — every `@frappe.whitelist()` function found
  by scanning `vernon_project/api/*.py` (dotted path, signature, docstring).
  Always in sync with the code — nothing to maintain by hand.
- `call_api_method(method, kwargs={})` — calls one of those methods on the
  live site and returns its `message` payload.

## Scope

Only methods actually found under `vernon_project.api.*` can be called —
`call_api_method` rejects anything else, so this can't be used to reach
generic `frappe.client.*` doctype CRUD.
