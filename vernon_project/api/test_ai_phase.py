"""The AI ladder's phase derivation. Pure — no site, no DB.

Run it inside the bench: `bench --site <site> console` then
`from vernon_project.api.test_ai_phase import check; check()`.
"""

from vernon_project.api.project_todo import AI_PHASE_NAMES, ai_phase


def check():
	# Not tagged AI -> phase 0, whatever else is set.
	assert ai_phase("", False, False) == 0
	assert ai_phase("Human", True, True) == 0
	# Tagged but no prompt yet -> phase 1, and confirmation can't skip phase 2.
	assert ai_phase("AI", False, False) == 1
	assert ai_phase("AI", False, True) == 1
	# Prompt written, awaiting a human -> 2. Confirmed -> 3.
	assert ai_phase("AI", True, False) == 2
	assert ai_phase("AI", True, True) == 3
	assert ai_phase("Both", True, True) == 3
	assert set(AI_PHASE_NAMES) == {0, 1, 2, 3}
	return "ai_phase: all assertions passed"


if __name__ == "__main__":
	print(check())
