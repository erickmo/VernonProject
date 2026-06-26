# Data Health Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A manager-only "Data Health" web page that flags 4 todo data-quality problems via one backend endpoint.

**Architecture:** One whitelisted `data_health()` endpoint in `api/mobile.py` runs 4 SQL checks and returns counts + capped item lists. A `DataHealth.tsx` web page (bento) renders them, fetched through the existing mobileApi client + a React-Query hook. Route + manager-gated nav entry added.

**Tech Stack:** Frappe Python (whitelisted API), React/TS web app (`frontend-web/`, shares `@/` = ../frontend/src), React Query, bento components.

## Global Constraints

- LIVE single site, no test DB — verify via `bench console` + manual web load (no pytest).
- Deploy: Python endpoint needs `bench restart` (USER runs — sudo; `bench console` picks up new code without restart for verification). Web build deferred to the final task (`npm run build` writes live).
- Manager gate: allow only roles `System Manager`, `Group Manager`, `Project Owner` (pattern: `frappe.throw("Not permitted", frappe.PermissionError)`).
- Statuses: in-flight = `⚪️ Planned`,`🟠 Done`,`🔷 Checked By PL`; non-cancelled = status != `🚫 Cancelled`.
- Outlier threshold = `estimated > 1440` minutes (constant).
- Each item: `{name, to_do, group, status, detail}`. Lists capped at 200; counts reflect true totals.
- No native alert/confirm/prompt in the web page.

---

### Task 1: Backend `data_health()` endpoint

**Files:** Modify `vernon_project/vernon_project/api/mobile.py` (append a new whitelisted function near other report/admin endpoints).

**Interfaces:**
- Produces: `data_health()` → `{"counts":{unmapped,outliers,missing,orphaned,total}, "unmapped":[...], "outliers":[...], "missing":[...], "orphaned":[...]}`.

- [ ] **Step 1: Add the endpoint.** Append to `mobile.py`:

```python
@frappe.whitelist()
def data_health():
	"""Manager-only data-quality report over Project Todo. See
	docs/superpowers/specs/2026-06-26-data-health-report-design.md."""
	roles = set(frappe.get_roles(frappe.session.user))
	if not ({"System Manager", "Group Manager", "Project Owner"} & roles):
		frappe.throw("Not permitted", frappe.PermissionError)

	INFLIGHT = ("⚪️ Planned", "🟠 Done", "🔷 Checked By PL")
	CAP = 200

	def pack(rows):
		return [
			{
				"name": r.name,
				"to_do": r.to_do,
				"group": r.group,
				"status": r.status,
				"detail": r.detail,
			}
			for r in rows
		]

	# 1. Unmapped type/level
	unmapped = frappe.db.sql(
		"""
		SELECT name, to_do, `group`, status, 'no type/level' AS detail
		FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND level_id IS NULL
		ORDER BY modified DESC LIMIT %(cap)s
		""",
		{"inflight": INFLIGHT, "cap": CAP}, as_dict=True,
	)
	unmapped_n = frappe.db.sql(
		"SELECT COUNT(*) FROM `tabProject Todo` WHERE status IN %(inflight)s AND level_id IS NULL",
		{"inflight": INFLIGHT},
	)[0][0]

	# 2. Outlier estimate (> 24h on one task)
	outliers = frappe.db.sql(
		"""
		SELECT name, to_do, `group`, status,
		       CONCAT('estimated ', ROUND(estimated), ' min') AS detail
		FROM `tabProject Todo`
		WHERE status != '🚫 Cancelled' AND estimated > 1440
		ORDER BY estimated DESC LIMIT %(cap)s
		""",
		{"cap": CAP}, as_dict=True,
	)
	outliers_n = frappe.db.sql(
		"SELECT COUNT(*) FROM `tabProject Todo` WHERE status != '🚫 Cancelled' AND estimated > 1440"
	)[0][0]

	# 3. Missing fields (in-flight)
	missing_rows = frappe.db.sql(
		"""
		SELECT name, to_do, `group`, status, estimated, deadline, start_date
		FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND (
			`group` IS NULL OR `group` = '' OR estimated IS NULL OR estimated = 0
			OR deadline IS NULL OR start_date IS NULL
		)
		ORDER BY modified DESC LIMIT %(cap)s
		""",
		{"inflight": INFLIGHT, "cap": CAP}, as_dict=True,
	)
	for r in missing_rows:
		miss = []
		if not r.group:
			miss.append("group")
		if not r.estimated:
			miss.append("estimate")
		if not r.deadline:
			miss.append("deadline")
		if not r.start_date:
			miss.append("start_date")
		r.detail = "missing: " + ", ".join(miss)
	missing_n = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabProject Todo`
		WHERE status IN %(inflight)s AND (
			`group` IS NULL OR `group` = '' OR estimated IS NULL OR estimated = 0
			OR deadline IS NULL OR start_date IS NULL)
		""",
		{"inflight": INFLIGHT},
	)[0][0]

	# 4. Orphaned level_id or junk title
	orphaned = frappe.db.sql(
		"""
		SELECT t.name, t.to_do, t.`group`, t.status,
		       CASE
		         WHEN t.level_id IS NOT NULL AND gl.level_id IS NULL THEN 'orphaned level_id'
		         ELSE 'junk title'
		       END AS detail
		FROM `tabProject Todo` t
		LEFT JOIN `tabGroup Level` gl ON gl.level_id = t.level_id
		WHERE t.status != '🚫 Cancelled' AND (
		      (t.level_id IS NOT NULL AND gl.level_id IS NULL)
		   OR LOWER(TRIM(t.to_do)) IN ('x','seed','test','testing')
		   OR CHAR_LENGTH(TRIM(t.to_do)) <= 2
		)
		ORDER BY t.modified DESC LIMIT %(cap)s
		""",
		{"cap": CAP}, as_dict=True,
	)
	orphaned_n = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabProject Todo` t
		LEFT JOIN `tabGroup Level` gl ON gl.level_id = t.level_id
		WHERE t.status != '🚫 Cancelled' AND (
		      (t.level_id IS NOT NULL AND gl.level_id IS NULL)
		   OR LOWER(TRIM(t.to_do)) IN ('x','seed','test','testing')
		   OR CHAR_LENGTH(TRIM(t.to_do)) <= 2)
		"""
	)[0][0]

	return {
		"counts": {
			"unmapped": unmapped_n, "outliers": outliers_n,
			"missing": missing_n, "orphaned": orphaned_n,
			"total": unmapped_n + outliers_n + missing_n + orphaned_n,
		},
		"unmapped": pack(unmapped),
		"outliers": pack(outliers),
		"missing": pack(missing_rows),
		"orphaned": pack(orphaned),
	}
