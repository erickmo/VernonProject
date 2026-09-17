import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildProjectOptions, buildDetailOptions } from './useMoveTodosController'

// ar7b2vuon6 — moving a task to ANOTHER project. The picker's two lists are the
// part with real rules in them, so they are pure functions and tested directly.
// The rendering half is checked by reading both frontends' sources: this app ships
// no DOM/testing-library (vitest runs in the `node` environment, see
// frontend/vite.config.ts) so there is no way to mount a component here — the same
// reason createTodoSubmitGuard.test.ts asserts on source.

const seed = { project: 'PRJ-1', project_name: 'Alpha', project_detail: 'PD-1' }

describe('buildProjectOptions', () => {
  it('offers the task’s own project first, so an in-project move stays the default', () => {
    const opts = buildProjectOptions(seed, [{ name: 'PRJ-2', project_name: 'Beta' }])
    expect(opts[0]).toEqual({ value: 'PRJ-1', label: 'Alpha' })
  })

  it('lists the projects the server would accept as destinations', () => {
    const opts = buildProjectOptions(seed, [
      { name: 'PRJ-2', project_name: 'Beta' },
      { name: 'PRJ-3', project_name: 'Gamma' },
    ])
    expect(opts.map((o) => o.value)).toEqual(['PRJ-1', 'PRJ-2', 'PRJ-3'])
  })

  it('never lists the current project twice', () => {
    const opts = buildProjectOptions(seed, [{ name: 'PRJ-1', project_name: 'Alpha' }])
    expect(opts).toHaveLength(1)
  })

  it('is just the current project while the destination list is still loading', () => {
    expect(buildProjectOptions(seed, undefined)).toEqual([{ value: 'PRJ-1', label: 'Alpha' }])
  })

  it('is empty with no task, so the picker cannot submit a nameless project', () => {
    expect(buildProjectOptions(null, [{ name: 'PRJ-2', project_name: 'Beta' }])).toEqual([])
  })
})

describe('buildDetailOptions', () => {
  const details = [
    { name: 'PD-1', title: 'Source' },
    { name: 'PD-2', title: 'Other' },
  ]

  it('hides the detail the task is already in when staying in the same project', () => {
    expect(buildDetailOptions(details, 'PD-1').map((o) => o.value)).toEqual(['PD-2'])
  })

  it('offers every detail of a different project', () => {
    expect(buildDetailOptions(details, undefined).map((o) => o.value)).toEqual(['PD-1', 'PD-2'])
  })

  it('is empty while the chosen project is still loading', () => {
    expect(buildDetailOptions(undefined, 'PD-1')).toEqual([])
  })
})

describe('the move dialog on both frontends', () => {
  const sources = {
    '/m MoveTodosSheet': readFileSync(
      resolve(__dirname, '../components/MoveTodosSheet.tsx'),
      'utf8',
    ),
    '/w MoveTodosDialog': readFileSync(
      resolve(__dirname, '../../../frontend-web/src/components/MoveTodosDialog.tsx'),
      'utf8',
    ),
  }

  for (const [name, src] of Object.entries(sources)) {
    it(`${name} lets the user pick a destination project`, () => {
      expect(src).toMatch(/Proyek tujuan/)
      expect(src).toMatch(/value=\{c\.destProject\}/)
      expect(src).toMatch(/onChange=\{c\.setDestProject\}/)
      expect(src).toMatch(/options=\{c\.projectOptions\}/)
    })

    it(`${name} still picks the destination detail`, () => {
      expect(src).toMatch(/value=\{c\.destination\}/)
      expect(src).toMatch(/options=\{c\.destinationOptions\}/)
    })

    it(`${name} warns that a cross-project move needs the assignee on that team`, () => {
      expect(src).toMatch(/c\.isCrossProject/)
    })

    it(`${name} cannot submit twice while the move is in flight`, () => {
      expect(src).toMatch(/disabled=\{!c\.canSubmit\}/)
    })
  }
})
