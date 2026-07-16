# Seed the 12 statutory Indonesian leave categories and backfill legacy rows.
# Idempotent: get_or_create by leave_name. Sources: UU 13/2003 (Pasal 79(3),
# 81, 82, 93(4)) as amended by UU Cipta Kerja, and UU 4/2024 (KIA, maternity).
import frappe

# (leave_name, limit_kind, day_limit, gender, requires_proof, is_default_annual, sort_order)
# Maternity seeded at the 6-month ceiling (180), not the 3-month floor, so a
# proof-backed extension under UU 4/2024 is not hard-blocked. Admin may lower to 90.
SEEDS = [
	("Cuti Tahunan",               "Annual Quota", 12,  "Any",    0, 1, 10),
	("Cuti Sakit",                 "Documented",   0,   "Any",    1, 0, 20),
	("Cuti Melahirkan",            "Per Event",    180, "Female", 0, 0, 30),
	("Cuti Keguguran",             "Per Event",    45,  "Female", 1, 0, 40),
	("Cuti Haid",                  "Per Event",    2,   "Female", 0, 0, 50),
	("Cuti Menikah",               "Per Event",    3,   "Any",    0, 0, 60),
	("Cuti Menikahkan Anak",       "Per Event",    2,   "Any",    0, 0, 70),
	("Cuti Khitan Anak",           "Per Event",    2,   "Any",    0, 0, 80),
	("Cuti Baptis Anak",           "Per Event",    2,   "Any",    0, 0, 90),
	("Cuti Pendamping",            "Per Event",    2,   "Male",   0, 0, 100),
	("Cuti Duka (Keluarga Inti)",  "Per Event",    2,   "Any",    0, 0, 110),
	("Cuti Duka (Serumah)",        "Per Event",    1,   "Any",    0, 0, 120),
]


def execute():
	for name, kind, limit, gender, proof, default_annual, order in SEEDS:
		if frappe.db.exists("Leave Type", name):
			continue
		frappe.get_doc({
			"doctype": "Leave Type",
			"leave_name": name,
			"enabled": 1,
			"limit_kind": kind,
			"day_limit": limit,
			"gender": gender,
			"requires_proof": proof,
			"paid": 1,
			"is_default_annual": default_annual,
			"sort_order": order,
		}).insert(ignore_permissions=True)

	# Backfill: legacy Leave rows had no category -> the historical single pool.
	frappe.db.sql(
		"""UPDATE `tabAttendance Exception`
		   SET leave_type = 'Cuti Tahunan'
		   WHERE exception_type = 'Leave' AND (leave_type IS NULL OR leave_type = '')"""
	)
	frappe.db.commit()
