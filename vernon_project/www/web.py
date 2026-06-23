# Controller for the /web desktop SPA shell (companion to the vite-generated web.html).
#
# Mirrors www/m.py: the shell must never be served stale. Every build produces new
# content-hashed asset filenames referenced by hash in web.html, so a cached shell
# white-screens. `no_cache = 1` disables Frappe's server-side page cache for /web.
#
# Hand-written; NOT overwritten by the build (copy-html.mjs only regenerates web.html).
# There is intentionally NO service worker for the desktop app.

no_cache = 1
