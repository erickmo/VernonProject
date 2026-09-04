import { UtensilsCrossed, MapPin, Clock, ExternalLink, Check, Ban, Hourglass } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { FoodInvite } from '@/lib/types'
import { formatDateTime, externalUrl } from '@/lib/format'
import { useActiveFoodInvites, useRespondFoodInvite } from '@/hooks/useData'
import CommentThread from './CommentThread'
import { useToast } from './Toast'

// Shared across /m and /w (like FoodInviteModal): the Makan Bareng card that
// sits on Home for everyone invited — inviter, yes, no, and undecided alike —
// until the order-by cutoff passes. The order thread lives here, so people can
// say what they want while there is still time to order it.
//
// The list itself polls (60s), so a passed cutoff drops the card on its own.

function Place({ place }: { place: string }) {
  const href = externalUrl(place)
  if (!href) return <>{place}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand-600 underline decoration-dotted underline-offset-2 dark:text-brand-300"
    >
      {place}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  )
}

function InviteCard({ invite }: { invite: FoodInvite }) {
  const respond = useRespondFoodInvite()
  const toast = useToast()

  const answer = (response: 'Yes' | 'No') => {
    respond.mutate({ invite: invite.name, response }, {
      onSuccess: (r) =>
        r.status === 'closed'
          ? toast('info', 'Yah, undangan sudah ditutup 😅')
          : toast('success', response === 'Yes' ? 'Gas! Kamu ikut pesan 🍜' : 'Oke, lain kali ya'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  const tally = [
    { icon: Check, n: invite.yes_count, label: 'ikut', tone: 'text-emerald-600 dark:text-emerald-400' },
    { icon: Ban, n: invite.no_count, label: 'nggak', tone: 'text-rose-600 dark:text-rose-400' },
    { icon: Hourglass, n: invite.pending_count, label: 'belum jawab', tone: 'text-slate-500 dark:text-slate-400' },
  ].filter((t) => t.n > 0)

  return (
    <div className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm dark:border-amber-500/25 dark:bg-slate-800">
      <div className="flex items-start gap-3 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:from-slate-700/40 dark:to-slate-700/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow">
          <UtensilsCrossed className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Makan Bareng</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {invite.is_inviter ? 'Kamu ngajak makan bareng' : `${invite.inviter_name} ngajak makan bareng`}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{invite.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {invite.place && (
              <span className="inline-flex items-center gap-1 break-all">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <Place place={invite.place} />
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" />Pesan sebelum {formatDateTime(invite.order_by)}
            </span>
          </div>
          {tally.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
              {tally.map(({ icon: Icon, n, label, tone }) => (
                <span key={label} className={'inline-flex items-center gap-1 ' + tone}>
                  <Icon className="h-3.5 w-3.5" />{n} {label}
                </span>
              ))}
              {invite.is_inviter && (
                <Link to={`/food/${invite.name}`} className="text-brand-600 underline decoration-dotted dark:text-brand-300">
                  lihat siapa
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        {!invite.is_inviter && (
          invite.my_response ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Kamu jawab: <b>{invite.my_response === 'Yes' ? 'Ikut 🍜' : 'Nanti dulu'}</b>
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => answer('No')}
                disabled={respond.isPending}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
              >
                Nanti dulu
              </button>
              <button
                onClick={() => answer('Yes')}
                disabled={respond.isPending}
                className="flex-1 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 py-2 text-xs font-bold text-white shadow disabled:opacity-40"
              >
                Gas, aku ikut! 🍜
              </button>
            </div>
          )
        )}

        {/* The order thread — what this card is for. */}
        <CommentThread
          referenceDoctype="Food Invite"
          referenceName={invite.name}
          title="Pesanan & obrolan"
          className="mt-4"
        />
      </div>
    </div>
  )
}

export function FoodInviteHomeCard() {
  const { data } = useActiveFoodInvites()
  if (!data?.length) return null
  return (
    <div className="mt-4 space-y-3">
      {data.map((invite) => (
        <InviteCard key={invite.name} invite={invite} />
      ))}
    </div>
  )
}
