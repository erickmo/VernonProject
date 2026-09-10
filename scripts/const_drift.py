"""Object literals defined more than once across the two frontends, key sets diffed.

Targets the class that shipped two production bugs on 2026-09-10: a shared-shape
constant copy-pasted per app or per caller, where one copy goes stale. The teguran
deep-link bug was exactly this — ROUTES existed four times, and the two copies in
Today.tsx (/m) and Home.tsx (/w) were missing the `teguran` key, so deepLink
returned undefined and the recipient of a warning could not reach their own list.

    python3 scripts/const_drift.py                        # both frontends
    python3 scripts/const_drift.py path/to/tree ...       # any tree

Validated by pointing it at a pre-fix tree (`git archive <ref> frontend/src
frontend-web/src | tar -x -C /tmp/x`) — it rediscovers ROUTES with no hints. Use
git archive for that, never `git checkout <ref> -- .` in a live worktree.

A differing key set is a CANDIDATE, not a finding: check the consumer before
reporting. Two false positives were retracted on the first run because these
literals are often written several keys per line. Known limits: matches consts by
NAME (a drifted pair under two names is missed); the key regex skips quoted keys
containing spaces; covers const-bound object literals only — not inline props,
Map/Set, or TS union types. And it diffs KEY SETS ONLY — two duplicated
maps with identical keys but different VALUES are invisible to MODE 1, so a
clean mode-1 run means no KEY drift, not no drift. MODE 2 below covers that.

MODE 2 (value drift) exists because of what the papan-iklan case actually was.
Note for anyone re-deriving it: TYPE_LABEL — the same-NAMED pair — was byte
identical. The real drift was TYPE_TONE (mobile) vs TYPE_TINT (web): the same
concept under DIFFERENT const names, so matching by name never compares them.
Mode 2 therefore groups literals by their KEY-SET SHAPE and ignores the name,
then compares the tailwind COLOUR FAMILY per key (emerald/sky/violet), not the
intensity — intensity legitimately differs between mobile Soft-Pop and web
bento, the family does not. Validated on 59caf58~1, where it rediscovers Rent
being amber on /m and violet on /w with no hints.
"""
import os, re, io, sys
from collections import defaultdict

ROOTS = sys.argv[1:] or ["frontend/src", "frontend-web/src"]
DECL = re.compile(r"(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*(?::\s*[^=]+?)?=\s*\{")

def literal_body(src, open_idx):
    depth, i, n = 0, open_idx, len(src)
    while i < n:
        c = src[i]
        if c in "'\"`":
            q = c; i += 1
            while i < n and src[i] != q:
                i += 2 if src[i] == "\\" else 1
        elif c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
            if depth == 0 and c == "}":
                return src[open_idx + 1:i]
        i += 1
    return ""

def split_top_level(body):
    """Split on commas at nesting depth 0, skipping strings."""
    parts, buf, depth, i, n = [], [], 0, 0, len(body)
    while i < n:
        c = body[i]
        if c in "'\"`":
            q = c; buf.append(c); i += 1
            while i < n and body[i] != q:
                if body[i] == "\\": buf.append(body[i]); i += 1
                buf.append(body[i]); i += 1
            buf.append(q if i < n else "")
        elif c in "{[(":
            depth += 1; buf.append(c)
        elif c in "}])":
            depth -= 1; buf.append(c)
        elif c == "," and depth == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(c)
        i += 1
    parts.append("".join(buf))
    return parts

KEY = re.compile(r"^\s*(?://.*\n\s*)*\[?['\"]?([A-Za-z_$][\w$]*)['\"]?\]?\s*:")

PAIR = re.compile(r"^\s*(?://.*\n\s*)*\[?['\"]?([A-Za-z_$][\w$ /'-]*?)['\"]?\]?\s*:\s*(.*)$", re.S)
# tailwind colour family: bg-emerald-50, dark:text-sky-400, ...
FAMILY = re.compile(r"(?:^|[\s:])(?:bg|text|border|ring|from|to)-([a-z]+)-\d{2,3}")

def top_level_keys(body):
    out = []
    for seg in split_top_level(body):
        m = KEY.match(seg)
        if m: out.append(m.group(1))
    return sorted(set(out))

def top_level_pairs(body):
    out = {}
    for seg in split_top_level(body):
        m = PAIR.match(seg)
        if m: out[m.group(1).strip()] = m.group(2).strip()
    return out

defs = defaultdict(list)
LITERALS = []   # (path, const name, {key: value}) — mode 2 works off this
for root in ROOTS:
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("node_modules", "dist")]
        for f in fn:
            if not f.endswith((".ts", ".tsx")): continue
            p = os.path.join(dp, f)
            src = io.open(p, encoding="utf-8", errors="replace").read()
            for m in DECL.finditer(src):
                body = literal_body(src, src.index("{", m.end() - 1))
                keys = top_level_keys(body)
                if len(keys) >= 2:
                    defs[m.group(1)].append((p, tuple(keys)))
                kv = top_level_pairs(body)
                if len(kv) >= 2:
                    LITERALS.append((p, m.group(1), kv))

total = sum(len(v) for v in defs.values())
print(f"object-literal consts: {total}, distinct names: {len(defs)}, duplicated names: {sum(1 for v in defs.values() if len(v)>1)}")
n = 0
for name, copies in sorted(defs.items()):
    if len(copies) < 2: continue
    shapes = {k for _, k in copies}
    if len(shapes) == 1: continue
    allk = set().union(*[set(s) for s in shapes])
    common = set.intersection(*[set(s) for s in shapes])
    if len(common) < 2: continue
    n += 1
    print(f"\n  {name}   (union {len(allk)} keys, shared {len(common)})")
    for p, k in copies:
        miss = sorted(allk - set(k))
        print(f"    {p}\n      keys={len(k)}  MISSING: {miss if miss else '-'}")
print(f"\nMODE 1 (key drift) CANDIDATES: {n}")

# ---- MODE 2: value drift across literals sharing a KEY SET, name ignored -----
shapes = defaultdict(list)
for p_, name, kv in LITERALS:
    shapes[tuple(sorted(kv))].append((p_, name, kv))

print("\n" + "=" * 70)
print("MODE 2 — value drift: same key set, different colour family per key")
found = 0
for shape, members in sorted(shapes.items()):
    if len(members) < 2 or len({p_ for p_, _, _ in members}) < 2:
        continue
    for key in shape:
        fams = {}
        for p_, name, kv in members:
            f = FAMILY.findall(kv.get(key, ""))
            if f: fams[(p_, name)] = f[0]
        if len(set(fams.values())) > 1:
            found += 1
            print(f"\n  key '{key}' differs across maps over {list(shape)}")
            for (p_, name), fam in sorted(fams.items()):
                print(f"      {fam:10} {name:16} {p_}")
print(f"\nMODE 2 (value drift) CANDIDATES: {found}")
