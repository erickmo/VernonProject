# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

"""Baked psychometric instrument banks for the recruitment interview test.

Pure module — no frappe import, no site needed. DISC & Big Five are standard
instruments (same items for every job) and must never be HR-editable, so they
live in code. Scoring keys (DISC axis, Big Five trait/reverse, logical answer)
never reach the applicant: `public_*()` strips them before the guest API sends
items to the browser.

Run `python3 vernon_project/api/recruitment_instruments.py` to self-check.
"""

import re

DISC_AXES = ("D", "I", "S", "C")
BIGFIVE_TRAITS = ("O", "C", "E", "A", "N")

# --- DISC: forced-choice. Each item = 4 words, one per axis. Applicant picks
#     the word MOST like them and the word LEAST like them. (Seed — Task 2 fills to ~28.)
DISC_ITEMS = [
    {"id": "d1", "words": [{"text": 'Tegas', "axis": 'D'}, {"text": 'Antusias', "axis": 'I'}, {"text": 'Kooperatif', "axis": 'S'}, {"text": 'Terstruktur', "axis": 'C'}]},
    {"id": "d2", "words": [{"text": 'Ramah', "axis": 'I'}, {"text": 'Suportif', "axis": 'S'}, {"text": 'Analitis', "axis": 'C'}, {"text": 'Proaktif', "axis": 'D'}]},
    {"id": "d3", "words": [{"text": 'Tenang', "axis": 'S'}, {"text": 'Rapi', "axis": 'C'}, {"text": 'Gigih', "axis": 'D'}, {"text": 'Persuasif', "axis": 'I'}]},
    {"id": "d4", "words": [{"text": 'Sistematis', "axis": 'C'}, {"text": 'Vokal', "axis": 'D'}, {"text": 'Ceria', "axis": 'I'}, {"text": 'Sabar', "axis": 'S'}]},
    {"id": "d5", "words": [{"text": 'Kompetitif', "axis": 'D'}, {"text": 'Supel', "axis": 'I'}, {"text": 'Suportif', "axis": 'S'}, {"text": 'Teliti', "axis": 'C'}]},
    {"id": "d6", "words": [{"text": 'Ekspresif', "axis": 'I'}, {"text": 'Setia', "axis": 'S'}, {"text": 'Metodis', "axis": 'C'}, {"text": 'Berani', "axis": 'D'}]},
    {"id": "d7", "words": [{"text": 'Konsisten', "axis": 'S'}, {"text": 'Akurat', "axis": 'C'}, {"text": 'Sigap', "axis": 'D'}, {"text": 'Optimis', "axis": 'I'}]},
    {"id": "d8", "words": [{"text": 'Cermat', "axis": 'C'}, {"text": 'Lugas', "axis": 'D'}, {"text": 'Energik', "axis": 'I'}, {"text": 'Toleran', "axis": 'S'}]},
    {"id": "d9", "words": [{"text": 'Ambisius', "axis": 'D'}, {"text": 'Komunikatif', "axis": 'I'}, {"text": 'Sabar', "axis": 'S'}, {"text": 'Rinci', "axis": 'C'}]},
    {"id": "d10", "words": [{"text": 'Ramah', "axis": 'I'}, {"text": 'Tenang', "axis": 'S'}, {"text": 'Metodis', "axis": 'C'}, {"text": 'Tegas', "axis": 'D'}]},
    {"id": "d11", "words": [{"text": 'Kooperatif', "axis": 'S'}, {"text": 'Sistematis', "axis": 'C'}, {"text": 'Proaktif', "axis": 'D'}, {"text": 'Persuasif', "axis": 'I'}]},
    {"id": "d12", "words": [{"text": 'Akurat', "axis": 'C'}, {"text": 'Gigih', "axis": 'D'}, {"text": 'Ceria', "axis": 'I'}, {"text": 'Suportif', "axis": 'S'}]},
    {"id": "d13", "words": [{"text": 'Berani', "axis": 'D'}, {"text": 'Antusias', "axis": 'I'}, {"text": 'Setia', "axis": 'S'}, {"text": 'Teliti', "axis": 'C'}]},
    {"id": "d14", "words": [{"text": 'Ekspresif', "axis": 'I'}, {"text": 'Toleran', "axis": 'S'}, {"text": 'Rapi', "axis": 'C'}, {"text": 'Kompetitif', "axis": 'D'}]},
    {"id": "d15", "words": [{"text": 'Bisa diandalkan', "axis": 'S'}, {"text": 'Teliti memeriksa detail', "axis": 'C'}, {"text": 'Berorientasi hasil', "axis": 'D'}, {"text": 'Percaya diri berbicara di depan umum', "axis": 'I'}]},
    {"id": "d16", "words": [{"text": 'Suka merencanakan dengan matang', "axis": 'C'}, {"text": 'Cepat mengambil keputusan', "axis": 'D'}, {"text": 'Terbuka kepada siapa saja', "axis": 'I'}, {"text": 'Setia pada komitmen', "axis": 'S'}]},
    {"id": "d17", "words": [{"text": 'Suka bersaing', "axis": 'D'}, {"text": 'Pandai memotivasi orang lain', "axis": 'I'}, {"text": 'Suka menenangkan suasana', "axis": 'S'}, {"text": 'Hati-hati sebelum bertindak', "axis": 'C'}]},
    {"id": "d18", "words": [{"text": 'Suka menjadi pusat perhatian', "axis": 'I'}, {"text": 'Sabar menghadapi tekanan', "axis": 'S'}, {"text": 'Menjunjung standar kerja yang tinggi', "axis": 'C'}, {"text": 'Lugas menyampaikan pendapat', "axis": 'D'}]},
    {"id": "d19", "words": [{"text": 'Konsisten menjalani rutinitas harian', "axis": 'S'}, {"text": 'Mengutamakan kualitas', "axis": 'C'}, {"text": 'Berani mengambil risiko', "axis": 'D'}, {"text": 'Ekspresif dalam berinteraksi', "axis": 'I'}]},
    {"id": "d20", "words": [{"text": 'Rapi dalam bekerja', "axis": 'C'}, {"text": 'Suka memegang kendali', "axis": 'D'}, {"text": 'Luwes membangun relasi', "axis": 'I'}, {"text": 'Suka membantu orang lain', "axis": 'S'}]},
    {"id": "d21", "words": [{"text": 'Tertarik pada tantangan baru', "axis": 'D'}, {"text": 'Senang bertemu orang baru', "axis": 'I'}, {"text": 'Mudah bekerja sama', "axis": 'S'}, {"text": 'Menyukai keputusan berbasis fakta', "axis": 'C'}]},
    {"id": "d22", "words": [{"text": 'Mudah bergaul', "axis": 'I'}, {"text": 'Pendengar yang baik', "axis": 'S'}, {"text": 'Disiplin mengikuti prosedur', "axis": 'C'}, {"text": 'Fokus mengejar target', "axis": 'D'}]},
    {"id": "d23", "words": [{"text": 'Menjaga keharmonisan tim', "axis": 'S'}, {"text": 'Objektif dalam menilai', "axis": 'C'}, {"text": 'Berani menghadapi tantangan', "axis": 'D'}, {"text": 'Pandai meyakinkan orang', "axis": 'I'}]},
    {"id": "d24", "words": [{"text": 'Selalu meninjau ulang sebelum menyerahkan hasil kerja', "axis": 'C'}, {"text": 'Senang mengambil peran sebagai pemimpin', "axis": 'D'}, {"text": 'Suka menghidupkan suasana dengan humor', "axis": 'I'}, {"text": 'Tetap tenang saat menghadapi perubahan mendadak', "axis": 'S'}]},
    {"id": "d25", "words": [{"text": 'Ingin segera melihat hasil nyata', "axis": 'D'}, {"text": 'Senang menjadi penghubung antar orang', "axis": 'I'}, {"text": 'Siap mendampingi rekan saat kesulitan', "axis": 'S'}, {"text": 'Mengandalkan logika dalam berpikir', "axis": 'C'}]},
    {"id": "d26", "words": [{"text": 'Mudah menularkan semangat ke orang lain', "axis": 'I'}, {"text": 'Nyaman bekerja dengan ritme yang stabil', "axis": 'S'}, {"text": 'Bekerja secara runut dan terstruktur', "axis": 'C'}, {"text": 'Gemar mendobrak cara kerja lama', "axis": 'D'}]},
    {"id": "d27", "words": [{"text": 'Bersedia mengalah demi kebaikan bersama', "axis": 'S'}, {"text": 'Memilih akurasi di atas kecepatan', "axis": 'C'}, {"text": 'Cepat merespons masalah yang muncul', "axis": 'D'}, {"text": 'Menikmati keramaian dan banyak interaksi', "axis": 'I'}]},
    {"id": "d28", "words": [{"text": 'Cermat mengatur jadwal kerja', "axis": 'C'}, {"text": 'Tegas menghadapi situasi sulit', "axis": 'D'}, {"text": 'Gemar bercerita dan berbagi pengalaman', "axis": 'I'}, {"text": 'Lebih memilih menjaga kedamaian daripada berdebat', "axis": 'S'}]},
]

