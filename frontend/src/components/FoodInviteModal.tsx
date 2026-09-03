import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { UtensilsCrossed, X, MapPin, Clock } from 'lucide-react'
import type { FoodInvite } from '@/lib/types'
import { formatDateTime } from '@/lib/format'
import { useRespondFoodInvite } from '@/hooks/useData'
import { useToast } from './Toast'

// Shared across /m and /w (like PrankPopup): a full-screen portal card, so it
// needs no per-platform chrome. Shows one invite; the receiver picks Yes/No.
// The inviter sees a live tally instead of buttons; a closed/answered invite
// shows its state read-only.
export function FoodInviteModal({ invite, onDone }: { invite: FoodInvite; onDone: () => void }) {
  const respond = useRespondFoodInvite()
  const toast = useToast()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const answer = (response: 'Yes' | 'No') => {
    respond.mutate({ invite: invite.name, response }, {
      onSuccess: (r) => {
        if (r.status === 'closed') toast('info', 'Undangan sudah ditutup')
        else toast('success', response === 'Yes' ? 'Sip! Kamu ikut pesan 🍜' : 'Oke, lain kali ya')
        onDone()
      },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[56] flex items-center justify-center px-6"
      onClick={onDone}
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onDone} className="absolute right-4 top-4 rounded-full p-1 text-slate-400" aria-label="Tutup">
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/20">
          <UtensilsCrossed className="h-7 w-7" />
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-amber-600">Makan Bareng</p>
        <h3 className="mt-1 text-center text-lg font-bold text-slate-900 dark:text-slate-50">
          {invite.inviter_name} ngajak makan bareng
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-center text-base text-slate-700 dark:text-slate-200">{invite.message}</p>
        <div className="mt-3 flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
          {invite.place && (
            <span className="inline-flex items-center justify-center gap-1"><MapPin className="h-4 w-4" />{invite.place}</span>
          )}
          <span className="inline-flex items-center justify-center gap-1">
            <Clock className="h-4 w-4" />Pesan sebelum {formatDateTime(invite.order_by)}
          </span>
        </div>

        {invite.is_inviter ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm dark:bg-slate-700/40">
            <p className="font-semibold text-slate-700 dark:text-slate-200">{invite.yes_count} orang ikut pesan</p>
            {invite.yes_names.length > 0 && <p className="mt-1 text-slate-500">{invite.yes_names.join(', ')}</p>}
          </div>
        ) : invite.closed ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-700/40">Undangan sudah ditutup.</p>
        ) : invite.my_response ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
            Kamu menjawab: <b>{invite.my_response === 'Yes' ? "Ya, aku pesan" : 'Tidak, terima kasih'}</b>
          </p>
        ) : (
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => answer('No')}
              disabled={respond.isPending}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              No, thank you
            </button>
            <button
              onClick={() => answer('Yes')}
              disabled={respond.isPending}
              className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              Yes, I'll order
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
