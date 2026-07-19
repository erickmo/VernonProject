#!/usr/bin/env python3
"""Emit docs/assets/data.js (window.VP) from the code itself.

Constitution: if the code knows it, no human may type it — and every count ships
with the glob that produced it. Stdlib only, no frappe, no bench, no site: it must
run on a bare checkout, because a generator that needs a bench is a generator
nobody runs.

    python3 scripts/gen_docs.py              # regenerate
    python3 scripts/gen_docs.py --selfcheck  # numeric tripwires (see bottom)

Determinism is load-bearing: no timestamp, no SHA, sorted keys, stable order — so
`python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js` is the
entire staleness check, using git as the differ.
"""
import ast
import glob
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DT_GLOB = "vernon_project/vernon_project/doctype/*/*.json"
PY_GLOB = "vernon_project/**/*.py"
REPORT_GLOB = "vernon_project/vernon_project/report/*/*.json"

# The one hand-maintained system fact: Frappe `module` is uniformly "Vernon Project"
# for all 74 DocTypes, so this grouping exists NOWHERE in the data. span encodes real
# mass (Project core 2x2 = 11 doctypes incl. Project Todo's 79 fields; Focus 1x1 = 1).
# The generator polices this file: an unmapped or unknown DocType exits non-zero.
CLUSTERS = {
    # key: (nameId, nameEn, span, {DocType, ...})
    "project-core": ("Inti Proyek", "Project core", "2x2", {
        "Project", "Project Detail", "Project Glossary", "Project Proposal",
        "Project Team", "Project Todo", "Project Todo Allocation",
        "Project Todo Assigned Allocation", "Project Todo Dependency",
        "Scope of Work", "Glossary",
    }),
    "points": ("Poin & Penghargaan", "Points & rewards", "2x1", {
        "Point Ledger", "Group", "Group Level", "Badge Settings", "Badge Tier",
        "Marketplace Reward", "Reward Redemption", "Todo Reaction",
    }),
    "avatar": ("Avatar", "Avatar", "1x2", {
        "User Avatar", "Avatar Achievement", "Avatar Asset", "Avatar Daily",
        "Avatar Gamification Settings", "Avatar Item", "Avatar Level Reward",
        "Avatar Reward Claim", "Avatar Unlock",
    }),
    "attendance": ("Absensi", "Attendance", "2x1", {
        "Attendance Exception", "Attendance Exception Approver", "Attendance Holiday",
        "Attendance Holiday List", "Attendance Profile", "Attendance Scan",
        "Attendance Station", "Daily Attendance", "Shift Assignment", "Shift Template",
        "Leave Type",
    }),
    "lms": ("Pembelajaran", "Learning", "1x1", {
        "Course", "Course Enrollment", "Course Lesson", "Course Lesson File",
        "Course Lesson Progress",
    }),
    "hr": ("Kepegawaian", "HR", "1x1", {
        "Employee Profile", "Employee Education", "Employee Skill", "Employee Training",
    }),
    "meetings": ("Rapat & Ruangan", "Meetings & rooms", "1x1", {
        "Meeting", "Meeting Participant", "Meeting Room", "Resource Booking",
        "Resource Booking Equipment", "Equipment",
    }),
    "focus": ("Fokus", "Focus", "1x1", {"Focus Timer"}),
    "events": ("Acara", "Events", "1x1", {"Vernon Event", "Vernon Event Registration"}),
    "classifieds": ("Papan Iklan", "Classifieds", "1x1", {
        "Papan Iklan", "Papan Iklan Ban", "Papan Iklan Photo",
    }),
    "income": ("Penghasilan Tambahan", "Extra income", "1x1", {
        "Income Opportunity", "Income Opportunity Claim",
    }),
    "notes": ("Catatan", "Notes", "1x1", {
        "Personal Note", "Personal Note Item", "Personal Note Share",
        "Leader Note",
    }),
    "platform": ("Platform", "Platform", "2x1", {
        "Vernon Settings", "Vernon Notification", "Vernon Banner", "App Release",
        "Push Subscription", "User Passkey", "Daily Verse", "Company Feedback",
    }),
    "org": ("Organisasi", "Organization", "1x1", {"Brand", "Company"}),
}
OF = {dt: key for key, (_, _, _, members) in CLUSTERS.items() for dt in members}


