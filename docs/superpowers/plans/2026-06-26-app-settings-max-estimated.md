# App Settings — Max Estimated Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A manager-editable "Vernon Settings" Single with `max_estimated_minutes` that hard-blocks over-estimate todo saves and drives the Data Health outlier threshold, with a Settings editor on web + mobile.

**Architecture:** New `Vernon Settings` Single doctype. Project Todo `validate()` enforces the cap. `data_health()` reads the cap (replaces hardcoded 1440). Whitelisted `get_app_settings`/`save_app_settings` (mirroring Badge Settings). Web + mobile Settings screens via the shared api/hook/types (`@/` = ../frontend/src).

**Tech Stack:** Frappe (Single doctype, whitelisted API, Project Todo controller), React/TS (`frontend/` mobile + `frontend-web/` web), React Query.

## Global Constraints

- LIVE site, no test DB — verify via `bench console` + manual; deploy: schema → `migrate`, Python → `bench restart` (USER; console picks up new code for verification), frontend → `npm run build` (deferred to final task).
- Manager gate: System Manager OR Group Manager → else `frappe.throw("Not permitted", frappe.PermissionError)`. `get_app_settings` is readable by any authenticated user.
- `max_estimated_minutes <= 0` (or unset) means NO limit (skip enforcement + skip the health outlier check).
- Mirror the existing Badge Settings wiring exactly: `get_badge_settings`/`save_badge_settings` (mobile.py), `getBadgeSettings`/`saveBadgeSettings` (api.ts), `useBadgeSettings`/`useSaveBadgeSettings` (useData.ts), `BadgeSettingsScreen.tsx` (mobile), the web Badge Settings page.
- No native alert/confirm/prompt in frontends.

---

### Task 1: Vernon Settings Single doctype

**Files:** Create `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`, `__init__.py`, `vernon_settings.py`.

- [ ] **Step 1: Create the doctype JSON** — `vernon_settings/vernon_settings.json`:
```json
{
 "actions": [],
 "creation": "2026-06-26 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["max_estimated_minutes"],
 "fields": [
  {
   "fieldname": "max_estimated_minutes",
   "fieldtype": "Int",
   "label": "Max Estimated Minutes (per todo)",
   "non_negative": 1,
   "default": "1440",
   "description": "Maximum estimated minutes allowed on a single todo. 0 = no limit."
  }
 ],
 "issingle": 1,
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-26 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Vernon Settings",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Group Manager", "read": 1, "write": 1}
 ],
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 2: Create `vernon_settings/__init__.py`** (empty file).

- [ ] **Step 3: Create the controller** `vernon_settings/vernon_settings.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class VernonSettings(Document):
	pass
```

- [ ] **Step 4: Migrate** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`. Expected: `Vernon Settings` synced; `tabSingles` holds it.

- [ ] **Step 5: Verify** — `bench --site project.vernon.id console`:
```python
import frappe
print(frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes"))
```
Expected: `1440` (default).

- [ ] **Step 6: Commit**
```bash
git add vernon_project/vernon_project/doctype/vernon_settings/
git commit -m "feat(settings): Vernon Settings single + max_estimated_minutes"
```

---

### Task 2: Backend — enforce cap, drive health threshold, get/save API

**Files:** Modify `vernon_project/vernon_project/doctype/project_todo/project_todo.py` (validate); `vernon_project/api/mobile.py` (data_health + 2 endpoints).

**Interfaces:**
- Produces: `get_app_settings()` → `{"max_estimated_minutes": int}`; `save_app_settings(max_estimated_minutes)` → `{"max_estimated_minutes": int}`.

- [ ] **Step 1: Add `validate_estimated_max` to ProjectTodo.** In `project_todo.py`, register it in `validate()` after the existing field validators (e.g. after `validate_done_todo_fields()`), and add the method:
```python
	def validate_estimated_max(self):
		mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0
		if mx and self.estimated and float(self.estimated) > mx:
			frappe.throw(
				f"Estimated minutes ({int(float(self.estimated))}) exceeds the maximum ({int(mx)})."
			)
```
(Confirm `frappe` is imported in the file — it is.)

