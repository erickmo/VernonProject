"""r2dfiifbj5 — assertions about the deployment files themselves.

These check the artefacts, not a description of them: if someone adds an nginx
service, bakes a password into a build argument, or publishes a port on every
interface, one of these turns red. Plain `python3 -m unittest`, no Docker.
"""

import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def read(name, where=HERE):
	with open(os.path.join(where, name), encoding="utf-8") as fh:
		return fh.read()


def compose():
	import yaml
	return yaml.safe_load(read("docker-compose.yml"))


# Anything whose presence would mean this deployment had grown its own web server
# or database again. Matched against image names, so a comment mentioning nginx
# (there are several, and they are the point) does not trip it.
FORBIDDEN_IMAGES = ("nginx", "mariadb", "mysql", "percona", "traefik", "caddy", "httpd")


class TestComposeShape(unittest.TestCase):
	def setUp(self):
		self.doc = compose()
		self.services = self.doc["services"]

	def test_no_web_server_or_database_is_ever_started(self):
		for name, svc in self.services.items():
			image = str(svc.get("image", ""))
			for banned in FORBIDDEN_IMAGES:
				self.assertNotIn(banned, image.lower(), "service %r would start %s" % (name, banned))
				self.assertNotIn(banned, name.lower(), "there is a service called %r" % name)

	def test_the_processes_match_what_the_app_actually_runs(self):
		self.assertEqual(
			set(self.services),
			{"backend", "websocket", "scheduler", "worker-short", "worker-long", "redis-cache", "redis-queue"},
		)

	def test_nothing_is_published_except_through_the_operators_chosen_address(self):
		for name, svc in self.services.items():
			for published in svc.get("ports", []) or []:
				self.assertTrue(
					str(published).startswith("${BIND_ADDRESS}"),
					"service %r publishes %r on every interface" % (name, published),
				)

	def test_redis_is_not_reachable_from_outside(self):
		for name in ("redis-cache", "redis-queue"):
			self.assertFalse(self.services[name].get("ports"), "%s must not be published" % name)

	def test_every_app_container_reads_its_configuration_from_the_env_file(self):
		raw = read("docker-compose.yml")
		self.assertIn("env_file: .env", raw)

	def test_the_app_has_a_health_check(self):
		self.assertIn("healthcheck", self.services["backend"])


class TestNoBakedSecrets(unittest.TestCase):
	SECRETISH = re.compile(r"(password|secret|token|api_?key)", re.I)

	def test_no_build_argument_or_image_variable_carries_a_credential(self):
		for line in read("Dockerfile").splitlines():
			stripped = line.strip()
			if stripped.startswith("#"):
				continue
			if stripped.startswith(("ARG ", "ENV ")):
				self.assertIsNone(
					self.SECRETISH.search(stripped),
					"the image would carry a credential in its layers: %r" % stripped,
				)

	def test_the_env_file_is_never_copied_into_the_image(self):
		for line in read("Dockerfile").splitlines():
			if line.strip().startswith("COPY"):
				self.assertNotIn(".env", line, "COPY would bake the deployment's secrets into a layer")

	def test_no_password_is_passed_as_a_command_line_argument(self):
		"""Anything on a command line shows up in `ps` and in shell history."""
		entry = read("entrypoint.sh")
		for flag in ("--db-password", "--db-root-password", "--mariadb-root-password", "--admin-password"):
			self.assertNotIn(flag, entry, "%s puts a secret in ARGV" % flag)

	def test_the_committed_example_holds_no_real_values(self):
		for line in read(".env.example").splitlines():
			key, _, value = line.partition("=")
			if self.SECRETISH.search(key):
				self.assertEqual(value.strip(), "", "%s has a value in the committed example" % key.strip())

	def test_the_real_env_file_is_ignored_by_git(self):
		self.assertIn("deploy/.env", read(".gitignore", REPO))

	def test_the_build_context_excludes_secrets_and_bulk(self):
		"""The build context is the whole repository, so what it leaves out is the
		difference between a small image and one carrying node_modules — or the
		operator's own .env."""
		ignored = read(".dockerignore", REPO)
		for pattern in ("deploy/.env", "node_modules", ".git"):
			self.assertIn(pattern, ignored, "%s would be sent to the Docker daemon" % pattern)


if __name__ == "__main__":
	unittest.main()
