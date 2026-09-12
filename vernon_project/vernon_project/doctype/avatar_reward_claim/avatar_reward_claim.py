# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AvatarRewardClaim(Document):
	def autoname(self):
		"""The docname IS the claim's natural key, and that is load-bearing.

		There is no unique INDEX on (user, claim_type, claim_ref) — this composite
		docname, enforced as the primary key, is the only thing that stops a reward
		being claimed twice. The callers' own guard (`_has_claim` then
		`_record_claim` under an advisory lock) does NOT hold on its own: this bench
		runs REPEATABLE READ, so a request's plain `_has_claim` read can return the
		snapshot it took before a concurrent claim committed, and the advisory lock
		is released before commit. Verified live — the losing request's `_has_claim`
		returned False and only the primary key stopped the second grant.

		So do not replace this with a hash or a random name without first adding a
		real unique constraint on those three fields.
		"""
		self.name = f"{self.user}|{self.claim_type}|{self.claim_ref}"
