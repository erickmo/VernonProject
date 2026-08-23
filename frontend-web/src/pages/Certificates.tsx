import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Award, Plus, ShieldCheck, ShieldX, Clock, FileEdit } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DataTable, type Column } from '@web/components/DataTable'
import { InfoDot } from '@web/components/InfoDot'
import { Button } from '@/components/ui'
import { Spinner, EmptyState } from '@/components/ui'
import { useCertificateAccess, useCertificates, useMyScore } from '@/hooks/useData'
import { STATUS_LABEL, certHelp, componentLabel, droppedComponents, fmtScore, gradeTone } from '@/lib/certificate'
import type { CertificateRow, CertificateStatus } from '@/lib/types'

const STATUS_STYLE: Record<CertificateStatus, string> = {
  Draft: 'bg-line text-muted',
  'Pending HR': 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  Published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  Revoked: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
}

const STATUS_ICON: Record<CertificateStatus, React.ComponentType<{ className?: string }>> = {
  Draft: FileEdit, 'Pending HR': Clock, Published: ShieldCheck, Revoked: ShieldX,
}

const GRADE_STYLE: Record<string, string> = {
  good: 'bg-emerald-500 text-white', ok: 'bg-brand-600 text-white',
  warn: 'bg-amber-500 text-white', bad: 'bg-rose-500 text-white',
  none: 'bg-line text-muted',
}

function Score({ score, grade }: { score: number | null; grade?: string | null }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums text-ink">{fmtScore(score)}</span>
      {grade && (
        <span className={clsx('rounded-full px-1.5 text-[10px] font-bold', GRADE_STYLE[gradeTone(grade)])}>
          {grade}
        </span>
      )}
    </span>
  )
}

/** The viewer's own live score. Shown to everyone: the number is about them, and
 *  waiting until a certificate exists means meeting it for the first time on the way out. */
function MyScore() {
  const { data, isLoading } = useMyScore()
  if (isLoading || !data) return null
  const dropped = droppedComponents(data)

  return (
    <BentoGrid className="mb-6">
      <BentoTile span="lg">
        <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted">
          Nilai Magang Saya<InfoDot term="dua-nilai" lookup={certHelp} />
        </p>
        <p className="mt-2 flex items-baseline gap-2.5">
          <span className="text-5xl font-bold tabular-nums text-ink">{fmtScore(data.auto_score)}</span>
          {data.grade && (
            <span className={clsx('rounded-full px-2.5 py-0.5 text-sm font-bold', GRADE_STYLE[gradeTone(data.grade)])}>
              {data.grade}
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-muted">
          {data.period_start} — {data.period_end} · nilai berjalan, masih berubah mengikuti pekerjaanmu
          <InfoDot term="nilai-berubah" lookup={certHelp} />
        </p>
      </BentoTile>

      <BentoTile span="wide">
        {data.components.length === 0 ? (
          <p className="text-sm text-muted">Belum ada data yang bisa diukur pada periode ini.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{c.label}</span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {Math.round(c.value)}%<span className="ml-1.5 text-xs text-muted">{c.detail}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {dropped.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Belum dinilai: {dropped.map(componentLabel).join(', ')}.
            <InfoDot term="komponen-hilang" lookup={certHelp} />
          </p>
        )}
      </BentoTile>
    </BentoGrid>
  )
}

const TABS: { value: 'action' | 'all'; label: string }[] = [
  { value: 'action', label: 'Perlu tindakan' },
  { value: 'all', label: 'Semua' },
]

export default function Certificates() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'action' | 'all'>('action')
  const access = useCertificateAccess()
  const { data, isLoading } = useCertificates()

  const rows = data?.rows ?? []
  const canIssue = !!access.data?.can_issue
  const isHr = !!access.data?.is_hr

  const needsAction = useMemo(
    () => rows.filter((r) => (isHr ? r.status === 'Pending HR' || r.status === 'Draft' : r.status === 'Draft')),
    [rows, isHr],
  )
  const shown = tab === 'action' && canIssue ? needsAction : rows

  const columns: Column<CertificateRow>[] = [
    {
      key: 'intern', header: 'Peserta', sortValue: (r) => r.intern_name,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.intern_name}</p>
          <p className="truncate text-xs text-muted">
            {r.position || 'Peserta magang'}{r.project_name ? ` · ${r.project_name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'period', header: 'Periode', width: 'w-52', sortValue: (r) => r.period_start,
      render: (r) => <span className="text-sm text-muted">{r.period_start} — {r.period_end}</span>,
    },
    {
      key: 'auto', header: <>Nilai Kinerja<InfoDot term="dua-nilai" lookup={certHelp} /></>,
      width: 'w-36', align: 'right', sortValue: (r) => r.auto_score ?? -1,
      render: (r) => <Score score={r.auto_score} grade={r.auto_grade} />,
    },
    {
      key: 'rubric', header: <>Nilai Penilaian<InfoDot term="kriteria-kosong" lookup={certHelp} /></>,
      width: 'w-36', align: 'right', sortValue: (r) => r.rubric_score ?? -1,
      render: (r) => <Score score={r.rubric_score} grade={r.rubric_grade} />,
    },
    {
      key: 'no', header: 'Nomor', width: 'w-48',
      render: (r) => <span className="font-mono text-xs text-muted">{r.cert_no || '—'}</span>,
    },
    {
      key: 'status', header: 'Status', width: 'w-40', sortValue: (r) => r.status,
      render: (r) => {
        const Icon = STATUS_ICON[r.status]
        return (
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[r.status])}>
            <Icon className="h-3 w-3" />{STATUS_LABEL[r.status]}
          </span>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader
        icon={Award}
        title={<>Sertifikat Magang<InfoDot term="alur" lookup={certHelp} /></>}
        subtitle="Pembimbing membuat draf dan menilai; HR yang menerbitkan. Hanya sertifikat terbit yang punya nomor, QR dan halaman verifikasi."
        actions={canIssue && (
          <Button onClick={() => navigate('/certificates/new')}>
            <Plus className="h-4 w-4" /> Buat sertifikat
          </Button>
        )}
      >
        {canIssue && (
          <div className="mt-4 flex gap-1 rounded-xl bg-line/60 p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  tab === t.value ? 'bg-canvas text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {t.label}
                {t.value === 'action' && needsAction.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                    {needsAction.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      <MyScore />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <DataTable
          rows={shown}
          columns={columns}
          getKey={(r) => r.name}
          onRowClick={(r) => navigate(`/certificates/${r.name}`)}
          empty={
            <EmptyState
              icon={Award}
              title={rows.length ? 'Tidak ada yang perlu ditindak' : 'Belum ada sertifikat'}
              subtitle={
                canIssue
                  ? 'Buat sertifikat untuk peserta magang yang sudah menyelesaikan periodenya.'
                  : 'Sertifikat magang kamu akan muncul di sini setelah diterbitkan HR.'
              }
            />
          }
        />
      )}
    </Page>
  )
}
