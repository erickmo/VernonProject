"""k9b82d4lkh — the structured helper behind a Coding group's todo note.

A Group whose ``group_type`` is "Coding" replaces the free-form note with a short
set of questions. The answers are stored as JSON on ``Project Todo.coding_brief``
and rendered into ``Project Todo.notes`` by the controller, so the note another
agent reads is deterministic and complete rather than whatever someone typed.

Deliberately pure — no frappe import — for the same reason ``api/project.py``'s
breakdown template is: the rendering rules are the part worth testing, and they
test without a site. The controller owns enforcement (see project_todo.py); this
module only says what the fields are and what the note looks like.
"""

import json

MAX_LEN = 4000  # per answer, matching _MAX_LEN in api/project.py's breakdown template

# The questions, in the order they are asked and rendered. Answers live in one JSON
# column, so this list can change without a schema migration.
FIELDS = (
	{"key": "goal", "label": "Goal / outcome", "required": True, "rows": 2,
	 "placeholder": "What is true once this is done?"},
	{"key": "surface", "label": "Where it lives", "required": True, "rows": 2,
	 "placeholder": "Which app, screen, endpoint or file this touches"},
	{"key": "acceptance", "label": "Acceptance criteria", "required": True, "rows": 4,
	 "placeholder": "One per line, each one checkable"},
	{"key": "constraints", "label": "Constraints / must not break", "required": False, "rows": 3,
	 "placeholder": "Existing behaviour, data or permissions that must survive"},
	{"key": "verify", "label": "How to verify", "required": True, "rows": 3,
	 "placeholder": "The command to run, or the steps to click, and what a pass looks like"},
)
REQUIRED_KEYS = tuple(f["key"] for f in FIELDS if f["required"])
HEADING = "## Coding brief"


def parse(raw):
	"""Stored JSON -> {key: answer}. Anything unreadable reads as "no brief" rather
	than raising: a malformed value must not make an existing todo unsaveable."""
	if isinstance(raw, dict):
		data = raw
	elif isinstance(raw, str) and raw.strip():
		try:
			data = json.loads(raw)
		except ValueError:
			return {}
	else:
		return {}
	if not isinstance(data, dict):
		return {}
	return {f["key"]: str(data.get(f["key"]) or "").strip() for f in FIELDS}


def missing(brief):
	"""Labels of the required answers still blank, in field order."""
	return tuple(f["label"] for f in FIELDS if f["required"] and not brief.get(f["key"]))


def render_note(brief):
	"""The note text for a brief: every answered field, labelled, in field order.
	Empty answers are skipped, so an optional field left blank leaves no empty
	heading. Returns "" for an empty brief so the caller can leave notes alone."""
	blocks = []
	for f in FIELDS:
		value = (brief.get(f["key"]) or "").strip()
		if not value:
			continue
		blocks.append("**{}**\n{}".format(f["label"], value[:MAX_LEN]))
	return "{}\n\n{}".format(HEADING, "\n\n".join(blocks)) if blocks else ""
