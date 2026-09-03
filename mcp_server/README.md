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

## Remote (claude.ai Connectors)

The same server also runs as a standalone HTTPS endpoint for claude.ai
Settings > Connectors, at `https://mcp.vernon.id/mcp` — separate from the
stdio one above (different transport, always-on instead of spawned per
session). Secured with a static token in the URL (`?token=...`) instead of
full OAuth: this is a single-user personal server that claude.ai just
replays the exact URL for, so a bearer secret baked in is enough — no
dynamic client registration / authorize / token endpoints to build or run.

Stack: Cloudflare DNS (proxied, terminates TLS) → nginx (`mcp_server/nginx.conf`,
installed at `/etc/nginx/conf.d/mcp-vernon.conf`) → supervisor-managed process
on `127.0.0.1:8811` (`mcp_server/supervisor.conf`, installed at
`/etc/supervisor/conf.d/vernon-mcp.conf`, program `vernon-mcp-http`) →
`run_http.sh` (loads `mcp_server/.env.http`, gitignored) → `server.py --http`.

To (re)install after editing `nginx.conf` / `supervisor.conf`:

```bash
sudo cp mcp_server/nginx.conf /etc/nginx/conf.d/mcp-vernon.conf
sudo nginx -t && sudo systemctl reload nginx
sudo cp mcp_server/supervisor.conf /etc/supervisor/conf.d/vernon-mcp.conf
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl restart vernon-mcp-http   # after editing server.py/.env.http
```

`.env.http` needs the same `VERNON_API_KEY`/`VERNON_API_SECRET` as `.env`,
plus `VERNON_MCP_TRANSPORT=http`, `VERNON_MCP_TOKEN` (a long random secret —
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`),
`VERNON_MCP_HOST`/`VERNON_MCP_PORT` (default `mcp.vernon.id` / `8811`).

The connector URL to paste into claude.ai is `https://mcp.vernon.id/mcp?token=<VERNON_MCP_TOKEN>`.
Rotating the token: change it in `.env.http`, `sudo supervisorctl restart vernon-mcp-http`,
update the connector URL in claude.ai.

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
