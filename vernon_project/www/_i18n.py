# Shared bilingual chrome + page context for the VernonCorp marketing site.
# Every page controller calls base_context(...) so the 5 pages share one nav,
# footer, hreflang, language toggle and Organization JSON-LD.

LANGS = ("id", "en")
DEFAULT_LANG = "id"

SITE_URL = "https://project-www.vernon.id"
LOGO_URL = SITE_URL + "/assets/vernon_project/frontend/favicon.svg"
MISSION = "In the business of making people happy"


def norm_lang(x):
    return x if x in LANGS else DEFAULT_LANG


def pick(d, lang):
    # d is either a {"id":.., "en":..} dict or an already-resolved value.
    return (d.get(lang) or d.get("id")) if isinstance(d, dict) else d


# --- bilingual chrome strings -------------------------------------------------
CHROME = {
    "brand_name": "VernonCorp",
    "tagline": {
        "id": "Berbisnis untuk membuat orang bahagia.",
        "en": "In the business of making people happy.",
    },
    "nav_links": [
        {"title": {"id": "Tentang", "en": "About"}, "url": "/about"},
        {"title": {"id": "Produk", "en": "Product"}, "url": "/product"},
        {"title": {"id": "Karier", "en": "Careers"}, "url": "/careers"},
        {"title": {"id": "Kontak", "en": "Contact"}, "url": "/contact"},
    ],
    "cta": {"label": {"id": "Hubungi Kami", "en": "Contact us"}, "url": "/contact"},
    "secondary": {"label": {"id": "Buka Aplikasi", "en": "Open app"}, "url": "/w"},
    "footer_tagline": {
        "id": "Layanan bisnis yang berpihak pada manusia — dibuat dengan empati di Indonesia.",
        "en": "People-first business services — built with empathy in Indonesia.",
    },
    "footer_columns": [
        {
            "title": {"id": "Perusahaan", "en": "Company"},
            "links": [
                {"title": {"id": "Tentang", "en": "About"}, "url": "/about"},
                {"title": {"id": "Karier", "en": "Careers"}, "url": "/careers"},
                {"title": {"id": "Kontak", "en": "Contact"}, "url": "/contact"},
            ],
        },
        {
            "title": {"id": "Produk", "en": "Product"},
            "links": [
                {"title": {"id": "Vernon", "en": "Vernon"}, "url": "/product"},
                {"title": {"id": "Aplikasi Web", "en": "Web app"}, "url": "/w"},
                {"title": {"id": "Aplikasi Mobile", "en": "Mobile app"}, "url": "/m"},
            ],
        },
    ],
    "legal": [
        {"title": {"id": "Privasi", "en": "Privacy"}, "url": "/about"},
        {"title": {"id": "Ketentuan", "en": "Terms"}, "url": "/about"},
    ],
    "copyright": "(c) 2026 VernonCorp",
}


def _links(items, lang):
    return [{"title": pick(i["title"], lang), "url": i["url"]} for i in items]


def base_context(context, page, lang, path):
    context.lang = lang
    context.no_cache = 1
    context.site_url = SITE_URL
    context.current_path = path

    context.nav = {
        "brand_name": CHROME["brand_name"],
        "tagline": pick(CHROME["tagline"], lang),
        "links": _links(CHROME["nav_links"], lang),
        "cta": {"label": pick(CHROME["cta"]["label"], lang), "url": CHROME["cta"]["url"]},
        "secondary": {
            "label": pick(CHROME["secondary"]["label"], lang),
            "url": CHROME["secondary"]["url"],
        },
    }

    context.footer = {
        "tagline": pick(CHROME["footer_tagline"], lang),
        "columns": [
            {"title": pick(c["title"], lang), "links": _links(c["links"], lang)}
            for c in CHROME["footer_columns"]
        ],
        "legal": _links(CHROME["legal"], lang),
        "copyright": CHROME["copyright"],
    }

    # hreflang: id is canonical (no query), en carries ?lang=en, x-default -> id.
    context.hreflang = [
        {"lang": "id", "href": SITE_URL + path},
        {"lang": "en", "href": SITE_URL + path + "?lang=en"},
        {"lang": "x-default", "href": SITE_URL + path},
    ]

    # language toggle points at the OTHER language.
    context.lang_toggle = {
        "label": "EN" if lang == "id" else "ID",
        "url": path + ("?lang=en" if lang == "id" else ""),
    }

    context.org_jsonld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": SITE_URL + "/#organization",
                "name": "VernonCorp",
                "slogan": MISSION,
                "description": "An Indonesian business services company in the business of making people happy — technology is one of the things it does, not its whole identity.",
                "url": SITE_URL,
                "logo": LOGO_URL,
                "sameAs": ["https://vernon.id"],
                "knowsAbout": ["Hotels", "Food & Beverage", "Education", "Business Services",
                               "Retail", "Technology", "Spa & Wellness", "Community Service"],
                "foundingLocation": {"@type": "Place", "name": "Indonesia"},
            },
            {
                "@type": "WebSite",
                "@id": SITE_URL + "/#website",
                "url": SITE_URL,
                "name": "VernonCorp",
                "inLanguage": lang,
                "publisher": {"@id": SITE_URL + "/#organization"},
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": SITE_URL + "/?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    }
    return context