def count(n, frm):
    return {"n": n, "from": frm}


def read_doctypes():
    """Parsed, never counted: listdir and os.walk both count __init__.py and whatever
    __pycache__ litter the last run left (76 and 150 on a used bench, 75 and 75 on a
    fresh clone). Only the glob is env-independent, and it gives 74."""
    out = []
    for f in sorted(glob.glob(str(ROOT / DT_GLOB))):
        d = json.loads(Path(f).read_text())
        if d.get("doctype") != "DocType":
            continue
        py = Path(f).with_suffix(".py")
        out.append({
            "name": d["name"],
            "cluster": OF.get(d["name"], ""),
            "istable": int(d.get("istable") or 0),
            "issingle": int(d.get("issingle") or 0),
            "description": (d.get("description") or "").strip(),
            "controllerBytes": py.stat().st_size if py.exists() else 0,
            "fields": [{
                "fieldname": fl.get("fieldname", ""),
                "fieldtype": fl.get("fieldtype", ""),
                "options": fl.get("options", "") or "",
                "reqd": int(fl.get("reqd") or 0),
                "default": fl.get("default", "") if fl.get("default") is not None else "",
                "description": (fl.get("description") or "").strip(),
            } for fl in d.get("fields", [])],
        })
    return sorted(out, key=lambda x: x["name"])


def check_clusters(doctypes):
    on_disk = {d["name"] for d in doctypes}
    mapped = set(OF)
    if unmapped := on_disk - mapped:
        sys.exit(f"gen_docs: {len(unmapped)} DocType tidak ada di CLUSTERS — tambahkan di "
                 f"scripts/gen_docs.py:\n  " + "\n  ".join(sorted(unmapped)))
    if unknown := mapped - on_disk:
        sys.exit(f"gen_docs: {len(unknown)} nama di CLUSTERS bukan DocType (dihapus/typo?):\n  "
                 + "\n  ".join(sorted(unknown)))


def read_endpoints():
    """`api/*.py` yields 184 and silently drops the 2 whitelists in the Project /
    Project Todo controllers. Walk every .py instead."""
    out = []
    for f in sorted(glob.glob(str(ROOT / PY_GLOB), recursive=True)):
        rel = Path(f).relative_to(ROOT)
        if rel.name.startswith("test_") or "tests" in rel.parts:
            continue
        module = str(rel.with_suffix("")).replace(os.sep, ".")
        for fn in ast.walk(ast.parse(Path(f).read_text())):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not any("whitelist" in ast.unparse(d) for d in fn.decorator_list):
                continue
            a = fn.args
            names = [x.arg for x in a.posonlyargs + a.args]
            names += ["*" + a.vararg.arg] if a.vararg else []
            names += [x.arg for x in a.kwonlyargs]
            names += ["**" + a.kwarg.arg] if a.kwarg else []
            doc = ast.get_docstring(fn) or ""
            out.append({"module": module, "name": fn.name, "args": names,
                        "doc": doc.strip().split("\n")[0].strip()})
    return sorted(out, key=lambda x: (x["module"], x["name"]))


# hooks.py holds two kinds of module-level literal: app *metadata* (identity strings and
# asset paths Frappe reads for its own desk/web/webform pages) and *wiring* (handlers
# Frappe calls into). Only wiring belongs under #wiring — so this is a DENY list of the
# former, never an ALLOW list of the latter.
#
# Why the direction matters: an allowlist is a human typing the hook key set, and a human
# typing a key set is exactly how `page_renderer` — the hook that gates this very docs
# site — went undocumented, the same defect as the hard-coded scheduler "daily". With a
# denylist a NEW hook documents itself and only a new *metadata* key needs a human. The
# two failure modes are not symmetric, which is the whole argument: a missed hook is a
# silent hole (invisible to `git diff`, the drift oracle), while a missed metadata key is
# a visible junk row in the wiring table that the next regen puts in the diff. Prefer the
# failure that shows up.
#
# Listed here: every metadata key this hooks.py declares or carries commented-out ready to
# be uncommented — the realistic next edit. Speculative keys are deliberately absent; an
# unknown one surfacing as a junk row is the self-correcting failure described above.
METADATA_HOOKS = {
    # Identity — prose about the app, not a handler.
    "app_name", "app_title", "app_publisher", "app_description", "app_email", "app_license",
    # Asset paths injected into Frappe's own pages; wiring for the desk, not for this app.
    "app_include_js", "app_include_css", "app_include_icons",
    "web_include_js", "web_include_css",
    "webform_include_js", "webform_include_css", "website_theme_scss",
}


