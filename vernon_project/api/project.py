import frappe

@frappe.whitelist()
def get_project_team_members(project_name):
	"""
	Retrieves the team members associated with a given project.
	
	Args:
			project_name (str): The name of the project.
			
	Returns:
			list: A list of team member names associated with the project.
	"""
	try:
		# Get Project
		project = frappe.get_doc("Project", project_name)
		
		# Extract team member names
		member_names = [member.user for member in project.team_members]
		
		return member_names

	except frappe.DoesNotExistError:
			return []