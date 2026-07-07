import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Search, Ticket } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'
import { filterEvents, featuredUpcoming, eventCategories, type EventFilter } from '@/lib/events'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventItem, ManagedEvent } from '@/lib/types'

type Tab = 'browse' | 'manage'
const TABS: { value: Tab; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'manage', label: 'Manage' },
]

function price(e: EventItem) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

const fmtDate = (v: string) => new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
        active ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'
      }`}
    >
      {children}
    </button>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const [filter, setFilter] = useState<EventFilter>({ q: '', period: 'upcoming', category: 'all', pricing: 'all' })

  const q = tab === 'browse' ? browse : managed
  const browseItems = (browse.data ?? []) as EventItem[]
  const hero = featuredUpcoming(browseItems)
  const cats = eventCategories(browseItems)
  const heroNames = new Set(hero.map((h) => h.name))
  const browseRows = filterEvents(browseItems, filter).filter((e) => !heroNames.has(e.name))

  const toggle = (
    <div className="flex items-center gap-2">
      {TABS.map((t) => (
        <button
          key={t.value}
          onClick={() => setTab(t.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'}`}
        >
          {t.label}
        </button>
      ))}
      {tab === 'manage' && (
        <button
          onClick={() => navigate('/events/manage/new')}
          className="ml-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          New event
        </button>
      )}
    </div>
  )

  return (
    <Page>
      <PageHeader icon={CalendarDays} title="Events" actions={toggle} />
      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : tab === 'browse' ? (
        <div className="space-y-4">
          {/* Hero: featured upcoming */}
          {hero.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hero.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="overflow-hidden rounded-xl border border-line bg-hover/[0.02] text-left transition hover:bg-hover/[0.05]"
                >
                  {e.cover_image ? (
                    <img src={e.cover_image} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <span className="flex h-32 w-full items-center justify-center bg-brand-50 dark:bg-brand-600/10">
                      <Ticket className="h-7 w-7 text-brand-600" />
                    </span>
                  )}
                  <span className="block p-3">
                    <span className="mb-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Featured</span>
                    <span className="block truncate font-medium text-ink">{e.title}</span>
                    <span className="block truncate text-sm text-muted">{fmtDate(e.start_datetime)} · {price(e)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search events…"
                className="rounded-lg border border-line bg-hover/[0.04] py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
              />
            </div>
            <Chip active={filter.period === 'upcoming'} onClick={() => setFilter((f) => ({ ...f, period: 'upcoming' }))}>Upcoming</Chip>
            <Chip active={filter.period === 'past'} onClick={() => setFilter((f) => ({ ...f, period: 'past' }))}>Past</Chip>
            <span className="mx-1 h-5 w-px bg-line" />
            {(['all', 'Free', 'Points', 'Rupiah'] as const).map((p) => (
              <Chip key={p} active={filter.pricing === p} onClick={() => setFilter((f) => ({ ...f, pricing: p }))}>{p === 'all' ? 'All price' : p}</Chip>
            ))}
            {cats.length > 0 && <span className="mx-1 h-5 w-px bg-line" />}
            {cats.length > 0 && (
              <Chip active={filter.category === 'all'} onClick={() => setFilter((f) => ({ ...f, category: 'all' }))}>All</Chip>
            )}
            {cats.map((c) => (
              <Chip key={c} active={filter.category === c} onClick={() => setFilter((f) => ({ ...f, category: c }))}>{c}</Chip>
            ))}
          </div>

          <DataTable
            rows={browseRows}
            columns={[
              { key: 'title', header: 'Event', sortValue: (e) => e.title,
                render: (e) => <span className="font-medium text-ink">{e.title}</span> },
              { key: 'start', header: 'When', sortValue: (e) => e.start_datetime,
                render: (e) => <span className="text-muted">{fmtDate(e.start_datetime)}</span> },
              { key: 'category', header: 'Category', render: (e) => <span className="text-muted">{e.category || '—'}</span> },
              { key: 'price', header: 'Price', render: (e) => <span className="text-muted">{price(e)}</span> },
              { key: 'status', header: '', render: (e) => e.my_status === 'Confirmed' ? <span className="text-brand-600">Joined</span> : e.is_full ? <span className="text-muted">Full</span> : null },
            ]}
            getKey={(e) => e.name}
            onRowClick={(e) => navigate(`/events/${encodeURIComponent(e.name)}`)}
          />
        </div>
      ) : (
        <DataTable
          rows={(managed.data ?? []) as ManagedEvent[]}
          columns={[
            { key: 'title', header: 'Event', sortValue: (e) => e.title,
              render: (e) => <span className="font-medium text-ink">{e.title}</span> },
            { key: 'when', header: 'When', sortValue: (e) => e.start_datetime,
              render: (e) => <span className="text-muted">{fmtDate(e.start_datetime)}</span> },
            { key: 'status', header: 'Status', render: (e) => <span className="text-muted">{e.status}</span> },
            { key: 'registered_count', header: 'Registered', render: (e) => <span className="text-muted">{e.registered_count}</span> },
          ]}
          getKey={(e) => e.name}
          onRowClick={(e) => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
        />
      )}
    </Page>
  )
}
