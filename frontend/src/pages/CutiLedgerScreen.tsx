import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { mobileApi } from '@/lib/api'
import type { CutiLedgerResponse, CutiLedgerRow, CutiLedgerEntryType } from '@/lib/types'

const ENTRY_LABEL: Record<CutiLedgerEntryType, string> = {
  Grant: 'Kuota tahunan',
  Cuti: 'Cuti',
  'Cuti Bersama': 'Cuti bersama',
  'Carry-over': 'Saldo pindahan',
  Bonus: 'Bonus cuti',
  Correction: 'Koreksi',
}

/** Year picker — this year + last year. */
export function YearSwitch({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const now = new Date().getFullYear()
  return (
    <div className="mb-4">
      <Segmented
        options={[{ value: String(now), label: String(now) }, { value: String(now - 1), label: String(now - 1) }]}
        value={String(year)}
        onChange={(v) => onChange(Number(v))}
      />
    </div>
  )
}

function CutiRow({ row }: { row: CutiLedgerRow }) {
  const pos = row.days >= 0
  const span = row.from_date
    ? row.to_date && row.to_date !== row.from_date
      ? `${row.from_date} – ${row.to_date}`
      : row.from_date
    : null
  const sub = span || row.reason || null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{ENTRY_LABEL[row.entry_type]}</p>
        {sub && <p className="truncate text-xs text-stone-400">{sub}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-bold ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
          {pos ? '+' : ''}{row.days} hari
        </p>
        <p className="text-[11px] text-stone-400">saldo {row.balance}</p>
      </div>
    </div>
  )
}

/** Summary card + newest-first row list. Shared by the personal and HR-admin screens. */
export function CutiStatement({ data }: { data: CutiLedgerResponse }) {
  const { summary, rows } = data
  const ordered = [...rows].reverse() // API returns oldest-first; read newest-first
  return (
    <>
      <div className="mb-4 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-stone-800 dark:text-slate-100">Sisa {summary.remaining}</span>
          <span className="text-sm text-stone-400">/ {summary.quota} hari</span>
        </div>
        <p className="mt-0.5 text-xs text-stone-400">
          {summary.used} hari terpakai
          {summary.prior ? ` · ${summary.prior} saldo pindahan` : ''}
        </p>
      </div>

      {ordered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Belum ada catatan cuti" subtitle="Riwayat cuti Anda akan muncul di sini." />
      ) : (
        <div className="flex flex-col gap-2">
          {ordered.map((r) => (
            <CutiRow key={r.name} row={r} />
          ))}
        </div>
      )}
    </>
  )
}

export default function CutiLedgerScreen() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data, isLoading } = useQuery({
    queryKey: ['cutiLedger', 'self', year],
    queryFn: () => mobileApi.getCutiLedger(undefined, year),
  })

  return (
    <DetailScreen title="Riwayat Cuti">
      <YearSwitch year={year} onChange={setYear} />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data ? (
        <CutiStatement data={data} />
      ) : null}
    </DetailScreen>
  )
}
