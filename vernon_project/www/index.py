import frappe
from vernon_project.www._i18n import base_context, norm_lang, pick

SITE = "https://project-www.vernon.id"

# The 7 stakeholders — the signature orbit. Each: label + how we make them happy.
STAKEHOLDERS = [
    {"id": {"id": "Tuhan", "en": "God"},
     "how": {"id": "Kami bekerja dengan integritas, seolah setiap pekerjaan adalah ibadah.",
             "en": "We work with integrity, as if every task were an act of worship."}},
    {"id": {"id": "Pelanggan", "en": "Customers"},
     "how": {"id": "Kami dengarkan dulu, baru bangun — produk yang benar-benar meringankan.",
             "en": "We listen first, then build — products that genuinely lighten the load."}},
    {"id": {"id": "Tim", "en": "Teams"},
     "how": {"id": "Ruang kerja yang aman, tumbuh, dan dihargai setiap harinya.",
             "en": "A workplace that feels safe, growing, and appreciated every day."}},
    {"id": {"id": "Pemegang Saham", "en": "Shareholders"},
     "how": {"id": "Pertumbuhan yang sehat dan jujur, dibangun untuk jangka panjang.",
             "en": "Honest, healthy growth — built to last, not to impress."}},
    {"id": {"id": "Mitra", "en": "Partners"},
     "how": {"id": "Kolaborasi yang adil di mana kedua pihak sama-sama menang.",
             "en": "Fair collaboration where both sides genuinely win."}},
    {"id": {"id": "Pemasok", "en": "Suppliers"},
     "how": {"id": "Hubungan yang saling menghormati, tepat waktu, dan tepat janji.",
             "en": "Relationships that are respectful, on time, and true to our word."}},
    {"id": {"id": "Masyarakat", "en": "Society"},
     "how": {"id": "Karya yang meninggalkan Indonesia sedikit lebih baik dari saat kami menemukannya.",
             "en": "Work that leaves Indonesia a little better than we found it."}},
]

VALUES = [
    {"icon": "heart",
     "name": {"id": "Empati", "en": "Empathy"},
     "line": {"id": "Kami memulai dari perasaan orang lain, bukan dari fitur.",
              "en": "We start from how people feel, not from a feature list."}},
    {"icon": "compass",
     "name": {"id": "Melakukan yang benar, bukan yang enak",
              "en": "Doing what is right, not what is nice"},
     "line": {"id": "Kami pilih keputusan yang jujur meski tidak nyaman.",
              "en": "We choose the honest call even when it is uncomfortable."}},
    {"icon": "sun",
     "name": {"id": "Membahagiakan orang", "en": "Making people happy"},
     "line": {"id": "Ukuran keberhasilan kami adalah senyum yang kami tinggalkan.",
              "en": "Our measure of success is the smiles we leave behind."}},
]

# The businesses VernonCorp runs — more than technology. Edit here to add/rename a sector.
BUSINESSES = [
    {"icon": "hotel", "name": {"id": "Hotel", "en": "Hotels"},
     "line": {"id": "Penginapan yang membuat setiap tamu merasa benar-benar diterima.",
              "en": "Stays where every guest feels genuinely welcomed."}},
    {"icon": "fnb", "name": {"id": "Makanan & Minuman", "en": "Food & Beverage"},
     "line": {"id": "Tempat makan dan minum yang menghangatkan hari orang.",
              "en": "Places to eat and drink that warm people's day."}},
    {"icon": "education", "name": {"id": "Pendidikan", "en": "Education"},
     "line": {"id": "Ruang belajar yang menumbuhkan manusia, bukan sekadar nilai.",
              "en": "Learning that grows people, not just grades."}},
    {"icon": "business", "name": {"id": "Layanan Bisnis", "en": "Business Services"},
     "line": {"id": "Dukungan yang membuat roda bisnis lain berputar lebih ringan.",
              "en": "Support that helps other businesses run lighter."}},
    {"icon": "retail", "name": {"id": "Ritel", "en": "Retail"},
     "line": {"id": "Berbelanja yang terasa jujur, ramah, dan menyenangkan.",
              "en": "Shopping that feels honest, friendly, and delightful."}},
    {"icon": "technology", "name": {"id": "Teknologi", "en": "Technology"},
     "line": {"id": "Perangkat lunak yang berpihak pada manusia — termasuk aplikasi Vernon.",
              "en": "People-first software — including the Vernon app."},
     "url": "/product"},
    {"icon": "spa", "name": {"id": "Spa", "en": "Spa"},
     "line": {"id": "Perawatan yang memberi orang jeda sejenak untuk bernapas.",
              "en": "Care that gives people a moment to breathe."}},
    {"icon": "community", "name": {"id": "Layanan Masyarakat", "en": "Community Service"},
     "line": {"id": "Kontribusi nyata untuk masyarakat di sekitar kami.",
              "en": "Real contribution to the communities around us."}},
]

