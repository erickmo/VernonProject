import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Eye } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useBoot, canManageUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { mobileApi } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { TransferUser } from '@/lib/types'

export default function TransferTasksScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()

  const usersQ = useQuery({
    queryKey: ['transferUsers'],
    queryFn: () => mobileApi.listTransferUsers(),
    enabled: canManageUsers(boot),
  })
  const projectsQ = useQuery({
    queryKey: ['transferProjects'],
    queryFn: () => mobileApi.projects() as Promise<{ name: string; project_name?: string }[]>,
    enabled: canManageUsers(boot),
  })

  const [fromName, setFromName] = useState('')
  const [toName, setToName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [preview, setPreview] = useState<{ count: number; blocked: string[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const users: TransferUser[] = usersQ.data?.users ?? []
  const projects = projectsQ.data ?? []
  const nameFor = (u: string) => users.find((x) => x.name === u)?.full_name ?? u

  const fromOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.name,
        label: `${u.full_name} (${u.name})${u.enabled ? '' : ' — disabled'}`,
      })),
    [users],
  )
  const toOptions = useMemo(
    () =>
      users
        .filter((u) => u.enabled && u.name !== fromName)
        .map((u) => ({ value: u.name, label: `${u.full_name} (${u.name})` })),
    [users, fromName],
  )
  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.name, label: p.project_name || p.name })),
    [projects],
  )

  const pickFrom = (v: string) => {
    setFromName(v)
    if (v === toName) setToName('')
    setPreview(null)
  }
  const pickTo = (v: string) => {
    setToName(v)
    setPreview(null)
  }
  const pickProject = (v: string) => {
    setProjectName(v)
    setPreview(null)
  }

  // Access gate: redirect outside render.
  const blocked = boot !== undefined && !canManageUsers(boot)
  useEffect(() => {
    if (blocked) navigate('/me', { replace: true })
  }, [blocked, navigate])

  if (bootLoading || blocked) {
    return (
      <DetailScreen title="Transfer Tasks" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const runPreview = async () => {
    if (!fromName || !toName) return toast('error', 'Pick both a source and target user')
    setPreviewing(true)
    try {
      const res = await mobileApi.transferTasks(fromName, toName, projectName || undefined, true)
      setPreview({ count: res.count ?? 0, blocked: res.blocked_projects ?? [] })
    } catch (e: any) {
      toast('error', e?.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  const submit = async () => {
    if (!preview || submitting) return
    if (preview.blocked.length)
      return toast('error', `${nameFor(toName)} is not on every affected project team`)
    if (!preview.count) return toast('error', 'No open tasks to transfer')
    const scope = projectName
      ? `in ${projects.find((p) => p.name === projectName)?.project_name || projectName}`
      : 'across all projects'
    const ok = await confirm({
      title: 'Transfer tasks?',
      message: `Move ${preview.count} open task(s) from ${nameFor(fromName)} to ${nameFor(
        toName,
      )} ${scope}? This cannot be undone.`,
      confirmLabel: 'Transfer',
    })
    if (!ok) return
    setSubmitting(true)
    try {
      const res = await mobileApi.transferTasks(fromName, toName, projectName || undefined)
      toast('success', `Moved ${res.moved ?? 0} task(s) to ${nameFor(toName)}.`)
      setFromName('')
      setToName('')
      setProjectName('')
      setPreview(null)
    } catch (e: any) {
      toast('error', e?.message || 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canTransfer = !!preview && preview.count > 0 && preview.blocked.length === 0

  return (
    <DetailScreen title="Transfer Tasks" right={null}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
        <ArrowLeftRight className="h-6 w-6" />
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Move a user’s open tasks to another user — all projects, or one. Completed and cancelled
        tasks stay put.
      </p>

      {usersQ.isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                From user
              </span>
              <SearchableSelect
                value={fromName}
                onChange={pickFrom}
                options={fromOptions}
                placeholder="Search users…"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                To user
              </span>
              <SearchableSelect
                value={toName}
                onChange={pickTo}
                options={toOptions}
                placeholder="Search enabled users…"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Project
              </span>
              <SearchableSelect
                value={projectName}
                onChange={pickProject}
                options={projectOptions}
                placeholder="All projects"
                allowClear
              />
            </label>
          </div>

          {preview && (
            <div
              className={
                preview.blocked.length
                  ? 'rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300'
                  : 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-700 dark:text-slate-200 shadow-sm'
              }
            >
              {preview.count === 0 ? (
                <span>No open tasks match — nothing to transfer.</span>
              ) : preview.blocked.length ? (
                <span>
                  {nameFor(toName)} is not on the team of <b>{preview.blocked.join(', ')}</b>. Add
                  them to those project teams, or pick a project they belong to.
                </span>
              ) : (
                <span>
                  <b>{preview.count}</b> open task(s) will move to {nameFor(toName)}.
                </span>
              )}
            </div>
          )}

          <button
            onClick={runPreview}
            disabled={previewing || !fromName || !toName}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 active:scale-[0.99] disabled:opacity-50"
          >
            {previewing ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Preview
          </button>
          <button
            onClick={submit}
            disabled={submitting || !canTransfer}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
            Transfer tasks
          </button>
        </div>
      )}
    </DetailScreen>
  )
}
