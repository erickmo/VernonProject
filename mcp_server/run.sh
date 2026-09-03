#!/usr/bin/env bash
# Entry point Claude Code (.mcp.json) execs. Loads secrets from .env (gitignored,
# never committed) then runs the server in its own venv — isolated from the
# shared bench venv on purpose, see README.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[ -f .env ] && set -a && source .env && set +a
exec .venv/bin/python server.py
