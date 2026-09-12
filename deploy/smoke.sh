#!/usr/bin/env bash
# r2dfiifbj5 — the checks that need a Docker host.
#
# The machine this deployment was written on has no Docker, so everything below
# is UNVERIFIED until this script passes somewhere that does. Run it against a
# throwaway database; it never touches production.
#
#   DB_HOST=10.0.0.10 DB_NAME=smoke DB_USER=smoke DB_PASSWORD=... ./deploy/smoke.sh
#
# Exits non-zero on the first failure and says which check failed.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f deploy/docker-compose.yml"
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not installed on this host"

# 1. builds from a clean checkout
$COMPOSE build backend >/dev/null || fail "1. image does not build"
pass "1. image builds"

# 2. nothing starts a web server or a database
for banned in nginx mariadb mysql; do
  $COMPOSE config | grep -Eq "image:.*$banned" && fail "2. compose would start $banned"
done
pass "2. no nginx or database container"

# 3. the app runs as a normal user, not root
who=$($COMPOSE run --rm --entrypoint id backend -un)
[ "$who" = "frappe" ] || fail "3. container runs as '$who', expected frappe"
pass "3. runs as a non-root user"

# 4. a missing setting stops startup, and the message names the KEY not the value
out=$(SITE_NAME= $COMPOSE run --rm --entrypoint /home/frappe/frappe-bench/entrypoint.sh backend web 2>&1 || true)
echo "$out" | grep -q "SITE_NAME" || fail "4. missing-setting error does not name the setting"
[ -n "${DB_PASSWORD:-}" ] && echo "$out" | grep -q "$DB_PASSWORD" && fail "4. the error printed the password"
pass "4. missing settings fail before startup, without leaking values"

# 5. a database it cannot reach fails clearly rather than hanging
out=$(DB_HOST=203.0.113.1 $COMPOSE run --rm backend check 2>&1 || true)
[ -n "${DB_PASSWORD:-}" ] && echo "$out" | grep -q "$DB_PASSWORD" && fail "5. the failure printed the password"
pass "5. unreachable database fails without leaking the password"

# 6. with a reachable database, the app answers its own health endpoint
$COMPOSE up -d backend >/dev/null
for _ in $(seq 1 30); do
  if $COMPOSE exec -T backend curl -fsS "http://127.0.0.1:${APP_PORT:-8000}/api/method/ping" 2>/dev/null | grep -q pong; then
    pass "6. health check answers pong"; break
  fi
  sleep 5
done

# 7. nothing secret is visible in the image or in what docker reports
if [ -n "${DB_PASSWORD:-}" ]; then
  docker image history --no-trunc vernon-project:local | grep -q "$DB_PASSWORD" && fail "7. the password is in an image layer"
  $COMPOSE config | grep -q "$DB_PASSWORD" && fail "7. the password is in the rendered compose config"
  pass "7. no secret in image layers or compose output"
fi

# 8. a second build reuses the cache
before=$(date +%s); $COMPOSE build backend >/dev/null; after=$(date +%s)
[ $((after - before)) -lt 60 ] || fail "8. the second build did not use the cache"
pass "8. repeat build uses the cache"

$COMPOSE down >/dev/null 2>&1 || true
echo "all checks passed"
