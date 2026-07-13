# /w Adaptive Canvas — design spec (2026-07-13)

Evolve the 2026-07-12 soft-pop web redesign: better desktop space use, data
density, visual polish, motion. Keep tab-bar mobile-flow shell, warm paper
tokens, and mobile (/m) parity untouched.

## Scope

- Primitives + key pages. Shared `@` (frontend/src, /m) components are OFF
  LIMITS — web-only files (`@web`, frontend-web/tailwind.config.js) only.
- Key pages hand-tuned: Home, Projects workspace, Review, Reports.
- All other ~46 pages improve only via primitives; no per-page edits.

## 1. Width system

- AMENDED during planning: 37 of ~50 pages never render `<Page>`, so a Page
  prop cannot own width. Instead `AppShell` keeps ownership via a
  route→width map: `/project*` → full-bleed, `/`, `/review`, `/reports*`,
  `/report/*` → `max-w-7xl`, everything else → `max-w-6xl` (unchanged).
- Zero page edits; `Page` untouched except comments.

## 2. Data density (DataTable)

- Body cells `px-4 py-3` → `px-3 py-2` (~36px rows); header `py-3` → `py-2.5`.
- Clickable-row hover adds a subtle brand left-accent (inset box-shadow or
  border-l), keeping existing `hover:bg-hover` tint.
- Sticky header kept as-is.
- Pages whose main content is a DataTable pass `width="wide"` (done only for
  the 4 key pages in this pass; others keep `feed` and still get density).

## 3. Elevation, motion, type tokens

- tailwind.config: new `boxShadow.card-hover` tier (slightly larger/warmer
  than `card`).
- Interactive `Card`: `hover:-translate-y-px hover:shadow-card-hover`
  alongside existing `active:scale-[0.99]`.
- Stagger: tiny web-only `Stagger`/`riseDelay(i)` helper applying
  `animate-rise` + `animation-delay: i * 40ms`, capped at 8 items; used on
  card feeds (Review, Home feeds, CardList consumers among key pages).
- Consistent `focus-visible` brand ring on Card, DataTable sortable headers
  (already present), interactive rows, primary buttons.
- Type: PageHeader h1 `text-[1.7rem]` → `text-[1.85rem]` with the display
  face; everything else unchanged.

## 4. Home — 2-col command center (xl+)

- `xl:grid-cols-[minmax(0,1fr)_380px]`.
- Main column: today's plan / todos / review queue (current primary flow).
- Side rail: stats, pulse/activity, quick links.
- Below xl: single column; AMENDED — side-rail content (recap, verse,
  meetings, attendance, jump-to) stacks after the work list instead of the
  old interleaved order. Accepted tradeoff of the 2-col split.

## 5. Key pages

- **Projects workspace**: `width="full"`; denser rail rows; hover polish on
  rail + todo tables.
- **Review**: wide via route map; AMENDED — feed is already a 3-col grid via
  `CardList`, so Review only gains width + stagger.
- **Reports**: `width="wide"`; tighter report-card grid; report tables get
  density from §2.

## 6. Error handling / testing / deploy

- No API or data-flow changes; render-only. Risk = layout regressions.
- Verify: `tsc` clean, `npm run build`, spot-check key pages + one untouched
  feed page + dark mode. Automated tests deferred (live-site convention).
- Deploy: build → `sudo /usr/local/bin/tj-restart` → Cloudflare asset purge →
  verify non-zero bundle (poisoned-cache gotcha).

## Non-goals

- No nav paradigm change (no sidebar return, no context rail — rejected
  "workspace shift" approach).
- No /m changes, no shared-component edits, no new dependencies.
