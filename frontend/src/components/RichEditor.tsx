import { useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

// Minimal contentEditable rich-text editor producing HTML. Used for Text Editor
// (rich) DocType fields like Project Detail's Keterangan di SOW. No external deps.
export function RichEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Sync external value in only when it diverges from the live DOM, so typing
  // (which fires onChange) doesn't reset the caret on every keystroke.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value || ''
  }, [value])

  const exec = (cmd: string) => {
    document.execCommand(cmd, false)
    ref.current?.focus()
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const btn = 'rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 active:scale-95'

  return (
    <div className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:border-brand-600">
      <div className="flex items-center gap-0.5 border-b border-slate-100 dark:border-slate-800 px-1.5 py-1">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className={btn} aria-label="Bold"><Bold className="h-4 w-4" /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className={btn} aria-label="Italic"><Italic className="h-4 w-4" /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className={btn} aria-label="Bullet list"><List className="h-4 w-4" /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} className={btn} aria-label="Numbered list"><ListOrdered className="h-4 w-4" /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="rich-editor min-h-[88px] px-3 py-2 text-sm leading-relaxed text-slate-800 dark:text-slate-100 outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
      />
    </div>
  )
}
