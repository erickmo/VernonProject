import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Check, ImagePlus, Trash2, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings, useSuperpowerSettings, useSaveSuperpowerSettings } from '@/hooks/useData'
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
  // Team Wall min score lives in Superpower Settings (separate endpoint) — surfaced
  // here beside the recognition toggle since that's where admins look for it.
  const { data: spSettings } = useSuperpowerSettings()
  const saveSp = useSaveSuperpowerSettings()
  const [wallScoreMin, setWallScoreMin] = useState<number | ''>('')

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<number>(0)
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(0)
  const [minByWeekday, setMinByWeekday] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(false)
  const [showAutoApprove, setShowAutoApprove] = useState<boolean>(false)
  const [forceSuperpower, setForceSuperpower] = useState<boolean>(false)
  const [forceDailyRecognition, setForceDailyRecognition] = useState<boolean>(false)
  const [recognitionStart, setRecognitionStart] = useState<string>('')
  const [forceDiscReminder, setForceDiscReminder] = useState<boolean>(false)
  const [discReminderHours, setDiscReminderHours] = useState<number>(24)
  const [qrValiditySeconds, setQrValiditySeconds] = useState<number>(0)
  const [graceMinutes, setGraceMinutes] = useState<number>(0)
  const [lateRate, setLateRate] = useState<number>(0)
  const [earlyRate, setEarlyRate] = useState<number>(0)
  const [absencePenalty, setAbsencePenalty] = useState<number>(0)
  const [latePenaltyEnabled, setLatePenaltyEnabled] = useState<boolean>(false)
  const [countEarlyLeave, setCountEarlyLeave] = useState<boolean>(false)
  const [latenessThreshold, setLatenessThreshold] = useState<number>(0)
  const [overtimeBonusEnabled, setOvertimeBonusEnabled] = useState<boolean>(false)
  const [overtimeThreshold, setOvertimeThreshold] = useState<number>(0)
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
    setForceDailyRecognition(!!loaded.force_daily_recognition)
    setRecognitionStart(loaded.recognition_gate_start_time || '')
    setForceDiscReminder(!!loaded.force_disc_reminder)
    setDiscReminderHours(loaded.disc_reminder_hours || 24)
    setQrValiditySeconds(loaded.qr_validity_seconds)
    setGraceMinutes(loaded.attendance_grace_minutes)
    setLateRate(loaded.late_penalty_per_minute)
    setEarlyRate(loaded.early_leave_penalty_per_minute)
    setAbsencePenalty(loaded.absence_penalty)
    setLatePenaltyEnabled(!!loaded.late_penalty_enabled)
    setCountEarlyLeave(!!loaded.count_early_leave_in_penalty)
    setLatenessThreshold(loaded.lateness_deduction_threshold_minutes)
    setOvertimeBonusEnabled(!!loaded.overtime_bonus_enabled)
    setOvertimeThreshold(loaded.overtime_bonus_threshold_minutes)
    setBanners(loaded.home_banners ?? [])
  }, [loaded])

  useEffect(() => {
    if (spSettings) setWallScoreMin(spSettings.wall_score_min)
  }, [spSettings])

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
        force_daily_recognition: forceDailyRecognition ? 1 : 0,
        recognition_gate_start_time: recognitionStart,
        force_disc_reminder: forceDiscReminder ? 1 : 0,
        disc_reminder_hours: discReminderHours,
        qr_validity_seconds: qrValiditySeconds,
        attendance_grace_minutes: graceMinutes,
        late_penalty_per_minute: lateRate,
        early_leave_penalty_per_minute: earlyRate,
        absence_penalty: absencePenalty,
        late_penalty_enabled: latePenaltyEnabled ? 1 : 0,
        count_early_leave_in_penalty: countEarlyLeave ? 1 : 0,
        lateness_deduction_threshold_minutes: latenessThreshold,
        overtime_bonus_enabled: overtimeBonusEnabled ? 1 : 0,
        overtime_bonus_threshold_minutes: overtimeThreshold,
        home_banners: banners.filter((b) => b.image),
      },
      {
        onSuccess: () => toast('success', 'Settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
    // Persist the Team Wall threshold (Superpower Settings) alongside the same Save.
    if (spSettings) {
      saveSp.mutate({ ...spSettings, wall_score_min: wallScoreMin === '' ? 0 : Number(wallScoreMin) })
    }
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
          <p className="mb-1 text-sm font-bold text-stone-800 dark:text-slate-100">Aturan Cuti</p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Potong cuti saat menit keterlambatan menumpuk; tambah cuti saat lembur yang disetujui menumpuk.
          </p>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Potong cuti untuk keterlambatan / pulang cepat
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={latePenaltyEnabled}
              onChange={(e) => setLatePenaltyEnabled(e.target.checked)}
            />
          </label>

          {latePenaltyEnabled && (
            <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Ikut hitung menit pulang cepat
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={countEarlyLeave}
                onChange={(e) => setCountEarlyLeave(e.target.checked)}
              />
            </label>
          )}

          {latePenaltyEnabled && (
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Menit keterlambatan per 1 hari dipotong
              </label>
              {num(latenessThreshold, setLatenessThreshold, '480')}
            </div>
          )}

          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Tambah cuti untuk lembur disetujui
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={overtimeBonusEnabled}
              onChange={(e) => setOvertimeBonusEnabled(e.target.checked)}
            />
          </label>

          {overtimeBonusEnabled && (
            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Menit lembur per 1 hari ditambah
              </label>
              {num(overtimeThreshold, setOvertimeThreshold, '480')}
            </div>
          )}
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
          <p className="mb-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
            Setiap anggota Internal Team wajib memberi 1 vote superpower/hari untuk rekan yang belum
            dinilai, sampai semua rekan dinilai. Default nonaktif.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Wajib apresiasi harian</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={forceDailyRecognition}
              onChange={(e) => setForceDailyRecognition(e.target.checked)}
            />
          </label>
          {forceDailyRecognition && (
            <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Mulai muncul jam</span>
              <input
                type="time"
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={recognitionStart}
                onChange={(e) => setRecognitionStart(e.target.value)}
              />
            </label>
          )}
          {forceDailyRecognition && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Gerbang apresiasi baru muncul mulai jam ini (waktu server). Kosongkan agar muncul kapan saja.
            </p>
          )}
          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Ambang skor Team Wall (1–4)
            </span>
            <input
              type="number"
              step="0.1"
              min={1}
              max={4}
              className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              value={wallScoreMin}
              onChange={(e) => setWallScoreMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Skor rata-rata rekan harus melebihi angka ini agar tampil di Team Wall (dan memberi skor pada
            superpower yang dipilih sendiri). Default 3,25.
          </p>

          <p className="mb-3 mt-4 text-xs text-slate-500 dark:text-slate-400">
            Ingatkan setiap anggota Internal Team &amp; Intern untuk mengisi tes DISC &amp; kepribadian.
            Popup pengingat muncul kembali tiap N jam sampai kedua tes selesai. Default nonaktif.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pengingat Tes DISC &amp; Kepribadian</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={forceDiscReminder}
              onChange={(e) => setForceDiscReminder(e.target.checked)}
            />
          </label>
          {forceDiscReminder && (
            <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Interval pengingat (jam)</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={String(discReminderHours)}
                // Clamp on blur/commit, not per keystroke — typing "1" before "12" mustn't snap to 1.
                onChange={(e) => setDiscReminderHours(e.target.value === '' ? 0 : Number(e.target.value))}
                onBlur={() => setDiscReminderHours((h) => (h < 1 ? 1 : Math.floor(h)))}
              />
            </label>
          )}
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
