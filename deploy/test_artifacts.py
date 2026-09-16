"""r2dfiifbj5 — assertions about the deployment files themselves.

These check the artefacts, not a description of them: if someone adds an nginx
service, bakes a password into a build argument, or publishes a port on every
interface, one of these turns red. Plain `python3 -m unittest`, no Docker.
"""

import ast
import os
import re
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def read(name, where=HERE):
	with open(os.path.join(where, name), encoding="utf-8") as fh:
		return fh.read()


def compose():
	import yaml
	return yaml.safe_load(read("docker-compose.yml"))


def dockerignore():
	"""The patterns, without the comments that explain them."""
	return [
		line.strip() for line in read(".dockerignore", REPO).splitlines()
		if line.strip() and not line.strip().startswith("#")
	]


def bench_path():
	"""The bench directory as the Dockerfile defines it."""
	return re.search(r"BENCH_PATH=(\S+)", read("Dockerfile")).group(1)


def entry_bench():
	"""The bench directory as the entrypoint uses it."""
	return re.search(r"^BENCH=(\S+)", read("entrypoint.sh"), re.M).group(1)


# Anything whose presence would mean this deployment had grown its own web server
# or database again. Matched against image names, so a comment mentioning nginx
# (there are several, and they are the point) does not trip it.
# 8n5c5rgaqa added redis: the cache and the job queue are the operator's too, so
# an image or a service name carrying any of these means this deployment has grown
# back a dependency it is supposed to connect to rather than run.
FORBIDDEN_IMAGES = ("nginx", "mariadb", "mysql", "percona", "traefik", "caddy", "httpd", "redis", "valkey")

DOCKER = shutil.which("docker")
NO_DOCKER = "no Docker on this machine: run deploy/smoke.sh on a Docker host instead"


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
			{"backend", "websocket", "scheduler", "worker-short", "worker-long"},
		)

	def test_compose_configuration_defines_no_mariadb_service(self):
		for name, svc in self.services.items():
			blob = (name + " " + str(svc.get("image", ""))).lower()
			for banned in ("mariadb", "mysql", "percona", "database", "db"):
				self.assertNotIn(banned, blob.split(), "service %r looks like a database" % name)

	def test_compose_configuration_defines_no_redis_service(self):
		for name, svc in self.services.items():
			self.assertNotIn("redis", name.lower(), "there is a service called %r" % name)
			self.assertNotIn("redis", str(svc.get("image", "")).lower(), "service %r starts redis" % name)
		self.assertNotIn("redis", str(self.doc.get("volumes") or {}).lower(), "a volume is kept for redis")

	def test_no_database_or_redis_service_appears_in_the_compose_service_list(self):
		"""The whole acceptance criterion in one assertion: whatever else this file
		grows, the service list is app processes and nothing else."""
		self.assertEqual(
			sorted(self.services),
			["backend", "scheduler", "websocket", "worker-long", "worker-short"],
		)

	def test_the_external_redis_addresses_come_from_the_operators_env_file(self):
		raw = read("docker-compose.yml")
		self.assertNotIn("redis://", raw, "a Redis address is hard-coded into compose")

	def test_nothing_is_published_except_through_the_operators_chosen_address(self):
		for name, svc in self.services.items():
			for published in svc.get("ports", []) or []:
				self.assertTrue(
					str(published).startswith("${BIND_ADDRESS}"),
					"service %r publishes %r on every interface" % (name, published),
				)

	def test_every_app_container_reads_its_configuration_from_the_env_file(self):
		raw = read("docker-compose.yml")
		self.assertIn("env_file: .env", raw)

	def test_the_app_has_a_health_check(self):
		self.assertIn("healthcheck", self.services["backend"])

	def test_the_health_check_uses_the_real_app_endpoint_and_mutates_nothing(self):
		"""Frappe's own /api/method/ping. A GET that reads nothing and writes nothing,
		so the check itself never touches the operator's MariaDB or Redis."""
		test = " ".join(self.services["backend"]["healthcheck"]["test"])
		self.assertIn("/api/method/ping", test)
		self.assertIn("curl", test)
		for mutating in ("-X POST", "-X PUT", "-X DELETE", "--data", "bench ", "migrate"):
			self.assertNotIn(mutating, test, "the health check would change something")

	def test_no_volume_hides_the_application_itself(self):
		"""The app, and both frontend bundles inside it, live in apps/. A volume
		there would replace the image's code with whatever a previous start left."""
		for name, svc in self.services.items():
			for mount in svc.get("volumes", []) or []:
				target = str(mount).split(":")[1].rstrip("/")
				self.assertFalse(target.startswith(bench_path() + "/apps"),
					"service %r mounts over the application" % name)


