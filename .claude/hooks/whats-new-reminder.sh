#!/usr/bin/env bash
# Stop hook: if the built frontend bundles changed but no App Release row was added,
# remind Claude once per session. See CLAUDE.md → "Always update What's New after shipping".
#
# Silent unless a rebuild is actually sitting in the tree, and fires at most once per
# session — a Stop hook that nags every turn gets ignored, and one that always blocks spins.

REPO=/home/frappe/frappe-bench/apps/vernon_project
cd "$REPO" 2>/dev/null || exit 0

# stdin is the hook payload; read it before anything else consumes it.
SID=$(jq -r '.session_id // "nosession"' 2>/dev/null || echo nosession)

# index.html names the hashed bundle, so it changes on every real rebuild.
# --quiet: 0 = clean, 1 = differs, anything else = error → stay silent on error.
git diff --quiet HEAD -- \
  vernon_project/public/frontend/index.html \
  vernon_project/public/frontend_web/index.html 2>/dev/null
[ $? -eq 1 ] || exit 0

MARK="/tmp/claude-app-release-reminded-$SID"
[ -f "$MARK" ] && exit 0
touch "$MARK" 2>/dev/null

cat <<'JSON'
{"decision":"block","reason":"The frontend bundles were rebuilt this session, so something may have shipped to users. Per CLAUDE.md, a user-visible change needs an App Release row (the in-app What's New) — Bahasa, one bullet per line, published=1, correct platform, semver-bumped from the newest existing row. If you already added it, or the rebuild carried nothing a user would notice (refactor, docs, tests, or an inert default), say so in one line and stop. This check fires only once per session."}
JSON