# --- Big Five / OCEAN: Likert 1-5. `reverse` items are reverse-scored.
BIGFIVE_ITEMS = [
    {"id": "bf1", "text": 'Saya senang mencoba pendekatan baru dalam menyelesaikan pekerjaan.', "trait": 'O', "reverse": False},
    {"id": "bf2", "text": 'Saya meluangkan waktu untuk mempelajari topik yang tidak berkaitan langsung dengan pekerjaan saya.', "trait": 'O', "reverse": False},
    {"id": "bf3", "text": 'Saya lebih memilih menjalankan cara kerja yang sudah terbukti daripada mengeksplorasi cara yang belum teruji.', "trait": 'O', "reverse": True},
    {"id": "bf4", "text": 'Saya sering mengusulkan ide yang berbeda dari kebiasaan tim saat rapat.', "trait": 'O', "reverse": False},
    {"id": "bf5", "text": 'Saya kurang tertarik mendalami gagasan yang bersifat abstrak atau teoretis.', "trait": 'O', "reverse": True},
    {"id": "bf6", "text": 'Saya tetap menyelesaikan tugas sesuai tenggat waktu meskipun tidak ada yang mengingatkan saya.', "trait": 'C', "reverse": False},
    {"id": "bf7", "text": 'Saya memeriksa kembali detail pekerjaan saya sebelum menyerahkannya kepada atasan atau rekan kerja.', "trait": 'C', "reverse": False},
    {"id": "bf8", "text": 'Saya baru mengerjakan tugas ketika batas waktunya sudah sangat dekat.', "trait": 'C', "reverse": True},
    {"id": "bf9", "text": 'Saya menyusun urutan prioritas sebelum memulai pekerjaan yang memiliki banyak bagian.', "trait": 'C', "reverse": False},
    {"id": "bf10", "text": 'Saya sering kehilangan jejak dokumen atau catatan kerja saya.', "trait": 'C', "reverse": True},
    {"id": "bf11", "text": 'Saya memulai percakapan lebih dulu ketika bertemu rekan kerja yang belum saya kenal.', "trait": 'E', "reverse": False},
    {"id": "bf12", "text": 'Saya merasa berenergi setelah menghabiskan waktu berdiskusi dengan banyak orang dalam satu hari.', "trait": 'E', "reverse": False},
    {"id": "bf13", "text": 'Saya memilih menyelesaikan pekerjaan sendirian di tempat yang sepi daripada berada di ruang kerja yang ramai.', "trait": 'E', "reverse": True},
    {"id": "bf14", "text": 'Saya cenderung memilih diam dalam rapat meskipun saya memiliki pendapat yang berbeda.', "trait": 'E', "reverse": True},
    {"id": "bf15", "text": 'Saya mengambil inisiatif untuk memimpin jalannya diskusi dalam pertemuan tim.', "trait": 'E', "reverse": False},
    {"id": "bf16", "text": 'Saya mudah memaafkan rekan kerja yang melakukan kesalahan tanpa sengaja.', "trait": 'A', "reverse": False},
    {"id": "bf17", "text": 'Saya meluangkan waktu untuk membantu rekan kerja menyelesaikan tugasnya meskipun bukan tanggung jawab saya.', "trait": 'A', "reverse": False},
    {"id": "bf18", "text": 'Saya cenderung bersikap acuh tak acuh ketika rekan kerja sedang mengalami kesulitan.', "trait": 'A', "reverse": True},
    {"id": "bf19", "text": 'Saya mendahulukan kepentingan saya sendiri ketika bertentangan dengan kepentingan tim.', "trait": 'A', "reverse": True},
    {"id": "bf20", "text": 'Saya tetap berbicara dengan sopan kepada rekan kerja meskipun sedang berselisih pendapat.', "trait": 'A', "reverse": False},
    {"id": "bf21", "text": 'Saya merasa cemas ketika harus menyelesaikan pekerjaan dengan tenggat waktu yang mendadak.', "trait": 'N', "reverse": False},
    {"id": "bf22", "text": 'Saya mengalami perubahan suasana hati yang cepat ketika muncul masalah yang tidak terduga di pekerjaan.', "trait": 'N', "reverse": False},
    {"id": "bf23", "text": 'Saya jarang merasa khawatir berlebihan terhadap hal-hal yang belum tentu terjadi.', "trait": 'N', "reverse": True},
    {"id": "bf24", "text": 'Saya memikirkan kesalahan kecil dalam pekerjaan jauh lebih lama daripada yang seharusnya.', "trait": 'N', "reverse": False},
    {"id": "bf25", "text": 'Saya tidak mudah terpengaruh secara emosional oleh kritik terhadap hasil kerja saya.', "trait": 'N', "reverse": True},
]

