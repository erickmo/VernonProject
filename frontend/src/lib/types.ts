export type StatusKey = 'planned' | 'done' | 'checked' | 'completed'

export interface Boot {
  user: string
  full_name: string
  image: string | null
  roles: string[]
  is_leader: boolean
}

export interface ProjectItem {
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
  project_detail: string
  project_detail_title: string
  project: string
  project_name: string
  brand: string | null
  project_owner: string | null
  project_owner_name: string | null
  project_leader: string | null
  project_leader_name: string | null
  is_mine: boolean
}

export interface ProjectItemDetail extends ProjectItem {
  notes: string
  can_edit_notes: boolean
  can_edit: boolean
  fields_locked: boolean
  team: { user: string; name: string; image: string | null }[]
  timeline: TimelineEvent[]
  phase_estimates: {
    /** @deprecated covered by the main `estimated` field */
    planned_to_done?: number
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

export interface ProjectItemEdit {
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
  overdue: ProjectItem[]
  due_today: ProjectItem[]
  upcoming: ProjectItem[]
  review: ProjectItem[]
}

export interface ProjectCard {
  name: string
  project_name: string
  status: string
  brand: string
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
  item_total: number
  item_done: number
  overdue: number
  review: number
  progress: number
}

export interface ProjectDetailSummary {
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
  is_owner: boolean
  is_leader: boolean
  is_member: boolean
}

export interface MemberTodo {
  name: string
  to_do: string
  status: string
  status_key: string
  deadline: string | null
  deadline_human: string | null
  is_overdue: boolean
  project_detail: string
  project_detail_title: string
}

export interface ProjectFull {
  name: string
  project_name: string
  status: string
  brand: string
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
  project_details: ProjectDetailSummary[]
  team: TeamMember[]
}

export interface ProjectDetail {
  name: string
  title: string
  project: string
  project_name: string
  status: string
  current_condition: string | null
  expected_outcome: string | null
  project_items: ProjectItem[]
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
  brands: Opt2[]
  users: Opt2[]
  project_groups: Opt2[]
}

export interface ProjectInput {
  project_name: string
  brand: string
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

export interface ProjectDetailInput {
  project: string
  title: string
  project_deadline: string
  grouping: string
  status?: string
}

export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  at: string
  at_human: string
}

export interface GroupLevel {
  name?: string
  level_name: string
  point: number
}

export interface ScoringGroup {
  name: string
  group_name: string
  description?: string
  weight: number
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: GroupLevel[]
}

export interface ScoringGroupPayload {
  group_name: string
  description?: string
  weight: number
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: { level_name: string; point: number }[]
}

export interface Brand {
  name: string
  brand_name: string
}
