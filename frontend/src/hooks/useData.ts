import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { mobileApi, resource } from '@/lib/api'
import type {
  Boot,
  Dashboard,
  FormOptions,
  Group,
  MemberTodo,
  ProjectCard,
  ProjectDetail,
  ProjectInput,
  TodoDetail,
  WorkItem,
  WorkItemInput,
} from '@/lib/types'

export const keys = {
  boot: ['boot'] as const,
  dashboard: ['dashboard'] as const,
  projects: ['projects'] as const,
  project: (n: string) => ['project', n] as const,
  workItem: (n: string) => ['work-item', n] as const,
  todo: (n: string) => ['todo', n] as const,
  memberWorkload: (p: string, u: string, c: boolean) =>
    ['member-workload', p, u, c] as const,
}

export const useBoot = () =>
  useQuery({ queryKey: keys.boot, queryFn: () => mobileApi.bootstrap() as Promise<Boot>, retry: false })

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => mobileApi.dashboard() as Promise<Dashboard> })

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: () => mobileApi.projects() as Promise<ProjectCard[]> })

export const useProject = (name: string) =>
  useQuery({
    queryKey: keys.project(name),
    queryFn: () => mobileApi.project(name) as Promise<ProjectDetail>,
    enabled: !!name,
  })

export const useMemberWorkload = (
  project: string,
  user: string | null,
  includeCompleted: boolean,
) =>
  useQuery({
    queryKey: keys.memberWorkload(project, user ?? '', includeCompleted),
    queryFn: () =>
      mobileApi.memberWorkload(project, user as string, includeCompleted) as Promise<MemberTodo[]>,
    enabled: !!project && !!user,
  })

export const useWorkItem = (name: string) =>
  useQuery({
    queryKey: keys.workItem(name),
    queryFn: () => mobileApi.workItem(name) as Promise<WorkItem>,
    enabled: !!name,
  })

export const useTodo = (name: string) =>
  useQuery({
    queryKey: keys.todo(name),
    queryFn: () => mobileApi.todo(name) as Promise<TodoDetail>,
    enabled: !!name,
  })

// Advance a todo's status one step. Returns the server message so the caller
// can surface success/permission feedback via toast.
export function useAdvanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (todoId: string) => {
      const res = await mobileApi.advanceStatus(todoId)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['work-item'] })
      qc.invalidateQueries({ queryKey: ['todo'] })
    },
  })
}

export interface Opt {
  value: string
  label: string
}
export interface ReportOptions {
  projects: Opt[]
  users: Opt[]
  todo_statuses: Opt[]
  pd_statuses: Opt[]
  perf_statuses: Opt[]
}
export interface ReportResult {
  columns: { label: string; fieldname: string; fieldtype: string }[]
  rows: Record<string, unknown>[]
  total: number
  messages: string[]
}

export const useReportOptions = () =>
  useQuery({
    queryKey: ['report-options'],
    queryFn: () => mobileApi.reportOptions() as Promise<ReportOptions>,
    staleTime: 1000 * 60 * 10,
  })

export const useReport = (report: string, filters: Record<string, unknown>, enabled: boolean) =>
  useQuery({
    queryKey: ['report', report, filters],
    queryFn: () => mobileApi.runReport(report, filters) as Promise<ReportResult>,
    enabled,
    staleTime: 1000 * 30,
  })

export function useUpdateTodo(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const res = await mobileApi.updateTodo(todoId, fields)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.todo(todoId) })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: ['work-item'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useCreateTask(workItem: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      mobileApi.createTask({ parent: workItem, ...fields }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workItem(workItem) })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useSaveNotes(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notes: string) => {
      const res = await mobileApi.saveNotes(todoId, notes)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todo(todoId) }),
  })
}

export function permFlags(project: ProjectDetail, boot: Boot | undefined) {
  const me = boot?.user
  const isSM = !!boot?.roles.includes('System Manager')
  const isOwner = !!me && me === project.project_owner
  const isLeader = !!me && me === project.project_leader
  return {
    can_edit: isSM || isOwner || isLeader,
    can_delete: isSM || isOwner,
    can_reassign: isSM || isOwner,
  }
}

export function canCreateProject(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('Project Owner'))
}

export function useFormOptions() {
  return useQuery({
    queryKey: ['form-options'],
    // Options come from a whitelisted method, not /api/resource: the User
    // doctype is readable only by System Manager, so a raw resource list of
    // users 403s for project leads. get_form_options uses frappe.get_all
    // server-side, which bypasses the per-doctype read gate.
    queryFn: () => mobileApi.formOptions() as Promise<FormOptions>,
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      resource.create<{ name: string }>('Project', input as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useUpdateProject(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) =>
      resource.update<{ name: string }>('Project', project, input as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project: string) => resource.remove('Project', project),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useCreateWorkItem(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<WorkItemInput, 'project'>) => {
      const existing = await resource.list<{ name: string }[]>('Glossary', {
        filters: [
          ['glossary', '=', input.grouping],
          ['project', '=', project],
        ],
        fields: ['name'],
        limit: 1,
      })
      let groupingName = existing[0]?.name
      if (!groupingName) {
        const created = await resource.create<{ name: string }>('Glossary', {
          glossary: input.grouping,
          project,
        })
        groupingName = created.name
      }
      return resource.create<{ name: string }>('Project Detail', {
        project,
        title: input.title,
        project_deadline: input.project_deadline,
        grouping: groupingName,
        ...(input.status ? { status: input.status } : {}),
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
    },
  })
}

export function useUpdateWorkItem(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      resource.update<{ name: string }>('Project Detail', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workItem(name) })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Project Detail', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useGroups(project: string, enabled = true) {
  return useQuery({
    queryKey: ['groups', project],
    queryFn: () =>
      resource.list<Group[]>('Glossary', {
        filters: [['project', '=', project]],
        fields: ['name', 'glossary', 'description'],
      }),
    enabled: !!project && enabled,
  })
}

export function useCreateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { glossary: string; description?: string }) =>
      resource.create<{ name: string }>('Glossary', { ...input, project }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useUpdateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, ...fields }: { name: string; glossary?: string; description?: string }) =>
      resource.update<{ name: string }>('Glossary', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Glossary', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}
