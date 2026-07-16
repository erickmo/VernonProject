export type StatusKey = 'planned' | 'done' | 'checked' | 'completed' | 'cancelled'

export interface Badge {
  tier_name: string
  color: string | null
  icon: string | null
}

export interface Boot {
  user: string
  full_name: string
  image: string | null
  avatar_config?: AvatarConfig | null
  roles: string[]
  is_leader: boolean
  badge?: Badge | null
  vapid_public_key?: string | null
  employee?: EmployeeSoft | null
  settings?: { show_auto_approve?: 0 | 1; app_logo?: string | null }
  leave?: LeaveBalance | null
}

export type NotificationType =
  | 'Assignment'
  | 'Approval'
  | 'Comment'
  | 'Mention'
  | 'Points'
  | 'Redemption'
  | 'Kudos'
  | 'Feedback'
  | 'Deadline'
  | 'Encouragement'
  | 'Attendance'
  | 'Billboard'
  | 'Learning'

export interface AppNotification {
  name: string
  type: NotificationType
  title: string
  body: string | null
  reference_doctype: string | null
  reference_name: string | null
  actor: string | null
  actor_name: string | null
  is_read: boolean
  at: string
  at_human: string | null
}

export interface NotificationsResponse {
  items: AppNotification[]
  unread: number
}

export interface AppRelease {
  version: string
  release_date: string
  title: string
  notes: string
  platform: string
}

export type ReactionKey = 'clap' | 'celebrate' | 'fire' | 'heart'

export interface ReactionCounts {
  clap: number
  celebrate: number
  fire: number
  heart: number
}

export interface ActivityItem {
  name: string
  to_do: string
  project: string
  project_name: string
  assigned_to: string
  assigned_to_name: string
  assigned_to_image: string | null
  assigned_to_avatar_config?: AvatarConfig | null
  completed_at: string | null
  completed_at_human: string | null
  point: number
  reactions: ReactionCounts
  my_reaction: ReactionKey | null
  reactors: string[]
  total: number
  is_mine: boolean
}

export interface ToggleReactionResult {
  reactions: ReactionCounts
  my_reaction: ReactionKey | null
  total: number
}

export interface ProjectItem {
  name: string
  to_do: string
  status: string
  status_key: StatusKey
  modified: string | null
  next_status_label: string | null
  can_advance: boolean
  can_reject: boolean
  auto_approve_mode: 'on' | 'off' | 'inherit'
  auto_approve_effective: boolean
  can_set_auto_approve: boolean
  start_date: string | null
  start_date_human: string | null
  deadline: string | null
  deadline_human: string | null
  is_overdue: boolean
  is_waiting: boolean
  waiting_reason: string | null
  waiting_since: string | null
  waiting_by_name: string | null
  leader_deadline: string | null
  leader_deadline_human: string | null
  owner_deadline: string | null
  owner_deadline_human: string | null
  leader_appr_overdue: boolean
  owner_appr_overdue: boolean
  allocations: { date: string; minutes: number; note?: string }[]
  allocated_total: number
  assigned_allocation: { date: string; minutes: number; note?: string }[]
  assigned_total: number
  today_allocation: number
  estimated: number
  ongoing: boolean
  is_recurring: boolean
  assigned_to: string
  assigned_to_name: string
  assigned_to_image: string | null
  assigned_to_avatar_config?: AvatarConfig | null
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
  is_owner: boolean
  is_leader: boolean
}

export interface TodoFile {
  name: string
  file_name: string
  file_url: string
  file_size: number
  is_private: number
  owner: string
  creation: string
}

export interface ProjectItemDetail extends ProjectItem {
  notes: string
  can_edit_notes: boolean
  can_edit: boolean
  can_edit_files: boolean
  files: TodoFile[]
  can_edit_assigned: boolean
  can_edit_estimate: boolean
  can_delete: boolean
  fields_locked: boolean
  mentor: string
  mentor_name: string
  team: { user: string; name: string; image: string | null; avatar_config?: AvatarConfig | null }[]
  timeline: TimelineEvent[]
  phase_estimates: {
    /** @deprecated covered by the main `estimated` field */
    planned_to_done?: number
    done_to_checked: number
    checked_to_completed: number
    total: number
  }
  recurring: {
    is_recurring: boolean
    frequency: string | null
    interval: number
    weekdays: string
    monthly_mode: string
    day_of_month: number | null
    nth: string
    until: string | null
    paused: boolean
    state: 'active' | 'paused' | 'ended' | null
    next_fire: string | null
  }
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
  level_type?: string
  level_id?: string | null
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
  start_date?: string | null
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
    completed_minutes_today: number
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
  owner_image: string | null
  owner_avatar_config: AvatarConfig | null
  leader_image: string | null
  leader_avatar_config: AvatarConfig | null
  is_owner: boolean
  is_leader: boolean
  is_admin: boolean
  is_member: boolean
  item_total: number
  item_done: number
  minutes_total: number
  minutes_done: number
  overdue: number
  review: number
  progress: number
}

