#!/usr/bin/env python3
"""
Script to manually test the Project Todo Phase Tracking feature
"""

import sys
import os

# Add the app to path
sys.path.insert(0, os.path.dirname(__file__))

def test_imports():
	"""Test that all required modules can be imported"""
	print("=" * 70)
	print("Testing imports...")
	print("=" * 70)

	try:
		import frappe
		print("✓ frappe module imported successfully")
	except ImportError as e:
		print(f"✗ Failed to import frappe: {e}")
		return False

	try:
		from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo
		print("✓ ProjectTodo class imported successfully")
	except ImportError as e:
		print(f"✗ Failed to import ProjectTodo: {e}")
		return False

	return True

def test_methods_exist():
	"""Test that all required methods exist"""
	print("\n" + "=" * 70)
	print("Testing method existence...")
	print("=" * 70)

	try:
		from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo

		required_methods = [
			'validate',
			'calculate_total_estimated_hours',
			'track_phase_changes',
			'calculate_hours_diff',
			'calculate_total_actual_hours'
		]

		for method in required_methods:
			if hasattr(ProjectTodo, method):
				print(f"✓ Method '{method}' exists")
			else:
				print(f"✗ Method '{method}' NOT FOUND")
				return False

		return True

	except Exception as e:
		print(f"✗ Error checking methods: {e}")
		return False

def test_json_fields():
	"""Test that JSON file contains required fields"""
	print("\n" + "=" * 70)
	print("Testing JSON field definitions...")
	print("=" * 70)

	try:
		import json

		json_path = os.path.join(
			os.path.dirname(__file__),
			'vernon_project/vernon_project/doctype/project_todo/project_todo.json'
		)

		with open(json_path, 'r') as f:
			data = json.load(f)

		field_order = data.get('field_order', [])

		required_fields = [
			'estimated_planned_to_done',
			'estimated_done_to_checked',
			'estimated_checked_to_completed',
			'total_estimated_hours',
			'planned_started_at',
			'done_started_at',
			'checked_started_at',
			'phase_completed_at',
			'actual_planned_to_done',
			'actual_done_to_checked',
			'actual_checked_to_completed',
			'total_actual_hours'
		]

		for field in required_fields:
			if field in field_order:
				print(f"✓ Field '{field}' found in field_order")
			else:
				print(f"✗ Field '{field}' NOT FOUND in field_order")
				return False

		return True

	except Exception as e:
		print(f"✗ Error checking JSON: {e}")
		return False

def test_logic():
	"""Test basic calculation logic without database"""
	print("\n" + "=" * 70)
	print("Testing calculation logic...")
	print("=" * 70)

	try:
		from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo
		from datetime import datetime, timedelta

		# Create a mock todo object
		class MockDoc:
			def __init__(self):
				self.estimated_planned_to_done = 2.5
				self.estimated_done_to_checked = 1.0
				self.estimated_checked_to_completed = 0.5
				self.total_estimated_hours = 0.0

		todo = ProjectTodo()
		mock = MockDoc()

		# Copy attributes to todo
		for attr in ['estimated_planned_to_done', 'estimated_done_to_checked',
					 'estimated_checked_to_completed', 'total_estimated_hours']:
			setattr(todo, attr, getattr(mock, attr))

		# Test calculate_total_estimated_hours
		todo.calculate_total_estimated_hours()

		expected_total = 2.5 + 1.0 + 0.5  # 4.0
		if todo.total_estimated_hours == expected_total:
			print(f"✓ Total estimated hours calculated correctly: {todo.total_estimated_hours}")
		else:
			print(f"✗ Total estimated hours INCORRECT: {todo.total_estimated_hours} (expected {expected_total})")
			return False

		# Test calculate_hours_diff
		start = datetime.now()
		end = start + timedelta(hours=2, minutes=30)

		diff = todo.calculate_hours_diff(start, end)
		expected_diff = 2.5

		if diff == expected_diff:
			print(f"✓ Hours difference calculated correctly: {diff}")
		else:
			print(f"✗ Hours difference INCORRECT: {diff} (expected {expected_diff})")
			return False

		return True

	except Exception as e:
		print(f"✗ Error testing logic: {e}")
		import traceback
		traceback.print_exc()
		return False

def main():
	"""Run all tests"""
	print("\n" + "=" * 70)
	print("PROJECT TODO PHASE TRACKING - IMPLEMENTATION TEST")
	print("=" * 70)

	all_passed = True

	# Run tests
	if not test_imports():
		all_passed = False

	if not test_methods_exist():
		all_passed = False

	if not test_json_fields():
		all_passed = False

	if not test_logic():
		all_passed = False

	# Summary
	print("\n" + "=" * 70)
	if all_passed:
		print("✓✓✓ ALL TESTS PASSED ✓✓✓")
	else:
		print("✗✗✗ SOME TESTS FAILED ✗✗✗")
	print("=" * 70)

	return 0 if all_passed else 1

if __name__ == "__main__":
	sys.exit(main())
