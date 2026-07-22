# VernonCorp Company Website — Design

**Date:** 2026-07-21
**Status:** Approved (brainstorming) — pending spec review
**Owner:** mo@intinusa.id

## 1. Purpose

A public marketing/brand website for **VernonCorp** — the company behind the Vernon
project-management + gamification app. It serves two audiences at once:

- **Company** — prospective clients, talent, partners. Goal: trust, contact, careers.
- **Product** — buyers of the Vernon app. Goal: understand the product, reach the app.

The site must be **unique**, **full of empathy** (the company's actual mission), **fully
animated**, **responsive**, and optimized for both **SEO** and **GEO** (generative /
answer-engine optimization).

## 2. Brand grounding (already in the codebase)

- **Mission:** "In the business of making people happy" (`frontend/src/lib/values.ts`)
- **Values:** Empathy · Doing what's right, not what's nice
- **Stakeholders (7):** God, Customers, Teams, Shareholders, Partners, Suppliers, Society
- **Design DNA:** Indigo brand on warm paper/cream canvas, Soft-Pop contained cards
  (`rounded-[2rem] bg-white/70 shadow-card backdrop-blur`), Familjen Grotesk (display) +
  Figtree (body), lucide / inline-SVG icons, heart motif.

The empathy angle is not bolted on — it is the company's stated reason for existing. The
site's entire concept flows from it.

## 3. Creative concept — "The circle of people we make happy"

The 7 stakeholders form a **living orbit / constellation** on the hero: warm nodes circling
the mission statement, gently animated. A recurring **"happiness meter" heart-pulse** motif
threads the site. Warm paper canvas, indigo brand, hand-drawn underline strokes, drifting
soft gradient-mesh backgrounds. Human, warm, hopeful — not corporate-sterile.

Empathy is expressed in the **experience**, not just the copy: accessibility (reduced-motion,
contrast, keyboard nav, alt text, skip-link) is framed and built as *caring for every
visitor*, including those the default web forgets.

## 4. Architecture — Frappe `www`, no build step

Chosen because server-rendered semantic HTML at real URLs is the strongest base for SEO/GEO,
needs no build toolchain, and matches the established `vernon_edubing` marketing pattern.

- **Shared base:** `vernon_project/templates/vernoncorp_base.html`
  - `<head>`: per-page SEO block (title, meta, canonical, og/twitter, hreflang), JSON-LD,
    Google Fonts (preconnect + `display=swap`), **inlined** animation CSS + JS.
  - `<body>`: skip-link, sticky nav (logo, links, lang toggle, mobile menu), `<main>` block,
    footer (sitemap links, socials, mission line).
  - **Assets are inlined** in the base — NOT served from `public/assets`. Rationale: avoids
    the Cloudflare asset-cache / stale-hash blank-page trap (see memory
    `vernon-cloudflare-asset-cache`), avoids `bench build`, keeps the site a pure edit →
    `clear-website-cache` deploy.

- **Pages** — each `www/<page>.html` (extends base) + `<page>.py` controller (lang + SEO
  context + page data). Frappe auto-routes `www/x.html` → `/x`.

| Route | File | Purpose |
|---|---|---|
| `/` | `www/index.html` + `index.py` | Home: hero (mission + stakeholder orbit) → what we do (company + product) → 3 values → stakeholder empathy map → product highlight → stats/count-ups → FAQ → CTA |
| `/about` | `www/about.html` + `about.py` | Company story, mission deep-dive, 3 values, 7 stakeholders, culture |
| `/product` | `www/product.html` + `product.py` | Vernon app: PM + gamification features (points, badges, leaderboards, focus timers, attendance, learning), "how it makes teams happy", links to `/w` `/m` |
| `/careers` | `www/careers.html` + `careers.py` | Empathy-first culture, open roles (JobPosting JSON-LD), apply CTA |
| `/contact` | `www/contact.html` + `contact.py` | Working contact form, address, socials |

`/w`, `/m`, `/docs` are untouched.

- **Root mount:** Website Settings `home_page` is currently `None`. `www/index.html` will
  serve `/` (project.vernon.id front door). No redirect config needed; confirm nothing else
  claims `/` after adding the file.

## 5. Bilingual (Bahasa Indonesia default + English)

Server-rendered per language so both languages are real crawlable content.

- **Translations:** one module `www/_i18n.py` — nested dict `STRINGS[page][key] = {"id":…, "en":…}`
  plus a `t(page, key, lang)` helper. `ponytail:` a dict + helper, not an i18n framework
  (mirrors the entre home-grown `t()` philosophy).
- **Lang selection:** controller reads `frappe.form_dict.lang`, defaults `"id"`, whitelists
  `{"id","en"}`. Passes `lang` + resolved strings into the template context.
- **SEO correctness:** each page emits `<link rel="alternate" hreflang="id" …>` /
  `hreflang="en"` / `x-default`, and a `canonical` for the current lang. `<html lang="…">`
  set per request.
- **Toggle:** nav control links to the same path with `?lang=` flipped.
- **Tradeoff (accepted):** query-param language is less ideal than `/en/` path segments for
  SEO, but avoids duplicating every page/route. Proper `hreflang` + `canonical` makes it
  acceptable. Upgrade path: add `website_route_rules` for `/en/<path>` later if needed —
  noted with a `ponytail:` comment.

## 6. Animation

- **CSS-first** (inlined keyframes + utility classes): scroll-reveal stagger, gradient-mesh
  drift, floating blobs, stakeholder orbit/marquee, draw-on SVG underlines, hover card-lift,
  parallax hero band.
- **One small vanilla JS** (inlined): IntersectionObserver → adds `.in` to `.reveal` elements
  on view; count-up animation for stat numbers; nav shrink-on-scroll; language + mobile-menu
  handlers.
- **No new dependency.** GSAP (CDN) only if one scrollytelling section genuinely needs it;
  default is none. `ponytail:` CSS + IO covers 95% of "full animation".
- **`prefers-reduced-motion: reduce`** disables all non-essential motion (a11y + empathy).
- **Responsive:** mobile-first Tailwind (CDN config in base), contained `max-w` cards, fluid
  type, no horizontal scroll.

## 7. SEO + GEO

**SEO:**
- Per-page unique `<title>`, meta description, `canonical`, `og:*`, `twitter:card`, `hreflang`.
- Semantic HTML5 landmarks (`header/nav/main/section/article/footer`), single `<h1>`/page,
  logical H2–H3, skip-link, descriptive alt text.
- `www/robots.txt` (allow, link sitemap), Frappe's auto sitemap for `www` pages.
- Fast server-rendered TTFB, `font-display:swap`, preconnect, lazy-loaded images.

**JSON-LD (in base + per-page blocks):**
- `Organization` (name, slogan "In the business of making people happy", logo, `sameAs`
  socials, `foundingLocation`), `WebSite` (+ optional `SearchAction`).
- `BreadcrumbList` per page.
- `FAQPage` on home + product.
- `SoftwareApplication` on product.
- `JobPosting` per open role on careers.

**GEO (answer-engine / LLM optimization):**
- Answer-first, self-contained quotable paragraphs; a clear FAQ answering
  "What does VernonCorp do?" and "What is the Vernon app?".
- Consistent entity naming/definition (VernonCorp vs Vernon app) so models don't conflate.
- A machine-readable **`/llms.txt`** (`www/llms.txt`) summarizing the company, product, and
  key links for AI crawlers.
- Structured data (above) + fast, JS-independent HTML so crawlers get full content.

## 8. Contact form — email only (no new doctype)

- **Frontend:** styled form (name, email, message) + **honeypot** hidden field + `lang`.
- **Backend:** `vernon_project/api/contact.py::submit_inquiry` — `@frappe.whitelist(allow_guest=True)`.
  - **Trust-boundary validation (required, not lazy):** validate name/email/message present &
    length-bounded; validate email format; if honeypot filled → silently drop (bot).
  - **Rate limit:** `@frappe.rate_limit` (e.g. 5/hour/IP) to blunt spam.
  - **Action:** `frappe.sendmail` to a company inbox address. Inbox is read from
    `site_config` key `vernoncorp_contact_email`, falling back to a sensible constant; if no
    outgoing email is configured the call is wrapped so the user still gets a success UX and
    the error is logged (no data loss path — email-only means nothing is persisted, accepted
    per decision).
  - Returns `{ok: True}`; frontend shows an inline thank-you (no `alert()` — per
    `vernon-no-alert-use-dialog`).
- New whitelisted endpoint ⇒ run `scripts/gen_docs.py` and commit `docs/assets/data.js`.

## 9. Content outline

- **Company:** people-first Indonesian tech company; mission + values + stakeholder empathy
  map; culture.
- **Product (Vernon):** project & team management with gamification — points, badges,
  leaderboards, focus timers, attendance, learning. "Software that makes teams happy." CTAs to
  `/w` and `/m`.
- Copy authored in **both** ID + EN, warm human voice, empathy-forward.

## 10. Files

```
vernon_project/
  templates/vernoncorp_base.html
  www/
    index.html    index.py
    about.html    about.py
    product.html  product.py
    careers.html  careers.py
    contact.html  contact.py
    _i18n.py
    llms.txt
    robots.txt
  api/contact.py
```

## 11. Testing & verification (live site, code-first — no test DB)

Per memory `vernon-live-site-codefirst`: no test DB; verify against the live site.

- **i18n completeness self-check** (the one non-trivial data invariant): a small runnable
  check asserting every `STRINGS[page][key]` has both `id` and `en`. Fails loudly if a
  translation is missing.
- **Contact validation self-check:** assert `submit_inquiry` rejects bad email / empty
  message / filled honeypot, accepts a valid payload (pure-function validation extracted so it
  runs without email config).
- **Render smoke:** `curl` each route (200 + expected `<h1>` + JSON-LD present) for both
  `?lang=id` and `?lang=en`.
- Manual: responsive check, reduced-motion honored, keyboard nav, contrast.

## 12. Post-ship (per CLAUDE.md)

- Run `python3 scripts/gen_docs.py` (new `contact.submit_inquiry` endpoint) and commit
  `docs/assets/data.js`.
- Add a **What's New** App Release row (user-visible ship, `Both` platform) in Bahasa.
- Deploy = edit → `bench --site project.vernon.id clear-website-cache` (no build, no restart
  for the www/templates; `contact.py` Python change needs `sudo /usr/local/bin/tj-restart`).

## 13. Out of scope

- CMS-editable content (copy is authored in templates/i18n; admin editor deferred — YAGNI
  until someone needs to edit without a deploy).
- Persisted inquiries / CRM lead (email-only per decision).
- Blog / news section.
- Separate `/en/` URL paths (query-param lang for now; upgrade path noted).
