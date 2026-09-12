import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AI_PHASES, aiPhaseOf } from './filters'
import type { ProjectItem } from './types'

// `ai_in_progress` is orthogonal to the phase ladder: the ladder tracks the PROMPT
// (tagged -> drafted -> human-confirmed) and is monotonic, this tracks whether an
// agent is running and comes and goes. These pin that the visual extends the existing
// AI_PHASES scheme rather than forking it, and that the running state is conveyed by
// more than an animation.
const CARD = readFileSync(resolve(__dirname, '../components/TodoCard.tsx'), 'utf8')
const WEB = readFileSync(
  resolve(__dirname, '../../../frontend-web/src/pages/ProjectItem.tsx'),
  'utf8',
)

function todo(over: Partial<ProjectItem>): ProjectItem {
  return { work_mode: 'AI', ai_phase: 3, ...over } as ProjectItem
}

describe('ai_in_progress does not disturb the phase ladder', () => {
  it('leaves the derived phase alone whether or not an agent is running', () => {
    expect(aiPhaseOf(todo({ ai_in_progress: true }))).toBe(3)
    expect(aiPhaseOf(todo({ ai_in_progress: false }))).toBe(3)
  })

  it('keeps the phase table keyed only by phase', () => {
    // If a fourth phase had been added instead, this record would have grown a key
    // and every consumer switching on phase would need updating.
    expect(Object.keys(AI_PHASES).sort()).toEqual(['0', '1', '2', '3'])
  })

  it('still reports a phase for a running task that was never tagged', () => {
    expect(aiPhaseOf(todo({ work_mode: 'Human', ai_phase: 0, ai_in_progress: true }))).toBe(0)
  })
})

describe('the running state is visible in both frontends', () => {
  for (const [label, src] of [['/m TodoCard', CARD], ['/w ProjectItem', WEB]] as const) {
    it(`${label} extends the existing AI chip rather than forking it`, () => {
      expect(src).toMatch(/AI_PHASES\[/)
      expect(src).toMatch(/ai_in_progress/)
    })

    it(`${label} states the running state in text, not colour or motion alone`, () => {
      // Accessibility: a ring plus an aria-label/title, so the state survives
      // reduced-motion and does not rely on the gradient.
      expect(src).toMatch(/sedang mengerjakan/)
      expect(src).toMatch(/aria-label=/)
    })

    it(`${label} gates the pulse on motion-safe`, () => {
      expect(src).toMatch(/motion-safe:animate-pulse/)
    })
  }
})
