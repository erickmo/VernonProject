import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { GraduationCap, AlertTriangle, SearchX, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page, PageHeader } from '@web/components/Page'
import { Sheet } from '@web/components/Sheet'
import { InfoDot } from '@web/components/InfoDot'
import { EmptyState, Spinner, Pill } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useInternAllocation } from '@/hooks/useData'
import {
  EMPTY_INTERN_FILTERS, REASON_LABEL, cellBand, dayLabel, filterInternRows,
  internFilterOptions, isWeekend, lastDays,
} from '@/lib/internAllocation'
import type { InternAllocationRow } from '@/lib/types'

const RANGES = [7, 14, 30]

const SOURCES = [
  { value: '', label: 'Semua sumber' },
  { value: 'member_type', label: 'Member Type' },
  { value: 'profile', label: 'Profil Karyawan' },
]

const BAND: Record<'empty' | 'thin' | 'ok', string> = {
  empty: 'text-muted/40',
  thin: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
}

const FIELD = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none'
const TH = 'whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted'
// The name column stays put while the day grid scrolls under it.
const STICKY = 'sticky left-0 z-10 bg-surface'

function SignalCell({ value, warn }: { value: string; warn?: boolean }) {
  return (
    <td className={clsx('whitespace-nowrap px-2 py-2 text-center text-sm tabular-nums',
      warn ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-ink')}>
      {value}
    </td>
  )
}

function DetailSheet({ row, onClose }: { row: InternAllocationRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} title={row?.full_name} onClose={onClose} size="lg">
      {row && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm text-muted">{row.user}</p>
            <Link to={`/users/${encodeURIComponent(row.user)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              Buka profil <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          {row.attention && (
            <div className="flex flex-wrap gap-1.5">
              {row.reasons.map((r) => (
                <Pill key={r} className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {REASON_LABEL[r]}
                </Pill>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Terakhir diberi tugas', value: row.last_assigned_on ? dayLabel(row.last_assigned_on) : 'Belum pernah', term: 'stale' },
              { label: 'Menunggu review', value: row.awaiting_review ? `${row.awaiting_review} · ${row.oldest_wait_days} hari` : '0', term: 'waiting' },
              { label: 'Selesai', value: `${row.done}/${row.assigned_count}`, term: 'done' },
              { label: 'Catatan pemimpin', value: row.last_note_on ? `${row.notes_count} · ${dayLabel(row.last_note_on)}` : String(row.notes_count), term: 'notes' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-line p-3">
                <dt className="flex items-center text-[11px] uppercase tracking-wide text-muted">
                  {s.label}<InfoDot term={s.term} />
                </dt>
                <dd className="mt-0.5 font-semibold text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="mb-2 flex items-center text-sm font-semibold text-ink">
              Per proyek &amp; pemimpinnya<InfoDot term="project_minutes" />
            </p>
            {row.projects.length === 0 ? (
              <p className="rounded-xl border border-line p-4 text-sm text-muted">
                Tidak ada tugas pada jendela ini — tidak ada pemimpin yang bisa ditanya soal beban kerjanya.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className={TH}>Proyek</th>
                      <th className={TH}>Pemimpin</th>
                      <th className={`${TH} text-right`}>Tugas</th>
                      <th className={`${TH} text-right`}>Menit</th>
                      <th className={`${TH} text-right`}>Menunggu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.projects.map((p) => (
                      <tr key={p.project} className="border-b border-line/60 last:border-0">
                        <td className="px-2 py-2 font-medium text-ink">{p.project_name}</td>
                        <td className="px-2 py-2 text-muted">{p.leader_name || 'belum ada'}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink">{p.todos}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink">{p.minutes}</td>
                        <td className={clsx('px-2 py-2 text-right tabular-nums', p.waiting ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted')}>
                          {p.waiting}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

export default function InternAllocation() {
  const [days, setDays] = useState(14)
  const [from, to] = useMemo(() => lastDays(days), [days])
  const { data, isLoading, isError, error } = useInternAllocation(from, to)

  const [filters, setFilters] = useState(EMPTY_INTERN_FILTERS)
  const [detail, setDetail] = useState<InternAllocationRow | null>(null)

  const rows = data?.rows ?? []
  const dates = data?.dates ?? []
  const threshold = data?.threshold ?? 0
  const options = useMemo(() => internFilterOptions(rows), [rows])
  const shown = useMemo(() => filterInternRows(rows, filters), [rows, filters])
  const denied = isError && /permission|not permitted/i.test(String((error as Error)?.message ?? ''))

  if (denied) {
    return (
      <Page>
        <PageHeader icon={GraduationCap} title="Alokasi Magang" />
        <EmptyState icon={GraduationCap} title="Tidak ada akses" subtitle="Laporan ini untuk tim HR dan pemimpin proyek." />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        icon={GraduationCap}
        title="Alokasi Magang"
        subtitle={
          <span className="inline-flex items-center">
            {data?.totals.interns ?? 0} magang · {data?.totals.attention ?? 0} perlu perhatian
            <InfoDot term="attention" />
            <span className="mx-2 text-line">|</span>
            {data?.scope === 'team' ? 'Magang di proyek yang Anda pegang' : 'Seluruh magang'}
            <InfoDot term="scope" />
          </span>
        }
      />

      {/* Toolbar — every filter is client-side, so results change as you type. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-surface p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={clsx('rounded-lg px-3 py-1.5 text-sm font-medium transition',
                d === days ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}
            >
              {d} hari
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, attentionOnly: !f.attentionOnly }))}
          aria-pressed={filters.attentionOnly}
          className={clsx('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition',
            filters.attentionOnly
              ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
              : 'border-line bg-surface text-muted hover:text-ink')}
        >
          <AlertTriangle className="h-4 w-4" />
          Perlu perhatian ({rows.filter((r) => r.attention).length})
        </button>

        <div className="w-48"><SearchableSelect value={filters.leader} onChange={(v) => setFilters((f) => ({ ...f, leader: v }))} options={options.leaders} placeholder="Semua pemimpin" allowClear /></div>
        <div className="w-48"><SearchableSelect value={filters.project} onChange={(v) => setFilters((f) => ({ ...f, project: v }))} options={options.projects} placeholder="Semua proyek" allowClear /></div>
        <div className="flex w-48 items-center">
          <SearchableSelect
            value={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v as typeof f.source }))}
            options={SOURCES}
            placeholder="Semua sumber"
          />
          <InfoDot term="sources" />
        </div>

        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Cari magang…"
          aria-label="Cari magang"
          className={`${FIELD} w-52`}
        />
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner /></div>}

      {!isLoading && shown.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Tidak ada magang"
          subtitle={rows.length ? 'Tidak ada yang cocok dengan filter ini.' : 'Belum ada pengguna yang ditandai sebagai magang.'}
        />
      )}

      {!isLoading && shown.length > 0 && (
        // Only this container scrolls sideways — the page body never does.
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} ${STICKY} text-left`}>Magang</th>
                {dates.map((d) => (
                  <th key={d} className={clsx(TH, 'text-center', isWeekend(d) && 'text-muted/50')} title={dayLabel(d)}>
                    <span className="block leading-tight">{dayLabel(d).split(' ')[0]}</span>
                    <span className="block leading-tight">{d.slice(-2)}</span>
                  </th>
                ))}
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Kosong<InfoDot term="zero_days" /></span></th>
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Sepi<InfoDot term="stale" /></span></th>
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Menunggu<InfoDot term="waiting" /></span></th>
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Selesai<InfoDot term="done" /></span></th>
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Telat<InfoDot term="late" /></span></th>
                <th className={`${TH} text-center`}><span className="inline-flex items-center">Catatan<InfoDot term="notes" /></span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.user}
                  onClick={() => setDetail(r)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setDetail(r) }}
                  className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-canvas focus:bg-canvas focus:outline-none"
                >
                  <td className={`${STICKY} px-2 py-2`}>
                    <div className="flex items-center gap-2">
                      {r.attention
                        ? <span aria-label="Perlu perhatian" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        : <span className="h-2 w-2 shrink-0" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.full_name}</p>
                        <p className="truncate text-xs text-muted">
                          {r.leaders.length ? r.leaders.map((l) => l.leader_name).join(', ') : 'belum ada pemimpin'}
                        </p>
                      </div>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const m = r.per_day_assigned[d] ?? 0
                    return (
                      <td key={d} className={clsx('px-1 py-1 text-center', isWeekend(d) && 'opacity-60')}>
                        <span
                          title={`${dayLabel(d)} — ${m} menit`}
                          className={clsx('inline-flex h-7 w-full min-w-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
                            BAND[cellBand(m, threshold)])}
                        >
                          {m || '·'}
                        </span>
                      </td>
                    )
                  })}
                  <SignalCell value={String(r.zero_days)} warn={r.zero_days > 0} />
                  <SignalCell value={`${r.stale_days}h`} warn={r.reasons.includes('stale')} />
                  <SignalCell value={r.awaiting_review ? `${r.awaiting_review} · ${r.oldest_wait_days}h` : '0'} warn={r.reasons.includes('waiting')} />
                  <SignalCell value={`${r.done}/${r.assigned_count}`} />
                  <SignalCell value={String(r.late)} warn={r.late > 0} />
                  <SignalCell value={String(r.notes_count)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailSheet row={detail} onClose={() => setDetail(null)} />
    </Page>
  )
}
