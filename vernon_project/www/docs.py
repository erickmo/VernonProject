# Serves docs/ to logged-in users only.
#
# The old mechanism was a committed symlink (public/docs -> ../../docs) plus a /docs
# redirect. nginx serves /assets as static files, so Frappe auth never ran and the whole
# docs tree -- including 149 internal design docs under superpowers/ -- was world-readable.
# A login check cannot be bolted onto /assets, so this renderer replaces it. Do not
# recreate the symlink.
#
# Not a www template (m.py/w.py style): TemplatePage needs a .html companion and renders
# it through Jinja + the website base template, which cannot emit raw .css/.js/.md bytes.
# A page_renderer is the supported hook for serving bytes; custom renderers run first.

import frappe
from pathlib import Path
from frappe.website.page_renderers.base_renderer import BaseRenderer
from frappe.website.utils import build_response

# repo root = .../apps/vernon_project ; this file = .../vernon_project/www/docs.py
DOCS_ROOT = Path(__file__).resolve().parents[2] / "docs"

# ponytail: 4 types is the whole docs site (html/css/js/md). Images would need a byte-range
# story anyway -- add a type here only when a page actually references one.
ALLOWED = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".md": "text/plain; charset=utf-8",  # text/markdown makes browsers download it
}


def resolve_doc(app_path, root=DOCS_ROOT):
	"""Map a /docs/<app_path> request to (Path, content_type), or None to 404.

	Touches no frappe API and no request context, so it is testable in isolation -- but the
	module imports frappe at top level, so run the self-check with the bench interpreter:
	    ./env/bin/python apps/vernon_project/vernon_project/www/docs.py
	Rejects traversal ('..'), absolute paths and symlink escapes by resolving the target
	and requiring it stay inside realpath(root). Tries '<p>' then '<p>.html' because both
	Cloudflare AND frappe's resolve_path strip .html, so /docs/system arrives bare.

	An empty path is None (not index.html): bare /docs must redirect, not render -- see
	DocsPage.render().
	"""
	root = Path(root).resolve()
	rel = (app_path or "").strip("/")
	if not rel:
		return None
	for candidate in (rel, rel + ".html"):
		try:
			target = (root / candidate).resolve()
		# ValueError: resolve() raises "embedded null byte" on a NUL in the path, and it is
		# not an OSError. Attacker-chosen input, so it 404s instead of 500ing.
		except (OSError, ValueError):
			continue
		# root / "/etc/passwd" == "/etc/passwd", so this catches absolute paths too.
		if not target.is_relative_to(root):
			continue
		ctype = ALLOWED.get(target.suffix.lower())
		if ctype and target.is_file():
			return target, ctype
	return None


class DocsPage(BaseRenderer):
	def can_render(self):
		# route rule maps /docs/<path:app_path> -> "docs"; bare /docs resolves to "docs" too.
		return self.path == "docs"

	def render(self):
		# Guest check FIRST, before any path handling. This is the point of the file.
		if frappe.session.user in (None, "Guest"):
			raise frappe.PermissionError("Login required to read /docs")
		# Bare /docs has no trailing slash, so index.html's relative hrefs would resolve one
		# level too high (assets/app.js -> /assets/app.js -> 404 -> no window.VP -> "?" spans).
		# Must redirect to "/docs/index", NOT "/docs/": Cloudflare 301s /docs/ back to /docs,
		# which would ping-pong forever. /docs/index passes through CF untouched.
		# 302 + no-store so this stays undoable; a cached 301 would outlive the fix.
		if not (frappe.form_dict.get("app_path") or "").strip("/"):
			return build_response(
				self.path,
				"",
				302,
				{"Location": "/docs/index", "Cache-Control": "no-store"},
			)
		hit = resolve_doc(frappe.form_dict.get("app_path"))
		if not hit:
			raise frappe.PageDoesNotExistError
		target, ctype = hit
		return build_response(
			self.path,
			target.read_bytes(),
			200,
			{"Content-Type": ctype, "X-Robots-Tag": "noindex"},
		)


if __name__ == "__main__":
	# Hermetic fixture, not the real docs/ -- the guard takes `root` precisely so it can be
	# tested without a Frappe context and before docs/index.html exists.
	import tempfile

	with tempfile.TemporaryDirectory() as tmp:
		outside = Path(tmp) / "outside"
		outside.mkdir()
		(outside / "secret.md").write_text("SECRET")
		root = Path(tmp) / "docs"
		(root / "superpowers" / "specs").mkdir(parents=True)
		(root / "index.html").write_text("<h1>hi</h1>")
		(root / "system.html").write_text("<h1>sys</h1>")
		(root / "superpowers" / "specs" / "x.md").write_text("# x")
		(root / "notes.txt").write_text("not allowed")
		(root / "escape").symlink_to(outside)  # symlink escape must not leak

		ok = lambda p: resolve_doc(p, root) is not None

		for bad in (
			"../../../etc/passwd",  # traversal
			"/etc/passwd",  # absolute path
			"..%2f..%2fhooks.py",  # literal, if werkzeug did not decode it
			"../../hooks.py",  # decoded form of the above
			"../outside/secret.md",  # traversal onto a real, allowed-extension file
			"escape/secret.md",  # symlink escape onto a real .md
			"notes.txt",  # extension not on the allowlist
			"superpowers",  # a directory, not a file
			"assets/../../outside/secret.md",  # traversal hidden mid-path
			"a\x00b.md",  # NUL byte: resolve() raises ValueError, must 404 not 500
		):
			assert not ok(bad), f"guard LEAKED: {bad}"

		for good in ("index.html", "index", "superpowers/specs/x.md", "system"):
			assert ok(good), f"guard blocked a real doc: {good}"

		# Cloudflare/frappe strip .html, so both forms must land on the same file
		assert resolve_doc("system", root) == resolve_doc("system.html", root)
		# bare /docs does NOT render index -- DocsPage.render() redirects it to /docs/index
		assert resolve_doc("", root) is None
		assert resolve_doc("/", root) is None
		# content types
		assert resolve_doc("superpowers/specs/x.md", root)[1] == "text/plain; charset=utf-8"
		assert resolve_doc("index.html", root)[1] == "text/html; charset=utf-8"

	print("docs.py guard self-check: OK")
