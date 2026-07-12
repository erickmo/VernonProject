import { Sparkles } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useAppReleases } from '@/hooks/useData'

function fmtDate(s: string): string {
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WhatsNew() {
  const { data, isLoading } = useAppReleases('Mobile')

  return (
    <DetailScreen title="What's New">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading releases…" />
      ) : !data?.length ? (
        <EmptyState icon={Sparkles} title="No release notes yet" />
      ) : (
        <div className="flex flex-col gap-4">
          {data.map((r) => (
            <div
              key={r.version}
              className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-stone-800 dark:text-slate-50">{r.version}</span>
                <span className="text-xs text-stone-400 dark:text-slate-500">{fmtDate(r.release_date)}</span>
              </div>
              {r.title && (
                <p className="mt-1 text-sm font-medium text-stone-700 dark:text-slate-200">{r.title}</p>
              )}
              {r.notes && (
                <ul className="mt-2 list-disc pl-5 text-sm text-stone-500 dark:text-slate-400">
                  {r.notes.split('\n').filter(Boolean).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