def hook_rows(v):
    """Any un-shaped hook literal → rows renderWiring can draw: a list of strings (one
    'handler' column) or a list of uniform dicts (its own keys as columns).

    ponytail: str/list/dict-of-str only — the shapes hooks.py actually uses. A future
    dict-of-dict (doc_events' shape) would render its leaf as [object Object]; give it an
    entry in `shaped` below, which is what that map is for. Deliberately not a recursive
    flattener: nesting has no non-colliding generic column names, and guessing them is
    the hand-typing this function exists to delete."""
    if isinstance(v, str):
        return [v]
    if isinstance(v, dict):
        return [{"key": k, "handler": h} for k, h in sorted(v.items())]
    return list(v)


def read_hooks():
    """Module-level literals only — never exec hooks.py."""
    lit = {}
    for n in ast.parse((ROOT / "vernon_project/hooks.py").read_text()).body:
        if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name):
            try:
                lit[n.targets[0].id] = ast.literal_eval(n.value)
            except ValueError:
                pass  # ponytail: non-literal hooks are ignored; none exist today.
    pairs = lambda k, a, b: [{a: d, b: h} for d, h in sorted(lit.get(k, {}).items())]
    # Every group, not just "daily": a Frappe group value is a list (daily/hourly/
    # weekly/…) or, for "cron", a dict of cron-expr → list. Hard-coding "daily" dropped
    # the rest silently — and a silent drop is invisible to `git diff`, the drift oracle.
    sched = lit.get("scheduler_events", {})
    # Hooks whose literal needs flattening or earns a real column name. NOT a gate: a hook
    # absent here still ships, via hook_rows. Keys are the real hook names — the section
    # heading is now the string a reader greps hooks.py for, so no alias can drift from it.
    shaped = {
        "doc_events": [{"doctype": dt, "event": ev, "handler": h}
                       for dt, evs in sorted(lit.get("doc_events", {}).items())
                       for ev, h in sorted(evs.items())],
        "scheduler_events": [{"group": g if isinstance(v, list) else f"{g} {c}", "handler": h}
                             for g, v in sorted(sched.items())
                             for c, hs in (sorted(v.items()) if isinstance(v, dict) else [(None, v)])
                             for h in hs],
        "permission_query_conditions": pairs("permission_query_conditions", "doctype", "handler"),
        "has_permission": pairs("has_permission", "doctype", "handler"),
    }
    # Driven by what hooks.py declares, minus metadata. json.dumps(sort_keys=True) orders
    # the sections, so no sort is needed here to stay deterministic.
    return {k: shaped[k] if k in shaped else hook_rows(v)
            for k, v in lit.items() if k not in METADATA_HOOKS}


def read_reports():
    out = []
    for f in sorted(glob.glob(str(ROOT / REPORT_GLOB))):
        d = json.loads(Path(f).read_text())
        out.append({"name": d.get("name", ""), "report_type": d.get("report_type", ""),
                    "ref_doctype": d.get("ref_doctype", "")})
    return sorted(out, key=lambda x: x["name"])


NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+?)(-design)?\.md$")


