import frappe

# (name, category, icon, color, description) — icon = lucide name, color = hex chip.
CATALOG = [
	("Visionary", "Strategy", "telescope", "#6366f1", "Sees where things are headed and paints the future."),
	("Problem Solving", "Execution", "puzzle", "#0ea5e9", "Untangles hard problems into workable answers."),
	("Sales", "Sales & Growth", "trending-up", "#22c55e", "Turns conversations into closed deals."),
	("Marketing", "Sales & Growth", "megaphone", "#f97316", "Gets the right message to the right people."),
	("Strategic Thinking", "Strategy", "target", "#8b5cf6", "Plans several moves ahead toward the goal."),
	("Negotiation", "Sales & Growth", "handshake", "#14b8a6", "Finds deals where both sides win."),
	("Leadership", "Leadership", "crown", "#f59e0b", "Rallies people around a shared direction."),
	("Communication", "Interpersonal", "message-circle", "#3b82f6", "Explains ideas so everyone gets them."),
	("Execution & Ownership", "Execution", "check-circle", "#10b981", "Owns the outcome and gets it done."),
	("Creativity", "Craft", "sparkles", "#ec4899", "Brings fresh, original ideas to the table."),
	("Analytical Thinking", "Strategy", "bar-chart-3", "#0891b2", "Reads the data and draws sharp conclusions."),
	("Coaching & Mentoring", "Leadership", "users", "#a855f7", "Grows the people around them."),
	("Adaptability", "Interpersonal", "shuffle", "#06b6d4", "Stays effective when the plan changes."),
	("Customer Focus", "Sales & Growth", "heart-handshake", "#ef4444", "Keeps the customer at the center of every call."),
	("Financial Acumen", "Strategy", "dollar-sign", "#65a30d", "Understands the numbers behind decisions."),
	("Product Sense", "Craft", "lightbulb", "#eab308", "Knows what to build and why it matters."),
	("Operational Excellence", "Execution", "settings", "#64748b", "Makes the machine run smoothly and reliably."),
	("Storytelling", "Craft", "book-open", "#d946ef", "Makes ideas stick with a great narrative."),
	("Teamwork", "Interpersonal", "users-round", "#2563eb", "Lifts the whole team, not just themselves."),
	("Decision Making", "Leadership", "scale", "#f43f5e", "Makes the call, even under uncertainty."),
]

# Performance-earned superpowers — auto-computed, not votable/claimable.
# (name, metric, icon, color, description)
PERFORMANCE = [
	("Timekeeper", "ontime", "⏰", "#0ea5e9", "Datang tepat waktu — kehadiran yang disiplin."),
	("Deadline Slayer", "beat_deadline", "⚡", "#ef4444", "Menuntaskan tugas sebelum atau tepat di deadline."),
	("Iron Streak", "streak", "🔗", "#f97316", "Aktif berturut-turut tanpa putus."),
	("Finisher", "finisher", "🏁", "#22c55e", "Banyak menuntaskan tugas dalam sebulan terakhir."),
]

# (level_name, min_score, color, icon)
LEVELS = [
	("Emerging", 0, "#94a3b8", "🌱"),
	("Capable", 4, "#38bdf8", "🍀"),
	("Strong", 6, "#22c55e", "🔥"),
	("Expert", 8, "#a855f7", "⭐"),
	("Master", 9, "#f59e0b", "👑"),
]


def execute():
	"""Seed the Superpower catalog + default leveling bands. Idempotent."""
	for name, category, icon, color, description in CATALOG:
		if not frappe.db.exists("Superpower", name):
			frappe.get_doc({
				"doctype": "Superpower",
				"superpower_name": name,
				"category": category,
				"icon": icon,
				"color": color,
				"description": description,
				"enabled": 1,
			}).insert(ignore_permissions=True)

	for name, metric, icon, color, description in PERFORMANCE:
		if not frappe.db.exists("Superpower", name):
			frappe.get_doc({
				"doctype": "Superpower",
				"superpower_name": name,
				"kind": "Performance",
				"metric": metric,
				"category": "Execution",
				"icon": icon,
				"color": color,
				"description": description,
				"enabled": 1,
			}).insert(ignore_permissions=True)

	settings = frappe.get_single("Superpower Settings")
	if not settings.perf_window_days:
		settings.perf_window_days = 30
	if not settings.streak_target:
		settings.streak_target = 30
	if not settings.finisher_target:
		settings.finisher_target = 30
	if not settings.levels:
		for level_name, min_score, color, icon in LEVELS:
			settings.append("levels", {
				"level_name": level_name,
				"min_score": min_score,
				"color": color,
				"icon": icon,
			})
	settings.save(ignore_permissions=True)

	frappe.db.commit()
