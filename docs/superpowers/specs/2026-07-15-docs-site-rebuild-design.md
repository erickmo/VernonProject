# Docs site rebuild — VernonProject

Status: Approved (design)
Date: 2026-07-15

## Problem

`docs/` held a hand-authored 10-page static site, born fully formed in one commit (`e5f430f`,
2026-06-16), last touched 2026-06-21. HEAD is now 2026-07-15. It rotted into wrongness in 31 days:

- `docs/index.html:77-79` shipped a stat row reading **14 DocTypes / 5 Reports / 4 API endpoints**.
  Verified truth: **74 / 5 / 186**.
- `docs/README.md` and `docs/ERD.md` both asserted "all 14 DocTypes" / "the four whitelisted endpoints".
- `docs/assets/search-index.js` opened with `/* Auto-generated search index. */` — **no generator
  existed anywhere in the repo**. `scripts/` contained only `vapid_keygen.py`. The provenance claim
  was false, which is precisely why nothing ever regenerated it.

It rotted because **a human typed facts the code already knew**, and because a bare integer with no
glob attached is unfalsifiable — no reader can tell what `14` counts, so no reader can catch it.

### The security half (found during design, fixed 2026-07-15)

`vernon_project/public/docs -> ../../docs` was a **committed symlink** into the app's public dir, and
`hooks.py:38` redirected `/docs/?` to it. nginx serves `/assets` as static files, so **Frappe auth
never ran on that path**. Verified unauthenticated before the fix:

```
GET /docs                                                          -> 301 -> /assets/vernon_project/docs/index.html -> 200 ("14 DocTypes")
GET /assets/vernon_project/docs/superpowers/specs/2026-07-15-cuti-hr-final-approval-design.md -> 200
```

The symlink published not just the stale HTML but **all of `docs/superpowers/` — 149 internal design
documents (~370K words)** — to the open internet. This was a pre-existing leak, not one introduced by
this work.

## Goal

Four static pages under `docs/`, entry `docs/index.html`, title **VernonProject**, bento grid, light
theme, indigo. Bilingual: Bahasa Indonesia default, English toggle. No build step, no npm, no CDN.
Governed by one constitution:

> **If the code knows it, no human may type it — and every count ships with the glob that produced it.**

## Non-goals

- Not a tutorial/installation page (`bench get-app` is Frappe-generic; the old one rotted anyway).
- Not a changelog page. App Release rows are the release surface per CLAUDE.md; link, never mirror.
- Not per-DocType pages (68/74 have zero field descriptions; 57/74 controllers are <400B stubs).
- Not hand-writing the 555 missing field descriptions — those belong in the DocType JSON `description`,
  where Frappe also renders them in the Desk form. One edit, two surfaces.
