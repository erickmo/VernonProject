import frappe
from vernon_project.www._i18n import base_context, norm_lang, pick

SITE = "https://project-www.vernon.id"

# Placeholder contact details — swap for real ones when available.
EMAIL = "hello@vernon.id"
ADDRESS = {
    "id": "Indonesia (alamat lengkap segera menyusul)",
    "en": "Indonesia (full address coming soon)",
}

# Placeholder social links — comment: replace href with real handles later.
SOCIALS = [
    {"icon": "instagram", "label": "Instagram", "handle": "@vernoncorp", "url": "#"},
    {"icon": "linkedin", "label": "LinkedIn", "handle": "VernonCorp", "url": "#"},
    {"icon": "mail", "label": "Email", "handle": EMAIL, "url": "mailto:" + EMAIL},
]

REASONS = [
    {"icon": "briefcase",
     "t": {"id": "Kerja sama & kemitraan", "en": "Partnerships & collaboration"},
     "d": {"id": "Ingin membangun sesuatu bersama? Ceritakan idenya.",
           "en": "Want to build something together? Tell us the idea."}},
    {"icon": "help",
     "t": {"id": "Pertanyaan produk", "en": "Product questions"},
     "d": {"id": "Penasaran soal Vernon atau butuh bantuan? Kami dengarkan.",
           "en": "Curious about Vernon or need a hand? We're listening."}},
    {"icon": "sparkle",
     "t": {"id": "Sekadar menyapa", "en": "Just saying hello"},
     "d": {"id": "Kabar baik, masukan, atau salam hangat — semua kami baca.",
           "en": "Good news, feedback, or a warm hello — we read them all."}},
]


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="contact", lang=lang, path="/contact")

    def L(d):
        return pick(d, lang)

    context.page_title = L({
        "id": "Hubungi Kami — VernonCorp",
        "en": "Contact us — VernonCorp"})
    context.meta_description = L({
        "id": "Hubungi VernonCorp — perusahaan layanan bisnis Indonesia yang berbisnis membuat orang bahagia. Kirim pesan, ajukan pertanyaan, atau sekadar menyapa. Pintu kami terbuka.",
        "en": "Get in touch with VernonCorp — the Indonesian business services company in the business of making people happy. Send a message, ask a question, or just say hello. Our door is open."})
    context.page_canonical = SITE + "/contact" + ("?lang=en" if lang == "en" else "")
    context.og_title = context.page_title
    context.og_description = context.meta_description
    context.og_type = "website"

    context.page_jsonld = [
        {"@context": "https://schema.org", "@type": "BreadcrumbList",
         "itemListElement": [
             {"@type": "ListItem", "position": 1, "name": "VernonCorp", "item": SITE + "/"},
             {"@type": "ListItem", "position": 2,
              "name": L({"id": "Kontak", "en": "Contact"}), "item": SITE + "/contact"},
         ]},
        {"@context": "https://schema.org", "@type": "ContactPage",
         "name": context.page_title,
         "url": context.page_canonical,
         "inLanguage": lang,
         "isPartOf": {"@id": SITE + "/#website"},
         "about": {"@id": SITE + "/#organization"},
         "mainEntity": {
             "@type": "Organization",
             "@id": SITE + "/#organization",
             "name": "VernonCorp",
             "email": EMAIL,
             "contactPoint": {
                 "@type": "ContactPoint",
                 "email": EMAIL,
                 "contactType": "customer support",
                 "availableLanguage": ["id", "en"],
                 "areaServed": "ID",
             },
         }},
    ]

    context.hero = {
        "eyebrow": L({"id": "Kontak", "en": "Contact"}),
        "kicker": L({"id": "Kami senang mendengar dari Anda",
                     "en": "We'd love to hear from you"}),
        "h1": L({"id": "Hubungi Kami", "en": "Contact us"}),
        "sub": L({"id": "Setiap pesan yang masuk dibaca oleh manusia — bukan bot. Ceritakan apa pun: ide, pertanyaan, masukan, atau sekadar menyapa. Kami akan membalas secepat yang kami bisa, dengan hati.",
                  "en": "Every message here is read by a human — not a bot. Tell us anything: an idea, a question, feedback, or just a hello. We'll reply as soon as we can, with care."}),
        "heart_label": L({"id": "menyimak", "en": "listening"}),
    }

    context.reasons = [
        {"icon": r["icon"], "t": L(r["t"]), "d": L(r["d"])} for r in REASONS
    ]

    context.form = {
        "title": L({"id": "Kirim pesan", "en": "Send a message"}),
        "subtitle": L({"id": "Isi tiga hal ini dan pesan Anda langsung meluncur ke kami.",
                       "en": "Fill in these three things and your message flies straight to us."}),
        "name_label": L({"id": "Nama", "en": "Name"}),
        "name_ph": L({"id": "Siapa nama Anda?", "en": "What's your name?"}),
        "email_label": L({"id": "Email", "en": "Email"}),
        "email_ph": L({"id": "Ke mana kami membalas?", "en": "Where should we reply?"}),
        "message_label": L({"id": "Pesan", "en": "Message"}),
        "message_ph": L({"id": "Ceritakan pada kami...", "en": "Tell us anything..."}),
        "hp_label": L({"id": "Situs perusahaan (kosongkan)", "en": "Company website (leave blank)"}),
        "submit": L({"id": "Kirim pesan", "en": "Send message"}),
        "sending": L({"id": "Mengirim...", "en": "Sending..."}),
        "privacy": L({"id": "Kami hanya memakai detail ini untuk membalas Anda. Tidak ada spam, tidak dijual.",
                      "en": "We only use these details to reply to you. No spam, never sold."}),
        "ok_title": L({"id": "Terima kasih — pesan Anda sampai", "en": "Thank you — your message is in"}),
        "ok_body": L({"id": "Kami sudah menerimanya dan akan membalas ke email Anda secepatnya. Semoga hari Anda menyenangkan.",
                      "en": "We've received it and will reply to your email soon. Have a lovely day."}),
        "ok_again": L({"id": "Kirim pesan lain", "en": "Send another message"}),
        "err_generic": L({"id": "Maaf, pesan gagal terkirim. Coba lagi sebentar lagi ya.",
                          "en": "Sorry, the message didn't go through. Please try again shortly."}),
    }

    context.aside = {
        "title": L({"id": "Cara lain menyapa", "en": "Other ways to reach us"}),
        "email_label": L({"id": "Email langsung", "en": "Email us directly"}),
        "email": EMAIL,
        "address_label": L({"id": "Tempat kami", "en": "Where we are"}),
        "address": L(ADDRESS),
        "social_label": L({"id": "Sosial media", "en": "Social media"}),
        "socials": SOCIALS,
        "placeholder_note": L({"id": "Detail di atas masih sementara dan akan diperbarui.",
                               "en": "The details above are placeholders and will be updated."}),
        "map_label": L({"id": "Dibuat di Indonesia", "en": "Made in Indonesia"}),
    }

    context.q = "?lang=en" if lang == "en" else ""
    context.reasons_eyebrow = L({"id": "Apa pun alasannya", "en": "Whatever brings you here"})
    context.reasons_title = L({"id": "Kami di sini untuk mendengar",
                               "en": "We're here to listen"})
    return context
