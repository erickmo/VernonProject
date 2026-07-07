import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapPin, Calendar, Ticket } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader } from '@/components/ui'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useEvent, useRegisterEvent } from '@/hooks/useData'
import { snapPay } from '@/lib/snap'
import { sanitizeHtml } from '@/lib/format'

export default function EventDetailScreen() {
  const { name: raw } = useParams()
  const name = raw ? decodeURIComponent(raw) : ''
  const navigate = useNavigate()
  const { data: ev, isLoading, refetch } = useEvent(name)
  const register = useRegisterEvent()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function onRegister() {
    if (!ev) return
    if (ev.pricing === 'Points') {
      const ok = await confirm({
        title: `Register for ${ev.title}?`,
        message: `This spends ${ev.points_cost ?? 0} points.`,
        confirmLabel: 'Register',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await register.mutateAsync(ev.name)
      if (res.status === 'Pending' && res.snap_token) {
        await snapPay(res.snap_token)
        await refetch()
      } else {
        await refetch()
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not register')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !ev) {
    return (
      <DetailScreen title="Vernon Event">
        <FullScreenLoader label="Loading…" />
      </DetailScreen>
    )
  }

  const joined = ev.my_status === 'Confirmed'
  const cta = joined
    ? 'Joined'
    : ev.pricing === 'Free'
    ? 'Register'
    : ev.pricing === 'Points'
    ? `Register · ${ev.points_cost ?? 0} pts`
    : `Pay Rp ${(ev.price ?? 0).toLocaleString('id-ID')}`

  return (
    <DetailScreen title={ev.title}>
      {ev.cover_image && (
        <img
          src={ev.cover_image}
          alt=""
          className="mb-3 w-full rounded-2xl object-cover"
        />
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-slate-400">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>
            {new Date(ev.start_datetime).toLocaleString('id-ID', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}
          </span>
        </div>
        {ev.location && (
          <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-slate-300">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{ev.location}</span>
          </div>
        )}
      </div>

      {ev.description && (
        <div
          className="prose prose-sm mt-4 dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.description) }}
        />
      )}

      <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
        {ev.registered_count} registered{ev.capacity ? ` · ${ev.capacity} cap` : ''}
      </p>

      {ev.sub_events && ev.sub_events.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 font-display text-sm font-semibold text-stone-700 dark:text-slate-200">Acara di dalam</h2>
          <div className="flex flex-col gap-2">
            {ev.sub_events.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate(`/events/${encodeURIComponent(s.name)}`)}
                className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3 text-left shadow-sm transition active:scale-[0.99]"
              >
                {s.cover_image ? (
                  <img src={s.cover_image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-4 w-4 text-brand-500" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-50">{s.title}</span>
                  <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                    {new Date(s.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    {s.pricing === 'Free' ? ' · Free' : s.pricing === 'Points' ? ` · ${s.points_cost ?? 0} pts` : ` · Rp ${(s.price ?? 0).toLocaleString('id-ID')}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand-600">
                  {s.my_status === 'Confirmed' ? 'Joined' : 'Lihat'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        disabled={joined || ev.is_full || busy}
        onClick={onRegister}
        className="mt-5 w-full rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {ev.is_full && !joined ? 'Full' : busy ? 'Processing…' : cta}
      </button>
    </DetailScreen>
  )
}