# --- Logical / problem-solving: single-correct MCQ.
LOGIC_ITEMS = [
    {"id": "l1", "text": 'Lanjutkan deret angka berikut: 3, 6, 12, 24, 48, …', "options": ['84', '96', '72', '108'], "answer": '96', "points": 1},
    {"id": "l2", "text": 'Lanjutkan deret angka berikut: 2, 5, 11, 23, 47, …', "options": ['92', '94', '95', '90'], "answer": '95', "points": 1},
    {"id": "l3", "text": 'Lanjutkan deret angka berikut: 4, 7, 12, 19, 28, …', "options": ['37', '39', '41', '42'], "answer": '39', "points": 1},
    {"id": "l4", "text": 'Semua manajer proyek di perusahaan ini memiliki sertifikasi manajemen proyek. Sebagian besar karyawan di divisi Teknologi Informasi menjabat sebagai manajer proyek. Berdasarkan kedua pernyataan tersebut, simpulan yang paling tepat adalah:', "options": ['Semua karyawan di divisi Teknologi Informasi memiliki sertifikasi manajemen proyek', 'Sebagian besar karyawan di divisi Teknologi Informasi memiliki sertifikasi manajemen proyek', 'Semua manajer proyek berasal dari divisi Teknologi Informasi', 'Karyawan yang memiliki sertifikasi manajemen proyek pasti menjabat sebagai manajer proyek di divisi Teknologi Informasi'], "answer": 'Sebagian besar karyawan di divisi Teknologi Informasi memiliki sertifikasi manajemen proyek', "points": 1},
    {"id": "l5", "text": 'Setiap laporan yang belum diverifikasi oleh supervisor tidak pernah diserahkan kepada klien. Sebuah laporan sudah diserahkan kepada klien. Berdasarkan pernyataan tersebut, simpulan yang paling tepat adalah:', "options": ['Laporan tersebut sudah diverifikasi oleh supervisor', 'Laporan tersebut belum diverifikasi oleh supervisor', 'Supervisor tidak perlu memverifikasi laporan tersebut', 'Semua laporan yang diserahkan kepada klien sudah pasti belum diverifikasi'], "answer": 'Laporan tersebut sudah diverifikasi oleh supervisor', "points": 1},
    {"id": "l6", "text": 'Bengkel berhubungan dengan Montir, sebagaimana Rumah Sakit berhubungan dengan …', "options": ['Pasien', 'Dokter', 'Obat', 'Ambulans'], "answer": 'Dokter', "points": 1},
    {"id": "l7", "text": 'Kunci berhubungan dengan Gembok, sebagaimana Kata Sandi berhubungan dengan …', "options": ['Layar', 'Kabel', 'Akun', 'Baterai'], "answer": 'Akun', "points": 1},
    {"id": "l8", "text": 'Sebuah proyek dapat diselesaikan oleh 8 orang pekerja dalam waktu 15 hari, dengan asumsi kecepatan kerja setiap orang sama. Jika perusahaan menambahkan 4 pekerja lagi sehingga total pekerja menjadi 12 orang, berapa hari yang dibutuhkan untuk menyelesaikan proyek yang sama?', "options": ['12 hari', '11 hari', '10 hari', '8 hari'], "answer": '10 hari', "points": 1},
    {"id": "l9", "text": 'Setelah mendapat potongan harga sebesar 20%, harga sebuah peralatan kantor menjadi Rp240.000. Berapa harga peralatan tersebut sebelum diskon?', "options": ['Rp288.000', 'Rp320.000', 'Rp260.000', 'Rp300.000'], "answer": 'Rp300.000', "points": 1},
    {"id": "l10", "text": 'Seorang karyawan memiliki jam kerja normal 8 jam per hari selama 5 hari kerja dalam seminggu. Pada minggu ini, karyawan tersebut tercatat bekerja selama total 46 jam. Berapa jam lembur yang diperoleh karyawan tersebut pada minggu itu?', "options": ['4 jam', '5 jam', '8 jam', '6 jam'], "answer": '6 jam', "points": 1},
]

