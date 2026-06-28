import { useState } from 'react'
import { MessageSquarePlus, Send } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Segmented, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useSubmitFeedback } from '@/hooks/useData'

const TYPES = ['Criticism', 'Suggestion', 'Praise', 'Bug'] as const
type FeedbackType = (typeof TYPES)[number]

export default function FeedbackScreen() {
  const toast = useToast()
  const submit = useSubmitFeedback()
  const [type, setType] = useState<FeedbackType>('Suggestion')
  const [message, setMessage] = useState('')
  const [anon, setAnon] = useState(false)

  const canSend = message.trim().length > 0 && !submit.isPending

  const onSend = () => {
    if (!canSend) return
    submit.mutate(
      { feedback_type: type, message: message.trim(), is_anonymous: anon },
      {
        onSuccess: () => {
          toast('success', 'Thanks for your feedback')
          setMessage('') // keep the selected type for a quick follow-up
        },
        onError: (e) =>
          toast('error', e instanceof Error ? e.message : 'Could not send feedback'),
      },
    )
  }

  return (
    <DetailScreen title="Send feedback">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
            <MessageSquarePlus className="h-5 w-5" />
          </div>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            Tell us what's working, what isn't, or what you'd love to see. Goes straight to the team.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500 dark:text-slate-400">Type</label>
          <Segmented
            options={TYPES.map((t) => ({ value: t, label: t }))}
            value={type}
            onChange={setType}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500 dark:text-slate-400">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            rows={6}
            className="w-full resize-y rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
          />
        </div>

        <button
          onClick={() => setAnon((v) => !v)}
          className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 text-left shadow-card active:scale-[0.99]"
        >
          <input
            type="checkbox"
            checked={anon}
            readOnly
            tabIndex={-1}
            className="h-5 w-5 shrink-0 accent-brand-600"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-700 dark:text-slate-200">Send anonymously</p>
            <p className="text-xs text-stone-400 dark:text-slate-500">Your name won't be attached, even for admins.</p>
          </div>
        </button>

        <button
          onClick={onSend}
          disabled={!canSend}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          {submit.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          Send feedback
        </button>
      </div>
    </DetailScreen>
  )
}