FEATURES = [
    {"id": "Manajemen proyek & tugas", "en": "Project & task management"},
    {"id": "Gamifikasi poin & lencana", "en": "Points & badge gamification"},
    {"id": "Fokus, kehadiran, & apresiasi tim", "en": "Focus, attendance & team appreciation"},
]

# Stats section removed — no live figures yet. To restore, re-add a STATS list of
# {"n": <real int>, "suffix": ..., "label": {...}} and the section in index.html.
# Do not ship invented metrics as fact.

FAQ = [
    {"q": {"id": "Apa itu VernonCorp?", "en": "What is VernonCorp?"},
     "a": {"id": "VernonCorp adalah perusahaan layanan bisnis asal Indonesia yang berbisnis untuk membuat orang bahagia. Kami membangun beragam produk dan layanan yang berpihak pada manusia — teknologi hanyalah salah satunya — dan memperlakukan setiap pemangku kepentingan, dari pelanggan hingga masyarakat, dengan empati.",
           "en": "VernonCorp is an Indonesian business services company in the business of making people happy. We build a range of people-first products and services — technology is just one of them — and treat every stakeholder, from customers to society, with empathy."}},
    {"q": {"id": "Apa itu aplikasi Vernon?", "en": "What is the Vernon app?"},
     "a": {"id": "Vernon adalah aplikasi manajemen proyek dan tim dengan gamifikasi: tugas, fokus, poin, dan lencana yang membuat kerja terasa lebih ringan dan lebih menyenangkan bagi seluruh tim.",
           "en": "Vernon is a project and team management app with gamification: tasks, focus, points, and badges that make work feel lighter and more joyful for the whole team."}},
    {"q": {"id": "Untuk siapa Vernon?", "en": "Who is Vernon for?"},
     "a": {"id": "Vernon dibuat untuk tim dan organisasi di Indonesia yang ingin mengelola pekerjaan sekaligus merawat semangat orang-orangnya — dari tim kecil hingga perusahaan yang sedang tumbuh.",
           "en": "Vernon is built for teams and organizations in Indonesia that want to manage work while caring for their people's morale — from small teams to growing companies."}},
    {"q": {"id": "Di mana VernonCorp berbasis?", "en": "Where is VernonCorp based?"},
     "a": {"id": "VernonCorp berbasis di Indonesia dan melayani pasar Indonesia lewat beragam produk dan layanan, dengan nilai empati dan kejujuran sebagai fondasinya.",
           "en": "VernonCorp is based in Indonesia and serves the Indonesian market through a range of products and services, grounded in empathy and honesty."}},
]


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="index", lang=lang, path="/")

    context.page_title = pick(
        {"id": "VernonCorp — Berbisnis untuk membuat orang bahagia",
         "en": "VernonCorp — In the business of making people happy"}, lang)
    context.meta_description = pick(
        {"id": "VernonCorp — perusahaan layanan bisnis Indonesia yang berbisnis membuat orang bahagia: hotel, kuliner, pendidikan, layanan bisnis, ritel, teknologi, spa, dan layanan masyarakat.",
         "en": "VernonCorp — an Indonesian business services company in the business of making people happy: hotels, F&B, education, business services, retail, technology, spa, and community service."}, lang)
    context.page_canonical = SITE + "/" + ("?lang=en" if lang == "en" else "")
    context.og_title = context.page_title
    context.og_description = context.meta_description
    context.og_type = "website"

    context.page_jsonld = [
        {"@context": "https://schema.org", "@type": "BreadcrumbList",
         "itemListElement": [
             {"@type": "ListItem", "position": 1,
              "name": "VernonCorp", "item": SITE + "/"},
         ]},
        {"@context": "https://schema.org", "@type": "FAQPage",
         "mainEntity": [
             {"@type": "Question", "name": pick(f["q"], lang),
              "acceptedAnswer": {"@type": "Answer", "text": pick(f["a"], lang)}}
             for f in FAQ]},
    ]

    def L(d):
        return pick(d, lang)

    context.hero = {
        "eyebrow": "VernonCorp",
        "positioning": L({"id": "Perusahaan layanan bisnis yang berpihak pada manusia",
                          "en": "A people-first business services company"}),
        "h1": L({"id": "Kami bergerak di bidang membahagiakan orang",
                 "en": "In the business of making people happy"}),
        "sub": L({"id": "VernonCorp adalah perusahaan layanan bisnis Indonesia — dari hotel, kuliner, pendidikan, ritel, hingga teknologi — yang menjalankan setiap bidang dengan empati.",
                  "en": "VernonCorp is an Indonesian business services company — spanning hotels, food & beverage, education, retail, and technology — running every venture with empathy."}),
        "cta1": L({"id": "Lihat produk kami", "en": "See our product"}),
        "cta2": L({"id": "Ngobrol dengan kami", "en": "Talk with us"}),
        "heart_label": L({"id": "bahagia", "en": "happy"}),
    }

    context.stakeholders = [{"name": L(s["id"]), "how": L(s["how"])} for s in STAKEHOLDERS]
    context.values = [{"icon": v["icon"], "name": L(v["name"]), "line": L(v["line"])} for v in VALUES]
    context.features = [L(f) for f in FEATURES]
    context.businesses = [{"icon": b["icon"], "name": L(b["name"]), "line": L(b["line"]), "url": b.get("url")} for b in BUSINESSES]
    context.faq = [{"q": L(f["q"]), "a": L(f["a"])} for f in FAQ]

    # --- Isometric city game data: one landmark per business sector. -------------
    # color/accent match the brand palette; pos is [x, z] on the SimCity street
    # grid (roads every 12 units; block centres at odd multiples of 6). Each
    # landmark sits on its own corner lot, spread across the grid, all reachable
    # on foot. link -> Technology goes to /product (the Vernon app building),
    # everything else to /about.
    CITY_META = {
        "hotel":      {"color": "#4f46e5", "accent": "#a5b4fc", "pos": [-18, -30]},
        "fnb":        {"color": "#f59e0b", "accent": "#fde68a", "pos": [18, -30]},
        "education":  {"color": "#12b6a0", "accent": "#99f6e4", "pos": [30, -6]},
        "business":   {"color": "#64748b", "accent": "#cbd5e1", "pos": [30, 18]},
        "retail":     {"color": "#fb7185", "accent": "#fecdd3", "pos": [6, 30]},
        "technology": {"color": "#6366f1", "accent": "#c7d2fe", "pos": [-18, 30]},
        "spa":        {"color": "#10b981", "accent": "#a7f3d0", "pos": [-30, 6]},
        "community":  {"color": "#8b5cf6", "accent": "#ddd6fe", "pos": [-30, -18]},
    }
    context.city = [
        {"key": b["icon"], "name": L(b["name"]), "blurb": L(b["line"]),
         "type": b["icon"], "link": b.get("url") or "/about", **CITY_META[b["icon"]]}
        for b in BUSINESSES
    ]

    # ItemList JSON-LD enumerating the 8 businesses (GEO / rich results).
    context.page_jsonld.append({
        "@context": "https://schema.org", "@type": "ItemList",
        "name": L({"id": "Bisnis VernonCorp", "en": "VernonCorp businesses"}),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": c["name"],
             "description": c["blurb"], "url": SITE + c["link"]}
            for i, c in enumerate(context.city)
        ],
    })

    context.section = {
        "biz_eyebrow": L({"id": "Bisnis kami", "en": "Our businesses"}),
        "biz_title": L({"id": "Delapan bidang, satu misi", "en": "Eight sectors, one mission"}),
        "biz_lead": L({"id": "VernonCorp bukan sekadar teknologi. Kami menjalankan beragam bidang usaha — masing-masing dengan satu tujuan yang sama: membuat orang bahagia.",
                       "en": "VernonCorp is more than technology. We run a range of businesses — each with the same single aim: making people happy."}),
        "what_eyebrow": L({"id": "Di balik bisnis kami", "en": "Behind our businesses"}),
        "what_title": L({"id": "Budaya empati, dan produk untuk membuktikannya", "en": "An empathy culture, and a product to prove it"}),
        "company_kicker": L({"id": "Perusahaan", "en": "The company"}),
        "company_title": L({"id": "Budaya yang digerakkan empati",
                            "en": "An empathy-driven culture"}),
        "company_body": L({"id": "Kami memilih melakukan yang benar, bukan yang sekadar enak. Setiap keputusan diukur dari dampaknya pada tujuh pemangku kepentingan kami.",
                           "en": "We choose to do what is right, not merely what is nice. Every decision is weighed by its impact on our seven stakeholders."}),
        "product_kicker": L({"id": "Produk", "en": "The product"}),
        "product_title": L({"id": "Vernon — kerja yang terasa ringan",
                            "en": "Vernon — work that feels light"}),
        "product_body": L({"id": "Manajemen proyek dan tim dengan gamifikasi: poin, lencana, dan fokus yang membuat setiap pencapaian terasa dirayakan.",
                           "en": "Project and team management with gamification: points, badges, and focus that make every win feel celebrated."}),
        "product_link": L({"id": "Jelajahi Vernon", "en": "Explore Vernon"}),
        "values_eyebrow": L({"id": "Nilai kami", "en": "Our values"}),
        "values_title": L({"id": "Tiga hal yang kami pegang", "en": "Three things we hold"}),
        "stake_eyebrow": L({"id": "Lingkaran orang yang kami bahagiakan",
                            "en": "The circle of people we make happy"}),
        "stake_title": L({"id": "Tujuh pemangku kepentingan, satu niat",
                          "en": "Seven stakeholders, one intention"}),
        "prod_band_eyebrow": L({"id": "Sorotan produk", "en": "Product highlight"}),
        "prod_band_title": L({"id": "Kenalkan tim Anda pada Vernon",
                              "en": "Meet Vernon with your team"}),
        "prod_band_body": L({"id": "Semua yang tim butuhkan untuk mengelola pekerjaan — dibungkus dengan kehangatan.",
                             "en": "Everything a team needs to run its work — wrapped in warmth."}),
        "prod_band_cta": L({"id": "Lihat produk", "en": "See the product"}),
        "prod_band_open": L({"id": "Buka aplikasi", "en": "Open app"}),
        "faq_eyebrow": L({"id": "Pertanyaan umum", "en": "Common questions"}),
        "faq_title": L({"id": "Hal yang sering ditanyakan", "en": "Things people often ask"}),
        "final_title": L({"id": "Mari buat sesuatu yang membahagiakan",
                          "en": "Let's build something that makes people happy"}),
        "final_body": L({"id": "Punya proyek, pertanyaan, atau ingin bergabung? Pintu kami terbuka.",
                         "en": "Have a project, a question, or want to join us? Our door is open."}),
        "final_contact": L({"id": "Hubungi kami", "en": "Contact us"}),
        "final_careers": L({"id": "Lihat karier", "en": "See careers"}),
    }
    context.q = "?lang=en" if lang == "en" else ""
    return context