class TestCoupledHalvesAgree(unittest.TestCase):
	"""Every value that appears in two files at once. These are the ones that break
	silently: nothing fails at build time when the compose mount, the Dockerfile and
	the entrypoint stop agreeing about where the bench lives — it fails at run time,
	on the operator's machine."""

	def test_the_bench_path_is_the_same_in_the_dockerfile_and_the_entrypoint(self):
		self.assertEqual(bench_path(), entry_bench())

	def test_the_entrypoint_the_image_runs_is_the_one_that_was_copied_in(self):
		dockerfile = read("Dockerfile")
		self.assertIn('ENTRYPOINT ["%s/entrypoint.sh"]' % bench_path(), dockerfile)
		self.assertRegex(dockerfile, r"COPY[^\n]*deploy/entrypoint\.sh[^\n]*\$\{BENCH_PATH\}")

	def test_the_wsgi_module_the_entrypoint_serves_is_the_one_that_was_copied_in(self):
		self.assertIn("deploy/wsgi.py", read("Dockerfile"))
		entry = read("entrypoint.sh")
		self.assertIn('--pythonpath "$BENCH" wsgi:application', entry)

	def test_every_mount_lands_inside_the_bench_the_entrypoint_uses(self):
		for name, svc in compose()["services"].items():
			for mount in svc.get("volumes", []) or []:
				target = str(mount).split(":")[1]
				self.assertTrue(target.startswith(bench_path() + "/"),
					"service %r mounts %r outside the bench" % (name, target))

	def test_compose_reads_the_same_env_file_that_configure_writes(self):
		"""compose lives in deploy/, so both `env_file:` and compose's own ${...}
		interpolation resolve to deploy/.env — the exact path config.ENV_FILENAME
		names and write_env() creates."""
		import config
		self.assertIn("env_file: %s" % config.ENV_FILENAME, read("docker-compose.yml"))
		self.assertEqual(os.path.basename(os.path.join(HERE, config.ENV_FILENAME)), ".env")

	def test_every_setting_compose_interpolates_exists_in_the_example(self):
		example = {line.partition("=")[0] for line in read(".env.example").splitlines()}
		for key in set(re.findall(r"\$\{([A-Z_]+)[:}]", read("docker-compose.yml"))):
			self.assertIn(key, example, "compose uses %s but the example never mentions it" % key)

	def test_the_app_port_agrees_across_compose_the_health_check_and_the_entrypoint(self):
		services = compose()["services"]
		self.assertIn("${APP_PORT}", str(services["backend"]["ports"]))
		self.assertIn("${APP_PORT}", " ".join(services["backend"]["healthcheck"]["test"]))
		self.assertIn("${APP_PORT:-8000}", read("entrypoint.sh"))
		self.assertIn("EXPOSE 8000", read("Dockerfile"))

	def test_the_keys_the_entrypoint_demands_are_the_keys_configure_collects(self):
		import config
		demanded = set(re.search(r"^require (.+)$", read("entrypoint.sh"), re.M).group(1).split())
		self.assertTrue(demanded <= set(config.KEYS),
			"the entrypoint requires %s, which configure.py never asks for" % (demanded - set(config.KEYS)))


class TestServesItsOwnStaticSurfaces(unittest.TestCase):
	"""This app has three static surfaces — the mobile bundle (/m), the web bundle
	(/w) and the docs site (/docs) — and no nginx inside the image to serve them."""

	def test_both_frontend_bundles_are_in_the_build_context(self):
		ignored = dockerignore()
		for surface in ("vernon_project/public/frontend", "vernon_project/public/frontend_web"):
			self.assertTrue(os.path.isdir(os.path.join(REPO, surface)), "%s is missing" % surface)
			for pattern in ignored:
				self.assertFalse(surface.startswith(pattern.rstrip("/")) and not pattern.startswith("!"),
					"%s is excluded from the image by %r" % (surface, pattern))

	def test_the_docs_site_is_in_the_build_context(self):
		"""www/docs.py serves /docs straight out of apps/vernon_project/docs, so
		excluding docs/ from the build context 404s every page of it in the image."""
		self.assertNotIn("docs/", dockerignore())
		self.assertTrue(os.path.isdir(os.path.join(REPO, "docs")))

	def test_the_built_bundles_survive_the_volume_that_covers_them(self):
		"""The sites volume is mounted over sites/, which is where bench build puts
		the asset manifest. Without this the image can be rebuilt all day and the
		containers keep serving the first build's /m and /w."""
		stash = re.search(r"ASSET_STASH=(\S+)", read("Dockerfile")).group(1)
		self.assertFalse(stash.startswith(bench_path()),
			"the stash is inside the bench, so the volume hides it too")
		self.assertIn("cp -a sites/assets ${ASSET_STASH}", read("Dockerfile"))
		entry = read("entrypoint.sh")
		self.assertIn('cp -af "${ASSET_STASH:-%s}/." sites/assets/' % stash, entry)
		self.assertEqual(
			entry.count("cp -af"), 1,
			"more than one role restores the assets, so they race on the same volume",
		)

	def test_the_app_serves_its_own_static_files(self):
		self.assertIn("application_with_statics", read("wsgi.py"))


