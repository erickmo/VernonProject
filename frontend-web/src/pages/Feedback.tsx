import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useSubmitFeedback } from '@/hooks/useData'

const TYPES = ['Criticism', 'Suggestion', 'Praise', 'Bug'] as const

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'bg-brand-600 text-white'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
  }`

const fieldCls =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function Feedback() {
  const toast = useToast()
  const submit = useSubmitFeedback()
  const [type, setType] = useState<string>('Suggestion')
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
          setMessage('')
        },
        onError: (e: unknown) =>
          toast('error', e instanceof Error ? e.message : 'Could not send feedback'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Send feedback</h1>

      <BentoGrid>
        <BentoTile span="lg" tone="plain">
          <div className="flex flex-col gap-5">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Share criticism, a suggestion, praise, or a bug. Send anonymously if you’d rather
              not be named.
            </p>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Type</span>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} className={chip(type === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Message" required>
              {(id) => (
                <textarea
                  id={id}
                  className={fieldCls + ' min-h-[160px] resize-y'}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What’s on your mind?"
                  rows={7}
                />
              )}
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={anon}
                onChange={(e) => setAnon(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              Send anonymously
            </label>

            <div>
              <Button variant="primary" onClick={onSend} disabled={!canSend}>
                {submit.isPending ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
                Send feedback
              </Button>
            </div>
          </div>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
