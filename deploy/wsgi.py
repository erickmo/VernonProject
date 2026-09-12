"""The WSGI entry point for the web container.

Frappe normally lets nginx serve /assets and /files. This deployment has no
nginx in it — the operator's nginx lives on another device and cannot read this
container's disk — so the app serves them itself through frappe's own
`application_with_statics()` rather than a second static-file implementation.

Serving static files from gunicorn is slower than nginx doing it. For a portable
single-box deployment that is the right trade; if it ever matters, mount the
sites volume somewhere the operator's nginx can read and drop this wrapper.
"""

from frappe.app import application_with_statics

application = application_with_statics()