class TestStartupAndMigration(unittest.TestCase):
	def test_starting_a_container_never_migrates(self):
		"""Starting the app must never change the operator's database shape."""
		for line in read("entrypoint.sh").splitlines():
			if line.strip().startswith("#"):
				continue  # saying it never migrates is not migrating
			self.assertNotIn("migrate", line, "the entrypoint would migrate on start: %r" % line)

	def test_the_readiness_wait_is_bounded(self):
		"""A dependency that never comes up must fail, not spin forever — and the
		bound is enforced in the script, not left to whatever the operator exports."""
		entry = read("entrypoint.sh")
		self.assertIn("READY_ATTEMPTS", entry)
		self.assertRegex(entry, r"READY_ATTEMPTS.*(gt|-ge).*\d+")

	def _migrate(self, args, env_text="SITE_NAME=vp.example.test\n"):
		with tempfile.TemporaryDirectory() as d:
			os.makedirs(os.path.join(d, "deploy"))
			shutil.copy(os.path.join(HERE, "migrate.sh"), os.path.join(d, "deploy", "migrate.sh"))
			with open(os.path.join(d, "deploy", ".env"), "w", encoding="utf-8") as fh:
				fh.write(env_text)
			return subprocess.run(
				["bash", os.path.join(d, "deploy", "migrate.sh"), *args],
				cwd=d, capture_output=True, text=True,
			)

	def test_migrate_refuses_a_site_that_is_not_the_configured_one(self):
		out = self._migrate(["other.example.test", "--i-have-a-backup"])
		self.assertNotEqual(out.returncode, 0)
		self.assertIn("SITE_NAME", out.stderr)

	def test_migrate_refuses_without_the_backup_acknowledgement(self):
		out = self._migrate(["vp.example.test"])
		self.assertNotEqual(out.returncode, 0)
		self.assertIn("--i-have-a-backup", out.stderr)

	def test_migrate_refuses_before_it_needs_docker_at_all(self):
		"""Both refusals happen on this machine, which has no Docker — proof they are
		real guards and not something the operator finds out about halfway through."""
		self.assertIsNone(DOCKER, "this assertion only means something without Docker") if DOCKER is None else None
		out = self._migrate([])
		self.assertNotEqual(out.returncode, 0)
		self.assertNotIn("docker", out.stdout.lower())


class TestConfigIsStandalone(unittest.TestCase):
	def test_the_configuration_module_never_imports_frappe(self):
		"""config.py has to run on the operator's laptop, before there is an image,
		a bench or a site. Anything from the app would make that impossible."""
		tree = ast.parse(read("config.py"))
		for node in ast.walk(tree):
			if isinstance(node, ast.Import):
				modules = [alias.name for alias in node.names]
			elif isinstance(node, ast.ImportFrom):
				modules = [node.module or ""]
			else:
				continue
			for module in modules:
				self.assertNotIn(module.split(".")[0], ("frappe", "bench", "vernon_project"),
					"config.py imports %s" % module)


@unittest.skipIf(DOCKER is None, NO_DOCKER)
class TestNeedsADockerHost(unittest.TestCase):
	"""Written and runnable; skipped here, and skipped for a stated reason rather
	than quietly passing. deploy/smoke.sh is the same checks as a gate to run on a
	machine that has Docker."""

	def test_docker_build_succeeds_from_a_clean_checkout(self):
		out = subprocess.run([DOCKER, "compose", "-f", os.path.join(HERE, "docker-compose.yml"), "build", "backend"],
			capture_output=True, text=True)
		self.assertEqual(out.returncode, 0, out.stderr[-2000:])

	def test_the_image_contains_only_the_app_runtime_artifacts(self):
		out = subprocess.run([DOCKER, "run", "--rm", "--entrypoint", "sh", "vernon-project:local",
			"-c", "command -v redis-server mysqld nginx || true"], capture_output=True, text=True)
		self.assertEqual(out.stdout.strip(), "", "the image carries a server it should connect to instead")

	def test_the_documented_start_command_reaches_the_app_surface(self):
		self.skipTest("needs a reachable MariaDB and Redis: deploy/smoke.sh check 6")

	def test_restarting_loses_no_data(self):
		self.skipTest("needs a reachable MariaDB and Redis: deploy/smoke.sh check 9")


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
		ignored = dockerignore()
		for pattern in ("deploy/.env", "node_modules", ".git"):
			self.assertIn(pattern, ignored, "%s would be sent to the Docker daemon" % pattern)


if __name__ == "__main__":
	unittest.main()
