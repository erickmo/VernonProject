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

DISC_AXES = ("D", "I", "S", "C")
BIGFIVE_TRAITS = ("O", "C", "E", "A", "N")

# --- DISC: forced-choice. Each item = 4 words, one per axis. Applicant picks
#     the word MOST like them and the word LEAST like them. (Seed — Task 2 fills to ~28.)
DISC_ITEMS = [
    {"id": "d1", "words": [
        {"text": "Tegas", "axis": "D"}, {"text": "Ceria", "axis": "I"},
        {"text": "Sabar", "axis": "S"}, {"text": "Teliti", "axis": "C"}]},
    {"id": "d2", "words": [
        {"text": "Berani ambil keputusan", "axis": "D"}, {"text": "Suka bergaul", "axis": "I"},
        {"text": "Setia mendukung", "axis": "S"}, {"text": "Cermat", "axis": "C"}]},
    {"id": "d3", "words": [
        {"text": "Kompetitif", "axis": "D"}, {"text": "Antusias", "axis": "I"},
        {"text": "Tenang", "axis": "S"}, {"text": "Analitis", "axis": "C"}]},
]

# --- Big Five / OCEAN: Likert 1-5. `reverse` items are reverse-scored.
BIGFIVE_ITEMS = [
    {"id": "o1", "text": "Saya suka mencoba hal-hal baru.", "trait": "O", "reverse": False},
    {"id": "c1", "text": "Saya selalu menyelesaikan pekerjaan tepat waktu.", "trait": "C", "reverse": False},
    {"id": "e1", "text": "Saya merasa berenergi saat berada di keramaian.", "trait": "E", "reverse": False},
    {"id": "a1", "text": "Saya mudah berempati pada perasaan orang lain.", "trait": "A", "reverse": False},
    {"id": "n1", "text": "Saya jarang merasa cemas.", "trait": "N", "reverse": True},
]

# --- Logical / problem-solving: single-correct MCQ.
LOGIC_ITEMS = [
    {"id": "l1", "text": "2, 4, 6, 8, … berapa angka berikutnya?",
     "options": ["9", "10", "11", "12"], "answer": "10", "points": 1},
    {"id": "l2", "text": "Jika semua kucing adalah hewan, dan Mimi adalah kucing, maka Mimi adalah…",
     "options": ["Tumbuhan", "Hewan", "Bukan keduanya", "Tidak dapat ditentukan"],
     "answer": "Hewan", "points": 1},
]


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
             "correct_answer": it["answer"], "points": int(it.get("points") or 1)}
            for it in LOGIC_ITEMS]


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
    # Big Five: all 5s. Reverse items invert → O/C/E/A =100, N (reverse) =0
    b = score_bigfive({it["id"]: 5 for it in BIGFIVE_ITEMS})
    assert b["O"] == 100 and b["N"] == 0, b
    # fit: identical → 100, opposite → 0, blank target → distance from 50
    assert fit({"D": 80, "I": 40, "S": 20, "C": 60}, {"D": 80, "I": 40, "S": 20, "C": 60}, DISC_AXES) == 100.0
    assert fit({"D": 100, "I": 100, "S": 100, "C": 100}, {"D": 0, "I": 0, "S": 0, "C": 0}, DISC_AXES) == 0.0
    assert fit({"D": 50, "I": 50, "S": 50, "C": 50}, {}, DISC_AXES) == 100.0
    print("recruitment_instruments selfcheck ok")


if __name__ == "__main__":
    _selfcheck()