def read_devlog():
    """Filenames are rigid: YYYY-MM-DD-slug[-design].md. Index only — never render,
    never summarize, never status. A dated past-tense row cannot rot."""
    rows = []
    for kind, sub in (("spec", "specs"), ("plan", "plans")):
        for f in sorted(glob.glob(str(ROOT / f"docs/superpowers/{sub}/*.md"))):
            p = Path(f)
            m = NAME_RE.match(p.name)
            if not m:
                sys.exit(f"gen_docs: nama file dev log tidak sesuai YYYY-MM-DD-slug[-design].md: {p.name}")
            txt = p.read_text()
            h1 = re.search(r"^#\s+(.+)$", txt, re.M)
            body = re.split(r"^#", txt.split("\n##", 1)[1], flags=re.M)[0] if "\n##" in txt else ""
            blurb = " ".join(body.split("\n", 1)[-1].split())
            rows.append({
                "date": m.group(1), "slug": m.group(2), "kind": kind,
                "title": h1.group(1).strip() if h1 else m.group(2),
                "href": f"superpowers/{sub}/{p.name}",
                "pairHref": "",
                "blurb": blurb[:200].rstrip() + ("…" if len(blurb) > 200 else ""),
            })
    by_slug = {}
    for r in rows:
        by_slug.setdefault(r["slug"], {})[r["kind"]] = r["href"]
    for r in rows:
        r["pairHref"] = by_slug[r["slug"]].get("plan" if r["kind"] == "spec" else "spec", "")
    return sorted(rows, key=lambda r: (r["date"], r["slug"], r["kind"]), reverse=True)


def build():
    doctypes = read_doctypes()
    check_clusters(doctypes)
    endpoints, devlog = read_endpoints(), read_devlog()
    reports, hooks = read_reports(), read_hooks()
    fields = [f for d in doctypes for f in d["fields"]]
    modules = sorted({e["module"] for e in endpoints})
    fld = lambda dt: sum(len(d["fields"]) for d in doctypes if d["cluster"] == dt)

    clusters = [{
        "key": k, "nameId": nid, "nameEn": nen, "span": span,
        "doctypes": sorted(m), "fieldCount": fld(k),
        "controllerBytes": sum(d["controllerBytes"] for d in doctypes if d["cluster"] == k),
    } for k, (nid, nen, span, m) in CLUSTERS.items()]

    per_mod = [{"module": m,
                "have": sum(1 for e in endpoints if e["module"] == m and e["doc"]),
                "total": sum(1 for e in endpoints if e["module"] == m)} for m in modules]
    # `from` is a pure path/glob/predicate expression — identifiers only, never prose.
    # app.js renders it after a bilingual "dari "/"from " prefix but the string itself is
    # untagged, so one Bahasa word here reaches every English reader untranslated (and
    # vice versa). The nuance lives in these comments, not in the rendered string:
    # !test_* !tests/ are read_endpoints' two skips; @*whitelist* is its substring match
    # on the decorator source; distinct(module) is the set the module count is taken over.
    dt_from = f'{DT_GLOB} · doctype=="DocType"'
    py_from = f"{PY_GLOB} !test_* !tests/"
    return {
        "counts": {
            "doctypes": count(len(doctypes), dt_from),
            "fields": count(len(fields), f"{dt_from} · fields[]"),
            "endpoints": count(len(endpoints), f"{py_from} · @*whitelist*"),
            "modules": count(len(modules), f"{py_from} · @*whitelist* · distinct(module)"),
            "reports": count(len(reports), REPORT_GLOB),
            "devlogs": count(len(devlog), "docs/superpowers/{specs,plans}/*.md"),
            "specs": count(sum(1 for r in devlog if r["kind"] == "spec"), "docs/superpowers/specs/*.md"),
            "plans": count(sum(1 for r in devlog if r["kind"] == "plan"), "docs/superpowers/plans/*.md"),
            "clusters": count(len(CLUSTERS), "scripts/gen_docs.py · CLUSTERS"),
        },
        "clusters": clusters,
        "doctypes": [{k: v for k, v in d.items() if k != "description"} for d in doctypes],
        "links": [[d["name"], f["fieldname"], f["options"]] for d in doctypes
                  for f in d["fields"] if f["fieldtype"] == "Link" and f["options"]],
        "endpoints": endpoints,
        "hooks": hooks,
        "reports": reports,
        "devlog": devlog,
        "coverage": {
            "doctypeDescriptions": {"have": sum(1 for d in doctypes if d["description"]),
                                    "total": len(doctypes)},
            "fieldDescriptions": {"have": sum(1 for f in fields if f["description"]),
                                  "total": len(fields)},
            "docstrings": {"have": sum(1 for e in endpoints if e["doc"]), "total": len(endpoints)},
            "byModule": per_mod,
        },
    }


