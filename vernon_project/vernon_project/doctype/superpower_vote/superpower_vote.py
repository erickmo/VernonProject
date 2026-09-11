# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SuperpowerVote(Document):
	pass


def on_doctype_update():
	# One vote per (ratee, voter, superpower, quarter). api/superpowers.py::_upsert_vote
	# checks then inserts, and that races: two concurrent votes both find nothing and
	# both insert, and the duplicates skew the ratee's confidence-weighted aggregate.
	# The unique index is the real backstop -- isolation-independent, and it covers
	# every write path rather than just the one endpoint.
	#
	# Declared here so FRESH INSTALLS index automatically (patches are skipped on
	# install); patches/v1_0/recognition_race_indexes is the other half, so existing
	# sites pick it up on migrate. add_unique is idempotent.
	frappe.db.add_unique(
		"Superpower Vote",
		["ratee", "voter", "superpower", "quarter"],
		constraint_name="unique_vote_per_quarter",
	)
