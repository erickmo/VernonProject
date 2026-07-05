import frappe

# The /m and /w SPA shells (www/m.html, www/w.html) reference content-hashed
# JS/CSS by filename. Every frontend build emits new hashes and DELETES the old
# ones. Frappe serves the shell HTML with no Cache-Control header, so a browser
# is free to heuristically cache it — and a heuristically-cached OLD shell then
# points at JS/CSS that no longer exists on disk. The result: after a deploy the
# app white-screens (blank page) and only recovers on a manual refresh, which
# revalidates the shell. (`no_cache=1` in the www controllers only disables
# Frappe's server-side redis page cache; it emits no HTTP caching header.)
#
# Force the browser to always revalidate the shell HTML. The hashed assets under
# /assets stay immutable and long-cacheable — only the tiny shell is no-store.
_SHELL_PREFIXES = ("/m", "/w")


def no_store_spa_shell(response=None, request=None):
	"""after_request hook: mark the /m and /w SPA shell HTML as never-cache."""
	if not response or not request:
		return
	path = request.path or ""
	is_shell = any(path == p or path.startswith(p + "/") for p in _SHELL_PREFIXES)
	if is_shell and (response.mimetype or "").startswith("text/html"):
		response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
		response.headers["Pragma"] = "no-cache"
		response.headers["Expires"] = "0"
