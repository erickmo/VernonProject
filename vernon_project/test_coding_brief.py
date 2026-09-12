"""Pure tests for the Coding-brief helper (k9b82d4lkh). No frappe, no site:
run with `python3 -m unittest vernon_project.test_coding_brief` from the app root."""

import json
import unittest

from vernon_project.coding_brief import FIELDS, HEADING, missing, parse, render_note


FULL = {
	"goal": "Comment images render inline",
	"surface": "frontend/src/components/MarkdownEditor.tsx",
	"acceptance": "image shows as a picture\nmention shows as a chip",
	"constraints": "existing comments keep rendering",
	"verify": "npm test in frontend/",
}


class TestParse(unittest.TestCase):
	def test_reads_stored_json(self):
		self.assertEqual(parse(json.dumps(FULL)), FULL)

	def test_unreadable_or_empty_values_read_as_no_brief(self):
		for raw in ("", "   ", None, "not json", "[1,2]", '"a string"', 123):
			self.assertEqual(parse(raw), {}, raw)

	def test_unknown_keys_are_dropped_and_missing_keys_become_blank(self):
		got = parse(json.dumps({"goal": "g", "sneaky": "x"}))
		self.assertEqual(got["goal"], "g")
		self.assertNotIn("sneaky", got)
		self.assertEqual(got["verify"], "")

	def test_whitespace_only_answer_is_not_an_answer(self):
		self.assertEqual(parse(json.dumps({"goal": "  \n "}))["goal"], "")


class TestMissing(unittest.TestCase):
	def test_complete_brief_is_missing_nothing(self):
		self.assertEqual(missing(parse(json.dumps(FULL))), ())

	def test_names_each_blank_required_answer_in_field_order(self):
		self.assertEqual(
			missing(parse(json.dumps({"surface": "x", "constraints": "y"}))),
			("Goal / outcome", "Acceptance criteria", "How to verify"),
		)

	def test_the_optional_answer_is_never_required(self):
		brief = parse(json.dumps({**FULL, "constraints": ""}))
		self.assertEqual(missing(brief), ())


class TestRenderNote(unittest.TestCase):
	def test_renders_every_answer_labelled_in_field_order(self):
		note = render_note(parse(json.dumps(FULL)))
		self.assertTrue(note.startswith(HEADING))
		positions = [note.index("**" + f["label"] + "**") for f in FIELDS]
		self.assertEqual(positions, sorted(positions))
		for value in FULL.values():
			self.assertIn(value, note)

	def test_is_deterministic_for_the_same_answers(self):
		a = render_note(parse(json.dumps(FULL)))
		b = render_note(parse(json.dumps(dict(reversed(list(FULL.items()))))))
		self.assertEqual(a, b)

	def test_a_blank_optional_answer_leaves_no_empty_heading(self):
		note = render_note(parse(json.dumps({**FULL, "constraints": ""})))
		self.assertNotIn("Constraints", note)
		self.assertIn("How to verify", note)

	def test_an_empty_brief_renders_nothing_so_the_note_is_left_alone(self):
		self.assertEqual(render_note({}), "")
		self.assertEqual(render_note(parse("")), "")

	def test_a_very_long_answer_is_clipped(self):
		note = render_note(parse(json.dumps({**FULL, "goal": "x" * 9000})))
		self.assertIn("x" * 4000, note)
		self.assertNotIn("x" * 4001, note)


if __name__ == "__main__":
	unittest.main()