# --- Ketelitian (clerical accuracy): same/different pairs + odd-one-out. Scored correct/incorrect.
KETELITIAN_ITEMS = [
    {"id": "k1", "kind": "pair", "left": "4837-XK-92", "right": "4837-XK-92", "answer": "Sama", "points": 1},
    {"id": "k2", "kind": "pair", "left": "Andi Wijaya", "right": "Andi Wjaya", "answer": "Beda", "points": 1},
    {"id": "k3", "kind": "odd", "text": "Mana yang berbeda?", "options": ["55210", "55210", "55120", "55210"], "answer": "55120", "points": 1},
]
PAIR_OPTIONS = ["Sama", "Beda"]


# ----------------------------------------------------------------- public (stripped)

def public_disc():
    return [{"id": it["id"], "words": [w["text"] for w in it["words"]]} for it in DISC_ITEMS]


def public_bigfive():
    return [{"id": it["id"], "text": it["text"]} for it in BIGFIVE_ITEMS]


def public_logic():
    return [{"id": it["id"], "text": it["text"], "options": list(it["options"])} for it in LOGIC_ITEMS]


def logic_qdefs():
    """Reshape LOGIC_ITEMS to _score_answers question defs (all Multiple Choice)."""
    return [{"question_text": it["text"], "qtype": "Multiple Choice",
             "correct_answer": it["answer"], "points": int(it.get("points", 1))}
            for it in LOGIC_ITEMS]


