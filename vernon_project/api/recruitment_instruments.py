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
    {"id": "bf1", "text": 'Saya senang mempelajari hal-hal baru yang belum pernah saya coba sebelumnya.', "trait": 'O', "reverse": False},
    {"id": "bf2", "text": 'Saya suka mencari cara berbeda untuk menyelesaikan pekerjaan, bukan sekadar mengikuti cara yang biasa dilakukan.', "trait": 'O', "reverse": False},
    {"id": "bf3", "text": 'Saya lebih nyaman mengerjakan tugas dengan cara yang sudah baku daripada mencoba pendekatan baru.', "trait": 'O', "reverse": True},
    {"id": "bf4", "text": 'Saya tertarik membahas gagasan atau konsep yang masih asing bagi saya.', "trait": 'O', "reverse": False},
    {"id": "bf5", "text": 'Saya kurang tertarik mengapresiasi karya seni atau musik yang tidak biasa.', "trait": 'O', "reverse": True},
    {"id": "bf6", "text": 'Saya sering merasa penasaran dan ingin tahu lebih dalam tentang berbagai topik.', "trait": 'O', "reverse": False},
    {"id": "bf7", "text": 'Saya jarang mencari sudut pandang baru dalam melihat suatu masalah.', "trait": 'O', "reverse": True},
    {"id": "bf8", "text": 'Saya senang membayangkan ide-ide dan kemungkinan baru di dalam pikiran saya.', "trait": 'O', "reverse": False},
    {"id": "bf9", "text": 'Saya menetapkan standar tinggi dalam pekerjaan dan berusaha keras mencapainya.', "trait": 'C', "reverse": False},
    {"id": "bf10", "text": 'Saya memeriksa kembali hasil pekerjaan saya sebelum menyerahkannya untuk memastikan tidak ada kesalahan.', "trait": 'C', "reverse": False},
    {"id": "bf11", "text": 'Saya sering menunda pekerjaan hingga mendekati tenggat waktu.', "trait": 'C', "reverse": True},
    {"id": "bf12", "text": 'Saya menyusun rencana kerja yang jelas sebelum mulai mengerjakan suatu tugas.', "trait": 'C', "reverse": False},
    {"id": "bf13", "text": 'Dokumen dan peralatan kerja saya sering tidak tersusun rapi.', "trait": 'C', "reverse": True},
    {"id": "bf14", "text": 'Saya tetap mengikuti prosedur kerja yang berlaku meskipun tidak ada yang mengawasi.', "trait": 'C', "reverse": False},
    {"id": "bf15", "text": 'Saya mudah kehilangan semangat saat mengerjakan tugas yang panjang dan menantang.', "trait": 'C', "reverse": True},
    {"id": "bf16", "text": 'Saya memastikan setiap komitmen yang saya buat kepada rekan kerja benar-benar saya penuhi.', "trait": 'C', "reverse": False},
    {"id": "bf17", "text": 'Saya merasa bersemangat saat bekerja dalam kelompok besar.', "trait": 'E', "reverse": False},
    {"id": "bf18", "text": 'Saya mudah memulai percakapan dengan orang yang baru saya kenal.', "trait": 'E', "reverse": False},
    {"id": "bf19", "text": 'Saya lebih memilih bekerja sendiri daripada berinteraksi dengan banyak orang.', "trait": 'E', "reverse": True},
    {"id": "bf20", "text": 'Saya senang menjadi orang yang tampil di depan saat presentasi atau diskusi kelompok.', "trait": 'E', "reverse": False},
    {"id": "bf21", "text": 'Saya cenderung diam saat berada dalam pertemuan dengan banyak orang.', "trait": 'E', "reverse": True},
    {"id": "bf22", "text": 'Saya cepat merasa akrab dengan rekan kerja baru di lingkungan yang ramai.', "trait": 'E', "reverse": False},
    {"id": "bf23", "text": 'Saya membutuhkan waktu sendiri yang cukup lama untuk memulihkan energi setelah bertemu banyak orang.', "trait": 'E', "reverse": True},
    {"id": "bf24", "text": 'Saya termasuk orang yang ceria dan mudah menularkan semangat kepada orang di sekitar saya.', "trait": 'E', "reverse": False},
    {"id": "bf25", "text": 'Saya berusaha memahami sudut pandang orang lain sebelum menilai suatu masalah.', "trait": 'A', "reverse": False},
    {"id": "bf26", "text": 'Saya bersedia membantu rekan kerja meskipun hal itu bukan bagian dari tugas saya.', "trait": 'A', "reverse": False},
    {"id": "bf27", "text": 'Saya cenderung mengutamakan kepentingan saya sendiri dibandingkan kepentingan tim.', "trait": 'A', "reverse": True},
    {"id": "bf28", "text": 'Saya mudah memaafkan kesalahan yang dilakukan orang lain terhadap saya.', "trait": 'A', "reverse": False},
    {"id": "bf29", "text": 'Saya sering mengkritik pendapat orang lain tanpa mempertimbangkan perasaan mereka.', "trait": 'A', "reverse": True},
    {"id": "bf30", "text": 'Saya percaya bahwa kebanyakan orang memiliki niat baik.', "trait": 'A', "reverse": False},
    {"id": "bf31", "text": 'Saya kesulitan mengalah ketika berbeda pendapat dengan rekan kerja.', "trait": 'A', "reverse": True},
    {"id": "bf32", "text": 'Saya tetap bersikap sopan meskipun sedang berhadapan dengan orang yang sulit diajak bekerja sama.', "trait": 'A', "reverse": False},
    {"id": "bf33", "text": 'Saya mudah merasa cemas ketika menghadapi tekanan pekerjaan.', "trait": 'N', "reverse": False},
    {"id": "bf34", "text": 'Perasaan saya mudah terpengaruh oleh komentar negatif dari orang lain.', "trait": 'N', "reverse": False},
    {"id": "bf35", "text": 'Saya tetap tenang meskipun menghadapi situasi kerja yang mendesak.', "trait": 'N', "reverse": True},
    {"id": "bf36", "text": 'Saya sering memikirkan ulang kesalahan yang telah saya lakukan di masa lalu.', "trait": 'N', "reverse": False},
    {"id": "bf37", "text": 'Saya jarang merasa jengkel ketika keadaan tidak berjalan sesuai rencana.', "trait": 'N', "reverse": True},
    {"id": "bf38", "text": 'Suasana hati saya bisa berubah drastis hanya karena hal kecil.', "trait": 'N', "reverse": False},
    {"id": "bf39", "text": 'Saya jarang bertindak gegabah meskipun sedang marah atau kecewa.', "trait": 'N', "reverse": True},
    {"id": "bf40", "text": 'Saya jarang merasa khawatir terhadap hal-hal yang belum tentu terjadi.', "trait": 'N', "reverse": True},
]

