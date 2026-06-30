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
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(0)
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(false)
  const [qrValiditySeconds, setQrValiditySeconds] = useState<number>(0)
  const [graceMinutes, setGraceMinutes] = useState<number>(0)
  const [lateRate, setLateRate] = useState<number>(0)
  const [earlyRate, setEarlyRate] = useState<number>(0)
  const [absencePenalty, setAbsencePenalty] = useState<number>(0)

  useEffect(() => {
    if (!loaded) return
    setMaxEstimatedMinutes(loaded.max_estimated_minutes)
    setToleranceMinutes(loaded.under_occupied_tolerance_minutes)
    setAttendanceEnabled(!!loaded.attendance_enabled)
    setQrValiditySeconds(loaded.qr_validity_seconds)
    setGraceMinutes(loaded.attendance_grace_minutes)
    setLateRate(loaded.late_penalty_per_minute)
    setEarlyRate(loaded.early_leave_penalty_per_minute)
    setAbsencePenalty(loaded.absence_penalty)
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
    save.mutate(
      {
        max_estimated_minutes: maxEstimatedMinutes,
        under_occupied_tolerance_minutes: toleranceMinutes,
        attendance_enabled: attendanceEnabled ? 1 : 0,
        qr_validity_seconds: qrValiditySeconds,
        attendance_grace_minutes: graceMinutes,
        late_penalty_per_minute: lateRate,
        early_leave_penalty_per_minute: earlyRate,
        absence_penalty: absencePenalty,
      },
      {
        onSuccess: () => toast('success', 'Settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const num = (value: number, set: (n: number) => void, placeholder = '0') => (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      className={field}
      value={String(value)}
      onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
      placeholder={placeholder}
    />
  )

  return (
    <DetailScreen title="Settings">
      <div className="flex flex-col gap-4">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          <Settings className="h-6 w-6" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Max estimated minutes
          </label>
          {num(maxEstimatedMinutes, setMaxEstimatedMinutes)}
          <p className="text-xs text-slate-500 dark:text-slate-400">0 = no limit</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Under-occupied tolerance (min)
          </label>
          {num(toleranceMinutes, setToleranceMinutes, '60')}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Flag a day under (min daily − this) in the Under-Occupied report.
          </p>
        </div>

        <div className="mt-2 border-t border-paper-edge pt-4 dark:border-slate-700">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Attendance</p>

          <label className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-paper-card px-3 py-2.5 shadow-card dark:bg-slate-800">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enable attendance</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={attendanceEnabled}
              onChange={(e) => setAttendanceEnabled(e.target.checked)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">QR validity (sec)</label>
              {num(qrValiditySeconds, setQrValiditySeconds, '30')}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Grace (min)</label>
              {num(graceMinutes, setGraceMinutes, '5')}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Late penalty / min</label>
              {num(lateRate, setLateRate)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Early-leave / min</label>
              {num(earlyRate, setEarlyRate)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Absence penalty</label>
              {num(absencePenalty, setAbsencePenalty)}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Points deducted per minute late / early-leave; flat for absence. 0 = no penalty.
          </p>
        </div>

        <button
          onClick={doSave}
          disabled={save.isPending}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Save
        </button>
      </div>
    </DetailScreen>
  )
}
