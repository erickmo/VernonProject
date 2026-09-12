# Copyright (c) 2026, Vernon and contributors
"""Workstation (kiosk) QR attendance: fraud gates + first/last seen. Todo s28p801aid.

Runs on the live site like every suite here. TestKioskScan never commits (the class
cleanup rolls it back). TestConcurrentFirstSeen must commit -- its second connection
cannot see uncommitted rows -- and purges its own rows in tearDown/tearDownClass."""

import threading
import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_datetime, nowdate

from vernon_project.api import attendance as api
from vernon_project.attendance import qr
from vernon_project.attendance.engine import recompute_daily
from vernon_project.tests.no_leak import NoLeakMixin, needs_real_commits

EMP = "attn_kiosk_emp@example.com"
OTHER = "attn_kiosk_other@example.com"
ST_A = "Test Kiosk A"
ST_B = "Test Kiosk B"
OFFICE = "203.0.113.7"
HOME = "198.51.100.9"
CF_EDGE = "172.69.176.152"
EXPIRED = "QR expired — scan the live code again."


class TestRealIp(NoLeakMixin, unittest.TestCase):
	def test_cloudflare_hop_trusts_cf_connecting_ip(self):
		self.assertEqual(qr.real_ip(CF_EDGE, OFFICE), OFFICE)

	def test_forged_headers_sent_straight_to_origin_are_ignored(self):
		# attacker forges both headers; nginx appends the real TCP peer last
		self.assertEqual(qr.real_ip(f"{CF_EDGE}, {HOME}", OFFICE), HOME)

	def test_forged_first_hop_via_cloudflare_is_ignored(self):
		self.assertEqual(qr.real_ip(f"{OFFICE}, {HOME}, {CF_EDGE}", HOME), HOME)

	def test_missing_or_garbage_headers(self):
		self.assertEqual(qr.real_ip(None, None, "10.0.0.5"), "10.0.0.5")
		self.assertIsNone(qr.real_ip("garbage", None))


class TestOnNetwork(NoLeakMixin, unittest.TestCase):
	def test_empty_list_allows_any_network(self):
		self.assertTrue(qr.on_network("", HOME))
		self.assertTrue(qr.on_network(None, None))

	def test_ip_and_cidr_v4_v6(self):
		nets = f"{OFFICE}\n 192.0.2.0/24 \n2001:db8::/48"
		self.assertTrue(qr.on_network(nets, OFFICE))
		self.assertTrue(qr.on_network(nets, "192.0.2.200"))
		self.assertTrue(qr.on_network(nets, "2001:db8:0:1::5"))
		self.assertFalse(qr.on_network(nets, HOME))
		self.assertFalse(qr.on_network(nets, None))  # no request = cannot vouch

	def test_bad_line_raises(self):
		with self.assertRaises(ValueError):
			qr.parse_networks("office wifi")


