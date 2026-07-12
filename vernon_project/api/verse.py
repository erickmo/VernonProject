# Daily Verse (Ayat Harian): per-religion daily scripture in Bahasa Indonesia.
# Islam/Kristen/Katolik pull text from a free Bahasa API; Hindu/Buddha have none,
# so their verses are baked in below (curated, original renderings). Konghucu:
# no source -> feature stays hidden for it.

import hashlib
import re

import frappe
import requests

SUPPORTED = {"Islam", "Kristen", "Katolik", "Hindu", "Buddha"}

_TIMEOUT = 8

# Curated, well-known Bible references shared by Kristen + Katolik (same Bible).
# Tuple: (Indonesian label, bolls.life book number, chapter, verse).
# Book numbers follow the standard 66-book Protestant order used by bolls.life.
BIBLE_VERSES = [
	("Yohanes 3:16", 43, 3, 16),
	("Yohanes 14:6", 43, 14, 6),
	("Yohanes 15:5", 43, 15, 5),
	("Yohanes 16:33", 43, 16, 33),
	("Filipi 4:13", 50, 4, 13),
	("Filipi 4:6", 50, 4, 6),
	("Filipi 4:7", 50, 4, 7),
	("Yeremia 29:11", 24, 29, 11),
	("Amsal 3:5", 20, 3, 5),
	("Amsal 3:6", 20, 3, 6),
	("Amsal 16:3", 20, 16, 3),
	("Amsal 17:17", 20, 17, 17),
	("Roma 8:28", 45, 8, 28),
	("Roma 12:2", 45, 12, 2),
	("Yesaya 41:10", 23, 41, 10),
	("Yesaya 40:31", 23, 40, 31),
	("Mazmur 23:1", 19, 23, 1),
	("Mazmur 23:4", 19, 23, 4),
	("Mazmur 27:1", 19, 27, 1),
	("Mazmur 37:4", 19, 37, 4),
	("Mazmur 118:24", 19, 118, 24),
	("Mazmur 121:1", 19, 121, 1),
	("Mazmur 121:2", 19, 121, 2),
	("Matius 6:33", 40, 6, 33),
	("Matius 11:28", 40, 11, 28),
	("Matius 5:16", 40, 5, 16),
	("1 Korintus 13:4", 46, 13, 4),
	("1 Korintus 13:13", 46, 13, 13),
	("1 Korintus 10:13", 46, 10, 13),
	("Galatia 5:22", 48, 5, 22),
	("Efesus 2:8", 49, 2, 8),
	("Efesus 6:10", 49, 6, 10),
	("Kolose 3:23", 51, 3, 23),
	("1 Tesalonika 5:16", 52, 5, 16),
	("1 Tesalonika 5:17", 52, 5, 17),
	("Ibrani 11:1", 58, 11, 1),
	("Ibrani 13:5", 58, 13, 5),
	("Yakobus 1:2", 59, 1, 2),
	("Yakobus 1:12", 59, 1, 12),
	("1 Petrus 5:7", 60, 5, 7),
	("1 Yohanes 4:19", 62, 4, 19),
	("Wahyu 21:4", 66, 21, 4),
	("Ulangan 31:6", 5, 31, 6),
	("Yosua 1:9", 6, 1, 9),
]