export interface ProjectDetailSummary {
  name: string
  title: string
  total: number
  done: number
  minutes_total: number
  minutes_done: number
  overdue: number
  progress: number
}

export interface TeamMember {
  user: string
  name: string
  image: string | null
  avatar_config?: AvatarConfig | null
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
  reward_type: 'Rupiah' | 'Point' | null
  bonus_amount: number
  discount: number
  total: number
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
  auto_approve: boolean
  can_set_auto_approve: boolean
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
  latest_deadline: string | null
  project_deadline: string | null
  deadline_human: string | null
  project_items: ProjectItem[]
  can_create: boolean
  team: { user: string; name: string; image: string | null; avatar_config?: AvatarConfig | null }[]
  grouping: string
  can_edit: boolean
  groupings: string[]
  glossaries: string[]
  glossary_options: { name: string; glossary: string }[]
  default_group?: string | null
  auto_approve: boolean
  can_set_auto_approve: boolean
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
  /** Users holding the Project Owner role — owner picker only. */
  owners: Opt2[]
  /** Users holding the Project Leader role — leader picker only. */
  leaders: Opt2[]
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
  reward_type?: 'Rupiah' | 'Point'
  bonus_amount?: number
  discount?: number
  team_members?: { user: string }[]
}

export interface ProjectDetailInput {
  project: string
  title: string
  is_pending?: number
  current_condition?: string
  expected_outcome?: string
  keterangan_di_sow?: string
  glossaries?: { glossary: string }[]
}

export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  by_avatar_config?: AvatarConfig | null
  by_badge?: Badge | null
  at: string
  at_human: string
}

export interface MentionUser {
  user: string
  full_name: string
  image: string | null
  avatar_config?: AvatarConfig | null
}

export interface GroupLevel {
  name?: string
  level_id?: string
  type_name: string
  level_name: string
  difficulty_percent: number
  idx?: number
}

export interface ScoringGroup {
  name: string
  group_name: string
  description?: string
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_weight: number
  base_rate_per_minute: number
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
  leader_late_weight: number
  base_rate_per_minute: number
  levels: { name?: string; level_id?: string; type_name: string; level_name: string; difficulty_percent: number }[]
}

export interface Brand {
  name: string
  brand_name: string
  company: string
}

export interface Company {
  name: string
  company_name: string
}

export interface ManagedUser {
  name: string
  full_name: string | null
  enabled: 0 | 1
  user_image: string | null
  avatar_config?: AvatarConfig | null
  last_active: string | null
  roles: string[]
  member_type: string
}

export interface UserFormPayload {
  full_name: string
  roles: string[]
  enabled: 0 | 1
  member_type?: string // optional marking; omit to leave unchanged
}

export type GrantUser = { name: string; full_name: string; user_image?: string | null; avatar_config?: AvatarConfig | null }

export type GiftUser = GrantUser

export type TransferUser = GrantUser & { enabled: 0 | 1 }

export interface Wallet {
  earned: number
  redeemed: number
  balance: number
  today_earned: number
  yesterday_earned: number
}

export interface IncomeOpportunity {
  name: string
  title: string
  description: string | null
  reward: string
  period_start: string | null
  period_end: string | null
  my_claim_status: string | null
}

export interface IncomeClaim {
  name: string
  opportunity: string
  opportunity_title: string
  details: string
  status: string
  review_note: string | null
  at: string
}

export interface IncomeData {
  opportunities: IncomeOpportunity[]
  claims: IncomeClaim[]
}

export interface ManagedOpportunity {
  name: string
  title: string
  description: string | null
  reward: string
  period_start: string | null
  period_end: string | null
  status: string
}

export interface ManagedClaim {
  name: string
  opportunity: string
  opportunity_title: string
  claimed_by: string
  claimed_by_name: string
  details: string
  status: string
  review_note: string | null
  at: string
}

export interface IncomeManageData {
  opportunities: ManagedOpportunity[]
  claims: ManagedClaim[]
}

export interface WalletLogEntry {
  kind: 'credit' | 'debit'
  amount: number
  category?: string
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
  avatar_config?: AvatarConfig | null
  points: number
  rank: number
  badge?: Badge | null
}

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all'
export type LeaderboardDimension = 'productivity' | 'character'

