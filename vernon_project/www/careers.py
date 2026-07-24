import re
from html import unescape

import frappe
from vernon_project.www._i18n import base_context, norm_lang, pick

ROUTE = "/careers"


def _blurb(html, limit=180):
    """Plain-text snippet from a Text Editor HTML description."""
    text = unescape(re.sub(r"<[^>]+>", " ", html or ""))
    text = " ".join(text.split())
    return (text[:limit].rstrip() + "…") if len(text) > limit else text

# Placeholder open roles — EDIT THESE (title/location/blurb/employmentType) as real
# openings appear. Each role also emits a JobPosting JSON-LD below, keyed by "slug".
ROLES = [
    {
        "slug": "frontend-engineer",
        "title": {"id": "Frontend Engineer", "en": "Frontend Engineer"},
        "loc": {"id": "Remote / Indonesia", "en": "Remote / Indonesia"},
        "type": {"id": "Penuh waktu", "en": "Full-time"},
        "blurb": {
            "id": "Bangun antarmuka yang terasa hangat dan bisa dipakai semua orang — cepat, mudah diakses, dan penuh perhatian pada detail.",
            "en": "Build interfaces that feel warm and work for everyone — fast, accessible, and careful about the small things.",
        },
    },
    {
        "slug": "product-designer",
        "title": {"id": "Product Designer", "en": "Product Designer"},
        "loc": {"id": "Remote / Indonesia", "en": "Remote / Indonesia"},
        "type": {"id": "Penuh waktu", "en": "Full-time"},
        "blurb": {
            "id": "Mulai dari satu orang sungguhan dan satu hari yang berat, lalu rancang jalan keluar yang jujur dan menyenangkan.",
            "en": "Start from one real person and one hard day, then design an honest, delightful way through it.",
        },
    },
    {
        "slug": "customer-happiness-lead",
        "title": {"id": "Customer Happiness Lead", "en": "Customer Happiness Lead"},
        "loc": {"id": "Remote / Indonesia", "en": "Remote / Indonesia"},
        "type": {"id": "Penuh waktu", "en": "Full-time"},
        "blurb": {
            "id": "Jadi suara pelanggan di dalam tim — dengarkan dengan empati, selesaikan dengan tuntas, dan buat harinya lebih ringan.",
            "en": "Be the customer's voice inside the team — listen with empathy, resolve things fully, and make their day lighter.",
        },
    },
]


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="careers", lang=lang, path=ROUTE)

    context.page_title = pick(
        {
            "id": "Karier di VernonCorp — bekerja untuk membuat orang bahagia",
            "en": "Careers at VernonCorp — work that makes people happy",
        },
        lang,
    )
    context.meta_description = pick(
        {
            "id": "Bergabung dengan VernonCorp: perusahaan layanan bisnis Indonesia yang berpihak pada manusia. Lihat lowongan, budaya berbasis empati, dan alasan orang betah di sini.",
            "en": "Join VernonCorp: a people-first Indonesian business services company. See open roles, an empathy-led culture, and why people stay.",
        },
        lang,
    )
    context.page_canonical = "https://project-www.vernon.id" + ROUTE + ("?lang=en" if lang == "en" else "")
    context.og_title = context.page_title
    context.og_description = context.meta_description
    context.og_type = "website"

    p = lambda d: pick(d, lang)
    apply_url = "/contact" + ("?lang=en" if lang == "en" else "")

    # ---- JSON-LD: breadcrumb + one JobPosting per role ------------------------
    jsonld = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "VernonCorp", "item": "https://project-www.vernon.id"},
                {"@type": "ListItem", "position": 2, "name": p({"id": "Karier", "en": "Careers"}), "item": context.page_canonical},
            ],
        }
    ]
    for r in ROLES:
        jsonld.append(
            {
                "@context": "https://schema.org",
                "@type": "JobPosting",
                "title": p(r["title"]),
                "description": p(r["blurb"]),
                "employmentType": "FULL_TIME",
                "datePosted": "2026-07-21",
                "validThrough": "2026-12-31",
                "directApply": True,
                "hiringOrganization": {
                    "@type": "Organization",
                    "name": "VernonCorp",
                    "sameAs": "https://project-www.vernon.id",
                    "logo": "https://project-www.vernon.id/assets/vernon_project/frontend/favicon.svg",
                },
                "jobLocation": {
                    "@type": "Place",
                    "address": {"@type": "PostalAddress", "addressCountry": "ID", "addressRegion": p({"id": "Indonesia", "en": "Indonesia"})},
                },
                "applicantLocationRequirements": {"@type": "Country", "name": "Indonesia"},
                "jobLocationType": "TELECOMMUTE",
            }
        )
    context.page_jsonld = jsonld

    # ---- content --------------------------------------------------------------
    context.eyebrow = p({"id": "Bergabung dengan kami", "en": "Join us"})
    context.h1_a = p({"id": "Berkarier di", "en": "Careers at"})
    context.h1_b = "VernonCorp"
    context.hero_lead = p(
        {
            "id": "Di sini, membuat orang bahagia bukan bonus dari pekerjaan — itu pekerjaannya. Kami mencari orang yang serius soal kualitas justru karena mereka peduli pada manusia di ujung layar.",
            "en": "Here, making people happy isn't a perk of the job — it is the job. We're looking for people who are serious about quality precisely because they care about the human on the other side of the screen.",
        }
    )
    context.hero_mission = p(
        {
            "id": "Bekerja untuk membuat orang bahagia",
            "en": "Work that makes people happy",
        }
    )

    context.stats = [
        {"n": 7, "suffix": "", "label": p({"id": "pemangku kepentingan yang kami jaga", "en": "stakeholders we care for"})},
        {"n": 100, "suffix": "%", "label": p({"id": "remote-friendly, berbasis di Indonesia", "en": "remote-friendly, based in Indonesia"})},
        {"n": 3, "suffix": "", "label": p({"id": "nilai yang memandu setiap keputusan", "en": "values guiding every decision"})},
    ]

    context.why_title = p({"id": "Kenapa betah di sini", "en": "Why people stay"})
    context.why_lead = p(
        {
            "id": "Bukan meja pingpong atau kopi gratis. Ini hal-hal yang benar-benar terasa saat kamu bekerja bersama kami.",
            "en": "Not ping-pong tables or free coffee. These are the things you actually feel working here.",
        }
    )
    context.why = [
        {
            "t": p({"id": "Empati sebagai keahlian", "en": "Empathy as a craft"}),
            "d": p(
                {
                    "id": "Kami mulai dari perasaan orang yang akan memakai. Aksesibilitas, mode kurangi-gerak, dan kontras warna bukan daftar ceklis — itu cara kami menyayangi setiap pengunjung.",
                    "en": "We start from the feelings of the person who will use it. Accessibility, reduced-motion, and colour contrast aren't a checklist — they're how we care for every visitor.",
                }
            ),
        },
        {
            "t": p({"id": "Lakukan yang benar", "en": "Do what is right"}),
            "d": p(
                {
                    "id": "Kadang benar berarti mengatakan tidak, mengakui kesalahan lebih dulu, atau memilih jalan lebih lambat karena jujur. Kami mendukungmu saat kamu memilih benar.",
                    "en": "Sometimes right means saying no, owning a mistake first, or choosing the slower path because it's honest. We back you when you choose right.",
                }
            ),
        },
        {
            "t": p({"id": "Ruang untuk tumbuh", "en": "Room to grow"}),
            "d": p(
                {
                    "id": "Pekerjaan yang bermakna, umpan balik yang tulus, dan rasa aman untuk bicara jujur. Kemajuanmu layak dilihat dan diakui — bukan diawasi.",
                    "en": "Meaningful work, sincere feedback, and safety to speak honestly. Your progress deserves to be seen and acknowledged — not surveilled.",
                }
            ),
        },
        {
            "t": p({"id": "Dijaga sebagai manusia", "en": "Cared for as a person"}),
            "d": p(
                {
                    "id": "Remote-friendly, jam kerja yang manusiawi, dan tim yang hadir saat keadaan sulit. Kami mengurus orang karena orang mengurus hidupnya lewat kami.",
                    "en": "Remote-friendly, humane hours, and a team that shows up when things get hard. We look after people because people run their lives through us.",
                }
            ),
        },
    ]

    context.practice_kicker = p({"id": "Nilai dalam praktik", "en": "Values in practice"})
    context.practice_title = p(
        {"id": "Kami merekrut nilai, lalu melatih keahlian", "en": "We hire for values, then train the skill"}
    )
    context.practice_lead = p(
        {
            "id": "Kamu tak perlu sempurna di hari pertama. Yang kami cari: kepedulian yang tulus, ketelitian yang jujur, dan keinginan untuk membuat hidup orang lain sedikit lebih ringan. Sisanya kita pelajari bersama.",
            "en": "You don't need to be perfect on day one. What we look for: genuine care, honest rigour, and a wish to make someone's life a little lighter. The rest we learn together.",
        }
    )

    context.roles_title = p({"id": "Lowongan terbuka", "en": "Open roles"})
    context.roles_lead = p(
        {
            "id": "Tidak menemukan yang pas? Tetap sapa kami — orang baik selalu ada tempat.",
            "en": "Don't see the right fit? Reach out anyway — there's always room for good people.",
        }
    )
    # Real Open Job Openings drive the list; fall back to placeholder ROLES when
    # none are posted yet (page never looks empty). Each real role links to the
    # /apply form; placeholders keep linking to /contact.
    lang_qs = "?lang=en" if lang == "en" else ""
    db_openings = frappe.get_all(
        "Job Opening",
        filters={"status": "Open"},
        fields=["slug", "title", "location", "employment_type", "description"],
        order_by="posted_on desc, creation desc",
    )
    if db_openings:
        context.roles = [
            {
                "title": o.title,
                "loc": o.location or "Indonesia",
                "type": o.employment_type or "Full-time",
                "blurb": _blurb(o.description),
                "apply": "/apply?job=" + o.slug + lang_qs,
            }
            for o in db_openings
        ]
    else:
        context.roles = [
            {
                "title": p(r["title"]),
                "loc": p(r["loc"]),
                "type": p(r["type"]),
                "blurb": p(r["blurb"]),
                "apply": apply_url,
            }
            for r in ROLES
        ]
    context.apply_label = p({"id": "Lamar", "en": "Apply"})

    context.cta_title = p({"id": "Siap membuat orang bahagia bersama kami?", "en": "Ready to make people happy with us?"})
    context.cta_lead = p(
        {
            "id": "Kirim ceritamu. Kami membaca setiap pesan dengan sungguh-sungguh.",
            "en": "Send us your story. We read every message with care.",
        }
    )
    context.cta_primary = {"label": p({"id": "Lamar sekarang", "en": "Apply now"}), "url": apply_url}
    context.cta_secondary = {"label": p({"id": "Kenali kami", "en": "Get to know us"}), "url": "/about" + ("?lang=en" if lang == "en" else "")}
