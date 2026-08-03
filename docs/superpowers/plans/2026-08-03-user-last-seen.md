# User "Last Seen" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface when each user was last active ("last seen") inline (user dashboard + Users list) and as a dedicated Last Seen report, for System Managers (all users) and team leaders (their people).

**Architecture:** Reuse Frappe's existing `User.last_active` (written on session activity, throttled to ~10 min) — no new tracking. Presence is computed client-side by a shared `presenceOf()` helper against a configurable online window (`online_window_minutes`, Vernon Settings, default 15). Two new whitelisted endpoints (`last_seen_report`, `last_seen_access`) power a bespoke report screen on both frontends; inline surfaces read `last_active` already present in existing payloads.

**Tech Stack:** Frappe (Python), React + TanStack Query (two frontends: `frontend/` mobile `@`, `frontend-web/` web `@web`), Tailwind.

## Global Constraints

- **Both frontends.** Every UI change ships to `frontend/` (mobile `/m`, Soft-Pop cards) AND `frontend-web/` (web `/w`, bento/DataTable). Shared logic in `frontend/src` imported as `@`.
- **Online window default = 15 min**, floored to 10 server-side. Reason: `frappe/sessions.py:409` throttles the `last_active` DB write to `min(session_expiry/2, 600)` = **600s = 10 min**; a shorter window flickers false-offline.
- **Timezone assumption:** site tz = `Asia/Jakarta`, Frappe stores `last_active` as site-local naive, viewers are in WIB → `presenceOf` parses naive-as-local. Document this; do NOT build tz conversion (single-region app).
- **No native `confirm/alert/prompt`** anywhere (not needed here, but the rule stands).
- **Docs:** new `@frappe.whitelist()` endpoints → `python3 scripts/gen_docs.py` picks them up automatically (auto-scans `whitelist` decorators, `gen_docs.py:152`). Commit regenerated `docs/assets/data.js`. No new DocType (Settings field only).
- **What's New:** after the bundles ship, insert ONE App Release row (Bahasa, `platform: Both`, `published: 1`, semver bump from newest row, one bullet per line).
- **Row exclusions:** exclude `("Guest", "Administrator")` and only include `enabled=1`, `user_type="System User"` (matches `_active_users` at `report.py:93`).
- **`custom_member_type`** is aliased `member_type` in payloads (see `list_users`, `mobile.py:2213`).

---

### Task 1: Backend — `online_window_minutes` setting (doctype + boot + app-settings)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` (add field + field_order entry)
- Modify: `vernon_project/api/mobile.py` — `bootstrap()` (~line 793), `get_app_settings()` (~2550), `save_app_settings()` (signature ~2638, `int_fields` ~2682)
- Modify: `frontend/src/lib/types.ts` — `Boot.settings` (~line 19-25) and `AppSettings` (~line 777)
- Test: `vernon_project/api/test_mobile.py` (new test asserting default)

**Interfaces:**
- Produces: `get_app_settings()["online_window_minutes"] -> int` (default 15); `bootstrap()["settings"]["online_window_minutes"] -> int`; TS `Boot.settings.online_window_minutes?: number` and `AppSettings.online_window_minutes: number`.

- [ ] **Step 1: Write the failing test**

Add to `vernon_project/api/test_mobile.py` (place near other settings tests; if none, add a new `unittest.TestCase`):

```python
class TestOnlineWindowSetting(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_get_app_settings_has_online_window_default(self):
		from vernon_project.api.mobile import get_app_settings
		out = get_app_settings()
		self.assertIn("online_window_minutes", out)
		self.assertGreaterEqual(int(out["online_window_minutes"]), 10)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_get_app_settings_has_online_window_default`
Expected: FAIL — `KeyError`/`AssertionError` (key missing).

- [ ] **Step 3: Add the doctype field**

In `vernon_settings.json`, add to the `field_order` array (near `min_daily_estimated_minutes`) the string `"online_window_minutes"`, and add this field object to `fields` (copy the Int shape from `min_daily_estimated_minutes`):

```json
  {
   "fieldname": "online_window_minutes",
   "fieldtype": "Int",
   "label": "Online Window (minutes)",
   "non_negative": 1,
   "default": "15",
   "description": "Users active within this many minutes show as Online. Keep >= 10 — the server records activity at most once every ~10 minutes, so lower values flicker false-offline."
  },
```

- [ ] **Step 4: Wire the three mobile.py sites**

In `get_app_settings()` return dict (after `under_occupied_tolerance_minutes` line ~2557) add:

```python
		"online_window_minutes": int(g("online_window_minutes") or 15),
```

In `bootstrap()` `settings` dict (mobile.py ~797, alongside `show_auto_approve`) add:

```python
			"online_window_minutes": int(frappe.db.get_single_value("Vernon Settings", "online_window_minutes") or 15),
```