- Not a public docs site. See Decisions.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Every fact renders from `docs/assets/data.js`** (`window.VP`), emitted by `scripts/gen_docs.py`. Zero integers in HTML source. | The stat row that shipped `14` becomes the one place a wrong count is structurally unrepresentable. |
| 2 | **Every count is `{n, from:"<glob>"}`** and renders with its glob: `186 endpoint · dari vernon_project/**/*.py, kecuali test_*`. | Four expert agents surveying one repo produced 184/186, 126/127, 2810/2879, 75/76/150 — all writing "verified". Every conflict but one was a *scope ambiguity*, not arithmetic. A bare integer is uncatchable. |
| 3 | **`data.js` is deterministic** — no timestamp, no git SHA, sorted keys. | Makes `python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js` a complete drift oracle in **zero** new lines, using git as the differ. |
| 4 | **No freshness banner of any kind.** | `version.json.buildId` is stamped by the vite build, not HEAD → *anti*-correlated (screams STALE at fresh docs). A 30-day badge is *un*correlated (green through the week twelve DocTypes land — the actual 2026-06-21 death). A golden-file test is red on every commit. All three engineer in the banner-blindness they claim to prevent. |
| 5 | **One line in CLAUDE.md**, beside the What's New rule: *"Added/removed a DocType, endpoint, or hook? Run `python3 scripts/gen_docs.py`."* | A CLAUDE.md rule is the **only** documentation discipline in this repo that has ever held (What's New: 10/10 rows, newest = HEAD). Every artifact without one rotted: the docs site, `CHANGELOG.md`, `changelog.html`, `docs/README.md`, `MOBILE_APP.md`. |
| 6 | **Reuse `styles.css` + `app.js`; do not rewrite.** `--brand:#6d5efc` is already indigo, `:root` is already light. | The requested theme is a *subset* of the existing 510-line token system + ~20 lines of grid. The design system is a deletion. |
| 7 | **Bilingual = `<span lang="id">`/`<span lang="en">` + one CSS rule + `data-lang` on `<html>`.** The toggle is `app.js:8-21` **renamed** (`vp-theme`→`vp-lang`, `data-theme`→`data-lang`). | Zero net lines. The unrequested dark theme dies in the same find-replace, going unreachable at zero cost. |
| 8 | **Untagged text renders in BOTH languages.** Generator emits zero `lang` attributes. | The lazy path is the safe path: a forgotten translation degrades to "shown twice", never to a silent gap. Compliance-by-default is the only kind that survives 5pm. |
| 9 | **Generated reference is never translated.** | `fieldname`, `Datetime`, `get_app_releases` are identifiers, not English. Translating them breaks grep — the whole point of a reference. This bounds the bilingual surface to ~40 `<span lang>` pairs / ~1,500 words. |
| 10 | **Dev logs: index them, generated from filenames. Never render, never summarize, never status.** | See Dev logs below. |
| 11 | **`/docs` is login-gated via a www controller.** The symlink is deleted. | nginx serves `/assets` without auth — that *is* the leak. A login check cannot be bolted onto that path. |
| 12 | **Nothing from CLAUDE.md or `~/.claude/memory` enters `docs/`.** | Publishing the deploy matrix would publish the Cloudflare zone id and token path. And CLAUDE.md is authoritative *because* the agent reads it every session; an HTML copy is a second truth against the only truth that works. |
| 13 | **Delete Cmd-K search + `search-index.js`.** | Nobody asked for it. At 4 pages, one scoped `<input oninput>` filter beats a global overlay plus a generated index. Making a lie true is more code than deleting it. |
| 14 | **`CHANGELOG.md` stays.** | CLAUDE.md says leave it alone unless explicitly asked. Overrides the panel's delete recommendation. |

## Architecture

### Pages (4)

| Page | Shape | Audience | Source of truth |
|---|---|---|---|
| `docs/index.html` | hub — **the only bento on the site** | everyone, 5s | generated |
| `docs/system.html` | reference | dev / maintainer / agent | 100% generated |
| `docs/development.html` | explanation | dev / reviewer | handwritten |
| `docs/development.html#log` | log | dev / archaeologist | generated |
| `docs/user.html` | how-to | staff, Bahasa, non-technical | handwritten |

**`index.html`** — `<title>VernonProject</title>`. Three category tiles (Pengembangan / Sistem /
Pengguna), a stat row, and a 14-cluster mosaic whose tile spans encode **real mass** from generated
data: Project core 2×2 (11 doctypes incl. Project Todo at 79 fields / 30,843-byte controller — bigger
than the next four combined); Focus 1×1. Equal tiles would be a lie about where complexity lives, told
in CSS. "Apa yang baru" deep-links to the in-app What's New; never mirrors it.

**`system.html`** — zero prose, six anchors, one filter input, dense tables. Deliberately **not**
bento: 74 rows / 601 fields / 186 endpoints are tables, and tiling them destroys column-scanning,
which is the only thing that makes reference work at 2am. Anchors: `#doctypes` (74, parsed not counted;
child=22 / single=3), `#erd` (Link graph as a generated adjacency table — no drawing, no lib),
`#api` (186 grouped by module; `mobile.py`'s 89-in-258KB *is* the information), `#wiring` (5 doc_events,
5 daily scheduler jobs, 10 permission_query_conditions + 10 has_permission, 2 route rules, 2 redirects,
after_request — the thing the dead site never had), `#reports` (5, all Script Report), `#coverage`.

