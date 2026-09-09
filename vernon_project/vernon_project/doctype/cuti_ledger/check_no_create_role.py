# Static pin for the 2026-09-09 permission sweep: no role except System
# Manager may hold `create`, `write`, or `delete` on Cuti Ledger -- this
# doctype's controller is deliberately an empty `pass` (comment: "exactly
# like Point Ledger"), so the permission table is the ONLY gate. Every
# legitimate writer lives in vernon_project.attendance.cuti_ledger (the
# minting/sync engine) and already inserts/saves/deletes with
# ignore_permissions=True -- HR Manager previously held all three verbs
# directly, letting any HR Manager edit or delete a past leave-balance row
# with no validation and no audit trail, bypassing every quota/approval
# check in attendance.py. Mirrors point_ledger/check_no_create_role.py,
# the same shape on the app's other append-only ledger.
# Run: python3 check_no_create_role.py
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
	with open(os.path.join(HERE, "cuti_ledger.json")) as f:
		perms = json.load(f)["permissions"]
	creators = [p["role"] for p in perms if p.get("create")]
	writers = [p["role"] for p in perms if p.get("write")]
	deleters = [p["role"] for p in perms if p.get("delete")]
	assert creators == ["System Manager"], f"unexpected create-holders on Cuti Ledger: {creators}"
	assert writers == ["System Manager"], f"unexpected write-holders on Cuti Ledger: {writers}"
	assert deleters == ["System Manager"], f"unexpected delete-holders on Cuti Ledger: {deleters}"
	print("OK — only System Manager holds create/write/delete on Cuti Ledger:", creators)
