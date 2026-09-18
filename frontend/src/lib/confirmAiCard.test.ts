import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canConfirmAiPromptFromCard } from './filters'
import type { ProjectItem } from './types'

// rdm3adja48 — hovering a todo card and pressing `c` confirms its AI prompt
// (phase 2 -> 3). `c` already toggled the To Check flag on hover, so the two share
// the key: a phase-2 AI card confirms, every other card keeps toggling To Check.
const todo = (over: Partial<ProjectItem>) =>
  ({ status_key: 'planned', ai_phase: 2, work_mode: 'AI', is_mine: true, ...over }) as ProjectItem

describe('canConfirmAiPromptFromCard', () => {
  it('is true for a Planned, phase-2 AI todo', () => {
    expect(canConfirmAiPromptFromCard(todo({}))).toBe(true)
  })

  it('is false on every other AI phase', () => {
    expect(canConfirmAiPromptFromCard(todo({ ai_phase: 0, work_mode: '' }))).toBe(false)
    expect(canConfirmAiPromptFromCard(todo({ ai_phase: 1 }))).toBe(false)
    expect(canConfirmAiPromptFromCard(todo({ ai_phase: 3 }))).toBe(false)
  })

  it('is false once the todo has left Planned (the prompt is frozen server-side)', () => {
    for (const status_key of ['done', 'checked', 'completed', 'cancelled'] as const) {
      expect(canConfirmAiPromptFromCard(todo({ status_key }))).toBe(false)
    }
  })

  it('falls back to work_mode for payloads that predate ai_phase', () => {
    // No ai_phase -> aiPhaseOf() derives 1 from the AI tag, which is not confirmable.
    expect(canConfirmAiPromptFromCard(todo({ ai_phase: undefined }))).toBe(false)
  })

  it('does not decide permission — the server owns that gate', () => {
    // List payloads carry no can_confirm_prompt, so a non-assignee still passes here
    // and is refused by project_todo.confirm_ai_prompt with its Bahasa message.
    expect(canConfirmAiPromptFromCard(todo({ is_mine: false, can_prioritize: false }))).toBe(true)
  })
})

describe('TodoCard hover shortcut wiring', () => {
  const src = readFileSync(resolve(__dirname, '../components/TodoCard.tsx'), 'utf8')

  it('tries the AI confirm before the To Check toggle, so `c` is not ambiguous', () => {
    const confirmAt = src.indexOf("canConfirmAiPromptFromCard(todo)")
    const checkAt = src.indexOf("e.key === 'c' && todo.is_mine")
    expect(confirmAt).toBeGreaterThan(-1)
    expect(checkAt).toBeGreaterThan(-1)
    expect(confirmAt).toBeLessThan(checkAt)
  })

  it('ignores hover keys while any dialog or drawer is open', () => {
    // Without this an open todo drawer and the card hovered behind it BOTH act on
    // one `c` — and the confirm dialog would name a todo the user is not looking at.
    expect(src).toMatch(/if \(anyModalOpen\(\)\) return/)
  })
})
