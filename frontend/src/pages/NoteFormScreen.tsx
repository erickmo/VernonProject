import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { DetailScreen } from '@/components/Layout'
import { Avatar, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { mobileApi } from '@/lib/api'
import { keys, useBoot, useFormOptions } from '@/hooks/useData'
import type { PersonalNote, PersonalNoteItem, PersonalNoteShare } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function NoteFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: boot } = useBoot()
  const { name: rawName } = useParams()
  const noteId = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!noteId

  const [loading, setLoading] = useState(isEdit)
  const [note, setNote] = useState<PersonalNote | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [items, setItems] = useState<PersonalNoteItem[]>([])
  const [shares, setShares] = useState<PersonalNoteShare[]>([])
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')

  const canEdit = isEdit ? note?.can_edit ?? false : true
  const isOwner = isEdit ? note?.is_owner ?? false : true

  // Load an existing note (owner or shared viewer). New notes start blank.
  useEffect(() => {
    if (!isEdit) return
    let alive = true
    setLoading(true)
    mobileApi
      .getPersonalNote(noteId)
      .then((res) => {
        if (!alive) return
        if (res.status !== 'ok' || !res.note) {
          toast('error', res.message || 'Note not found')
          navigate('/notes', { replace: true })
          return
        }
        const n = res.note
        setNote(n)
        setTitle(n.title || '')
        setBody(n.body || '')
        setItems(n.items.map((i) => ({ label: i.label, checked: i.checked })))
        setShares(n.shares || [])
      })
      .catch((e) => {
        if (!alive) return
        toast('error', e instanceof Error ? e.message : 'Failed to load note')
        navigate('/notes', { replace: true })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isEdit, noteId, navigate, toast])

  const invalidate = () => qc.invalidateQueries({ queryKey: keys.personalNotes })

  // --- Checklist editing (local) -------------------------------------------
  const addItem = () => {
    const label = newItem.trim()
    if (!label) return
    setItems((prev) => [...prev, { label, checked: 0 }])
    setNewItem('')
  }
  const toggleItem = (idx: number) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, checked: it.checked ? 0 : 1 } : it)),
    )
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const moveItem = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = prev.slice()
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

  const isEmpty = !title.trim() && !body.trim() && items.length === 0

  const save = async () => {
    if (saving) return
    if (isEmpty) {
      toast('error', 'Add a title, body, or checklist item first')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const res = await mobileApi.updatePersonalNote(noteId, title.trim(), body, items)
        if (res.status !== 'ok') throw new Error(res.message || 'Save failed')
        toast('success', 'Note saved')
      } else {
        const res = await mobileApi.createPersonalNote(title.trim(), body, items)
        if (res.status !== 'ok') throw new Error(res.message || 'Save failed')
        toast('success', 'Note created')
      }
      invalidate()
      navigate('/notes')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!isEdit) return
    if (!(await confirm({ title: 'Delete this note?', confirmLabel: 'Delete', destructive: true })))
      return
    try {
      const res = await mobileApi.deletePersonalNote(noteId)
      if (res.status !== 'ok') throw new Error(res.message || 'Delete failed')
      toast('success', 'Note deleted')
      invalidate()
      navigate('/notes')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Delete failed')
    }
  }

  // --- Share management (immediate, owner only) ----------------------------
  const addShare = async (user: string) => {
    if (!isEdit) {
      toast('error', 'Save the note before sharing')
      return
    }
    try {
      const res = await mobileApi.sharePersonalNote(noteId, [user])
      if (res.status !== 'ok') throw new Error(res.message || 'Share failed')
      setShares(res.shares || [])
      setPicking(false)
      setSearch('')
      invalidate()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Share failed')
    }
  }
  const removeShare = async (user: string) => {
    try {
      const res = await mobileApi.unsharePersonalNote(noteId, user)
      if (res.status !== 'ok') throw new Error(res.message || 'Unshare failed')
      setShares((prev) => prev.filter((s) => s.user !== user))
      invalidate()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Unshare failed')
    }
  }

  if (isEdit && loading) {
    return (
      <DetailScreen title="Note">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  // --- Read-only render for shared viewers ---------------------------------
  if (isEdit && !canEdit) {
    return (
      <DetailScreen title={title.trim() || 'Note'}>
        <div className="flex flex-col gap-4">
          {note && (
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <Avatar name={note.owner_name} size={20} /> Shared by {note.owner_name}
            </div>
          )}
          {body.trim() && (
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{body}</p>
          )}
          {items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={!!it.checked}
                    disabled
                    className="h-5 w-5 accent-brand-600"
                  />
                  <span
                    className={
                      'flex-1 text-sm ' +
                      (it.checked
                        ? 'text-slate-400 line-through dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-100')
                    }
                  >
                    {it.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailScreen>
    )
  }

  return (
    <DetailScreen
      title={isEdit ? 'Edit note' : 'New note'}
      right={
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Title</label>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Body</label>
          <textarea
            className={field + ' min-h-[120px] resize-y'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write something…"
            rows={5}
          />
        </div>

        {/* Checklist editor */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Checklist</label>
          {items.length > 0 && (
            <ul className="mb-2 flex flex-col gap-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={!!it.checked}
                    onChange={() => toggleItem(i)}
                    className="h-5 w-5 accent-brand-600"
                  />
                  <span
                    className={
                      'flex-1 text-sm ' +
                      (it.checked
                        ? 'text-slate-400 line-through dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-100')
                    }
                  >
                    {it.label}
                  </span>
                  <button
                    onClick={() => moveItem(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="text-slate-400 disabled:opacity-30 active:scale-90"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveItem(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move down"
                    className="text-slate-400 disabled:opacity-30 active:scale-90"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeItem(i)}
                    aria-label="Remove item"
                    className="text-rose-500 active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className={field}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
              placeholder="Add checklist item"
            />
            <button
              onClick={addItem}
              disabled={!newItem.trim()}
              className="flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-3 text-white active:scale-95 disabled:opacity-50"
              aria-label="Add item"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Share manager (owner only; existing notes only) */}
        {isOwner && isEdit && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Shared with</label>
            {shares.length > 0 && (
              <ul className="mb-2 flex flex-col gap-2">
                {shares.map((s) => (
                  <li
                    key={s.user}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <Avatar name={s.full_name} image={s.image} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{s.full_name}</p>
                      <p className="truncate text-xs text-slate-400">{s.user}</p>
                    </div>
                    <button
                      onClick={() => removeShare(s.user)}
                      aria-label="Remove share"
                      className="text-rose-500 active:scale-90"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picking ? (
              <SharePicker
                excluded={[...shares.map((s) => s.user), boot?.user ?? '']}
                onPick={addShare}
                onCancel={() => {
                  setPicking(false)
                  setSearch('')
                }}
                search={search}
                setSearch={setSearch}
              />
            ) : (
              <button
                onClick={() => setPicking(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 active:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-700/50"
              >
                <UserPlus className="h-4 w-4" /> Share with someone
              </button>
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create note'}
        </button>

        {isOwner && isEdit && (
          <button
            onClick={remove}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            <Trash2 className="h-4 w-4" /> Delete note
          </button>
        )}
      </div>
    </DetailScreen>
  )
}

function SharePicker({
  excluded,
  onPick,
  onCancel,
  search,
  setSearch,
}: {
  excluded: string[]
  onPick: (user: string) => void
  onCancel: () => void
  search: string
  setSearch: (v: string) => void
}) {
  const { data: opts, isLoading } = useFormOptions()
  const excludedSet = useMemo(() => new Set(excluded), [excluded])
  const users = (opts?.users ?? []).filter((u) => !excludedSet.has(u.value))
  const q = search.trim().toLowerCase()
  const filtered = q
    ? users.filter(
        (u) => u.label.toLowerCase().includes(q) || u.value.toLowerCase().includes(q),
      )
    : users

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:text-slate-100"
          />
        </div>
        <button onClick={onCancel} className="px-2 text-sm font-medium text-slate-500" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading ? (
        <Spinner className="mx-auto my-3 h-4 w-4 text-slate-400" />
      ) : filtered.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-slate-400">No users</p>
      ) : (
        <div className="max-h-64 divide-y divide-slate-100 dark:divide-slate-700 overflow-y-auto">
          {filtered.map((u) => (
            <button
              key={u.value}
              onClick={() => onPick(u.value)}
              className="flex w-full items-center gap-3 px-2 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
            >
              <Avatar name={u.label} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{u.label}</p>
                <p className="truncate text-xs text-slate-400">{u.value}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
