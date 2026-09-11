import { useRef, useState } from 'react'
import { Bold, Code, ImagePlus, Italic, Link2, List, ListChecks, Quote } from 'lucide-react'
import { applyFormat, mentionQueryAt, mentionToken, type Format } from '@/lib/markdownEdit'
import type { MentionUser } from '@/lib/types'

// 81hvkl47n3: one markdown editor for todo notes and comments, /m and /w. A plain
// textarea (the stored value IS the markdown) plus a toolbar that inserts syntax;
// the read-only views render it through NoteMarkdown / renderComment. Toolbar
// buttons keep focus in the textarea (mousedown preventDefault), so an editor that
// saves on blur — the notes box — is not saved by clicking Bold.

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
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [people, setPeople] = useState<MentionUser[] | null>(null)
  const [mention, setMention] = useState<{ query: string; from: number } | null>(null)
  const [uploading, setUploading] = useState(false)

  const setText = (next: string, start: number, end = start) => {
    onChange(next)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(start, end)
    })
  }
  const format = (kind: Format) => {
    const el = ref.current
    if (!el) return
    const r = applyFormat(value, el.selectionStart, el.selectionEnd, kind)
    setText(r.value, r.start, r.end)
  }
  const insert = (text: string, from?: number) => {
    const el = ref.current
    const start = from ?? el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? start
    setText(value.slice(0, start) + text + value.slice(end), start + text.length)
  }

  const onInput = async (next: string, caret: number) => {
    onChange(next)
    if (!mentions) return
    const m = mentionQueryAt(next, caret)
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
    const caret = ref.current?.selectionStart ?? value.length
    const token = `${mentionToken(u.user, u.full_name)} `
    setText(value.slice(0, mention!.from) + token + value.slice(caret), mention!.from + token.length)
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
            <button type="button" title="Sisipkan gambar" aria-label="Sisipkan gambar" className={tool} disabled={uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
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
                setUploading(true)
                try {
                  insert(`![](${await onImage(file)})`)
                } catch {
                  /* the caller already told the user why (size, network) */
                } finally {
                  setUploading(false)
                }
              }}
            />
          </>
        )}
        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">Markdown</span>
      </div>
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => void onInput(e.target.value, e.target.selectionStart)}
        onBlur={() => {
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
          } else if (e.key === 'Escape') setMention(null)
        }}
        className={className}
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