# --- Logical / problem-solving: single-correct MCQ.
LOGIC_ITEMS = [
    {"id": "l1", "text": 'Lanjutkan deret angka berikut: 2, 4, 8, 16, ...', "options": ['20', '24', '30', '32'], "answer": '32', "points": 1},
    {"id": "l2", "text": 'Semua karyawan tetap berhak mendapatkan jatah cuti tahunan. Rian adalah karyawan tetap di perusahaan tersebut. Kesimpulan yang tepat adalah:', "options": ['Rian berhak mendapatkan jatah cuti tahunan', 'Rian tidak berhak mendapatkan jatah cuti tahunan', 'Rian bukan karyawan tetap', 'Semua karyawan, tetap maupun tidak tetap, berhak mendapatkan cuti tahunan'], "answer": 'Rian berhak mendapatkan jatah cuti tahunan', "points": 1},
    {"id": "l3", "text": 'Lengkapi analogi berikut: Guru : Sekolah = Dokter : ...', "options": ['Obat', 'Pasien', 'Rumah Sakit', 'Perawat'], "answer": 'Rumah Sakit', "points": 1},
    {"id": "l4", "text": 'Seorang karyawan bekerja 8 jam sehari selama 5 hari dalam seminggu. Berapa total jam kerja karyawan tersebut dalam 4 minggu?', "options": ['120 jam', '140 jam', '160 jam', '180 jam'], "answer": '160 jam', "points": 1},
    {"id": "l5", "text": 'Lanjutkan deret angka berikut: 3, 6, 9, 12, ...', "options": ['14', '15', '16', '18'], "answer": '15', "points": 1},
    {"id": "l6", "text": 'Jika hujan turun, maka jalan di depan kantor menjadi basah. Pagi ini jalan di depan kantor tidak basah. Kesimpulan yang tepat adalah:', "options": ['Hujan turun tadi malam', 'Hujan tidak turun', 'Jalan basah karena sebab lain', 'Tidak dapat disimpulkan apa pun'], "answer": 'Hujan tidak turun', "points": 1},
    {"id": "l7", "text": 'Lengkapi analogi berikut: Pena : Menulis = Pisau : ...', "options": ['Menulis', 'Memotong', 'Menggambar', 'Mengukur'], "answer": 'Memotong', "points": 1},
    {"id": "l8", "text": 'Harga sebuah barang adalah Rp150.000 dan mendapat diskon 20%. Berapa harga barang tersebut setelah diskon?', "options": ['Rp100.000', 'Rp110.000', 'Rp120.000', 'Rp130.000'], "answer": 'Rp120.000', "points": 1},
    {"id": "l9", "text": 'Lanjutkan deret angka berikut: 1, 4, 9, 16, 25, ...', "options": ['30', '32', '36', '49'], "answer": '36', "points": 1},
    {"id": "l10", "text": 'Semua manajer di perusahaan ini memiliki akses ke laporan keuangan. Tidak ada staf magang yang memiliki akses ke laporan keuangan. Kesimpulan yang tepat adalah:', "options": ['Semua staf magang adalah manajer', 'Tidak ada staf magang yang menjadi manajer', 'Sebagian staf magang adalah manajer', 'Semua manajer adalah staf magang'], "answer": 'Tidak ada staf magang yang menjadi manajer', "points": 1},
    {"id": "l11", "text": 'Lengkapi analogi berikut: Roda : Mobil = Sirip : ...', "options": ['Burung', 'Ikan', 'Kapal', 'Pesawat'], "answer": 'Ikan', "points": 1},
    {"id": "l12", "text": 'Sebuah tim menyelesaikan 60 unit produk dalam 5 jam kerja. Berapa rata-rata unit yang diselesaikan tim tersebut per jam?', "options": ['10 unit', '12 unit', '15 unit', '20 unit'], "answer": '12 unit', "points": 1},
    {"id": "l13", "text": 'Lanjutkan deret angka berikut: 20, 17, 14, 11, ...', "options": ['9', '8', '7', '6'], "answer": '8', "points": 1},
    {"id": "l14", "text": 'Sebagian pelanggan setia mendapatkan diskon khusus. Semua pelanggan yang mendapatkan diskon khusus wajib mendaftar sebagai anggota. Kesimpulan yang tepat adalah:', "options": ['Semua pelanggan setia wajib mendaftar sebagai anggota', 'Sebagian pelanggan setia wajib mendaftar sebagai anggota', 'Tidak ada pelanggan setia yang mendaftar sebagai anggota', 'Semua anggota adalah pelanggan setia'], "answer": 'Sebagian pelanggan setia wajib mendaftar sebagai anggota', "points": 1},
    {"id": "l15", "text": 'Lengkapi analogi berikut: Kunci : Gembok = Kata Sandi : ...', "options": ['Komputer', 'Akun', 'Internet', 'Layar'], "answer": 'Akun', "points": 1},
    {"id": "l16", "text": 'Jika 3 mesin dapat menyelesaikan suatu pekerjaan dalam 12 hari, berapa hari yang dibutuhkan 6 mesin dengan kecepatan kerja yang sama untuk menyelesaikan pekerjaan tersebut?', "options": ['3 hari', '6 hari', '9 hari', '24 hari'], "answer": '6 hari', "points": 1},
    {"id": "l17", "text": 'Lanjutkan deret angka berikut: 5, 10, 20, 40, ...', "options": ['60', '70', '80', '90'], "answer": '80', "points": 1},
    {"id": "l18", "text": 'Semua teknisi di pabrik wajib mengikuti pelatihan keselamatan kerja. Sebagian staf gudang berstatus sebagai teknisi. Kesimpulan yang tepat adalah:', "options": ['Semua staf gudang wajib mengikuti pelatihan keselamatan kerja', 'Sebagian staf gudang wajib mengikuti pelatihan keselamatan kerja', 'Tidak ada staf gudang yang mengikuti pelatihan keselamatan kerja', 'Semua teknisi adalah staf gudang'], "answer": 'Sebagian staf gudang wajib mengikuti pelatihan keselamatan kerja', "points": 1},
    {"id": "l19", "text": 'Lengkapi analogi berikut: Panas : Api = Dingin : ...', "options": ['Air', 'Es', 'Angin', 'Matahari'], "answer": 'Es', "points": 1},
    {"id": "l20", "text": 'Seorang sales mendapatkan komisi sebesar 5% dari total penjualan senilai Rp8.000.000. Berapa komisi yang diterima sales tersebut?', "options": ['Rp300.000', 'Rp400.000', 'Rp500.000', 'Rp600.000'], "answer": 'Rp400.000', "points": 1},
]

