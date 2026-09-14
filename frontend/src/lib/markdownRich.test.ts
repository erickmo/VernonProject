// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { domPosition, encodeMdUrl, fromDom, parseTokens, sourceOffset, toNodes } from './markdownRich'
import { isAllowedImgSrc } from './format'

// The real rule from format.ts, not a copy: a stubbed allow-list here would pass
// whatever this file decided, and prove nothing about what the editor renders.
const build = (source: string) => {
  const root = document.createElement('div')
  toNodes(source, document, isAllowedImgSrc).forEach((n) => root.appendChild(n))
  return root
}

describe('markdownRich round-trip', () => {
  it('comment/note source survives DOM and back, tokens in order', () => {
    for (const src of [
      'plain text',
      '![](/files/a.png)',
      '[@Budi Santoso](mention:budi@vernon.id)',
      'hi [@All](mention:@all) look ![](/files/b.png) then ![](/files/c.png) end',
      '**bold** and\n- a list\n- stays literal',
      'a < b > c & d',
    ]) {
      expect(fromDom(build(src))).toBe(src)
    }
  })

  it("ignores the browser's trailing <br> filler, so an emptied editor reads as empty", () => {
    const root = build('')
    root.appendChild(document.createElement('br'))
    expect(fromDom(root)).toBe('')
    const withText = build('hi')
    withText.appendChild(document.createElement('br'))
    expect(fromDom(withText)).toBe('hi')
  })

  it('keeps an image alt rather than dropping it', () => {
    expect(fromDom(build('![diagram](/files/a.png)'))).toBe('![diagram](/files/a.png)')
  })

  it('shows an image whose stored URL was &-escaped by the server', () => {
    // Frappe escapes & across the whole field once any real HTML tag is present
    // (bleach on a Text Editor note; always on Comment.content) — verified live.
    const img = build('![](/files/c.png?a=1&amp;b=2)').querySelector('img')
    expect(img?.getAttribute('src')).toBe('/files/c.png?a=1&b=2')
  })

  // h1n29go5db / dlhumm1uca: real uploads are named after the file the user
  // picked — "Screenshot 2026-09-13 at 7.51.36 PM.png" — so the stored markdown
  // is `![](/files/Screenshot 2026-09-13 ...png)`. A space ends a bare markdown
  // destination, so this token was not recognised at all and the composer drew
  // the raw `![](...)` source instead of the picture.
  it('shows an image whose filename contains spaces', () => {
    const src = '![](/files/Screenshot 2026-09-14 10103216b089.png)'
    const img = build(src).querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/files/Screenshot 2026-09-14 10103216b089.png')
    expect(fromDom(build(src))).toBe(src)
  })

  it('parses a spaced filename as one image token, not as text', () => {
    expect(parseTokens('![](/files/WhatsApp Image 2026-09-14 at 09.00.31.jpeg)')).toEqual([
      { t: 'img', url: '/files/WhatsApp Image 2026-09-14 at 09.00.31.jpeg', alt: '' },
    ])
  })

  it('never builds an <img> for a remote or data: URL — it stays plain text', () => {
    for (const bad of ['![](https://tracker.example.com/p.gif)', '![](data:image/gif;base64,R0lGOD)']) {
      const root = build(bad)
      expect(root.querySelector('img')).toBeNull()
      expect(fromDom(root)).toBe(bad)
    }
  })

  it('renders a mention as its name only, with the address kept off-screen', () => {
    const span = build('[@Budi](mention:budi@vernon.id)').querySelector('[data-mention]') as HTMLElement
    expect(span.textContent).toBe('@Budi')
    expect(span.textContent).not.toContain('mention:')
    expect(span.getAttribute('data-mention')).toBe('budi@vernon.id')
  })
})

describe('markdownRich caret mapping', () => {
  const src = 'hi [@Budi](mention:b@x.com) there'
  it('maps a caret in the text after a mention to its source index', () => {
    const root = build(src)
    const tail = root.childNodes[2] // " there"
    expect(sourceOffset(root, tail, 3)).toBe(src.indexOf(' there') + 3)
  })
  it('maps a caret inside the chip to the mention token start', () => {
    const root = build(src)
    const chip = root.childNodes[1]
    expect(sourceOffset(root, chip.firstChild!, 2)).toBe(3)
  })
  it('round-trips an index back to a DOM point', () => {
    const root = build(src)
    const i = src.indexOf(' there') + 3
    const [node, off] = domPosition(root, i)
    expect(sourceOffset(root, node, off)).toBe(i)
  })
})

describe('parseTokens', () => {
  it('leaves a non-mention link alone', () => {
    expect(parseTokens('see [docs](https://x.com)')).toEqual([{ t: 'text', v: 'see [docs](https://x.com)' }])
  })
})

describe('encodeMdUrl', () => {
  // Angle brackets are markdown's other legal way to hold a spaced destination
  // and are unusable here: Frappe's Comment.validate entity-escapes < and > on
  // every save, so `![](</files/a b.png>)` comes back as `&lt;...&gt;`.
  // Percent-encoding is what survives the round trip.
  it('encodes exactly the characters that end a markdown destination', () => {
    expect(encodeMdUrl('/files/Screenshot 2026-09-14 x.png')).toBe('/files/Screenshot%202026-09-14%20x.png')
    expect(encodeMdUrl('/files/report (final).pdf')).toBe('/files/report%20%28final%29.pdf')
  })

  it('leaves a URL that needs nothing untouched, and is safe to apply twice', () => {
    const clean = '/files/53058894050.webp'
    expect(encodeMdUrl(clean)).toBe(clean)
    const once = encodeMdUrl('/files/a b.png')
    expect(encodeMdUrl(once)).toBe(once)
  })

  it('does not touch a query string — & is the server escaping bug, handled separately', () => {
    expect(encodeMdUrl('/files/a.png?x=1&y=2')).toBe('/files/a.png?x=1&y=2')
  })
})
