import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Project-level AI management ships on four surfaces: the project form and the
// project-detail form, in BOTH apps. Source assertions rather than render tests —
// every test in src/lib is pure and neither app carries testing-library, so adding
// one to check a few props would be a dependency for something a read can prove.
const SURFACES = {
  '/m project': '../components/ProjectFormSheet.tsx',
  '/m project detail': '../components/ProjectDetailFormSheet.tsx',
  '/w project': '../../../frontend-web/src/components/ProjectFormDialog.tsx',
  '/w project detail': '../../../frontend-web/src/components/ProjectDetailFormDialog.tsx',
}

function read(rel: string) {
  return readFileSync(resolve(__dirname, rel), 'utf8')
}

describe('AI management reaches both frontends', () => {
  for (const [label, rel] of Object.entries(SURFACES)) {
    it(`${label} offers the tag and both fields`, () => {
      const src = read(rel)
      expect(src).toMatch(/Managed by AI/)
      expect(src).toMatch(/ai_device|aiDevice/)
      expect(src).toMatch(/ai_session_name|aiSession/)
    })

    it(`${label} reveals device and session only once tagged`, () => {
      const src = read(rel)
      // the inputs live behind a conditional on the tag, so an untagged project
      // does not present two fields it will then refuse to save without
      expect(src).toMatch(/\{(!!f\.is_ai_managed|aiManaged) && \(/)
    })

    it(`${label} refuses a tagged record with no device or session`, () => {
      const src = read(rel)
      // mirrors validate_ai_management server-side, so the user is told here
      // rather than bouncing off a MandatoryError
      expect(src).toMatch(/required when Managed by AI is on/)
    })
  }

  it('the create-detail payload carries the fields (it is an explicit allowlist)', () => {
    // useCreateProjectDetail spreads named keys rather than the whole object, so a
    // field missing here is dropped on CREATE while still working on update — a
    // silent half-feature.
    const hooks = read('../hooks/useData.ts')
    for (const key of ['is_ai_managed', 'ai_device', 'ai_session_name']) {
      expect(hooks).toMatch(new RegExp(`input\\.${key} != null`))
    }
  })

  it('does not touch a task’s own AI work mode anywhere', () => {
    // The whole point of the separation: tagging a project changes no task.
    for (const rel of Object.values(SURFACES)) {
      expect(read(rel)).not.toMatch(/work_mode/)
    }
  })
})
