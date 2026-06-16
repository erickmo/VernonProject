export type StatusKey = 'planned' | 'done' | 'checked' | 'completed'

export interface Boot {
  user: string
  full_name: string
  image: string | null
  roles: string[]
  is_leader: boolean
}

export interface Todo {
  name: string
  to_do: string
  status: string
  status_key: StatusKey
  next_status_label: string | null
  can_advance: boolean
  deadline: string | null
  deadline_human: string | null
  is_overdue: boolean
  estimated: number
  ongoing: boolean
  is_recurring: boolean
  assigned_to: string
  assigned_to_name: string
  assigned_to_image: string | null
  work_item: string
  work_item_title: string
  project: string
  project_name: string
  brand: string | null
  project_owner: string | null
  project_owner_name: string | null
  project_leader: string | null
  project_leader_name: string | null
  is_mine: boolean
}

export interface TodoDetail extends Todo {
  notes: string
  can_edit_notes: boolean
  can_edit: boolean
  fields_locked: boolean
  team: { user: string; name: string; image: string | null }[]
  timeline: TimelineEvent[]
  phase_estimates: {
    planned_to_done: number
    done_to_checked: number
    checked_to_completed: number
    total: number
  }
  recurring: { is_recurring: boolean; frequency: string | null; until: string | null }
  occurrences: {
    name: string
    status_key: StatusKey
    deadline: string | null
    deadline_human: string | null
    is_current: boolean
  }[]
  is_missed: boolean
}

export interface TodoEdit {
  to_do?: string
  deadline?: string | null
  estimated?: number
  assigned_to?: string
}

export interface TimelineEvent {
  label: string
  by: string
  by_name: string
  at: string
  at_human: string
}

export interface Dashboard {
  counts: {
    overdue: number
    due_today: number
    upcoming: number
    review: number
    completed_today: number
  }
  overdue: Todo[]
  due_today: Todo[]
  upcoming: Todo[]
  review: Todo[]
}

export interface ProjectCard {
  name: string
  project_name: string
  status: string
  customer: string
  start_date: string | null
  deadline: string | null
  goal: string | null
  project_owner: string
  project_leader: string
  owner_name: string
  leader_name: string
  is_owner: boolean
  is_leader: boolean
  is_admin: boolean
  is_member: boolean
  todo_total: number
  todo_done: number
  overdue: number
  review: number
  progress: number
}

export interface WorkItemSummary {
  name: string
  title: string
  total: number
  done: number
  overdue: number
  progress: number
}

export interface TeamMember {
  user: string
  name: string
  image: string | null
  open_todos: number
}

export interface ProjectDetail {
  name: string
  project_name: string
  status: string
  customer: string
  goal: string | null
  start_date: string | null
  deadline: string | null
  owner_name: string
  leader_name: string
  project_owner: string
  project_leader: string
  project_admin: string | null
  project_group: string
  groupings: string[]
  work_items: WorkItemSummary[]
  team: TeamMember[]
}

export interface WorkItem {
  name: string
  title: string
  project: string
  project_name: string
  status: string
  current_condition: string | null
  expected_outcome: string | null
  todos: Todo[]
  can_create: boolean
  team: { user: string; name: string; image: string | null }[]
  grouping: string
  can_edit: boolean
  groupings: string[]
}

export interface Group {
  name: string
  glossary: string
  description: string | null
}

export interface Opt2 {
  value: string
  label: string
}

export interface FormOptions {
  customers: Opt2[]
  users: Opt2[]
  project_groups: Opt2[]
}

export interface ProjectInput {
  project_name: string
  customer: string
  project_owner: string
  project_leader: string
  project_admin?: string | null
  project_group: string
  start_date: string
  deadline: string
  goal?: string
  status: string
  team_members?: { user: string }[]
}

export interface WorkItemInput {
  project: string
  title: string
  project_deadline: string
  grouping: string
  status?: string
}
