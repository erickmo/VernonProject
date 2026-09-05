import type { AiPhase, ProjectItem, ProjectCard } from './types'
import type { SelectOption } from '../components/SearchableSelect'

/** Case-insensitive substring test. Empty/whitespace query matches everything. */
export function matchText(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return haystack.toLowerCase().includes(q)
}

/**
 * Case-insensitive substring match across a todo's searchable fields.
 * Empty/whitespace query matches everything. Shared by mobile Today, plan-day,
 * global search overlay, and (via a locally-built haystack) the web command palette.
 */
export function matchProjectItem(t: ProjectItem, query: string): boolean {
  return matchText(
    [
      t.to_do,
      t.project_name,
      t.project,
      t.brand,
      t.project_detail_title,
      t.project_owner_name,
      t.project_leader_name,
      t.assigned_to_name,
      t.status,
    ]
      .filter(Boolean)
      .join(' '),
    query,
  )
}

/** Case-insensitive match across a project's searchable fields. */
export function matchProject(p: ProjectCard, query: string): boolean {
  return matchText([p.project_name, p.name, p.brand, p.owner_name, p.leader_name, p.status].filter(Boolean).join(' '), query)
}

/** A distinct project-detail (work item), derived from the todo set. */
export interface ProjectDetailHit {
  name: string
  title: string
  project: string
  project_name: string
  brand: string | null
  open: boolean // has at least one open (not completed/cancelled) todo
}

/** A todo is "open" (ongoing) while it is neither owner-approved nor cancelled. */
export function todoIsOpen(t: ProjectItem): boolean {
  return t.status_key !== 'completed' && t.status_key !== 'cancelled'
}

/**
 * Distinct project-details (work items) present in a todo set, deduped by id.
 * Lets global search surface work items without a dedicated endpoint — every
 * todo already carries its parent detail's id/title/project. `open` aggregates
 * across the detail's todos (open if any child todo is still open).
 */
export function projectDetailsFromTodos(todos: ProjectItem[]): ProjectDetailHit[] {
  const seen = new Map<string, ProjectDetailHit>()
  for (const t of todos) {
    if (!t.project_detail) continue
    const existing = seen.get(t.project_detail)
    if (existing) {
      existing.open = existing.open || todoIsOpen(t)
    } else {
      seen.set(t.project_detail, {
        name: t.project_detail,
        title: t.project_detail_title,
        project: t.project,
        project_name: t.project_name,
        brand: t.brand,
        open: todoIsOpen(t),
      })
    }
  }
  return [...seen.values()]
}

/** Case-insensitive match across a work item's searchable fields. */
export function matchProjectDetail(d: ProjectDetailHit, query: string): boolean {
  return matchText([d.title, d.project_name, d.brand].filter(Boolean).join(' '), query)
}

/** Ongoing/done status filter shared by the global search surfaces. */
export type SearchScope = 'all' | 'ongoing' | 'done'

export function todoInScope(t: ProjectItem, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? todoIsOpen(t) : t.status_key === 'completed'
}

/** Projects use a text status: 'Ongoing' active, 'Closed' done. */
export function projectInScope(p: ProjectCard, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? p.status === 'Ongoing' : p.status === 'Closed'
}

export function detailInScope(d: ProjectDetailHit, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? d.open : !d.open
}

export const ESTIMATE_OPTIONS = [
  { value: 'none', label: 'No estimate' },
  { value: 'lt30', label: 'Under 30m' },
  { value: '30to120', label: '30m – 2h' },
  { value: 'gt120', label: 'Over 2h' },
]

export function matchEstimate(bucket: string, minutes: number): boolean {
  if (!bucket) return true
  switch (bucket) {
    case 'none':
      return !minutes
    case 'lt30':
      return minutes > 0 && minutes < 30
    case '30to120':
      return minutes >= 30 && minutes <= 120
    case 'gt120':
      return minutes > 120
    default:
      return true
  }
}

