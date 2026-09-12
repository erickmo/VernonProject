#!/usr/bin/env bash
# r2dfiifbj5 — one entry point, one role per container.
#
# Checks the database configuration before anything starts, so a missing value
# fails immediately with a message naming the KEY that is wrong — never the value,
# and never the password.
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
require SITE_NAME DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD

case "${DB_HOST}" in
  localhost|127.0.0.1|0.0.0.0|::1)
    echo "Cannot start: DB_HOST points at this container, which has no database." >&2
    exit 78 ;;
esac

SITE_DIR="sites/${SITE_NAME}"

# common_site_config.json holds only non-secret, per-deployment wiring.
cat > sites/common_site_config.json <<JSON
{
  "db_host": "${DB_HOST}",
  "db_port": ${DB_PORT},
  "redis_cache": "redis://redis-cache:6379",
  "redis_queue": "redis://redis-queue:6379",
  "redis_socketio": "redis://redis-queue:6379",
  "socketio_port": ${SOCKETIO_PORT:-9000},
  "webserver_port": ${APP_PORT:-8000},
  "developer_mode": 0
}
JSON

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
