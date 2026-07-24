import { useEffect, useState } from 'react'
import { Plus, Trash2, Sparkles, Pencil, ShieldAlert } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Sheet } from '@web/components/Sheet'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { Page, PageHeader } from '@web/components/Page'
import {
  useBoot, useSuperpowers, useSuperpowerSettings,
  useSaveSuperpowerSettings, useSaveSuperpower, useDeleteSuperpower,
} from '@/hooks/useData'
import type { SuperpowerCatalogItem, SuperpowerLevel } from '@/lib/types'
import { SPIcon, hexBg } from './Superpowers'

const CATEGORIES = ['Leadership', 'Sales & Growth', 'Strategy', 'Execution', 'Interpersonal', 'Craft']
const CAT_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }))

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'
const NEW_LEVEL: SuperpowerLevel = { level_name: '', min_score: 0, color: '#94a3b8', icon: 'star' }
type CatDraft = Partial<SuperpowerCatalogItem> & { superpower_name: string }

export default function SuperpowersAdmin() {
  const { data: boot } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()

  const settings = useSuperpowerSettings()
  const catalog = useSuperpowers()
  const saveSettings = useSaveSuperpowerSettings()
  const saveCat = useSaveSuperpower()
  const delCat = useDeleteSuperpower()

  // Leveling knobs + bands (seeded from settings, edited locally, saved on demand).
  const [priorMean, setPriorMean] = useState(5)
  const [confidenceK, setConfidenceK] = useState(3)
  const [votePoints, setVotePoints] = useState(0)
  const [wallScoreMin, setWallScoreMin] = useState(7.5)
  const [perfWindowDays, setPerfWindowDays] = useState(30)
  const [streakTarget, setStreakTarget] = useState(30)
  const [finisherTarget, setFinisherTarget] = useState(30)
  const [levels, setLevels] = useState<SuperpowerLevel[]>([])
  const [editing, setEditing] = useState<CatDraft | null>(null)

  const s = settings.data
  useEffect(() => {
    if (!s) return
    setPriorMean(s.prior_mean)
    setConfidenceK(s.confidence_k)
    setVotePoints(s.vote_points)
    setWallScoreMin(s.wall_score_min)
    setPerfWindowDays(s.perf_window_days)
    setStreakTarget(s.streak_target)
    setFinisherTarget(s.finisher_target)
    setLevels(s.levels.map((l) => ({ ...l })))
  }, [s])

  if (boot && !boot.roles.includes('System Manager'))
    return (
      <Page className="mx-auto max-w-lg">
        <EmptyState icon={ShieldAlert} title="Akses ditolak" subtitle="Halaman ini hanya untuk System Manager." />
      </Page>
    )

  if (settings.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (settings.isError) return <ErrorState onRetry={() => settings.refetch()} />

  const patchLevel = (i: number, p: Partial<SuperpowerLevel>) =>
    setLevels((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)))

  const submitSettings = async () => {
    if (levels.some((l) => !l.level_name.trim())) return toast('error', 'Nama level wajib diisi')
    try {
      await saveSettings.mutateAsync({
        prior_mean: priorMean, confidence_k: confidenceK, vote_points: votePoints,
        wall_score_min: wallScoreMin,
        perf_window_days: perfWindowDays, streak_target: streakTarget, finisher_target: finisherTarget,
        levels,
      })
      toast('success', 'Pengaturan tersimpan')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  const submitCat = async () => {
    if (!editing) return
    if (!editing.superpower_name.trim()) return toast('error', 'Nama superpower wajib diisi')
    try {
      await saveCat.mutateAsync(editing)
      toast('success', 'Tersimpan')
      setEditing(null)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  const disableCat = async (c: SuperpowerCatalogItem) => {
    const ok = await confirm({
      title: `Nonaktifkan ${c.superpower_name}?`,
      message: 'Superpower disembunyikan dari pemilihan. Riwayat penilaian tetap tersimpan.',
      confirmLabel: 'Nonaktifkan',
      cancelLabel: 'Batal',
      destructive: true,
    })
    if (!ok) return
    try {
      await delCat.mutateAsync(c.name)
      toast('success', 'Dinonaktifkan')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal')
    }
  }

  return (
    <Page className="mx-auto max-w-3xl">
      <PageHeader icon={Sparkles} title="Superpowers" subtitle="Katalog superpower, level, dan poin penilaian." />

      {/* Leveling settings */}
      <section className="space-y-4 rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="font-semibold text-ink">Level & penilaian</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Prior mean (netral)
            <input type="number" step="0.1" className={field} value={priorMean}
              onChange={(e) => setPriorMean(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Confidence K
            <input type="number" min={0} className={field} value={confidenceK}
              onChange={(e) => setConfidenceK(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Poin per suara
            <input type="number" min={0} className={field} value={votePoints}
              onChange={(e) => setVotePoints(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Ambang skor Team Wall (0–10)
            <input type="number" step="0.1" min={0} max={10} className={field} value={wallScoreMin}
              onChange={(e) => setWallScoreMin(Number(e.target.value))} />
          </label>
        </div>

        <h3 className="text-sm font-semibold text-ink">Kinerja (otomatis)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Hari jendela kinerja
            <input type="number" min={1} className={field} value={perfWindowDays}
              onChange={(e) => setPerfWindowDays(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Target streak (hari)
            <input type="number" min={1} className={field} value={streakTarget}
              onChange={(e) => setStreakTarget(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Target finisher (tugas)
            <input type="number" min={1} className={field} value={finisherTarget}
              onChange={(e) => setFinisherTarget(Number(e.target.value))} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Band level</h3>
            <Button size="sm" onClick={() => setLevels((prev) => [...prev, { ...NEW_LEVEL }])}>
              <Plus className="h-4 w-4" /> Tambah band
            </Button>
          </div>
          {levels.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: hexBg(l.color) }}>
                <SPIcon icon={l.icon} color={l.color} className="h-5 w-5" />
              </span>
              <label className="flex flex-1 basis-32 flex-col gap-1 text-[11px] font-semibold text-muted">
                Nama
                <input className={field} value={l.level_name} onChange={(e) => patchLevel(i, { level_name: e.target.value })} />
              </label>
              <label className="flex w-20 flex-col gap-1 text-[11px] font-semibold text-muted">
                Min skor
                <input type="number" step="0.1" className={field} value={l.min_score} onChange={(e) => patchLevel(i, { min_score: Number(e.target.value) })} />
              </label>
              <label className="flex w-28 flex-col gap-1 text-[11px] font-semibold text-muted">
                Warna
                <input className={field} value={l.color} placeholder="#22c55e" onChange={(e) => patchLevel(i, { color: e.target.value })} />
              </label>
              <label className="flex w-28 flex-col gap-1 text-[11px] font-semibold text-muted">
                Ikon
                <input className={field} value={l.icon} placeholder="star / ⭐" onChange={(e) => patchLevel(i, { icon: e.target.value })} />
              </label>
              <button type="button" onClick={() => setLevels((prev) => prev.filter((_, j) => j !== i))}
                className="p-2 text-rose-500 hover:text-rose-600" aria-label="Hapus band">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {levels.length === 0 && <p className="text-sm text-muted">Belum ada band level.</p>}
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={submitSettings} disabled={saveSettings.isPending}>
            {saveSettings.isPending && <Spinner className="h-4 w-4" />} Simpan pengaturan
          </Button>
        </div>
      </section>

      {/* Catalog manager */}
      <section className="mt-5 space-y-3 rounded-2xl bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Katalog superpower</h2>
          <Button size="sm" variant="primary"
            onClick={() => setEditing({ superpower_name: '', category: CATEGORIES[0], icon: 'star', color: '#6366f1', description: '' })}>
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        </div>
        {catalog.isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (catalog.data ?? []).length === 0 ? (
          <EmptyState icon={Sparkles} title="Belum ada superpower" subtitle="Tambahkan superpower pertama." />
        ) : (
          <div className="divide-y divide-line">
            {(catalog.data ?? []).map((c) => (
              <div key={c.name} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: hexBg(c.color) }}>
                  <SPIcon icon={c.icon} color={c.color} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{c.superpower_name}</div>
                  <div className="truncate text-xs text-muted">{c.category}{c.description ? ` · ${c.description}` : ''}</div>
                </div>
                <button type="button" onClick={() => setEditing({ ...c })} className="p-2 text-muted hover:text-ink" aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => disableCat(c)} className="p-2 text-rose-500 hover:text-rose-600" aria-label="Nonaktifkan">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ? 'Edit superpower' : 'Superpower baru'} size="sm">
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); submitCat() }} className="space-y-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Nama
              <input autoFocus className={field} placeholder="mis. Leadership" value={editing.superpower_name}
                onChange={(e) => setEditing({ ...editing, superpower_name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Kategori
              <SearchableSelect value={editing.category || CATEGORIES[0]}
                onChange={(val) => setEditing({ ...editing, category: val })} options={CAT_OPTIONS} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Ikon (lucide / emoji)
                <input className={field} placeholder="crown / 👑" value={editing.icon || ''}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Warna
                <input className={field} placeholder="#6366f1" value={editing.color || ''}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-muted">
              Pratinjau:
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: hexBg(editing.color) }}>
                <SPIcon icon={editing.icon} color={editing.color} className="h-5 w-5" />
              </span>
              <span className="font-medium text-ink">{editing.superpower_name || 'Superpower'}</span>
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Deskripsi
              <input className={field} placeholder="Penjelasan singkat" value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={saveCat.isPending}>Batal</Button>
              <Button type="submit" variant="primary" disabled={saveCat.isPending}>
                {saveCat.isPending && <Spinner className="h-4 w-4" />} Simpan
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </Page>
  )
}