/** Build unique {value,label,count} options from a list, via accessors. */
export function buildOptions<T>(
  items: T[],
  getValue: (i: T) => string | null | undefined,
  getLabel: (i: T) => string | null | undefined,
  getKeywords?: (i: T) => string | null | undefined,
): { value: string; label: string; count: number; keywords?: string }[] {
  const map = new Map<string, { label: string; count: number; kw: Set<string> }>()
  for (const it of items) {
    const v = getValue(it)
    if (!v) continue
    const label = getLabel(it) || v
    const kw = getKeywords?.(it)
    const cur = map.get(v)
    if (cur) {
      cur.count++
      if (kw) cur.kw.add(kw)
    } else map.set(v, { label, count: 1, kw: new Set(kw ? [kw] : []) })
  }
  return [...map.entries()]
    .map(([value, { label, count, kw }]) => ({
      value,
      label,
      count,
      keywords: kw.size ? [...kw].join(' ') : undefined,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

// Dashboard by-project view column/pane count bounds — shared by the web
// ThreeColProjectList columns and the mobile SwipeProjectLists carousel. Total
// columns incl. the leading "all" column; the user can grow it within this range.
export const MIN_COLS = 4
export const MAX_COLS = 8

export interface DetailGroup {
  key: string
  project: string
  projectName: string
  detailTitle: string
  todos: ProjectItem[]
}

/**
 * Bucket todos by project DETAIL (not the whole project), first-seen order.
 * Detail-less todos fall back to a project-level bucket. Shared by the web
 * ThreeColProjectList columns and the mobile SwipeProjectLists carousel so
 * picking one detail focuses just that detail's todos.
 */
export function groupByDetail(todos: ProjectItem[]): DetailGroup[] {
  const map = new Map<string, DetailGroup>()
  for (const t of todos) {
    const key = t.project_detail || t.project || t.project_name || '—'
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        project: t.project || t.project_name || '—',
        projectName: t.project_name || t.project || '—',
        detailTitle: t.project_detail_title || '',
        todos: [],
      }
      map.set(key, g)
    }
    g.todos.push(t)
  }
  return [...map.values()]
}

/**
 * Focus-picker options: each project is a heading, its details indented rows
 * below it (marked with ↳ by SearchableSelect). Searching matches a detail's
 * title (label) or, via keywords, its project name.
 */
export function detailPickerOptions(groups: DetailGroup[]): SelectOption[] {
  const byProject = new Map<string, DetailGroup[]>()
  for (const g of groups) {
    const arr = byProject.get(g.project)
    if (arr) arr.push(g)
    else byProject.set(g.project, [g])
  }
  return [...byProject.values()]
    .sort((a, b) => a[0].projectName.localeCompare(b[0].projectName))
    .flatMap((details) => [
      { value: `__hdr__${details[0].project}`, label: details[0].projectName, header: true },
      ...details
        .slice()
        .sort((a, b) => a.detailTitle.localeCompare(b.detailTitle))
        .map((g) => ({
          value: g.key,
          label: `${g.detailTitle || 'Tanpa rincian'} (${g.todos.length})`,
          keywords: g.projectName,
          indent: true,
        })),
    ])
}

/**
 * One focus picker's options, with details already picked in OTHER columns
 * removed so the same detail can't fill two columns (no duplicate columns).
 * `taken` = every other column's current pick; `own` stays so this column's
 * selected value still renders. Project headers left with no detail rows under
 * them are dropped so no empty heading dangles.
 */
export function availableDetailOptions(all: SelectOption[], taken: Set<string>, own: string): SelectOption[] {
  const kept = all.filter((o) => o.header || o.value === own || !taken.has(o.value))
  // A header is orphaned if the next kept row is another header (or nothing).
  return kept.filter((o, i) => !o.header || (!!kept[i + 1] && !kept[i + 1].header))
}

/** Apply the standard project/brand/owner/leader/estimate filters to todos. */
export function applyProjectItemFilters(list: ProjectItem[], f: Record<string, string>): ProjectItem[] {
  return list.filter(
    (t) =>
      (!f.status || t.status_key === f.status) &&
      (!f.project || t.project === f.project) &&
      (!f.brand || t.brand === f.brand) &&
      (!f.owner || t.project_owner === f.owner) &&
      (!f.leader || t.project_leader === f.leader) &&
      matchEstimate(f.estimate || '', t.estimated),
  )
}

/**
 * The AI ladder. A todo tagged AI walks phases 1 → 2 → 3; phase 0 is untagged work.
 * Derived server-side (`ai_phase`, see api/project_todo.py) — never stored except for
 * the phase-3 confirmation checkbox. `next` is the one line of UI copy explaining what
 * has to happen for the todo to leave this phase.
 */
export const AI_PHASES: Record<AiPhase, { label: string; short: string; next: string }> = {
  0: {
    label: 'Non-AI',
    short: 'Non-AI',
    next: 'Dikerjakan manusia. Tandai kerja AI untuk mulai fase 1.',
  },
  1: {
    label: 'Ditandai AI',
    short: 'AI 1',
    next: 'Menunggu prompt dibuat. Setelah prompt ada, kamu tinggal periksa dan konfirmasi.',
  },
  2: {
    label: 'Prompt Draf',
    short: 'AI 2',
    next: 'Periksa dan perbaiki prompt-nya, lalu tekan Konfirmasi supaya AI Agent boleh mengerjakan.',
  },
  3: {
    label: 'Prompt Terkonfirmasi',
    short: 'AI 3',
    next: 'AI Agent akan mengerjakan, lalu membuat todo "Ask other to check" kalau sudah selesai.',
  },
}

/** Phase of a todo on the AI ladder. Falls back to work_mode for payloads that predate `ai_phase`. */
export function aiPhaseOf(t: ProjectItem): AiPhase {
  if (t.ai_phase != null) return t.ai_phase
  return t.work_mode === 'AI' || t.work_mode === 'Both' ? 1 : 0
}

/**
 * Todo "tags" — the icon flags shown on a TodoCard. `focus` = has a live focus
 * timer (transient, membership from `useFocusedTaskIds`), `ai1`/`ai2`/`ai3` = the AI
 * phase, `to_check` = the To Check flag, `untagged` = none of them. Drives the
 * by-project column tag filter on the dashboard (both frontends). Turning all three
 * AI tags on reproduces the old single "AI" filter, since 'on' tags are OR-ed.
 */
export type TodoTag = 'untagged' | 'focus' | 'ai1' | 'ai2' | 'ai3' | 'to_check'

export const TODO_TAGS: { value: TodoTag; label: string }[] = [
  { value: 'untagged', label: 'Untagged' },
  { value: 'focus', label: 'Focus' },
  { value: 'ai1', label: 'AI 1 · Ditandai' },
  { value: 'ai2', label: 'AI 2 · Draf' },
  { value: 'ai3', label: 'AI 3 · Siap' },
  { value: 'to_check', label: 'To Check' },
]

/** `focusedIds` = task ids with a live focus timer (useFocusedTaskIds). */
export function todoHasTag(t: ProjectItem, tag: TodoTag, focusedIds: Set<string>): boolean {
  switch (tag) {
    case 'focus':
      return focusedIds.has(t.name)
    case 'ai1':
      return aiPhaseOf(t) === 1
    case 'ai2':
      return aiPhaseOf(t) === 2
    case 'ai3':
      return aiPhaseOf(t) === 3
    case 'to_check':
      return !!t.to_check
    case 'untagged':
      return !focusedIds.has(t.name) && aiPhaseOf(t) === 0 && !t.to_check
  }
}

/** Tri-state per tag: 'on' = require, 'off' = exclude; a tag absent from the map = don't care. */
export type TagState = 'on' | 'off'
export type TagFilterState = Map<TodoTag, TagState>

/** Cycle one tag through all → on → off → all. Returns a fresh map (immutable update for setState). */
export function cycleTag(state: TagFilterState, tag: TodoTag): TagFilterState {
  const next = new Map(state)
  const cur = next.get(tag)
  if (cur === undefined) next.set(tag, 'on')
  else if (cur === 'on') next.set(tag, 'off')
  else next.delete(tag)
  return next
}

/**
 * Tri-state tag filter. A todo passes when it carries at least one 'on' tag
 * (or nothing is 'on') AND carries none of the 'off' tags. Empty state = pass-through.
 * All-'on' reduces to the old OR behaviour, so an all-on selection is backward compatible.
 */
export function filterByTags(list: ProjectItem[], state: TagFilterState, focusedIds: Set<string>): ProjectItem[] {
  if (!state.size) return list
  const on: TodoTag[] = []
  const off: TodoTag[] = []
  state.forEach((s, tag) => (s === 'on' ? on : off).push(tag))
  return list.filter(
    (t) =>
      (on.length === 0 || on.some((tag) => todoHasTag(t, tag, focusedIds))) &&
      off.every((tag) => !todoHasTag(t, tag, focusedIds)),
  )
}

/**
 * Day-plan bucket for the "today" filter, from a todo's plan slots (`allocations`):
 * `today` = a slot dated today, `unplanned` = no slots at all, `other` = planned but
 * none today. `today` param is todayISO() (injected so this stays pure/testable).
 */
export type DayBucket = 'today' | 'other' | 'unplanned'

export function todoDayBucket(t: ProjectItem, today: string): DayBucket {
  if (!t.allocations?.length) return 'unplanned'
  return t.allocations.some((a) => a.date === today) ? 'today' : 'other'
}

/** Chip labels for the "today" filter. Neutral (undefined) state reuses "Today". */
export const DAY_FILTER_LABEL: Record<DayBucket, string> = {
  today: 'Today',
  other: 'Not today',
  unplanned: 'Unplanned',
}

/** Single-select cycle: All (undefined) → Today → Not today → Unplanned → All. */
const DAY_CYCLE: (DayBucket | undefined)[] = [undefined, 'today', 'other', 'unplanned']
export function cycleDay(cur: DayBucket | undefined): DayBucket | undefined {
  return DAY_CYCLE[(DAY_CYCLE.indexOf(cur) + 1) % DAY_CYCLE.length]
}

/** Keep only todos in the selected day bucket; undefined = pass-through. */
export function filterByDay(list: ProjectItem[], bucket: DayBucket | undefined, today: string): ProjectItem[] {
  return bucket ? list.filter((t) => todoDayBucket(t, today) === bucket) : list
}
