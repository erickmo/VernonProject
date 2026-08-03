// @ts-nocheck — test-only file, run via esbuild; not part of the app bundle.
// Run: npx esbuild --bundle src/lib/getStarted.selfcheck.ts --platform=node | node
import assert from 'node:assert'
import {
  getStartedSteps,
  getStartedProgress,
  getStartedComplete,
  shouldAutoShowGetStarted,
  GETSTARTED_SEEN_KEY,
} from './getStarted'

function boot(over) {
  return {
    user: 'a@b.c', full_name: 'A', image: null, roles: [], is_leader: false,
    settings: {}, employee: {}, ...over,
  }
}

// Empty account → nothing done, 3 steps total.
const empty = boot({})
assert.deepEqual(getStartedProgress(empty), { done: 0, total: 3 }, 'empty → 0/3')
assert.equal(getStartedComplete(empty), false)

// Profile ticks on bio OR phone; blank whitespace does not count.
assert.equal(getStartedSteps(boot({ employee: { bio: 'hi' } }))[0].done, true, 'bio → profile done')
assert.equal(getStartedSteps(boot({ employee: { phone: '08' } }))[0].done, true, 'phone → profile done')
assert.equal(getStartedSteps(boot({ employee: { bio: '   ' } }))[0].done, false, 'blank bio → not done')

// Superpower from the settings flag; avatar from avatar_config presence.
assert.equal(getStartedSteps(boot({ settings: { has_superpower: 1 } }))[1].done, true, 'superpower flag')
assert.equal(getStartedSteps(boot({ settings: { has_superpower: 0 } }))[1].done, false, 'no superpower')
assert.equal(getStartedSteps(boot({ avatar_config: { skin: 1 } }))[2].done, true, 'avatar set')

// All three → complete.
const full = boot({ employee: { bio: 'x' }, settings: { has_superpower: 1 }, avatar_config: { skin: 1 } })
assert.deepEqual(getStartedProgress(full), { done: 3, total: 3 }, 'full → 3/3')
assert.equal(getStartedComplete(full), true)

// Auto-show: incomplete + unseen → yes; complete → no; already seen → no.
const store = {}
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
}
assert.equal(shouldAutoShowGetStarted(full), false, 'complete → no auto-show')
assert.equal(shouldAutoShowGetStarted(empty), true, 'incomplete + unseen → auto-show')
assert.equal(shouldAutoShowGetStarted(null), false, 'no boot → no auto-show')
store[GETSTARTED_SEEN_KEY] = '1'
assert.equal(shouldAutoShowGetStarted(empty), false, 'seen → no auto-show')

console.log('getStarted.selfcheck: all assertions passed')