# Hindu — Bhagavad Gita. No free Bahasa-Indonesia API exists, so text is baked in.
# These are original, concise Indonesian renderings of well-known verses (NOT a
# verbatim copy of any single copyrighted translation), attributed by reference.
GITA = [
	("Bhagawadgita 2.47", "Hakmu hanyalah pada perbuatan, bukan pada hasilnya. Jangan jadikan hasil sebagai motifmu, dan jangan pula terikat pada kelambanan."),
	("Bhagawadgita 2.20", "Sang jiwa tak pernah lahir dan tak pernah mati; ia kekal, abadi, dan tak binasa meski tubuh dihancurkan."),
	("Bhagawadgita 2.14", "Suka dan duka datang dan pergi bagai musim; keduanya tidak kekal. Hadapilah dengan sabar."),
	("Bhagawadgita 2.48", "Tunaikan tugasmu dengan seimbang, lepas dari keterikatan, sama dalam keberhasilan maupun kegagalan. Keseimbangan batin itulah yoga."),
	("Bhagawadgita 2.62", "Dari perenungan objek indria lahir keterikatan, dari keterikatan lahir keinginan, dan dari keinginan yang terhalang lahir kemarahan."),
	("Bhagawadgita 2.70", "Bagai lautan yang tetap tenang meski dialiri banyak sungai, orang yang damai tak terguncang oleh datangnya keinginan."),
	("Bhagawadgita 2.71", "Orang yang melepas segala keinginan, hidup tanpa keakuan dan rasa memiliki, akan mencapai kedamaian sejati."),
	("Bhagawadgita 3.19", "Tunaikanlah tugasmu tanpa keterikatan pada hasil; dengan berbuat tanpa pamrih, seseorang mencapai yang tertinggi."),
	("Bhagawadgita 3.21", "Apa pun yang dilakukan orang besar akan diikuti orang lain; teladan yang ia berikan menjadi panutan dunia."),
	("Bhagawadgita 3.35", "Lebih baik menjalankan tugasmu sendiri meski tak sempurna, daripada menjalankan tugas orang lain dengan sempurna."),
	("Bhagawadgita 4.7", "Kapan pun kebenaran merosot dan ketidakadilan merajalela, Aku menjelma ke dunia."),
	("Bhagawadgita 4.8", "Untuk melindungi yang baik, membinasakan yang jahat, dan menegakkan kebenaran, Aku hadir dari masa ke masa."),
	("Bhagawadgita 4.38", "Tak ada penyucian sebanding dengan pengetahuan sejati; ia yang matang dalam yoga menemukannya dalam dirinya sendiri."),
	("Bhagawadgita 5.10", "Ia yang berbuat tanpa keterikatan, mempersembahkan hasilnya kepada Yang Maha Kuasa, tak ternoda dosa bagai daun teratai tak tersentuh air."),
	("Bhagawadgita 6.5", "Angkatlah dirimu oleh dirimu sendiri; jangan biarkan dirimu terpuruk. Sebab diri sendiri bisa menjadi sahabat, bisa pula menjadi musuh."),
	("Bhagawadgita 6.6", "Bagi yang telah menaklukkan diri, diri menjadi sahabat; bagi yang belum, diri sendiri berlaku bagai musuh."),
	("Bhagawadgita 6.19", "Bagai nyala pelita yang tak bergoyang di tempat tanpa angin, demikian pikiran yogi yang terpusat dalam meditasi."),
	("Bhagawadgita 6.35", "Pikiran memang sukar dikendalikan dan gelisah, tetapi ia dapat ditaklukkan melalui latihan dan pelepasan."),
	("Bhagawadgita 9.22", "Bagi mereka yang senantiasa mengabdi dengan penuh kasih, Aku menjaga apa yang mereka miliki dan mencukupi kebutuhan mereka."),
	("Bhagawadgita 9.34", "Pusatkan pikiranmu pada-Ku, mengabdilah kepada-Ku, dan sujudlah kepada-Ku; dengan demikian engkau pasti sampai kepada-Ku."),
	("Bhagawadgita 12.13", "Ia yang tak membenci makhluk apa pun, penuh kasih dan welas, bebas dari keakuan dan keterikatan — ia dikasihi."),
	("Bhagawadgita 16.21", "Ada tiga gerbang menuju kejatuhan diri: nafsu, kemarahan, dan keserakahan. Tinggalkanlah ketiganya."),
	("Bhagawadgita 18.66", "Berserahlah sepenuhnya kepada Yang Maha Kuasa; janganlah khawatir, sebab engkau akan dibebaskan dari segala dosa."),
	("Bhagawadgita 2.3", "Jangan menyerah pada kelemahan; itu tak pantas bagimu. Buanglah kelemahan hati yang hina dan bangkitlah."),
	("Bhagawadgita 2.13", "Sebagaimana jiwa berpindah dari masa kanak, muda, ke tua dalam tubuh ini, demikian pula ia berpindah ke tubuh lain. Orang bijak tak tergoyahkan olehnya."),
]