def _ensure_fixtures():
	frappe.set_user("Administrator")
	brand = frappe.db.get_value("Brand", {}, "name")
	for u in (EMP, OTHER):
		if not frappe.db.exists("User", u):
			frappe.get_doc({"doctype": "User", "email": u, "first_name": "AttnKiosk",
							"send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Attendance Profile", u):
			frappe.get_doc({"doctype": "Attendance Profile", "user": u, "brand": brand,
							"enrolled_from": add_days(nowdate(), -30), "active": 1}).insert(ignore_permissions=True)
	for s in (ST_A, ST_B):
		if not frappe.db.exists("Attendance Station", s):
			frappe.get_doc({"doctype": "Attendance Station", "station_name": s, "active": 1}).insert(ignore_permissions=True)


def _purge_rows():
	daily = frappe.get_all("Daily Attendance", {"employee": ["in", [EMP, OTHER]]}, pluck="name")
	if daily:
		frappe.db.delete("Point Ledger", {"attendance": ["in", daily]})
		frappe.db.delete("Daily Attendance", {"name": ["in", daily]})
	frappe.db.delete("Attendance Scan", {"employee": ["in", [EMP, OTHER]]})


def _purge_fixtures():
	_purge_rows()
	for s in (ST_A, ST_B):
		frappe.delete_doc("Attendance Station", s, force=True, ignore_permissions=True, ignore_missing=True, delete_permanently=True)
	for u in (EMP, OTHER):
		frappe.delete_doc("Attendance Profile", u, force=True, ignore_permissions=True, ignore_missing=True, delete_permanently=True)
		frappe.delete_doc("User", u, force=True, ignore_permissions=True, ignore_missing=True, delete_permanently=True)


def _at(hhmm):
	return get_datetime(f"{nowdate()} {hhmm}:00")


class TestKioskScan(NoLeakMixin, FrappeTestCase):
	def setUp(self):
		_ensure_fixtures()
		for s in (ST_A, ST_B):
			frappe.db.set_value("Attendance Station", s, {"active": 1, "allowed_networks": None})
		for u in (EMP, OTHER):
			frappe.cache.delete(frappe.cache.make_key(f"vp_attendance_scan:{u}"))
		real = frappe.db.get_single_value
		self._enabled = patch.object(
			frappe.db, "get_single_value",
			side_effect=lambda dt, f, *a, **k: 1 if (dt, f) == ("Vernon Settings", "attendance_enabled") else real(dt, f, *a, **k),
		)
		self._enabled.start()

	def tearDown(self):
		self._enabled.stop()
		frappe.set_user("Administrator")
		_purge_rows()

	def _scan(self, station=ST_A, counter=None, token=None, ip=OFFICE, user=EMP, at=None, **extra):
		if counter is None or token is None:
			p = qr.current_payload(station)
			counter, token = p["counter"], p["token"]
		kwargs = {"station": station, "counter": counter, "token": token, **extra}
		frappe.set_user(user)
		try:
			with patch.object(qr, "client_ip", return_value=ip), \
				 patch.object(api, "now_datetime", return_value=at or _at("08:00")):
				return frappe.call(api.attendance_scan, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def _scans(self, user=EMP):
		return frappe.get_all("Attendance Scan", {"employee": user},
							  ["employee", "station", "scan_time", "token_counter", "ip_address"])

	def test_valid_dynamic_qr_creates_authenticated_scan_event(self):
		r = self._scan()
		self.assertEqual((r["status"], r["duplicate"]), ("ok", False))
		(row,) = self._scans()
		self.assertEqual((row.employee, row.station, row.ip_address), (EMP, ST_A, OFFICE))
		self.assertEqual(row.scan_time, _at("08:00"))

	def test_first_scan_sets_first_seen_and_last_seen(self):
		# the test employee has no shift (OffDay): first/last seen must still be recorded
		d = self._scan()["daily"]
		self.assertEqual(d["status"], "OffDay")
		self.assertEqual((d["first_scan"], d["last_scan"]), (str(_at("08:00")),) * 2)
		self.assertEqual((d["station_first"], d["station_last"]), (ST_A, ST_A))

	def test_later_scan_updates_last_seen_without_changing_first_seen(self):
		self._scan(ST_A, at=_at("08:00"))
		d = self._scan(ST_B, at=_at("17:30"))["daily"]
		self.assertEqual((d["first_scan"], d["station_first"]), (str(_at("08:00")), ST_A))
		self.assertEqual((d["last_scan"], d["station_last"]), (str(_at("17:30")), ST_B))

	def test_retry_and_rapid_repeat_are_idempotent(self):
		p = qr.current_payload(ST_A)
		first = self._scan(counter=p["counter"], token=p["token"], at=_at("08:00"))
		again = [self._scan(counter=p["counter"], token=p["token"], at=_at("08:01")) for _ in range(3)]
		self.assertEqual(len(self._scans()), 1)
		self.assertFalse(first["duplicate"])
		self.assertTrue(all(r["duplicate"] and r["status"] == "ok" for r in again))
		self.assertEqual(again[-1]["daily"]["first_scan"], str(_at("08:00")))
		self.assertEqual(again[-1]["daily"]["last_scan"], str(_at("08:00")))

	def test_expired_replayed_and_malformed_token_raise_exact_errors(self):
		p = qr.current_payload(ST_A)
		old = p["counter"] - 5
		old_token = qr._token(frappe.db.get_value("Attendance Station", ST_A, "secret_key"), old)
		for counter, token in ((old, old_token), ("abc", p["token"]), (p["counter"], "deadbeef"), (p["counter"], "")):
			r = self._scan(counter=counter, token=token)
			self.assertEqual(r, {"status": "error", "message": EXPIRED})
		self.assertEqual(self._scans(), [])

	def test_token_cannot_be_replayed_on_another_workstation(self):
		p = qr.current_payload(ST_A)
		r = self._scan(station=ST_B, counter=p["counter"], token=p["token"])
		self.assertEqual(r, {"status": "error", "message": EXPIRED})
		self.assertEqual(self._scans(), [])

	def test_revoked_or_unprovisioned_workstation_is_rejected(self):
		frappe.db.set_value("Attendance Station", ST_A, "active", 0)
		self.assertEqual(self._scan(ST_A)["message"], "Unknown or inactive station.")
		r = self._scan("No Such Station", counter=1, token="x")
		self.assertEqual(r["message"], "Unknown or inactive station.")
		key = frappe.db.get_value("Attendance Station", ST_A, "display_key")
		with patch.object(qr, "client_ip", return_value=OFFICE):
			self.assertRaises(frappe.PermissionError, api.station_token, ST_A, key)
			self.assertRaises(frappe.PermissionError, api.station_token, ST_B, "wrong-key")
		self.assertEqual(self._scans(), [])

	def test_scan_from_outside_office_network_is_rejected(self):
		frappe.db.set_value("Attendance Station", ST_A, "allowed_networks", f"{OFFICE}\n192.0.2.0/24")
		r = self._scan(ip=HOME)
		self.assertEqual(r, {"status": "error", "message": "Connect to the office Wi-Fi, then scan again."})
		self.assertEqual(self._scans(), [])
		self.assertEqual(self._scan(ip="192.0.2.44")["status"], "ok")

	def test_kiosk_outside_office_network_gets_no_qr(self):
		frappe.db.set_value("Attendance Station", ST_A, "allowed_networks", OFFICE)
		key = frappe.db.get_value("Attendance Station", ST_A, "display_key")
		with patch.object(qr, "client_ip", return_value=HOME):
			self.assertRaises(frappe.PermissionError, api.station_token, ST_A, key)
		with patch.object(qr, "client_ip", return_value=OFFICE):
			p = api.station_token(ST_A, key)
		self.assertEqual((p["station"], p["network"]), (ST_A, OFFICE))
		self.assertTrue(qr.verify(ST_A, p["counter"], p["token"]))

	def test_bad_network_line_is_refused_on_save(self):
		doc = frappe.get_doc("Attendance Station", ST_A)
		doc.allowed_networks = "office wifi"
		self.assertRaises(frappe.ValidationError, doc.save)

	def test_client_timestamp_and_identity_fields_are_ignored(self):
		self._scan(employee=OTHER, scan_time="2020-01-01 00:00:00", ip_address="1.2.3.4", station_first="X")
		(row,) = self._scans()
		self.assertEqual((row.employee, row.scan_time, row.ip_address), (EMP, _at("08:00"), OFFICE))
		self.assertEqual(self._scans(OTHER), [])

	def test_employee_cannot_read_another_employee_events(self):
		self._scan(user=EMP)
		frappe.set_user(OTHER)
		try:
			self.assertEqual(api.my_attendance()["rows"], [])
			self.assertRaises(frappe.PermissionError, api.attendance_report, nowdate(), nowdate(), EMP)
		finally:
			frappe.set_user("Administrator")

	def test_authorized_hr_can_audit_events_and_derived_values(self):
		self._scan(ST_A, at=_at("08:00"))
		self._scan(ST_B, at=_at("17:30"))
		rep = api.attendance_report(nowdate(), nowdate(), employee=EMP)  # as Administrator
		labels = [c["label"] for c in rep["columns"]]
		self.assertIn("First station", labels)
		(row,) = rep["rows"]
		self.assertEqual((row.first_scan, row.station_first, row.last_scan, row.station_last),
						 (_at("08:00"), ST_A, _at("17:30"), ST_B))

	def test_rate_limit_returns_exact_safe_error(self):
		key = frappe.cache.make_key(f"vp_attendance_scan:{EMP}")
		frappe.cache.setex(key, 60, api.SCAN_LIMIT_PER_MINUTE)
		with self.assertRaises(frappe.RateLimitExceededError) as cm:
			self._scan()
		self.assertIn("Too many scans", str(cm.exception))
		self.assertEqual(self._scans(), [])

	def test_scan_query_count_is_bounded(self):
		"""Queries per scan must not grow with how many scans the day already has."""
		def count(counter, at):
			n = [0]
			real = frappe.db.sql

			def counting(*a, **k):
				n[0] += 1
				return real(*a, **k)
			with patch.object(frappe.db, "sql", side_effect=counting):
				r = self._scan(ST_B, counter=counter, token="t", at=at)
			self.assertFalse(r["duplicate"])
			return n[0]

		with patch.object(qr, "verify", return_value=True):  # explicit counters, no clock flake
			self._scan(ST_A, counter=100, token="t", at=_at("08:00"))  # Daily Attendance insert path
			few = count(101, _at("09:00"))
			for i in range(30):
				frappe.get_doc({"doctype": "Attendance Scan", "employee": EMP, "station": ST_A,
								"scan_time": _at("10:00"), "token_counter": i}).insert(ignore_permissions=True)
			many = count(102, _at("11:00"))
		self.assertEqual(few, many)


def _winner(site, sites_path, day):
	"""A second, independent request: records an 08:00 scan and commits."""
	frappe.init(site=site, sites_path=sites_path)
	frappe.connect()
	try:
		frappe.set_user("Administrator")
		frappe.get_doc({"doctype": "Attendance Scan", "employee": EMP, "station": ST_B,
						"scan_time": f"{day} 08:00:00", "token_counter": 1}).insert(ignore_permissions=True)
		recompute_daily(EMP, day)
		frappe.db.commit()
	finally:
		frappe.destroy()


class TestConcurrentFirstSeen(NoLeakMixin, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_ensure_fixtures()
		frappe.db.commit()  # the winner's connection must see the fixtures

	@classmethod
	def tearDownClass(cls):
		frappe.db.rollback()
		_purge_fixtures()
		frappe.db.commit()
		super().tearDownClass()

	def tearDown(self):
		frappe.db.rollback()
		_purge_rows()
		frappe.db.commit()

	@needs_real_commits  # second connection: holding the commit removes the contention it pins
	def test_concurrent_scans_keep_one_correct_first_and_last_seen(self):
		day = nowdate()
		# Pin this transaction's snapshot the way a real request does with its first reads.
		frappe.db.sql("select name from `tabAttendance Scan` limit 1")
		frappe.db.sql("select name from `tabDaily Attendance` limit 1")
		t = threading.Thread(target=_winner, args=(frappe.local.site, frappe.local.sites_path, day))
		t.start()
		t.join(60)
		self.assertFalse(t.is_alive())

		frappe.get_doc({"doctype": "Attendance Scan", "employee": EMP, "station": ST_A,
						"scan_time": f"{day} 09:00:00", "token_counter": 2}).insert(ignore_permissions=True)
		recompute_daily(EMP, day)

		# locking read: a plain one would hide a duplicate row committed by the winner
		rows = frappe.db.sql(
			"""select first_scan, station_first, last_scan, station_last from `tabDaily Attendance`
			where employee = %s and attendance_date = %s for update""",
			(EMP, day), as_dict=True,
		)
		self.assertEqual(len(rows), 1)
		self.assertEqual((rows[0].first_scan, rows[0].station_first), (_at("08:00"), ST_B))
		self.assertEqual((rows[0].last_scan, rows[0].station_last), (_at("09:00"), ST_A))
