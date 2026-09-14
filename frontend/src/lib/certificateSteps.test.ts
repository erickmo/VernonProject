import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CERT_SECTIONS, certSections, certificateSteps } from './certificate'

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

// cqf4pucpee — the form must read top-to-bottom in the same order as the steps card, and
// step/field text must never be squeezed into columns so narrow a label wraps every few letters.
const MOBILE = readFileSync(resolve(__dirname, '../pages/CertificateScreen.tsx'), 'utf8')
const WEB = readFileSync(resolve(__dirname, '../../../frontend-web/src/pages/Certificate.tsx'), 'utf8')
const WEB_LIST = readFileSync(resolve(__dirname, '../../../frontend-web/src/pages/Certificates.tsx'), 'utf8')
const numbered = (s: ReturnType<typeof certSections>) => s.map((x) => `${x.n}:${x.key}`)

describe('certSections — the form follows the steps', () => {
  it('numbers each form section with the step it covers, for HR and leaders', () => {
    expect(numbered(certSections(certificateSteps(null, true)))).toEqual(['1:intern', '2:rubric', '3:status', '4:share'])
    // A leader's status section covers "send to HR" (3) and "HR publishes" (4), so sharing is 5.
    expect(numbered(certSections(certificateSteps(null, false)))).toEqual(['1:intern', '2:rubric', '3:status', '5:share'])
  })

  it('titles sections with the words the steps card uses', () => {
    const hr = certSections(certificateSteps(null, true))
    const lead = certSections(certificateSteps(null, false))
    expect(hr.map((s) => s.title)).toEqual(['Pilih peserta & periode', 'Isi penilaian pembimbing', 'Terbitkan', 'Lihat & bagikan'])
    expect(lead[2].title).toBe('Ajukan & terbitkan')
  })

  it('marks the section holding the current step as current, earlier ones done', () => {
    const pending = certSections(certificateSteps(doc('Pending HR'), false))
    expect(pending.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo'])
    expect(pending[2].desc).toMatch(/Menunggu HR/)
    const published = certSections(certificateSteps(doc('Published'), true))
    expect(published.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current'])
  })

  it('renders the sections in step order on both detail screens', () => {
    for (const src of [MOBILE, WEB]) {
      const at = CERT_SECTIONS.map(({ key }) => src.indexOf(`section={sec.${key}}`))
      expect(at.every((i) => i >= 0)).toBe(true)
      expect([...at].sort((a, b) => a - b)).toEqual(at)
    }
  })

  it('keeps step and field text readable instead of squeezing it into narrow equal columns', () => {
    for (const src of [WEB, WEB_LIST]) expect(src).not.toMatch(/auto-cols-fr/)
    // Field grids wrap to a new row before a cell gets narrower than its label needs.
    expect(WEB).toMatch(/minmax\(/)
  })
})
