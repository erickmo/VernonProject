import { useRef, useState } from 'react'
import { Send, ZoomIn, Pencil, Check, X } from 'lucide-react'
import { useComments, useAddComment, useEditComment, useBoot } from '../hooks/useData'
import { Spinner } from './ui'
import { sanitizeHtml } from '../lib/format'
import { uploadCommentImage, mobileApi } from '../lib/api'
import { MD_STRUCTURE, commentSource, isMarkdownComment, renderComment, toCommentContent } from '../lib/markdown'
import { useToast } from './Toast'
import ImageZoom from './ImageZoom'
import { MarkdownEditor } from './MarkdownEditor'

// Dark-mode rich text for the body + editors: mention chips, and neutralise pasted
// inline colours (white/near-black spans copied from other apps) so they don't
// show as white boxes. Light mode renders the comment exactly as authored.
const DARK_RICH =
  'dark:[&_[data-mention]]:bg-brand-500/15 dark:[&_[data-mention]]:text-brand-300 dark:[&_[style]]:!bg-transparent dark:[&_[style]]:!text-inherit dark:[&_font]:text-inherit'

// 81hvkl47n3: comments are written in Markdown (stored behind Frappe's own
// <!-- markdown --> marker) and read as rendered Markdown. Older comments are
// rich-text HTML: they still render and edit exactly as before.
const MD_INPUT =
  'w-full resize-none [field-sizing:content] max-h-60 min-h-[3rem] rounded-xl border border-gray-200 bg-transparent p-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function CommentThread({
  referenceDoctype,
  referenceName,
  title = 'Comments',
  className = 'mt-6',
}: {
  referenceDoctype: string
  referenceName: string
  /** Heading above the thread. Makan Bareng labels it "Pesanan" in Bahasa. */
  title?: string
  /** Outer <section> spacing — override when embedding inside a card. */
  className?: string
}) {
  const { data: comments, isLoading } = useComments(referenceDoctype, referenceName)
  const addComment = useAddComment(referenceDoctype, referenceName)
  const editComment = useEditComment(referenceDoctype, referenceName)
  const { data: boot } = useBoot()
  const me = boot?.user
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editSource, setEditSource] = useState('') // a markdown comment being edited
  const editBodyRef = useRef<HTMLDivElement | null>(null) // a legacy HTML comment being edited
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  const mentionable = () => mobileApi.getMentionableUsers(referenceDoctype, referenceName)
  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast('error', 'Image too large (max 5 MB).')
      throw new Error('too large')
    }
    try {
      return await uploadCommentImage(file, referenceDoctype, referenceName)
    } catch (err) {
      toast('error', (err as Error).message || 'Upload failed')
      throw err
    }
  }

  const startEdit = (c: { name: string; content: string }) => {
    setEditingName(c.name)
    if (isMarkdownComment(c.content)) setEditSource(commentSource(c.content))
  }

  const saveEdit = (c: { name: string; content: string }) => {
    let content: string
    if (isMarkdownComment(c.content)) {
      if (!editSource.trim()) {
        toast('error', 'Comment cannot be empty.')
        return
      }
      content = toCommentContent(editSource)
    } else {
      const ed = editBodyRef.current
      if (!ed) return
      content = sanitizeHtml(ed.innerHTML).trim()
      const tmp = new DOMParser().parseFromString(content, 'text/html').body
      if (!(tmp.textContent || '').trim() && !tmp.querySelector('img,span[data-mention]')) {
        toast('error', 'Comment cannot be empty.')
        return
      }
    }
    editComment.mutate(
      { name: c.name, content },
      {
        onSuccess: () => setEditingName(null),
        onError: (err) => toast('error', (err as Error).message || 'Failed to edit comment'),
      },
    )
  }

  const submit = () => {
    if (!draft.trim() || pending) return
    setPending(true)
    addComment.mutate(toCommentContent(draft), {
      onSuccess: () => setDraft(''),
      onError: (err) => toast('error', (err as Error).message || 'Failed to add comment'),
      onSettled: () => setPending(false),
    })
  }

  const actionBtn = 'flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium'
  return (
    <section className={className}>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-200">{title}</h3>
      {isLoading ? (
        <Spinner className="h-5 w-5 text-gray-400 dark:text-slate-400" />
      ) : (
        <ul className="space-y-3">
          {(comments ?? []).map((c) => {
            const html = renderComment(c.content)
            return (
              <li key={c.name} className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800/60">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-slate-100">
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
                  <span className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-400">
                    {c.at_human}
                    {c.by === me && editingName !== c.name && (
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-gray-400 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300"
                        aria-label="Edit comment"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {editingName === c.name ? (
                  <div className="mt-1">
                    {isMarkdownComment(c.content) ? (
                      <MarkdownEditor
                        value={editSource}
                        onChange={setEditSource}
                        autoFocus
                        rows={3}
                        ariaLabel="Edit comment"
                        className={MD_INPUT}
                        onSubmit={() => saveEdit(c)}
                        mentions={mentionable}
                        onImage={upload}
                      />
                    ) : (
                      <div
                        contentEditable
                        role="textbox"
                        aria-label="Edit comment"
                        ref={(el) => {
                          editBodyRef.current = el
                          if (el && el.dataset.seeded !== '1') {
                            el.innerHTML = sanitizeHtml(c.content)
                            el.dataset.seeded = '1'
                            el.focus()
                          }
                        }}
                        className={`comment-editor max-h-40 min-h-[3rem] overflow-y-auto rounded-xl border border-gray-200 p-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg ${DARK_RICH}`}
                      />
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(c)}
                        disabled={editComment.isPending}
                        className={`${actionBtn} bg-brand-600 text-white disabled:opacity-40`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingName(null)}
                        className={`${actionBtn} border border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300`}
                      >
                        <X className="h-3.5 w-3.5" />
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`comment-body mt-1 text-sm text-gray-700 dark:text-slate-200 ${MD_STRUCTURE} [&_a]:break-words [&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-300 [&_p]:my-0 [&_img]:my-1 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700 ${DARK_RICH}`}
                      onClick={(e) => {
                        const t = e.target as HTMLElement
                        if (t.tagName === 'IMG') setZoomSrc((t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src)
                      }}
                      // eslint-disable-next-line react/no-danger -- renderComment sanitises (markdown or legacy HTML)
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                    {html.includes('<img') && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-slate-400">
                        <ZoomIn className="h-3 w-3" />
                        Ketuk gambar untuk memperbesar
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
          {comments && comments.length === 0 && (
            <li className="text-sm text-gray-400 dark:text-slate-400">No comments yet.</li>
          )}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            rows={2}
            placeholder="Add a comment… (Markdown, @ to mention, Ctrl+Enter to send)"
            ariaLabel="Add a comment"
            className={MD_INPUT}
            onSubmit={submit}
            mentions={mentionable}
            onImage={upload}
          />
        </div>
        <button
          onClick={submit}
          disabled={pending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          {pending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {zoomSrc && <ImageZoom src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </section>
  )
}
