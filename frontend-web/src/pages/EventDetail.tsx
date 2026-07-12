import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CalendarDays, MapPin, Users, ArrowLeft, Ticket } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useEvent, useRegisterEvent } from '@/hooks/useData'
import { snapPay } from '@/lib/snap'
import { sanitizeHtml } from '@/lib/format'
import { Page, PageHeader, Section } from '@web/components/Page'
import { Property, PropertyRow } from '@web/components/Property'

export default function EventDetail() {
  const { name: raw } = useParams()
  const name = raw ? decodeURIComponent(raw) : ''
  const navigate = useNavigate()
  const { data: ev, isLoading, isError, refetch } = useEvent(name)
  const register = useRegisterEvent()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  // ponytail: register logic copied verbatim from E2 EventDetailScreen.tsx
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

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (isError || !ev) return <ErrorState onRetry={() => refetch()} />

  const joined = ev.my_status === 'Confirmed'
  const cta = joined
    ? 'Joined'
    : ev.pricing === 'Free'
    ? 'Register'
    : ev.pricing === 'Points'
    ? `Register · ${ev.points_cost ?? 0} pts`
    : `Pay Rp ${(ev.price ?? 0).toLocaleString('id-ID')}`

  return (
    <Page className="max-w-2xl">
      <PageHeader
        icon={CalendarDays}
        title={ev.title}
        actions={
          <button
            onClick={() => navigate('/events')}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Events
          </button>
        }
      />

      {ev.cover_image && (
        <img src={ev.cover_image} alt="" className="mb-6 w-full rounded-2xl object-cover max-h-64" />
      )}

      <Section title="Details" divider={false}>
        <PropertyRow>
          <Property label="When" icon={CalendarDays}>
            {new Date(ev.start_datetime).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
          </Property>
          {ev.location && (
            <Property label="Location" icon={MapPin}>{ev.location}</Property>
          )}
          <Property label="Price">
            {ev.pricing === 'Free' ? 'Free' : ev.pricing === 'Points' ? `${ev.points_cost ?? 0} pts` : `Rp ${(ev.price ?? 0).toLocaleString('id-ID')}`}
          </Property>
          <Property label="Registered" icon={Users}>
            {ev.registered_count}{ev.capacity ? ` / ${ev.capacity}` : ''}
          </Property>
        </PropertyRow>
      </Section>

      {ev.description && (
        <Section title="About">
          <div
            className="prose prose-sm text-ink dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.description) }}
          />
        </Section>
      )}

      {ev.sub_events && ev.sub_events.length > 0 && (
        <Section title="Sub-events">
          <div className="flex flex-col gap-2">
            {ev.sub_events.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate(`/events/${encodeURIComponent(s.name)}`)}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card transition active:scale-[0.99]"
              >
                {s.cover_image ? (
                  <img src={s.cover_image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-600/10">
                    <Ticket className="h-4 w-4 text-brand-600" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {new Date(s.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    {s.pricing === 'Free' ? ' · Free' : s.pricing === 'Points' ? ` · ${s.points_cost ?? 0} pts` : ` · Rp ${(s.price ?? 0).toLocaleString('id-ID')}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-brand-600">
                  {s.my_status === 'Confirmed' ? 'Joined' : 'View'}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section>
        <button
          disabled={joined || ev.is_full || busy}
          onClick={onRegister}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
        >
          {ev.is_full && !joined ? 'Full' : busy ? 'Processing…' : cta}
        </button>
      </Section>
    </Page>
  )
}