def public_ketelitian():
    out = []
    for it in KETELITIAN_ITEMS:
        if it["kind"] == "pair":
            out.append({"id": it["id"], "kind": "pair", "left": it["left"], "right": it["right"]})
        else:
            out.append({"id": it["id"], "kind": "odd", "text": it["text"], "options": list(it["options"])})
    return out


def ketelitian_qdefs():
    """→ _score_answers question defs. Pair items use Sama/Beda options; odd items use their options."""
    defs = []
    for it in KETELITIAN_ITEMS:
        opts = PAIR_OPTIONS if it["kind"] == "pair" else it["options"]
        defs.append({"question_text": it.get("text") or f'{it.get("left")} / {it.get("right")}',
                     "qtype": "Multiple Choice", "correct_answer": it["answer"],
                     "points": int(it.get("points", 1))})
    return defs


# ----------------------------------------------------------------- scoring

def score_disc(answers):
    """answers = {item_id: {"most": word_idx, "least": word_idx}}. → (scores 0-100, dominant)."""
    answers = answers or {}
    raw = {a: 0 for a in DISC_AXES}
    for it in DISC_ITEMS:
        a = answers.get(it["id"]) or {}
        m, l = a.get("most"), a.get("least")
        words = it["words"]
        if isinstance(m, int) and 0 <= m < len(words):
            raw[words[m]["axis"]] += 1
        if isinstance(l, int) and 0 <= l < len(words) and l != m:
            raw[words[l]["axis"]] -= 1
    n = len(DISC_ITEMS)
    if not n:
        return {a: 0 for a in DISC_AXES}, ""
    scores = {a: round((raw[a] + n) / (2 * n) * 100) for a in DISC_AXES}
    top = max(raw.values())
    dominant = "".join(a for a in DISC_AXES if raw[a] == top)
    return scores, dominant


def score_bigfive(answers):
    """answers = {item_id: 1..5}. → scores {trait: 0-100} (mean of reverse-adjusted, mapped 1-5→0-100)."""
    answers = answers or {}
    by_trait = {t: [] for t in BIGFIVE_TRAITS}
    for it in BIGFIVE_ITEMS:
        v = answers.get(it["id"])
        if not isinstance(v, (int, float)) or not (1 <= v <= 5):
            continue
        eff = (6 - v) if it["reverse"] else v
        by_trait[it["trait"]].append(eff)
    scores = {}
    for t in BIGFIVE_TRAITS:
        vals = by_trait[t]
        scores[t] = round((sum(vals) / len(vals) - 1) / 4 * 100) if vals else 0
    return scores


def fit(scores, target, axes):
    """Transparent distance-based fit. Blank target axis → 50 (neutral)."""
    if not scores:
        return 0.0
    diffs = []
    for a in axes:
        tv = (target or {}).get(a)
        tv = 50 if tv is None else tv
        diffs.append(abs((scores.get(a) or 0) - tv))
    return round(max(0.0, min(100.0, 100 - sum(diffs) / len(diffs))), 1)


