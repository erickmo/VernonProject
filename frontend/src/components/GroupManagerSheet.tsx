import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { Spinner } from '@/components/ui'
import { stripHtml, deleteErrorMessage } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function GroupManagerSheet({ open, onClose, project }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: groups, isLoading } = useGroups(project, open)
  const create = useCreateGroup(project)
  const update = useUpdateGroup(project)
  const del = useDeleteGroup(project)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const addGroup = () => {
    if (!newName.trim()) {
      toast('error', 'Group name is required')
      return
    }
    create.mutate(
      { glossary: newName.trim(), description: newDesc.trim() },
      {
        onSuccess: () => { toast('success', 'Group added'); setNewName(''); setNewDesc('') },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const saveEdit = (name: string) => {
    if (!editName.trim()) {
      toast('error', 'Group name is required')
      return
    }
    update.mutate(
      { name, glossary: editName.trim(), description: editDesc.trim() },
      {
        onSuccess: () => { toast('success', 'Group updated'); setEditId(null) },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const removeGroup = async (name: string) => {
    if (!(await confirm({ title: 'Delete this group?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => toast('success', 'Group deleted'),
      onError: (e) => toast('error', deleteErrorMessage(e, 'group')),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Manage groups</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-slate-50 p-3">
          <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" />
          <input className={field + ' mt-2'} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
          <button onClick={addGroup} disabled={create.isPending}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Group
          </button>
        </div>

        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : (
          <div className="flex flex-col gap-2">
            {(groups ?? []).map((g) =>
              editId === g.name ? (
                <div key={g.name} className="rounded-xl border border-brand-200 p-3">
                  <input className={field} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={field + ' mt-2'} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => saveEdit(g.name)} disabled={update.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white">
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="flex-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={g.name} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{g.glossary}</p>
                    {g.description && <p className="truncate text-xs text-slate-500">{stripHtml(g.description)}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => { setEditId(g.name); setEditName(g.glossary); setEditDesc(stripHtml(g.description || '')) }}
                      className="rounded-lg p-1.5 text-slate-500 active:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => removeGroup(g.name)}
                      className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ),
            )}
            {!(groups ?? []).length && <p className="py-4 text-center text-sm text-slate-400">No groups yet</p>}
          </div>
        )}
      </div>
    </div>
  )
}
