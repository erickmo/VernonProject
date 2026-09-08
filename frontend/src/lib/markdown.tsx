import { marked } from 'marked'
import { useMemo } from 'react'
import { sanitizeHtml } from './format'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Belt: raw HTML typed inside a note must never become live markup. marked's
// own `html` token renderer is what would otherwise pass it straight through
// verbatim -- override it to show the source as literal text instead of
// rendering or silently dropping it.
marked.use({
  gfm: true,
  breaks: true, // a single newline is a line break, not a swallowed one (AC2)
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
  },
})

// Brace: even with HTML passthrough disabled, marked does not sanitise link/
// image URLs (its old `sanitize` option was removed years ago) -- a markdown
// link like [x](javascript:alert(1)) becomes a literal <a href="javascript:...">
// in marked's own output. sanitizeHtml (frontend/src/lib/format.ts) is this
// app's existing DOM sanitiser, already used for comment HTML -- reusing it
// here rather than adding a second one strips javascript:/data: links,
// event-handler attributes, and restricts image sources to /files/.
const cache = new Map<string, string>()

/** Markdown source -> sanitised HTML, memoised per exact source string so a
 * long list (or a re-render from unrelated state) never re-parses a note
 * it has already rendered. */
export function renderNoteMarkdown(source: string): string {
  if (!source) return ''
  const cached = cache.get(source)
  if (cached !== undefined) return cached
  const html = sanitizeHtml(marked.parse(source, { async: false }) as string)
  cache.set(source, html)
  if (cache.size > 500) {
    // ponytail: unbounded-cache guard, not an LRU -- notes are short-lived
    // view state, so dropping the oldest half occasionally is enough.
    for (const k of Array.from(cache.keys()).slice(0, 250)) cache.delete(k)
  }
  return html
}

const PROSE = [
  'text-sm leading-relaxed break-words',
  'text-slate-600 dark:text-slate-300',
  '[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1',
  '[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_strong]:font-semibold [&_strong]:text-slate-700 dark:[&_strong]:text-slate-100',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
  '[&_li]:my-0.5',
  '[&_a]:text-brand-600 dark:[&_a]:text-brand-400 [&_a]:underline [&_a]:break-all',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 dark:[&_blockquote]:border-slate-600',
  '[&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-500 dark:[&_blockquote]:text-slate-400',
  '[&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono',
  '[&_code]:text-rose-600 dark:[&_code]:text-rose-300',
  '[&_pre]:rounded-lg [&_pre]:bg-slate-100 dark:[&_pre]:bg-slate-800',
  '[&_pre]:p-2 [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:max-w-full',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-700 dark:[&_pre_code]:text-slate-200',
  '[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:my-1.5 [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:text-left',
  '[&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-700 [&_td]:px-2 [&_td]:py-1',
  '[&_img]:max-w-full [&_img]:rounded',
  '[&_hr]:my-2 [&_hr]:border-slate-200 dark:[&_hr]:border-slate-700',
].join(' ')

/** Renders a Project Todo note's markdown, sanitised, wherever a note is
 * shown on /m or /w -- the one shared renderer both frontends use. Empty
 * source renders nothing (no empty box). */
export function NoteMarkdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => renderNoteMarkdown(text), [text])
  if (!html) return null
  return (
    // eslint-disable-next-line react/no-danger -- sanitised above via sanitizeHtml
    <div className={`${PROSE} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  )
}
