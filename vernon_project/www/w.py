# Controller for the /w desktop SPA shell (companion to the vite-generated w.html).
#
# Mirrors www/m.py: the shell must never be served stale. Every build produces new
# content-hashed asset filenames referenced by hash in w.html, so a cached shell
# white-screens. `no_cache = 1` disables Frappe's server-side page cache for /w.
#
# Hand-written; NOT overwritten by the build (copy-html.mjs only regenerates w.html).
# There is intentionally NO service worker for the desktop app.

no_cache = 1
