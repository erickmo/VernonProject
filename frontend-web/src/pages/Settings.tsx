import { useEffect, useRef, useState } from 'react'
import { Settings as SettingsIcon, Check, ImagePlus, Trash2, Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageGroups, useAppSettings, useSaveAppSettings } from '@/hooks/useData'
import { uploadBannerImage } from '@/lib/api'
import type { HomeBanner } from '@/lib/types'

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
  const [forceSuperpower, setForceSuperpower] = useState<boolean>(false)
  const [qrValiditySeconds, setQrValiditySeconds] = useState<string>('0')
  const [graceMinutes, setGraceMinutes] = useState<string>('0')
  const [lateRate, setLateRate] = useState<string>('0')
  const [earlyRate, setEarlyRate] = useState<string>('0')
  const [absencePenalty, setAbsencePenalty] = useState<string>('0')
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const pickForIdx = useRef<number | null>(null)
  const [appLogo, setAppLogo] = useState<string>('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) return
    setMaxEstimatedMinutes(String(loaded.max_estimated_minutes))
    setToleranceMinutes(String(loaded.under_occupied_tolerance_minutes))
    setAttendanceEnabled(!!loaded.attendance_enabled)
    setForceSuperpower(!!loaded.force_superpower_onboarding)
    setQrValiditySeconds(String(loaded.qr_validity_seconds))
    setGraceMinutes(String(loaded.attendance_grace_minutes))
    setLateRate(String(loaded.late_penalty_per_minute))
    setEarlyRate(String(loaded.early_leave_penalty_per_minute))
    setAbsencePenalty(String(loaded.absence_penalty))
    setBanners(loaded.home_banners ?? [])
    setAppLogo(loaded.app_logo ?? '')
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
        app_logo: appLogo,
        max_estimated_minutes: n(maxEstimatedMinutes),
        under_occupied_tolerance_minutes: n(toleranceMinutes),
        attendance_enabled: attendanceEnabled ? 1 : 0,
        force_superpower_onboarding: forceSuperpower ? 1 : 0,
        qr_validity_seconds: n(qrValiditySeconds),
        attendance_grace_minutes: n(graceMinutes),
        late_penalty_per_minute: n(lateRate),
        early_leave_penalty_per_minute: n(earlyRate),
        absence_penalty: n(absencePenalty),
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