- [ ] **Step 2: data_health outlier uses the setting.** In `mobile.py` `data_health()`, near the top read `mx = frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0`. Replace the outlier block so that when `mx <= 0` it skips (outliers=[], outliers_n=0), else runs the existing queries with `mx` bound instead of the literal `1440`:
```python
	if mx and mx > 0:
		outliers = frappe.db.sql(
			"""
			SELECT name, to_do, `group`, status,
			       CONCAT('estimated ', ROUND(estimated), ' min') AS detail
			FROM `tabProject Todo`
			WHERE status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND estimated > %(mx)s
			ORDER BY estimated DESC LIMIT %(cap)s
			""",
			{"mx": mx, "cap": CAP}, as_dict=True,
		)
		outliers_n = frappe.db.sql(
			"SELECT COUNT(*) FROM `tabProject Todo` "
			"WHERE status IN ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL') AND estimated > %(mx)s",
			{"mx": mx},
		)[0][0]
	else:
		outliers, outliers_n = [], 0
```
(Keep `pack(outliers)` in the return as-is.)

- [ ] **Step 3: Add the two endpoints** (near `get_badge_settings`/`save_badge_settings`):
```python
@frappe.whitelist()
def get_app_settings():
	return {
		"max_estimated_minutes": int(
			frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes") or 0
		)
	}


@frappe.whitelist()
def save_app_settings(max_estimated_minutes):
	roles = set(frappe.get_roles(frappe.session.user))
	if not ({"System Manager", "Group Manager"} & roles):
		frappe.throw("Not permitted", frappe.PermissionError)
	val = int(max_estimated_minutes)
	if val < 0:
		frappe.throw("Max estimated minutes cannot be negative.")
	settings = frappe.get_single("Vernon Settings")
	settings.max_estimated_minutes = val
	settings.save(ignore_permissions=True)
	return {"max_estimated_minutes": val}
```

- [ ] **Step 4: Verify (console; no restart needed for console).** `bench --site project.vernon.id console`:
```python
import frappe
from vernon_project.api import mobile
frappe.set_user("Administrator")
frappe.db.set_single_value("Vernon Settings", "max_estimated_minutes", 100)
print(mobile.get_app_settings())                     # {'max_estimated_minutes': 100}
print(mobile.data_health()["counts"]["outliers"])    # count of estimated>100 in-flight
t = frappe.new_doc("Project Todo"); t.estimated = 200
try:
    t.validate_estimated_max(); print("NO THROW (bug)")
except Exception as e:
    print("blocked:", str(e)[:60])
frappe.db.rollback()
```
Expected: settings reads 100; outliers count printed; the 200-min todo is blocked. (Rollback — restores the value.)

- [ ] **Step 5: Commit**
```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py vernon_project/api/mobile.py
git commit -m "feat(settings): enforce max estimated; health outlier uses setting; get/save app settings"
```

---

### Task 3: Frontend data layer + mobile Settings screen

**Files:** Modify `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/hooks/useData.ts`; create `frontend/src/pages/SettingsScreen.tsx`; modify `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx`. SOURCE ONLY (no build).

- [ ] **Step 1: Types** — `types.ts`: `export interface AppSettings { max_estimated_minutes: number }`.

- [ ] **Step 2: API client** — `api.ts`, mirror `getBadgeSettings`/`saveBadgeSettings`:
```typescript
  getAppSettings: () => api.get<import('./types').AppSettings>(M + 'get_app_settings'),
  saveAppSettings: (maxEstimatedMinutes: number) =>
    api.post<import('./types').AppSettings>(M + 'save_app_settings', {
      max_estimated_minutes: maxEstimatedMinutes,
    }),
```

- [ ] **Step 3: Hooks** — `useData.ts`, mirror `useBadgeSettings`/`useSaveBadgeSettings`:
```typescript
export function useAppSettings() {
  return useQuery({ queryKey: ['app-settings'], queryFn: () => mobileApi.getAppSettings() as Promise<AppSettings> })
}
export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (maxEstimatedMinutes: number) => mobileApi.saveAppSettings(maxEstimatedMinutes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  })
}
```
(Import `AppSettings` from `@/lib/types`; match how the file imports other types + `useQueryClient`.)

