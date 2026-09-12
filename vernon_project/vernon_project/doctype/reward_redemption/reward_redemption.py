# vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr, flt, now_datetime

# The points wallet is computed live as
#   sum(Point Ledger credits) - sum(Reward Redemption debits) - unlocks - event spends
# (api/mobile.py:3790). So a row here is a LEDGER ENTRY, not just a record of a
# purchase: change its point_cost and the user's balance moves; delete it and the
# debit disappears. Point Ledger grants write to System Manager only, precisely so
# points cannot be minted -- these guards stop the other half of the same equation
# being used to do it.
#
# They live in the controller rather than the DocPerm table on purpose: fulfilment
# goes through the GENERIC /api/resource PUT (frontend/src/hooks/useData.ts sends
# {status: "Fulfilled"}), so Marketplace Manager's write grant is load-bearing and
# cannot simply be withdrawn. The controller is the one place every path -- REST,
# Desk and engine alike -- must pass through.
IMMUTABLE_AFTER_INSERT = ("user", "reward", "point_cost")


class RewardRedemption(Document):
	def validate(self):
		# Marketplace Reward already refuses a negative point_cost; the row that
		# actually moves the balance did not. A negative debit is a credit.
		if flt(self.point_cost) < 0:
			frappe.throw(_("Point Cost cannot be negative."), frappe.ValidationError)
		if not self.is_new():
			self._guard_immutable_fields()

	def before_save(self):
		# Stamp the fulfilment time when an admin flips status to Fulfilled.
		if self.status == "Fulfilled" and not self.fulfilled_on:
			self.fulfilled_on = now_datetime()

	def _guard_immutable_fields(self):
		"""Who and what a redemption charged is fixed once written; only status, note
		and fulfilled_on move afterwards.

		An explicit get_roles() check, NOT frappe.only_for(): only_for is a no-op
		while frappe.flags.in_test, so a gate built on it can never fail in the suite.

		Compared against the DB row rather than get_doc_before_save(), which is None
		on some paths and whose attribute access breaks when a field is newer than the
		loaded schema.
		"""
		if "System Manager" in frappe.get_roles():
			return
		before = frappe.db.get_value(
			self.doctype, self.name, IMMUTABLE_AFTER_INSERT, as_dict=True
		)
		if not before:
			return
		changed = [
			f for f in IMMUTABLE_AFTER_INSERT
			if (flt(self.get(f)) != flt(before.get(f)) if f == "point_cost"
				else cstr(self.get(f)) != cstr(before.get(f)))
		]
		if changed:
			frappe.throw(
				_("Only a System Manager can change {0} on a redemption.").format(
					", ".join(changed)
				),
				frappe.PermissionError,
			)

	def on_trash(self):
		"""Deleting a redemption erases its debit, i.e. refunds the points with no
		record that it happened. Nothing in the app deletes one -- the engine only
		inserts (api/mobile.py, ignore_permissions=True) -- so this closes the
		/api/resource DELETE that Marketplace Manager's grant would otherwise allow.
		"""
		if "System Manager" not in frappe.get_roles():
			frappe.throw(
				_("Only a System Manager can delete a redemption."), frappe.PermissionError
			)

	def on_update(self):
		old = self.get_doc_before_save()
		prev_status = old.status if old else None
		if self.status == "Fulfilled" and prev_status != "Fulfilled":
			try:
				from vernon_project.api.mobile import _notify

				_notify(
					recipient=self.user,
					type="Redemption",
					title="Reward fulfilled",
					body=f"Your redemption of “{self.reward_name}” was fulfilled.",
					reference_doctype="Reward Redemption",
					reference_name=self.name,
					actor=frappe.session.user,
				)
			except Exception:
				frappe.log_error(title="redemption notify failed")
