import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Eye } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { useBoot, canManageUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { mobileApi } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { TransferUser } from '@/lib/types'

type Preview = { count: number; blocked: string[] }

export default function TransferTasks() {
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
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const users = usersQ.data?.users ?? []
  const projects = projectsQ.data ?? []

  const fromOptions = useMemo(
    () =>
      users.map((u: TransferUser) => ({
        value: u.name,
        label: `${u.full_name} (${u.name})${u.enabled ? '' : ' — disabled'}`,
      })),
    [users],
  )
  const toOptions = useMemo(
    () =>
      users
        .filter((u: TransferUser) => u.enabled && u.name !== fromName)
        .map((u: TransferUser) => ({ value: u.name, label: `${u.full_name} (${u.name})` })),
    [users, fromName],
  )
  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.name, label: p.project_name || p.name })),
    [projects],
  )
  const nameFor = (u: string) => users.find((x: TransferUser) => x.name === u)?.full_name ?? u

  // Any selection change invalidates a stale preview.
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
  const blockedAccess = boot !== undefined && !canManageUsers(boot)
  useEffect(() => {
    if (blockedAccess) navigate('/me', { replace: true })
  }, [blockedAccess, navigate])

  if (bootLoading || blockedAccess) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const runPreview = async () => {
    if (!fromName || !toName) return toast('error', 'Pick both a source and target user')
    setPreviewing(true)
    try {
      const res = await mobileApi.transferTasks(fromName, toName, projectName || undefined, true)
      setPreview({ count: res.count ?? 0, blocked: res.blocked_projects ?? [] })
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Preview failed')
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
      ? `in ${projectOptions.find((o) => o.value === projectName)?.label ?? projectName}`
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
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canTransfer = !!preview && preview.count > 0 && preview.blocked.length === 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-6 max-w-2xl"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Transfer Tasks</h1>
        <p className="mt-1 text-sm text-muted">
          Move a user's open tasks to another user — all projects, or one. Completed and
          cancelled tasks stay put.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-card space-y-5">
        {usersQ.isError ? (
          <ErrorState onRetry={() => usersQ.refetch()} />
        ) : usersQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <Field label="From user" required>
              {(id) => (
                <div id={id}>
                  <SearchableSelect
                    value={fromName}
                    onChange={pickFrom}
                    options={fromOptions}
                    placeholder="Search users…"
                  />
                </div>
              )}
            </Field>

            <Field label="To user" required>
              {(id) => (
                <div id={id}>
                  <SearchableSelect
                    value={toName}
                    onChange={pickTo}
                    options={toOptions}
                    placeholder="Search enabled users…"
                  />
                </div>
              )}
            </Field>

            <Field label="Project">
              {(id) => (
                <div id={id}>
                  <SearchableSelect
                    value={projectName}
                    onChange={pickProject}
                    options={projectOptions}
                    placeholder="All projects"
                    allowClear
                  />
                </div>
              )}
            </Field>
          </>
        )}

        {preview && (
          <div
            className={
              preview.blocked.length
                ? 'rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300'
                : 'rounded-xl border border-line bg-hover px-4 py-3 text-sm text-ink'
            }
          >
            {preview.count === 0 ? (
              <span>No open tasks match — nothing to transfer.</span>
            ) : preview.blocked.length ? (
              <span>
                {nameFor(toName)} is not on the team of: <b>{preview.blocked.join(', ')}</b>. Add
                them to those project teams, or pick a project they belong to.
              </span>
            ) : (
              <span>
                <b>{preview.count}</b> open task(s) will move to {nameFor(toName)}.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || !fromName || !toName}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-hover disabled:opacity-60 transition active:scale-[0.99]"
          >
            {previewing ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Preview
          </button>
          <button
            type="submit"
            disabled={submitting || !canTransfer}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition active:scale-[0.99]"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
            Transfer tasks
          </button>
        </div>
      </div>
    </form>
  )
}
