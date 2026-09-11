import { describe, expect, it } from 'vitest'
import { applyFormat, mentionQueryAt, mentionToken } from './markdownEdit'

describe('applyFormat (markdown toolbar)', () => {
  it('wraps the selection, and leaves it selected inside the markers', () => {
    expect(applyFormat('a word b', 2, 6, 'bold')).toEqual({ value: 'a **word** b', start: 4, end: 8 })
    expect(applyFormat('x', 1, 1, 'italic')).toEqual({ value: 'x_miring_', start: 2, end: 8 })
  })
  it('turns a selection into a link with the URL selected for typing', () => {
    const r = applyFormat('see docs', 4, 8, 'link')
    expect(r.value).toBe('see [docs](https://)')
    expect(r.value.slice(r.start, r.end)).toBe('https://')
  })
  it('prefixes every selected line for lists, checklists and quotes — once', () => {
    expect(applyFormat('one\ntwo', 0, 7, 'list').value).toBe('- one\n- two')
    expect(applyFormat('- one\ntwo', 0, 9, 'list').value).toBe('- one\n- two')
    expect(applyFormat('x\ntask', 3, 3, 'task').value).toBe('x\n- [ ] task')
  })
})

describe('mentions', () => {
  it('finds the @query right before the caret, not inside an email', () => {
    expect(mentionQueryAt('hi @bu', 6)).toEqual({ query: 'bu', from: 3 })
    expect(mentionQueryAt('mail a@b', 8)).toBeNull()
  })
  it('writes a markdown link the server and renderer both read', () => {
    expect(mentionToken('b@x.com', 'Budi [ops]')).toBe('[@Budi ops](mention:b@x.com)')
  })
})
