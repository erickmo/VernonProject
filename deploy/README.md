# Deploying Vernon Project with Docker

Copy this repository to any device, answer a few questions, and start it. There
is no nginx and no database in here on purpose — both are yours, and both are
reached over your own network.

## What runs, and what does not

Started by this deployment: the app (web), realtime (socket.io), the scheduler,
two job workers, and two small Redis containers.

**Not** started: nginx, MariaDB. Redis is here because it is this deployment's
own cache and job queue — it holds nothing that has to survive a restart, and
bundling it is what keeps "copy it to any device" true.

Because there is no nginx inside, the app serves its own `/assets` and `/files`
(see `wsgi.py`). Your nginx is a plain reverse proxy.

## Setting it up

```bash
python3 deploy/configure.py
docker compose -f deploy/docker-compose.yml up -d
```

`configure.py` asks whether this is a new deployment or an update, then asks for
the database details. It writes `deploy/.env`, readable only by you, and starts
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

`ping` is Frappe's own endpoint. The `backend` service uses it as its health
check, so `docker compose ps` reporting healthy means the app is genuinely
serving, not merely that the process started.

If the database is unreachable the container stops with a message naming the
setting that is wrong. It never prints the value, and never the password.

## Upgrading the app

```bash
git pull
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml run --rm backend bench --site YOUR_SITE migrate
```

`migrate` is deliberately a command you run, not something startup does on its
own: this deployment never changes your database schema without being asked.

## What has been tested, and what has not

`python3 -m unittest discover -s deploy` covers the configuration handling and
the shape of these files — 37 tests, run from a clean checkout with no Docker and
no database.

**The image itself has never been built or run.** The machine this was written on
has no Docker installed, so every claim about the built image is unverified.
`deploy/smoke.sh` runs the checks that need a Docker host; run it on one before
trusting this in production. Until it passes, treat the following as untested:
the image builds, containers start, the app runs as a non-root user, the health
check passes against a real database, the failure message on an unreachable
database, and build-cache behaviour on a second build.
