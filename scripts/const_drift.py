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
maps with identical keys but different VALUES (the papan-iklan TYPE_LABEL
case, a confirmed real drift on this fleet) are invisible to it, so a clean
run means no KEY drift, not no drift.
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

def top_level_keys(body):
    out = []
    for seg in split_top_level(body):
        m = KEY.match(seg)
        if m: out.append(m.group(1))
    return sorted(set(out))

defs = defaultdict(list)
for root in ROOTS:
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("node_modules", "dist")]
        for f in fn:
            if not f.endswith((".ts", ".tsx")): continue
            p = os.path.join(dp, f)
            src = io.open(p, encoding="utf-8", errors="replace").read()
            for m in DECL.finditer(src):
                keys = top_level_keys(literal_body(src, src.index("{", m.end() - 1)))
                if len(keys) >= 2:
                    defs[m.group(1)].append((p, tuple(keys)))

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
print(f"\nDRIFT CANDIDATES: {n}")
