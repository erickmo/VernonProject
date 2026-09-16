# Deploying Vernon Project with Docker

Copy this repository to any device, answer a few questions, and start it. There
is no nginx, no database and no Redis in here on purpose — all three are yours,
and all three are reached over your own network.

## What runs, and what does not

Started by this deployment: the app (web), realtime (socket.io), the scheduler,
and two job workers. That is the whole service list.

**Not** started: nginx, MariaDB, Redis. You already run them; this connects to
them. `configure.py` asks for their addresses and nothing here ever builds,
starts or stores a copy of them.

Because there is no nginx inside, the app serves its own static files (see
`wsgi.py`) — that includes the mobile app at `/m`, the web app at `/w` and the
docs at `/docs`, all built into the image. Your nginx is a plain reverse proxy.

## Setting it up

```bash
python3 deploy/configure.py
docker compose -f deploy/docker-compose.yml up -d
```

`configure.py` asks whether this is a new deployment or an update, then asks for
the database and Redis details. It writes `deploy/.env`, readable only by you, and starts
nothing. Run it again any time: choose *update*, press Enter through anything you
do not want to change, and only what you answered is touched.

Your password is never echoed, never becomes a command-line argument (so it does
not appear in `ps` or in shell history), and is never built into the image.

## Where your database is

**On the private network** — the normal case. Give `configure.py` the private
address of the MariaDB host. Nothing else is needed.

**On another device** — the database is reachable, but over a network you have
not told us is private. Set `DB_SSL_CA` to the path of your database's CA
certificate *inside the container* and mount it:

```yaml
# deploy/docker-compose.yml, under x-app: &app
volumes:
  - /etc/ssl/mariadb/ca.pem:/certs/ca.pem:ro
```

then answer `/certs/ca.pem` when asked. If you leave it blank, `configure.py`
warns you: the database password would cross that network in the clear.

Either way, this deployment changes nothing on your database server. Grants,
firewall rules and TLS on the MariaDB side are yours.

## Your Redis

Two addresses, because Frappe uses two: a cache and a job queue. Realtime shares
the queue's Redis, which is what Frappe does itself.

```
REDIS_CACHE=redis://10.0.0.11:6379/0
REDIS_QUEUE=redis://10.0.0.11:6379/1
```

Give them separate database numbers on the same server, or two separate servers —
either is fine. Rules enforced before anything starts, each naming the setting
that is wrong and never the value:

* it must be a `redis://` or `rediss://` URL;
* it must not point at the container itself — there is no Redis in here;
* a publicly routable address is refused unless it is `rediss://`, because a
  Redis password sent over `redis://` crosses the network in the clear.

If the URL carries a password, it is written to a `0600` file inside the
container and is masked in everything `configure.py` prints back.

## The database itself

**attach** (the default) — the database and its user already exist, and the user
you give owns that database. Nothing with admin rights ever enters this
deployment.

**create** — build a brand-new site. This needs admin credentials on your
MariaDB, which are deliberately *not* stored in `deploy/.env`. Pass them only on
the one command that creates the site:

```bash
DB_ROOT_USER=... DB_ROOT_PASSWORD=... \
  docker compose -f deploy/docker-compose.yml run --rm backend web
```

They are written to a `0600` file inside the container for the length of the
creation and removed immediately afterwards, so they never reach a command line.

## Your nginx

Point it at the address and ports you chose:

```nginx
location / {
    proxy_pass http://APP_ADDRESS:APP_PORT;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /socket.io/ {
    proxy_pass http://APP_ADDRESS:SOCKETIO_PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
}
```

## Checking it works

```bash
curl -fsS http://APP_ADDRESS:APP_PORT/api/method/ping     # -> {"message":"pong"}
docker compose -f deploy/docker-compose.yml ps            # backend should be healthy
```

`ping` is Frappe's own endpoint — a plain read that changes nothing on your
MariaDB or Redis. The `backend` service uses it as its health check, so
`docker compose ps` reporting healthy means the app is genuinely serving, not
merely that the process started.

Before any of that, startup waits for MariaDB and for both Redis addresses to
answer — up to 30 tries, two seconds apart, and never more than 120 tries however
`READY_ATTEMPTS` is set. If one never answers, the container stops with a message
naming the SETTING that is wrong. It never prints the value, and never a password.

## Upgrading the app

```bash
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
./deploy/migrate.sh YOUR_SITE --i-have-a-backup
```

Changing the database is deliberately a command you run, never something startup
does on its own. `migrate.sh` refuses twice before it touches Docker at all: once
if the site you named is not the `SITE_NAME` in `deploy/.env`, and once if you
have not said `--i-have-a-backup`.

The build step is what ships a new `/m`, `/w` or `/docs`. Those bundles are built
into the image, and the web container copies the fresh manifest over the sites
volume each time it starts, so `build` + `up -d` is genuinely enough — there is
nothing to clear out first.

## What has been tested, and what has not

`python3 -m unittest discover -s deploy` covers the configuration handling and
the shape of these files — 76 tests, run from a clean checkout with no Docker and
no database. Four are written but skipped here, each saying why.

**The image itself has never been built or run.** The machine this was written on
has no Docker installed, so every claim about the built image is unverified.
`deploy/smoke.sh` runs the checks that need a Docker host; run it on one before
trusting this in production. Until it passes, treat the following as untested:
the image builds, containers start, the app runs as a non-root user, the health
check passes against a real database, the failure messages on an unreachable
database and on an unreachable Redis, that a restart keeps the site's files, and
build-cache behaviour on a second build.
