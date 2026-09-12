#!/usr/bin/env python3
"""r2dfiifbj5 — the command that sets this deployment up, or updates it.

    python3 deploy/configure.py

It asks whether this is a new deployment or an update, collects the remote
MariaDB details, and writes deploy/.env (owner-readable only). It starts nothing
and deploys nothing: run `docker compose up -d` yourself when the summary looks
right.

All the rules it enforces live in config.py, which is unit-tested. This file is
only the conversation.
"""

import getpass
import os
import sys

import config as cfg

HERE = os.path.dirname(os.path.abspath(__file__))


def _say(text=""):
	print(text)


def _ask(prompt, default=None, secret=False):
	"""One question. Blank keeps the default. A secret is never echoed, and is
	never shown back even as a default — only whether one is already stored."""
	if secret:
		hint = " [leave blank to keep the stored one]" if default else ""
		return getpass.getpass("{}{}: ".format(prompt, hint))
	hint = " [{}]".format(default) if default else ""
	answer = input("{}{}: ".format(prompt, hint)).strip()
	return answer or (default or "")


def _choose(prompt, options, default):
	while True:
		answer = _ask("{} ({})".format(prompt, " / ".join(options)), default)
		if answer in options:
			return answer
		_say("Please answer with one of: {}".format(", ".join(options)))


def collect(existing):
	"""Ask for every field, starting from what is already configured."""
	answers = {}
	for field in cfg.FIELDS:
		key = field["key"]
		if key == "DB_LOCATION":
			answers[key] = _choose(field["prompt"], cfg.DB_LOCATIONS, existing.get(key) or cfg.PRIVATE_NETWORK)
			continue
		if key == "SETUP_MODE":
			answers[key] = _choose(field["prompt"], cfg.SETUP_MODES, existing.get(key) or cfg.ATTACH)
			continue
		if key == "ADMIN_PASSWORD" and answers.get("SETUP_MODE") != cfg.CREATE:
			continue  # only a brand-new site needs one
		answers[key] = _ask(field["prompt"], existing.get(key) or field.get("default"), secret=field["secret"])
	return answers


def summarise(merged):
	_say()
	_say("This is what will be written to deploy/.env:")
	shown = cfg.redact(merged)
	for key in cfg.KEYS:
		if key in shown:
			_say("  {:<16} {}".format(key, shown[key]))
	_say()
	_say("  nginx and MariaDB are yours to run — this deployment starts neither.")
	for warning in cfg.warnings(merged):
		_say("  ! {}".format(warning))


def main(argv=None):
	argv = sys.argv[1:] if argv is None else argv
	existing = cfg.load_env(HERE)

	_say("Vernon Project — deployment setup")
	if existing:
		_say("Found an existing deploy/.env.")
		mode = _choose("New configuration, or update this one?", ("new", "update"), "update")
	else:
		_say("No deploy/.env yet, so this is a new configuration.")
		mode = "new"
	start_from = existing if mode == "update" else {}

	answers = collect(start_from)
	merged = cfg.merge(start_from, answers)

	errors = cfg.validate(merged)
	if errors:
		_say()
		_say("Not written — fix these first:")
		for error in errors:
			_say("  - {}".format(error))
		return 1

	summarise(merged)
	if _ask("Write it? (yes/no)", "no").lower() not in ("y", "yes"):
		_say("Nothing written. The previous configuration is untouched.")
		return 1

	path = cfg.write_env(HERE, merged)
	_say("Wrote {} (readable only by you).".format(path))
	_say()
	_say("Next:")
	_say("  docker compose -f deploy/docker-compose.yml up -d")
	_say("  curl -fsS http://{}:{}/api/method/ping".format(merged["BIND_ADDRESS"], merged["APP_PORT"]))
	_say()
	_say("Point your nginx at {}:{} (and :{} for /socket.io).".format(
		merged["BIND_ADDRESS"], merged["APP_PORT"], merged["SOCKETIO_PORT"]))
	return 0


if __name__ == "__main__":
	try:
		sys.exit(main())
	except (KeyboardInterrupt, EOFError):
		# Interrupted: nothing has been written yet, so the previous configuration
		# is exactly as it was.
		print("\nCancelled. Nothing was changed.")
		sys.exit(130)
