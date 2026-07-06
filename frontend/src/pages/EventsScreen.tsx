import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarCog, Plus, Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill, Segmented } from '@/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'

type Tab = 'browse' | 'manage'

function priceLabel(e: { pricing: string; points_cost?: number; price?: number }) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function EventsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const active = tab === 'browse' ? browse : managed
  const list = active.data ?? []

  // "+" (create) only makes sense on the Manage tab — mirrors the old Manage screen header.
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
      ) : (
        <PullToRefresh onRefresh={active.refetch}>
          {list.length === 0 ? (
            tab === 'browse' ? (
              <EmptyState icon={CalendarDays} title="No events yet" subtitle="Check back soon." />
            ) : (
              <EmptyState icon={CalendarCog} title="No events yet" subtitle="Tap + to create one." />
            )
          ) : (
            <div className="flex flex-col gap-2.5">
              {list.map((e) => (
                <button
                  key={e.name}
                  onClick={() =>
                    navigate(
                      tab === 'browse'
                        ? `/events/${encodeURIComponent(e.name)}`
                        : `/events/manage/${encodeURIComponent(e.name)}`,
                    )
                  }
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  {tab === 'browse' && (
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                      <Ticket className="h-5 w-5 text-brand-500" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      {tab === 'manage' && ` · ${(e as { registered_count?: number }).registered_count ?? 0} registered`}
                    </span>
                  </span>
                  {tab === 'browse' ? (
                    <Pill>{(e as { my_status?: string }).my_status === 'Confirmed' ? 'Joined' : priceLabel(e as never)}</Pill>
                  ) : (
                    <Pill className="bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300">{(e as { status?: string }).status}</Pill>
                  )}
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
