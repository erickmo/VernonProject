import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useAppSettings()
  const save = useSaveAppSettings()

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<number>(0)

  useEffect(() => {
    if (loaded) setMaxEstimatedMinutes(loaded.max_estimated_minutes)
  }, [loaded])

  // Access gate: redirect non-managers.
  const blocked = !boot ? false : !canManageGroups(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isLoading && !loaded) {
    return (
      <DetailScreen title="Settings">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const doSave = () => {
    save.mutate(maxEstimatedMinutes, {
      onSuccess: () => toast('success', 'Settings saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Settings">
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          <Settings className="h-6 w-6" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Max estimated minutes
          </label>
          <input
            type="number"
            inputMode="numeric"
            className={field}
            value={String(maxEstimatedMinutes)}
            onChange={(e) =>
              setMaxEstimatedMinutes(e.target.value === '' ? 0 : Number(e.target.value))
            }
            placeholder="0"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">0 = no limit</p>
        </div>

        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Save
        </button>
      </div>
    </DetailScreen>
  )
}
