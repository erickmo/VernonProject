import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  GraduationCap, Info, AlertTriangle, CalendarOff, Hourglass, CheckCircle2,
  Clock, NotebookPen, ChevronRight, SearchX, X,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented, Pill } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { InternHelpSheet } from '@/components/InternHelpSheet'
import { useInternAllocation } from '@/hooks/useData'
import {
  EMPTY_INTERN_FILTERS, REASON_LABEL, cellBand, dayLabel, filterInternRows,
  internFilterOptions, isWeekend, lastDays,
} from '@/lib/internAllocation'
import type { InternAllocationRow } from '@/lib/types'

const RANGES = [
  { value: '7', label: '7 hari' },
  { value: '14', label: '14 hari' },
  { value: '30', label: '30 hari' },
]

const SOURCES = [
  { value: '', label: 'Semua' },
  { value: 'member_type', label: 'Member Type' },
  { value: 'profile', label: 'Profil' },
]

const card = 'rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card'

// Day cell colouring. `thin` only exists when the site set a daily minimum — see cellBand.
const BAND: Record<'empty' | 'thin' | 'ok', string> = {
  empty: 'bg-paper-line text-stone-300 dark:bg-slate-700/60 dark:text-slate-600',
  thin: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
}

/** A metric badge that doubles as its own (i) — tap explains the number. */
function Signal({
  icon: Icon, label, value, term, tone = 'plain', onInfo,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  term: string
  tone?: 'plain' | 'warn' | 'good'
  onInfo: (term: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onInfo(term)}
      aria-label={`${label}: ${value}. Ketuk untuk penjelasan`}
      className={clsx(
        'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition active:scale-95',
        tone === 'warn' && 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        tone === 'good' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        tone === 'plain' && 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-stone-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold">{value}</span>
      <Info className="h-3 w-3 shrink-0 opacity-40" />
    </button>
  )
}

function DetailSheet({ row, onClose }: { row: InternAllocationRow | null; onClose: () => void }) {
  if (!row) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rincian ${row.full_name}`}
        className="relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up dark:bg-slate-800"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-800 dark:text-slate-100">{row.full_name}</h2>
            <p className="truncate text-xs text-stone-400 dark:text-slate-500">{row.user}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-paper-line p-3 dark:bg-slate-700/60">
            <dt className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500">Terakhir diberi tugas</dt>
            <dd className="font-semibold text-stone-800 dark:text-slate-100">
              {row.last_assigned_on ? dayLabel(row.last_assigned_on) : 'Belum pernah'}
            </dd>
          </div>
          <div className="rounded-xl bg-paper-line p-3 dark:bg-slate-700/60">
            <dt className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500">Catatan terakhir</dt>
            <dd className="font-semibold text-stone-800 dark:text-slate-100">
              {row.last_note_on ? dayLabel(row.last_note_on) : 'Belum ada'}
            </dd>
          </div>
        </dl>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
          Per proyek &amp; pemimpinnya
        </p>
        {row.projects.length === 0 ? (
          <p className="rounded-2xl bg-paper-line p-4 text-sm text-stone-500 dark:bg-slate-700/60 dark:text-slate-400">
            Tidak ada tugas pada jendela ini — tidak ada pemimpin yang bisa dihubungi soal beban kerjanya.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {row.projects.map((p) => (
              <div key={p.project} className="rounded-2xl border border-paper-edge p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-stone-800 dark:text-slate-100">{p.project_name}</p>
                  {p.waiting > 0 && (
                    <Pill className="shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      {p.waiting} menunggu
                    </Pill>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                  Pemimpin: <span className="font-medium text-stone-700 dark:text-slate-200">{p.leader_name || 'belum ada'}</span>
                </p>
                <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">
                  {p.todos} tugas · {p.minutes} menit
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function InternAllocationScreen() {
  const [days, setDays] = useState('14')
  const [from, to] = useMemo(() => lastDays(Number(days)), [days])
  const { data, isLoading, isError, error } = useInternAllocation(from, to)

  const [filters, setFilters] = useState(EMPTY_INTERN_FILTERS)
  const [helpTerm, setHelpTerm] = useState<string | null>(null)
  const [detail, setDetail] = useState<InternAllocationRow | null>(null)

  const rows = data?.rows ?? []
  const options = useMemo(() => internFilterOptions(rows), [rows])
  const shown = useMemo(() => filterInternRows(rows, filters), [rows, filters])
  const threshold = data?.threshold ?? 0
  const denied = isError && /permission|not permitted/i.test(String((error as Error)?.message ?? ''))

  return (
    <DetailScreen title="Alokasi Magang">
      {denied ? (
        <EmptyState icon={GraduationCap} title="Tidak ada akses" subtitle="Laporan ini untuk tim HR dan pemimpin proyek." />
      ) : (
        <div className="flex flex-col gap-4 pt-4">
          {/* Ringkasan + rentang. The (i) explains what "perlu perhatian" means. */}
          <div className={`${card} flex flex-col gap-3`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-2xl font-bold text-stone-800 dark:text-slate-50">
                  {data?.totals.attention ?? 0}
                  <span className="ml-1 text-sm font-medium text-stone-400 dark:text-slate-500">
                    / {data?.totals.interns ?? 0} magang
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setHelpTerm('attention')}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> perlu perhatian <Info className="h-3 w-3 opacity-50" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setHelpTerm('scope')}
                aria-label="Penjelasan laporan"
                className="rounded-full p-2 text-stone-400 active:bg-paper-line dark:text-slate-500 dark:active:bg-slate-700"
              >
                <Info className="h-5 w-5" />
              </button>
            </div>
            <Segmented options={RANGES} value={days} onChange={setDays} />
          </div>

          {/* Filter — semuanya di sisi klien, jadi hasilnya seketika. */}
          <div className="flex flex-col gap-2">
            <Segmented
              options={[
                { value: 'all', label: `Semua (${rows.length})` },
                { value: 'attention', label: `Perlu perhatian (${rows.filter((r) => r.attention).length})` },
              ]}
              value={filters.attentionOnly ? 'attention' : 'all'}
              onChange={(v) => setFilters((f) => ({ ...f, attentionOnly: v === 'attention' }))}
            />
            <input
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Cari nama magang…"
              aria-label="Cari nama magang"
              className="w-full rounded-xl border border-paper-edge bg-paper-card px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <SearchableSelect
                value={filters.leader}
                onChange={(v) => setFilters((f) => ({ ...f, leader: v }))}
                options={options.leaders}
                placeholder="Semua pemimpin"
                allowClear
              />
              <SearchableSelect
                value={filters.project}
                onChange={(v) => setFilters((f) => ({ ...f, project: v }))}
                options={options.projects}
                placeholder="Semua proyek"
                allowClear
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">Sumber</span>
              <div className="min-w-0 flex-1">
                <Segmented
                  options={SOURCES}
                  value={filters.source}
                  onChange={(v) => setFilters((f) => ({ ...f, source: v as typeof f.source }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setHelpTerm('sources')}
                aria-label="Penjelasan sumber data magang"
                className="shrink-0 rounded-full p-1.5 text-stone-400 dark:text-slate-500"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {!isLoading && shown.length === 0 && (
            <EmptyState
              icon={SearchX}
              title="Tidak ada magang"
              subtitle={rows.length ? 'Tidak ada yang cocok dengan filter ini.' : 'Belum ada pengguna yang ditandai sebagai magang.'}
            />
          )}

          {shown.map((r) => (
            <button
              key={r.user}
              type="button"
              onClick={() => setDetail(r)}
              className={`${card} w-full text-left transition active:scale-[0.99]`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold text-stone-800 dark:text-slate-100">
                    {r.attention && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                    <span className="truncate">{r.full_name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-stone-400 dark:text-slate-500">
                    {r.leaders.length
                      ? `Pemimpin: ${r.leaders.map((l) => l.leader_name).join(', ')}`
                      : 'Belum ada pemimpin — tidak ada tugas di jendela ini'}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300 dark:text-slate-600" />
              </div>

              {r.attention && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.reasons.map((reason) => (
                    <Pill key={reason} className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      {REASON_LABEL[reason]}
                    </Pill>
                  ))}
                </div>
              )}

              {/* Kisi harian: satu chip per hari, akhir pekan diredupkan. */}
              <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1">
                {(data?.dates ?? []).map((d) => {
                  const m = r.per_day_assigned[d] ?? 0
                  return (
                    <span
                      key={d}
                      title={`${dayLabel(d)} — ${m} menit`}
                      aria-label={`${dayLabel(d)}, ${m} menit`}
                      className={clsx(
                        'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 text-[11px] font-semibold tabular-nums',
                        BAND[cellBand(m, threshold)],
                        isWeekend(d) && 'opacity-50',
                      )}
                    >
                      {d.slice(-2)}
                    </span>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Signal icon={CalendarOff} label="Kosong" value={`${r.zero_days}h`} term="zero_days"
                  tone={r.zero_days > 0 ? 'warn' : 'plain'} onInfo={setHelpTerm} />
                <Signal icon={Clock} label="Sepi" value={`${r.stale_days}h`} term="stale"
                  tone={r.reasons.includes('stale') ? 'warn' : 'plain'} onInfo={setHelpTerm} />
                <Signal icon={Hourglass} label="Menunggu" value={r.awaiting_review ? `${r.awaiting_review} · ${r.oldest_wait_days}h` : '0'}
                  term="waiting" tone={r.reasons.includes('waiting') ? 'warn' : 'plain'} onInfo={setHelpTerm} />
                <Signal icon={CheckCircle2} label="Selesai" value={`${r.done}/${r.assigned_count}`} term="done"
                  tone={r.assigned_count > 0 && r.done === r.assigned_count ? 'good' : 'plain'} onInfo={setHelpTerm} />
                <Signal icon={Clock} label="Telat" value={String(r.late)} term="late"
                  tone={r.late > 0 ? 'warn' : 'plain'} onInfo={setHelpTerm} />
                <Signal icon={NotebookPen} label="Catatan" value={String(r.notes_count)} term="notes" onInfo={setHelpTerm} />
              </div>
            </button>
          ))}
        </div>
      )}

      <DetailSheet row={detail} onClose={() => setDetail(null)} />
      <InternHelpSheet term={helpTerm} onClose={() => setHelpTerm(null)} />
    </DetailScreen>
  )
}
