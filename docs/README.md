# Vernon Project — Documentation

A self-contained, static **HTML documentation site** for the Vernon Project Frappe app.
No build step, no dependencies — just open the files in a browser.

## View it

```bash
# Option 1 — open directly
xdg-open docs/index.html        # Linux
open docs/index.html            # macOS

# Option 2 — serve locally (recommended; enables clean navigation)
cd docs && python3 -m http.server 8080
# then visit http://localhost:8080
```

## Pages

| Page | What it covers |
| --- | --- |
| [index.html](index.html) | Overview, feature highlights, and a map of the docs |
| [getting-started.html](getting-started.html) | Installation on a Frappe bench + first-time setup and daily usage |
| [architecture.html](architecture.html) | Data model, app hooks, the scheduled job, and the dashboard |
| [doctypes.html](doctypes.html) | Field-by-field reference for all 14 DocTypes with controller logic |
| [erd.html](erd.html) | A visual entity-relationship diagram (Mermaid) of all 14 DocTypes and their links |
| [workflow.html](workflow.html) | The four-stage todo lifecycle, phase time tracking, recurring todos, field locking |
| [permissions.html](permissions.html) | Roles, row-level query filtering, document checks, and the Project Admin block |
| [api.html](api.html) | The four whitelisted API endpoints |
| [reports.html](reports.html) | The five reports and the Project Progress dashboard chart |
| [changelog.html](changelog.html) | Release history (0.0.1 → 0.4.0), roadmap, and docs-vs-code notes |

## Features of the site

- Light/dark theme toggle (remembers your choice)
- Client-side search (`⌘K` / `Ctrl-K`, or `/`)
- Auto-generated "On this page" navigation with scroll-spy
- Syntax-highlighted, copyable code blocks
- Fully responsive (mobile sidebar)

## Assets

```
docs/
├── *.html                 # documentation pages
└── assets/
    ├── styles.css         # design system (theming, components)
    ├── app.js             # theme, search, TOC, code highlighting, copy buttons
    └── search-index.js    # generated search index (page + section entries)
```

The content is grounded in the app's actual source (DocType JSON/controllers, the API layer,
reports, hooks, and the bundled markdown docs) and cross-checked against that source.
Where the older root `README.md` and the current code diverge, see
[changelog.html#docs-vs-code](changelog.html#docs-vs-code).
