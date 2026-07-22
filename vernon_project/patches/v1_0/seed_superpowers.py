import frappe

# (name, category, icon, color, description) — icon = lucide name, color = hex chip.
# description = short Bahasa explanation (end-user surface).
CATALOG = [
	("Visionary", "Strategy", "telescope", "#6366f1", "Melihat arah masa depan dan menggambarkannya dengan jelas."),
	("Problem Solving", "Execution", "puzzle", "#0ea5e9", "Mengurai masalah rumit menjadi solusi yang bisa dijalankan."),
	("Sales", "Sales & Growth", "trending-up", "#22c55e", "Mengubah obrolan menjadi kesepakatan yang closing."),
	("Marketing", "Sales & Growth", "megaphone", "#f97316", "Menyampaikan pesan yang tepat ke orang yang tepat."),
	("Strategic Thinking", "Strategy", "target", "#8b5cf6", "Merancang beberapa langkah ke depan menuju tujuan."),
	("Negotiation", "Sales & Growth", "handshake", "#14b8a6", "Mencari kesepakatan yang menguntungkan kedua pihak."),
	("Leadership", "Leadership", "crown", "#f59e0b", "Menggerakkan orang menuju arah yang sama."),
	("Communication", "Interpersonal", "message-circle", "#3b82f6", "Menjelaskan ide sampai semua orang paham."),
	("Execution & Ownership", "Execution", "check-circle", "#10b981", "Bertanggung jawab penuh dan menuntaskan pekerjaan."),
	("Creativity", "Craft", "sparkles", "#ec4899", "Menghadirkan ide segar dan orisinal."),
	("Analytical Thinking", "Strategy", "bar-chart-3", "#0891b2", "Membaca data dan menarik kesimpulan yang tajam."),
	("Coaching & Mentoring", "Leadership", "users", "#a855f7", "Menumbuhkan dan membimbing orang di sekitarnya."),
	("Adaptability", "Interpersonal", "shuffle", "#06b6d4", "Tetap efektif saat rencana berubah."),
	("Customer Focus", "Sales & Growth", "heart-handshake", "#ef4444", "Menjadikan pelanggan pusat dari setiap keputusan."),
	("Financial Acumen", "Strategy", "dollar-sign", "#65a30d", "Memahami angka di balik setiap keputusan."),
	("Product Sense", "Craft", "lightbulb", "#eab308", "Tahu apa yang harus dibangun dan alasannya."),
	("Operational Excellence", "Execution", "settings", "#64748b", "Membuat operasional berjalan mulus dan andal."),
	("Storytelling", "Craft", "book-open", "#d946ef", "Membuat ide membekas lewat cerita yang menarik."),
	("Teamwork", "Interpersonal", "users-round", "#2563eb", "Mengangkat seluruh tim, bukan hanya diri sendiri."),
	("Decision Making", "Leadership", "scale", "#f43f5e", "Berani mengambil keputusan meski penuh ketidakpastian."),
]

# Performance-earned superpowers — auto-computed, not votable/claimable.
# icon = kebab-case lucide name (resolved by @/lib/spIcon), no emoji.
# (name, metric, icon, color, description)
PERFORMANCE = [
	("Timekeeper", "ontime", "clock", "#0ea5e9", "Datang tepat waktu — kehadiran yang disiplin."),
	("Deadline Slayer", "beat_deadline", "zap", "#ef4444", "Menuntaskan tugas sebelum atau tepat di deadline."),
	("Iron Streak", "streak", "flame", "#f97316", "Aktif berturut-turut tanpa putus."),
	("Finisher", "finisher", "flag", "#22c55e", "Banyak menuntaskan tugas dalam sebulan terakhir."),
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
