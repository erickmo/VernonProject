import { isTodoPath } from './todoDrawer'
import assert from 'node:assert/strict'
// bare /project-item/:name → drawer route
assert.equal(isTodoPath('/project-item/T1'), true)
assert.equal(isTodoPath('/project-item/PROJ-ITEM-0001'), true)
// nested item route, sibling detail route, and non-todo paths → NOT the drawer
assert.equal(isTodoPath('/project-item/T1/sub'), false)
assert.equal(isTodoPath('/project-detail/T1'), false)
assert.equal(isTodoPath('/project-item'), false)
assert.equal(isTodoPath('/project-item/'), false)
assert.equal(isTodoPath('/'), false)
assert.equal(isTodoPath('/projects'), false)
console.log('todoDrawer.selfcheck: all assertions passed')