# ----------------------------------------------------------------- self-check

def _selfcheck():
    # structural: DISC one word per axis, unique
    for it in DISC_ITEMS:
        axes = [w["axis"] for w in it["words"]]
        assert sorted(axes) == list("CDIS"), (it["id"], axes)
    # structural: every Big Five trait present, reverse is bool
    seen = {it["trait"] for it in BIGFIVE_ITEMS}
    assert seen == set(BIGFIVE_TRAITS), seen
    assert all(isinstance(it["reverse"], bool) for it in BIGFIVE_ITEMS)
    # structural: every logical answer is one of its options
    for it in LOGIC_ITEMS:
        assert it["answer"] in it["options"], it["id"]
    # stripped output leaks nothing
    for it in public_disc():
        assert set(it.keys()) == {"id", "words"} and all(isinstance(w, str) for w in it["words"])
    for it in public_bigfive():
        assert set(it.keys()) == {"id", "text"}
    for it in public_logic():
        assert set(it.keys()) == {"id", "text", "options"}
    # DISC scoring: pick axis-D word most, axis-S word least across all items → D high, S low
    ans = {}
    for it in DISC_ITEMS:
        di = next(i for i, w in enumerate(it["words"]) if w["axis"] == "D")
        si = next(i for i, w in enumerate(it["words"]) if w["axis"] == "S")
        ans[it["id"]] = {"most": di, "least": si}
    scores, dom = score_disc(ans)
    assert scores["D"] == 100 and scores["S"] == 0, scores
    assert dom == "D", dom
    # Big Five reverse-scoring: answer each item toward its trait max (non-reverse→5,
    # reverse→1) → every trait 100; toward min → every trait 0; all-neutral (3) → 50.
    hi = score_bigfive({it["id"]: (1 if it["reverse"] else 5) for it in BIGFIVE_ITEMS})
    lo = score_bigfive({it["id"]: (5 if it["reverse"] else 1) for it in BIGFIVE_ITEMS})
    assert all(hi[t] == 100 for t in BIGFIVE_TRAITS), hi
    assert all(lo[t] == 0 for t in BIGFIVE_TRAITS), lo
    assert all(v == 50 for v in score_bigfive({it["id"]: 3 for it in BIGFIVE_ITEMS}).values())
    # fit: identical → 100, opposite → 0, blank target → distance from 50
    assert fit({"D": 80, "I": 40, "S": 20, "C": 60}, {"D": 80, "I": 40, "S": 20, "C": 60}, DISC_AXES) == 100.0
    assert fit({"D": 100, "I": 100, "S": 100, "C": 100}, {"D": 0, "I": 0, "S": 0, "C": 0}, DISC_AXES) == 0.0
    assert fit({"D": 50, "I": 50, "S": 50, "C": 50}, {}, DISC_AXES) == 100.0
    # Big Five public ids must be opaque (no trait letter leak)
    for it in public_bigfive():
        assert re.fullmatch(r"bf\d+", it["id"]), it["id"]
    # DISC word order must vary across items so position doesn't leak axis
    orders = {tuple(w["axis"] for w in it["words"]) for it in DISC_ITEMS}
    assert len(orders) > 1, "DISC word order must vary so position doesn't leak axis"
    # full-bank counts (populated from the validated item banks)
    assert len(DISC_ITEMS) >= 20, len(DISC_ITEMS)
    assert len(BIGFIVE_ITEMS) == 5 * len(BIGFIVE_TRAITS), len(BIGFIVE_ITEMS)
    for t in BIGFIVE_TRAITS:
        assert sum(1 for it in BIGFIVE_ITEMS if it["trait"] == t) == 5, t
    assert len(LOGIC_ITEMS) >= 8, len(LOGIC_ITEMS)
    assert any(it["reverse"] for it in BIGFIVE_ITEMS), "need some reverse-keyed items"
    # Ketelitian: pair answer in Sama/Beda; odd answer in its options; public strips answer.
    for it in KETELITIAN_ITEMS:
        if it["kind"] == "pair":
            assert it["answer"] in PAIR_OPTIONS, it["id"]
        else:
            assert it["answer"] in it["options"], it["id"]
    for it in public_ketelitian():
        assert "answer" not in it, it["id"]
        assert it["kind"] in ("pair", "odd")
    assert len(ketelitian_qdefs()) == len(KETELITIAN_ITEMS)
    print("recruitment_instruments selfcheck ok")


if __name__ == "__main__":
    _selfcheck()
