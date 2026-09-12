import { useLayoutEffect, useRef, useState } from 'react'
import { Bold, Code, ImagePlus, Italic, Link2, List, ListChecks, Quote } from 'lucide-react'
import { applyFormat, mentionQueryAt, mentionToken, type Format } from '@/lib/markdownEdit'
import { domPosition, fromDom, sourceOffset, toNodes } from '@/lib/markdownRich'
import { isAllowedImgSrc } from '@/lib/format'
import type { MentionUser } from '@/lib/types'

// 81hvkl47n3: one markdown editor for todo notes and comments, /m and /w. The
// stored value IS the markdown; a toolbar inserts syntax and the read-only views
// render it through NoteMarkdown / renderComment. Toolbar buttons keep focus in
// the editor (mousedown preventDefault), so an editor that saves on blur — the
// notes box — is not saved by clicking Bold.
//
// 41j1jiea7l: the surface is a contentEditable, not a textarea, so an image shows
// as the picture and a mention as its name with the syntax hidden. It holds ONLY
// text nodes plus the two atomic nodes lib/markdownRich builds; Enter, paste and
// drop are handled here so the browser can never put anything else in there.
// Every edit goes through setText(source, caret), the same path the toolbar
// already used, so there is one way the content changes.

const TOOLS: { kind: Format; label: string; Icon: typeof Bold }[] = [
  { kind: 'bold', label: 'Tebal (Ctrl+B)', Icon: Bold },
  { kind: 'italic', label: 'Miring (Ctrl+I)', Icon: Italic },
  { kind: 'code', label: 'Kode', Icon: Code },
  { kind: 'link', label: 'Tautan (Ctrl+K)', Icon: Link2 },
  { kind: 'list', label: 'Daftar', Icon: List },
  { kind: 'task', label: 'Checklist', Icon: ListChecks },
  { kind: 'quote', label: 'Kutipan', Icon: Quote },
]
const KEYS: Record<string, Format> = { b: 'bold', i: 'italic', k: 'link' }

