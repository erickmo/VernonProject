import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// ponytail: http(s) only; add www./mailto if feedback ever needs them
const URL_RE = /(https?:\/\/[^\s]+)/g

function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400"
      >
        {part}
      </a>
    ) : (
      part
    ),
  )
}

/** Feedback body: URLs become clickable links + a copy-to-clipboard button. */
export default function FeedbackMessage({ message, className }: { message: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure ctx / denied) — no-op */
    }
  }
  return (
    <div className="group/msg relative">
      <p className={`whitespace-pre-wrap pr-7 ${className ?? ''}`}>{linkify(message)}</p>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy message'}
        title="Copy"
        className="absolute right-0 top-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-500/10 focus:opacity-100 group-hover/msg:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
