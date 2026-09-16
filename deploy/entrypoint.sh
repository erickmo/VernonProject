#!/usr/bin/env bash
# 8n5c5rgaqa — one entry point, one role per container.
#
# Checks the database AND Redis configuration before anything starts, so a missing
# value fails immediately with a message naming the KEY that is wrong — never the
# value, and never the password. Then it waits, for a bounded number of tries, for
# both to answer on the network, so an unreachable dependency is a clear failure
# rather than a container that looks up and serves 500s.
#
# Starting never changes the database's shape — deploy/migrate.sh is the separate,
# deliberate command for that.
set -euo pipefail

BENCH=/home/frappe/frappe-bench
cd "$BENCH"

require() {
  local missing=()
  for key in "$@"; do
    if [ -z "${!key:-}" ]; then missing+=("$key"); fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "Cannot start: these are not set: ${missing[*]}" >&2
    echo "Set them in deploy/.env (run: python3 deploy/configure.py)." >&2
    exit 78   # EX_CONFIG
  fi
}
require SITE_NAME DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD REDIS_CACHE REDIS_QUEUE

case "${DB_HOST}" in
  localhost|127.0.0.1|0.0.0.0|::1)
    echo "Cannot start: DB_HOST points at this container, which has no database." >&2
    exit 78 ;;
esac

