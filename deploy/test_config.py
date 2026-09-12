"""Tests for the deployment's configuration handling (r2dfiifbj5).

Runs with plain `python3 -m unittest discover -s deploy` — no Docker, no Frappe
site, no network. Fake credentials only; nothing here points at a real database.
"""

import os
import stat
import tempfile
import unittest

from config import (
	ATTACH, CREATE, ENV_FILENAME, OTHER_DEVICE, PRIVATE_NETWORK, REDACTED, SECRET_KEYS,
	load_env, merge, parse_env, redact, render_env, validate, warnings, write_env,
)

GOOD = {
	"SITE_NAME": "vp.example.test",
	"DB_LOCATION": PRIVATE_NETWORK,
	"DB_HOST": "10.1.2.3",
	"DB_PORT": "3306",
	"DB_NAME": "_fakedb",
	"DB_USER": "fakeuser",
	"DB_PASSWORD": "s3cr3t-not-real",
	"SETUP_MODE": ATTACH,
	"BIND_ADDRESS": "10.1.2.9",
	"APP_PORT": "8000",
	"SOCKETIO_PORT": "9000",
}


class TestValidate(unittest.TestCase):
	def test_a_complete_configuration_has_no_errors(self):
		self.assertEqual(validate(GOOD), ())

	def test_each_required_key_is_named_when_missing(self):
		for key in ("SITE_NAME", "DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "BIND_ADDRESS"):
			with self.subTest(key=key):
				errs = validate({k: v for k, v in GOOD.items() if k != key})
				self.assertTrue(any(e.startswith(key + " is required") for e in errs), errs)

	def test_a_database_on_the_container_itself_is_refused(self):
		# The whole point of this deployment is that MariaDB lives elsewhere.
		for host in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "LOCALHOST"):
			with self.subTest(host=host):
				errs = validate({**GOOD, "DB_HOST": host})
				self.assertTrue(any("no bundled database" in e for e in errs), errs)

	def test_a_nonsense_host_or_site_is_refused(self):
		self.assertTrue(any("DB_HOST" in e for e in validate({**GOOD, "DB_HOST": "not a host!"})))
		self.assertTrue(any("SITE_NAME" in e for e in validate({**GOOD, "SITE_NAME": "has spaces"})))

	def test_ports_must_be_real_ports(self):
		for key in ("DB_PORT", "APP_PORT", "SOCKETIO_PORT"):
			for bad in ("0", "65536", "-1", "abc", "80.5"):
				with self.subTest(key=key, value=bad):
					self.assertTrue(any(e.startswith(key) for e in validate({**GOOD, key: bad})))

	def test_creating_a_new_site_needs_an_admin_password(self):
		errs = validate({**GOOD, "SETUP_MODE": CREATE})
		self.assertTrue(any("ADMIN_PASSWORD is required" in e for e in errs), errs)
		self.assertEqual(validate({**GOOD, "SETUP_MODE": CREATE, "ADMIN_PASSWORD": "x"}), ())

	def test_unknown_choices_are_refused(self):
		self.assertTrue(any("DB_LOCATION" in e for e in validate({**GOOD, "DB_LOCATION": "somewhere"})))
		self.assertTrue(any("SETUP_MODE" in e for e in validate({**GOOD, "SETUP_MODE": "wipe"})))

	def test_a_relative_ca_path_is_refused(self):
		self.assertTrue(any("DB_SSL_CA" in e for e in validate({**GOOD, "DB_SSL_CA": "certs/ca.pem"})))
		self.assertEqual(validate({**GOOD, "DB_SSL_CA": "/certs/ca.pem"}), ())

	def test_no_error_message_ever_contains_a_value(self):
		"""An error must be safe to paste into a chat. It names the key, never what
		was typed — least of all the password.

		Two bad configurations, not one: DB_HOST has separate branches for "points
		at this container" and "is not a hostname", and a single fixture only ever
		reaches the first. Every branch that can build a message gets exercised."""
		base = {
			"SITE_NAME": "site with spaces", "DB_LOCATION": "elsewhere",
			"DB_PORT": "99999", "DB_NAME": "", "DB_USER": "", "DB_PASSWORD": "hunter2-not-real",
			"SETUP_MODE": "wipe", "BIND_ADDRESS": "", "APP_PORT": "abc", "SOCKETIO_PORT": "-1",
			"DB_SSL_CA": "relative/ca.pem",
		}
		for host in ("localhost", "not a host!"):
			with self.subTest(host=host):
				bad = {**base, "DB_HOST": host}
				errors = validate(bad)
				self.assertTrue(errors)
				joined = " ".join(errors)
				for value in bad.values():
					if value:
						self.assertNotIn(value, joined, "a validation error echoed a value: %r" % value)


