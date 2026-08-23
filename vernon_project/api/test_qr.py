# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import base64
import unittest

from vernon_project.api.qr import qr_data_uri, qr_png_bytes, verify_url

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
URL = "https://project.vernon.id/verify/abcdefghijklmnopqrstuv"


class TestQrBytes(unittest.TestCase):
	def test_is_a_real_png(self):
		self.assertTrue(qr_png_bytes(URL).startswith(PNG_MAGIC))

	def test_scale_changes_the_size(self):
		self.assertGreater(len(qr_png_bytes(URL, scale=10)), len(qr_png_bytes(URL, scale=2)))

	def test_same_input_same_output(self):
		# Republishing a certificate must not produce a different-looking QR.
		self.assertEqual(qr_png_bytes(URL), qr_png_bytes(URL))

	def test_different_codes_differ(self):
		self.assertNotEqual(qr_png_bytes(URL), qr_png_bytes(URL + "x"))


class TestDataUri(unittest.TestCase):
	def test_prefix_and_decodable_payload(self):
		uri = qr_data_uri(URL)
		self.assertTrue(uri.startswith("data:image/png;base64,"))
		self.assertTrue(base64.b64decode(uri.split(",", 1)[1]).startswith(PNG_MAGIC))

	def test_no_whitespace_that_would_break_an_img_src(self):
		uri = qr_data_uri(URL)
		self.assertNotIn("\n", uri)
		self.assertNotIn(" ", uri)


class TestVerifyUrl(unittest.TestCase):
	def test_builds_the_public_url(self):
		self.assertEqual(verify_url("abc", base_url="https://project.vernon.id"),
			"https://project.vernon.id/verify/abc")

	def test_trailing_slash_does_not_double_up(self):
		self.assertEqual(verify_url("abc", base_url="https://project.vernon.id/"),
			"https://project.vernon.id/verify/abc")

	def test_http_is_upgraded_because_the_url_is_printed_on_paper(self):
		self.assertEqual(verify_url("abc", base_url="http://project.vernon.id"),
			"https://project.vernon.id/verify/abc")

	def test_localhost_is_left_alone(self):
		for base in ("http://localhost:8000", "http://127.0.0.1:8000"):
			self.assertTrue(verify_url("abc", base_url=base).startswith("http://"), base)

	def test_https_is_untouched(self):
		self.assertEqual(verify_url("abc", base_url="https://x.id"), "https://x.id/verify/abc")


if __name__ == "__main__":
	unittest.main()
