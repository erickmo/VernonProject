import { describe, expect, it } from 'vitest'
import { certificateSteps } from './certificate'

const line = (score: number | null) => ({ key: 'k', label: 'l', weight: 1, score, comment: '' })
const doc = (status: 'Draft' | 'Pending HR' | 'Published' | 'Revoked', scores: (number | null)[] = [null]) =>
  ({ status, rubric: scores.map(line) }) as never

const states = (s: ReturnType<typeof certificateSteps>) => s.map((x) => `${x.key}:${x.state}`)

describe('certificateSteps', () => {
  it('starts a new certificate at step 1, for HR and leaders alike', () => {
    expect(states(certificateSteps(null, true))).toEqual(['intern:current', 'rubric:todo', 'publish:todo', 'share:todo'])
    expect(states(certificateSteps(null, false))[0]).toBe('intern:current')
  })

  it('gives leaders a send-to-HR step that HR does not need', () => {
    expect(certificateSteps(null, false).map((s) => s.key)).toEqual(['intern', 'rubric', 'submit', 'publish', 'share'])
    expect(certificateSteps(null, true).map((s) => s.key)).not.toContain('submit')
  })

  it('moves on once the rubric is fully scored', () => {
    expect(states(certificateSteps(doc('Draft', [80, null]), true))[1]).toBe('rubric:current')
    expect(states(certificateSteps(doc('Draft', [80, 90]), true))).toEqual(['intern:done', 'rubric:done', 'publish:current', 'share:todo'])
  })

  it('waits on HR after a leader submits, and ends on view-and-share once published', () => {
    expect(states(certificateSteps(doc('Pending HR'), false))).toEqual(
      ['intern:done', 'rubric:done', 'submit:done', 'publish:current', 'share:todo'])
    expect(states(certificateSteps(doc('Published'), true)).slice(-1)).toEqual(['share:current'])
  })

  it('treats a revoked certificate as finished and says so', () => {
    const s = certificateSteps(doc('Revoked'), true)
    expect(s.every((x) => x.state === 'done')).toBe(true)
    expect(s[s.length - 1].desc).toMatch(/dicabut/)
  })
})
