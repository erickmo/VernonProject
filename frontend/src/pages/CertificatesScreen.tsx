import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Award, Plus, SearchX, ChevronRight, ShieldCheck, ShieldX, Clock, FileEdit } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { CertificateHelpSheet, InfoDot } from '@/components/CertificateHelpSheet'
import { useCertificateAccess, useCertificates, useMyScore } from '@/hooks/useData'
import { STATUS_LABEL, componentLabel, droppedComponents, fmtScore, gradeTone } from '@/lib/certificate'
import type { CertificateRow, CertificateStatus } from '@/lib/types'

const card = 'rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card'

const STATUS_STYLE: Record<CertificateStatus, string> = {
  Draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  'Pending HR': 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  Published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  Revoked: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
}

const STATUS_ICON: Record<CertificateStatus, React.ComponentType<{ className?: string }>> = {
  Draft: FileEdit,
  'Pending HR': Clock,
  Published: ShieldCheck,
  Revoked: ShieldX,
}

const GRADE_STYLE: Record<string, string> = {
  good: 'bg-emerald-500 text-white',
  ok: 'bg-brand-600 text-white',
  warn: 'bg-amber-500 text-white',
  bad: 'bg-rose-500 text-white',
  none: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

/** One score, shown next to its twin. Never merged — see the "dua-nilai" help entry. */
function ScoreChip({ label, score, grade }: { label: string; score: number | null; grade?: string | null }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums text-stone-800 dark:text-slate-100">{fmtScore(score)}</span>
        {grade && (
          <span className={clsx('rounded-full px-1.5 text-[10px] font-bold', GRADE_STYLE[gradeTone(grade)])}>
            {grade}
          </span>
        )}
      </p>
    </div>
  )
}

function Row({ row }: { row: CertificateRow }) {
  const Icon = STATUS_ICON[row.status]
  return (
    <Link to={`/certificates/${row.name}`} className={clsx(card, 'block p-4 transition active:scale-[0.99]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{row.intern_name}</p>
          <p className="truncate text-xs text-stone-500 dark:text-slate-400">
            {row.position || 'Peserta magang'}
            {row.project_name ? ` · ${row.project_name}` : ''}
          </p>
        </div>
        <span className={clsx('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLE[row.status])}>
          <Icon className="h-3 w-3" />
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400">
        {row.period_start} — {row.period_end}
        {row.cert_no ? ` · ${row.cert_no}` : ''}
      </p>

      <div className="mt-3 flex items-center gap-3 border-t border-paper-line pt-3 dark:border-slate-700">
        <ScoreChip label="Nilai Kinerja" score={row.auto_score} grade={row.auto_grade} />
        <ScoreChip label="Nilai Penilaian" score={row.rubric_score} grade={row.rubric_grade} />
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-slate-600" />
      </div>
    </Link>
  )
}

/** The viewer's own live score. Shown to everyone, because the number is about them and
 *  waiting until a certificate exists means meeting it for the first time on the way out. */
function MyScoreCard({ onHelp }: { onHelp: (t: string) => void }) {
  const { data, isLoading } = useMyScore()
  if (isLoading || !data) return null
  const dropped = droppedComponents(data)

  return (
    <div className={clsx(card, 'mb-4 p-4')}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        Nilai Magang Saya
        <InfoDot term="dua-nilai" onOpen={onHelp} label="Kenapa nilainya ada dua" />
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-stone-800 dark:text-slate-100">
          {fmtScore(data.auto_score)}
        </span>
        {data.grade && (
          <span className={clsx('rounded-full px-2 py-0.5 text-xs font-bold', GRADE_STYLE[gradeTone(data.grade)])}>
            {data.grade}
          </span>
        )}
        <span className="text-[11px] text-stone-400 dark:text-slate-500">
          {data.period_start} — {data.period_end}
        </span>
      </p>

      {data.components.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {data.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-stone-600 dark:text-slate-300">{c.label}</span>
                <span className="shrink-0 tabular-nums text-stone-700 dark:text-slate-200">
                  {Math.round(c.value)}%
                  <span className="ml-1 text-stone-400 dark:text-slate-500">{c.detail}</span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-stone-500 dark:text-slate-400">
        <span>
          Ini nilai berjalan — masih berubah mengikuti pekerjaanmu.
          {dropped.length > 0 && ` Belum dinilai: ${dropped.map(componentLabel).join(', ')}.`}
        </span>
        <InfoDot term={dropped.length ? 'komponen-hilang' : 'nilai-berubah'} onOpen={onHelp} />
      </p>
    </div>
  )
}

const TABS = [
  { value: 'action', label: 'Perlu tindakan' },
  { value: 'all', label: 'Semua' },
]

export default function CertificatesScreen() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('action')
  const [help, setHelp] = useState<string | null>(null)

  const access = useCertificateAccess()
  const { data, isLoading } = useCertificates()

  const rows = data?.rows ?? []
  const canIssue = !!access.data?.can_issue
  const isHr = !!access.data?.is_hr

  // "Perlu tindakan" means something is waiting on *this* viewer: HR sees submissions to
  // publish, a leader sees their own unfinished drafts.
  const needsAction = useMemo(
    () => rows.filter((r) => (isHr ? r.status === 'Pending HR' || r.status === 'Draft' : r.status === 'Draft')),
    [rows, isHr],
  )
  const shown = tab === 'action' && canIssue ? needsAction : rows

  return (
    <DetailScreen
      title="Sertifikat Magang"
      right={<InfoDot term="alur" onOpen={setHelp} label="Cara kerja sertifikat" />}
    >
      <MyScoreCard onHelp={setHelp} />

      {canIssue && (
        <div className="mb-4">
          <Segmented
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => (
              t.value === 'action' ? { ...t, badge: needsAction.length || undefined } : t
            ))}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={rows.length ? SearchX : Award}
          title={rows.length ? 'Tidak ada yang perlu ditindak' : 'Belum ada sertifikat'}
          subtitle={
            canIssue
              ? 'Buat sertifikat untuk peserta magang yang sudah menyelesaikan periodenya.'
              : 'Sertifikat magang kamu akan muncul di sini setelah diterbitkan HR.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => <Row key={r.name} row={r} />)}
        </div>
      )}

      {canIssue && (
        <button
          onClick={() => navigate('/certificates/new')}
          aria-label="Buat sertifikat"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg transition active:scale-90"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <CertificateHelpSheet term={help} onClose={() => setHelp(null)} />
    </DetailScreen>
  )
}
