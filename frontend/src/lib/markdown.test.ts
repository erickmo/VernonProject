// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { marked } from 'marked'
import { renderNoteMarkdown } from './markdown'

describe('renderNoteMarkdown — rendering (AC1, AC2, AC4, AC8)', () => {
  it('renders headings, not literal # characters', () => {
    const html = renderNoteMarkdown('# Heading')
    expect(html).toContain('<h1')
    expect(html).not.toContain('#')
  })

  it('renders bullet and numbered lists', () => {
    expect(renderNoteMarkdown('- one\n- two')).toContain('<ul')
    expect(renderNoteMarkdown('1. first\n2. second')).toContain('<ol')
  })

  it('renders bold, italic, and inline code', () => {
    const html = renderNoteMarkdown('**bold** *italic* `code`')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders a fenced code block as a block, preserving indentation', () => {
    const html = renderNoteMarkdown('```\n  indented line\n```')
    expect(html).toContain('<pre')
    expect(html).toContain('  indented line')
  })

  it('renders a blockquote', () => {
    expect(renderNoteMarkdown('> a quote')).toContain('<blockquote')
  })

  it('renders a GFM table', () => {
    const html = renderNoteMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table')
    expect(html).toContain('<td')
  })

  it('a single newline is a line break, not silently joined (AC2)', () => {
    const html = renderNoteMarkdown('line one\nline two')
    expect(html).toContain('<br>')
  })

  it('plain text with a literal # and * is not swallowed (AC4)', () => {
    // No blank line before "* not a list" -> marked's `breaks` mode keeps this
    // one paragraph with a <br>, not a list -- either way, the characters
    // must survive, not vanish.
    const html = renderNoteMarkdown('just a # and a * here, not markdown')
    expect(html).toContain('#')
    expect(html).toContain('*')
  })

  it('empty note renders nothing (AC8)', () => {
    expect(renderNoteMarkdown('')).toBe('')
  })
})

describe('renderNoteMarkdown — security (belt: HTML passthrough disabled)', () => {
  it('a literal <script> in the source is shown as text, never live markup', () => {
    const html = renderNoteMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('<img src=x onerror=...> never becomes a live element with the handler', () => {
    const html = renderNoteMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toMatch(/<img[^>]*onerror/i)
  })

  it('<svg onload=...> never survives as a live element with the handler', () => {
    const html = renderNoteMarkdown('<svg onload="alert(1)"></svg>')
    // The payload must not become a real <svg> tag with a live onload
    // attribute -- it's escaped to inert visible text instead (same as the
    // <script> case above), so "onload" surviving as plain characters inside
    // &lt;...&gt; is correct and safe; a genuine unescaped <svg tag would not be.
    expect(html).not.toMatch(/<svg[^&]/i)
    expect(html).toContain('&lt;svg')
  })
})

describe('renderNoteMarkdown — security (brace: sanitizeHtml on the output)', () => {
  it('a javascript: markdown link is not clickable', () => {
    const html = renderNoteMarkdown('[x](javascript:alert(1))')
    expect(html).not.toMatch(/href=["']?\s*javascript:/i)
  })

  it('a data: markdown link is not clickable', () => {
    const html = renderNoteMarkdown('[x](data:text/html,<script>alert(1)</script>)')
    expect(html).not.toMatch(/href=["']?\s*data:/i)
  })

  it('a normal https:// link keeps its href and gets rel="noopener noreferrer"', () => {
    const html = renderNoteMarkdown('[click](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('an image from an untrusted host is dropped, not just its handler', () => {
    const html = renderNoteMarkdown('![x](https://evil.example/track.png)')
    expect(html).not.toContain('<img')
  })
})

describe('renderNoteMarkdown — performance (memoised per exact source string)', () => {
  it('does not re-parse the same note text twice', () => {
    const spy = vi.spyOn(marked, 'parse')
    const text = 'some **note** text, unique-' + Math.random()
    const first = renderNoteMarkdown(text)
    const callsAfterFirst = spy.mock.calls.length
    const second = renderNoteMarkdown(text)
    expect(second).toBe(first)
    expect(spy.mock.calls.length).toBe(callsAfterFirst) // no new parse call
    spy.mockRestore()
  })

  it('does re-parse when the source text actually changes', () => {
    const spy = vi.spyOn(marked, 'parse')
    const a = renderNoteMarkdown('unique-a-' + Math.random())
    const callsAfterA = spy.mock.calls.length
    renderNoteMarkdown('unique-b-' + Math.random())
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterA)
    spy.mockRestore()
  })
})
