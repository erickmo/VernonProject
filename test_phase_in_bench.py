"""
Test Phase Tracking Feature in Frappe Bench Console
Run this with: bench --site [site-name] console < test_phase_in_bench.py
"""

import frappe
from frappe.utils import nowdate, add_days
from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo
from datetime import datetime, timedelta

print("=" * 70)
print("TESTING PROJECT TODO PHASE TRACKING FEATURE")
print("=" * 70)

# Test 1: Test imports
print("\n[Test 1] Testing imports...")
try:
	from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo
	print("✓ ProjectTodo imported successfully")
except Exception as e:
	print(f"✗ Failed to import: {e}")

# Test 2: Check methods exist
print("\n[Test 2] Testing methods exist...")
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

# Test 3: Test calculation logic
print("\n[Test 3] Testing calculation logic...")
try:
	todo = ProjectTodo()
	todo.estimated_planned_to_done = 2.5
	todo.estimated_done_to_checked = 1.0
	todo.estimated_checked_to_completed = 0.5

	todo.calculate_total_estimated_hours()

	expected = 4.0
	if todo.total_estimated_hours == expected:
		print(f"✓ Total estimated hours: {todo.total_estimated_hours}")
	else:
		print(f"✗ Total incorrect: {todo.total_estimated_hours} (expected {expected})")

except Exception as e:
	print(f"✗ Error: {e}")

# Test 4: Test hours diff calculation
print("\n[Test 4] Testing hours diff calculation...")
try:
	todo = ProjectTodo()
	start = datetime.now()
	end = start + timedelta(hours=2, minutes=30)

	diff = todo.calculate_hours_diff(start, end)
	expected_diff = 2.5

	if diff == expected_diff:
		print(f"✓ Hours diff calculated correctly: {diff} hours")
	else:
		print(f"✗ Hours diff incorrect: {diff} (expected {expected_diff})")

except Exception as e:
	print(f"✗ Error: {e}")

# Test 5: Test with actual document (if possible)
print("\n[Test 5] Testing with actual document creation...")
try:
	# Check if we can create test data
	if not frappe.db.exists("Customer", "Test Customer Phase Track"):
		customer = frappe.get_doc({
			"doctype": "Customer",
			"customer_name": "Test Customer Phase Track",
			"customer_type": "Company"
		})
		customer.insert(ignore_permissions=True)
		print("✓ Test customer created")

	if not frappe.db.exists("Project Group", "Test Group Phase"):
		group = frappe.get_doc({
			"doctype": "Project Group",
			"project_group_name": "Test Group Phase"
		})
		group.insert(ignore_permissions=True)
		print("✓ Test project group created")

	# Create test project
	project = frappe.get_doc({
		"doctype": "Project",
		"project_name": "Test Phase Tracking Project",
		"customer": "Test Customer Phase Track",
		"project_group": "Test Group Phase",
		"project_owner": "Administrator",
		"project_leader": "Administrator",
		"start_date": nowdate(),
		"deadline": add_days(nowdate(), 30),
		"status": "Ongoing"
	})
	project.insert(ignore_permissions=True)
	print(f"✓ Test project created: {project.name}")

	# Create project detail with todo
	detail = frappe.get_doc({
		"doctype": "Project Detail",
		"project": project.name,
		"detail_name": "Test Detail with Phase Tracking",
		"estimated": 100,
		"todo": [
			{
				"to_do": "Test Todo with Phase Estimation",
				"assigned_to": "Administrator",
				"deadline": add_days(nowdate(), 7),
				"estimated": 60,
				"status": "⚪️ Planned",
				"estimated_planned_to_done": 2.5,
				"estimated_done_to_checked": 1.0,
				"estimated_checked_to_completed": 0.5
			}
		]
	})
	detail.insert(ignore_permissions=True)
	frappe.db.commit()
	print(f"✓ Project detail created: {detail.name}")

	# Reload and check
	detail.reload()
	todo = detail.todo[0]

	print(f"\n  Todo created with:")
	print(f"    - Estimated Planned→Done: {todo.estimated_planned_to_done} hours")
	print(f"    - Estimated Done→Checked: {todo.estimated_done_to_checked} hours")
	print(f"    - Estimated Checked→Completed: {todo.estimated_checked_to_completed} hours")
	print(f"    - Total Estimated: {todo.total_estimated_hours} hours")
	print(f"    - Planned Started At: {todo.planned_started_at}")

	if todo.total_estimated_hours == 4.0:
		print("  ✓ Total estimated hours calculated correctly!")

	if todo.planned_started_at:
		print("  ✓ Planned timestamp set correctly!")

	# Test phase transition
	print(f"\n  Testing phase transition to Done...")
	detail.todo[0].status = "🟠 Done"
	detail.save(ignore_permissions=True)
	frappe.db.commit()

	detail.reload()
	todo = detail.todo[0]

	if todo.done_started_at:
		print(f"  ✓ Done timestamp set: {todo.done_started_at}")

	if todo.actual_planned_to_done and todo.actual_planned_to_done > 0:
		print(f"  ✓ Actual time calculated: {todo.actual_planned_to_done} hours")

	# Cleanup
	print(f"\n  Cleaning up test data...")
	frappe.delete_doc("Project Detail", detail.name, ignore_permissions=True, force=True)
	frappe.delete_doc("Project", project.name, ignore_permissions=True, force=True)
	frappe.db.commit()
	print("  ✓ Test data cleaned up")

except Exception as e:
	print(f"✗ Error during document test: {e}")
	import traceback
	traceback.print_exc()

print("\n" + "=" * 70)
print("TESTING COMPLETE")
print("=" * 70)
