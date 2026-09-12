// 41j1jiea7l: the composer shows an image and a mention as themselves, not as
// markdown source. A <textarea> cannot do that — hiding "](mention:x)" changes
// the text's width and the caret stops lining up with what is drawn — so the
// editor is a contentEditable holding plain text plus exactly TWO atomic inline
// nodes. These helpers are the whole translation between that DOM and the
// markdown string that is still the stored value; everything else (bold, lists,
// links) stays literal markdown characters in a text node, untouched.

export type RichToken =
  | { t: 'text'; v: string }
  | { t: 'img'; url: string; alt: string }
  | { t: 'mention'; email: string; name: string }

// ![alt](url)  |  [@Name](mention:email)
const TOKEN_RE = /!\[([^\]]*)\]\(([^)\s]+)\)|\[@([^\]]*)\]\(mention:([^)\s]+)\)/g

/** Frappe escapes & to &amp; across a whole field once the value contains any
 *  real HTML tag (Text Editor notes go through bleach; Comment.content always
 *  does), so a stored image URL can arrive as "?a=1&amp;b=2" and would 404.
 *  Undo it for a token's URL ONLY — a blanket unescape of the note would
 *  corrupt text someone actually typed. Verified live against project.vernon.id. */
const decodeAmp = (url: string) => url.replace(/&amp;/g, '&')

export function parseTokens(source: string): RichToken[] {
  const out: RichToken[] = []
  let last = 0
  for (const m of source.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ t: 'text', v: source.slice(last, at) })
    if (m[2] !== undefined) out.push({ t: 'img', url: decodeAmp(m[2]), alt: m[1] })
    else out.push({ t: 'mention', name: m[3], email: m[4] })
    last = at + m[0].length
  }
  if (last < source.length) out.push({ t: 'text', v: source.slice(last) })
  return out
}

/** A token back as markdown — the exact inverse of parseTokens, except that a
 *  URL that arrived escaped is written back decoded (see decodeAmp). */
export const tokenSource = (t: RichToken): string =>
  t.t === 'text' ? t.v : t.t === 'img' ? `![${t.alt}](${t.url})` : `[@${t.name}](mention:${t.email})`

const TEXT_NODE = 3

/** What one child of the editable contributes to the markdown source. */
export function nodeSource(node: Node): string {
  if (node.nodeType === TEXT_NODE) return node.nodeValue ?? ''
  const el = node as HTMLElement
  if (el.tagName === 'IMG') return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('data-url') ?? ''})`
  const email = el.getAttribute?.('data-mention')
  if (email) return `[@${(el.textContent ?? '').replace(/^@/, '')}](mention:${email})`
  if (el.tagName === 'BR') return '\n'
  return el.textContent ?? '' // defensive: nothing else is ever inserted
}

/** The editable's markdown. A trailing <br> is the browser's own filler — Chrome
 *  inserts one the moment the box is emptied — so it is not content: counting it
 *  would report "\n" for an empty editor and keep the placeholder hidden. */
export function fromDom(root: Node): string {
  const kids = Array.from(root.childNodes)
  const last = kids[kids.length - 1]
  if (last && (last as HTMLElement).tagName === 'BR') kids.pop()
  return kids.map(nodeSource).join('')
}

/** A DOM selection point -> its index in the markdown source. A point inside an
 *  atomic node counts as that node's start, so the caret never lands "inside" an
 *  image's syntax. */
export function sourceOffset(root: Node, node: Node, offset: number): number {
  const kids = Array.from(root.childNodes)
  if (node === root) return kids.slice(0, offset).reduce((n, c) => n + nodeSource(c).length, 0)
  let acc = 0
  for (const child of kids) {
    if (child === node) return acc + (node.nodeType === TEXT_NODE ? offset : 0)
    if (child.contains(node)) return acc
    acc += nodeSource(child).length
  }
  return acc
}

/** The reverse: a source index -> the DOM point to put the caret at. */
export function domPosition(root: Node, index: number): [Node, number] {
  const kids = Array.from(root.childNodes)
  let acc = 0
  for (let i = 0; i < kids.length; i++) {
    const len = nodeSource(kids[i]).length
    if (index <= acc + len) {
      return kids[i].nodeType === TEXT_NODE ? [kids[i], index - acc] : [root, index <= acc ? i : i + 1]
    }
    acc += len
  }
  return [root, kids.length]
}

/** The atomic nodes the editable holds. An image whose URL is not an app-served
 *  /files/ (or same-origin) path stays plain markdown text: the composer must
 *  never fetch a pasted remote URL, which is the same rule sanitizeHtml applies
 *  on the display side — imported, not re-written. */
export function toNodes(source: string, doc: Document, isAllowedSrc: (src: string) => boolean): Node[] {
  const out: Node[] = []
  for (const t of parseTokens(source)) {
    if (t.t === 'img' && isAllowedSrc(t.url)) {
      const img = doc.createElement('img')
      img.setAttribute('data-url', t.url)
      img.setAttribute('alt', t.alt)
      img.setAttribute('src', t.url)
      img.contentEditable = 'false'
      img.className = 'my-1 block max-h-48 max-w-full rounded-lg'
      out.push(img)
    } else if (t.t === 'mention') {
      const span = doc.createElement('span')
      span.setAttribute('data-mention', t.email)
      span.contentEditable = 'false'
      span.textContent = `@${t.name}`
      span.className =
        'rounded px-1 py-0.5 text-brand-700 bg-brand-500/10 dark:text-brand-300 dark:bg-brand-500/15'
      out.push(span)
    } else {
      const text = t.t === 'text' ? t.v : tokenSource(t)
      const prev = out[out.length - 1]
      if (prev && prev.nodeType === TEXT_NODE) prev.nodeValue += text
      else out.push(doc.createTextNode(text))
    }
  }
  return out
}
