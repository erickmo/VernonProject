# Copyright (c) 2026, Vernon and contributors
"""The shared field comparison, against BOTH callers' cases.

Project Todo supplies a fieldtype from meta; Teguran supplies none, because its
guard is exercised against a stand-in object with no registered meta. Both paths
are covered here so neither caller can be broken by a change made for the other.
"""

import datetime
import unittest

from vernon_project.field_compare import field_changed, is_blank


class TestBlank(unittest.TestCase):
	def test_null_and_empty_string_are_the_same_absence(self):
		self.assertTrue(is_blank(None))
		self.assertTrue(is_blank(""))

	def test_a_real_value_is_not_blank(self):
		for value in ("x", 0, "0", datetime.date(2026, 9, 19)):
			self.assertFalse(is_blank(value), f"{value!r} is a value, not an absence")


class TestWithoutAFieldtype(unittest.TestCase):
	"""Teguran's path — the value's own type decides."""

	def test_a_stored_date_and_the_same_day_as_a_string_are_not_a_change(self):
		self.assertFalse(field_changed("2026-09-19", datetime.date(2026, 9, 19)))
		self.assertFalse(field_changed(datetime.date(2026, 9, 19), "2026-09-19"))

	def test_a_different_day_is_a_change_either_way_round(self):
		self.assertTrue(field_changed("2026-09-16", datetime.date(2026, 9, 19)))
		self.assertTrue(field_changed(datetime.date(2026, 9, 16), "2026-09-19"))

	def test_blank_against_blank_is_not_a_change(self):
		self.assertFalse(field_changed(None, ""))
		self.assertFalse(field_changed("", None))
		self.assertFalse(field_changed(None, None))

	def test_clearing_a_real_value_is_still_a_change(self):
		self.assertTrue(field_changed("", "/files/evidence.pdf"))
		self.assertTrue(field_changed(None, "/files/evidence.pdf"))

	def test_filling_in_something_blank_is_still_a_change(self):
		self.assertTrue(field_changed("/files/evidence.pdf", None))
		self.assertTrue(field_changed("/files/evidence.pdf", ""))

	def test_surrounding_whitespace_is_not_a_change(self):
		self.assertFalse(field_changed(" same ", "same"))

	def test_a_different_string_is_a_change(self):
		self.assertTrue(field_changed("Keterlambatan", "Kinerja"))

	def test_numbers_compare_across_their_string_form(self):
		"""A JSON body sends 30 as "30"; the column gives back an int."""
		self.assertFalse(field_changed("30", 30))
		self.assertTrue(field_changed("31", 30))


class TestWithAFieldtype(unittest.TestCase):
	"""Project Todo's path — meta says what the field is."""

	def test_a_date_field_compares_as_dates(self):
		self.assertFalse(field_changed("2026-09-19", datetime.date(2026, 9, 19), "Date"))
		self.assertTrue(field_changed("2026-09-20", datetime.date(2026, 9, 19), "Date"))

	def test_a_datetime_field_ignores_the_string_form(self):
		stored = datetime.datetime(2026, 9, 19, 8, 30, 0)
		self.assertFalse(field_changed("2026-09-19 08:30:00", stored, "Datetime"))
		self.assertTrue(field_changed("2026-09-19 09:30:00", stored, "Datetime"))

	def test_a_blank_date_against_a_real_one_is_a_change(self):
		self.assertTrue(field_changed(None, datetime.date(2026, 9, 19), "Date"))
		self.assertTrue(field_changed(datetime.date(2026, 9, 19), None, "Date"))

	def test_two_blank_dates_are_not_a_change(self):
		self.assertFalse(field_changed(None, "", "Date"))

	def test_an_unknown_fieldtype_falls_back_to_the_value(self):
		"""A fieldtype this does not special-case must still behave, not throw."""
		self.assertFalse(field_changed("abc", "abc", "Small Text"))
		self.assertTrue(field_changed("abc", "abd", "Small Text"))