def write():
    vp = build()
    out = ROOT / "docs/assets/data.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    # .js assigning a global, not .json: fetch() is CORS-blocked on file://.
    out.write_text("window.VP = " + json.dumps(vp, sort_keys=True, ensure_ascii=False) + ";\n")
    return vp, out


def selfcheck(vp):
    """Tripwires for the exact mistakes four expert agents actually made. Numbers are
    expectations, not truth — they are asserted only here, never in the generate path,
    so a real DocType #75 shows up as a git diff (the drift oracle) instead of a crash.
    """
    assert vp["counts"]["doctypes"]["n"] == 74, vp["counts"]["doctypes"]
    # ponytail: the listdir/os.walk traps are described in read_doctypes, not asserted
    # here — their counts move with __pycache__ litter, so asserting them fails on the
    # bare checkout this generator promises to run on. This is the env-independent one.
    assert len(glob.glob(str(ROOT / DT_GLOB))) == 74, "doctype json glob moved"
    seen = [c for d in vp["doctypes"] for c in [d["cluster"]] if c]
    assert len(seen) == 74 and sum(len(c["doctypes"]) for c in vp["clusters"]) == 74, "cluster gap/dupe"
    mods = {e["module"] for e in vp["endpoints"]}
    for m in ("vernon_project.vernon_project.doctype.project.project",
              "vernon_project.vernon_project.doctype.project_todo.project_todo"):
        assert m in mods, f"endpoint glob dropped {m} — naive api/*.py bug"
    assert vp["counts"]["fields"]["n"] == 601, vp["counts"]["fields"]
    # 149 (80 specs) was true until 2026-07-15-docs-site-rebuild-design.md — this very
    # rebuild's own spec — landed in 874178e, making it 150/81. A hand-typed count that
    # rotted inside one commit; the reason this file exists.
    assert vp["counts"]["devlogs"]["n"] == 150, vp["counts"]["devlogs"]
    assert vp["counts"]["devlogs"]["n"] == vp["counts"]["specs"]["n"] + vp["counts"]["plans"]["n"]
    assert all(r["title"] and r["date"] for r in vp["devlog"]), "devlog parse gap"
    # read_hooks emitted a hand-typed 7-key set and so left out page_renderer — the hook
    # that gates this very docs site. Re-read hooks.py with an INDEPENDENT reader (regex,
    # not the ast the generator uses) and diff the key sets: an allowlist creeping back
    # fails here for every hook, not just today's straggler. Catches the other silent drop
    # too — a non-literal hook that read_hooks' `except ValueError` swallows.
    declared = set(re.findall(r"^(\w+)\s*=", (ROOT / "vernon_project/hooks.py").read_text(), re.M))
    assert declared - METADATA_HOOKS == set(vp["hooks"]), \
        f"hooks.py declares wiring the docs drop: {declared - METADATA_HOOKS - set(vp['hooks'])}"
    # The diff above has one blind spot: a wiring hook wrongly added to METADATA_HOOKS drops out
    # of BOTH sides, so it vanishes from the docs and the assert still passes. Name the hooks that
    # must never disappear. Hand-typing is correct here — a tripwire is a human's declared
    # expectation, not data the site renders. Failing here means: check METADATA_HOOKS.
    for must in ("page_renderer", "doc_events", "scheduler_events", "after_request",
                 "permission_query_conditions", "has_permission", "website_route_rules"):
        assert must in vp["hooks"], f"{must} is declared in hooks.py but missing from the docs"
    print(f"selfcheck OK — 74 doctypes / {vp['counts']['fields']['n']} fields / "
          f"{vp['counts']['endpoints']['n']} endpoints / {vp['counts']['devlogs']['n']} devlogs / "
          f"{len(vp['hooks'])} hooks")


if __name__ == "__main__":
    vp, out = write()
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes")
    if "--selfcheck" in sys.argv:
        selfcheck(vp)
