import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The server now refuses a duplicate save (ProjectTodo.refuse_duplicate_save), but that
// guard exists for the retry the CLIENT cannot suppress -- a second request after an
// apparently-failed-but-actually-succeeded save. The client's own half is the submit
// button going inert while the first request is in flight, and it was already there
// before any of this. This pins it: without it, every slow save invites a second click
// and the user meets a server error instead of nothing happening.
//
// A source assertion rather than a render test on purpose: every test in src/lib is
// pure, this app ships no testing-library, and adding one to check a single prop is a
// dependency for something a read can prove.
const sheet = readFileSync(
  resolve(__dirname, '../components/CreateProjectItemSheet.tsx'),
  'utf8',
)

describe('create-todo submit guard', () => {
  it('disables the submit button while the create request is in flight', () => {
    expect(sheet).toMatch(/disabled=\{create\.isPending\}/)
  })

  it('shows progress while in flight, so the inert button is explained', () => {
    expect(sheet).toMatch(/create\.isPending\s*\?/)
  })

  it('submits through a single mutation, not a bare fetch per click', () => {
    expect(sheet).toMatch(/create\.mutate\(/)
    expect(sheet).not.toMatch(/fetch\(/)
  })
})
