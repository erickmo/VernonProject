export type StatusKey = 'planned' | 'done' | 'checked' | 'completed' | 'cancelled'

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
  leader_deadline: string | null
  leader_deadline_human: string | null
  owner_deadline: string | null
  owner_deadline_human: string | null
  leader_appr_overdue: boolean
  owner_appr_overdue: boolean
  allocations: { date: string; minutes: number; note?: string }[]
  allocated_total: number
  today_allocation: number
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
  group?: string | null
  level?: string | null
  point?: number
  assignee_earned?: number
  leader_earned?: number
  blocked_by: string[]
  blocking: string[]
  detail_todos: { name: string; to_do: string }[]
  cancellation_reason?: string | null
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
  blocked_by: string | null
  blocked_by_name: string | null
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
  is_pending: number
  current_condition: string | null
  expected_outcome: string | null
  keterangan_di_sow: string | null
  discount: number | null
  price: number | null
  latest_deadline: string | null
  project_deadline: string | null
  deadline_human: string | null
  project_items: ProjectItem[]
  can_create: boolean
  team: { user: string; name: string; image: string | null }[]
  grouping: string
  can_edit: boolean
  groupings: string[]
  glossaries: string[]
  glossary_options: { name: string; glossary: string }[]
  default_group?: string | null
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
}

export interface ProjectInput {
  project_name: string
  brand: string
  project_owner: string
  project_leader: string
  project_admin?: string | null
  blocked_by?: string | null
  start_date: string
  deadline: string
  goal?: string
  status: string
  team_members?: { user: string }[]
}

export interface ProjectDetailInput {
  project: string
  title: string
  is_pending?: number
  current_condition?: string
  expected_outcome?: string
  keterangan_di_sow?: string
  discount?: number
  price?: number
  glossaries?: { glossary: string }[]
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
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: GroupLevel[]
}

export interface GroupTodo {
  name: string
  to_do: string
  status: string
  project: string
  deadline: string | null
}

export interface ScoringGroupPayload {
  group_name: string
  description?: string
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

export interface ManagedUser {
  name: string
  full_name: string | null
  enabled: 0 | 1
  user_image: string | null
  last_active: string | null
  roles: string[]
}

export interface UserFormPayload {
  full_name: string
  roles: string[]
  enabled: 0 | 1
}

export type GrantUser = { name: string; full_name: string; user_image?: string | null }

export type GiftUser = GrantUser

export interface Wallet {
  earned: number
  redeemed: number
  balance: number
  today_earned: number
  yesterday_earned: number
}

export interface WalletLogEntry {
  kind: 'credit' | 'debit'
  amount: number
  title: string
  subtitle: string | null
  status: string | null
  date: string | null
  date_human: string | null
  balance: number
}

export interface LeaderboardEntry {
  user: string
  full_name: string
  image: string | null
  points: number
  rank: number
}

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all'

export interface Leaderboard {
  period: LeaderboardPeriod
  brand: string | null
  brands: string[]
  entries: LeaderboardEntry[]
  me: LeaderboardEntry | null
}

export interface MarketplaceReward {
  name: string
  reward_name: string
  point_cost: number
  image: string | null
  description: string | null
  stock_quantity: number
}

export interface MarketplaceData {
  balance: number
  rewards: MarketplaceReward[]
}

export interface AdminReward {
  name: string
  reward_name: string
  point_cost: number
  stock_quantity: number
  active: 0 | 1
  image: string | null
  description?: string | null
}

export interface AdminRedemption {
  name: string
  user: string
  user_name: string
  reward_name: string
  point_cost: number
  status: 'Pending' | 'Fulfilled'
  redeemed_on: string | null
  redeemed_on_human: string | null
  fulfilled_on: string | null
}

export interface RewardFormPayload {
  reward_name: string
  point_cost: number
  stock_quantity: number
  active: 0 | 1
  description?: string
  image?: string | null
}
