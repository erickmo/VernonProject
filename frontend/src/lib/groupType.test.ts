import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GROUP_TYPES, GROUP_TYPE_HINT, GROUP_TYPE_LABELS } from './groupType'

// Read the real doctype, not a copy of it: the whole point of these assertions is
// that the form and the server cannot drift apart.
const groupJson = JSON.parse(
  readFileSync(new URL('../../../vernon_project/vernon_project/doctype/group/group.json', import.meta.url), 'utf8'),
)
const field = groupJson.fields.find((f: { fieldname: string }) => f.fieldname === 'group_type')

describe('group_type, as the Group forms offer it', () => {
  it('is a field the doctype actually has', () => {
    expect(field).toBeDefined()
    expect(field.fieldtype).toBe('Select')
  })

  it('offers exactly the options the doctype accepts, blank included', () => {
    expect(field.options.split('\n')).toEqual([...GROUP_TYPES])
  })

  it('labels every option it offers', () => {
    for (const t of GROUP_TYPES) expect(GROUP_TYPE_LABELS[t]).toBeTruthy()
  })

  it('shows the doctype own description as the hint, so the explanation is written once', () => {
    expect(GROUP_TYPE_HINT).toBe(field.description)
  })
})
