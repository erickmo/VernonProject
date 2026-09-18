import { isCertificatePath } from './certDrawer'
import assert from 'node:assert/strict'
// the form, existing or new → the overlay route
assert.equal(isCertificatePath('/certificates/CERT-0001'), true)
assert.equal(isCertificatePath('/certificates/new'), true)
// the list it opens over, and anything deeper → NOT the overlay
assert.equal(isCertificatePath('/certificates'), false)
assert.equal(isCertificatePath('/certificates/'), false)
assert.equal(isCertificatePath('/certificates/CERT-0001/verify'), false)
assert.equal(isCertificatePath('/'), false)
assert.equal(isCertificatePath('/certificate/CERT-0001'), false)
console.log('certDrawer.selfcheck: all assertions passed')
