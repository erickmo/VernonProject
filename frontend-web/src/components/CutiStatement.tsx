import { CalendarOff } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { DataTable, type Column } from '@web/components/DataTable'
import type { CutiLedgerResponse, CutiLedgerRow, CutiLedgerEntryType } from '@/lib/types'

// Bahasa labels for each ledger entry_type (shared by personal + HR views).
export const CUTI_ENTRY_LABEL: Record<CutiLedgerEntryType, string> = {
  Grant: 'Kuota tahunan',
  Cuti: 'Cuti',
  'Cuti Bersama': 'Cuti bersama',
  'Carry-over': 'Saldo pindahan',
  Bonus: 'Bonus cuti',
  Correction: 'Koreksi',
}

const columns: Column<CutiLedgerRow>[] = [
  {
    key: 'entry',
    header: 'Jenis',
    render: (r) => (
      <span className="font-medium text-ink">
        {CUTI_ENTRY_LABEL[r.entry_type]}
        {r.leave_type && r.entry_type === 'Cuti' && (
          <span className="ml-1.5 text-xs font-normal text-muted">{r.leave_type}</span>
        )}
      </span>
    ),
  },
  {
    key: 'detail',
    header: 'Tanggal / Alasan',
    render: (r) => (
      <span className="text-muted">
        {r.from_date ? `${r.from_date}${r.to_date && r.to_date !== r.from_date ? ` → ${r.to_date}` : ''}` : ''}
        {r.reason ? `${r.from_date ? ' · ' : ''}${r.reason}` : ''}
        {!r.from_date && !r.reason ? '—' : ''}
      </span>
    ),
  },
  {
    key: 'days',
    header: 'Hari',
    align: 'right',
    render: (r) => (
      <span className={`font-semibold tabular-nums ${r.days >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {r.days > 0 ? '+' : ''}{r.days}
      </span>
    ),
  },
  {
    key: 'balance',
    header: 'Saldo',
    align: 'right',
    render: (r) => <span className="tabular-nums text-ink">{r.balance}</span>,
  },
]

export function CutiStatement({ data, isLoading }: { data?: CutiLedgerResponse; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!data) return null
  const { summary, rows } = data
  // rows arrive oldest-first (running balance); newest-first reads better.
  const display = [...rows].reverse()

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-canvas px-4 py-3.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-ink">{summary.remaining}</span>
          <span className="text-sm text-muted">/ {summary.quota} hari sisa</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {summary.used} terpakai
          {summary.cuti_bersama ? ` · ${summary.cuti_bersama} cuti bersama` : ''}
          {typeof summary.prior === 'number' && summary.prior > 0 ? ` · ${summary.prior} sebelum sistem` : ''}
        </p>
      </div>
      <DataTable
        rows={display}
        columns={columns}
        getKey={(r) => r.name}
        empty={<EmptyState icon={CalendarOff} title="Belum ada catatan cuti" subtitle="Kuota & pemakaian cuti akan tampil di sini." />}
      />
    </div>
  )
}