class TestWarnings(unittest.TestCase):
	def test_an_off_network_database_without_tls_is_called_out(self):
		self.assertTrue(warnings({**GOOD, "DB_LOCATION": OTHER_DEVICE}))
		self.assertFalse(warnings({**GOOD, "DB_LOCATION": OTHER_DEVICE, "DB_SSL_CA": "/certs/ca.pem"}))

	def test_a_private_network_database_needs_no_tls_warning(self):
		self.assertFalse(warnings(GOOD))

	def test_publishing_on_every_interface_is_called_out(self):
		self.assertTrue(any("0.0.0.0" in w for w in warnings({**GOOD, "BIND_ADDRESS": "0.0.0.0"})))

	def test_a_warning_never_contains_the_password(self):
		for w in warnings({**GOOD, "DB_LOCATION": OTHER_DEVICE, "BIND_ADDRESS": "0.0.0.0"}):
			self.assertNotIn(GOOD["DB_PASSWORD"], w)


class TestRedact(unittest.TestCase):
	def test_every_secret_is_masked(self):
		shown = redact({**GOOD, "ADMIN_PASSWORD": "admin-not-real"})
		for key in SECRET_KEYS:
			if shown.get(key):
				self.assertEqual(shown[key], REDACTED)
		self.assertNotIn("s3cr3t-not-real", " ".join(str(v) for v in shown.values()))

	def test_non_secrets_are_left_readable_so_the_summary_is_useful(self):
		shown = redact(GOOD)
		self.assertEqual(shown["DB_HOST"], "10.1.2.3")
		self.assertEqual(shown["SITE_NAME"], "vp.example.test")


class TestMerge(unittest.TestCase):
	def test_an_update_changes_only_what_was_answered(self):
		out = merge(GOOD, {"DB_HOST": "10.9.9.9"})
		self.assertEqual(out["DB_HOST"], "10.9.9.9")
		for key, value in GOOD.items():
			if key != "DB_HOST":
				self.assertEqual(out[key], value)

	def test_pressing_enter_through_every_prompt_changes_nothing(self):
		self.assertEqual(merge(GOOD, {k: "" for k in GOOD}), GOOD)
		self.assertEqual(merge(GOOD, {k: None for k in GOOD}), GOOD)

	def test_an_update_never_erases_the_stored_password(self):
		self.assertEqual(merge(GOOD, {"DB_HOST": "10.9.9.9"})["DB_PASSWORD"], GOOD["DB_PASSWORD"])

	def test_a_key_the_operator_added_by_hand_survives(self):
		out = merge({**GOOD, "CUSTOM_THING": "keep me"}, {"DB_PORT": "3307"})
		self.assertEqual(out["CUSTOM_THING"], "keep me")


class TestEnvFile(unittest.TestCase):
	def test_round_trips(self):
		self.assertEqual(parse_env(render_env(GOOD)), GOOD)

	def test_comments_blank_lines_and_junk_are_ignored(self):
		self.assertEqual(parse_env("# a note\n\nDB_HOST=10.0.0.1\nnot-a-pair\n"), {"DB_HOST": "10.0.0.1"})

	def test_unknown_keys_survive_a_rewrite(self):
		self.assertEqual(parse_env(render_env({**GOOD, "ZZ_EXTRA": "1"}))["ZZ_EXTRA"], "1")

	def test_the_file_is_written_readable_only_by_its_owner(self):
		with tempfile.TemporaryDirectory() as d:
			path = write_env(d, GOOD)
			self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

	def test_rewriting_an_existing_file_keeps_it_restricted(self):
		with tempfile.TemporaryDirectory() as d:
			path = os.path.join(d, ENV_FILENAME)
			with open(path, "w", encoding="utf-8") as fh:
				fh.write("DB_HOST=old\n")
			os.chmod(path, 0o644)
			write_env(d, GOOD)
			self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

	def test_load_env_reads_back_what_was_written(self):
		with tempfile.TemporaryDirectory() as d:
			write_env(d, GOOD)
			self.assertEqual(load_env(d), GOOD)

	def test_load_env_on_a_fresh_machine_is_simply_empty(self):
		with tempfile.TemporaryDirectory() as d:
			self.assertEqual(load_env(d), {})


if __name__ == "__main__":
	unittest.main()
