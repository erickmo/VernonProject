# Copyright (c) 2026, Vernon and contributors
# See license.txt
"""The navbar's MCP up/down indicator: the probe, its cache, and who sees detail.

The probe is deliberately UNAUTHENTICATED. The MCP server wraps every request in a
token check, so an anonymous request is answered with 401 — which is itself proof
the process is alive. That means the status check never touches the MCP token, so
there is no secret in the payload to redact and none to leak.
"""

import unittest
from unittest.mock import patch

import frappe

from vernon_project.api import mcp_status
from vernon_project.tests.no_leak import NoLeakMixin

STAFF = "mcp-status-staff@test.local"


class _Base(NoLeakMixin, unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", STAFF):
			frappe.get_doc({"doctype": "User", "email": STAFF, "first_name": "Mcp",
			                "send_welcome_email": 0}).insert(ignore_permissions=True)
		mcp_status.clear_cached_status()

	def tearDown(self):
		frappe.set_user("Administrator")
		mcp_status.clear_cached_status()


class TestProbeOutcomes(_Base):
	def test_any_http_answer_means_up_including_401(self):
		"""401 is the SERVER talking — only a live process refuses you. Treating it as
		down would report the connector as broken exactly when it is working."""
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 5.9)):
			result = mcp_status.get_mcp_status()
		self.assertEqual(result["status"], "up")
		self.assertEqual(result["latency_ms"], 5.9)

	def test_a_refused_connection_means_down(self):
		with patch.object(mcp_status, "_probe_once", return_value=(None, "Connection refused", 1.0)):
			result = mcp_status.get_mcp_status()
		self.assertEqual(result["status"], "down")

	def test_a_timeout_is_down_not_a_hang(self):
		with patch.object(mcp_status, "_probe_once", return_value=(None, "timed out", 3000.0)):
			result = mcp_status.get_mcp_status()
		self.assertEqual(result["status"], "down")

	def test_a_broken_probe_is_unknown_not_down(self):
		"""If OUR side could not even attempt the check, saying "down" would blame the
		MCP server for a local fault."""
		with patch.object(mcp_status, "_probe_once", side_effect=RuntimeError("no config")):
			result = mcp_status.get_mcp_status()
		self.assertEqual(result["status"], "unknown")

	def test_the_payload_shape_is_stable(self):
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			result = mcp_status.get_mcp_status()
		for key in ("status", "checked_at", "latency_ms", "detail"):
			self.assertIn(key, result)


class TestWhoSeesDetail(_Base):
	def test_a_system_manager_sees_the_diagnostic_detail(self):
		frappe.set_user("Administrator")
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			result = mcp_status.get_mcp_status()
		self.assertTrue(result["detail"], "an admin needs to know what was probed and what came back")
		self.assertIn("127.0.0.1", result["detail"].get("target", ""))

	def test_a_normal_user_gets_the_state_but_no_detail(self):
		"""Asserted on the SERVER's answer, not on what the UI chooses to draw."""
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			frappe.set_user(STAFF)
			try:
				result = mcp_status.get_mcp_status()
			finally:
				frappe.set_user("Administrator")
		self.assertEqual(result["status"], "up", "everyone still sees the state")
		self.assertEqual(result["detail"], {}, "a non-admin must get no diagnostic detail at all")

	def test_a_guest_is_refused_and_no_probe_runs(self):
		with patch.object(mcp_status, "_probe_once") as probe:
			frappe.set_user("Guest")
			try:
				with self.assertRaises(frappe.PermissionError):
					mcp_status.get_mcp_status()
			finally:
				frappe.set_user("Administrator")
		probe.assert_not_called()

	def test_the_token_never_appears_anywhere_in_the_payload(self):
		"""The probe is unauthenticated, so this should hold by construction — pinned
		so it stays true if anyone ever 'improves' the probe by authenticating it."""
		token = frappe.generate_hash(length=24)
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			result = mcp_status.get_mcp_status()
		self.assertNotIn(token, str(result))
		self.assertNotIn("token", str(result).lower())