In `save_app_settings()` add the param to the signature (near `under_occupied_tolerance_minutes=None,`):

```python
	online_window_minutes=None,
```

Add to the `int_fields` dict:

```python
		"online_window_minutes": online_window_minutes,
```

And enforce the 10-min floor inside the `int_fields` loop, alongside the existing `disc_reminder_hours` special-case:

```python
			if field == "online_window_minutes" and ival < 10:
				ival = 10  # server writes last_active at most every ~10 min; lower flickers
```

- [ ] **Step 5: Add TS types**

In `frontend/src/lib/types.ts`, `Boot.settings` (~line 19-25) add:

```ts
    online_window_minutes?: number
```

In `AppSettings` (~line 777, alongside `under_occupied_tolerance_minutes: number`) add:

```ts
  online_window_minutes: number
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_get_app_settings_has_online_window_default`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json vernon_project/api/mobile.py frontend/src/lib/types.ts vernon_project/api/test_mobile.py
git commit -m "feat(settings): online_window_minutes for presence (default 15, floor 10)"
```

---

### Task 2: Backend — `last_seen_report` + `last_seen_access` endpoints

**Files:**
- Modify: `vernon_project/api/report.py` (add helpers + two `@frappe.whitelist()` endpoints, near the other report endpoints)
- Test: `vernon_project/api/test_report.py` (new `unittest.TestCase`)

**Interfaces:**
- Produces:
  - `last_seen_access() -> {"can": bool, "scope": "all"|"team"|"none"}`
  - `last_seen_report() -> {"rows": [{"name","full_name","user_image","member_type","enabled","last_active"}], "scope": "all"|"team"}` — rows ordered stalest-first (never-seen first, then oldest `last_active`). Raises `frappe.PermissionError` when scope would be "none".

- [ ] **Step 1: Write the failing tests**

Add to `vernon_project/api/test_report.py`:

```python
class TestLastSeenReport(unittest.TestCase):
	LEADER = "ls_leader@example.com"
	MEMBER = "ls_member@example.com"
	OUTSIDER = "ls_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		for email, fn in ((self.LEADER, "Leader"), (self.MEMBER, "Member"), (self.OUTSIDER, "Outsider")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": fn,
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		# LEADER must actually hold a role to be a "System User" leader; give Project Leader.
		for email in (self.LEADER, self.MEMBER, self.OUTSIDER):
			u = frappe.get_doc("User", email)
			if "Project Leader" not in [r.role for r in u.roles]:
				u.add_roles("Project Leader")
		if not frappe.db.exists("Brand", "LS Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "LS Brand"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project", {"project_name": "LS Project"}):
			frappe.get_doc({
				"doctype": "Project", "project_name": "LS Project", "brand": "LS Brand",
				"project_owner": self.LEADER, "project_leader": self.LEADER,
				"status": "Ongoing", "start_date": nowdate(), "deadline": "2026-12-31",
				"reward_type": "Point", "bonus_amount": 0, "discount": 0,
				"team_members": [{"user": self.LEADER}, {"user": self.MEMBER}],
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_sysmgr_sees_all(self):
		from vernon_project.api.report import last_seen_report
		frappe.set_user("Administrator")
		out = last_seen_report()
		names = {r["name"] for r in out["rows"]}
		self.assertEqual(out["scope"], "all")
		self.assertIn(self.OUTSIDER, names)  # sysmgr sees even unrelated users

	def test_leader_sees_only_team_and_self(self):
		from vernon_project.api.report import last_seen_report
		frappe.set_user(self.LEADER)
		out = last_seen_report()
		names = {r["name"] for r in out["rows"]}
		self.assertEqual(out["scope"], "team")
		self.assertIn(self.LEADER, names)
		self.assertIn(self.MEMBER, names)
		self.assertNotIn(self.OUTSIDER, names)

	def test_outsider_is_denied(self):
		from vernon_project.api.report import last_seen_report
		frappe.set_user(self.OUTSIDER)
		with self.assertRaises(frappe.PermissionError):
			last_seen_report()

	def test_access_endpoint(self):
		from vernon_project.api.report import last_seen_access
		frappe.set_user("Administrator")
		self.assertEqual(last_seen_access(), {"can": True, "scope": "all"})
		frappe.set_user(self.LEADER)
		self.assertEqual(last_seen_access(), {"can": True, "scope": "team"})
		frappe.set_user(self.OUTSIDER)
		self.assertEqual(last_seen_access(), {"can": False, "scope": "none"})
```

Note: `nowdate` is already imported at the top of `test_report.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test test_sysmgr_sees_all`
Expected: FAIL — `ImportError`/`AttributeError` (`last_seen_report` not defined).

- [ ] **Step 3: Implement the endpoints**

Add to `vernon_project/api/report.py` (after the `_runs_project` helper, ~line 835). `_is_system_manager` and `get_project_admins` already exist in this file.

```python
def _projects_i_run(user):
	"""Names of Projects `user` owns, leads, or admins."""
	owned = frappe.get_all("Project", filters={"project_owner": user}, pluck="name")
	led = frappe.get_all("Project", filters={"project_leader": user}, pluck="name")
	adminned = frappe.get_all(
		"Project Admin User",
		filters={"user": user, "parentfield": "project_admins", "parenttype": "Project"},
		pluck="parent",
	)
	return set(owned) | set(led) | set(adminned)


def _users_on_projects(project_names):
	"""Distinct Project Team member user-ids across the given projects."""
	if not project_names:
		return set()
	return set(
		frappe.get_all(
			"Project Team",
			filters={"parent": ["in", list(project_names)], "parenttype": "Project"},
			pluck="user",
		)
	)


def _last_seen_rows(name_filter):
	"""User rows for the last-seen report, stalest-first. name_filter: None = all
	(minus Guest/Administrator), else an iterable of user-ids to restrict to."""
	filters = {"enabled": 1, "user_type": "System User"}
	if name_filter is None:
		filters["name"] = ["not in", ("Guest", "Administrator")]
	else:
		allowed = [n for n in name_filter if n not in ("Guest", "Administrator")]
		if not allowed:
			return []
		filters["name"] = ["in", allowed]
	rows = frappe.get_all(
		"User",
		filters=filters,
		fields=["name", "full_name", "user_image", "enabled", "last_active",
			"custom_member_type as member_type"],
		limit_page_length=0,
	)
	# Stalest first: never-seen (null) before oldest before newest.
	rows.sort(key=lambda r: (r["last_active"] is not None, r["last_active"] or ""))
	return rows


@frappe.whitelist()
def last_seen_access():
	"""Whether the caller may open the Last Seen report, and at what scope.
	Single source for the nav/tile gate — same rule last_seen_report enforces."""
	if _is_system_manager():
		return {"can": True, "scope": "all"}
	runs_any = bool(_projects_i_run(frappe.session.user))
	return {"can": runs_any, "scope": "team" if runs_any else "none"}


@frappe.whitelist()
def last_seen_report():
	"""Users with their last-active time. System Manager -> everyone; a project
	owner/leader/admin -> members of projects they run (plus themselves).
	Anyone else -> PermissionError."""
	me = frappe.session.user
	if _is_system_manager():
		return {"rows": _last_seen_rows(None), "scope": "all"}
	projects = _projects_i_run(me)
	if not projects:
		frappe.throw("Not permitted", frappe.PermissionError)
	names = _users_on_projects(projects) | {me}
	return {"rows": _last_seen_rows(names), "scope": "team"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test test_sysmgr_sees_all && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test test_leader_sees_only_team_and_self && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test test_outsider_is_denied && bench --site project.vernon.id run-tests --module vernon_project.api.test_report --test test_access_endpoint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_report.py
git commit -m "feat(report): last_seen_report + last_seen_access (sysmgr all / leader team)"
```

---

### Task 3: Shared — `presenceOf` helper + self-check

**Files:**
- Create: `frontend/src/lib/presence.ts`
- Create: `frontend/src/lib/presence.selfcheck.ts`

**Interfaces:**
- Produces: `presenceOf(lastActive: string | null | undefined, onlineWindowMin: number) => { online: boolean; label: string }`. Imported by both frontends as `@/lib/presence`.

- [ ] **Step 1: Write the self-check (the failing "test")**

Create `frontend/src/lib/presence.selfcheck.ts`:

```ts
import { strict as assert } from 'node:assert'
import { presenceOf } from './presence'

// null -> never
assert.equal(presenceOf(null, 15).label, 'Never signed in')
assert.equal(presenceOf(null, 15).online, false)

// within window -> online (2 min ago, 15-min window)
const twoMinAgo = new Date(Date.now() - 2 * 60_000)
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
assert.equal(presenceOf(fmt(twoMinAgo), 15).online, true)

// outside window -> offline + relative label
const ninetyMinAgo = new Date(Date.now() - 90 * 60_000)
const p = presenceOf(fmt(ninetyMinAgo), 15)
assert.equal(p.online, false)
assert.equal(p.label, 'last seen 1h ago')

// window <= 0 falls back to 15
assert.equal(presenceOf(fmt(twoMinAgo), 0).online, true)

console.log('presence self-check OK')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsx src/lib/presence.selfcheck.ts`
Expected: FAIL — cannot find module `./presence`.

- [ ] **Step 3: Implement `presence.ts`**

Create `frontend/src/lib/presence.ts`:

```ts
// Presence / "last seen" from Frappe's User.last_active.
//
// ponytail: last_active is a Frappe site-local NAIVE datetime ("YYYY-MM-DD HH:MM:SS").
// We parse it as browser-local. Correct while site tz (Asia/Jakarta) == viewer tz,
// which holds for this single-region deployment. Upgrade path if it ever goes
// multi-timezone: have the server return last_active as epoch millis / UTC ISO.
//
// ponytail: online window defaults to 15 min because the server writes last_active
// at most once per ~10 min (frappe sessions throttle); a shorter window flickers.

export interface Presence {
  online: boolean
  label: string
}

export function presenceOf(
  lastActive: string | null | undefined,
  onlineWindowMin: number,
): Presence {
  if (!lastActive) return { online: false, label: 'Never signed in' }
  const then = new Date(lastActive.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return { online: false, label: 'Never signed in' }
  const diffMs = Date.now() - then
  const win = (onlineWindowMin > 0 ? onlineWindowMin : 15) * 60_000
  if (diffMs < win) return { online: true, label: 'Online now' }
  return { online: false, label: `last seen ${agoLabel(diffMs)}` }
}

function agoLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsx src/lib/presence.selfcheck.ts`
Expected: prints `presence self-check OK`, exit 0.
(If `npx tsx` is unavailable offline, run via `npx --yes tsx@4 src/lib/presence.selfcheck.ts`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/presence.ts frontend/src/lib/presence.selfcheck.ts
git commit -m "feat(presence): shared presenceOf() last-seen helper + self-check"
```

---

### Task 4: Shared — types, API client, query hooks

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `LastSeenRow`, `LastSeenAccess`)
- Modify: `frontend/src/lib/api.ts` (add `lastSeenReport`, `lastSeenAccess` on `mobileApi`, ~line 673 near `todosDue`)
- Modify: `frontend/src/hooks/useData.ts` (add `useLastSeenReport`, `useLastSeenAccess`, ~line 461 near `useReport`)

**Interfaces:**
- Consumes: endpoints from Task 2.
- Produces: `useLastSeenReport()` → `{ data?: { rows: LastSeenRow[]; scope: 'all'|'team' } }`; `useLastSeenAccess()` → `{ data?: LastSeenAccess }`; types `LastSeenRow`, `LastSeenAccess`.

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts` (near `ManagedUser`, ~line 516):

```ts
export interface LastSeenRow {
  name: string
  full_name: string | null
  user_image: string | null
  enabled: 0 | 1
  last_active: string | null
  member_type: string | null
}

export interface LastSeenAccess {
  can: boolean
  scope: 'all' | 'team' | 'none'
}
```

- [ ] **Step 2: Add API client methods**

In `frontend/src/lib/api.ts`, near `todosDue` (~line 673), add to the `mobileApi` object:

```ts
  lastSeenReport: () =>
    api.get<{ rows: import('./types').LastSeenRow[]; scope: 'all' | 'team' }>(
      'vernon_project.api.report.last_seen_report',
    ),
  lastSeenAccess: () =>
    api.get<import('./types').LastSeenAccess>('vernon_project.api.report.last_seen_access'),
```

- [ ] **Step 3: Add query hooks**

In `frontend/src/hooks/useData.ts`, near `useReport` (~line 468). Import the types if the file uses a top import block for types; otherwise the `mobileApi` return generics already carry them.

```ts
export const useLastSeenAccess = () =>
  useQuery({
    queryKey: ['last-seen-access'],
    queryFn: () => mobileApi.lastSeenAccess(),
    staleTime: 1000 * 60 * 5,
  })

export const useLastSeenReport = (enabled = true) =>
  useQuery({
    queryKey: ['last-seen'],
    queryFn: () => mobileApi.lastSeenReport(),
    enabled,
    staleTime: 1000 * 30,
  })
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors referencing the added symbols. (Pre-existing unrelated errors, if any, are out of scope — confirm none mention `LastSeen`/`lastSeen`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(last-seen): types + api client + query hooks"
```

---

### Task 5: Mobile — Last Seen report screen + route + Reports tile

**Files:**
- Create: `frontend/src/pages/LastSeenScreen.tsx`
- Modify: `frontend/src/App.tsx` (import + route, ~line 223)
- Modify: `frontend/src/pages/Reports.tsx` (add to `BESPOKE`, gate on access)

**Interfaces:**
- Consumes: `useLastSeenReport`, `useLastSeenAccess` (Task 4), `presenceOf` (Task 3), `useBoot` for the window.

- [ ] **Step 1: Create the screen**

Create `frontend/src/pages/LastSeenScreen.tsx` (mirrors `TodosDueScreen.tsx` shell):

```tsx
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { Users } from 'lucide-react'
import { useLastSeenReport, useBoot } from '@/hooks/useData'
import { presenceOf } from '@/lib/presence'

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'

export default function LastSeenScreen() {
  const { data, isFetching } = useLastSeenReport()
  const { data: boot } = useBoot()
  const win = boot?.settings?.online_window_minutes ?? 15
  const rows = data?.rows ?? []
  const onlineCount = rows.filter((r) => presenceOf(r.last_active, win).online).length

  return (
    <DetailScreen title="Last Seen">
      <div className="flex flex-col gap-4">
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{onlineCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Online now</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{rows.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">People</p>
            </div>
          </div>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No people to show" />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const p = presenceOf(r.last_active, win)
              return (
                <div key={r.name} className={`${card} flex items-center gap-3`}>
                  <Avatar name={r.full_name || r.name} image={r.user_image} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{r.full_name || r.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.member_type || r.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{p.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
```

Note: confirm the `Avatar` import path/props by matching `UserDashboardScreen.tsx` (it uses `<Avatar name= image= config= size= />`); pass `config={undefined}` — the report payload has no avatar_config, which is fine (Avatar falls back to initials/image).

- [ ] **Step 2: Register the route**

In `frontend/src/App.tsx`, add the import alongside the other report screens (~line 43-45):

```tsx
import LastSeenScreen from '@/pages/LastSeenScreen'
```

Add the route directly after `/reports/todos-due` (~line 223):

```tsx
<Route path="/reports/last-seen" element={<LastSeenScreen />} />
```

- [ ] **Step 3: Add the Reports tile (gated on access)**

In `frontend/src/pages/Reports.tsx`: import the hook + icon, and append a tile to `BESPOKE` only when access is granted.

At the top, add:

```tsx
import { UserRoundCheck } from 'lucide-react'
import { useLastSeenAccess } from '@/hooks/useData'
```

Inside `Reports()`, before building `tiles`:

```tsx
  const { data: lastSeenAccess } = useLastSeenAccess()
```

Change the `tiles` construction so a Last Seen tile is included when `lastSeenAccess?.can`:

```tsx
  const bespoke = [
    ...(lastSeenAccess?.can
      ? [{
          key: 'last-seen',
          title: 'Last Seen',
          desc: 'When each teammate was last active',
          icon: UserRoundCheck,
          accent: 'from-emerald-500 to-teal-600',
          to: '/reports/last-seen',
        }]
      : []),
    ...BESPOKE,
  ]
```

Then replace `...BESPOKE.map(...)` in the `tiles` array with `...bespoke.map(...)`.

- [ ] **Step 4: Build + visual verify**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds. (Deferred functional verify to Task 10.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LastSeenScreen.tsx frontend/src/App.tsx frontend/src/pages/Reports.tsx
git commit -m "feat(mobile): Last Seen report screen + route + gated tile"
```

---

### Task 6: Web — Last Seen report screen + route + Reports tile

**Files:**
- Create: `frontend-web/src/pages/LastSeen.tsx`
- Modify: `frontend-web/src/App.tsx` (import + route, ~line 274)
- Modify: `frontend-web/src/pages/Reports.tsx` (add gated tile + fix the `count`/`+1` math)

**Interfaces:**
- Consumes: same hooks/helper as Task 5 (shared via `@`).

- [ ] **Step 1: Create the screen**

Create `frontend-web/src/pages/LastSeen.tsx` (mirrors web `TodosDue.tsx` `Page`+`DataTable` shell):

```tsx
import { UserRoundCheck } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'
import { EmptyState } from '@/components/ui'
import { Avatar } from '@web/components/Avatar'
import { useLastSeenReport, useBoot } from '@/hooks/useData'
import { presenceOf } from '@/lib/presence'
import type { LastSeenRow } from '@/lib/types'

export default function LastSeen() {
  const { data, isFetching } = useLastSeenReport()
  const { data: boot } = useBoot()
  const win = boot?.settings?.online_window_minutes ?? 15
  const rows = data?.rows ?? []

  const cols: Column<LastSeenRow>[] = [
    {
      key: 'user',
      header: 'User',
      sortValue: (u) => u.full_name || u.name,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.full_name || u.name} image={u.user_image ?? undefined} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{u.full_name || u.name}</p>
            <p className="truncate text-xs text-muted">{u.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (u) => (u.member_type ? <span className="text-xs text-muted">{u.member_type}</span> : <span className="text-xs text-muted">—</span>),
    },
    {
      key: 'presence',
      header: 'Last seen',
      // Sort stalest-first: never-seen (0) < timestamp. Larger timestamp = more recent.
      sortValue: (u) => (u.last_active ? new Date(u.last_active.replace(' ', 'T')).getTime() : 0),
      render: (u) => {
        const p = presenceOf(u.last_active, win)
        return (
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <span className="text-sm text-ink">{p.label}</span>
          </div>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader icon={UserRoundCheck} title="Last Seen" subtitle="When each teammate was last active" />
      {isFetching && !data ? null : rows.length === 0 ? (
        <EmptyState icon={UserRoundCheck} title="No people to show" />
      ) : (
        <DataTable rows={rows} columns={cols} getKey={(r) => r.name} />
      )}
    </Page>
  )
}
```

Note: confirm web `Avatar` import path matches `frontend-web/src/pages/Users.tsx` (it imports `Avatar` and uses `image={u.user_image ?? undefined}`). Match whatever that file imports.

- [ ] **Step 2: Register the route**

In `frontend-web/src/App.tsx`, add the import near `TodosDue` (~line 41):

```tsx
import LastSeen from '@web/pages/LastSeen'
```

Add the route after `/reports/todos-due` (~line 274), in the same non-gated reports block:

```tsx
<Route path="/reports/last-seen" element={<LastSeen />} />
```

- [ ] **Step 3: Add the gated Reports tile**

In `frontend-web/src/pages/Reports.tsx`:

Add imports:

```tsx
import { UserRoundCheck } from 'lucide-react'
import { useLastSeenAccess } from '@/hooks/useData'
```

Inside `Reports()`, add:

```tsx
  const { data: lastSeenAccess } = useLastSeenAccess()
  const showLastSeen = !!lastSeenAccess?.can && match('Last Seen', 'When each teammate was last active')
```

Update the count math (currently `filtered.length + (showTodosDue ? 1 : 0)` and subtitle `REPORTS.length + 1`):

```tsx
  const count = filtered.length + (showTodosDue ? 1 : 0) + (showLastSeen ? 1 : 0)
```

Render a tile parallel to the `showTodosDue` block (place right after it), using `rise(1)` so it animates after Todos Due:

```tsx
          {showLastSeen && (
            <div {...rise(1)}>
              <Card
                onClick={() => navigate('/reports/last-seen')}
                eyebrow={<ReportBadge icon={UserRoundCheck} accent="from-emerald-500 to-teal-600" />}
                title="Last Seen"
                meta="When each teammate was last active"
              />
            </div>
          )}
```

(Leave the header `subtitle` `REPORTS.length + 1` as-is — it counts the catalogue, not bespoke tiles; the visible `count` above is what matters. If precision is wanted, change the subtitle denominator to `REPORTS.length + 1 + (lastSeenAccess?.can ? 1 : 0)`.)

- [ ] **Step 4: Build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/LastSeen.tsx frontend-web/src/App.tsx frontend-web/src/pages/Reports.tsx
git commit -m "feat(web): Last Seen report screen + route + gated tile"
```

---

### Task 7: Mobile — inline presence (User dashboard + Users list)

**Files:**
- Modify: `frontend/src/pages/UserDashboardScreen.tsx` (identity card header, ~line 121-133)
- Modify: `frontend/src/pages/UsersScreen.tsx` (user card row, ~line 205-215)

**Interfaces:**
- Consumes: `presenceOf` (Task 3), `useBoot().data?.settings?.online_window_minutes`. `u.last_active` already present on `ManagedUser`.

- [ ] **Step 1: User dashboard presence line**

In `UserDashboardScreen.tsx`, add imports:

```tsx
import { presenceOf } from '@/lib/presence'
```

`useBoot` is likely already imported; if not, add it to the existing `@/hooks/useData` import. Inside the component, derive:

```tsx
  const win = boot?.settings?.online_window_minutes ?? 15
```

(Where `boot` comes from `useBoot()`; add `const { data: boot } = useBoot()` if the component doesn't already read boot.)

In the identity card, add a presence line under the email `<p>{u.name}</p>` (~line 123):

```tsx
                {(() => {
                  const p = presenceOf(u.last_active, win)
                  return (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      {p.label}
                    </p>
                  )
                })()}
```

- [ ] **Step 2: Users list presence**

In `UsersScreen.tsx`, add:

```tsx
import { presenceOf } from '@/lib/presence'
```

`useBoot` is already imported (used for `canManageUsers`). Derive `const win = boot?.settings?.online_window_minutes ?? 15` from the existing boot read. Inside the `filtered.map((u) => ...)` card (~line 205), add a presence dot to the row — insert after the name/identity block, before the row closes:

```tsx
              <span
                className={`ml-auto h-2.5 w-2.5 shrink-0 rounded-full ${
                  presenceOf(u.last_active, win).online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                title={presenceOf(u.last_active, win).label}
              />
```

(Match the exact row JSX; the goal is a small green/gray dot with the label in `title`. Confirm the boot variable name in this file — it may be `const { data: boot } = useBoot()` already.)

- [ ] **Step 3: Build + verify no type errors**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/UserDashboardScreen.tsx frontend/src/pages/UsersScreen.tsx
git commit -m "feat(mobile): inline presence on user dashboard + users list"
```

---

### Task 8: Web — inline presence (User dashboard + Users list)

**Files:**
- Modify: `frontend-web/src/pages/UserDashboard.tsx` (header badges row, ~line 124-135)
- Modify: `frontend-web/src/pages/Users.tsx` (add a "Last seen" column to `cols`, ~line 84+)

**Interfaces:**
- Consumes: `presenceOf`, `useBoot` window. `u.last_active` on `ManagedUser`.

- [ ] **Step 1: User dashboard presence chip**

In `UserDashboard.tsx`, add:

```tsx
import { presenceOf } from '@/lib/presence'
```

`useBoot` already imported (used at line 39 for `boot`). Derive `const win = boot?.settings?.online_window_minutes ?? 15`. In the badges row (~line 129, alongside the Active/Disabled chip), add:

```tsx
                {(() => {
                  const p = presenceOf(u.last_active, win)
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                      <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      {p.label}
                    </span>
                  )
                })()}
```

- [ ] **Step 2: Users list "Last seen" column**

In `Users.tsx`, add:

```tsx
import { presenceOf } from '@/lib/presence'
import { useBoot } from '@/hooks/useData'   // already imported at line 6 — merge, don't duplicate
```

`useBoot` is already imported (line 6). Inside the component derive `const win = boot?.settings?.online_window_minutes ?? 15` (add `const { data: boot } = useBoot()` if not already present — the file uses `canManageUsers(boot)` so it likely reads boot already). Add a column to `cols` (after the `status` column):

```tsx
    {
      key: 'lastSeen',
      header: 'Last seen',
      sortValue: (u) => (u.last_active ? new Date(u.last_active.replace(' ', 'T')).getTime() : 0),
      render: (u) => {
        const p = presenceOf(u.last_active, win)
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-ink">
            <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            {p.label}
          </span>
        )
      },
    },
```

- [ ] **Step 3: Build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/UserDashboard.tsx frontend-web/src/pages/Users.tsx
git commit -m "feat(web): inline presence on user dashboard + users table"
```

---

### Task 9: Settings UI — online window field (both frontends)

**Files:**
- Modify: `frontend/src/pages/SettingsScreen.tsx` (state + load + save payload + input row)
- Modify: `frontend-web/src/pages/Settings.tsx` (state + load + save payload + `Field`)

**Interfaces:**
- Consumes: `AppSettings.online_window_minutes` (Task 1), `useAppSettings`/`useSaveAppSettings`.

- [ ] **Step 1: Mobile settings row**

In `SettingsScreen.tsx`:
- Add state near the other numeric state: `const [onlineWindow, setOnlineWindow] = useState(15)`.
- In the load effect that seeds state from `useAppSettings()` data, add: `setOnlineWindow(loaded.online_window_minutes ?? 15)` (match the file's load pattern).
- In the `doSave` payload object, add: `online_window_minutes: onlineWindow,`.
- Add an input row (copy the "Under-occupied tolerance" card pattern, ~line 206), placed in an admin section:

```tsx
        <div className={card + ' flex flex-col gap-2'}>
          <label className="text-sm font-semibold text-stone-800 dark:text-slate-100">Online window (min)</label>
          {num(onlineWindow, setOnlineWindow, '15')}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            People active within this many minutes show as “Online”. Keep ≥ 10 — activity is recorded at most every ~10 minutes.
          </p>
        </div>
```

- [ ] **Step 2: Web settings field**

In `Settings.tsx`:
- Add state: `const [onlineWindow, setOnlineWindow] = useState<string>('15')`.
- In the load effect (where `loaded` seeds state, ~line 78): `setOnlineWindow(String(loaded.online_window_minutes ?? 15))`.
- In `doSave` payload (~line 147): `online_window_minutes: n(onlineWindow),`.
- Add the input near the other numeric settings (copy the "Grace (min)" `Field`, ~line 349):

```tsx
              <Field label="Online window (min)">
                {(id) => (
                  <input id={id} type="number" min={10} className={field} value={onlineWindow} onChange={(e) => setOnlineWindow(e.target.value)} placeholder="15" />
                )}
              </Field>
```

- [ ] **Step 3: Build both**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build && cd ../frontend-web && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx
git commit -m "feat(settings-ui): online window minutes input (both frontends)"
```

---

### Task 10: Ship — migrate, docs, restart, verify, What's New

**Files:**
- Modify: `docs/assets/data.js` (regenerated)
- Data: one App Release row on the live site

- [ ] **Step 1: Migrate the doctype change + restart**

The new Settings field needs a schema sync; Python + bundles need a reload.

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
sudo /usr/local/bin/tj-restart
```

Expected: migrate applies the `online_window_minutes` column to `tabVernon Settings` (Single); restart OK.

- [ ] **Step 2: Regenerate docs**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
```

Expected: `data.js` gains the two new endpoints (`last_seen_report`, `last_seen_access`). Commit:

```bash
git add docs/assets/data.js && git commit -m "docs: regenerate for last-seen endpoints"
```

- [ ] **Step 3: End-to-end verify (real endpoints + built bundles)**

Backend, as Administrator:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
from vernon_project.api.report import last_seen_access, last_seen_report
print("access:", last_seen_access())
r = last_seen_report()
print("scope:", r["scope"], "rows:", len(r["rows"]))
print("sample:", r["rows"][0] if r["rows"] else None)
EOF
```

Expected: `access: {'can': True, 'scope': 'all'}`, a non-zero row count, sample row has `name`, `full_name`, `last_active`, `member_type`.

Confirm the feature is in the shipped bundle (not just source):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -ao "last_seen_report" vernon_project/public/frontend/assets/*.js | head -1
grep -ao "last_seen_report" vernon_project/public/frontend_web/assets/*.js | head -1
```

Expected: a hit in each — proves both bundles carry the feature. Also load `/w/reports` and `/m/reports` in a browser (or via the run skill) and confirm the "Last Seen" tile appears for an admin and the screen lists people with green/gray dots.

- [ ] **Step 4: What's New (only after Step 1-3 confirm it's live)**

Write the row to a JSON file and insert loop-free (per project convention). Bump `version` from the newest existing App Release row; set `release_date` to the actual go-live date.

```bash
cat > /tmp/last_seen_release.json <<'EOF'
[
  {
    "version": "<next-semver-minor>",
    "release_date": "<YYYY-MM-DD>",
    "title": "Lihat kapan rekan terakhir aktif",
    "notes": "Tahu siapa yang sedang online sekarang dan kapan terakhir aktif, di halaman profil pengguna dan daftar pengguna (/m & /w)\nLaporan “Last Seen” baru: lihat seluruh tim (untuk admin) atau anggota proyek yang kamu pimpin, urut dari yang paling lama tidak aktif\nAtur ambang “online” lewat Pengaturan (default 15 menit)",
    "platform": "Both",
    "published": 1
  }
]
EOF
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/last_seen_release.json"))])
frappe.db.commit()
EOF
```

Verify through the real endpoint, once per platform:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[0])
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[0])
EOF
```

Expected: the new row is the newest for both platforms.

- [ ] **Step 5: Final commit (if any tracked files remain)**

```bash
git add -A && git commit -m "chore(last-seen): docs + release notes" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Data source `User.last_active`, no tracking → Tasks 2/3 (reuse), presence math parses it. ✅
- Calibration knob (10-min throttle → 15-min default) → Task 1 floor + Task 3 default + comments. ✅
- Presence model shared `presenceOf` + self-check → Task 3. ✅
- Backend `last_seen_report` (sysmgr all / leader team / else 403) + `last_seen_access` → Task 2 with tests. ✅
- Bespoke report screen both frontends + gated tile → Tasks 5 (mobile) + 6 (web). ✅
- Inline surfaces: user dashboard both + people list both → Tasks 7 + 8. (Spec said "people/team lists"; mapped to the **Users admin list** because `ManagedUser` already carries `last_active` — the project-team roster is bare emails and would need a broad payload change. Documented deviation, YAGNI.) ✅
- Configurable window in both Settings UIs + boot exposure → Tasks 1 + 9. ✅
- Docs regen + What's New → Task 10. ✅
- Tests: backend (Task 2) + presence self-check (Task 3). ✅

**Placeholder scan:** No TBD/TODO. `<next-semver-minor>` / `<YYYY-MM-DD>` in Task 10 are intentional runtime values (newest-row-dependent, go-live-date-dependent) with explicit instructions to resolve them — not code placeholders.

**Type consistency:** `presenceOf(lastActive, onlineWindowMin) -> {online,label}` used identically in Tasks 5/6/7/8. `LastSeenRow` fields (`name, full_name, user_image, enabled, last_active, member_type`) match the backend `frappe.get_all` fields in Task 2 (`custom_member_type as member_type`). `last_seen_access() -> {can, scope}` consistent across Task 2/4/5/6. `online_window_minutes` name identical across doctype, boot, AppSettings, both Settings UIs.

**Known verification caveats for the implementer:**
- Line numbers are from a snapshot — locate by nearby symbol, not the number.
- Confirm `Avatar` import paths per-frontend (mobile `@/components/Avatar`, web whatever `Users.tsx` uses) before relying on the snippet.
- Confirm each edited screen already reads `boot` via `useBoot()`; add the hook call if absent rather than assuming.
