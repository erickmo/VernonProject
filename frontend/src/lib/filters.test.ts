import { describe, it, expect } from 'vitest'
import { projectInScope } from './filters'
import type { ProjectCard } from './types'

// projectInScope only reads .status; the cast avoids filling in ProjectCard's
// many unrelated display fields for a test that doesn't touch them.
const project = (status: string) => ({ status }) as ProjectCard

// Enum-drift audit finding #2: Project.status has a third real value, Inbox,
// that the 'ongoing' branch didn't handle before — verified by reading this
// was correct; this pins it for real.
describe('projectInScope', () => {
  it('always matches scope "all"', () => {
    expect(projectInScope(project('Ongoing'), 'all')).toBe(true)
    expect(projectInScope(project('Closed'), 'all')).toBe(true)
    expect(projectInScope(project('Inbox'), 'all')).toBe(true)
  })

  it('matches Ongoing projects under the "ongoing" scope', () => {
    expect(projectInScope(project('Ongoing'), 'ongoing')).toBe(true)
  })

  it('surfaces Inbox projects under "ongoing", not nowhere', () => {
    expect(projectInScope(project('Inbox'), 'ongoing')).toBe(true)
    expect(projectInScope(project('Inbox'), 'done')).toBe(false)
  })

  it('matches only Closed projects under the "done" scope', () => {
    expect(projectInScope(project('Closed'), 'done')).toBe(true)
    expect(projectInScope(project('Ongoing'), 'done')).toBe(false)
  })
})
