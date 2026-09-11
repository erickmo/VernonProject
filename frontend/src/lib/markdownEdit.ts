// Pure helpers behind MarkdownEditor (81hvkl47n3): what each toolbar button does
// to the textarea's text and selection. No DOM, so it is unit-tested directly.

export type Format = 'bold' | 'italic' | 'code' | 'link' | 'list' | 'task' | 'quote'
export type Edit = { value: string; start: number; end: number }

const WRAP: Partial<Record<Format, [string, string, string]>> = {
  // [before, after, placeholder when nothing is selected]
  bold: ['**', '**', 'tebal'],
  italic: ['_', '_', 'miring'],
  code: ['`', '`', 'kode'],
}
const LINE_PREFIX: Partial<Record<Format, string>> = { list: '- ', task: '- [ ] ', quote: '> ' }

/** Apply one toolbar format to value[start, end). Wraps inline formats around
 *  the selection (or a placeholder, left selected so typing replaces it);
 *  prefixes every selected line for block formats. */
export function applyFormat(value: string, start: number, end: number, kind: Format): Edit {
  const sel = value.slice(start, end)
  const wrap = WRAP[kind]
  if (wrap) {
    const [before, after, placeholder] = wrap
    const inner = sel || placeholder
    const next = value.slice(0, start) + before + inner + after + value.slice(end)
    return { value: next, start: start + before.length, end: start + before.length + inner.length }
  }
  if (kind === 'link') {
    const text = sel || 'teks'
    const next = `${value.slice(0, start)}[${text}](https://)${value.slice(end)}`
    const urlAt = start + text.length + 3 // caret lands on the URL to type it
    return { value: next, start: urlAt, end: urlAt + 'https://'.length }
  }
  const prefix = LINE_PREFIX[kind] ?? ''
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const block = value.slice(lineStart, end)
  const prefixed = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join('\n')
  const next = value.slice(0, lineStart) + prefixed + value.slice(end)
  return { value: next, start: lineStart, end: lineStart + prefixed.length }
}

/** The "@query" being typed right before the caret, or null. */
export function mentionQueryAt(value: string, caret: number): { query: string; from: number } | null {
  const m = /(^|\s)@([\w.-]*)$/.exec(value.slice(0, caret))
  return m ? { query: m[2].toLowerCase(), from: caret - m[2].length - 1 } : null
}

/** A mention as markdown: a link with the mention: scheme. The server reads the
 *  email from it to notify (api/mobile._parse_mentions); the renderer shows a chip. */
export const mentionToken = (user: string, fullName: string) =>
  `[@${fullName.replace(/[[\]]/g, '')}](mention:${user})`
