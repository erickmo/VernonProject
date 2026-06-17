import { useState } from 'react'
import { Send } from 'lucide-react'
import { useComments, useAddComment } from '../hooks/useData'
import { Spinner } from './ui'
import { stripHtml } from '../lib/format'

export default function CommentThread({
  referenceDoctype,
  referenceName,
}: {
  referenceDoctype: string
  referenceName: string
}) {
  const { data: comments, isLoading } = useComments(referenceDoctype, referenceName)
  const addComment = useAddComment(referenceDoctype, referenceName)
  const [text, setText] = useState('')

  const submit = () => {
    const body = text.trim()
    if (!body) return
    addComment.mutate(body, { onSuccess: () => setText('') })
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
                <span className="text-sm font-medium text-gray-800">{c.by_name}</span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                {stripHtml(c.content.replace(/<\/(p|div)>|<br\s*\/?>/gi, '\n')).trim()}
              </p>
            </li>
          ))}
          {comments && comments.length === 0 && (
            <li className="text-sm text-gray-400">No comments yet.</li>
          )}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="flex-1 resize-none rounded-xl border border-gray-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={addComment.isPending || !text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