- [ ] **Step 4: Mobile SettingsScreen** — create `frontend/src/pages/SettingsScreen.tsx`. READ `frontend/src/pages/BadgeSettingsScreen.tsx` first; mirror its structure (DetailScreen, manager gate via `canManageGroups(boot)`, useBoot, Spinner while loading, toast). Contents: a single labeled number input bound to `max_estimated_minutes` (seed from `useAppSettings`), help text "0 = no limit", and a Save button calling `useSaveAppSettings().mutate(value, {onSuccess: toast 'Settings saved'})`. Block non-managers with the same access pattern BadgeSettingsScreen uses.

- [ ] **Step 5: Route** — `frontend/src/App.tsx`: import `SettingsScreen`, add `<Route path="/settings" element={<SettingsScreen />} />` inside the manager-gated block (next to `/badge-settings`).

- [ ] **Step 6: Profile nav** — `frontend/src/pages/Profile.tsx`: add a manager-gated `<Row icon={Settings} label="Settings" hue="slate" onClick={() => navigate('/settings')} />` (import `Settings` from lucide-react), gated by the same check Badge Settings uses (`canManageBadges`/`canManageGroups` — match whichever gates the existing "Manage Badges" row's neighbor; use `canManageGroups(boot)`).

- [ ] **Step 7: Typecheck** — `cd frontend && npx tsc --noEmit` → 0 errors; `cd frontend-web && npx tsc --noEmit` → 0 (shared changes OK).

- [ ] **Step 8: Commit**
```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend/src/pages/SettingsScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(mobile): Settings screen — max estimated minutes (manager-gated)"
```

---

### Task 4: Web Settings page

**Files:** Create `frontend-web/src/pages/Settings.tsx`; modify `frontend-web/src/App.tsx`, `frontend-web/src/components/AppShell.tsx`. SOURCE ONLY.

- [ ] **Step 1: Web Settings page** — create `frontend-web/src/pages/Settings.tsx`. READ the web Badge Settings page (find it: `grep -rl useBadgeSettings frontend-web/src/pages`) and `frontend-web/src/pages/Reports.tsx` for bento style. Mirror: manager gate (`canManageGroups(boot)`), `useAppSettings()` + `useSaveAppSettings()`, a single number input for `max_estimated_minutes` ("0 = no limit") in a bento tile, Save button (toast). Access notice for non-managers.

- [ ] **Step 2: Route** — `frontend-web/src/App.tsx`: import `Settings`, add `<Route path="/settings" element={<Settings />} />` (gated like the other admin routes, e.g. by `canManageGroups`).

- [ ] **Step 3: Nav** — `frontend-web/src/components/AppShell.tsx`: add a manager-gated admin nav item to `/settings` (label "Settings", lucide `Settings` icon), mirroring the Data Health / Groups entries; add a `settings` breadcrumb entry to the SECTION map.

- [ ] **Step 4: Typecheck** — `cd frontend-web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**
```bash
git add frontend-web/src/pages/Settings.tsx frontend-web/src/App.tsx frontend-web/src/components/AppShell.tsx
git commit -m "feat(web): Settings page — max estimated minutes (manager-gated)"
```

---

### Task 5: Build, deploy, verify

- [ ] **Step 1: Build both** — `cd frontend && npm run build` (exit 0); `cd frontend-web && npm run build` (exit 0).
- [ ] **Step 2: Deploy** — `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate` then USER runs `bench restart` (loads new Python: validate enforcement + endpoints). Commit assets:
```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js
git commit -m "build: app settings (max estimated minutes) assets"
```
- [ ] **Step 3: Manual verify (after restart + cache refresh).** As a manager open Settings (web + mobile): change max to e.g. 480, save. Create/edit a todo with estimated 600 → save is blocked with the max message; 300 → saves. Data Health outliers reflect the new max. A non-manager cannot save settings.

---

## Self-Review

- **Spec coverage:** doctype (T1), hard block + health single-source + get/save API (T2), mobile editor + data layer (T3), web editor (T4), build/deploy/verify (T5). All spec sections mapped.
- **Placeholder scan:** doctype JSON + backend code + api/hook/types are full code; the two Settings screens reference the exact Badge Settings files to mirror (read-first) since they are pattern-derived UI — components + bindings specified.
- **Type consistency:** `AppSettings.max_estimated_minutes` (number) used in api.ts, useData.ts, both screens; endpoints return `{max_estimated_minutes:int}` matching. `get_app_settings`/`save_app_settings` names identical across backend + api client.
