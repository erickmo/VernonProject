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

  The scan runs **once at import**, so after adding or removing an endpoint
  the running server still serves the old list and `call_api_method` rejects
  the new method as unknown. Restart it: `sudo supervisorctl restart
  vernon-mcp-http` (or `kill -TERM` the pid on 8811 — supervisor's
  `autorestart` brings it back in ~4s). The stdio server rescans every
  session, so it needs nothing.
- `call_api_method(method, kwargs={})` — calls one of those methods on the
  live site and returns its `message` payload.

## Agent brief — AI todos (3-phase ladder)

Paste this to an agent connecting through the connector. It is the whole
contract; everything in it is reachable through `call_api_method`.

> **VernonProject: AI todos run on a 3-phase ladder.**
>
> Your queue is `vernon_project.api.project_todo.get_confirmed_ai_todos` —
> Planned AI todos assigned to you whose prompt a human has confirmed. Each
> row carries its `ai_prompts` (`[{name, prompt}]`), so no second call. Work
> nothing outside this list: phases 1 and 2 are not yours.
>
> - **Fase 1 · Ditandai AI** — tagged AI, no prompt yet. Whoever writes prompts
>   finds them with `get_ai_todos_needing_prompt` and saves with
>   `save_ai_prompt(todo_id, ai_prompt)`, where `ai_prompt` is a JSON list of
>   `{"name": ..., "prompt": ...}`.
> - **Fase 2 · Prompt Draf** — a prompt exists but no human has signed it off.
>   Not runnable.
> - **Fase 3 · Prompt Terkonfirmasi** — a human called
>   `confirm_ai_prompt(todo_id, confirmed=1)`. Runnable, and only now.
>
> Rules:
> - `confirm_ai_prompt` is the human's action. Never call it on your own work.
> - Any prompt edit (`save_ai_prompt` / `delete_ai_prompt`) drops the todo back
>   to phase 2. Re-read the queue instead of caching it — a todo can leave it
>   while you hold it.
> - When you finish, do **not** just mark it Done. Call
>   `follow_up_check(todo_id, assignee)` — it creates the "(Follow Up)"
>   ask-someone-to-check todo for that person, links it to yours, notifies
>   them, and marks yours Done in one call. `assignee` must be on the
>   project team. Everything else is optional: `note`, `estimated` (default
>   10 min, floored at 5), `deadline` (default tomorrow), `group`/`level_id`
>   (default the Testing work-type).
> - Tagging a todo as AI at all needs the "AI User" role on the account the
>   API key belongs to (System Manager also passes).

## Scope

Only methods actually found under `vernon_project.api.*` can be called —
`call_api_method` rejects anything else, so this can't be used to reach
generic `frappe.client.*` doctype CRUD.