`#coverage` computes the site's own documentation debt: **1/74** doctype descriptions, **46/601** field
descriptions, **127/186** docstrings, `lms.py` 0/13, `passkey.py` 0/7. It is the docs site filing a bug
against the code — a backlog instead of a liability.

**`development.html`** — the only prose that cannot be recovered from code, and therefore the only prose
that earns its keep. ~10 "why" notes: why `/w` has no service worker; why `no_store_spa_shell` exists;
why lateness clocks at Done not approval; why Inbox is deliberately a non-Closed status; why score/level/
badge all derive FROM Point Ledger; why `frontend/src` is shared via `@` while `@web` is not. Plus the
Project Todo 4-stage lifecycle — the one workflow worth real prose, because it *is* the app.

Counts inside prose interpolate via `<span data-vp="stats.projectTodoFields">`, never typed. Identifiers
are named freely — a rename breaks the code first. **Ban the typing, not the mention.**

**`user.html`** — **four** task recipes (user's call; budget was 3): ajukan cuti, scan absensi, tukar
poin, kerjakan todo. Goal-level only: **describe what the USER does, never what the SYSTEM does in
response.** "Buka /m → Cuti → isi tanggal → kirim → tunggu persetujuan" survived the 2026-07-15
leader-unanimity→HR-final change untouched; "leader anda akan menyetujui" would have died in 24 hours.
"Bagaimana poin dihitung" is **refused** — it's `base_rate × est_minutes × difficulty%`, and the
taxonomy already went 78→27 in June. A formula is the trap. This is the only tier with no generator and
the highest rot velocity; four recipes is the ceiling.

### `scripts/gen_docs.py`

~150 lines + a 74-line `CLUSTERS` dict. Stdlib only (`json`, `ast`, `glob`, `pathlib`, `re`).
**No `frappe` import, no bench, no site** — runs on a bare checkout, because a generator that needs a
bench is a generator nobody runs, and that is 2026-06-21 again. Lives in `scripts/` beside
`vapid_keygen.py`, **not** in `docs/`.

- **DocTypes** — `glob("vernon_project/vernon_project/doctype/*/*.json")`, keep `d["doctype"]=="DocType"`
  → **74** (verified). Never counts directories: naive `listdir` = 76, `os.walk` = 150.
- **Link graph** — every `fieldtype=="Link"` → `[from, fieldname, to]`. That is the ERD.
- **Endpoints** — `ast.parse` over `vernon_project/**/*.py`, skip `test_*.py`/`tests/`; `FunctionDef`
  whose decorator unparses to contain `whitelist` → **186 in 21 modules** (verified). `api/*.py` yields
  184 and silently drops the 2 whitelists in `project.py`/`project_todo.py`.
- **hooks** — `ast.parse` of `hooks.py` module-level literals.
- **Reports** — `report/*/*.json`.
- **Dev log** — `docs/superpowers/{specs,plans}/*.md`: date+slug from `YYYY-MM-DD-slug[-design].md`,
  title from H1, blurb = first `##` section body truncated ~200 chars, paired by slug. 149/149 parse.
- **CLUSTERS** — the hand-maintained 14-cluster map, **inside the script beside its own assert**.
  Frappe `module` is uniformly "Vernon Project" for all 74, so the grouping exists nowhere in the data.
  **Exits non-zero on an unmapped DocType** — the generator polices the one file a human owns.
- **Self-check** — `if __name__ == "__main__"` asserts: doctype filter yields 74 (not 76/150); every
  DocType clustered; the endpoint glob sees `project.py`/`project_todo.py`.

### Serving: `vernon_project/www/docs.py` (login-gated)

Route rule `/docs/<path:app_path>` → a controller that:

1. **403s Guests** (`frappe.session.user == "Guest"` → `raise frappe.PermissionError`). This is the
   whole point; it is checked before any path handling.
2. **Path-traversal guard**: `os.path.realpath` the resolved target, assert it is inside
   `realpath(docs/)`, else 404. Symlinks are resolved, so `..` and link escapes both die.
3. **Extension allowlist**: `.html`, `.css`, `.js`, `.md` only. Nothing else is served.
4. Maps optional `.html` — **Cloudflare strips `.html` site-wide** (verified: `/foo.html` → 301 →
   `/foo`), so `/docs/system` and `/docs/system.html` must both resolve.

`app.js` picks hrefs per environment in one line (`location.protocol === 'file:' ? '.html' : ''`), so
the same pages work from `file://`, from `python3 -m http.server`, and gated at `/docs`.

### `docs/assets/app.js` (kept, edited)

Keep the 259 lines. **Delete**: the Cmd-K overlay (index is gone) and the mobile-sidebar handler (no
sidebar). **Keep free**: TOC/scroll-spy, copy buttons, highlighter. **Add**: a 4-item nav array injected
into `<header>` on every page — kills the verified 10/10 duplicated `<nav>` at any page count for ~6
lines, which was the real tax (not file count); ~3 lines of `[data-vp]` interpolation; ~3 lines of
filter input; render functions.

## Refused

- **The 69 plan bodies.** Verified **2810 `- [ ]` / 0 `- [x]`**. Publishing them shows papan iklan, cuti
  HR-approval and LMS — all live — as 100% unfinished. Born rotten on commit day, no decay period.
  Link only, behind a label: "execution script — checkboxes are not status."
- **Summaries of the 149 specs.** A lossy fork that rots against a good original.
- **A status column on any log row.** `Status:` exists in 64/149 and the checkboxes are worthless. A
  dated past-tense row **cannot rot**: "on 2026-06-28 we designed attendance QR" is true forever, at any
  HEAD, with zero maintenance. Attach a status and you've made a present-tense claim — which is exactly
  what `14 DocTypes` was.
- **`git log` merged onto the log axis.** Date-adjacency asserted as causation: 2026-07-08 alone carries
  LMS, Teman Jalan P1b and entre modules. Refusing inferred *status* then shipping an inferred
  *relationship* is a strictly larger invention.
- **GitHub blob links.** Remote is `git@github.com:erickmo/VernonProject.git` — SSH-only, personal,
  unverifiable as public. Relative `.md` hrefs work on `file://`, on `http.server`, and gated.
- **Mermaid ERD.** No lib, CDN banned → a 74-node wall of `A-->B` source text. The generated adjacency
  list was already the whole answer. `docs/erd.html` already proved a drawing rots.
- **Google Fonts.** Verified 10/10 old pages loaded `fonts.googleapis.com` under a `styles.css:3` comment
  claiming "Self-contained, no build step, offline-friendly". → `system-ui` + `ui-monospace`, zero bytes.
  Honest note: this fixes `docs/`, not `www/m.html:12-16` or `www/w.html:8-10`.

## Ship order

0. **DONE 2026-07-15** — deleted DB redirect row `5hmvdmer0a`, removed the `hooks.py` `/docs` redirect,
   `git rm` the symlink + 10 stale pages + `search-index.js` + `README.md` + `ERD.md`, `tj-restart`,
   `clear-website-cache`, CF `purge_everything`. Verified unauthenticated: internal specs 404, old pages
   404, `/docs` 404, `/m` 200, `/w` 200.
1. `scripts/gen_docs.py` + `docs/assets/data.js`.
2. The 4 pages on the existing `styles.css` / `app.js`.
3. `vernon_project/www/docs.py` + route rule; `tj-restart`; verify Guest → 403, logged-in → 200.
4. One line in `CLAUDE.md` beside the What's New rule.
5. App Release row — `/docs` returning is user-visible.

## Honest ceiling

If nobody runs `gen_docs.py`, the reference tier goes stale — **silently**, because every banner is
deleted. That is a deliberate trade: three banner designs were each anti-correlated, un-correlated, or
inert, and a warning that fires wrongly is wallpaper by month two. What carries 12 months is Decision 1:
with no hand-typed facts, stale docs are *incomplete* (missing DocType #75) rather than *wrong*
(asserting 14) — a failure mode the last site never had access to.

`ponytail: data.js is one file, est. 200-400KB. Split per-view only if it janks on a phone.`
`ponytail: dual-text, drift undetected. Fine at ~40 pairs. Past ~100, cut prose; don't add a catalog.`
