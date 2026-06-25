import frappe

# Level scale changed from -5..5 to 0..10 (shift +5):
#   -5→0  -4→1  -3→2  -2→3  -1→4  0→5  1→6  2→7  3→8  4→9  5→10
# Three tables store the level by name and must be remapped together:
#   - `tabGroup Level`.level_name  (child rows of Group)
#   - `tabProject Todo`.level      (chosen level on each todo)
#   - `tabPoint Ledger`.level_name (historical scoring label)
MAPPING = {
	"-5": "0", "-4": "1", "-3": "2", "-2": "3", "-1": "4",
	"0": "5", "1": "6", "2": "7", "3": "8", "4": "9", "5": "10",
}

# (table, column) tuples to remap.
TARGETS = [
	("tabGroup Level", "level_name"),
	("tabProject Todo", "level"),
	("tabPoint Ledger", "level_name"),
]


def _case_sql(column):
	"""Build a CASE expression mapping old→new in a single pass.

	Evaluating each row's ORIGINAL value once avoids the double-map bug a
	sequence of UPDATEs would hit (old 0..5 overlap new 0..5).
	"""
	whens = " ".join(f"WHEN %(k{i})s THEN %(v{i})s" for i in range(len(MAPPING)))
	return f"`{column}` = CASE `{column}` {whens} ELSE `{column}` END"


def _params():
	p = {}
	for i, (old, new) in enumerate(MAPPING.items()):
		p[f"k{i}"] = old
		p[f"v{i}"] = new
	return p


def execute():
	# Single global gate: old-scale installs always seed the full -5..5 ladder
	# on every Group, so a negative `tabGroup Level` row reliably means the
	# whole DB is still old-scale. Project Todo / Point Ledger can legitimately
	# lack negatives (e.g. only neutral '0' rows), so guarding them individually
	# would wrongly skip them — gate on Group Level and remap all three together.
	# A re-run (or fresh 0..10 install) finds no negatives and skips everything.
	is_old_scale = frappe.db.sql(
		"SELECT 1 FROM `tabGroup Level` WHERE `level_name` IN ('-5','-4','-3','-2','-1') LIMIT 1"
	)
	if not is_old_scale:
		return

	params = _params()
	for table, column in TARGETS:
		frappe.db.sql(f"UPDATE `{table}` SET {_case_sql(column)}", params)

	frappe.db.commit()
