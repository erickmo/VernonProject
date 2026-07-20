import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Check, ImagePlus, Trash2, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings } from '@/hooks/useData'
import { uploadBannerImage } from '@/lib/api'
import type { HomeBanner } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

// Per-weekday minimum-minutes fields, Mon..Sun (matches Vernon Settings + AppSettings).
const WEEKDAY_MIN_KEYS = [
  'min_minutes_monday', 'min_minutes_tuesday', 'min_minutes_wednesday', 'min_minutes_thursday',
  'min_minutes_friday', 'min_minutes_saturday', 'min_minutes_sunday',
] as const
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SettingsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useAppSettings()
  const save = useSaveAppSettings()

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<number>(0)
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(0)
  const [minByWeekday, setMinByWeekday] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(false)
  const [showAutoApprove, setShowAutoApprove] = useState<boolean>(false)
  const [forceSuperpower, setForceSuperpower] = useState<boolean>(false)
  const [qrValiditySeconds, setQrValiditySeconds] = useState<number>(0)
  const [graceMinutes, setGraceMinutes] = useState<number>(0)
  const [lateRate, setLateRate] = useState<number>(0)
  const [earlyRate, setEarlyRate] = useState<number>(0)
  const [absencePenalty, setAbsencePenalty] = useState<number>(0)
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const pickForIdx = useRef<number | null>(null)

  useEffect(() => {
    if (!loaded) return
    setMaxEstimatedMinutes(loaded.max_estimated_minutes)
    setToleranceMinutes(loaded.under_occupied_tolerance_minutes)
    setMinByWeekday(WEEKDAY_MIN_KEYS.map((k) => loaded[k]))
    setAttendanceEnabled(!!loaded.attendance_enabled)
    setShowAutoApprove(!!loaded.show_auto_approve)
    setForceSuperpower(!!loaded.force_superpower_onboarding)
    setQrValiditySeconds(loaded.qr_validity_seconds)
    setGraceMinutes(loaded.attendance_grace_minutes)
    setLateRate(loaded.late_penalty_per_minute)
    setEarlyRate(loaded.early_leave_penalty_per_minute)
    setAbsencePenalty(loaded.absence_penalty)
    setBanners(loaded.home_banners ?? [])
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
        min_minutes_monday: minByWeekday[0],
        min_minutes_tuesday: minByWeekday[1],
        min_minutes_wednesday: minByWeekday[2],
        min_minutes_thursday: minByWeekday[3],
        min_minutes_friday: minByWeekday[4],
        min_minutes_saturday: minByWeekday[5],
        min_minutes_sunday: minByWeekday[6],
        attendance_enabled: attendanceEnabled ? 1 : 0,
        show_auto_approve: showAutoApprove ? 1 : 0,
        force_superpower_onboarding: forceSuperpower ? 1 : 0,
        qr_validity_seconds: qrValiditySeconds,
        attendance_grace_minutes: graceMinutes,
        late_penalty_per_minute: lateRate,
        early_leave_penalty_per_minute: earlyRate,
        absence_penalty: absencePenalty,
        home_banners: banners.filter((b) => b.image),
      },
      {
        onSuccess: () => toast('success', 'Settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  // Banner helpers — image upload targets the row stored in pickForIdx.
  const onPickBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    const i = pickForIdx.current
    if (f && i != null) {
      setUploadingIdx(i)
      try {
        const url = await uploadBannerImage(f)
        setBanners((bs) => bs.map((b, k) => (k === i ? { ...b, image: url } : b)))
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadingIdx(null)
      }
    }
    pickForIdx.current = null
    if (bannerFileRef.current) bannerFileRef.current.value = ''
  }
  const addBanner = () => setBanners((bs) => [...bs, { image: '', link: '', is_active: 1 }])
  const removeBanner = (i: number) => setBanners((bs) => bs.filter((_, k) => k !== i))
  const patchBanner = (i: number, patch: Partial<HomeBanner>) =>
    setBanners((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)))

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

        <div className={card + ' flex flex-col gap-2'}>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Max estimated minutes
          </label>
          {num(maxEstimatedMinutes, setMaxEstimatedMinutes)}
          <p className="text-xs text-slate-500 dark:text-slate-400">0 = no limit</p>
        </div>

        <div className={card + ' flex flex-col gap-2'}>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Under-occupied tolerance (min)
          </label>
          {num(toleranceMinutes, setToleranceMinutes, '60')}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Flag a day under (min daily − this) in the Under-Occupied report.
          </p>
        </div>

        <div className={card + ' flex flex-col gap-2'}>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Minimum minutes per weekday
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daily floor everyone should plan, by weekday. Drives auto-plan, the daily-minimum
            banner, and the assignment-overload warning. A user's shift template overrides this;
            holidays and days off count as 0. 0 = use Min Daily Estimated Minutes.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WEEKDAY_LABELS.map((lbl, i) => (
              <label key={lbl} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{lbl}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={String(minByWeekday[i])}
                  onChange={(e) =>
                    setMinByWeekday((m) =>
                      m.map((v, k) => (k === i ? (e.target.value === '' ? 0 : Number(e.target.value)) : v)),
                    )
                  }
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>

        <div className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Attendance</p>

          <label className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
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

        <div className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Auto-Approve</p>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Kontrol Auto-Setujui</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={showAutoApprove}
              onChange={(e) => setShowAutoApprove(e.target.checked)}
            />
          </label>
        </div>

        <div className={card}>
          <p className="mb-1 text-sm font-bold text-stone-800 dark:text-slate-100">Gamification</p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Wajibkan setiap orang memilih superpower dulu. Saat aktif, pengguna yang belum punya
            superpower akan melihat layar wajib-pilih saat membuka aplikasi.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Wajib pilih Superpower</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={forceSuperpower}
              onChange={(e) => setForceSuperpower(e.target.checked)}
            />
          </label>
        </div>

        <div className={card}>
          <p className="mb-1 text-sm font-bold text-stone-800 dark:text-slate-100">Home banners</p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Full-width promo banners at the top of the mobile home. Landscape images (~16:7) look best. Link is
            optional — an in-app route (<code>/events</code>) or a full URL.
          </p>

          <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={onPickBanner} />

          <div className="flex flex-col gap-3">
            {banners.map((b, i) => (
              <div key={i} className="rounded-xl border border-paper-edge bg-paper-card p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      pickForIdx.current = i
                      bannerFileRef.current?.click()
                    }}
                    className="relative flex aspect-[16/7] w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-700"
                  >
                    {uploadingIdx === i ? (
                      <Spinner className="h-5 w-5" />
                    ) : b.image ? (
                      <img src={b.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-6 w-6" />
                    )}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      className={field}
                      value={b.link}
                      onChange={(e) => patchBanner(i, { link: e.target.value })}
                      placeholder="Link (optional) — /events or https://…"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={!!b.is_active}
                          onChange={(e) => patchBanner(i, { is_active: e.target.checked ? 1 : 0 })}
                        />
                        Active
                      </label>
                      <button
                        type="button"
                        onClick={() => removeBanner(i)}
                        className="flex items-center gap-1 text-xs font-semibold text-rose-500 active:scale-95"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addBanner}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 active:scale-95 dark:border-slate-600 dark:text-slate-400"
          >
            <Plus className="h-4 w-4" /> Add banner
          </button>
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
