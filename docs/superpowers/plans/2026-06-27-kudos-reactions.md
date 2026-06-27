# Kudos / Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teammates react (clap/celebrate/fire/heart) to each other's recently-completed todos via a new Team Activity feed, with an in-app Kudos notification to the assignee.

**Architecture:** A new `Todo Reaction` doctype stores one reaction per (todo, user), enforced app-level in the API. Two whitelisted methods in `vernon_project/api/mobile.py` (`get_team_activity`, `toggle_reaction`) reuse the existing `_visible_projects`/`_fetch_todos`/`_notify` machinery. The mobile `/m` React app gets an `/activity` screen, react-query hooks with optimistic toggling, a Today header entry icon, and a Kudos entry in the notification type→icon/label map.

**Tech Stack:** React 18, TypeScript, Tailwind 3, @tanstack/react-query, react-router-dom; Frappe (Python) backend.

## Global Constraints
- Aesthetic = Soft-Pop paper system. Tokens ONLY: bg-paper / bg-paper-card / bg-paper-line / border-paper-edge, brand-* (indigo), shadow-card, font-display (Familjen Grotesk), body Figtree. Muted text = text-stone-*. Keep all dark: variants. Keep semantic status colors (rose/amber/emerald/sky/violet/orange).
- Icons = lucide-react ONLY. NEVER emoji. Playful motion = animate-float / animate-wiggle / animate-pop (already defined; a prefers-reduced-motion guard already disables them).
- App column is pinned to max-w-[448px]; root font-size is 14px (do not reintroduce max-w-md or rem-based page widths). Inputs must stay text-[16px] (iOS no-zoom).
- Frontend API: src/lib/api.ts exposes `api.get/post(dotted, params)` and `mobileApi.*`; the request() helper injects window.csrf_token and throws ApiError. Data hooks live in src/hooks/useData.ts (react-query; mutations invalidate keys via useQueryClient in onSettled). Feedback via useToast() from components/Toast.tsx. Routes declared in src/App.tsx. NEVER use native alert/confirm/prompt — use a dialog/sheet.
- Backend: Frappe. Whitelisted methods go in vernon_project/api/mobile.py with @frappe.whitelist(). Notifications via _notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None) at mobile.py:171. New doctypes under vernon_project/vernon_project/doctype/<snake_name>/ (JSON + .py).
- Deploy steps (LIVE site project.vernon.id, NO test DB): schema change -> `bench --site project.vernon.id migrate`; Python change -> `bench restart`; frontend change -> `cd frontend && npm run build` (emits /m bundle + www/m.html).
- TESTING OVERRIDE (project convention, overrides skill TDD): there is NO test DB, so do NOT write per-task pytest/jest. Instead END EACH TASK with (a) a concrete MANUAL SMOKE CHECK — exact steps to click in /m + expected result — and (b) a commit. Automated tests are deferred to a final optional task per plan.
- Git: user edits in parallel. `git add` ONLY the files this plan's task touches; never `git checkout` other branches. End every commit message body with:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na

---

## File Structure

**Created:**
- `vernon_project/vernon_project/doctype/todo_reaction/__init__.py` — empty package marker.
- `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.json` — DocType schema: `todo` (Link Project Todo), `user` (Link User), `reaction` (Select clap/celebrate/fire/heart). autoname hash.
- `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.py` — `TodoReaction(Document)`; defaults `user` to session user on insert.
- `frontend/src/pages/ActivityScreen.tsx` — `/activity` screen: Soft-Pop completion cards + lucide reaction bar with optimistic toggle.

**Modified:**
- `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json` — add `Kudos` to the `type` Select options.
- `vernon_project/api/mobile.py` — add `REACTION_LABELS`, `_reaction_counts`, whitelisted `get_team_activity`, whitelisted `toggle_reaction`.
- `frontend/src/lib/types.ts` — add `ReactionKey`, `ReactionCounts`, `ActivityItem`, `ToggleReactionResult`; extend `NotificationType` with `'Kudos'`.
- `frontend/src/lib/api.ts` — add `mobileApi.getTeamActivity` + `mobileApi.toggleReaction`.
- `frontend/src/hooks/useData.ts` — add `keys.teamActivity`, `useTeamActivity`, `useToggleReaction` (optimistic).
- `frontend/src/App.tsx` — import `ActivityScreen` + add `/activity` route.
- `frontend/src/pages/Today.tsx` — add a Sparkles header button → `/activity`, next to `NotificationBell`.
- `frontend/src/components/NotificationSheet.tsx` — add `TYPE_ICON`/`TYPE_LABEL` maps (incl. Kudos→Hand) and render a leading type-icon + category caption per row.

