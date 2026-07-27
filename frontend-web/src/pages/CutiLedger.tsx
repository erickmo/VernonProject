import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { useBoot } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { CutiStatement } from '@web/components/CutiStatement'

const YEAR = new Date().getFullYear()

// Thin accrual bar: lateness (deducts a day) or overtime (adds a day) progress
// toward its threshold. Reads boot.leave_rules — no extra request.
function AccrualBar({ label, accrued, threshold, tone }: { label: string; accrued: number; threshold: number; tone: 'rose' | 'emerald' }) {
  const pct = threshold > 0 ? Math.min(100, Math.round((accrued / threshold) * 100)) : 0
  const bar = tone === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'
  return (
    <div>
      <p className="text-sm text-ink">{label}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function CutiLedger() {
  const { data: boot } = useBoot()
  const lr = boot?.leave_rules
  const [year, setYear] = useState(YEAR)
  const q = useQuery({
    queryKey: ['cutiLedger', 'self', year],
    queryFn: () => mobileApi.getCutiLedger(undefined, year),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Riwayat Cuti</h1>
        <div className="flex gap-2">
          {[YEAR, YEAR - 1].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                year === y ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15' : 'border-line text-muted'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <BentoGrid>
        {lr && (lr.late_enabled || lr.overtime_enabled) && (
          <BentoTile span="full" tone="tint" accent="brand" title="Progres Aturan Cuti">
            <div className="mt-2 space-y-4">
              {lr.late_enabled && (
                <AccrualBar
                  label={`Keterlambatan: ${lr.late_accrued}/${lr.late_threshold} menit → potong 1 hari`}
                  accrued={lr.late_accrued}
                  threshold={lr.late_threshold}
                  tone="rose"
                />
              )}
              {lr.overtime_enabled && (
                <AccrualBar
                  label={`Lembur: ${lr.overtime_accrued}/${lr.overtime_threshold} menit → tambah 1 hari`}
                  accrued={lr.overtime_accrued}
                  threshold={lr.overtime_threshold}
                  tone="emerald"
                />
              )}
            </div>
          </BentoTile>
        )}
        <BentoTile span="full" tone="plain">
          <CutiStatement data={q.data} isLoading={q.isLoading} />
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
