import { strict as assert } from 'node:assert'
import {
  ISSUE_HELP, issueCounts, issueHelp, issueLabel, issueTone, isIssueResolved,
  todoIssueInitial,
} from './todoIssues'
import type { TodoIssue } from './todoIssues'
import type { ProjectItemDetail } from './types'

const issue = (over: Partial<TodoIssue>): TodoIssue => ({
  name: 'T1', to_do: 'x', status: '⚪️ Planned', status_key: 'planned', resolved: false,
  assigned_to: 'a@x.id', assigned_to_name: 'A', deadline: null, deadline_human: null,
  resolved_at_human: null, ...over,
})

// --- resolved means Completed, nothing else -----------------------------------------
assert.equal(isIssueResolved('completed'), true)
for (const k of ['planned', 'done', 'checked', 'cancelled'] as const) {
  assert.equal(isIssueResolved(k), false, k)
}

// --- counts mirror the server (open / resolved / cancelled) -------------------------
assert.deepEqual(issueCounts([]), { open: 0, resolved: 0, cancelled: 0 })
assert.deepEqual(
  issueCounts([issue({ status_key: 'planned' })]),
  { open: 1, resolved: 0, cancelled: 0 },
)
assert.deepEqual(
  issueCounts([issue({ status_key: 'done' }), issue({ status_key: 'checked' })]),
  { open: 2, resolved: 0, cancelled: 0 },
  'done + checked are still mid-approval, not resolved',
)
assert.deepEqual(
  issueCounts([issue({ status_key: 'completed', resolved: true })]),
  { open: 0, resolved: 1, cancelled: 0 },
)
assert.deepEqual(
  issueCounts([issue({ status_key: 'cancelled' })]),
  { open: 0, resolved: 0, cancelled: 1 },
  'a cancelled issue is neither open nor resolved',
)
assert.deepEqual(
  issueCounts([
    issue({ status_key: 'planned' }), issue({ status_key: 'completed', resolved: true }),
    issue({ status_key: 'cancelled' }), issue({ status_key: 'done' }),
  ]),
  { open: 2, resolved: 1, cancelled: 1 },
)

// --- headline label -----------------------------------------------------------------
assert.equal(issueLabel({ open: 0, resolved: 0, cancelled: 0 }), 'No issues')
assert.equal(issueLabel({ open: 2, resolved: 1, cancelled: 0 }), '2 open · 1 resolved')
assert.equal(issueLabel({ open: 0, resolved: 3, cancelled: 0 }), 'All 3 resolved')
assert.equal(issueLabel({ open: 1, resolved: 0, cancelled: 2 }), '1 open · 2 cancelled')
assert.equal(issueLabel({ open: 0, resolved: 0, cancelled: 1 }), '1 cancelled')

// --- tone drives the chip colour ----------------------------------------------------
assert.equal(issueTone({ open: 1, resolved: 0, cancelled: 0 }), 'open')
assert.equal(issueTone({ open: 0, resolved: 2, cancelled: 0 }), 'clear')
assert.equal(issueTone({ open: 0, resolved: 0, cancelled: 0 }), 'none')

// --- create-form prefill ------------------------------------------------------------
const host = {
  name: 'HOST', to_do: 'Build the thing', assigned_to: 'a@x.id',
  deadline: '2999-01-01', group: 'G', level_type: 'General', level_id: 'L1',
} as unknown as ProjectItemDetail
const seed = todoIssueInitial(host, '2026-08-24')
assert.equal(seed.toDo, '', 'title starts empty — the reporter says what is wrong')
assert.equal(seed.assignedTo, 'a@x.id', 'defaults to whoever owns the work')
assert.equal(seed.startDate, '2026-08-24')
assert.equal(seed.deadline, '2999-01-01', 'inherits the host deadline when still ahead')
assert.equal(seed.group, 'G')
assert.equal(seed.levelId, 'L1')
assert.equal(seed.estimated, undefined, 'the fix is sized by the reporter — it drives points')

// A host already past its deadline must not seed a deadline in the past.
const late = todoIssueInitial({ ...host, deadline: '2020-01-01' } as ProjectItemDetail, '2026-08-24')
assert.equal(late.deadline, '2026-08-24')
// No host deadline at all → today, never undefined/empty.
const undated = todoIssueInitial({ ...host, deadline: null } as ProjectItemDetail, '2026-08-24')
assert.equal(undated.deadline, '2026-08-24')

// --- (i) help copy ------------------------------------------------------------------
for (const h of ISSUE_HELP) {
  assert.ok(h.term && h.title && h.body, `incomplete help entry ${h.term}`)
  assert.equal(issueHelp(h.term), h)
}
assert.equal(issueHelp('nope'), undefined)
// Every term the screens reference must exist, or the (i) renders nothing.
for (const term of [
  'apa-itu', 'kapan-selesai', 'dibatalkan', 'tidak-mengunci', 'siapa-boleh',
  'poin', 'bersarang',
]) {
  assert.ok(issueHelp(term), `missing help for ${term}`)
}
assert.equal(new Set(ISSUE_HELP.map((h) => h.term)).size, ISSUE_HELP.length, 'duplicate terms')

console.log('todoIssues self-check OK')