```

- [ ] **Step 2: Verify in console** (fresh console loads new code; no restart needed for this check).

Run: `bench --site project.vernon.id console`:
```python
import frappe
from vernon_project.api import mobile
frappe.set_user("Administrator")
res = mobile.data_health()
print(res["counts"])
# cross-check one count against direct SQL:
print(frappe.db.sql("SELECT COUNT(*) FROM `tabProject Todo` WHERE status IN ('⚪️ Planned','🟠 Done','🔷 Checked By PL') AND level_id IS NULL")[0][0])
```
Expected: `counts` dict prints; the unmapped count matches the direct SQL.

- [ ] **Step 3: Commit**
```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(api): data_health endpoint (4 todo data-quality checks, manager-gated)"
```

---

### Task 2: Web data layer + Data Health page

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `dataHealth()` to the mobileApi client — follow how `dashboard()`/`bootstrap()` call their whitelisted method)
- Modify: `frontend/src/lib/types.ts` (add `DataHealthItem` + `DataHealth` interfaces — shared via `@/`)
- Modify: `frontend/src/hooks/useData.ts` (add `useDataHealth()` query hook)
- Create: `frontend-web/src/pages/DataHealth.tsx`
- Modify: `frontend-web/src/App.tsx` (route `/data-health`)
- Modify: `frontend-web/src/components/AppShell.tsx` (nav entry, manager-gated)

**Interfaces:**
- Consumes Task 1's endpoint. Produces `useDataHealth()` returning `{counts, unmapped, outliers, missing, orphaned}`.

- [ ] **Step 1: Types** — in `frontend/src/lib/types.ts` add:
```typescript
export interface DataHealthItem { name: string; to_do: string; group: string | null; status: string; detail: string }
export interface DataHealth {
  counts: { unmapped: number; outliers: number; missing: number; orphaned: number; total: number }
  unmapped: DataHealthItem[]; outliers: DataHealthItem[]; missing: DataHealthItem[]; orphaned: DataHealthItem[]
}
```

- [ ] **Step 2: API client method** — in `frontend/src/lib/api.ts`, add a `dataHealth` method to the mobileApi object mirroring the existing `dashboard()` method (same call mechanism, method path `...api.mobile.data_health`). Read the file to match the exact pattern used by neighboring methods.

- [ ] **Step 3: Hook** — in `frontend/src/hooks/useData.ts` add:
```typescript
export function useDataHealth() {
  return useQuery({ queryKey: ['data-health'], queryFn: () => mobileApi.dataHealth() as Promise<DataHealth>, retry: false })
}
```
(Import `DataHealth` from `@/lib/types` if the file uses explicit type imports.)

- [ ] **Step 4: Page** — create `frontend-web/src/pages/DataHealth.tsx`. Read `frontend-web/src/pages/Reports.tsx` first to match bento usage/style. Structure:
  - `const { data, isLoading, error } = useDataHealth()`.
  - On `error` (PermissionError) → render the existing error/empty-state component with an access notice.
  - Header "Data Health".
  - Top `BentoTile` (sm, tint) with `BentoStat value={data.counts.total} label="problems"` — accent red/amber when total>0 else emerald.
  - One section per check (`unmapped|outliers|missing|orphaned`) rendered as a `BentoTile span="full"`: title + count badge (red when >0); map its items to clickable rows (to_do · group · status · detail) navigating to the web todo route used by `ProjectItem` (match how other web pages link to a todo — read `Reports.tsx`/`ProjectItem` route usage). Empty state "No issues" when the list is empty. If `list.length < count`, show "showing {list.length} of {count}".

- [ ] **Step 5: Route** — in `frontend-web/src/App.tsx`, import `DataHealth` and add `<Route path="/data-health" element={<DataHealth />} />` next to the `/reports` route.

- [ ] **Step 6: Nav (manager-gated)** — in `frontend-web/src/components/AppShell.tsx`, add a nav item `{ to: '/data-health', label: 'Data Health', icon: <pick a lucide icon e.g. ShieldAlert> }` next to Reports. Gate it to managers: reuse the existing role check the shell already uses for manager-only items (read AppShell for how it conditionally renders nav by role; if none exists, gate via `canManageGroups(boot)` from `@/lib/...` as GroupForm does). Import the icon from `lucide-react`.

- [ ] **Step 7: Typecheck** — `cd frontend-web && npx tsc --noEmit` → 0 errors. Also `cd frontend && npx tsc --noEmit` → 0 (shared types/hook).

- [ ] **Step 8: Commit**
```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend-web/src/pages/DataHealth.tsx frontend-web/src/App.tsx frontend-web/src/components/AppShell.tsx
git commit -m "feat(web): Data Health page (manager-gated) + hook/types/api"
```

---

### Task 3: Build, deploy, verify

**Files:** none.

- [ ] **Step 1: Build web** — `cd frontend-web && npm run build` → exit 0. (Mobile unaffected, but if shared types changed and you want parity, `cd frontend && npm run build` too — optional; the endpoint is web-only.)

- [ ] **Step 2: Deploy** — USER runs `bench restart` (loads the new Python endpoint). Commit built assets:
```bash
git add vernon_project/public/frontend_web vernon_project/www/w.html
git commit -m "build: data health page assets"
```

- [ ] **Step 3: Manual verify (after restart + cache refresh)** — load `/w/data-health` as a manager: 4 sections render with counts; an item links to its todo. Confirm a non-manager user is blocked (access notice). Spot-check one count vs the desk/DB.

---

## Self-Review

- **Spec coverage:** 4 checks (Task 1 SQL), manager gate (Task 1 + nav Task 2.6), web page + counts + capped lists + links (Task 2.4), route/nav (2.5/2.6), build/deploy/verify (Task 3). All spec sections mapped.
- **Placeholder scan:** Task 1 endpoint is full code. Task 2 page/api/nav steps reference exact files + the existing patterns to mirror (Reports.tsx, dashboard() method, AppShell role gate) rather than vague "similar to"; the page is genuinely pattern-derived UI, so structure + component names are specified with the reference files to read.
- **Type consistency:** `DataHealth`/`DataHealthItem` defined in Task 2.1 and consumed by the hook (2.3) and page (2.4); endpoint return shape (Task 1) matches the `DataHealth` interface field-for-field (counts keys + 4 arrays + item fields name/to_do/group/status/detail).
