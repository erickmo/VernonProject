#!/usr/bin/env bash
# 8n5c5rgaqa — the only supported way to change this deployment's database shape.
#
#   ./deploy/migrate.sh YOUR_SITE --i-have-a-backup
#
# Starting a container never does this. It is a separate command because it is the
# one operation here that can lose data, and both guards below run BEFORE Docker is
# touched: naming the wrong site, or not having a backup, costs you nothing.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="deploy/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Cannot migrate: there is no deploy/.env here." >&2
  echo "Run: python3 deploy/configure.py" >&2
  exit 78   # EX_CONFIG
fi

# The site this deployment is actually configured for. Read from the install file,
# never guessed and never taken from the command line.
CONFIGURED=$(sed -n 's/^SITE_NAME=//p' "$ENV_FILE" | tail -1)
if [ -z "$CONFIGURED" ]; then
  echo "Cannot migrate: SITE_NAME is not set in deploy/.env." >&2
  exit 78
fi

SITE=""
BACKUP=no
for arg in "$@"; do
  case "$arg" in
    --i-have-a-backup) BACKUP=yes ;;
    -*) echo "Cannot migrate: unknown option." >&2; exit 64 ;;   # EX_USAGE
    *)  SITE="$arg" ;;
  esac
done

if [ "$SITE" != "$CONFIGURED" ]; then
  echo "Cannot migrate: that is not the site in deploy/.env." >&2
  echo "Run it against the site named by SITE_NAME, and nothing else:" >&2
  echo "  ./deploy/migrate.sh \$(sed -n 's/^SITE_NAME=//p' deploy/.env) --i-have-a-backup" >&2
  exit 78
fi

if [ "$BACKUP" != "yes" ]; then
  echo "Cannot migrate: this changes your database and can lose data." >&2
  echo "Take a backup first, then say so:" >&2
  echo "  ./deploy/migrate.sh $CONFIGURED --i-have-a-backup" >&2
  exit 78
fi

echo "Migrating $CONFIGURED ..."
exec docker compose -f deploy/docker-compose.yml run --rm backend \
  bench --site "$CONFIGURED" migrate
