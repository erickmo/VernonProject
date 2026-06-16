#!/usr/bin/env python3
"""
Manual test script to verify done todo field validation
Run this from frappe-bench directory: python apps/vernon_project/test_done_validation_manual.py
"""

import sys
import os

# Add frappe-bench to path
sys.path.insert(0, '/home/frappe/frappe-bench')
sys.path.insert(0, '/home/frappe/frappe-bench/apps/frappe')
sys.path.insert(0, '/home/frappe/frappe-bench/apps/vernon_project')

os.chdir('/home/frappe/frappe-bench')

import frappe
from frappe.utils import nowdate, add_days

# Initialize frappe
frappe.init(site='akira.vernon.id')
frappe.connect()
frappe.flags.in_test = True

try:
	print("=" * 70)
	print("TEST: Validasi Field Read-Only untuk Todo yang Sudah Done/Completed")
	print("=" * 70)

	# Ensure test users exist
	if not frappe.db.exists("User", "test_validate@example.com"):
		test_user = frappe.get_doc({
			"doctype": "User",
			"email": "test_validate@example.com",
			"first_name": "Test",
			"last_name": "Validate",
			"send_welcome_email": 0
		})
		test_user.insert(ignore_permissions=True)
		print("✓ Created test user")

	# Ensure test customer exists
	if not frappe.db.exists("Customer", "Test Validation Customer"):
		customer = frappe.get_doc({
			"doctype": "Customer",
			"customer_name": "Test Validation Customer",
			"customer_type": "Company"
		})
		customer.insert(ignore_permissions=True)
		print("✓ Created test customer")

	# Create test project
	project = frappe.get_doc({
		"doctype": "Project",
		"project_name": "Test Validation Project " + nowdate(),
		"customer": "Test Validation Customer",
		"project_owner": "Administrator",
		"project_leader": "Administrator",
		"start_date": nowdate(),
		"deadline": add_days(nowdate(), 30)
	})
	project.insert(ignore_permissions=True)
	frappe.db.commit()
	print(f"✓ Created test project: {project.name}")

	# Create project detail with todo
	detail = frappe.get_doc({
		"doctype": "Project Detail",
		"project": project.name,
		"detail_name": "Test Detail for Validation",
		"estimated": 100,
		"todo": [
			{
				"to_do": "Test Todo for Field Locking",
				"assigned_to": "test_validate@example.com",
				"deadline": add_days(nowdate(), 7),
				"estimated": 60,
				"status": "⚪️ Planned"
			}
		]
	})
	detail.insert(ignore_permissions=True)
	frappe.db.commit()
	print(f"✓ Created project detail: {detail.name}")
	print(f"  Todo: {detail.todo[0].to_do}")
	print(f"  Status: {detail.todo[0].status}")
	print(f"  Assigned to: {detail.todo[0].assigned_to}")
	print()

	# Test 1: Edit field while status is Planned (should succeed)
	print("Test 1: Edit assigned_to saat status Planned")
	detail.reload()
	old_assigned = detail.todo[0].assigned_to
	detail.todo[0].assigned_to = "Administrator"
	detail.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"  ✓ PASS: Berhasil ubah assigned_to dari {old_assigned} ke {detail.todo[0].assigned_to}")
	print()

	# Test 2: Change status to Done
	print("Test 2: Ubah status ke Done")
	detail.reload()
	detail.todo[0].status = "🟠 Done"
	detail.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"  ✓ Status berubah ke: {detail.todo[0].status}")
	print()

	# Test 3: Try to edit assigned_to when Done (should fail)
	print("Test 3: Coba edit assigned_to saat status Done")
	detail.reload()
	detail.todo[0].assigned_to = "test_validate@example.com"
	try:
		detail.save(ignore_permissions=True)
		print("  ✗ FAIL: Tidak ada error, seharusnya diblokir!")
	except frappe.ValidationError as e:
		if "Cannot modify" in str(e) and "Assigned To" in str(e):
			print(f"  ✓ PASS: Edit diblokir dengan benar")
			print(f"  Error message: {str(e)[:100]}...")
		else:
			print(f"  ✗ FAIL: Error tidak sesuai: {str(e)}")
	except Exception as e:
		print(f"  ✗ FAIL: Unexpected error: {str(e)}")
	print()

	# Test 4: Try to edit estimated when Done (should fail)
	print("Test 4: Coba edit estimated saat status Done")
	detail.reload()
	old_estimated = detail.todo[0].estimated
	detail.todo[0].estimated = 120
	try:
		detail.save(ignore_permissions=True)
		print("  ✗ FAIL: Tidak ada error, seharusnya diblokir!")
	except frappe.ValidationError as e:
		if "Cannot modify" in str(e) and "Estimated" in str(e):
			print(f"  ✓ PASS: Edit diblokir dengan benar")
			print(f"  Error message: {str(e)[:100]}...")
		else:
			print(f"  ✗ FAIL: Error tidak sesuai: {str(e)}")
	except Exception as e:
		print(f"  ✗ FAIL: Unexpected error: {str(e)}")
	print()

	# Test 5: Try to edit deadline when Done (should fail)
	print("Test 5: Coba edit deadline saat status Done")
	detail.reload()
	old_deadline = detail.todo[0].deadline
	detail.todo[0].deadline = add_days(nowdate(), 15)
	try:
		detail.save(ignore_permissions=True)
		print("  ✗ FAIL: Tidak ada error, seharusnya diblokir!")
	except frappe.ValidationError as e:
		if "Cannot modify" in str(e) and "Deadline" in str(e):
			print(f"  ✓ PASS: Edit diblokir dengan benar")
			print(f"  Error message: {str(e)[:100]}...")
		else:
			print(f"  ✗ FAIL: Error tidak sesuai: {str(e)}")
	except Exception as e:
		print(f"  ✗ FAIL: Unexpected error: {str(e)}")
	print()

	# Test 6: Edit other fields (notes) should still work
	print("Test 6: Edit field lain (notes) saat status Done - seharusnya bisa")
	detail.reload()
	detail.todo[0].notes = "Updated notes after done"
	try:
		detail.save(ignore_permissions=True)
		frappe.db.commit()
		print(f"  ✓ PASS: Field notes berhasil diupdate")
	except Exception as e:
		print(f"  ✗ FAIL: Tidak bisa edit notes: {str(e)}")
	print()

	# Test 7: Change status to Completed and try to edit (should fail)
	print("Test 7: Ubah status ke Completed dan coba edit assigned_to")
	detail.reload()
	detail.todo[0].status = "✅ Completed"
	detail.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"  ✓ Status berubah ke: {detail.todo[0].status}")

	detail.reload()
	detail.todo[0].assigned_to = "test_validate@example.com"
	try:
		detail.save(ignore_permissions=True)
		print("  ✗ FAIL: Tidak ada error, seharusnya diblokir!")
	except frappe.ValidationError as e:
		if "Cannot modify" in str(e) and "Assigned To" in str(e):
			print(f"  ✓ PASS: Edit diblokir dengan benar pada status Completed")
			print(f"  Error message: {str(e)[:100]}...")
		else:
			print(f"  ✗ FAIL: Error tidak sesuai: {str(e)}")
	except Exception as e:
		print(f"  ✗ FAIL: Unexpected error: {str(e)}")
	print()

	# Cleanup
	print("Cleanup:")
	frappe.delete_doc("Project Detail", detail.name, ignore_permissions=True, force=True)
	frappe.delete_doc("Project", project.name, ignore_permissions=True, force=True)
	frappe.db.commit()
	print("  ✓ Test data cleaned up")

	print()
	print("=" * 70)
	print("SEMUA TEST SELESAI!")
	print("=" * 70)

except Exception as e:
	print(f"\n✗ ERROR: {str(e)}")
	import traceback
	traceback.print_exc()

finally:
	frappe.destroy()
