"""r2dfiifbj5 — the configuration behind the portable deployment.

Everything here is pure: reading, validating, merging and rendering the
deployment's .env. `configure.py` is the thin interactive shell around it, so the
part that can get security wrong is the part that is unit-tested, and none of it
needs Docker or a Frappe site to run.

Two rules the whole module is built around:
  * an error message names the KEY that is wrong, never the value — a validation
    message must be safe to paste into a chat or a log;
  * the password is never rendered anywhere except the .env file itself.
"""

import os
import re

# Where the deployment's own values live. Never committed (deploy/.env is in
# .gitignore) and written 0600.
ENV_FILENAME = ".env"
ENV_MODE = 0o600

PRIVATE_NETWORK = "private-network"
OTHER_DEVICE = "other-device"
DB_LOCATIONS = (PRIVATE_NETWORK, OTHER_DEVICE)

ATTACH = "attach"
CREATE = "create"
SETUP_MODES = (ATTACH, CREATE)

# key, prompt, required, secret
FIELDS = (
	{"key": "SITE_NAME", "prompt": "Site name (the hostname Frappe serves)", "required": True, "secret": False},
	{"key": "DB_LOCATION", "prompt": "Where is MariaDB?", "required": True, "secret": False},
	{"key": "DB_HOST", "prompt": "MariaDB host or IP", "required": True, "secret": False},
	{"key": "DB_PORT", "prompt": "MariaDB port", "required": True, "secret": False, "default": "3306"},
	{"key": "DB_NAME", "prompt": "Database name", "required": True, "secret": False},
	{"key": "DB_USER", "prompt": "Database user", "required": True, "secret": False},
	{"key": "DB_PASSWORD", "prompt": "Database password", "required": True, "secret": True},
	{"key": "DB_SSL_CA", "prompt": "Path to the DB's CA certificate (blank for none)", "required": False, "secret": False},
	{"key": "SETUP_MODE", "prompt": "Attach to an existing database, or create a new site?", "required": True, "secret": False, "default": ATTACH},
	{"key": "ADMIN_PASSWORD", "prompt": "Administrator password for the NEW site", "required": False, "secret": True},
	{"key": "BIND_ADDRESS", "prompt": "Address to publish on (the one your nginx reaches)", "required": True, "secret": False, "default": "127.0.0.1"},
	{"key": "APP_PORT", "prompt": "Port for the app", "required": True, "secret": False, "default": "8000"},
	{"key": "SOCKETIO_PORT", "prompt": "Port for realtime (socket.io)", "required": True, "secret": False, "default": "9000"},
)
KEYS = tuple(f["key"] for f in FIELDS)
SECRET_KEYS = frozenset(f["key"] for f in FIELDS if f["secret"])
REDACTED = "********"

_HOSTNAME = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?$")
# A bundled database is the thing this deployment deliberately does not have, so
# pointing DB_HOST at the container itself is a configuration error, not a choice.
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def parse_env(text):
	"""An .env file -> {key: value}. Unknown keys are kept: an update must not
	quietly drop something the operator added by hand."""
	out = {}
	for line in (text or "").splitlines():
		line = line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, _, value = line.partition("=")
		out[key.strip()] = value.strip()
	return out


def load_env(directory):
	path = os.path.join(directory, ENV_FILENAME)
	if not os.path.exists(path):
		return {}
	with open(path, encoding="utf-8") as fh:
		return parse_env(fh.read())


def render_env(config):
	"""{key: value} -> the file's text. Known keys first, in FIELDS order, then
	anything the operator added, so a rewrite keeps a stable shape."""
	lines = ["# Written by deploy/configure.py. Contains a password — never commit this file."]
	for key in KEYS:
		if key in config:
			lines.append("{}={}".format(key, config[key]))
	for key in sorted(k for k in config if k not in KEYS):
		lines.append("{}={}".format(key, config[key]))
	return "\n".join(lines) + "\n"


def write_env(directory, config):
	"""Write the .env with an owner-only mode, created restricted rather than
	chmod-ed afterwards so it is never briefly world-readable."""
	path = os.path.join(directory, ENV_FILENAME)
	fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, ENV_MODE)
	with os.fdopen(fd, "w", encoding="utf-8") as fh:
		fh.write(render_env(config))
	os.chmod(path, ENV_MODE)  # an existing file keeps its old mode through O_CREAT
	return path


def merge(existing, answers):
	"""The update flow: start from what is already configured and change only the
	keys actually answered. A blank answer means "leave it alone", which is what
	makes pressing Enter through the prompts a no-op."""
	out = dict(existing or {})
	for key, value in (answers or {}).items():
		if value is None or value == "":
			continue
		out[key] = value
	return out


def redact(config):
	"""A copy safe to print, log or paste. Every secret key is masked whether or
	not it is set, so the mask itself never reveals which secrets exist."""
	out = {}
	for key, value in (config or {}).items():
		out[key] = REDACTED if key in SECRET_KEYS and value else value
	return out


def validate(config):
	"""Errors, each naming only the KEY at fault. Empty tuple means ready to run."""
	config = config or {}
	errors = []
	for field in FIELDS:
		if field["required"] and not str(config.get(field["key"], "") or "").strip():
			errors.append("{} is required.".format(field["key"]))

	location = config.get("DB_LOCATION")
	if location and location not in DB_LOCATIONS:
		errors.append("DB_LOCATION must be one of: {}.".format(", ".join(DB_LOCATIONS)))

	mode = config.get("SETUP_MODE")
	if mode and mode not in SETUP_MODES:
		errors.append("SETUP_MODE must be one of: {}.".format(", ".join(SETUP_MODES)))
	if mode == CREATE and not str(config.get("ADMIN_PASSWORD", "") or "").strip():
		errors.append("ADMIN_PASSWORD is required when SETUP_MODE is create.")

	host = str(config.get("DB_HOST", "") or "").strip()
	if host:
		if host.lower() in _LOCAL_HOSTS:
			errors.append("DB_HOST must not point at the container itself — this deployment has no bundled database.")
		elif not _HOSTNAME.match(host):
			errors.append("DB_HOST is not a valid hostname or IP address.")

	site = str(config.get("SITE_NAME", "") or "").strip()
	if site and not _HOSTNAME.match(site):
		errors.append("SITE_NAME is not a valid hostname.")

	for key in ("DB_PORT", "APP_PORT", "SOCKETIO_PORT"):
		raw = str(config.get(key, "") or "").strip()
		if not raw:
			continue
		if not raw.isdigit() or not 1 <= int(raw) <= 65535:
			errors.append("{} must be a whole number between 1 and 65535.".format(key))

	ca = str(config.get("DB_SSL_CA", "") or "").strip()
	if ca and not ca.startswith("/"):
		errors.append("DB_SSL_CA must be an absolute path inside the container.")

	return tuple(errors)


def warnings(config):
	"""Things worth saying out loud that are not errors."""
	config = config or {}
	out = []
	if config.get("DB_LOCATION") == OTHER_DEVICE and not str(config.get("DB_SSL_CA", "") or "").strip():
		out.append(
			"DB_LOCATION is other-device and DB_SSL_CA is empty: the database password will "
			"cross a network you have not told us is private. Set DB_SSL_CA to enable TLS."
		)
	if config.get("BIND_ADDRESS") == "0.0.0.0":
		out.append(
			"BIND_ADDRESS is 0.0.0.0: the app will be reachable from every network on this "
			"device, not only from your nginx. Use the private address unless you meant that."
		)
	return tuple(out)