export function MarkdownEditor({
  value,
  onChange,
  className = '',
  placeholder,
  autoFocus,
  rows = 4,
  onBlur,
  onSubmit,
  mentions,
  onImage,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
  rows?: number
  onBlur?: () => void
  /** Ctrl/Cmd+Enter */
  onSubmit?: () => void
  /** Loaded on the first "@": who can be mentioned here. */
  mentions?: () => Promise<MentionUser[]>
  /** Upload an image, resolve to its URL; inserted as ![](url). */
  onImage?: (file: File) => Promise<string>
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [people, setPeople] = useState<MentionUser[] | null>(null)
  const [mention, setMention] = useState<{ query: string; from: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  /** Selection to restore once `value` has been rendered back into the DOM. */
  const pending = useRef<[number, number] | null>(null)
  /** The OS file dialog blurs the editor, and the notes box saves and closes on
   *  blur — so without this the picker would dismiss the very editor it is
   *  inserting into and the upload would land nowhere. True from opening the
   *  dialog until the upload settles (or the dialog is cancelled). */
  const busy = useRef(false)
  const uploadingRef = useRef(false)
  /** Where the image goes: the caret as it was when the picker was opened, since
   *  the dialog takes the selection with it. */
  const imageAt = useRef<number | null>(null)

  const putCaret = (el: HTMLElement, start: number, end: number) => {
    const [sn, so] = domPosition(el, start)
    const [en, eo] = domPosition(el, end)
    const range = document.createRange()
    range.setStart(sn, so)
    range.setEnd(en, eo)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  // Render `value` into the editor only when the DOM has drifted from it. While
  // someone types, the DOM is already the source of `value`, so nothing is
  // rebuilt and the caret is never reset mid-word (RichEditor uses the same guard).
  useLayoutEffect(() => {
    const el = ref.current
    const want = pending.current
    pending.current = null
    if (!el || fromDom(el) === value) return
    el.replaceChildren(...toNodes(value, document, isAllowedImgSrc))
    if (want) {
      el.focus()
      putCaret(el, want[0], want[1])
    }
  }, [value])

  useLayoutEffect(() => {
    // React's autoFocus prop only acts on form controls, and this is a div.
    const el = ref.current
    if (!autoFocus || !el) return
    el.focus()
    putCaret(el, value.length, value.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- on mount only

  /** Where the caret is, as an index into the markdown source. */
  const caret = (): [number, number] => {
    const el = ref.current
    const sel = el && window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).startContainer)) {
      return [value.length, value.length]
    }
    const r = sel.getRangeAt(0)
    return [sourceOffset(el, r.startContainer, r.startOffset), sourceOffset(el, r.endContainer, r.endOffset)]
  }

  const setText = (next: string, start: number, end = start) => {
    pending.current = [start, end]
    onChange(next)
  }
  const format = (kind: Format) => {
    const [start, end] = caret()
    const r = applyFormat(value, start, end, kind)
    setText(r.value, r.start, r.end)
  }
  const insert = (text: string, from?: number) => {
    const [s, e] = caret()
    const start = from ?? s
    setText(value.slice(0, start) + text + value.slice(Math.max(start, e)), start + text.length)
  }

  const onInput = async () => {
    const el = ref.current
    if (!el) return
    const next = fromDom(el)
    onChange(next)
    if (!mentions) return
    const m = mentionQueryAt(next, caret()[0])
    setMention(m)
    if (m && people === null) setPeople(await mentions().catch(() => []))
  }
  const matches = (() => {
    if (!mention || !people) return []
    const q = mention.query
    const all = people.length && 'all'.startsWith(q) ? [{ user: '@all', full_name: 'all', image: null } as MentionUser] : []
    return [...all, ...people.filter((p) => p.full_name.toLowerCase().includes(q) || p.user.toLowerCase().includes(q))].slice(0, 8)
  })()
  const pick = (u: MentionUser) => {
    const token = `${mentionToken(u.user, u.full_name)} `
    setText(value.slice(0, mention!.from) + token + value.slice(caret()[0]), mention!.from + token.length)
    setMention(null)
  }

  const tool = 'flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
  return (
    <div className="relative">
      <div role="toolbar" aria-label="Format markdown" className="mb-1 flex flex-wrap items-center gap-0.5">
        {TOOLS.map(({ kind, label, Icon }) => (
          <button key={kind} type="button" title={label} aria-label={label} className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => format(kind)}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        {onImage && (
          <>
            <button
              type="button"
              title="Sisipkan gambar"
              aria-label="Sisipkan gambar"
              className={tool}
              disabled={uploading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                imageAt.current = caret()[0]
                busy.current = true
                // A cancelled dialog fires no change event; the window regaining
                // focus is the only signal. An upload that did start keeps the
                // guard (it set uploadingRef before this can run).
                window.addEventListener(
                  'focus',
                  () => setTimeout(() => (busy.current = uploadingRef.current), 0),
                  { once: true },
                )
                fileRef.current?.click()
              }}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                uploadingRef.current = true
                setUploading(true)
                try {
                  insert(`![](${await onImage(file)})`, imageAt.current ?? undefined)
                } catch {
                  /* the caller already told the user why (size, network) */
                } finally {
                  uploadingRef.current = false
                  busy.current = false
                  imageAt.current = null
                  setUploading(false)
                }
              }}
            />
          </>
        )}
        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">Markdown</span>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight: `${rows * 1.5}rem` }}
        onInput={() => void onInput()}
        onPaste={(e) => {
          // Plain text only: anything richer would put markup the serializer
          // does not understand into the editor.
          e.preventDefault()
          const [s, en] = caret()
          const text = e.clipboardData.getData('text/plain')
          setText(value.slice(0, s) + text + value.slice(en), s + text.length)
        }}
        onDrop={(e) => e.preventDefault()}
        onBlur={() => {
          if (busy.current) return // the OS file dialog, not the user leaving
          setTimeout(() => setMention(null), 150) // let a click on a suggestion land first
          onBlur?.()
        }}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey
          if (mod && e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit()
          } else if (mod && KEYS[e.key.toLowerCase()]) {
            e.preventDefault()
            format(KEYS[e.key.toLowerCase()])
          } else if (e.key === 'Enter' && !mod) {
            // The browser would insert a <div> or <br> here; the source is text.
            e.preventDefault()
            const [s, en] = caret()
            setText(`${value.slice(0, s)}\n${value.slice(en)}`, s + 1)
          } else if (e.key === 'Escape') setMention(null)
        }}
        className={`overflow-y-auto whitespace-pre-wrap break-words outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] dark:empty:before:text-slate-500 ${className}`}
      />
      {matches.length > 0 && (
        <ul className="absolute left-0 top-full z-10 mt-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {matches.map((u) => (
            <li key={u.user}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">{u.full_name}</span>
                <span className="truncate text-xs text-slate-400">{u.user}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