# --- Ketelitian (clerical accuracy): same/different pairs + odd-one-out. Scored correct/incorrect.
KETELITIAN_ITEMS = [
    {"id": "k1", "kind": "pair", "left": '3573021410880004', "right": '3573021410880004', "answer": 'Sama', "points": 1},
    {"id": "k2", "kind": "odd", "text": 'Mana nomor rekening yang berbeda dari yang lain?', "options": ['7710098234561', '7710098234561', '7710098234516', '7710098234561'], "answer": '7710098234516', "points": 1},
    {"id": "k3", "kind": "pair", "left": '4550123456789', "right": '4550123465789', "answer": 'Beda', "points": 1},
    {"id": "k4", "kind": "odd", "text": 'Mana nama yang berbeda dari yang lain?', "options": ['Yulia Permatasari', 'Yulia Permatasari', 'Yulia Permatasari', 'Yulia Permatosari'], "answer": 'Yulia Permatosari', "points": 1},
    {"id": "k5", "kind": "pair", "left": 'Dewi Anggraini Putri', "right": 'Dewi Anggraini Putri', "answer": 'Sama', "points": 1},
    {"id": "k6", "kind": "odd", "text": 'Mana tanggal yang berbeda dari yang lain?', "options": ['05/09/2023', '05/09/2023', '05/09/2023', '05/09/2032'], "answer": '05/09/2032', "points": 1},
    {"id": "k7", "kind": "pair", "left": 'Muhammad Rizky Pratama', "right": 'Muhammad Rizki Pratama', "answer": 'Beda', "points": 1},
    {"id": "k8", "kind": "odd", "text": 'Mana kode produk yang berbeda dari yang lain?', "options": ['MX-4471-RD', 'MX-4471-RD', 'MX-4471-RD', 'MX-4471-RB'], "answer": 'MX-4471-RB', "points": 1},
    {"id": "k9", "kind": "pair", "left": '17-08-1995', "right": '17-08-1995', "answer": 'Sama', "points": 1},
    {"id": "k10", "kind": "odd", "text": 'Mana nomor plat kendaraan yang berbeda dari yang lain?', "options": ['B 1234 XYZ', 'B 1234 XYZ', 'B 1234 XYZ', 'B 1234 XZY'], "answer": 'B 1234 XZY', "points": 1},
    {"id": "k11", "kind": "pair", "left": '22-11-2001', "right": '22-11-2010', "answer": 'Beda', "points": 1},
    {"id": "k12", "kind": "odd", "text": 'Mana alamat email yang berbeda dari yang lain?', "options": ['rina.kusuma@perusahaan.co.id', 'rina.kusuma@perusahaan.co.id', 'rina.kusuma@perusahan.co.id', 'rina.kusuma@perusahaan.co.id'], "answer": 'rina.kusuma@perusahan.co.id', "points": 1},
    {"id": "k13", "kind": "pair", "left": 'INV-2024-00587', "right": 'INV-2024-00587', "answer": 'Sama', "points": 1},
    {"id": "k14", "kind": "odd", "text": 'Mana nomor faktur yang berbeda dari yang lain?', "options": ['FAK/2024/VII/00123', 'FAK/2024/VII/00123', 'FAK/2024/VII/00123', 'FAK/2024/VII/00132'], "answer": 'FAK/2024/VII/00132', "points": 1},
    {"id": "k15", "kind": "pair", "left": 'SKU-8842-BLK-M', "right": 'SKU-8842-BLK-N', "answer": 'Beda', "points": 1},
    {"id": "k16", "kind": "odd", "text": 'Mana alamat yang berbeda dari yang lain?', "options": ['Jl. Merdeka No. 45, Bandung 40115', 'Jl. Merdeka No. 45, Bandung 40115', 'Jl. Merdeka No. 45, Bandung 40151', 'Jl. Merdeka No. 45, Bandung 40115'], "answer": 'Jl. Merdeka No. 45, Bandung 40151', "points": 1},
    {"id": "k17", "kind": "pair", "left": 'andi.wijaya@email.co.id', "right": 'andi.wijaya@email.co.id', "answer": 'Sama', "points": 1},
    {"id": "k18", "kind": "odd", "text": 'Mana nomor telepon yang berbeda dari yang lain?', "options": ['021-7654321', '021-7654321', '021-7654321', '021-7654312'], "answer": '021-7654312', "points": 1},
    {"id": "k19", "kind": "pair", "left": '0812-3456-7890', "right": '0812-3456-7980', "answer": 'Beda', "points": 1},
    {"id": "k20", "kind": "odd", "text": 'Mana nama perusahaan yang berbeda dari yang lain?', "options": ['PT Sinar Abadi Sejahtera', 'PT Sinar Abadi Sejahtera', 'PT Sinar Abadi Sejahtera', 'PT Sinar Abadi Sejahtra'], "answer": 'PT Sinar Abadi Sejahtra', "points": 1},
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
    assert len(BIGFIVE_ITEMS) == 8 * len(BIGFIVE_TRAITS), len(BIGFIVE_ITEMS)
    for t in BIGFIVE_TRAITS:
        assert sum(1 for it in BIGFIVE_ITEMS if it["trait"] == t) == 8, t
    assert len(LOGIC_ITEMS) >= 16, len(LOGIC_ITEMS)
    assert any(it["reverse"] for it in BIGFIVE_ITEMS), "need some reverse-keyed items"
    assert len(KETELITIAN_ITEMS) >= 16, len(KETELITIAN_ITEMS)
    assert any(it["kind"] == "pair" for it in KETELITIAN_ITEMS) and any(it["kind"] == "odd" for it in KETELITIAN_ITEMS)
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
