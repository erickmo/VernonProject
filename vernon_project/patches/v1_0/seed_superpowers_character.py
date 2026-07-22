import frappe

# Human / character superpowers — the traits a workspace relies on beyond hard
# skills: empathy, dependability, positive energy. Voted-kind (self-claimable +
# peer-ratable). Icons are kebab-case lucide names (resolved by @/lib/spIcon in
# both frontends) — real vector icons, no emoji.
# (name, category, icon, color, description) — description in Bahasa (end-user surface).
CATALOG = [
	("Empathy", "Character", "heart", "#f43f5e", "Peka dan memahami perasaan rekan kerja."),
	("Fun & Positive Energy", "Character", "party-popper", "#f59e0b", "Membawa energi positif dan bikin kerja lebih menyenangkan."),
	("Reliability", "Character", "shield-check", "#10b981", "Bisa diandalkan — janji ditepati, kerjaan beres."),
	("Integrity", "Character", "compass", "#0ea5e9", "Jujur dan konsisten, walau tak sedang diawasi."),
	("Patience", "Character", "hourglass", "#14b8a6", "Tenang dan sabar menghadapi proses yang sulit."),
	("Calm Under Pressure", "Character", "wind", "#06b6d4", "Tetap tenang dan jernih saat situasi menekan."),
	("Resilience", "Character", "battery-charging", "#ef4444", "Cepat bangkit setelah gagal atau terpukul."),
	("Generosity", "Character", "gift", "#ec4899", "Murah hati berbagi ilmu, waktu, dan apresiasi."),
	("Humility", "Character", "sprout", "#84cc16", "Rendah hati, mau mendengar dan terus belajar."),
	("Supportiveness", "Interpersonal", "hand-helping", "#a855f7", "Sigap membantu saat rekan membutuhkan."),
	("Active Listening", "Interpersonal", "ear", "#3b82f6", "Mendengarkan sungguh-sungguh sebelum menanggapi."),
	("Attention to Detail", "Execution", "search", "#64748b", "Teliti — menangkap hal kecil yang orang lain lewatkan."),
	("Initiative", "Execution", "rocket", "#f97316", "Bergerak duluan tanpa menunggu diminta."),
	("Curiosity", "Craft", "microscope", "#eab308", "Selalu ingin tahu dan mencoba hal baru."),
]


def execute():
	"""Add the human/character superpowers to the catalog. Idempotent."""
	for name, category, icon, color, description in CATALOG:
		if not frappe.db.exists("Superpower", name):
			frappe.get_doc({
				"doctype": "Superpower",
				"superpower_name": name,
				"kind": "Voted",
				"category": category,
				"icon": icon,
				"color": color,
				"description": description,
				"enabled": 1,
			}).insert(ignore_permissions=True)
	frappe.db.commit()
