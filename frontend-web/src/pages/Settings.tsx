import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Check } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function Settings() {
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useAppSettings()
  const save = useSaveAppSettings()

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<string>('0')

  useEffect(() => {
    if (loaded) setMaxEstimatedMinutes(String(loaded.max_estimated_minutes))
  }, [loaded])

  const isManager = boot ? canManageGroups(boot) : null

  if (isManager === false) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-slate-500" />
          Settings
        </h1>
        <EmptyState
          icon={SettingsIcon}
          title="Access denied"
          subtitle="You don't have permission to manage app settings."
        />
      </div>
    )
  }

  if (isLoading && !loaded) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const doSave = () => {
    const value = maxEstimatedMinutes === '' ? 0 : Number(maxEstimatedMinutes)
    save.mutate(value, {
      onSuccess: () => toast('success', 'Settings saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        doSave()
      }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-slate-500" />
        Settings
      </h1>

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate" title="Max Estimated Minutes">
          <div className="mt-3 space-y-4">
            <Field label="Max estimated minutes (0 = no limit)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={maxEstimatedMinutes}
                  onChange={(e) => setMaxEstimatedMinutes(e.target.value)}
                  placeholder="0"
                />
              )}
            </Field>

            <button
              type="submit"
              disabled={save.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Save settings
            </button>
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="plain" title="About this setting">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mt-1">
            <b>Max estimated minutes</b> caps the value a user can enter when estimating a
            Todo's duration. Set to <b>0</b> to allow any value (no limit).
          </p>
        </BentoTile>
      </BentoGrid>
    </form>
  )
}