# redis://[user:password@]host[:port][/db] -> HOST and PORT. Pure string work: the
# password, if there is one, is never echoed and never reaches a command line.
split_redis() {
  local rest=${1#*//}
  rest=${rest##*@}
  rest=${rest%%/*}
  HOST=${rest%%:*}
  PORT=${rest##*:}
  [ "$PORT" = "$HOST" ] && PORT=6379
  case "$HOST" in
    localhost|127.0.0.1|0.0.0.0|::1|"")
      echo "Cannot start: $2 points at this container, which has no Redis." >&2
      exit 78 ;;
  esac
}

# Bounded on purpose: a dependency that never comes up must fail, and the ceiling
# is the script's, not whatever the operator exported.
READY_ATTEMPTS="${READY_ATTEMPTS:-30}"
READY_SLEEP="${READY_SLEEP:-2}"
case "$READY_ATTEMPTS" in ""|*[!0-9]*) READY_ATTEMPTS=30 ;; esac
if [ "$READY_ATTEMPTS" -gt 120 ]; then READY_ATTEMPTS=120; fi

wait_for() {
  # $1 host  $2 port  $3 what it is  $4 the setting that names it
  local n=0
  until (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null; do
    n=$((n + 1))
    if [ "$n" -ge "$READY_ATTEMPTS" ]; then
      echo "Cannot start: $3 did not answer after ${READY_ATTEMPTS} tries." >&2
      echo "Check the address in $4, and that this container is allowed to reach it." >&2
      exit 69   # EX_UNAVAILABLE
    fi
    sleep "$READY_SLEEP"
  done
}

wait_for "$DB_HOST" "$DB_PORT" "MariaDB" "DB_HOST and DB_PORT"
split_redis "$REDIS_CACHE" REDIS_CACHE; wait_for "$HOST" "$PORT" "Redis (cache)" REDIS_CACHE
split_redis "$REDIS_QUEUE" REDIS_QUEUE; wait_for "$HOST" "$PORT" "Redis (queue)" REDIS_QUEUE

SITE_DIR="sites/${SITE_NAME}"

# Written 0600: unlike the rest of this file, a Redis URL may carry a password.
# Rewritten on every start, so editing deploy/.env is all an address change needs.
(umask 077; cat > sites/common_site_config.json <<JSON
{
  "db_host": "${DB_HOST}",
  "db_port": ${DB_PORT},
  "redis_cache": "${REDIS_CACHE}",
  "redis_queue": "${REDIS_QUEUE}",
  "redis_socketio": "${REDIS_QUEUE}",
  "socketio_port": ${SOCKETIO_PORT:-9000},
  "webserver_port": ${APP_PORT:-8000},
  "developer_mode": 0
}
JSON
)

if [ ! -f "${SITE_DIR}/site_config.json" ]; then
  case "${SETUP_MODE:-attach}" in
    attach)
      # The database already exists and this app user owns it. Write the site's
      # own config; the password reaches a 0600 file, never a command line.
      mkdir -p "${SITE_DIR}"
      SITE_DIR="$SITE_DIR" python3 -c '
import json, os
conf = {
    "db_name": os.environ["DB_NAME"],
    "db_user": os.environ["DB_USER"],
    "db_password": os.environ["DB_PASSWORD"],
    "db_type": "mariadb",
}
ca = os.environ.get("DB_SSL_CA", "").strip()
if ca:
    conf["db_ssl_ca"] = ca
path = os.path.join(os.environ["SITE_DIR"], "site_config.json")
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as fh:
    json.dump(conf, fh, indent=1)
'
      echo "${SITE_NAME}" > sites/currentsite.txt
      ;;
    create)
      # Creating a site needs ADMIN rights on the remote MariaDB. Those credentials
      # are deliberately NOT part of deploy/.env — pass them only on the single
      # `docker compose run` that creates the site, and they leave with it.
      require DB_ROOT_USER DB_ROOT_PASSWORD ADMIN_PASSWORD
      # frappe reads root_password from common_site_config before it prompts
      # (frappe/database/mariadb/setup_db.py, get_root_connection), so the password
      # goes into a 0600 file rather than onto a command line where the container's
      # own `ps` output would show it. Removed again as soon as the site exists.
      python3 -c '
import json, os
path = "sites/common_site_config.json"
with open(path) as fh:
    conf = json.load(fh)
conf["root_login"] = os.environ["DB_ROOT_USER"]
conf["root_password"] = os.environ["DB_ROOT_PASSWORD"]
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as fh:
    json.dump(conf, fh, indent=1)
'
      set +e
      bench new-site "${SITE_NAME}" --db-name "${DB_NAME}" --no-mariadb-socket --install-app vernon_project
      created=$?
      set -e
      python3 -c '
import json, os
path = "sites/common_site_config.json"
with open(path) as fh:
    conf = json.load(fh)
conf.pop("root_login", None)
conf.pop("root_password", None)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as fh:
    json.dump(conf, fh, indent=1)
'
      if [ "$created" -ne 0 ]; then
        echo "Site creation failed. The admin credentials have been removed from this container." >&2
        exit "$created"
      fi
      ;;
    *)
      echo "Cannot start: SETUP_MODE must be attach or create." >&2
      exit 78 ;;
  esac
fi

case "${1:-web}" in
  web)
    # The sites volume hides the image's own sites/assets, so restore the build
    # over it. This is what makes `docker compose build && up -d` actually ship a
    # new /m, /w or /docs bundle. Only this role does it — it is the one that
    # serves them, so there is exactly one writer whatever else is running.
    mkdir -p sites/assets
    cp -af "${ASSET_STASH:-/home/frappe/assets-image}/." sites/assets/
    exec "$BENCH/env/bin/gunicorn" \
      -b "0.0.0.0:${APP_PORT:-8000}" -w "${GUNICORN_WORKERS:-5}" \
      --max-requests 5000 --max-requests-jitter 500 \
      -t 7200 --graceful-timeout 300 --preload \
      --chdir "$BENCH/sites" --pythonpath "$BENCH" wsgi:application ;;
  websocket)  exec node "$BENCH/apps/frappe/socketio.js" ;;
  scheduler)  exec bench schedule ;;
  worker)     exec bench worker --queue "${WORKER_QUEUE:-default,short,long}" ;;
  check)
    # Readiness: can this container actually reach the database it was given?
    exec bench --site "${SITE_NAME}" execute frappe.ping ;;
  *) exec "$@" ;;
esac
