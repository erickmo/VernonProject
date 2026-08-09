import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, Flag, Plus, Clock, User, FolderOpen, Link2 } from 'lucide-react'
import { BlueprintCanvas } from './BlueprintCanvas'
import { SearchableSelect } from './SearchableSelect'
import { useProjectBlueprint, useSetTodoBlocking, useCalendar } from '@/hooks/useData'
import { connectionRejected, toDetailScope, type LayoutNode } from '@/lib/blueprint'
import { todoIsOpen } from '@/lib/filters'
import { STATUS } from '@/lib/status'
import { formatDate } from '@/lib/format'
import { Spinner, EmptyState } from './ui'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'

// Shared "Peta" board — backward begin-with-the-end whiteboard for one project.
// Node cards + drag-to-connect + tap→context-menu live here; each frontend injects
// its own quick-add modal (Sheet on /m, Dialog on /w) via render props.
interface Props {
  project: string
  renderAddSubgoal: (a: { open: boolean; onClose: () => void; project: string }) => ReactNode
  renderAddTodo: (a: { detail: string; onClose: () => void }) => ReactNode
  /** Scope the map to ONE sub-goal: that Project Detail becomes the goal (end in
   *  mind), only its todos, no project node, no sibling details. */
  detailScope?: string
}

interface MenuAction {
  label: string
  icon: typeof FolderOpen
  onClick: () => void
}