---

### Task 1: New `Todo Reaction` doctype + Kudos notification option (schema/migration)

**Files:**
- Create `vernon_project/vernon_project/doctype/todo_reaction/__init__.py`
- Create `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.json`
- Create `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.py`
- Modify `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json` (line 20 — `type` field `options`)

**Interfaces:**
- Produces doctype `Todo Reaction` with fields `todo` (Link Project Todo), `user` (Link User), `reaction` (Select: `clap`/`celebrate`/`fire`/`heart`).
- Produces `Vernon Notification.type` option `Kudos`.

- [ ] Create the empty package marker `vernon_project/vernon_project/doctype/todo_reaction/__init__.py` (zero bytes).
- [ ] Create `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.json` with:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-27 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "todo",
  "user",
  "reaction"
 ],
 "fields": [
  {"fieldname": "todo", "fieldtype": "Link", "label": "Todo", "options": "Project Todo", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "reaction", "fieldtype": "Select", "label": "Reaction", "options": "clap\ncelebrate\nfire\nheart", "reqd": 1, "in_list_view": 1}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-06-27 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Todo Reaction",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```
- [ ] Create `vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.py` with:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TodoReaction(Document):
	def before_insert(self):
		if not self.user:
			self.user = frappe.session.user
```
- [ ] In `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`, edit the `type` field (line 20) options. Replace:
```json
  {"fieldname": "type", "fieldtype": "Select", "label": "Type", "options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption", "in_list_view": 1},
```
with:
```json
  {"fieldname": "type", "fieldtype": "Select", "label": "Type", "options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption\nKudos", "in_list_view": 1},
```
- [ ] Run the migration: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`. Confirm it completes with no traceback.
- [ ] **MANUAL SMOKE CHECK:** Run `cd /home/frappe/frappe-bench && bench --site project.vernon.id console` then enter:
  `frappe.db.table_exists("Todo Reaction")` → expect `True`;
  `[f.fieldname for f in frappe.get_meta("Todo Reaction").fields]` → expect `['todo', 'user', 'reaction']`;
  `"Kudos" in frappe.get_meta("Vernon Notification").get_field("type").options` → expect `True`. Then `exit()`.
- [ ] **COMMIT:**
  `git add vernon_project/vernon_project/doctype/todo_reaction/__init__.py vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.json vernon_project/vernon_project/doctype/todo_reaction/todo_reaction.py vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`
  Commit message:
  ```
  feat(kudos): Todo Reaction doctype + Kudos notification type

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  ```

---

### Task 2: Backend API — `get_team_activity` + `toggle_reaction`

**Files:**
- Modify `vernon_project/api/mobile.py` — append new code at end of file (after the last endpoint). Reuses existing helpers `_visible_projects()` (mobile.py:343), `_fetch_todos()` (mobile.py:358), `_status_key()` (mobile.py:59), `_user_name_map()` (mobile.py:117), `_humanize_datetime()` (mobile.py:87), `_notify()` (mobile.py:171), and imports already present (`frappe`, `getdate`, `nowdate`, `add_days`).

**Interfaces:**
- Produces `REACTION_LABELS: dict[str, str]` — `{"clap":"Clap","celebrate":"Celebrate","fire":"Fire","heart":"Heart"}`.
- Produces `_reaction_counts(todo: str, me: str | None = None) -> tuple[dict, str | None]` — returns `({clap,celebrate,fire,heart}` counts, `my_reaction)`.
- Produces whitelisted `get_team_activity(days=14, limit=50) -> {"items": [ActivityItem...]}` where each item has keys: `name, to_do, project, project_name, assigned_to, assigned_to_name, assigned_to_image, completed_at, completed_at_human, point, reactions{clap,celebrate,fire,heart}, my_reaction, reactors[], total, is_mine`.
- Produces whitelisted `toggle_reaction(todo, reaction) -> {"reactions": {...}, "my_reaction": str|None, "total": int}`.

- [ ] Append to the end of `vernon_project/api/mobile.py`:
```python


# --------------------------------------------------------------------------------
# Kudos / reactions — react to a teammate's completed work in a team activity feed.
# One reaction per (todo, user); enforced app-level (toggle/replace). Social only:
# no points awarded. Cannot react to a todo assigned to yourself.
# --------------------------------------------------------------------------------

REACTION_LABELS = {"clap": "Clap", "celebrate": "Celebrate", "fire": "Fire", "heart": "Heart"}


def _reaction_counts(todo, me=None):
	"""Per-reaction counts for one todo, plus the caller's own reaction (or None)."""
	rows = frappe.get_all(
		"Todo Reaction",
		filters={"todo": todo},
		fields=["user", "reaction"],
		limit_page_length=0,
	)
	counts = {"clap": 0, "celebrate": 0, "fire": 0, "heart": 0}
	mine = None
	for r in rows:
		if r["reaction"] in counts:
			counts[r["reaction"]] += 1
		if me and r["user"] == me:
			mine = r["reaction"]
	return counts, mine


@frappe.whitelist()
def get_team_activity(days=14, limit=50):
	"""Recent Completed todos in the caller's projects, newest first, each with a
	reaction-count summary, the caller's own reaction, and a few recent reactor
	names. Drives the /activity feed."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	days = frappe.utils.cint(days) or 14
	limit = frappe.utils.cint(limit) or 50
	cutoff = add_days(getdate(nowdate()), -days)

	projects = _visible_projects()
	rows = _fetch_todos(projects)
	done = [
		r
		for r in rows
		if _status_key(r["status"]) == "completed"
		and r["completed_at"]
		and getdate(r["completed_at"]) >= cutoff
	]
	done.sort(key=lambda r: str(r["completed_at"]), reverse=True)
	done = done[:limit]
	if not done:
		return {"items": []}

	names = [r["name"] for r in done]
	reaction_rows = frappe.get_all(
		"Todo Reaction",
		filters={"todo": ["in", names]},
		fields=["todo", "user", "reaction"],
		limit_page_length=0,
	)
	by_todo = {}
	for rr in reaction_rows:
		by_todo.setdefault(rr["todo"], []).append(rr)

	emails = {r["assigned_to"] for r in done if r.get("assigned_to")}
	emails |= {rr["user"] for rr in reaction_rows}
	name_map = _user_name_map(emails)

	items = []
	for r in done:
		counts = {"clap": 0, "celebrate": 0, "fire": 0, "heart": 0}
		my_reaction = None
		reactors = []
		for rr in by_todo.get(r["name"], []):
			if rr["reaction"] in counts:
				counts[rr["reaction"]] += 1
			if rr["user"] == user:
				my_reaction = rr["reaction"]
			reactors.append((name_map.get(rr["user"]) or {}).get("full_name") or rr["user"])
		assignee = name_map.get(r["assigned_to"], {})
		items.append({
			"name": r["name"],
			"to_do": r["to_do"],
			"project": r["project"],
			"project_name": r["project_name"],
			"assigned_to": r["assigned_to"],
			"assigned_to_name": assignee.get("full_name") or r["assigned_to"],
			"assigned_to_image": assignee.get("user_image"),
			"completed_at": str(r["completed_at"]),
			"completed_at_human": _humanize_datetime(r["completed_at"]),
			"point": float(r["point"] or 0),
			"reactions": counts,
			"my_reaction": my_reaction,
			"reactors": reactors[:3],
			"total": sum(counts.values()),
			"is_mine": r["assigned_to"] == user,
		})
	return {"items": items}


@frappe.whitelist()
def toggle_reaction(todo, reaction):
	"""Upsert/remove the caller's reaction on a todo. Same reaction again removes
	it; a different reaction replaces it; the first reaction notifies the assignee.
	Forbidden on a todo assigned to yourself."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	if reaction not in REACTION_LABELS:
		frappe.throw("Unknown reaction")

	assignee, project_detail = frappe.db.get_value(
		"Project Todo", todo, ["assigned_to", "project_detail"]
	) or (None, None)
	if not project_detail:
		frappe.throw("Todo not found")
	project = frappe.db.get_value("Project Detail", project_detail, "project")
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)
	if assignee == user:
		frappe.throw("You can't react to your own work")

	# ponytail: app-level (todo,user) uniqueness via read-then-write; a rapid
	# double-tap before commit could insert two rows. Acceptable for a social
	# counter — add a DB unique index on (todo,user) if it ever matters.
	existing = frappe.get_all(
		"Todo Reaction",
		filters={"todo": todo, "user": user},
		fields=["name", "reaction"],
		limit_page_length=1,
	)
	notify = False
	if existing:
		e = existing[0]
		if e["reaction"] == reaction:
			frappe.delete_doc("Todo Reaction", e["name"], ignore_permissions=True, force=True)
		else:
			frappe.db.set_value("Todo Reaction", e["name"], "reaction", reaction)
	else:
		frappe.get_doc({
			"doctype": "Todo Reaction",
			"todo": todo,
			"user": user,
			"reaction": reaction,
		}).insert(ignore_permissions=True)
		notify = True
	frappe.db.commit()

	if notify:
		actor_name = frappe.db.get_value("User", user, "full_name") or user
		_notify(
			assignee,
			"Kudos",
			f"{actor_name} cheered your work",
			REACTION_LABELS[reaction],
			"Project Todo",
			todo,
			actor=user,
		)

	counts, mine = _reaction_counts(todo, user)
	return {"reactions": counts, "my_reaction": mine, "total": sum(counts.values())}
```
- [ ] Apply the Python change: `cd /home/frappe/frappe-bench && bench restart`.
- [ ] **MANUAL SMOKE CHECK:** `cd /home/frappe/frappe-bench && bench --site project.vernon.id console`, then:
  `frappe.set_user("mo@intinusa.id")` (or any real project member);
  `from vernon_project.api.mobile import get_team_activity, toggle_reaction`;
  `act = get_team_activity(); len(act["items"])` → expect ≥ 0, no error, items have `reactions`/`my_reaction`/`is_mine` keys.
  Find a completed todo NOT assigned to the logged-in user: `pick = next(i for i in act["items"] if not i["is_mine"])` then `toggle_reaction(pick["name"], "fire")` → expect `{"reactions": {...fire:1...}, "my_reaction": "fire", "total": 1}`; call it again → `fire:0, my_reaction:None, total:0`. Verify own-todo guard: `own = next(i for i in act["items"] if i["is_mine"])` then `toggle_reaction(own["name"], "fire")` → expect a "You can't react to your own work" ValidationError. Then `frappe.db.rollback(); exit()`.
- [ ] **COMMIT:**
  `git add vernon_project/api/mobile.py`
  Commit message:
  ```
  feat(kudos): get_team_activity + toggle_reaction mobile API

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  ```

---

### Task 3: Frontend plumbing — types, api client, hooks

**Files:**
- Modify `frontend/src/lib/types.ts` — extend `NotificationType` (line 19-25) + append new interfaces after the `AppNotification` block (after line ~39).
- Modify `frontend/src/lib/api.ts` — add two entries to the `mobileApi` object (after `meetingInvitableUsers`, before the closing `}` at line ~301).
- Modify `frontend/src/hooks/useData.ts` — add `teamActivity` to `keys` (line ~74), add type imports (line ~8-41), add hooks `useTeamActivity` + `useToggleReaction` (append near other hooks).

**Interfaces:**
- Produces `ReactionKey = 'clap' | 'celebrate' | 'fire' | 'heart'`.
- Produces `ReactionCounts { clap; celebrate; fire; heart: number }`.
- Produces `ActivityItem` (shape matches Task 2's `get_team_activity` item) and `ToggleReactionResult { reactions: ReactionCounts; my_reaction: ReactionKey | null; total: number }`.
- Produces `mobileApi.getTeamActivity(days?, limit?) => Promise<{ items: ActivityItem[] }>` and `mobileApi.toggleReaction(todo, reaction) => Promise<ToggleReactionResult>`.
- Produces `useTeamActivity(days?) => UseQueryResult<ActivityItem[]>` (queryKey `keys.teamActivity`) and `useToggleReaction()` mutation taking `{ todo: string; reaction: ReactionKey }`.
- Consumes nothing new beyond existing `mobileApi`, `useQuery`, `useMutation`, `useQueryClient`.

- [ ] In `frontend/src/lib/types.ts`, replace the `NotificationType` union:
```ts
export type NotificationType =
  | 'Assignment'
  | 'Approval'
  | 'Comment'
  | 'Mention'
  | 'Points'
  | 'Redemption'
```
with:
```ts
export type NotificationType =
  | 'Assignment'
  | 'Approval'
  | 'Comment'
  | 'Mention'
  | 'Points'
  | 'Redemption'
  | 'Kudos'
```
- [ ] In `frontend/src/lib/types.ts`, immediately after the closing `}` of the `AppNotification` interface, add:
```ts

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
```
- [ ] In `frontend/src/lib/api.ts`, inside the `mobileApi` object, locate `meetingInvitableUsers: (project: string, txt = '') =>` … `}),` (the last entry, ending at line ~300) and insert directly after it (still inside the object):
```ts
  getTeamActivity: (days = 14, limit = 50) =>
    api.get<{ items: import('./types').ActivityItem[] }>(M + 'get_team_activity', { days, limit }),
  toggleReaction: (todo: string, reaction: import('./types').ReactionKey) =>
    api.post<import('./types').ToggleReactionResult>(M + 'toggle_reaction', { todo, reaction }),
```
- [ ] In `frontend/src/hooks/useData.ts`, add `ActivityItem` and `ReactionKey` to the type import block (the `import type { ... } from '@/lib/types'` list, after `PersonalNote,`):
```ts
  PersonalNote,
  ActivityItem,
  ReactionKey,
```
- [ ] In `frontend/src/hooks/useData.ts`, add a `teamActivity` key to the `keys` object (after `passkeys: ['passkeys'] as const,`):
```ts
  passkeys: ['passkeys'] as const,
  teamActivity: ['team-activity'] as const,
```
- [ ] In `frontend/src/hooks/useData.ts`, append at the very end of the file:
```ts

export function useTeamActivity(days = 14) {
  return useQuery({
    queryKey: keys.teamActivity,
    queryFn: async () => (await mobileApi.getTeamActivity(days)).items,
  })
}

const REACTION_KEYS: ReactionKey[] = ['clap', 'celebrate', 'fire', 'heart']

// Mirror the server's toggle math so the optimistic update matches: same
// reaction removes it; a different one replaces; none adds.
function applyToggle(item: ActivityItem, reaction: ReactionKey): ActivityItem {
  const reactions = { ...item.reactions }
  let my = item.my_reaction
  if (my === reaction) {
    reactions[reaction] = Math.max(0, reactions[reaction] - 1)
    my = null
  } else {
    if (my) reactions[my] = Math.max(0, reactions[my] - 1)
    reactions[reaction] = reactions[reaction] + 1
    my = reaction
  }
  const total = REACTION_KEYS.reduce((s, k) => s + reactions[k], 0)
  return { ...item, reactions, my_reaction: my, total }
}

export function useToggleReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todo, reaction }: { todo: string; reaction: ReactionKey }) =>
      mobileApi.toggleReaction(todo, reaction),
    onMutate: async ({ todo, reaction }) => {
      await qc.cancelQueries({ queryKey: keys.teamActivity })
      const prev = qc.getQueryData<ActivityItem[]>(keys.teamActivity)
      qc.setQueryData<ActivityItem[]>(keys.teamActivity, (old) =>
        (old ?? []).map((it) => (it.name === todo ? applyToggle(it, reaction) : it)),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.teamActivity, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.teamActivity })
    },
  })
}
```
- [ ] Typecheck/build: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`. Confirm no TypeScript errors (this task adds no UI yet).
- [ ] **MANUAL SMOKE CHECK:** `npm run build` completes with exit code 0 and no type errors referencing `ActivityItem`, `ReactionKey`, `getTeamActivity`, `toggleReaction`, or `teamActivity`. (No clickable UI yet — verified in Task 4.)
- [ ] **COMMIT:** (include the rebuilt bundle so /m stays in sync)
  `git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts vernon_project/public/frontend/ vernon_project/www/m.html`
  Commit message:
  ```
  feat(kudos): activity/reaction types, api client + react-query hooks

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  ```

---

### Task 4: ActivityScreen + `/activity` route + Today header entry icon

**Files:**
- Create `frontend/src/pages/ActivityScreen.tsx`
- Modify `frontend/src/App.tsx` — import (after line 39, the `MeetingsScreen` import) + add route (after the `/meetings` route, line ~162)
- Modify `frontend/src/pages/Today.tsx` — add a Sparkles button in the `right` cluster (line ~196-211), before `<NotificationBell />`

**Interfaces:**
- Consumes `useTeamActivity`, `useToggleReaction` (Task 3), `DetailScreen`/`PullToRefresh` from `@/components/Layout`, `Avatar`/`EmptyState`/`FullScreenLoader` from `@/components/ui`, types `ActivityItem`/`ReactionKey`.
- Produces default-exported `ActivityScreen` component + route `/activity`.

- [ ] Create `frontend/src/pages/ActivityScreen.tsx` with:
```tsx
import { Hand, PartyPopper, Flame, Heart, CheckCircle2, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader } from '@/components/ui'
import { useTeamActivity, useToggleReaction } from '@/hooks/useData'
import type { ActivityItem, ReactionKey } from '@/lib/types'

const REACTIONS: { key: ReactionKey; icon: LucideIcon; tint: string }[] = [
  { key: 'clap', icon: Hand, tint: 'text-amber-500' },
  { key: 'celebrate', icon: PartyPopper, tint: 'text-violet-500' },
  { key: 'fire', icon: Flame, tint: 'text-orange-500' },
  { key: 'heart', icon: Heart, tint: 'text-rose-500' },
]

function ReactionBar({ item }: { item: ActivityItem }) {
  const toggle = useToggleReaction()
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {REACTIONS.map(({ key, icon: Icon, tint }) => {
        const count = item.reactions[key]
        const active = item.my_reaction === key
        return (
          <button
            key={key}
            disabled={item.is_mine}
            onClick={() => toggle.mutate({ todo: item.name, reaction: key })}
            aria-label={key}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100',
              active
                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-paper-edge bg-paper-card text-stone-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            <Icon className={clsx('h-4 w-4', active ? 'text-brand-600 dark:text-brand-300' : tint)} />
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ActivityCard({ item }: { item: ActivityItem }) {
  return (
    <div className="rounded-3xl border border-paper-edge bg-paper-card dark:border-slate-700 dark:bg-slate-800 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={item.assigned_to_name} image={item.assigned_to_image ?? undefined} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-500 dark:text-slate-400">
            <span className="font-semibold text-stone-800 dark:text-slate-100">{item.assigned_to_name}</span> completed
          </p>
          <p className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-stone-800 dark:text-slate-50">
            {item.to_do}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="truncate">
              {item.project_name}
              {item.completed_at_human ? ` · ${item.completed_at_human}` : ''}
            </span>
          </p>
        </div>
        {item.point > 0 && (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            +{item.point.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        )}
      </div>
      <ReactionBar item={item} />
      {item.total > 0 && item.reactors.length > 0 && (
        <p className="mt-2 text-xs text-stone-400 dark:text-slate-500">
          {item.reactors.join(', ')}
          {item.total > item.reactors.length ? ` +${item.total - item.reactors.length} more` : ''}
        </p>
      )}
    </div>
  )
}

export default function ActivityScreen() {
  const { data, isLoading, refetch } = useTeamActivity()
  const items = data ?? []
  return (
    <DetailScreen title="Team activity">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading activity…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {items.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No recent wins yet"
              subtitle="Completed work from your projects shows up here — cheer your teammates on."
            />
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              {items.map((it) => (
                <ActivityCard key={it.name} item={it} />
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
```
- [ ] In `frontend/src/App.tsx`, add the import after `import { MeetingsScreen } from './pages/MeetingsScreen'` (line 39):
```ts
import ActivityScreen from './pages/ActivityScreen'
```
- [ ] In `frontend/src/App.tsx`, add the route directly after `<Route path="/meetings" element={<MeetingsScreen />} />` (line ~162):
```tsx
        <Route path="/activity" element={<ActivityScreen />} />
```
- [ ] In `frontend/src/pages/Today.tsx`, in the `right` cluster, insert the activity button immediately before `<NotificationBell />` (line ~206). Replace:
```tsx
      <NotesButton />
      <NotificationBell />
```
with:
```tsx
      <NotesButton />
      <button
        onClick={() => navigate('/activity')}
        aria-label="Team activity"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/70 dark:active:bg-slate-700"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      <NotificationBell />
```
(`Sparkles` and `navigate` are already imported/in scope in Today.tsx — no new import.)
- [ ] Build: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`. Confirm exit code 0.
- [ ] **MANUAL SMOKE CHECK:** Open `https://project.vernon.id/m` on a phone (or DevTools mobile, width ≤ 448px) signed in as a project member who has at least one teammate with a recently-completed todo. On Home, tap the new Sparkles icon (left of the bell) → routes to `/activity` with a back-button header "Team activity". Expect completion cards (avatar + "<name> completed <title>", project + relative time, optional +points chip). Tap the Flame on a teammate's card → count shows `1` and chip turns brand/indigo immediately (optimistic); tap again → returns to `0`. On your OWN completed card the four reaction buttons are visibly dimmed/disabled. Empty feed shows the "No recent wins yet" state.
- [ ] **COMMIT:**
  `git add frontend/src/pages/ActivityScreen.tsx frontend/src/App.tsx frontend/src/pages/Today.tsx vernon_project/public/frontend/ vernon_project/www/m.html`
  Commit message:
  ```
  feat(kudos): /activity feed screen + Today header entry

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  ```

---

### Task 5: Notification type → icon/label map (incl. Kudos)

**Files:**
- Modify `frontend/src/components/NotificationSheet.tsx` — replace the lucide import (line 3) + the types import (line 6), add `TYPE_ICON`/`TYPE_LABEL` maps, and render a leading type-icon circle + category caption per row (the `<li>` block, lines 117-143).

**Interfaces:**
- Consumes `NotificationType` (now includes `'Kudos'` from Task 3) + lucide icons.
- Produces `TYPE_ICON: Record<NotificationType, LucideIcon>` and `TYPE_LABEL: Record<NotificationType, string>`, both including a `Kudos` entry (`Hand` / `"Kudos"`).

- [ ] In `frontend/src/components/NotificationSheet.tsx`, replace the lucide import line:
```ts
import { Bell, CheckCheck } from 'lucide-react'
```
with:
```ts
import { Bell, CheckCheck, ClipboardList, MessageCircle, AtSign, Coins, Gift, Hand } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
```
- [ ] In `frontend/src/components/NotificationSheet.tsx`, replace the types import line:
```ts
import type { AppNotification } from '@/lib/types'
```
with:
```ts
import type { AppNotification, NotificationType } from '@/lib/types'
```
- [ ] In `frontend/src/components/NotificationSheet.tsx`, directly below the `const ANIM_MS = 260` line, add the maps:
```ts

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  Assignment: ClipboardList,
  Approval: CheckCheck,
  Comment: MessageCircle,
  Mention: AtSign,
  Points: Coins,
  Redemption: Gift,
  Kudos: Hand,
}

const TYPE_LABEL: Record<NotificationType, string> = {
  Assignment: 'Assignment',
  Approval: 'Approval',
  Comment: 'Comment',
  Mention: 'Mention',
  Points: 'Points',
  Redemption: 'Redemption',
  Kudos: 'Kudos',
}
```
- [ ] In `frontend/src/components/NotificationSheet.tsx`, replace the entire `{items.map((n) => ( ... ))}` `<li>` block (lines 117-143) with this version (leading type-icon circle + category caption; keeps the unread brand dot):
```tsx
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <li key={n.name}>
                    <button
                      onClick={() => open(n)}
                      className="flex w-full items-start gap-3 px-1 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.is_read ? 'bg-transparent' : 'bg-brand-500'
                        }`}
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {TYPE_LABEL[n.type] ?? n.type}
                        </span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-sm text-slate-500 dark:text-slate-400">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                          {n.at_human}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
```
- [ ] Build: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`. Confirm exit code 0.
- [ ] **MANUAL SMOKE CHECK:** As user A, react to user B's completed todo on `/activity` (Task 4). Then sign in as user B on `https://project.vernon.id/m`, tap the bell. Expect a notification row reading "<A's name> cheered your work" with body "Fire" (or the reaction you chose), a "KUDOS" caption above it, and the Hand icon in the leading circle. Confirm the other notification types (Assignment/Approval/Comment/etc.) still render with their own icons and captions (no regression). Tapping the Kudos row navigates to the todo's project-item screen.
- [ ] **COMMIT:**
  `git add frontend/src/components/NotificationSheet.tsx vernon_project/public/frontend/ vernon_project/www/m.html`
  Commit message:
  ```
  feat(kudos): notification type icon/label map incl. Kudos

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  ```

---

### Task 6 (optional, deferred): Automated tests

Per project convention (LIVE site, no test DB) automated tests are deferred. When a test DB is available, add:
- [ ] `test_toggle_reaction.py`: covers add → notify, same-reaction toggle-off, different-reaction replace, own-todo `ValidationError`, and (todo,user) uniqueness.
- [ ] `test_get_team_activity.py`: covers the `days` cutoff, completed-only filter, `is_mine`, and reaction-count/`my_reaction` aggregation.
- [ ] A React Testing Library test for `applyToggle` (add/replace/remove math) and the optimistic rollback in `useToggleReaction`.
