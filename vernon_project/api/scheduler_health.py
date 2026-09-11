# Copyright (c) 2026, Vernon and contributors
"""Warn the admins when the site's scheduler stops, and let them turn it back on (be86ciu75f).

project.vernon.id's scheduler sat off from 2026-09-06 to 2026-09-11 (a test run killed
mid-way left System Settings.enable_scheduler = 0) and nobody knew: routine todos, nightly
attendance and reminders all silently stopped. A scheduled job cannot watch for that — it
is exactly what stops — so the check rides on `bootstrap`, which every user's app calls
on open, and is cached so it costs one Redis read per boot.

The signal is "no scheduled job has logged for STALE_MINUTES", not the enable flag
alone: a normal test run switches the flag off for minutes (jobs ran right before it)
and must not page anyone, while a strand, a deliberate disable, or a dead scheduler
process (flag on, nothing running) all cross the threshold.
"""
import frappe
from frappe import _
from frappe.utils import format_datetime, get_datetime, now_datetime

STALE_MINUTES = 60  # a healthy site logs a scheduled job every few minutes
_HEALTH_KEY = "vp_scheduler_health"
_NOTIFIED_KEY = "vp_scheduler_down_notified"
_HEALTH_TTL = 300


def scheduler_health(fresh=False):
	"""{ok, reason, last_run, last_run_human}. reason is None when ok, else
	'disabled' (the System Settings flag — the in-app button fixes it), 'paused'
	(maintenance_mode / pause_scheduler in site config — needs the server) or 'stalled'
	(flag on, yet nothing ran — the scheduler process needs a restart)."""
	if not fresh:
		cached = frappe.cache.get_value(_HEALTH_KEY)
		if cached:
			return cached
	from frappe.utils.scheduler import is_scheduler_disabled

	last = _last_run()
	stale = bool(last) and (now_datetime() - get_datetime(last)).total_seconds() > STALE_MINUTES * 60
	conf = frappe.local.conf
	if conf.maintenance_mode or conf.pause_scheduler:
		reason = "paused"
	elif is_scheduler_disabled(verbose=False):
		reason = "disabled"
	else:
		reason = "stalled"
	health = {
		"ok": not stale,
		"reason": reason if stale else None,
		"last_run": str(last) if last else None,
		# Absolute, not pretty_date: that is English ("6 minutes ago") inside Bahasa copy.
		"last_run_human": format_datetime(last, "d MMM HH:mm") if last else None,
	}
	frappe.cache.set_value(_HEALTH_KEY, health, expires_in_sec=_HEALTH_TTL)
	return health


def _last_run():
	return frappe.db.sql("select max(creation) from `tabScheduled Job Log`")[0][0]


def _admins():
	return frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User", "parent": ["not in", ("Administrator", "Guest")]},
		pluck="parent",
		distinct=True,
	)


def check_and_notify():
	"""Health for this boot; on the first boot of an outage, one Warning notification
	to every enabled System Manager (Erick Mo among them). Never raises into bootstrap."""
	try:
		health = scheduler_health()
		key = frappe.cache.make_key(_NOTIFIED_KEY)
		if health["ok"]:
			frappe.cache.delete(key)  # outage over: the next one notifies again
			return health
		# SET NX: of many concurrent boots, exactly one sends the notification.
		if frappe.cache.set(key, 1, nx=True):
			from vernon_project.api.mobile import _notify

			enabled = set(frappe.get_all("User", filters={"enabled": 1, "name": ["in", _admins() or [""]]}, pluck="name"))
			for user in sorted(enabled):
				_notify(
					recipient=user,
					type="Warning",
					title=_("Penjadwal otomatis tidak berjalan"),
					body=_("Tidak ada job terjadwal sejak {0}: tugas rutin, pengingat dan absensi harian tidak dibuat. Buka Beranda untuk mengaktifkannya.").format(
						health["last_run_human"] or "-"
					),
				)
		return health
	except Exception:
		frappe.log_error(title="scheduler health check failed")
		return {"ok": True, "reason": None, "last_run": None, "last_run_human": None}


@frappe.whitelist(methods=["POST"])
def enable_scheduler():
	"""The Home banner's button. System Manager only. Turns the System Settings flag
	back on; a scheduler paused in site config or a dead scheduler process cannot be
	fixed from the app, and the error says so."""
	# Explicit, not frappe.only_for: that one returns early under tests (flags.in_test),
	# so a regression in this gate could never go red.
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Hanya System Manager yang bisa mengaktifkan penjadwal."), frappe.PermissionError)
	conf = frappe.local.conf
	if conf.maintenance_mode or conf.pause_scheduler:
		frappe.throw(_("Penjadwal dijeda di konfigurasi server (maintenance_mode / pause_scheduler) — perlu akses server."))
	from frappe.utils.scheduler import enable_scheduler as _enable

	_enable()
	frappe.db.commit()
	frappe.cache.delete_value(_HEALTH_KEY)
	return {"enabled": True, **scheduler_health(fresh=True)}
