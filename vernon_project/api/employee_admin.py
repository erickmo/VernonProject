"""Admin endpoint that saves a user's account and Employee Profile atomically.

The mobile and web admin forms used to call `update_user` then
`update_employee_profile` back to back — two HTTP requests, two transactions.
If the second failed, the first had already committed, leaving a silent partial
save (account updated, legal/contract fields not) behind an error toast.

Running both writes inside this single request makes them share one
transaction: if the profile save raises, Frappe rolls the whole request back,
so the user save is undone too.
"""

import frappe

from vernon_project.api.mobile import (
	_require_system_manager,
	update_employee_profile,
	update_user,
)


@frappe.whitelist()
def save_user_with_profile(
	user,
	full_name=None,
	roles=None,
	enabled=None,
	member_type=None,
	nik_ktp=None,
	npwp=None,
	bpjs_kesehatan=None,
	bpjs_ketenagakerjaan=None,
	bank_name=None,
	bank_account_no=None,
	bank_account_holder=None,
	employment_status=None,
	job_title=None,
	date_joined=None,
	contract_start=None,
	contract_end=None,
	annual_leave_quota=None,
	prior_leave_taken=None,
):
	"""Atomically save User account fields + Employee Profile (System Manager only).

	Both callees also enforce System Manager; the guard here just fails fast
	before either write. Both write via `doc.save()` with no intermediate
	`frappe.db.commit()`, so they commit together at request end (or roll back
	together on error).

	EVERY argument means "leave as is" when omitted. Two of them did not, and both
	were destructive, so if you have seen older code or notes about this endpoint:

	* `roles` — replaces the user's VERNON_ROLES set wholesale (Project Owner,
	  Project Leader, Project Admin, Project Team, Points Granter, HR Manager,
	  AI User). Roles outside that set, System Manager included, are untouched.
	  Send the COMPLETE list you want them to end up with; send [] to clear them
	  all. Omitting it used to parse as the empty list and strip every Vernon role
	  the user had, so a job-title edit removed their access — it now leaves roles
	  untouched instead.
	* `enabled` — used to default to 1 and be written every call, so omitting it
	  re-enabled a disabled account. Omitting it now leaves the account as it is;
	  pass 0 or 1 to change it.

	Account fields (go to the User record): `full_name`, `roles`, `enabled`,
	`member_type` ("", "Internal Team" or "Intern"; anything else raises).

	Employee Profile fields: `nik_ktp`, `npwp`, `bpjs_kesehatan`,
	`bpjs_ketenagakerjaan`, `bank_name`, `bank_account_no`, `bank_account_holder`,
	`employment_status`, `job_title`, `date_joined`, `contract_start`,
	`contract_end`, `annual_leave_quota`, `prior_leave_taken`. These are the
	legal/contract/quota fields a person cannot set on themselves — the
	self-service counterpart is `mobile.update_my_profile`, which reaches none of
	them.

	Guest and Administrator cannot be edited here, and you cannot disable your own
	account. Disabling one also drops that user from every project team roster.
	"""
	_require_system_manager()
	update_user(
		user,
		full_name=full_name,
		roles=roles,
		enabled=enabled,
		member_type=member_type,
	)
	update_employee_profile(
		user,
		nik_ktp=nik_ktp,
		npwp=npwp,
		bpjs_kesehatan=bpjs_kesehatan,
		bpjs_ketenagakerjaan=bpjs_ketenagakerjaan,
		bank_name=bank_name,
		bank_account_no=bank_account_no,
		bank_account_holder=bank_account_holder,
		employment_status=employment_status,
		job_title=job_title,
		date_joined=date_joined,
		contract_start=contract_start,
		contract_end=contract_end,
		annual_leave_quota=annual_leave_quota,
		prior_leave_taken=prior_leave_taken,
	)
	return {"name": user}
