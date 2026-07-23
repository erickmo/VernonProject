import frappe
from vernon_project.api import recruitment_instruments as ri
from vernon_project.www._i18n import base_context, norm_lang, pick

ROUTE = "/apply"


def get_context(context):
    lang = norm_lang(frappe.form_dict.get("lang"))
    base_context(context, page="careers", lang=lang, path=ROUTE)
    p = lambda d: pick(d, lang)

    slug = (frappe.form_dict.get("job") or "").strip()
    job = None
    if slug:
        name = frappe.db.get_value("Job Opening", {"slug": slug, "status": "Open"}, "name")
        if name:
            doc = frappe.get_doc("Job Opening", name)
            job = {
                "slug": doc.slug,
                "title": doc.title,
                "brand": doc.brand,
                "location": doc.location,
                "employment_type": doc.employment_type,
                "description": doc.description,
                "requirements": doc.requirements,
                "questions": [
                    {
                        "idx": i,
                        "question_text": q.question_text,
                        "qtype": q.qtype,
                        "options": [ln.strip() for ln in (q.options or "").splitlines() if ln.strip()],
                    }
                    for i, q in enumerate(doc.questions)
                ],
            }
            job["test_disc"] = int(doc.test_disc or 0)
            job["test_personality"] = int(doc.test_personality or 0)
            job["test_logical"] = int(doc.test_logical or 0)
            job["disc_items"] = ri.public_disc() if doc.test_disc else []
            job["bigfive_items"] = ri.public_bigfive() if doc.test_personality else []
            job["logic_items"] = ri.public_logic() if doc.test_logical else []
    context.job = job

    context.page_title = ((job["title"] + " — VernonCorp") if job
                          else p({"id": "Lowongan tidak ditemukan — VernonCorp", "en": "Job not found — VernonCorp"}))
    context.meta_description = p({"id": "Lamar posisi ini di VernonCorp.", "en": "Apply for this role at VernonCorp."})
    context.page_canonical = "https://project-www.vernon.id/apply" + ("?job=" + slug if slug else "")

    lang_qs = "?lang=en" if lang == "en" else ""
    context.careers_url = "/careers" + lang_qs
    context.lang_value = lang

    context.t = {
        "back": p({"id": "← Semua lowongan", "en": "← All roles"}),
        "notfound_title": p({"id": "Lowongan tidak ditemukan", "en": "Role not found"}),
        "notfound_body": p({"id": "Posisi ini mungkin sudah ditutup. Lihat lowongan lain yang terbuka.",
                            "en": "This role may have closed. Browse the other open roles."}),
        "requirements": p({"id": "Kualifikasi", "en": "Requirements"}),
        "apply_title": p({"id": "Lamar posisi ini", "en": "Apply for this role"}),
        "full_name": p({"id": "Nama lengkap", "en": "Full name"}),
        "phone": p({"id": "Nomor WhatsApp", "en": "WhatsApp number"}),
        "phone_hint": p({"id": "Kami menghubungi lewat WhatsApp.", "en": "We'll reach you on WhatsApp."}),
        "nik": p({"id": "NIK (KTP)", "en": "National ID (KTP)"}),
        "cv": p({"id": "CV / Resume — PDF, DOC, atau DOCX (maks 10 MB)", "en": "CV / Resume — PDF, DOC, or DOCX (max 10 MB)"}),
        "cover": p({"id": "Surat pengantar / catatan (opsional)", "en": "Cover letter / notes (optional)"}),
        "test_title": p({"id": "Tes singkat", "en": "Short test"}),
        "test_lead": p({"id": "Jawab pertanyaan berikut sebagai bagian dari lamaran.",
                        "en": "Answer the questions below as part of your application."}),
        "free_text_ph": p({"id": "Jawaban kamu…", "en": "Your answer…"}),
        "submit": p({"id": "Kirim lamaran", "en": "Submit application"}),
        "sending": p({"id": "Mengirim…", "en": "Sending…"}),
        "thanks_title": p({"id": "Lamaran terkirim 🎉", "en": "Application sent 🎉"}),
        "thanks_body": p({"id": "Terima kasih! Tim HR akan meninjau lamaranmu dan menghubungi lewat WhatsApp bila cocok.",
                          "en": "Thank you! Our HR team will review your application and reach out on WhatsApp if it's a fit."}),
        "err_generic": p({"id": "Maaf, ada kendala. Coba lagi.", "en": "Sorry, something went wrong. Please try again."}),
        "disc_title": p({"id": "Tes DISC", "en": "DISC test"}),
        "disc_lead": p({"id": "Untuk tiap baris, pilih satu kata yang PALING dan satu yang PALING TIDAK menggambarkan kamu.",
                        "en": "For each row, pick the word MOST and the word LEAST like you."}),
        "disc_most": p({"id": "Paling", "en": "Most"}),
        "disc_least": p({"id": "Paling tidak", "en": "Least"}),
        "big_title": p({"id": "Tes Kepribadian", "en": "Personality test"}),
        "big_lead": p({"id": "Seberapa setuju kamu dengan tiap pernyataan?", "en": "How much do you agree?"}),
        "big_1": p({"id": "Sangat tidak setuju", "en": "Strongly disagree"}),
        "big_5": p({"id": "Sangat setuju", "en": "Strongly agree"}),
        "logic_title": p({"id": "Tes Logika & Pemecahan Masalah", "en": "Logical & problem-solving test"}),
        "incomplete": p({"id": "Mohon lengkapi semua tes sebelum mengirim.", "en": "Please complete every test before submitting."}),
    }
