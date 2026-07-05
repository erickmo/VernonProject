# Daily Verse (Ayat Harian): per-religion daily scripture in Bahasa Indonesia.
# Only Islam/Kristen/Katolik have a Bahasa API; others get nothing (feature hidden).

import hashlib
import re

import frappe
import requests

SUPPORTED = {"Islam", "Kristen", "Katolik"}

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


def _fetch(religion, date_str):
	if religion == "Islam":
		return _fetch_islam(date_str)
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
