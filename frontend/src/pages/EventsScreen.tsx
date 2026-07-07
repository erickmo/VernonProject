import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarCog, Plus, Ticket, Search } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill, Segmented } from '@/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'
import { filterEvents, featuredUpcoming, eventCategories, type EventFilter } from '@/lib/events'
import type { EventItem } from '@/lib/types'

type Tab = 'browse' | 'manage'

function priceLabel(e: { pricing: string; points_cost?: number; price?: number }) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

const fmtDate = (v: string) => new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

// Small pill-style chip toggle used for period / category / price filter rows.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function EventsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const [filter, setFilter] = useState<EventFilter>({ q: '', period: 'upcoming', category: 'all', pricing: 'all' })

  const active = tab === 'browse' ? browse : managed
  const browseItems = (browse.data ?? []) as EventItem[]
  const hero = tab === 'browse' ? featuredUpcoming(browseItems) : []
  const cats = tab === 'browse' ? eventCategories(browseItems) : []
  const heroNames = new Set(hero.map((h) => h.name))
  const browseList = tab === 'browse' ? filterEvents(browseItems, filter).filter((e) => !heroNames.has(e.name)) : []
  const manageList = managed.data ?? []

  const addBtn =
    tab === 'manage' ? (
      <button onClick={() => navigate('/events/manage/new')} aria-label="New event"
        className="flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition active:scale-90 dark:text-slate-300">
        <Plus className="h-6 w-6" />
      </button>
    ) : undefined

  return (
    <DetailScreen title="Events" right={addBtn}>
      <div className="mb-3">
        <Segmented<Tab>
          options={[
            { value: 'browse', label: 'Browse' },
            { value: 'manage', label: 'Manage' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {active.isLoading && !active.data ? (
        <FullScreenLoader label="Loading events…" />
      ) : tab === 'manage' ? (
        <PullToRefresh onRefresh={managed.refetch}>
          {manageList.length === 0 ? (
            <EmptyState icon={CalendarCog} title="No events yet" subtitle="Tap + to create one." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {manageList.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)} · {e.registered_count ?? 0} registered
                    </span>
                  </span>
                  <Pill className="bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300">{e.status}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      ) : (
        <PullToRefresh onRefresh={browse.refetch}>
          {/* Hero: featured upcoming events */}
          {hero.length > 0 && (
            <div className="-mx-1 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {hero.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-left shadow-sm transition active:scale-[0.99]"
                >
                  {e.cover_image ? (
                    <img src={e.cover_image} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <span className="flex h-32 w-full items-center justify-center bg-brand-50 dark:bg-slate-700">
                      <Ticket className="h-7 w-7 text-brand-500" />
                    </span>
                  )}
                  <span className="block p-3">
                    <span className="mb-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Featured
                    </span>
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)} · {priceLabel(e)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="mb-3 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Cari acara…"
                className="w-full rounded-xl border border-paper-edge bg-paper-card py-2 pl-9 pr-3 text-sm text-stone-700 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={filter.period === 'upcoming'} onClick={() => setFilter((f) => ({ ...f, period: 'upcoming' }))}>Upcoming</Chip>
              <Chip active={filter.period === 'past'} onClick={() => setFilter((f) => ({ ...f, period: 'past' }))}>Past</Chip>
              <span className="mx-0.5 w-px shrink-0 self-stretch bg-paper-line dark:bg-slate-700" />
              {(['all', 'Free', 'Points', 'Rupiah'] as const).map((p) => (
                <Chip key={p} active={filter.pricing === p} onClick={() => setFilter((f) => ({ ...f, pricing: p }))}>
                  {p === 'all' ? 'All price' : p}
                </Chip>
              ))}
            </div>
            {cats.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Chip active={filter.category === 'all'} onClick={() => setFilter((f) => ({ ...f, category: 'all' }))}>All</Chip>
                {cats.map((c) => (
                  <Chip key={c} active={filter.category === c} onClick={() => setFilter((f) => ({ ...f, category: c }))}>{c}</Chip>
                ))}
              </div>
            )}
          </div>

          {/* Filtered list */}
          {browseList.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events" subtitle="Try different filters." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {browseList.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-5 w-5 text-brand-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)}{e.category ? ` · ${e.category}` : ''}
                    </span>
                  </span>
                  <Pill>{e.my_status === 'Confirmed' ? 'Joined' : priceLabel(e)}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
