import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { UtensilsCrossed, X, MapPin, Clock, Pizza, Soup, Sandwich, IceCreamCone, PartyPopper, Check, Ban, Hourglass, ExternalLink } from 'lucide-react'
import type { FoodInvite } from '@/lib/types'
import { formatDateTime, externalUrl } from '@/lib/format'
import { useRespondFoodInvite } from '@/hooks/useData'
import { useToast } from './Toast'

// Decorative food icons drifting around the card — purely cosmetic, no data.
const FLOATERS: { icon: typeof Pizza; className: string; delay: string }[] = [
  { icon: Pizza, className: 'left-2 top-3 h-7 w-7 text-orange-400/70 animate-float', delay: '0s' },
  { icon: Soup, className: 'right-3 top-8 h-8 w-8 text-amber-400/70 animate-wiggle', delay: '0.2s' },
  { icon: Sandwich, className: 'left-6 bottom-6 h-6 w-6 text-rose-400/60 animate-float', delay: '0.5s' },
  { icon: IceCreamCone, className: 'right-6 bottom-3 h-7 w-7 text-pink-400/60 animate-wiggle', delay: '0.35s' },
]

// The inviter's roster, grouped. Order = what they care about most.
const GROUPS = [
  { key: 'yes', label: 'Ikut pesan', icon: Check, tone: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  { key: 'no', label: 'Nggak ikut', icon: Ban, tone: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' },
  { key: 'pending', label: 'Belum jawab', icon: Hourglass, tone: 'text-slate-600 dark:text-slate-300', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-600/40 dark:text-slate-300' },
] as const

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
        if (r.status === 'closed') toast('info', 'Yah, undangan sudah ditutup 😅')
        else toast('success', response === 'Yes' ? 'Gas! Kamu ikut pesan 🍜' : 'Oke, laper-laper an aja lain kali')
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
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onDone} className="absolute right-4 top-4 z-10 rounded-full bg-white/70 p-1 text-slate-500 backdrop-blur dark:bg-slate-800/70 dark:text-slate-300" aria-label="Tutup">
          <X className="h-5 w-5" />
        </button>

        <div className="relative overflow-hidden bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 px-6 pb-14 pt-8">
          {FLOATERS.map(({ icon: Icon, className, delay }, i) => (
            <Icon key={i} className={'absolute drop-shadow ' + className} style={{ animationDelay: delay }} strokeWidth={2} />
          ))}
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-lg dark:bg-slate-900/80">
            <UtensilsCrossed className="h-8 w-8 animate-wiggle text-amber-600" />
          </div>
          <p className="relative mt-3 text-center text-xs font-bold uppercase tracking-wide text-white/90">Makan Bareng</p>
        </div>

        <div className="relative -mt-8 px-6 pb-6">
          <div className="rounded-2xl bg-white p-4 text-center shadow-lg dark:bg-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {invite.inviter_name} ngajak makan bareng!
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-base text-slate-700 dark:text-slate-200">{invite.message}</p>
          </div>

          <div className="mt-3 flex flex-col gap-1 text-center text-sm text-slate-600 dark:text-slate-300">
            {invite.place && (
              <span className="inline-flex items-center justify-center gap-1 break-all">
                <MapPin className="h-4 w-4 shrink-0" />
                {externalUrl(invite.place) ? (
                  <a
                    href={externalUrl(invite.place)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand-600 underline decoration-dotted underline-offset-2 dark:text-brand-300"
                  >
                    {invite.place}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  invite.place
                )}
              </span>
            )}
            <span className="inline-flex items-center justify-center gap-1">
              <Clock className="h-4 w-4" />Pesan sebelum {formatDateTime(invite.order_by)}
            </span>
          </div>

          {invite.is_inviter ? (
            <div className="mt-5 max-h-[45vh] space-y-2 overflow-y-auto">
              <p className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-3 text-sm font-semibold text-amber-700 dark:from-slate-700/40 dark:to-slate-700/40 dark:text-amber-300">
                <PartyPopper className="h-4 w-4" />{invite.yes_count} orang ikut pesan
              </p>
              {GROUPS.map(({ key, label, icon: Icon, tone, chip }) => {
                const names = key === 'yes' ? invite.yes_names : key === 'no' ? invite.no_names : invite.pending_names
                const count = key === 'yes' ? invite.yes_count : key === 'no' ? invite.no_count : invite.pending_count
                if (!count) return null
                return (
                  <div key={key} className="rounded-2xl bg-slate-50 p-3 text-left dark:bg-slate-700/40">
                    <p className={'flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ' + tone}>
                      <Icon className="h-3.5 w-3.5" />{label}
                      <span className={'ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ' + chip}>{count}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{names.join(', ')}</p>
                  </div>
                )
              })}
              {!invite.yes_count && !invite.no_count && !invite.pending_count && (
                <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-700/40">Belum ada yang diundang lewat link ini.</p>
              )}
            </div>
          ) : invite.closed ? (
            <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-700/40">Yah, undangan sudah ditutup.</p>
          ) : invite.my_response ? (
            <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
              Kamu jawab: <b>{invite.my_response === 'Yes' ? 'Ya, aku ikut! 🍜' : 'Nanti dulu ya'}</b>
            </p>
          ) : (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => answer('No')}
                disabled={respond.isPending}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
              >
                Nanti dulu
              </button>
              <button
                onClick={() => answer('Yes')}
                disabled={respond.isPending}
                className="flex-1 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/30 transition active:scale-95 disabled:opacity-40"
              >
                Gas, aku ikut! 🍜
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
