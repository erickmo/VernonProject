import frappe

def execute():
	from vernon_project.api.mobile import _gami_settings
	try:
		bs = frappe.get_single("Badge Settings")
		tiers = bs.tiers or []
	except Exception:
		tiers = []
	if not tiers:
		return
	s = _gami_settings()
	existing_codes = {a.code for a in (s.achievements or [])}
	added = 0
	for t in tiers:
		code = f"tier_{int(t.min_points or 0)}"
		if code in existing_codes:
			continue
		s.append("achievements", {
			"code": code, "title": t.tier_name, "icon": t.icon, "color": t.color,
			"is_tier": 1, "condition": "badge_points", "threshold": float(t.min_points or 0),
			"reward_points": 0,
		})
		existing_codes.add(code)
		added += 1
	if added:
		s.flags.ignore_permissions = True
		s.save(ignore_permissions=True)
		frappe.db.commit()
