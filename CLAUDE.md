# vernon_project

## Always build every UI change for BOTH frontends

**This app has two frontends and every user-facing UI change ships to both.** `frontend/` = mobile (`/m`),
`frontend-web/` = web (`/w`). A feature, screen, field, button, or layout change done in one is **not done**
until the equivalent exists in the other — same capability, each in its own platform's design system (mobile
Soft-Pop cards; web bento tiles). Shared logic already lives in `frontend/src` (imported as `@` from web);
put behaviour there, keep only the presentation per-frontend. When a change is genuinely one-platform (e.g. a
mobile-only pedometer), say so explicitly — silence is treated as "forgot the other side". Rebuild both
bundles before claiming done.

## Always regenerate the docs data after changing the app's shape

**Added or removed a DocType, a whitelisted endpoint, or a hook? Run `python3 scripts/gen_docs.py`.**
It rewrites `docs/assets/data.js`, which is the only source of facts for the docs site — every count,
table and list on those pages renders from it. Commit the regenerated file with your change.

Nothing else is needed: stdlib only, no bench, no site, no build. The generator exits non-zero if a new
DocType is missing from its `CLUSTERS` map — add it there.

`data.js` is deterministic (no timestamp, no SHA), so `python3 scripts/gen_docs.py && git diff
--exit-code docs/assets/data.js` is the whole staleness check. **It only works while `data.js` stays
tracked** — never gitignore it.

Why this rule exists: the previous docs site hand-typed its facts, said "14 DocTypes" when there were
74, and was wrong within a month. If the code knows it, no human types it.

## Always update What's New after shipping

**After every change that ships a user-visible difference, add a release entry to What's New.** Do it as part
of the task — not only when asked. Ship = the change is live for users (bundle rebuilt, or a Python/data change
active on the site). Skip it only for work no user can see: refactors, docs, tests, build tooling, or a feature
that is inert by default (a setting defaulting to 0/off does nothing until an admin sets it — don't announce it).

The in-app "What's New" screen (`frontend/src/pages/WhatsNew.tsx`, `frontend-web/src/pages/WhatsNew.tsx`) reads
**`App Release` doctype rows** via `api/app_release.py::get_app_releases`. Updating What's New = inserting an
App Release record on the live site. It is **pure data**: no build, no `bench restart`, no migrate. The
`AppRelease` controller is empty, so inserting has no side effects.

`CHANGELOG.md` and `docs/changelog.html` are **stale and are NOT the What's New surface** — leave them alone
unless explicitly asked.

### Writing the entry

| Field | Rule |
|---|---|
| `version` | Semver bump from the newest existing row. Features → minor, small fixes → patch. |
| `release_date` | The date it actually went live (`YYYY-MM-DD`), not the date the code was written. |
| `title` | Bahasa, short, app-store headline. |
| `notes` | Bahasa, **one bullet per line**, plain text, no leading dash — the screen splits on `\n` into `<li>`. |
| `platform` | `Both` / `Web` / `Mobile`. This really filters: a `Web` row never reaches /m. |
| `published` | Must be `1` or it will not show. |

Voice: **Bahasa Indonesia for non-technical end users.** Say what they can now do; never internals (no
endpoint / refactor / component / bundle / commit). Mark platform inline as `(/m & /w)`. Biggest item first,
~6 bullets max — merge small related items rather than dropping them. Match the tone of the existing rows.

Only announce what is genuinely live. Verify before writing: `index.html` names the current hashed bundle in
`vernon_project/public/frontend{,_web}/assets/` — grep that bundle for a distinctive string from the feature.
Source committed but absent from the built bundle is **not shipped**.

### Inserting

Write the rows to a JSON file, then insert loop-free — piping a `for` loop to `bench console` silently
mis-parses, and so does any multi-line statement, so keep it to ONE self-contained line:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/abs/path/releases.json"))])
frappe.db.commit()
EOF
```

Then verify through the real endpoint, once per platform, e.g.:
`frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")`