export function BlueprintBoard({ project, renderAddSubgoal, renderAddTodo, detailScope }: Props) {
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading } = useProjectBlueprint(project)
  const cal = useCalendar()
  const setBlocking = useSetTodoBlocking()
  const [addSub, setAddSub] = useState(false)
  const [addTodoDetail, setAddTodoDetail] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<{ id: string; label: string } | null>(null)
  const [menu, setMenu] = useState<{ actions: MenuAction[]; at: { x: number; y: number } } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  if (isLoading) return <div className="grid h-full place-items-center"><Spinner /></div>
  if (!data) return null

  // In detail scope the goal IS the picked sub-goal; only its todos remain.
  const view = detailScope ? toDetailScope(data, detailScope) : data
  if (!view) return null

  if (detailScope && !view.todos.length)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex flex-col items-center">
          <EmptyState icon={Flag} title="Belum ada aksi" subtitle="Mulai dari akhir: tambahkan aksi untuk sub-tujuan ini." />
          <button onClick={() => setAddTodoDetail(detailScope)} className="mt-3 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">
            + Aksi
          </button>
        </div>
        {addTodoDetail && renderAddTodo({ detail: addTodoDetail, onClose: () => setAddTodoDetail(null) })}
      </div>
    )
  if (!detailScope && !view.details.length)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex flex-col items-center">
          <EmptyState icon={Flag} title="Belum ada sub-tujuan" subtitle="Mulai dari akhir: tambahkan sub-tujuan proyek." />
          <button onClick={() => setAddSub(true)} className="mt-3 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">
            + Sub-tujuan
          </button>
        </div>
        {renderAddSubgoal({ open: addSub, onClose: () => setAddSub(false), project })}
      </div>
    )

  const connect = (from: string, to: string) => {
    const rej = connectionRejected(from, to, data.todos)
    if (rej === 'self' || rej === 'duplicate') return
    if (rej === 'cycle') return toast('error', 'Tidak bisa: akan membuat ketergantungan melingkar.')
    const t = data.todos.find((x) => x.id === from)!
    setBlocking.mutate(
      { todo: from, blocking: [...t.blocking, to] },
      { onError: () => toast('error', 'Tidak diizinkan mengubah ketergantungan.') },
    )
  }
  const disconnect = async (from: string, to: string) => {
    if (!(await confirm({ title: 'Hapus ketergantungan?', destructive: true }))) return
    const t = data.todos.find((x) => x.id === from)!
    setBlocking.mutate(
      { todo: from, blocking: t.blocking.filter((b) => b !== to) },
      { onError: () => toast('error', 'Tidak diizinkan mengubah ketergantungan.') },
    )
  }

  // Tap / right-click / long-press a node → open its action menu (no accidental nav).
  const activate = (n: LayoutNode, at: { x: number; y: number }) => {
    let actions: MenuAction[] = []
    if (n.kind === 'goal') {
      actions = detailScope
        ? [
            // Goal node IS the picked sub-goal here.
            { label: 'Buka sub-tujuan', icon: FolderOpen, onClick: () => nav(`/project-detail/${encodeURIComponent(n.goal!.name)}`) },
            { label: 'Tambah aksi', icon: Plus, onClick: () => setAddTodoDetail(n.goal!.name) },
          ]
        : [
            { label: 'Buka proyek', icon: FolderOpen, onClick: () => nav(`/project/${encodeURIComponent(n.goal!.name)}`) },
            { label: 'Tambah sub-tujuan', icon: Plus, onClick: () => setAddSub(true) },
          ]
    } else if (n.kind === 'subgoal') {
      actions = [
        { label: 'Buka sub-tujuan', icon: FolderOpen, onClick: () => nav(`/project-detail/${encodeURIComponent(n.detail!.name)}`) },
        { label: 'Tambah aksi', icon: Plus, onClick: () => setAddTodoDetail(n.detail!.name) },
      ]
    } else {
      const t = n.todo!
      actions = [
        { label: 'Buka aksi', icon: FolderOpen, onClick: () => nav(`/project-item/${encodeURIComponent(t.id)}`) },
        { label: 'Hubungkan ke aksi lain…', icon: Link2, onClick: () => setLinkFrom({ id: t.id, label: t.label }) },
      ]
    }
    setMenu({ actions, at })
  }

  const renderNode = (n: LayoutNode) => {
    if (n.kind === 'goal') {
      const g = n.goal!
      return (
        <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3 text-white shadow-card">
          <div>
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-80">
              {detailScope ? <Flag size={12} /> : <Target size={12} />} {detailScope ? 'Sub-tujuan (akhir)' : 'Tujuan'}
            </div>
            <div className="mt-0.5 line-clamp-2 text-sm font-extrabold leading-tight">{g.project_name}</div>
            {g.goal && <div className="mt-1 line-clamp-2 text-[11px] opacity-90">{g.goal}</div>}
          </div>
          <div className="text-[10px] opacity-90">{g.deadline ? formatDate(g.deadline) : '—'}</div>
        </div>
      )
    }
    if (n.kind === 'subgoal') {
      const d = n.detail!
      return (
        <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div>
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-500"><Flag size={11} /> Sub-tujuan</div>
            <div className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-tight text-slate-800 dark:text-slate-100">{d.title}</div>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><Clock size={10} />{d.deadline ? formatDate(d.deadline) : '—'}</span>
        </div>
      )
    }
    const t = n.todo!
    const st = STATUS[t.statusKey]
    return (
      <div className={`flex h-full flex-col justify-between rounded-lg border-l-4 bg-white p-2 shadow-sm dark:bg-slate-800 ${t.overdue ? 'ring-2 ring-rose-400' : ''} ${st.ring} border-y border-r border-slate-100 dark:border-slate-700`}>
        <div className="line-clamp-2 text-[12px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
          <span className="mr-1">{st.emoji}</span>{t.label}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-0.5 truncate"><User size={9} />{t.assignee ?? '—'}</span>
          <span>{t.deadline ? formatDate(t.deadline) : 'no date'}</span>
        </div>
      </div>
    )
  }

  const rootW = rootRef.current?.clientWidth ?? 9999
  const rootH = rootRef.current?.clientHeight ?? 9999

  // Cross-project link picker candidates: my visible open todos, minus self and
  // todos this one already blocks.
  const linkCandidates = (() => {
    if (!linkFrom) return []
    const already = new Set(data.todos.find((t) => t.id === linkFrom.id)?.blocking ?? [])
    return (cal.data?.todos ?? [])
      .filter((t) => todoIsOpen(t) && t.name !== linkFrom.id && !already.has(t.name))
      .map((t) => ({ value: t.name, label: `${t.to_do} · ${t.project_name}` }))
  })()

  return (
    <div ref={rootRef} className="relative h-full w-full">
      <BlueprintCanvas data={view} renderNode={renderNode} onNodeActivate={activate} onConnect={connect} onDisconnect={disconnect} canEdit />

      {menu && (
        <div className="absolute inset-0 z-50" onPointerDown={() => setMenu(null)}>
          <div
            className="absolute min-w-[10rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            style={{ left: Math.min(menu.at.x, rootW - 180), top: Math.min(menu.at.y, rootH - 130) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menu.actions.map((a) => (
              <button
                key={a.label}
                onClick={() => { a.onClick(); setMenu(null) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <a.icon className="h-4 w-4 text-slate-400" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {linkFrom && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/30 p-4" onPointerDown={() => setLinkFrom(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-800"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">Hubungkan ketergantungan</div>
            <div className="mb-3 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
              "{linkFrom.label}" harus selesai sebelum aksi yang dipilih (boleh lintas proyek).
            </div>
            <SearchableSelect
              value=""
              onChange={(target) => {
                if (target) connect(linkFrom.id, target)
                setLinkFrom(null)
              }}
              options={linkCandidates}
              placeholder="Cari aksi tujuan…"
            />
            <button
              onClick={() => setLinkFrom(null)}
              className="mt-3 w-full rounded-full bg-slate-100 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {renderAddSubgoal({ open: addSub, onClose: () => setAddSub(false), project })}
      {addTodoDetail && renderAddTodo({ detail: addTodoDetail, onClose: () => setAddTodoDetail(null) })}
    </div>
  )
}