# Buddha — Dhammapada. No free Bahasa-Indonesia API exists, so text is baked in.
# Original, concise Indonesian renderings of well-known verses, attributed by number.
DHAMMAPADA = [
	("Dhammapada 1", "Pikiran mendahului segala sesuatu. Bila seseorang berbicara atau bertindak dengan pikiran jahat, penderitaan akan mengikutinya bagai roda mengikuti langkah lembu penariknya."),
	("Dhammapada 2", "Pikiran mendahului segala sesuatu. Bila seseorang berbicara atau bertindak dengan pikiran murni, kebahagiaan akan mengikutinya bagai bayangan yang tak pernah pergi."),
	("Dhammapada 5", "Kebencian tak pernah berakhir oleh kebencian; hanya oleh cinta kasih kebencian berakhir. Inilah hukum abadi."),
	("Dhammapada 25", "Melalui usaha, kewaspadaan, disiplin, dan pengendalian diri, orang bijak membangun sebuah pulau yang tak dapat ditenggelamkan banjir."),
	("Dhammapada 35", "Pikiran sukar dikendalikan dan bergerak ke mana pun ia suka. Melatihnya adalah baik; pikiran yang terkendali membawa kebahagiaan."),
	("Dhammapada 50", "Janganlah memperhatikan kesalahan orang lain; perhatikanlah apa yang telah dan belum kaulakukan sendiri."),
	("Dhammapada 62", "'Anak-anakku, kekayaanku' — demikian orang bodoh gelisah. Padahal dirinya sendiri bukan miliknya, apalagi anak dan kekayaannya."),
	("Dhammapada 80", "Petani mengairi ladang, pembuat panah meluruskan anak panah, tukang kayu membentuk kayu; orang bijak membentuk dirinya sendiri."),
	("Dhammapada 96", "Tenang pikirannya, tenang ucapannya, tenang perbuatannya — demikianlah orang yang telah bebas dan berada dalam kedamaian sempurna."),
	("Dhammapada 100", "Lebih baik satu kata bermakna yang mendatangkan kedamaian, daripada seribu kata yang tak berguna."),
	("Dhammapada 103", "Menaklukkan diri sendiri jauh lebih mulia daripada menaklukkan ribuan orang dalam pertempuran."),
	("Dhammapada 121", "Jangan meremehkan perbuatan buruk kecil dengan berkata 'itu tak berakibat.' Setetes demi setetes air pun memenuhi tempayan."),
	("Dhammapada 122", "Jangan meremehkan perbuatan baik kecil dengan berkata 'itu tak berarti.' Setetes demi setetes, orang bijak terisi kebajikan."),
	("Dhammapada 129", "Semua makhluk gemetar menghadapi kekerasan dan takut akan kematian. Menyadari hal ini, janganlah membunuh atau menyebabkan pembunuhan."),
	("Dhammapada 131", "Barang siapa mencari kebahagiaan dengan menyakiti makhluk lain yang juga mendambakan kebahagiaan, ia takkan menemukan kebahagiaan."),
	("Dhammapada 160", "Diri sendiri adalah pelindung bagi diri sendiri; siapa lagi yang dapat menjadi pelindung? Dengan diri yang terlatih, seseorang memperoleh pelindung sejati."),
	("Dhammapada 165", "Oleh diri sendiri kejahatan dilakukan, oleh diri sendiri pula seseorang menjadi suci. Kesucian bergantung pada diri sendiri; tak seorang pun dapat menyucikan orang lain."),
	("Dhammapada 183", "Tidak berbuat jahat, memperbanyak kebajikan, dan menyucikan hati — inilah ajaran para Buddha."),
	("Dhammapada 197", "Sungguh bahagia kita hidup tanpa kebencian di antara mereka yang penuh kebencian."),
	("Dhammapada 204", "Kesehatan adalah keuntungan terbesar, kepuasan adalah kekayaan terbesar, kepercayaan adalah sahabat terbaik, dan Nibbana adalah kebahagiaan tertinggi."),
	("Dhammapada 223", "Taklukkan kemarahan dengan cinta kasih, kejahatan dengan kebaikan, kekikiran dengan kemurahan, dan kebohongan dengan kebenaran."),
	("Dhammapada 251", "Tak ada api seperti nafsu, tak ada cengkeraman seperti kebencian, tak ada jaring seperti kebodohan, tak ada arus seperti keinginan."),
	("Dhammapada 276", "Engkau sendiri yang harus berusaha; para Buddha hanya menunjukkan jalan."),
	("Dhammapada 222", "Ia yang menahan kemarahan yang meletup bagai kusir mengendalikan kereta yang oleng — dialah pengendali sejati; yang lain hanya memegang tali kekang."),
	("Dhammapada 90", "Bagi ia yang telah menyelesaikan perjalanan, bebas dari duka dan segala ikatan, tak ada lagi panasnya nafsu."),
]


