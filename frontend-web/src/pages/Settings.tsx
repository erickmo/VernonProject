import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Check } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function Settings() {
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useAppSettings()
  const save = useSaveAppSettings()

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<string>('0')
  const [toleranceMinutes, setToleranceMinutes] = useState<string>('0')
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(false)
  const [qrValiditySeconds, setQrValiditySeconds] = useState<string>('0')
  const [graceMinutes, setGraceMinutes] = useState<string>('0')
  const [lateRate, setLateRate] = useState<string>('0')
  const [earlyRate, setEarlyRate] = useState<string>('0')
  const [absencePenalty, setAbsencePenalty] = useState<string>('0')

  useEffect(() => {
    if (!loaded) return
    setMaxEstimatedMinutes(String(loaded.max_estimated_minutes))
    setToleranceMinutes(String(loaded.under_occupied_tolerance_minutes))
    setAttendanceEnabled(!!loaded.attendance_enabled)
    setQrValiditySeconds(String(loaded.qr_validity_seconds))
    setGraceMinutes(String(loaded.attendance_grace_minutes))
    setLateRate(String(loaded.late_penalty_per_minute))
    setEarlyRate(String(loaded.early_leave_penalty_per_minute))
    setAbsencePenalty(String(loaded.absence_penalty))
  }, [loaded])

  const isManager = boot ? canManageGroups(boot) : null

  if (isManager === false) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-muted" />
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

  const n = (s: string) => (s === '' ? 0 : Number(s))
  const doSave = () => {
    save.mutate(
      {
        max_estimated_minutes: n(maxEstimatedMinutes),
        under_occupied_tolerance_minutes: n(toleranceMinutes),
        attendance_enabled: attendanceEnabled ? 1 : 0,
        qr_validity_seconds: n(qrValiditySeconds),
        attendance_grace_minutes: n(graceMinutes),
        late_penalty_per_minute: n(lateRate),
        early_leave_penalty_per_minute: n(earlyRate),
        absence_penalty: n(absencePenalty),
      },
      {
        onSuccess: () => toast('success', 'Settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        doSave()
      }}
      className="space-y-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-muted" />
        Settings
      </h1>

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate" title="Estimate Limits">
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
            <Field label="Under-occupied tolerance (min)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={toleranceMinutes}
                  onChange={(e) => setToleranceMinutes(e.target.value)}
                  placeholder="60"
                />
              )}
            </Field>
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="brand" title="Attendance">
          <div className="mt-3 space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enable attendance</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={attendanceEnabled}
                onChange={(e) => setAttendanceEnabled(e.target.checked)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label="QR validity (sec)">
                {(id) => (
                  <input id={id} type="number" min={0} className={field} value={qrValiditySeconds} onChange={(e) => setQrValiditySeconds(e.target.value)} placeholder="30" />
                )}
              </Field>
              <Field label="Grace (min)">
                {(id) => (
                  <input id={id} type="number" min={0} className={field} value={graceMinutes} onChange={(e) => setGraceMinutes(e.target.value)} placeholder="5" />
                )}
              </Field>
              <Field label="Late penalty / min">
                {(id) => (
                  <input id={id} type="number" min={0} step="any" className={field} value={lateRate} onChange={(e) => setLateRate(e.target.value)} placeholder="0" />
                )}
              </Field>
              <Field label="Early-leave / min">
                {(id) => (
                  <input id={id} type="number" min={0} step="any" className={field} value={earlyRate} onChange={(e) => setEarlyRate(e.target.value)} placeholder="0" />
                )}
              </Field>
              <Field label="Absence penalty">
                {(id) => (
                  <input id={id} type="number" min={0} step="any" className={field} value={absencePenalty} onChange={(e) => setAbsencePenalty(e.target.value)} placeholder="0" />
                )}
              </Field>
            </div>
            <p className="text-xs text-muted">
              Points deducted per minute late / early-leave; flat for absence. 0 = no penalty.
            </p>
          </div>
        </BentoTile>
      </BentoGrid>

      <button
        type="submit"
        disabled={save.isPending}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors sm:w-auto sm:px-8"
      >
        {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        Save settings
      </button>
    </form>
  )
}
