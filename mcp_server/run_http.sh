#!/usr/bin/env bash
# supervisor's command= for vernon-mcp-http. Loads secrets from .env.http
# (gitignored, never committed) — keeps supervisor.conf itself secret-free.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
set -a && source .env.http && set +a
exec .venv/bin/python server.py
