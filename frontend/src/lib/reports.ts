import { TrendingUp, ListTodo, CalendarClock, ClipboardList, Activity } from 'lucide-react'

export type ControlType = 'project' | 'person' | 'daterange' | 'status'
export type StatusSet = 'todo' | 'pd' | 'perf'

export interface ReportControl {
  type: ControlType
  key: string // the filter fieldname the report expects
  label: string
  required?: boolean
  defaultUser?: boolean // person: prefill with the logged-in user
  statusSet?: StatusSet // status: which option set to use
  defaultIndex?: number // status: index in the set to default to
  multi?: boolean // status: allow selecting several statuses (toggle)
  defaultPreset?: string // daterange: preset value to default to
  maxDays?: number // daterange: hide presets longer than this
}

export interface ReportDef {
  name: string
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  controls: ReportControl[]
}

export const REPORTS: ReportDef[] = [
  {
    name: 'Progress Report',
    title: 'Progress',
    desc: 'Work developed, tested & completed over a period',
    icon: TrendingUp,
    accent: 'from-emerald-500 to-teal-600',
    controls: [
      { type: 'person', key: 'user', label: 'Person', defaultUser: true },
      { type: 'project', key: 'project', label: 'Project' },
      { type: 'daterange', key: 'date_range', label: 'Period' },
    ],
  },
  {
    name: 'Todo Report',
    title: 'Open Tasks',
    desc: 'Ongoing tasks with deadlines & notes',
    icon: ListTodo,
    accent: 'from-brand-500 to-brand-700',
    controls: [
      { type: 'project', key: 'project', label: 'Project' },
      { type: 'person', key: 'assigned_to', label: 'Assigned to' },
      { type: 'status', key: 'status', label: 'Detail status', statusSet: 'pd', defaultIndex: 0, multi: true },
      { type: 'status', key: 'todo_status', label: 'Task status', statusSet: 'todo', defaultIndex: 0, multi: true },
      { type: 'daterange', key: 'date_range', label: 'Deadline range' },
    ],
  },
  {
    name: 'Project Todo Deadline Report',
    title: 'Deadlines',
    desc: 'Task deadlines for a specific project',
    icon: CalendarClock,
    accent: 'from-amber-500 to-orange-600',
    controls: [
      { type: 'project', key: 'project', label: 'Project', required: true },
      { type: 'status', key: 'status', label: 'Task status', statusSet: 'todo', defaultIndex: 0, multi: true },
      { type: 'person', key: 'assigned_to', label: 'Assigned to' },
    ],
  },
  {
    name: 'Daily Assignment Report',
    title: 'Daily Assignment',
    desc: "A person's tasks at a given status",
    icon: ClipboardList,
    accent: 'from-sky-500 to-blue-600',
    controls: [
      { type: 'person', key: 'assigned_to', label: 'Person', required: true, defaultUser: true },
      { type: 'status', key: 'status', label: 'Task status', statusSet: 'todo', defaultIndex: 0, multi: true },
    ],
  },
  {
    name: 'Daily Performance Report',
    title: 'Daily Performance',
    desc: 'Work a person moved forward in a date range',
    icon: Activity,
    accent: 'from-violet-500 to-fuchsia-600',
    controls: [
      { type: 'person', key: 'assigned_to', label: 'Person', required: true, defaultUser: true },
      { type: 'status', key: 'status', label: 'Stage', statusSet: 'perf', defaultIndex: 0 },
      {
        type: 'daterange',
        key: 'date_range',
        label: 'Period (max 120 days)',
        required: true,
        defaultPreset: '30d',
        maxDays: 120,
      },
    ],
  },
]

export function reportByName(name: string): ReportDef | undefined {
  return REPORTS.find((r) => r.name === name)
}

// ---- Date-range presets -------------------------------------------------------

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface DatePreset {
  value: string
  label: string
  days: number
  range: () => [string, string]
}

export const DATE_PRESETS: DatePreset[] = [
  { value: 'today', label: 'Today', days: 1, range: () => { const d = new Date(); return [iso(d), iso(d)] } },
  {
    value: '7d',
    label: 'Last 7 days',
    days: 7,
    range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); return [iso(from), iso(to)] },
  },
  {
    value: '30d',
    label: 'Last 30 days',
    days: 30,
    range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); return [iso(from), iso(to)] },
  },
  {
    value: '90d',
    label: 'Last 90 days',
    days: 90,
    range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 89); return [iso(from), iso(to)] },
  },
  {
    value: 'month',
    label: 'This month',
    days: 31,
    range: () => { const now = new Date(); return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)] },
  },
  {
    value: 'year',
    label: 'This year',
    days: 366,
    range: () => { const now = new Date(); return [iso(new Date(now.getFullYear(), 0, 1)), iso(now)] },
  },
]
