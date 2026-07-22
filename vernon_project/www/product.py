import frappe
from vernon_project.www._i18n import base_context, norm_lang, pick

ROUTE = "/product"


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="product", lang=lang, path=ROUTE)

    context.page_title = pick(
        {
            "id": "Vernon — perangkat lunak yang membuat tim bahagia | VernonCorp",
            "en": "Vernon — software that makes teams happy | VernonCorp",
        },
        lang,
    )
    context.meta_description = pick(
        {
            "id": "Vernon adalah aplikasi buatan VernonCorp: manajemen proyek, gamifikasi, focus timer, absensi, learning, dan empati dalam satu tempat. Di web dan mobile.",
            "en": "Vernon is the app VernonCorp makes: project management, gamification, focus timers, attendance, learning, and empathy in one place. On web and mobile.",
        },
        lang,
    )
    context.page_canonical = "https://project-www.vernon.id" + ROUTE + ("?lang=en" if lang == "en" else "")
    context.og_title = context.page_title
    context.og_description = context.meta_description
    context.og_type = "website"

    p = lambda d: pick(d, lang)

    # ---- FAQ (shared between visible section + FAQPage JSON-LD) ---------------
    faqs = [
        {
            "q": p({"id": "Apa itu Vernon?", "en": "What is Vernon?"}),
            "a": p(
                {
                    "id": "Vernon adalah aplikasi kerja tim buatan VernonCorp. Ia menyatukan proyek dan todo, gamifikasi, focus timer, absensi, learning, dan apresiasi antar rekan dalam satu tempat — dirancang supaya bekerja terasa lebih ringan, adil, dan manusiawi.",
                    "en": "Vernon is the teamwork app VernonCorp makes. It brings projects and todos, gamification, focus timers, attendance, learning, and peer appreciation into one place — designed to make work feel lighter, fairer, and more human.",
                }
            ),
        },
        {
            "q": p({"id": "Platform apa saja yang didukung?", "en": "What platforms are supported?"}),
            "a": p(
                {
                    "id": "Dua-duanya. Vernon berjalan di web di /w dan sebagai aplikasi mobile (PWA) di /m — data dan progres kamu sama di mana pun kamu membukanya.",
                    "en": "Both. Vernon runs on the web at /w and as a mobile app (PWA) at /m — your data and progress stay the same wherever you open it.",
                }
            ),
        },
        {
            "q": p({"id": "Apakah ada gamifikasi?", "en": "Is there gamification?"}),
            "a": p(
                {
                    "id": "Ya. Setiap pekerjaan yang selesai mengumpulkan poin, membuka badge dengan tingkatan Vernonian, dan naik di leaderboard. Tujuannya mengangkat orang dan merayakan kemajuan — bukan mengawasi.",
                    "en": "Yes. Every finished task earns points, unlocks badges on the Vernonian tier ladder, and climbs the leaderboard. It's meant to lift people up and celebrate progress — not to surveil them.",
                }
            ),
        },
    ]
    context.faqs = faqs

    context.page_jsonld = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "VernonCorp", "item": "https://project-www.vernon.id"},
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": pick({"id": "Produk", "en": "Product"}, lang),
                    "item": context.page_canonical,
                },
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Vernon",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web, Android, iOS",
            "url": context.page_canonical,
            "inLanguage": lang,
            "description": context.meta_description,
            "publisher": {"@id": "https://project-www.vernon.id/#organization"},
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": f["q"],
                    "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
                }
                for f in faqs
            ],
        },
    ]

    # ---- content -------------------------------------------------------------
    context.eyebrow = p({"id": "Produk kami", "en": "Our product"})
    context.hero_lead = p(
        {
            "id": "Perangkat lunak yang membuat tim bahagia. Vernon menyatukan pekerjaan tim — proyek, poin, fokus, dan apresiasi — dalam satu tempat yang terasa manusiawi.",
            "en": "Software that makes teams happy. Vernon brings your team's work — projects, points, focus, and appreciation — into one place that feels human.",
        }
    )
    context.hero_tagline = p(
        {
            "id": "Perangkat lunak yang membuat tim bahagia",
            "en": "Software that makes teams happy",
        }
    )
    context.cta_web = {"label": p({"id": "Buka di web", "en": "Open on web"}), "url": "/w"}
    context.cta_mobile = {"label": p({"id": "Aplikasi mobile", "en": "Mobile app"}), "url": "/m"}

    context.features_title = p({"id": "Semua yang tim butuhkan, dalam satu tempat", "en": "Everything a team needs, in one place"})
    context.features_lead = p(
        {
            "id": "Setiap fitur dimulai dari satu orang sungguhan dan satu hari yang berat. Ini yang kamu dapatkan.",
            "en": "Every feature starts from one real person and one hard day. Here's what you get.",
        }
    )
    # icon = lucide-style svg key rendered in template
    context.features = [
        {
            "icon": "kanban",
            "t": p({"id": "Manajemen proyek & todo", "en": "Projects & todos"}),
            "d": p(
                {
                    "id": "Alur yang jelas: Planned → Done → Dicek pemimpin → Completed. Setiap orang tahu apa yang penting hari ini.",
                    "en": "A clear flow: Planned → Done → Checked by your lead → Completed. Everyone knows what matters today.",
                }
            ),
        },
        {
            "icon": "trophy",
            "t": p({"id": "Gamifikasi", "en": "Gamification"}),
            "d": p(
                {
                    "id": "Poin untuk pekerjaan selesai, badge tingkatan Vernonian, dan leaderboard yang mengangkat — bukan mengawasi.",
                    "en": "Points for finished work, Vernonian tier badges, and a leaderboard that lifts people up — not one that watches them.",
                }
            ),
        },
        {
            "icon": "timer",
            "t": p({"id": "Focus timer", "en": "Focus timers"}),
            "d": p(
                {
                    "id": "Jalankan beberapa timer sekaligus untuk tugas yang berbeda. Fokus jadi terlihat, bukan sekadar niat.",
                    "en": "Run several timers at once across different tasks. Focus becomes visible, not just a good intention.",
                }
            ),
        },
        {
            "icon": "qr",
            "t": p({"id": "Absensi & QR", "en": "Attendance & QR"}),
            "d": p(
                {
                    "id": "Absen cukup dengan memindai QR yang berganti otomatis. Jujur, cepat, dan tanpa drama.",
                    "en": "Check in by scanning a rotating QR code. Honest, fast, and drama-free.",
                }
            ),
        },
        {
            "icon": "book",
            "t": p({"id": "Learning / LMS", "en": "Learning / LMS"}),
            "d": p(
                {
                    "id": "Kursus dan pelajaran, penugasan, dan poin saat selesai. Belajar jadi bagian dari ritme kerja.",
                    "en": "Courses and lessons, assignments, and points on completion. Learning becomes part of the rhythm of work.",
                }
            ),
        },
        {
            "icon": "heart",
            "t": p({"id": "Empati & apresiasi", "en": "Empathy & recognition"}),
            "d": p(
                {
                    "id": "Kirim apresiasi tulus antar rekan. Kebaikan yang terlihat membuat tim lebih hangat dan lebih kuat.",
                    "en": "Send sincere appreciation between teammates. Kindness made visible makes teams warmer and stronger.",
                }
            ),
        },
    ]

    context.happy_kicker = p({"id": "Kenapa ini membuat tim bahagia", "en": "Why it makes teams happy"})
    context.happy_title = p(
        {
            "id": "Fitur hanyalah cara. Tujuannya orang.",
            "en": "Features are just the means. People are the point.",
        }
    )
    context.happy_paras = [
        p(
            {
                "id": "Kami tidak membangun Vernon untuk menambah dashboard di hidupmu. Kami membangunnya supaya pekerjaan terasa lebih adil: yang kamu selesaikan terlihat, yang kamu pelajari dihargai, dan yang kamu lakukan untuk rekan tidak lewat begitu saja.",
                "en": "We didn't build Vernon to add another dashboard to your life. We built it so work feels fairer: what you finish is seen, what you learn is valued, and what you do for a teammate doesn't go unnoticed.",
            }
        ),
        p(
            {
                "id": "Poin, badge, dan apresiasi bukan gimmick — mereka cara kecil untuk berkata “kerjamu penting”. Dan saat orang merasa dilihat, mereka datang bekerja dengan sedikit lebih ringan. Itulah seluruh idenya.",
                "en": "Points, badges, and appreciation aren't gimmicks — they're small ways of saying “your work matters.” And when people feel seen, they show up a little lighter. That's the whole idea.",
            }
        ),
    ]
    context.happy_points = [
        p({"id": "Progres yang terlihat, bukan tersembunyi", "en": "Progress made visible, never hidden"}),
        p({"id": "Aturan yang jujur, ditampilkan terbuka", "en": "Honest rules, shown out in the open"}),
        p({"id": "Kebaikan antar rekan yang dirayakan", "en": "Kindness between people, celebrated"}),
    ]

    context.platforms_title = p({"id": "Di web dan di saku", "en": "On the web and in your pocket"})
    context.platforms_lead = p(
        {
            "id": "Satu Vernon, dua cara membukanya. Data dan progres kamu selalu sama.",
            "en": "One Vernon, two ways in. Your data and progress stay in sync.",
        }
    )
    context.platforms = [
        {
            "kind": "web",
            "name": p({"id": "Aplikasi Web", "en": "Web app"}),
            "d": p(
                {
                    "id": "Ruang kerja lengkap di browser — command center, proyek, dan laporan dalam kanvas yang lapang.",
                    "en": "The full workspace in your browser — command center, projects, and reports on a spacious canvas.",
                }
            ),
            "cta": {"label": p({"id": "Buka di web", "en": "Open on web"}), "url": "/w"},
        },
        {
            "kind": "mobile",
            "name": p({"id": "Aplikasi Mobile (PWA)", "en": "Mobile app (PWA)"}),
            "d": p(
                {
                    "id": "Pasang di layar utama ponsel. Cek todo, jalankan fokus, dan absen di mana saja.",
                    "en": "Install it to your phone's home screen. Check todos, run focus, and clock in anywhere.",
                }
            ),
            "cta": {"label": p({"id": "Aplikasi mobile", "en": "Mobile app"}), "url": "/m"},
        },
    ]

    context.shots_title = p({"id": "Sekilas di dalamnya", "en": "A look inside"})
    context.shots_lead = p(
        {
            "id": "Hangat, rapi, dan tidak berisik — dirancang supaya kamu betah, bukan lelah.",
            "en": "Warm, tidy, and quiet — designed to keep you comfortable, not exhausted.",
        }
    )
    context.shots = [
        p({"id": "Beranda command center", "en": "Command center home"}),
        p({"id": "Papan proyek & todo", "en": "Projects & todo board"}),
        p({"id": "Leaderboard & badge", "en": "Leaderboard & badges"}),
    ]

    context.faq_title = p({"id": "Pertanyaan yang sering muncul", "en": "Questions people ask"})

    context.cta_title = p({"id": "Coba Vernon hari ini", "en": "Try Vernon today"})
    context.cta_lead = p(
        {
            "id": "Buka di web atau pasang di ponsel. Rasakan sendiri kerja yang terasa lebih manusiawi.",
            "en": "Open it on the web or install it on your phone. Feel work that's a little more human.",
        }
    )