def pick_index(date_str, n):
	"""Deterministic index in [0, n) from a date string. No RNG -> concurrent
	workers agree and the cache write is idempotent."""
	h = hashlib.sha1(date_str.encode()).hexdigest()
	return int(h, 16) % n


def strip_html(text):
	"""Remove HTML/footnote tags (including <sup> content) and collapse whitespace."""
	if not text:
		return ""
	# ponytail: strip <sup> with its inner text (quran.com footnote numbers)
	text = re.sub(r"<sup\b[^>]*>.*?</sup>", "", text, flags=re.DOTALL)
	text = re.sub(r"<[^>]+>", "", text)
	return re.sub(r"\s+", " ", text).strip()


def _fetch_islam(date_str):
	"""quran.com v4: a random verse with the Indonesian (Kemenag, id 33)
	translation. Cached once/day, so 'random' is stable for the day."""
	r = requests.get(
		"https://api.quran.com/api/v4/verses/random",
		params={"language": "id", "translations": "33", "fields": "verse_key"},
		timeout=_TIMEOUT,
	)
	r.raise_for_status()
	v = r.json()["verse"]
	text = strip_html(v["translations"][0]["text"])
	return {"reference": f"QS {v['verse_key']}", "text": text, "source": "quran.com"}


def _fetch_bible(date_str):
	"""Pick a well-known verse by date, fetch its Terjemahan Baru text from
	bolls.life. Shared by Kristen + Katolik."""
	label, book, chapter, verse = BIBLE_VERSES[pick_index(date_str, len(BIBLE_VERSES))]
	r = requests.get(
		f"https://bolls.life/get-verse/TB/{book}/{chapter}/{verse}/",
		timeout=_TIMEOUT,
	)
	r.raise_for_status()
	text = strip_html(r.json().get("text", ""))
	return {"reference": label, "text": text, "source": "bolls.life"}


def _fetch_gita(date_str):
	"""Pick a curated Bhagavad Gita verse by date. No network -> cannot fail."""
	ref, text = GITA[pick_index(date_str, len(GITA))]
	return {"reference": ref, "text": text, "source": "Bhagawadgita"}


def _fetch_dhammapada(date_str):
	"""Pick a curated Dhammapada verse by date. No network -> cannot fail."""
	ref, text = DHAMMAPADA[pick_index(date_str, len(DHAMMAPADA))]
	return {"reference": ref, "text": text, "source": "Dhammapada"}


def _fetch(religion, date_str):
	if religion == "Islam":
		return _fetch_islam(date_str)
	if religion == "Hindu":
		return _fetch_gita(date_str)
	if religion == "Buddha":
		return _fetch_dhammapada(date_str)
	# Kristen + Katolik share the Bible.
	return _fetch_bible(date_str)


@frappe.whitelist()
def get_daily_verse():
	"""Return today's verse {reference, text} for the caller, or None when the
	feature is off, the religion is unsupported, or the fetch fails."""
	user = frappe.session.user
	if user == "Guest":
		return None

	prof = frappe.db.get_value(
		"Employee Profile", {"user": user}, ["religion", "verse_enabled"], as_dict=True
	)
	if not prof or not prof.verse_enabled:
		return None
	religion = prof.religion
	if religion not in SUPPORTED:
		return None

	today = frappe.utils.today()
	name = f"{religion}-{today}"

	cached = frappe.db.get_value("Daily Verse", name, ["reference", "text"], as_dict=True)
	if cached:
		return {"reference": cached.reference, "text": cached.text}

	try:
		data = _fetch(religion, today)
	except Exception:
		# Transient outage: log and show nothing. Not cached -> retries next request.
		frappe.log_error(title="Daily Verse fetch failed", message=frappe.get_traceback())
		return None

	if not data.get("text"):
		return None

	try:
		frappe.get_doc(
			{
				"doctype": "Daily Verse",
				"religion": religion,
				"verse_date": today,
				"reference": data["reference"],
				"text": data["text"],
				"source": data["source"],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	except frappe.exceptions.DuplicateEntryError:
		# Another request won the race for today; use its row.
		row = frappe.db.get_value("Daily Verse", name, ["reference", "text"], as_dict=True)
		if row:
			return {"reference": row.reference, "text": row.text}

	return {"reference": data["reference"], "text": data["text"]}