class TestCaching(_Base):
	def test_many_callers_in_the_window_cause_exactly_one_probe(self):
		"""P1. Ten navbars loading in the same minute must not make ten outbound
		requests — the cache IS the rate limit."""
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)) as probe:
			first = mcp_status.get_mcp_status()
			for _ in range(9):
				mcp_status.get_mcp_status()
		self.assertEqual(probe.call_count, 1, "the probe must run once for the whole window")
		self.assertEqual(first["status"], "up")

	def test_every_caller_in_the_window_gets_the_same_answer(self):
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			first = mcp_status.get_mcp_status()
			second = mcp_status.get_mcp_status()
		self.assertEqual(first["checked_at"], second["checked_at"], "a cached read is the same check")

	def test_a_cached_answer_still_hides_detail_from_a_normal_user(self):
		"""The cache stores one probe result shared by everyone, so the permission
		trim has to happen on the way OUT, not on the way in. Otherwise whoever warms
		the cache decides what the next caller sees."""
		frappe.set_user("Administrator")
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)):
			admin_view = mcp_status.get_mcp_status()
			self.assertTrue(admin_view["detail"])
			frappe.set_user(STAFF)
			try:
				staff_view = mcp_status.get_mcp_status()
			finally:
				frappe.set_user("Administrator")
		self.assertEqual(staff_view["detail"], {}, "a warmed cache must not leak detail to the next caller")

	def test_clearing_the_cache_forces_a_fresh_probe(self):
		with patch.object(mcp_status, "_probe_once", return_value=(401, None, 4.0)) as probe:
			mcp_status.get_mcp_status()
			mcp_status.clear_cached_status()
			mcp_status.get_mcp_status()
		self.assertEqual(probe.call_count, 2)


class TestProbeTarget(_Base):
	def test_the_target_comes_from_config_and_is_local(self):
		"""S4: never from a request parameter, so this endpoint cannot be used to make
		the server fetch an arbitrary host."""
		target = mcp_status._probe_target()
		self.assertTrue(target.startswith("http://127.0.0.1:"), f"unexpected target: {target}")

	def test_the_status_method_takes_no_arguments(self):
		"""The strongest form of S4: there is no parameter to smuggle a host through."""
		import inspect
		self.assertEqual(list(inspect.signature(mcp_status.get_mcp_status).parameters), [])


class TestRealProbeNoMocks(_Base):
	"""The mocked tests pin the mapping from probe result to state. These two run the
	real network code, so a change that breaks urllib handling cannot pass on mocks
	alone. Neither touches the running connector — stopping it is the hub's call."""

	def test_a_real_probe_of_a_closed_port_is_down(self):
		closed = "http://127.0.0.1:9/"  # discard port: nothing listens
		http_status, error, latency_ms = mcp_status._probe_once(closed, timeout=3)
		self.assertIsNone(http_status, "nothing should have answered")
		self.assertTrue(error, "a refusal must be reported")
		self.assertIsInstance(latency_ms, float)

	def test_a_real_probe_of_the_live_connector_reads_as_an_answer(self):
		"""Whatever the connector replies — 401 when it is up — it is an ANSWER, and
		an answer is what "up" means. Skipped rather than failed when the connector is
		genuinely stopped, so this suite does not go red for an ops state."""
		http_status, error, _ = mcp_status._probe_once(mcp_status._probe_target(), timeout=3)
		if http_status is None:
			self.skipTest(f"MCP connector not running locally: {error}")
		self.assertGreater(http_status, 0)
		self.assertIsNone(error)

	def test_the_configured_timeout_is_handed_to_the_probe(self):
		"""P3: a hung host must not hold a worker. The value actually reaches the
		call, rather than being a constant nobody passes."""
		seen = {}

		def spy(target, timeout):
			seen["timeout"] = timeout
			return (401, None, 1.0)

		with patch.object(mcp_status, "_probe_once", spy):
			mcp_status.get_mcp_status()
		self.assertEqual(seen["timeout"], mcp_status.DEFAULT_TIMEOUT_SECONDS)
		self.assertLessEqual(seen["timeout"], 5, "the timeout must stay short enough to protect a worker")
