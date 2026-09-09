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
`VERNON_MCP_HOST`/`VERNON_MCP_PORT` (default `mcp.vernon.id` / `8811`) and
`VERNON_MCP_ORIGINS` (default `https://claude.ai,https://claude.com`). That last
one matters: the SDK's DNS-rebinding guard 403s **any** `Origin` it wasn't given,
and claude.ai always sends one — curl without `Origin` passing proves nothing.

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
>   finds them with `get_ai_todos_needing_prompt(envelope=1, include_context=1)`
>   (see "Payload-size flags" below); if more detail is still needed, pull it
>   with `get_ai_todo_context(todo_id)` / `get_ai_project_context(project)`
>   ("Lean context reads" below) instead of `get_project_item` / `get_project` —
>   and saves with `save_ai_prompt(todo_id, ai_prompt, return_prompts=0)`,
>   where `ai_prompt` is a JSON list of `{"name": ..., "prompt": ...}`.
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

## Payload-size flags (2026-09-09)

An hourly agent polling `get_ai_todos_needing_prompt` re-sends the full response
on every turn, so its size is a recurring cost, not a one-off. Both flags below
default to today's behavior — a call with no arguments is unchanged.

`get_ai_todos_needing_prompt(envelope=0, include_context=0, limit=None)`:
- `envelope=1` wraps the list as `{ok, count, server_time, user, todos}`. An
  empty queue used to come back as a bare `[]` (2 bytes) — indistinguishable
  from "call broke and returned nothing" without a second round-trip. Measured
  on the live queue: `envelope=1` on an empty queue is 106 bytes and
  unambiguous (`count: 0`).
- `include_context=1` adds `notes`, `project_detail_title`, `level_type`,
  `group`, `estimated`, `creator`, `is_follow_up`, `issue_of`,
  `issue_of_title`, `blocked_by`, `blocking` per row — the fields an agent was
  otherwise fetching one `get_project_item` call at a time just to read the
  notes. Measured on the live site: one such call is **44,786 bytes** for a
  single todo; `include_context=1` folds that into the list response instead.
- `limit` caps the row count (hard max 200). Batched queries throughout — a
  fixed number of queries (main + 3 lookups) regardless of row count.

`save_ai_prompt(todo_id, ai_prompt, return_prompts=1)`:
- `return_prompts=0` drops the prompt-body echo, returning
  `{status, message, count, names}` instead of the full `ai_prompts` list.
  Measured on the live site's largest stored prompt set: the full echo is
  **27,494 bytes**; the lean response is **309 bytes** (~99% smaller) —
  storage, validation and permissions are identical either way.

Both flags arrive as strings over the whitelisted HTTP path (`"0"`/`"1"`),
so they're coerced with `frappe.utils.cint()` server-side — pass them as
plain `0`/`1` and it works the same from any caller.

## Lean context reads (2026-09-09, part 2)

`get_project_item` / `get_project` carry a whole screen's worth of data — team
rosters, avatar configs, every sibling todo, timeline, allocations — most of
which an agent writing an AI prompt never reads. Two new endpoints return only
what that step actually needs:

- `get_ai_todo_context(todo_id)` — name, to_do, status, work_mode, ai_phase,
  `ai_prompts_count` (an integer — **never** the prompt text), deadline,
  estimated, group, level_type, creator, assigned_to, project, project_name,
  brand, project_detail, project_detail_title, notes, is_follow_up, issue_of,
  issue_of_title, issue_of_notes, `blocked_by`/`blocking` (as
  `[{name, to_do}]`), and `sibling_detail_titles` (the project's other
  sub-module titles, deduplicated). Measured on the live site's largest real
  todo: `get_project_item` is **94,907 bytes**; `get_ai_todo_context` is
  **5,180 bytes** (~94% smaller).
- `get_ai_project_context(project)` — name, project_name, brand, goal,
  context, success_condition, failure_condition, groupings, and
  `project_details` as `[{name, title}]`. No team, no todo counts. Measured on
  the same project: `get_project` is **6,303 bytes**; `get_ai_project_context`
  is **380 bytes** (~94% smaller).

Same read gates as the endpoints they replace (`frappe.has_permission` for the
todo, `_visible_projects()` for the project) — reused, not duplicated, so
access never widens. An unknown id/name raises `DoesNotExistError`; a real one
the caller can't see raises `PermissionError`.

## Scope

Only methods actually found under `vernon_project.api.*` can be called —
`call_api_method` rejects anything else, so this can't be used to reach
generic `frappe.client.*` doctype CRUD.
