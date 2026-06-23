import { useRef, useState } from 'react'
import { Send, ImagePlus } from 'lucide-react'
import { useComments, useAddComment } from '../hooks/useData'
import { Spinner } from './ui'
import { sanitizeHtml } from '../lib/format'
import { uploadCommentImage, mobileApi } from '../lib/api'
import type { MentionUser } from '../lib/types'
import { useToast } from './Toast'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default function CommentThread({
  referenceDoctype,
  referenceName,
}: {
  referenceDoctype: string
  referenceName: string
}) {
  const { data: comments, isLoading } = useComments(referenceDoctype, referenceName)
  const addComment = useAddComment(referenceDoctype, referenceName)
  const toast = useToast()
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [people, setPeople] = useState<MentionUser[]>([])
  const [pending, setPending] = useState(false)

  // Insert an HTML fragment at the current caret inside the editor.
  const insertHtml = (html: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.focus()
    const sel = window.getSelection()
    const frag = document.createRange().createContextualFragment(html)
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(frag)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      ed.appendChild(frag)
    }
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast('error', 'Image too large (max 5 MB).')
      return
    }
    setUploading(true)
    try {
      const url = await uploadCommentImage(file, referenceDoctype, referenceName)
      insertHtml(
        `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;border-radius:0.5rem;" />`,
      )
    } catch (err) {
      toast('error', (err as Error).message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Detect a trailing "@token" right before the caret to drive autocomplete.
  const onInput = async () => {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setMentionOpen(false)
      return
    }
    const before = (node.textContent || '').slice(0, sel!.anchorOffset)
    const m = before.match(/@([\w.\-]*)$/)
    if (!m) {
      setMentionOpen(false)
      return
    }
    setMentionQuery(m[1].toLowerCase())
    setMentionOpen(true)
    if (!people.length) {
      try {
        const list = await mobileApi.getMentionableUsers(referenceDoctype, referenceName)
        setPeople(list)
      } catch {
        /* leave empty; autocomplete simply shows nothing */
      }
    }
  }

  // Replace the trailing "@query" text with a mention span for the chosen user.
  const pickMention = (u: MentionUser) => {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    if (sel && node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const upto = text.slice(0, sel.anchorOffset)
      const at = upto.lastIndexOf('@')
      if (at >= 0) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, sel.anchorOffset)
        range.deleteContents()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    insertHtml(
      `<span data-mention="${escapeHtml(u.user)}">@${escapeHtml(u.full_name)}</span>&nbsp;`,
    )
    setMentionOpen(false)
    setMentionQuery('')
  }

  const filtered = people.filter(
    (p) =>
      p.full_name.toLowerCase().includes(mentionQuery) ||
      p.user.toLowerCase().includes(mentionQuery),
  )

  const submit = () => {
    const ed = editorRef.current
    if (!ed) return
    const html = sanitizeHtml(ed.innerHTML).trim()
    // Reject empty (no text, no image, no mention).
    const hasContent = (ed.textContent || '').trim() || ed.querySelector('img,span[data-mention]')
    if (!hasContent) return
    setPending(true)
    addComment.mutate(html, {
      onSuccess: () => {
        ed.innerHTML = ''
        setMentionOpen(false)
      },
      onError: (err) => toast('error', (err as Error).message || 'Failed to add comment'),
      onSettled: () => setPending(false),
    })
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Comments</h3>
      {isLoading ? (
        <Spinner className="h-5 w-5 text-gray-400" />
      ) : (
        <ul className="space-y-3">
          {(comments ?? []).map((c) => (
            <li key={c.name} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  {c.by_name}
                  {c.by_badge && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={
                        c.by_badge.color
                          ? { backgroundColor: `${c.by_badge.color}22`, color: c.by_badge.color }
                          : undefined
                      }
                    >
                      {c.by_badge.icon && <span>{c.by_badge.icon}</span>}
                      {c.by_badge.tier_name}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
              <div
                className="comment-body mt-1 text-sm text-gray-700 [&_a]:break-words [&_a]:text-brand-600 [&_a]:underline [&_p]:my-0 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }}
              />
            </li>
          ))}
          {comments && comments.length === 0 && (
            <li className="text-sm text-gray-400">No comments yet.</li>
          )}
        </ul>
      )}
      <div className="relative mt-3 flex items-end gap-2">
        <div className="flex-1">
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-label="Add a comment"
            data-placeholder="Add a comment…"
            onInput={onInput}
            className="comment-editor max-h-40 min-h-[3rem] overflow-y-auto rounded-xl border border-gray-200 p-2 text-sm focus:border-brand-500 focus:outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg"
          />
          {mentionOpen && filtered.length > 0 && (
            <ul className="absolute bottom-12 left-0 z-10 max-h-48 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 8).map((u) => (
                <li key={u.user}>
                  <button
                    type="button"
                    onClick={() => pickMention(u)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-800">{u.full_name}</span>
                    <span className="truncate text-xs text-gray-400">{u.user}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPickImage}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-40"
          aria-label="Attach image"
        >
          {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
