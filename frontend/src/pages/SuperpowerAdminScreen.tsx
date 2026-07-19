import { useEffect, useState } from 'react'
import { Plus, X, Trash2, Sparkles, ShieldAlert } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import {
  useBoot,
  useSuperpowers,
  useSuperpowerSettings,
  useSaveSuperpowerSettings,
  useSaveSuperpower,
  useDeleteSuperpower,
} from '@/hooks/useData'
import type { SuperpowerCatalogItem } from '@/lib/types'

const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500'

const CATEGORIES = ['Leadership', 'Sales & Growth', 'Strategy', 'Execution', 'Interpersonal', 'Craft']

type LevelDraft = { level_name: string; min_score: number | ''; color: string; icon: string }
type CatalogDraft = {
  name?: string
  superpower_name: string
  category: string
  icon: string
  color: string
  description: string
}

const EMPTY_CATALOG: CatalogDraft = {
  superpower_name: '',
  category: '',
  icon: '',
  color: '#6366f1',
  description: '',
}

export default function SuperpowerAdminScreen() {
  const { data: boot } = useBoot()
  const isAdmin = !!boot?.roles.includes('System Manager')

  const [tab, setTab] = useState<'settings' | 'catalog'>('settings')

  const { data: settings, isLoading: settingsLoading } = useSuperpowerSettings()
  const { data: catalog, isLoading: catalogLoading } = useSuperpowers()
  const saveSettings = useSaveSuperpowerSettings()
  const saveCatalog = useSaveSuperpower()
  const deleteCatalog = useDeleteSuperpower()
  const toast = useToast()
  const confirm = useConfirm()

  const [levels, setLevels] = useState<LevelDraft[]>([])
  const [priorMean, setPriorMean] = useState<number | ''>('')
  const [confidenceK, setConfidenceK] = useState<number | ''>('')
  const [votePoints, setVotePoints] = useState<number | ''>('')
  const [draft, setDraft] = useState<CatalogDraft | null>(null)

  useEffect(() => {
    if (!settings) return
    setLevels(settings.levels.map((l) => ({ ...l })))
    setPriorMean(settings.prior_mean)
    setConfidenceK(settings.confidence_k)
    setVotePoints(settings.vote_points)
  }, [settings])

  if (!isAdmin) {
    return (
      <DetailScreen title="Kekuatan Super">
        <EmptyState icon={ShieldAlert} title="Tidak diizinkan" subtitle="Halaman ini hanya untuk admin." />
      </DetailScreen>
    )
  }

  const setLevel = (i: number, patch: Partial<LevelDraft>) =>
    setLevels((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const doSaveSettings = () =>
    saveSettings.mutate(
      {
        prior_mean: priorMean === '' ? 0 : Number(priorMean),
        confidence_k: confidenceK === '' ? 0 : Number(confidenceK),
        vote_points: votePoints === '' ? 0 : Number(votePoints),
        levels: levels
          .filter((l) => l.level_name.trim())
          .map((l) => ({
            level_name: l.level_name.trim(),
            min_score: l.min_score === '' ? 0 : Number(l.min_score),
            color: l.color,
            icon: l.icon,
          })),
      },
      {
        onSuccess: () => toast('success', 'Pengaturan tersimpan'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
      },
    )

  const doSaveCatalog = () => {
    if (!draft || !draft.superpower_name.trim()) return
    saveCatalog.mutate(
      {
        ...(draft.name ? { name: draft.name } : {}),
        superpower_name: draft.superpower_name.trim(),
        category: draft.category || undefined,
        icon: draft.icon.trim() || undefined,
        color: draft.color.trim() || undefined,
        description: draft.description.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast('success', draft.name ? 'Diperbarui' : 'Kekuatan ditambahkan')
          setDraft(null)
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
      },
    )
  }

  const doDisable = async (c: SuperpowerCatalogItem) => {
    const ok = await confirm({
      title: 'Nonaktifkan kekuatan',
      message: `Sembunyikan "${c.superpower_name}" dari daftar? Riwayat penilaian tetap tersimpan.`,
      confirmLabel: 'Nonaktifkan',
      destructive: true,
    })
    if (!ok) return
    deleteCatalog.mutate(c.name, {
      onSuccess: () => toast('success', 'Dinonaktifkan'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal'),
    })
  }

  return (
    <DetailScreen title="Kekuatan Super">
      <Segmented
        options={[
          { value: 'settings', label: 'Level & Skor' },
          { value: 'catalog', label: 'Katalog' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {/* ── SETTINGS TAB ─────────────────────────────────────────────────── */}
        {tab === 'settings' &&
          (settingsLoading && !settings ? (
            <FullScreenLoader />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  Level (band)
                </p>
                <div className="space-y-2">
                  {levels.map((l, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3 shadow-card"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          className={`${inputCls} flex-1`}
                          placeholder="Nama level"
                          value={l.level_name}
                          onChange={(e) => setLevel(i, { level_name: e.target.value })}
                        />
                        <button
                          onClick={() => setLevels((rows) => rows.filter((_, j) => j !== i))}
                          className="rounded-lg p-2 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                          aria-label="Hapus level"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                          Skor minimum
                          <input
                            type="number"
                            step="0.1"
                            className={`${inputCls} mt-1`}
                            value={l.min_score}
                            onChange={(e) =>
                              setLevel(i, { min_score: e.target.value === '' ? '' : Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="w-24 text-xs font-medium text-stone-500 dark:text-slate-400">
                          Warna
                          <input
                            type="color"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            value={/^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : '#6366f1'}
                            onChange={(e) => setLevel(i, { color: e.target.value })}
                          />
                        </label>
                        <label className="w-20 text-xs font-medium text-stone-500 dark:text-slate-400">
                          Ikon
                          <input
                            className={`${inputCls} mt-1`}
                            placeholder="⭐"
                            value={l.icon}
                            onChange={(e) => setLevel(i, { icon: e.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setLevels((rows) => [...rows, { level_name: '', min_score: '', color: '#6366f1', icon: '' }])
                  }
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300"
                >
                  <Plus className="h-3.5 w-3.5" /> Tambah level
                </button>
              </div>

              <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  Penyetelan
                </p>
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400">
                    Rata-rata awal (prior mean)
                    <input
                      type="number"
                      step="0.1"
                      className={`${inputCls} mt-1`}
                      value={priorMean}
                      onChange={(e) => setPriorMean(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400">
                    Kekuatan keyakinan (K)
                    <input
                      type="number"
                      className={`${inputCls} mt-1`}
                      value={confidenceK}
                      onChange={(e) => setConfidenceK(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400">
                    Poin per suara (0 = nonaktif)
                    <input
                      type="number"
                      className={`${inputCls} mt-1`}
                      value={votePoints}
                      onChange={(e) => setVotePoints(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <button
                onClick={doSaveSettings}
                disabled={saveSettings.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {saveSettings.isPending ? <Spinner className="h-4 w-4" /> : 'Simpan pengaturan'}
              </button>
            </div>
          ))}

        {/* ── CATALOG TAB ──────────────────────────────────────────────────── */}
        {tab === 'catalog' && (
          <>
            <button
              onClick={() => setDraft({ ...EMPTY_CATALOG })}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              <Plus className="h-4 w-4" /> Tambah kekuatan
            </button>
            {catalogLoading && !catalog ? (
              <FullScreenLoader />
            ) : (catalog ?? []).length === 0 ? (
              <EmptyState icon={Sparkles} title="Katalog kosong" subtitle="Tambahkan kekuatan pertama." />
            ) : (
              <div className="space-y-2">
                {(catalog ?? []).map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                      style={{ backgroundColor: `${c.color || '#6366f1'}18` }}
                    >
                      {c.icon || '⭐'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-50">
                        {c.superpower_name}
                      </p>
                      <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                        {c.category || 'Tanpa kategori'}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setDraft({
                          name: c.name,
                          superpower_name: c.superpower_name,
                          category: c.category || '',
                          icon: c.icon || '',
                          color: c.color || '#6366f1',
                          description: c.description || '',
                        })
                      }
                      className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-2.5 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300 active:scale-95"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => doDisable(c)}
                      className="rounded-lg p-1.5 text-stone-400 dark:text-slate-500 active:bg-rose-50 active:text-rose-600 dark:active:bg-rose-500/15"
                      aria-label="Nonaktifkan"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Catalog form sheet ─────────────────────────────────────────────── */}
      {draft && (
        <Sheet
          title={draft.name ? 'Edit kekuatan' : 'Kekuatan baru'}
          onClose={() => !saveCatalog.isPending && setDraft(null)}
        >
          <div className="space-y-3">
            <input
              className={inputCls}
              placeholder="Nama kekuatan *"
              value={draft.superpower_name}
              onChange={(e) => setDraft({ ...draft, superpower_name: e.target.value })}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-slate-400">Kategori</label>
              <SearchableSelect
                value={draft.category}
                onChange={(v) => setDraft({ ...draft, category: v })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                placeholder="Pilih kategori…"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Ikon (emoji)
                <input
                  className={`${inputCls} mt-1`}
                  placeholder="⭐"
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                />
              </label>
              <label className="w-24 text-xs font-medium text-stone-500 dark:text-slate-400">
                Warna
                <input
                  type="color"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : '#6366f1'}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </label>
            </div>
            <textarea
              className={inputCls}
              rows={2}
              placeholder="Deskripsi singkat (opsional)"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <button
              onClick={doSaveCatalog}
              disabled={!draft.superpower_name.trim() || saveCatalog.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saveCatalog.isPending ? <Spinner className="h-4 w-4" /> : 'Simpan'}
            </button>
          </div>
        </Sheet>
      )}
    </DetailScreen>
  )
}

// Bottom-sheet (matches LmsAdminScreen).
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
