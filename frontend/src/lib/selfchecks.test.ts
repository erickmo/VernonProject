import { describe, it } from 'vitest'

// The 22 *.selfcheck.ts files assert at import time (node:assert, top level), but
// vitest only collects `*.test.ts`, nothing in either package.json references them,
// and no test imported them — so 481 assertions had been running nowhere. Importing
// each one here is the whole fix: an import that throws is a failing test.
//
// Both frontends are covered from here because /m is the only project with a test
// runner, and the /w selfchecks import nothing but their own sibling module and
// node:assert, so they resolve fine from this side.
//
// Adding a selfcheck file needs no change here — the glob picks it up.
const mobile = import.meta.glob('./*.selfcheck.ts')
const web = import.meta.glob('../../../frontend-web/src/lib/*.selfcheck.ts')

describe('selfcheck files actually run', () => {
  for (const [path, load] of Object.entries({ ...mobile, ...web })) {
    it(`${path} passes its own assertions`, async () => {
      await load()
    })
  }
})
