import unittest

from vernon_project.api.verse import pick_index, strip_html


class TestVerseHelpers(unittest.TestCase):
	def test_pick_index_deterministic(self):
		# Same date + same pool size -> same index, every call.
		a = pick_index("2026-07-05", 40)
		b = pick_index("2026-07-05", 40)
		self.assertEqual(a, b)

	def test_pick_index_in_range(self):
		for d in ("2026-01-01", "2026-07-05", "2026-12-31"):
			self.assertTrue(0 <= pick_index(d, 40) < 40)

	def test_pick_index_varies_by_date(self):
		# Different dates should not all collapse to one index.
		idxs = {pick_index(f"2026-07-{d:02d}", 40) for d in range(1, 29)}
		self.assertGreater(len(idxs), 1)

	def test_strip_html_removes_tags(self):
		self.assertEqual(
			strip_html('teks<sup foot_note="1">1</sup> lanjut'),
			"teks lanjut",
		)

	def test_strip_html_collapses_whitespace(self):
		self.assertEqual(strip_html("a   b\n c"), "a b c")


if __name__ == "__main__":
	unittest.main()
