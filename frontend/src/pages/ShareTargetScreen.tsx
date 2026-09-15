import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Share2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { useProjectDetailPicker } from '@/hooks/useProjectDetailPicker'
import { parseSharedPayload, sharedTodoInitial } from '@/lib/shareTarget'

/**
 * Where the OS share sheet lands (manifest `share_target` -> /m/share?title&text&url).
 *
 * It opens the ordinary create-todo form, prefilled and editable — it never creates
 * anything on its own. That is what makes a duplicate delivery (Android re-firing the
 * intent, the user reopening the PWA on the same URL, a back-navigation) harmless:
 * there is nothing to duplicate until someone presses Create. The server's own
 * refuse_duplicate_save covers the double-submit behind that button.
 *
 * ponytail: the shared content lives in the URL and nowhere else — no storage, no
 * draft table — so there is no draft to survive a logout and leak to the next account
 * on the device, and back/forward restores the prefill for free.
 */
export default function ShareTargetScreen() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const shared = useMemo(() => parseSharedPayload(search), [search])
  const picker = useProjectDetailPicker()

  if (!shared) {
    return (
      <DetailScreen title="Bagikan ke Vernon">
        <div className="p-4">
          <EmptyState
            icon={Share2}
            title="Konten ini belum bisa dipakai"
            subtitle="Yang dibagikan tidak berisi teks atau tautan yang bisa dibaca. Coba bagikan ulang, atau buat tugas dari daftar proyek."
          />
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
            >
              Kembali
            </button>
            <button
              onClick={() => navigate('/projects', { replace: true })}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95"
            >
              Buka Proyek
            </button>
          </div>
        </div>
      </DetailScreen>
    )
  }

  const initial = sharedTodoInitial(shared)

  return (
    <DetailScreen title="Bagikan ke Vernon">
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dari aplikasi lain</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-50">{initial.toDo}</p>
          {shared.url && (
            <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{shared.url}</p>
          )}
        </div>

        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Proyek
          <SearchableSelect
            value={picker.project}
            onChange={picker.chooseProject}
            options={picker.projectCards.map((p) => ({ value: p.name, label: p.project_name }))}
            placeholder="Pilih proyek…"
          />
        </label>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Bagian Proyek
          <SearchableSelect
            value={picker.detail}
            onChange={picker.chooseDetail}
            options={picker.projectDetails.map((d) => ({ value: d.name, label: d.title }))}
            placeholder="Pilih bagian…"
          />
        </label>

        <button
          onClick={picker.openDialog}
          disabled={!picker.detail || !picker.detailData}
          className="rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          Lanjut ke form tugas
        </button>
      </div>

      {picker.dialogOpen && picker.detailData && (
        <CreateProjectItemSheet
          open
          onClose={picker.closeDialog}
          projectDetail={picker.detail}
          team={picker.detailData.team.map((t) => ({ user: t.user, name: t.name }))}
          defaultGroup={picker.detailData.default_group ?? null}
          initial={initial}
          // replace: the share URL must not sit in history behind the new todo, or
          // Back re-opens the same prefilled form.
          onCreated={(name) => navigate(`/project-item/${name}`, { replace: true })}
        />
      )}
    </DetailScreen>
  )
}
