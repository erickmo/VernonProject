import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { CutiStatement } from '@web/components/CutiStatement'

const YEAR = new Date().getFullYear()

export default function CutiLedger() {
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
        <BentoTile span="full" tone="plain">
          <CutiStatement data={q.data} isLoading={q.isLoading} />
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