export interface Leaderboard {
  period: LeaderboardPeriod
  brand: string | null
  dimension: LeaderboardDimension
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

export interface BadgeTierInput {
  tier_name: string
  min_points: number
  color: string
  icon: string
}

export interface PersonalNoteItem {
  label: string
  checked: number
  idx?: number
}

export interface PersonalNoteShare {
  user: string
  full_name: string
  image?: string
  avatar_config?: AvatarConfig | null
}

export interface PersonalNote {
  name: string
  title: string
  body: string
  items: PersonalNoteItem[]
  shares: PersonalNoteShare[]
  is_owner: boolean
  can_edit: boolean
  owner_user: string
  owner_name: string
  modified: string
}

export interface DataHealthItem {
  name: string
  to_do: string
  group: string | null
  status: string
  detail: string
}

export interface DataHealth {
  counts: { unmapped: number; outliers: number; missing: number; orphaned: number; total: number }
  unmapped: DataHealthItem[]
  outliers: DataHealthItem[]
  missing: DataHealthItem[]
  orphaned: DataHealthItem[]
}

export interface HomeBanner {
  image: string
  link: string
  is_active: number
}

// Public shape returned to the home carousel (active only, no admin fields).
export interface BannerSlide {
  image: string
  link: string
}

// Home-page danger banner: the caller's most recent scheduled shift day (before
// today) vs the Min Daily Estimated Minutes setting. `under` drives the banner.
export interface PreviousShiftShortfall {
  under: boolean
  date: string | null
  assigned: number
  minimum: number
  expected: number
  today_minimum: number
}

// Advisory returned by assignment_overload_check: would this todo's estimate push the
// assignee's day above their daily minimum + tolerance? `over` drives the picker banner.
export interface AssignmentOverload {
  over: boolean
  assigned: number
  added: number
  minimum: number
  tolerance: number
  user: string
  date: string
}

export interface AppSettings {
  app_logo: string
  max_estimated_minutes: number
  under_occupied_tolerance_minutes: number
  min_minutes_monday: number
  min_minutes_tuesday: number
  min_minutes_wednesday: number
  min_minutes_thursday: number
  min_minutes_friday: number
  min_minutes_saturday: number
  min_minutes_sunday: number
  attendance_enabled: number
  show_auto_approve: number
  qr_validity_seconds: number
  attendance_grace_minutes: number
  late_penalty_per_minute: number
  early_leave_penalty_per_minute: number
  absence_penalty: number
  home_banners: HomeBanner[]
}

export interface MeetingListItem {
  name: string
  title: string
  project: string
  organizer: string
  scheduled_at: string | null
  estimated: number
  point: number
  status: string
  participants: string[]
  can_mark_done: boolean
  notes?: string | null
  group?: string | null
  level_id?: string | null
}

export interface MeetingInvitableUser {
  user: string
  full_name: string
}

export type StyleKey = 'lorelei' | 'notionists' | 'notionistsNeutral' | 'croodles' | 'croodlesNeutral' | 'bigEars' | 'openPeeps'
export interface AvatarConfig {
  style: StyleKey
  options: Record<string, string[]>
  scene?: string | null
  props?: string[]
  featured_collectible?: string | null
}
export interface AvatarUnlock { style: string; slot: string; option_value: string }
export interface AvatarAsset {
  asset_name: string
  asset_type: 'Scene' | 'Prop' | 'Collectible'
  emoji: string | null
  icon?: string | null
  image?: string | null
  gradient: string | null
  anchor: string | null
  set_name?: string | null
  earn_only?: number
  is_default: number
  price: number | null
  owned: boolean
}
export interface AvatarCatalog {
  free_count: number
  price: number
  balance: number
  unlocked: AvatarUnlock[]
  my: AvatarConfig
  assets: AvatarAsset[]
  sets?: { name: string; owned: number; total: number }[]
}

export interface CrateStatus {
  keys: number
  key_cost: number
  progress: number
  progress_pct: number
  daily_cap: number
  opened_today: number
  remaining: number
}
export interface SetCompletion { set: string; capstone: string; rebate: number }
export interface CrateOpenResult {
  asset: Pick<AvatarAsset, 'asset_name' | 'asset_type' | 'emoji' | 'icon' | 'image' | 'gradient'>
  keys_left: number
  remaining: number
  completed?: SetCompletion | null
}

export type FeedbackItem = {
  name: string
  feedback_type: string
  message: string
  status: string
  is_anonymous: boolean
  submitter: string
  at: string
  at_human: string
  linked_todo?: string | null
}

export interface Achievement {
  code: string
  title: string
  icon: string
  color?: string
  condition: string
  threshold: number
  progress: number
  met: boolean
  claimed: boolean
  reward_points: number
  reward_asset: string | null
  is_tier?: number
}

export interface Gamification {
  level: number
  lifetime: number
  points_per_level: number
  xp_into: number
  xp_to_next: number
  balance: number
  newly_granted: { kind: string; level?: number; code?: string; asset: string; points: number }[]
  achievements: Achievement[]
  daily: { streak: number; can_claim: boolean; claimable: number; last_claim: string | null }
}

export type TeamWallUser = {
  name: string
  full_name: string | null
  user_image: string | null
  avatar_config?: AvatarConfig | null
}

export type TeamWallResponse = { users: TeamWallUser[] }

export interface EventItem {
  name: string
  title: string
  description?: string
  cover_image?: string
  organizer?: string
  start_datetime: string
  end_datetime?: string
  location?: string
  pricing: 'Free' | 'Points' | 'Rupiah'
  points_cost?: number
  price?: number
  capacity?: number
  registered_count: number
  is_full: boolean
  my_status: 'Pending' | 'Confirmed' | 'Cancelled' | null
  category?: string
  is_featured?: boolean
  parent_event?: string
  sub_events?: EventItem[]
}

export interface EventRegistration {
  name: string
  event: string
  event_title?: string
  start_datetime?: string
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  method: 'Free' | 'Points' | 'Rupiah'
  amount?: number
}

export interface PayConfig { client_key: string; snap_js: string }

export interface RegisterResult {
  registration: string
  status: 'Confirmed' | 'Pending'
  balance?: number | null
  snap_token?: string
  order_id?: string
}

export interface ManagedEvent {
  name: string
  title: string
  start_datetime: string
  status: string
  pricing: 'Free' | 'Points' | 'Rupiah'
  capacity?: number
  registered_count: number
}

export interface RosterEntry {
  name: string
  user: string
  full_name: string
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  method: 'Free' | 'Points' | 'Rupiah'
  amount?: number
  attended: number
  registered_on?: string
}

export interface EventFormPayload {
  title: string
  description?: string
  cover_image?: string | null
  start_datetime: string
  end_datetime?: string | null
  location?: string
  capacity: number
  pricing: 'Free' | 'Points' | 'Rupiah'
  points_cost?: number
  price?: number
  status: string
  category?: string
  is_featured?: boolean
  parent_event?: string | null
}

export interface MeetingRoom {
  name: string
  room_name: string
  capacity?: number
  location?: string
  is_active?: 0 | 1
}

export interface Equipment {
  name: string
  equipment_name: string
  category?: string
  is_active?: 0 | 1
}

export interface BookingEquipmentRow {
  equipment: string
}

export interface Booking {
  name: string
  title: string
  booked_by: string
  /** Frappe datetime 'YYYY-MM-DD HH:MM:SS' */
  start: string
  end: string
  room?: string
  status: 'Confirmed' | 'Cancelled'
  notes?: string
  /** present only on single-doc fetch */
  equipment?: BookingEquipmentRow[]
}

export interface Conflict {
  resource_type: 'Room' | 'Equipment'
  resource: string
  booking: string
  title: string
  start: string
  end: string
}

export type EmployeeChildEducation = { level?: string; institution?: string; major?: string; year?: number }
export type EmployeeChildSkill = { skill: string; proficiency?: string }
export type EmployeeChildTraining = { title: string; provider?: string; training_date?: string; certificate?: string; expiry_date?: string }

export type EmployeeSoft = {
  phone?: string; birthdate?: string; bio?: string;
  home_address?: string;
  emergency_contact_name?: string; emergency_contact_phone?: string; emergency_contact_relation?: string;
  education?: EmployeeChildEducation[]; skills?: EmployeeChildSkill[]; trainings?: EmployeeChildTraining[];
  religion?: string; verse_enabled?: 0 | 1;
  gender?: 'Male' | 'Female';
}

export type DailyVerse = { reference: string; text: string } | null

export type LeaveBalance = { quota: number; used: number; remaining: number; prior?: number }

// Admin view adds the sensitive fields:
export type EmployeeProfileAdmin = EmployeeSoft & {
  full_name?: string;
  nik_ktp?: string; npwp?: string; bpjs_kesehatan?: string; bpjs_ketenagakerjaan?: string;
  bank_name?: string; bank_account_no?: string; bank_account_holder?: string;
  employment_status?: string; job_title?: string; date_joined?: string;
  contract_start?: string; contract_end?: string; annual_leave_quota?: number; prior_leave_taken?: number;
  leave?: LeaveBalance | null;
}

export type ExceptionDecision = 'Pending' | 'Approved' | 'Rejected'

export type ExceptionApprover = {
  approver: string
  decision: ExceptionDecision
  /** Set only when the leader objected. */
  reason?: string
}

export type AttendanceExceptionRow = {
  name: string
  employee: string
  exception_type: 'WFH' | 'Leave'
  from_date: string
  to_date: string
  /** Mirrors hr_decision. HR is the final approver; leader votes are advisory. */
  status: ExceptionDecision
  reason?: string
  approvers: ExceptionApprover[]
  approved_count: number
  total: number
  hr_decision: ExceptionDecision
  hr_by?: string
  hr_reason?: string
  leave_type?: string
}

export type LeaveType = {
  name: string
  leave_name: string
  limit_kind: 'Annual Quota' | 'Per Event' | 'Documented'
  day_limit: number
  gender: 'Any' | 'Male' | 'Female'
  requires_proof: 0 | 1
  paid: 0 | 1
  is_default_annual: 0 | 1
  description?: string
  sort_order: number
}

// ---- Papan Iklan (classified ads) ----
export type AdType = 'Sell' | 'Buy' | 'Rent'
export type AdStatus = 'Active' | 'Fulfilled' | 'Removed'

export interface AdListItem {
  name: string
  title: string
  ad_type: AdType
  price: number | null
  rate_period: string | null
  status: AdStatus
  author: string
  author_name: string
  thumbnail: string | null
  at: string
}

export interface AdDetail {
  name: string
  title: string
  ad_type: AdType
  description: string | null
  price: number | null
  rate_period: string | null
  contact: string
  status: AdStatus
  author: string
  author_name: string
  author_image: string | null
  photos: string[]
  is_owner: boolean
  is_admin: boolean
}

export interface AdPayload {
  title: string
  ad_type: AdType
  description: string
  price: number
  rate_period: string
  contact: string
  photos: string[]
}

export interface AdBan {
  name: string
  user: string
  user_name: string
  banned_until: string
  reason: string
  banned_by: string
}

export interface LmsCourseCard {
  name: string; title: string; category: string | null; summary: string | null
  cover_image: string | null; points_reward: number; estimated_minutes: number | null
  lesson_count: number; my_status: string | null; my_progress: number
}
export interface LmsLessonFile { file: string; label: string | null }
export interface LmsLessonView {
  name: string; title: string; position: number; body: string | null
  video_url: string | null; estimated_minutes: number | null
  files: LmsLessonFile[]; done: boolean
}
export interface LmsCourseDetail {
  course: { name: string; title: string; category: string | null; summary: string | null
    description: string | null; cover_image: string | null; points_reward: number
    estimated_minutes: number | null; status: string }
  lessons: LmsLessonView[]
  enrollment: { name: string; assigned: number; due_date: string | null; status: string
    progress_pct: number; completed_on: string | null } | null
}
export interface LmsMyEnrollment {
  name: string; course: string; course_title: string; assigned: number
  due_date: string | null; status: string; progress_pct: number
  overdue: boolean; completed_on: string | null
}
export interface LmsManagedCourse {
  name: string; title: string; category: string | null; status: string
  points_reward: number; lesson_count: number; enrolled: number; completed: number
}
export interface LmsReportRow {
  user: string; user_name: string; assigned: number; due_date: string | null
  status: string; progress_pct: number; overdue: boolean; completed_on: string | null
}
export interface LmsCompleteResult {
  ok: boolean; progress_pct: number; completed: boolean; points_awarded: number
}
export interface LmsAssignableUser { name: string; full_name: string | null }

export type LogbookResult = 'approved' | 'rejected' | 'pending'
export interface LogbookPlanItem { todo: string; to_do: string; project_detail: string; project_name: string; planned_minutes: number; estimated: number; deadline: string | null }
export interface LogbookCompletedItem { todo: string; to_do: string; project_detail: string; project_name: string; estimated: number; deadline: string | null; done_on: string; late_days: number; early_days: number; status: string; result: LogbookResult; points: number }
export interface LogbookDay { date: string; plan: LogbookPlanItem[]; completed: LogbookCompletedItem[] }
export interface LogbookSummary { planned_minutes: number; done_minutes_estimated: number; todos_planned: number; todos_done: number; on_time: number; late: number; early: number; approved: number; rejected: number; pending: number; points_earned: number; on_time_rate: number }
export interface LogbookResponse { from_date: string; to_date: string; user: string; full_name: string; dates: string[]; days: LogbookDay[]; summary: LogbookSummary }
export interface WebsiteBranding { appName: string; logoUrl: string | null }
