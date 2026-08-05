import { useEffect, useRef, useState } from 'react'
import { Settings as SettingsIcon, Check, ImagePlus, Trash2, Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings, useSuperpowerSettings, useSaveSuperpowerSettings } from '@/hooks/useData'
import { uploadBannerImage } from '@/lib/api'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import type { HomeBanner } from '@/lib/types'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

// Per-weekday minimum-minutes fields, Mon..Sun (matches Vernon Settings + AppSettings).
const WEEKDAY_MIN_KEYS = [
  'min_minutes_monday', 'min_minutes_tuesday', 'min_minutes_wednesday', 'min_minutes_thursday',
  'min_minutes_friday', 'min_minutes_saturday', 'min_minutes_sunday',
] as const
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Settings() {
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useAppSettings()
  const save = useSaveAppSettings()
  // Team Wall min score lives in Superpower Settings (separate endpoint) — surfaced
  // here beside the recognition toggle since that's where admins look for it.
  const { data: spSettings } = useSuperpowerSettings()
  const saveSp = useSaveSuperpowerSettings()
  const [wallScoreMin, setWallScoreMin] = useState('')

  const [maxEstimatedMinutes, setMaxEstimatedMinutes] = useState<string>('0')
  const [toleranceMinutes, setToleranceMinutes] = useState<string>('0')
  const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(false)
  const [forceSuperpower, setForceSuperpower] = useState<boolean>(false)
  const [forceDailyRecognition, setForceDailyRecognition] = useState<boolean>(false)
  const [recognitionStart, setRecognitionStart] = useState<string>('')
  const [forceDiscReminder, setForceDiscReminder] = useState<boolean>(false)
  const [discReminderHours, setDiscReminderHours] = useState<string>('24')
  const [forcePhotoUpload, setForcePhotoUpload] = useState<boolean>(false)
  const [prankEnabled, setPrankEnabled] = useState<boolean>(false)
  const [prankTargets, setPrankTargets] = useState<string[]>([])
  const [prankStartHour, setPrankStartHour] = useState<string>('9')
  const [prankEndHour, setPrankEndHour] = useState<string>('17')
  const [prankInterval, setPrankInterval] = useState<string>('60')
  const [sweepStalePlans, setSweepStalePlans] = useState<boolean>(false)
  const [sweepAfterDays, setSweepAfterDays] = useState<string>('1')
  const [qrValiditySeconds, setQrValiditySeconds] = useState<string>('0')
  const [graceMinutes, setGraceMinutes] = useState<string>('0')
  const [onlineWindow, setOnlineWindow] = useState<string>('15')
  const [lateRate, setLateRate] = useState<string>('0')
  const [earlyRate, setEarlyRate] = useState<string>('0')
  const [absencePenalty, setAbsencePenalty] = useState<string>('0')
  const [lateRuleEnabled, setLateRuleEnabled] = useState<boolean>(false)
  const [countEarlyLeave, setCountEarlyLeave] = useState<boolean>(false)
  const [lateThreshold, setLateThreshold] = useState<string>('0')
  const [overtimeRuleEnabled, setOvertimeRuleEnabled] = useState<boolean>(false)
  const [overtimeThreshold, setOvertimeThreshold] = useState<string>('0')
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const pickForIdx = useRef<number | null>(null)
  const [appLogo, setAppLogo] = useState<string>('')
  const [nametagValue, setNametagValue] = useState<string>('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) return
    setMaxEstimatedMinutes(String(loaded.max_estimated_minutes))
    setToleranceMinutes(String(loaded.under_occupied_tolerance_minutes))
    setMinByWeekday(WEEKDAY_MIN_KEYS.map((k) => String(loaded[k])))
    setAttendanceEnabled(!!loaded.attendance_enabled)
    setForceSuperpower(!!loaded.force_superpower_onboarding)
    setForceDailyRecognition(!!loaded.force_daily_recognition)
    setRecognitionStart(loaded.recognition_gate_start_time || '')
    setForceDiscReminder(!!loaded.force_disc_reminder)
    setDiscReminderHours(String(loaded.disc_reminder_hours))
    setForcePhotoUpload(!!loaded.force_photo_upload)
    setPrankEnabled(!!loaded.prank_photo_enabled)
    setPrankTargets(loaded.prank_target_users ?? [])
    setPrankStartHour(String(loaded.prank_start_hour ?? 9))
    setPrankEndHour(String(loaded.prank_end_hour ?? 17))
    setPrankInterval(String(loaded.prank_interval_minutes ?? 60))
    setSweepStalePlans(!!loaded.sweep_stale_plans)
    setSweepAfterDays(String(loaded.sweep_stale_plan_after_days))
    setQrValiditySeconds(String(loaded.qr_validity_seconds))
    setGraceMinutes(String(loaded.attendance_grace_minutes))
    setOnlineWindow(String(loaded.online_window_minutes ?? 15))
    setLateRate(String(loaded.late_penalty_per_minute))
    setEarlyRate(String(loaded.early_leave_penalty_per_minute))
    setAbsencePenalty(String(loaded.absence_penalty))
    setLateRuleEnabled(!!loaded.late_penalty_enabled)
    setCountEarlyLeave(!!loaded.count_early_leave_in_penalty)
    setLateThreshold(String(loaded.lateness_deduction_threshold_minutes))
    setOvertimeRuleEnabled(!!loaded.overtime_bonus_enabled)
    setOvertimeThreshold(String(loaded.overtime_bonus_threshold_minutes))
    setBanners(loaded.home_banners ?? [])
    setAppLogo(loaded.app_logo ?? '')
    setNametagValue(loaded.nametag_value ?? '')
  }, [loaded])

  useEffect(() => {
    if (spSettings) setWallScoreMin(String(spSettings.wall_score_min))
  }, [spSettings])

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
        app_logo: appLogo,
        nametag_value: nametagValue,
        max_estimated_minutes: n(maxEstimatedMinutes),
        under_occupied_tolerance_minutes: n(toleranceMinutes),
        min_minutes_monday: n(minByWeekday[0]),
        min_minutes_tuesday: n(minByWeekday[1]),
        min_minutes_wednesday: n(minByWeekday[2]),
        min_minutes_thursday: n(minByWeekday[3]),
        min_minutes_friday: n(minByWeekday[4]),
        min_minutes_saturday: n(minByWeekday[5]),
        min_minutes_sunday: n(minByWeekday[6]),
        attendance_enabled: attendanceEnabled ? 1 : 0,
        force_superpower_onboarding: forceSuperpower ? 1 : 0,
        force_daily_recognition: forceDailyRecognition ? 1 : 0,
        recognition_gate_start_time: recognitionStart,
        force_disc_reminder: forceDiscReminder ? 1 : 0,
        disc_reminder_hours: Math.max(1, n(discReminderHours)),
        force_photo_upload: forcePhotoUpload ? 1 : 0,
        prank_photo_enabled: prankEnabled ? 1 : 0,
        prank_target_users: prankTargets,
        prank_start_hour: Math.max(0, Math.min(23, n(prankStartHour))),
        prank_end_hour: Math.max(0, Math.min(23, n(prankEndHour))),
        prank_interval_minutes: Math.max(1, n(prankInterval)),
        sweep_stale_plans: sweepStalePlans ? 1 : 0,
        sweep_stale_plan_after_days: Math.max(0, n(sweepAfterDays)),
        qr_validity_seconds: n(qrValiditySeconds),
        attendance_grace_minutes: n(graceMinutes),
        online_window_minutes: n(onlineWindow),
        late_penalty_per_minute: n(lateRate),
        early_leave_penalty_per_minute: n(earlyRate),
        absence_penalty: n(absencePenalty),
        late_penalty_enabled: lateRuleEnabled ? 1 : 0,
        count_early_leave_in_penalty: countEarlyLeave ? 1 : 0,
        lateness_deduction_threshold_minutes: n(lateThreshold),
        overtime_bonus_enabled: overtimeRuleEnabled ? 1 : 0,
        overtime_bonus_threshold_minutes: n(overtimeThreshold),
        home_banners: banners.filter((b) => b.image),
      },
      {
        onSuccess: () => toast('success', 'Settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
    // Persist the Team Wall threshold (Superpower Settings) alongside the same Save.
    if (spSettings) saveSp.mutate({ ...spSettings, wall_score_min: n(wallScoreMin) })
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
  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setUploadingLogo(true)
      try {
        setAppLogo(await uploadBannerImage(f))
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadingLogo(false)
      }
    }
    if (logoFileRef.current) logoFileRef.current.value = ''
  }

  const addBanner = () => setBanners((bs) => [...bs, { image: '', link: '', is_active: 1 }])
  const removeBanner = (i: number) => setBanners((bs) => bs.filter((_, k) => k !== i))
  const patchBanner = (i: number, patch: Partial<HomeBanner>) =>
    setBanners((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)))

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
        <BentoTile span="full" tone="tint" accent="brand" title="Branding">
          <p className="mt-1 text-xs text-muted">
            Logo shown in the web top navbar (replaces the “Vernon” wordmark). Wide/landscape PNG with a transparent
            background looks best; it’s scaled to ~32px tall.
          </p>
          <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickLogo} />
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-16 w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas px-3">
              {uploadingLogo ? (
                <Spinner className="h-5 w-5" />
              ) : appLogo ? (
                <img src={appLogo} alt="App logo" className="max-h-10 max-w-full object-contain" />
              ) : (
                <span className="font-display text-lg font-bold text-ink">Vernon</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => logoFileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-hover/[0.04]"
              >
                <ImagePlus className="h-4 w-4" /> {appLogo ? 'Replace logo' : 'Upload logo'}
              </button>
              {appLogo && (
                <button
                  type="button"
                  onClick={() => setAppLogo('')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove (use wordmark)
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="text-muted">Nametag value / motto</span>
              <input
                type="text"
                value={nametagValue}
                onChange={(e) => setNametagValue(e.target.value)}
                maxLength={48}
                placeholder="e.g. Grow Together"
                className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              Printed on the footer of every lanyard nametag (/m &amp; /w). Blank = decorative bar only.
            </p>
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="amber" title="Estimate Limits">
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
            <Field label="Online window (min)" hint="People active within this many minutes show as “Online”. Keep ≥ 10 — activity is recorded at most every ~10 minutes.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={10}
                  className={field}
                  value={onlineWindow}
                  onChange={(e) => setOnlineWindow(e.target.value)}
                  placeholder="15"
                />
              )}
            </Field>
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="amber" title="Minimum Minutes / Weekday">
          <p className="mt-1 text-xs text-muted">
            Daily floor everyone should plan, by weekday. Drives auto-plan, the daily-minimum
            banner, and the assignment-overload warning. A user's shift template overrides this;
            holidays and days off count as 0. 0 = use Min Daily Estimated Minutes.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {WEEKDAY_LABELS.map((lbl, i) => (
              <Field key={lbl} label={lbl}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className={field}
                    value={minByWeekday[i]}
                    onChange={(e) => setMinByWeekday((m) => m.map((v, k) => (k === i ? e.target.value : v)))}
                    placeholder="0"
                  />
                )}
              </Field>
            ))}
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="brand" title="Attendance">
          <div className="mt-3 space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Enable attendance</span>
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

        <BentoTile span="md" tone="tint" accent="brand" title="Aturan Cuti">
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Potong cuti untuk keterlambatan / pulang cepat</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={lateRuleEnabled}
                onChange={(e) => setLateRuleEnabled(e.target.checked)}
              />
            </label>
            {lateRuleEnabled && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
                  <span className="text-sm font-semibold text-ink dark:text-slate-200">Ikut hitung menit pulang cepat</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-600"
                    checked={countEarlyLeave}
                    onChange={(e) => setCountEarlyLeave(e.target.checked)}
                  />
                </label>
                <Field label="Menit keterlambatan per 1 hari dipotong">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={field}
                      value={lateThreshold}
                      onChange={(e) => setLateThreshold(e.target.value)}
                      placeholder="480"
                    />
                  )}
                </Field>
              </>
            )}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Tambah cuti untuk lembur disetujui</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={overtimeRuleEnabled}
                onChange={(e) => setOvertimeRuleEnabled(e.target.checked)}
              />
            </label>
            {overtimeRuleEnabled && (
              <Field label="Menit lembur per 1 hari ditambah">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className={field}
                    value={overtimeThreshold}
                    onChange={(e) => setOvertimeThreshold(e.target.value)}
                    placeholder="480"
                  />
                )}
              </Field>
            )}
            <p className="text-xs text-muted">
              Keterlambatan (dan pulang cepat, bila diaktifkan) yang terkumpul memotong 1 hari cuti tiap kelipatan
              menit di atas. Lembur yang disetujui menambah 1 hari cuti tiap kelipatan menitnya. 0 = nonaktif.
            </p>
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="brand" title="Gamification">
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Wajib pilih Superpower</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={forceSuperpower}
                onChange={(e) => setForceSuperpower(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Saat aktif, pengguna yang belum memilih superpower akan melihat layar wajib-pilih saat
              membuka aplikasi dan harus memilih dulu sebelum bisa memakai aplikasi.
            </p>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Wajib apresiasi harian</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={forceDailyRecognition}
                onChange={(e) => setForceDailyRecognition(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Setiap anggota Internal Team wajib memberi 1 vote superpower/hari untuk rekan yang belum
              dinilai, sampai semua rekan dinilai. Default nonaktif.
            </p>
            {forceDailyRecognition && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
                  <span className="text-sm font-semibold text-ink dark:text-slate-200">Mulai muncul jam</span>
                  <input
                    type="time"
                    className="rounded-lg border border-line px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={recognitionStart}
                    onChange={(e) => setRecognitionStart(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted">
                  Gerbang apresiasi baru muncul mulai jam ini (waktu server). Kosongkan agar muncul kapan saja.
                </p>
              </>
            )}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Pengingat Tes DISC &amp; Kepribadian</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={forceDiscReminder}
                onChange={(e) => setForceDiscReminder(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Saat aktif, anggota Internal Team &amp; Intern yang belum menyelesaikan tes DISC &amp; kepribadian
              akan diingatkan lewat popup yang bisa ditutup, dan muncul lagi tiap beberapa jam. Default nonaktif.
            </p>
            {forceDiscReminder && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
                  <span className="text-sm font-semibold text-ink dark:text-slate-200">Interval pengingat (jam)</span>
                  <input
                    type="number"
                    min={1}
                    className="w-24 rounded-lg border border-line px-2 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={discReminderHours}
                    onChange={(e) => setDiscReminderHours(e.target.value)}
                    onBlur={() => setDiscReminderHours((h) => String(Math.max(1, n(h))))}
                  />
                </label>
                <p className="text-xs text-muted">
                  Jeda sebelum popup muncul lagi setelah pengguna menekan “Nanti”. Minimal 1 jam.
                </p>
              </>
            )}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Wajib Unggah Foto Asli</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={forcePhotoUpload}
                onChange={(e) => setForcePhotoUpload(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Saat aktif, semua pengguna tanpa foto asli wajib mengunggahnya lewat modal
              yang tidak bisa dilewati saat membuka aplikasi. Default nonaktif.
            </p>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Ambang skor Team Wall (1–4)</span>
              <input
                type="number"
                step="0.1"
                min={1}
                max={4}
                className="w-24 rounded-lg border border-line px-2 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={wallScoreMin}
                onChange={(e) => setWallScoreMin(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">
              Skor rata-rata rekan harus melebihi angka ini agar tampil di Team Wall (dan memberi skor pada
              superpower yang dipilih sendiri). Default 3,25.
            </p>
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="brand" title="Kejutan Foto 🤪">
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Aktifkan Kejutan Foto</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={prankEnabled}
                onChange={(e) => setPrankEnabled(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Buat seru-seruan: pada jam yang dipilih, tiap N menit, pengguna terpilih dapat kejutan foto
              dirinya sendiri yang muncul menari-nari dengan celetukan lucu + bunyi “boing”. Muncul saat
              aplikasi terbuka, lalu hilang sendiri. Default nonaktif; kosongkan daftar = tidak ada yang kena.
            </p>
            {prankEnabled && (
              <>
                <Field label="Kena ke pengguna">
                  {() => (
                    <MultiSelectSearch
                      options={loaded?.all_users ?? []}
                      value={prankTargets}
                      onChange={setPrankTargets}
                      placeholder="Pilih pengguna…"
                      emptyText="Tidak ada pengguna"
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jam mulai (0–23)">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={23}
                        className={field}
                        value={prankStartHour}
                        onChange={(e) => setPrankStartHour(e.target.value)}
                        onBlur={() => setPrankStartHour((h) => String(Math.max(0, Math.min(23, n(h)))))}
                      />
                    )}
                  </Field>
                  <Field label="Jam selesai (0–23)">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={23}
                        className={field}
                        value={prankEndHour}
                        onChange={(e) => setPrankEndHour(e.target.value)}
                        onBlur={() => setPrankEndHour((h) => String(Math.max(0, Math.min(23, n(h)))))}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Selang waktu (menit)">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className={field}
                      value={prankInterval}
                      onChange={(e) => setPrankInterval(e.target.value)}
                      onBlur={() => setPrankInterval((m) => String(Math.max(1, n(m))))}
                    />
                  )}
                </Field>
              </>
            )}
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="amber" title="Plan Housekeeping">
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Sapu rencana lama tiap malam</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={sweepStalePlans}
                onChange={(e) => setSweepStalePlans(e.target.checked)}
              />
            </label>
            {sweepStalePlans && (
              <Field label="Hapus slot rencana yang lebih tua dari (hari)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className={field}
                    value={sweepAfterDays}
                    onChange={(e) => setSweepAfterDays(e.target.value)}
                    onBlur={() => setSweepAfterDays((d) => String(Math.max(0, n(d))))}
                    placeholder="1"
                  />
                )}
              </Field>
            )}
            <p className="text-xs text-muted">
              Tiap tengah malam (00:00), todo yang masih “⚪️ Planned” dibersihkan dari slot rencana harian
              yang sudah lewat. 1 = buang kemarin dan sebelumnya (hari ini tetap); 0 = buang semua tanggal
              sebelum hari ini. Slot hari ini &amp; mendatang, serta todo Done/Checked/Completed, tidak disentuh.
              Default nonaktif.
            </p>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="tint" accent="amber" title="Home Banners">
          <p className="mt-1 text-xs text-muted">
            Full-width promo banners at the top of the mobile home. Landscape images (~16:7) look best. Link is
            optional — an in-app route (<code>/events</code>) or a full URL.
          </p>

          <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={onPickBanner} />

          <div className="mt-3 space-y-3">
            {banners.map((b, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-line p-3">
                <button
                  type="button"
                  onClick={() => {
                    pickForIdx.current = i
                    bannerFileRef.current?.click()
                  }}
                  className="relative flex aspect-[16/7] w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-hover/[0.04] text-muted"
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
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink">
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
                      className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addBanner}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-muted hover:text-ink sm:w-auto sm:px-8"
          >
            <Plus className="h-4 w-4" /> Add banner
          </button>
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
