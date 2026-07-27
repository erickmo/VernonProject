# Nametag: real photo + intern school/major + forced photo upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The printable employee nametag shows a real face photo (never the gamified avatar) and, for interns, their school + major; users without a real photo can be force-prompted to upload one.

**Architecture:** New self-editable `photo` field on `Employee Profile` (independent of the avatar-clobbered `User.user_image`). `get_team_wall` returns `photo` + intern `school`/`major` (highest-level education). A shared `PhotoUpload` control lives on both self-service profile screens; a shared, blocking `PhotoGate` (toggle-gated, default-off, mirroring the DISC-reminder eligibility) forces upload for Internal-Team/Intern users who have none. The nametag prefers `photo` and adds the intern line.

**Tech Stack:** Frappe (Python) backend; two React + Vite + Tailwind frontends (`frontend/` = mobile `/m` Soft-Pop, `frontend-web/` = web `/w` bento). Shared TS in `frontend/src` (web imports as `@`).

## Global Constraints

- **Both frontends ship every UI change** — mobile Soft-Pop card style, web bento tiles. A change in one is not done until the other has the equivalent.
- **No native `<select>`** — use `SearchableSelect`. **No native `alert/confirm`** — use the toast/dialog already in each screen.
- **User-facing copy is Bahasa Indonesia.**
- **`force_photo_upload` defaults to `0` (off)** — the gate ships inert until an admin enables it.
- **Real-photo guidance copy (verbatim):** `Gunakan foto asli wajahmu — bukan avatar, kartun, atau logo.`
- After adding endpoints: `python3 scripts/gen_docs.py` and commit `docs/assets/data.js`.
- Ship = migrate + rebuild **both** bundles + `sudo /usr/local/bin/tj-restart`. What's New (App Release) covers only the visible parts (photo upload, real photo on tag, intern school/major) — NOT the inert gate.
- Only `git add` files this plan creates/modifies (the user works in the same tree in parallel).

---

### Task 1: `Employee Profile.photo` field

**Files:**
- Modify: `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json`

**Interfaces:**
- Produces: an `Attach Image` field `photo` (permlevel 0, self-editable) on `Employee Profile`, read by Task 4/5 and written by Task 4.

- [ ] **Step 1: Add `photo` to `field_order`** (line 11) — insert right after `"personal_section"`:

```json
  "personal_section", "photo", "gender", "religion", "verse_enabled", "focus_mode", "home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
```

- [ ] **Step 2: Add the field definition** — immediately after the `personal_section` Section Break field (line 21), add a new line:

```json
  {"fieldname": "photo", "fieldtype": "Attach Image", "label": "Foto (foto asli, bukan avatar)"},
```

- [ ] **Step 3: Migrate and verify the field exists**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'EOF'
print(bool(frappe.get_meta("Employee Profile", cached=False).get_field("photo")))
EOF
```
Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/employee_profile/employee_profile.json
git commit -m "feat(employee-profile): add real-photo field (photo, self-editable)"
```

---

### Task 2: `Vernon Settings.force_photo_upload` flag

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`

**Interfaces:**
- Produces: Check field `force_photo_upload` (default 0), read by Task 6 (`get_photo_gate`) and Task 12 (settings plumbing).

- [ ] **Step 1: Add to `field_order`** (line 6) — insert `"force_photo_upload"` between `"disc_reminder_hours"` and `"recognition_section"`:

```
..., "force_disc_reminder", "disc_reminder_hours", "force_photo_upload", "recognition_section", ...
```

- [ ] **Step 2: Add the field definition** — immediately after the `disc_reminder_hours` field object (the one with `"depends_on": "force_disc_reminder"`), add:

```json
  {
   "fieldname": "force_photo_upload",
   "fieldtype": "Check",
   "label": "Force Profile Photo Upload",
   "default": "0",
   "description": "When on, Internal-Team & Intern users with no real profile photo are shown a blocking modal on app open and must upload one before using the app. 0 = off (no gate)."
  },
```

- [ ] **Step 3: Migrate and verify**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'EOF'
print(frappe.db.get_single_value("Vernon Settings", "force_photo_upload"))
EOF
```
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json
git commit -m "feat(settings): add force_photo_upload flag (default off)"
```

---

### Task 3: `upload_profile_photo` endpoint

**Files:**
- Modify: `vernon_project/api/mobile.py` (add after `upload_reward_image`, ~line 3346)

**Interfaces:**
- Consumes: module constants `ALLOWED_IMAGE_EXT`, `ALLOWED_IMAGE_MIME`, `MAX_IMAGE_BYTES` (already defined near `upload_reward_image`).
- Produces: whitelisted `upload_profile_photo()` returning `{"file_url": <public url>}`; called by Task 7's `uploadProfilePhoto`.

- [ ] **Step 1: Add the endpoint** (mirrors `upload_reward_image`, but self-service login guard instead of the manager gate):

```python
@frappe.whitelist()
def upload_profile_photo():
	"""Save the caller's uploaded REAL profile photo as a public File and return its URL.
	Self-service: any logged-in user sets their OWN photo (the form stores the URL on
	Employee Profile.photo via update_my_profile). Independent of the avatar snapshot,
	which clobbers User.user_image. Raster images only — served public, so SVG/HTML
	(stored-XSS vectors) are rejected by extension + MIME."""
	if frappe.session.user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	import os
	from frappe.utils.file_manager import save_file

	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")

	ext = os.path.splitext(f.filename or "")[1].lower()
	if ext not in ALLOWED_IMAGE_EXT:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	mimetype = (getattr(f, "mimetype", "") or "").lower()
	if mimetype and mimetype not in ALLOWED_IMAGE_MIME:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")

	content = f.stream.read()
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw("Image too large (max 5 MB).")

	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}
```

- [ ] **Step 2: Verify it imports and is whitelisted** (no separate unit test — structurally identical to the proven `upload_reward_image`; multipart is exercised in the Task 13 E2E):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import vernon_project.api.mobile as m
print(getattr(m.upload_profile_photo, "whitelisted", False), callable(m.upload_profile_photo))
EOF
```
Expected: `True True`

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(api): upload_profile_photo endpoint (self-service real photo)"
```

---

### Task 4: `update_my_profile` writes `photo`; boot returns it

**Files:**
- Modify: `vernon_project/api/mobile.py` — `EMPLOYEE_SOFT_FIELDS` (line 27) and `update_my_profile` (line 5589)
- Test: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Consumes: `_ensure_employee_profile` (already imported/used in `update_my_profile`), `Employee Profile.photo` (Task 1).
- Produces: `update_my_profile(photo=...)` persists the field; `get_bootstrap`'s `employee` dict includes `photo` (via `EMPLOYEE_SOFT_FIELDS`), consumed by Task 10.

- [ ] **Step 1: Write the failing test** — add to `test_mobile.py`:

```python
class TestProfilePhoto(unittest.TestCase):
	def test_update_my_profile_sets_photo(self):
		from vernon_project.api.mobile import update_my_profile
		email = "photo_probe@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": "Photo Probe",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.set_user(email)
		try:
			update_my_profile(photo="/files/real_face.png")
			self.assertEqual(
				frappe.db.get_value("Employee Profile", {"user": email}, "photo"),
				"/files/real_face.png",
			)
		finally:
			frappe.set_user("Administrator")
```

- [ ] **Step 2: Run it — expect FAIL** (`update_my_profile() got an unexpected keyword argument 'photo'`):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_update_my_profile_sets_photo
```
Expected: FAIL

- [ ] **Step 3a: Add `"photo"` to `EMPLOYEE_SOFT_FIELDS`** (line 27) so boot returns it:

```python
EMPLOYEE_SOFT_FIELDS = (
	"photo",
	"home_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
	"religion", "verse_enabled", "focus_mode", "gender",
)
```

- [ ] **Step 3b: Add the `photo` parameter + write** in `update_my_profile`. Add `photo=None,` to the signature (alongside `home_address=None`), and after the `gender` block add:

```python
	if photo is not None:
		doc.set("photo", (photo or "").strip() or None)
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_update_my_profile_sets_photo
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(api): update_my_profile writes photo; boot returns it"
```

---

### Task 5: `get_team_wall` returns `photo`, `is_intern`, `school`, `major`

**Files:**
- Modify: `vernon_project/api/mobile.py` — add `EDU_LEVELS` + `_edu_rank` helper and rewrite the tail of `get_team_wall` (lines 3617-3630)
- Test: `vernon_project/api/test_mobile.py`

**Interfaces:**
- Consumes: `Employee Profile` (`job_title`, `photo`, `employment_status`), `Employee Education` (`level`, `institution`, `major`, `year`).
- Produces: each `get_team_wall` user gains `photo` (str|None), `is_intern` (0/1), `school` (str|None), `major` (str|None). Consumed by Task 11.

- [ ] **Step 1: Write the failing pure-function test** — add to `test_mobile.py` (no DB, safe on the live site):

```python
class TestEduRank(unittest.TestCase):
	def test_prefers_higher_level_then_year(self):
		from vernon_project.api.mobile import _edu_rank
		self.assertGreater(_edu_rank({"level": "S1", "year": 2020}),
			_edu_rank({"level": "SMA/SMK", "year": 2024}))
		self.assertGreater(_edu_rank({"level": "S1", "year": 2024}),
			_edu_rank({"level": "S1", "year": 2020}))
		self.assertLess(_edu_rank({"level": None, "year": 2024}),
			_edu_rank({"level": "SD", "year": 2000}))
```

- [ ] **Step 2: Run it — expect FAIL** (`cannot import name '_edu_rank'`):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_prefers_higher_level_then_year
```
Expected: FAIL

- [ ] **Step 3a: Add the helper** just above `get_team_wall` (~line 3600):

```python
EDU_LEVELS = ("SD", "SMP", "SMA/SMK", "D1", "D2", "D3", "D4", "S1", "S2", "S3")


def _edu_rank(row):
	"""Sort key for an intern's 'current' school: higher education level wins, tie-break
	by graduation year. Blank/unknown level ranks below any known level."""
	lvl = row.get("level")
	rank = EDU_LEVELS.index(lvl) if lvl in EDU_LEVELS else -1
	return (rank, row.get("year") or 0)
```

- [ ] **Step 3b: Rewrite the `get_team_wall` tail** — replace lines 3617-3630 (from `avatar_map = ...` through `return {"users": users}`) with:

```python
	emails = [u["name"] for u in users]
	avatar_map = _avatar_config_map(emails)
	# Employee Profile: jabatan + REAL photo + employment status for the nametag.
	profiles = {
		p["user"]: p
		for p in frappe.get_all(
			"Employee Profile",
			filters={"user": ["in", emails]},
			fields=["user", "job_title", "photo", "employment_status"],
		)
	}
	# Intern schooling: highest-level education row per intern.
	interns = [e for e, p in profiles.items() if p.get("employment_status") == "Intern"]
	edu_map = {}
	if interns:
		for row in frappe.get_all(
			"Employee Education",
			filters={"parenttype": "Employee Profile", "parent": ["in", interns]},
			fields=["parent", "level", "institution", "major", "year"],
			order_by="parent asc",
		):
			cur = edu_map.get(row["parent"])
			if cur is None or _edu_rank(row) > _edu_rank(cur):
				edu_map[row["parent"]] = row
	for u in users:
		p = profiles.get(u["name"]) or {}
		u["avatar_config"] = avatar_map.get(u["name"])
		u["job_title"] = p.get("job_title") or None
		u["photo"] = p.get("photo") or None
		u["is_intern"] = 1 if p.get("employment_status") == "Intern" else 0
		edu = edu_map.get(u["name"]) or {}
		u["school"] = edu.get("institution") or None
		u["major"] = edu.get("major") or None
	return {"users": users}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_prefers_higher_level_then_year
```
Expected: PASS

- [ ] **Step 5: Smoke-check the shape** (read-only, no inserts):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.mobile import get_team_wall
u = get_team_wall()["users"][0]
print(sorted(set(u) & {"photo","is_intern","school","major"}))
EOF
```
Expected: `['is_intern', 'major', 'photo', 'school']`

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(api): team wall returns real photo + intern school/major"
```

---

### Task 6: `get_photo_gate` endpoint

**Files:**
- Modify: `vernon_project/api/mobile.py` (add near `get_team_wall`)

**Interfaces:**
- Consumes: `Vernon Settings.force_photo_upload` (Task 2), `User.custom_member_type`, `Employee Profile.photo` (Task 1).
- Produces: whitelisted `get_photo_gate()` → `{"enabled": 0/1, "owed": 0/1}`; consumed by Task 7's `usePhotoGate`.

- [ ] **Step 1: Add the endpoint** (mirrors `disc_test.get_disc_reminder` eligibility):

```python
@frappe.whitelist()
def get_photo_gate():
	"""{enabled, owed} — whether to force the caller to upload a REAL profile photo.
	enabled by the force_photo_upload setting; owed when an Internal-Team/Intern caller
	has no Employee Profile.photo yet. Same scoped population as the DISC reminder."""
	enabled = int(bool(frappe.db.get_single_value("Vernon Settings", "force_photo_upload")))
	user = frappe.session.user
	owed = 0
	if enabled and user != "Guest":
		member_type = frappe.db.get_value("User", user, "custom_member_type")
		if member_type in ("Internal Team", "Intern"):
			if not frappe.db.get_value("Employee Profile", {"user": user}, "photo"):
				owed = 1
	return {"enabled": enabled, "owed": owed}
```

- [ ] **Step 2: Verify default-off returns not-owed** (read-only):

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.mobile import get_photo_gate
print(get_photo_gate())  # flag off → enabled 0, owed 0
EOF
```
Expected: `{'enabled': 0, 'owed': 0}`

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(api): get_photo_gate (forced real-photo upload eligibility)"
```

---

### Task 7: Shared types, API helpers, hook

**Files:**
- Modify: `frontend/src/lib/types.ts` (`TeamWallUser`, `EmployeeSoft`, new `PhotoGate`)
- Modify: `frontend/src/lib/api.ts` (`uploadProfilePhoto`, `mobileApi.getPhotoGate`)
- Modify: `frontend/src/hooks/useData.ts` (`keys.photoGate`, `usePhotoGate`)

**Interfaces:**
- Produces: `TeamWallUser` fields (Task 11), `EmployeeSoft.photo` (Task 10), `uploadProfilePhoto(file)` (Task 8), `usePhotoGate()` (Task 9).

- [ ] **Step 1: Extend `TeamWallUser`** (types.ts, line 936) — add the four fields:

```typescript
export type TeamWallUser = {
  name: string
  full_name: string | null
  user_image: string | null
  avatar_config?: AvatarConfig | null
  job_title?: string | null
  photo?: string | null
  is_intern?: number
  school?: string | null
  major?: string | null
}
```

- [ ] **Step 2: Extend `EmployeeSoft`** (types.ts, ~line 1090) — add `photo`:

```typescript
export type EmployeeSoft = {
  photo?: string;
  phone?: string; birthdate?: string; bio?: string;
  home_address?: string;
  emergency_contact_name?: string; emergency_contact_phone?: string; emergency_contact_relation?: string;
  education?: EmployeeChildEducation[]; skills?: EmployeeChildSkill[]; trainings?: EmployeeChildTraining[];
  religion?: string; verse_enabled?: 0 | 1;
  focus_mode?: FocusMode;
  gender?: 'Male' | 'Female';
}
```

- [ ] **Step 3: Add the `PhotoGate` interface** (types.ts, near `DiscReminder`, line 1432):

```typescript
export interface PhotoGate {
  enabled: number
  owed: number
}
```

- [ ] **Step 4: Add the upload helper** (api.ts, after `uploadRewardImage`, ~line 794) — same shape, different method:

```typescript
// Multipart upload of the caller's real profile photo. Returns the saved public URL.
export async function uploadProfilePhoto(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_profile_photo', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}
```

- [ ] **Step 5: Add `getPhotoGate` to `mobileApi`** (api.ts, next to `getDiscReminder`, line 687):

```typescript
  getPhotoGate: () => api.get<import('./types').PhotoGate>(M + 'get_photo_gate'),
```

- [ ] **Step 6: Add the query key + hook** (useData.ts) — add `photoGate: ['photo-gate'] as const,` to `keys` (near line 153), and after `useDiscReminder` (line 2491):

```typescript
// Forced real-photo upload: does the session user still owe a profile photo? No poll — like the gate.
export const usePhotoGate = () =>
  useQuery({ queryKey: keys.photoGate, queryFn: () => mobileApi.getPhotoGate() })
```

- [ ] **Step 7: Typecheck via build** (fast fail if a type is wrong):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(shared): photo types + uploadProfilePhoto + usePhotoGate"
```

---

### Task 8: Shared `PhotoUpload` component

**Files:**
- Create: `frontend/src/components/PhotoUpload.tsx`

**Interfaces:**
- Consumes: `uploadProfilePhoto` (Task 7), `Spinner` from `./ui`.
- Produces: `<PhotoUpload value onChange name? />` — `onChange(url: string)` fires with the uploaded URL. Consumed by Tasks 9 and 10.

- [ ] **Step 1: Create the component**

```tsx
// Shared real-photo picker — used by both self-service profile screens and the PhotoGate.
// Uploads via uploadProfilePhoto and hands the saved URL back through onChange. Carries the
// "must be a real photo" guidance. Presentation is intentionally neutral so both design
// systems (mobile Soft-Pop, web bento) can drop it in.
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Spinner } from './ui'
import { uploadProfilePhoto } from '../lib/api'

export function PhotoUpload({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      onChange(await uploadProfilePhoto(file))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal mengunggah foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            <Camera className="h-7 w-7" />
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Spinner className="h-5 w-5 text-white" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
        >
          {value ? 'Ganti Foto' : 'Unggah Foto'}
        </button>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Gunakan foto asli wajahmu — bukan avatar, kartun, atau logo.
        </p>
        {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build to typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PhotoUpload.tsx
git commit -m "feat(shared): PhotoUpload control with real-photo guidance"
```

---

### Task 9: Shared `PhotoGate` + mount in both App shells

**Files:**
- Create: `frontend/src/components/PhotoGate.tsx`
- Modify: `frontend/src/App.tsx` (mount, ~line 196)
- Modify: `frontend-web/src/App.tsx` (mount, ~line 218)

**Interfaces:**
- Consumes: `usePhotoGate` (Task 7), `useSaveMyProfile` (existing), `PhotoUpload` (Task 8), `keys` (Task 7).
- Produces: default-exported `<PhotoGate />` self-gating blocking modal.

- [ ] **Step 1: Create the gate** (blocking, no dismiss — modelled on `DailyRecognitionGate`; closes only when a photo is saved):

```tsx
// Blocking gate: when force_photo_upload is on and the Internal/Intern caller has no real
// photo, they must upload one before using the app. Uploading + saving invalidates the gate,
// team wall, and boot so the parent unmounts it. Shared by both frontends (web imports via @).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { PhotoUpload } from './PhotoUpload'
import { usePhotoGate, useSaveMyProfile, keys } from '../hooks/useData'

export default function PhotoGate() {
  const { data } = usePhotoGate()
  const save = useSaveMyProfile()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  if (!data?.owed) return null

  const onUploaded = (url: string) => {
    setError(null)
    save.mutate(
      { photo: url },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: keys.photoGate })
          qc.invalidateQueries({ queryKey: keys.teamWall })
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Gagal menyimpan foto'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Camera className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-extrabold text-stone-800 dark:text-slate-100">
          Unggah foto asli kamu
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-slate-400">
          Foto ini dipakai untuk name tag &amp; profil tim. Wajib <b>foto asli wajahmu</b> —
          bukan avatar, kartun, atau logo. Kamu bisa lanjut memakai aplikasi setelah mengunggahnya.
        </p>
        <div className="mt-5 flex justify-center">
          <PhotoUpload value={null} onChange={onUploaded} />
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 dark:bg-rose-500/10">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm `keys.teamWall` exists** (referenced above):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -n "teamWall" frontend/src/hooks/useData.ts | head -3
```
Expected: a `teamWall: [...]` key line. If the key has a different name, use that exact name in Step 1.

- [ ] **Step 3: Mount in mobile `App.tsx`** — import at top with the other gates:

```tsx
import PhotoGate from './components/PhotoGate'
```
and render it right after the `DailyRecognitionGate` block (~line 194), before the DISC reminder line:

```tsx
      {!superpowerBlocked && !recognitionGate?.owed && <PhotoGate />}
```

- [ ] **Step 4: Mount in web `App.tsx`** — import at top:

```tsx
import PhotoGate from '@/components/PhotoGate'
```
and render it right after the web `DailyRecognitionGate` block (~line 216), before the DISC reminder line:

```tsx
      {!superpowerBlocked && !recognitionGate?.owed && <PhotoGate />}
```

- [ ] **Step 5: Build both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PhotoGate.tsx frontend/src/App.tsx frontend-web/src/App.tsx
git commit -m "feat(both): blocking PhotoGate mounted behind the other gates"
```

---

### Task 10: Wire `PhotoUpload` into both self-service profile screens

**Files:**
- Modify: `frontend/src/pages/MyInfoScreen.tsx` (/m)
- Modify: `frontend-web/src/pages/MyInfo.tsx` (/w)

**Interfaces:**
- Consumes: `PhotoUpload` (Task 8), `boot.employee.photo` (Task 4).
- Produces: `photo` in the `updateMyProfile` payload from both screens.

- [ ] **Step 1 (/m): import** — add to the imports in `MyInfoScreen.tsx`:

```tsx
import { PhotoUpload } from '@/components/PhotoUpload'
```

- [ ] **Step 2 (/m): state + hydration** — add a `photo` state next to the others (after `phone`, line 29):

```tsx
  const [photo, setPhoto] = useState(employee?.photo ?? '')
```
and inside the one-shot hydration `if (employee && !hydrated)` block (after `setPhone(...)`, line 46):

```tsx
      setPhoto(employee.photo ?? '')
```

- [ ] **Step 3 (/m): include in save** — in `doSave`'s payload object (line 64) add `photo,`:

```tsx
      { photo, phone, birthdate, bio, home_address: homeAddress,
```

- [ ] **Step 4 (/m): render the control** — as the first child inside the form container `<div className="flex flex-col">` (line 89), before the leave-balance button:

```tsx
      <div className="mb-4 rounded-xl bg-paper-card p-3 shadow-card dark:bg-slate-900/40">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Foto</p>
        <PhotoUpload value={photo || null} onChange={setPhoto} />
      </div>
```

- [ ] **Step 5 (/w): import** — add to `MyInfo.tsx` imports:

```tsx
import { PhotoUpload } from '@/components/PhotoUpload'
```

- [ ] **Step 6 (/w): state + hydration + payload** — add state (after line 33):

```tsx
  const [photo, setPhoto] = useState('')
```
add to the hydration block (after `setPhone(...)`, line 51):

```tsx
      setPhoto(employee.photo ?? '')
```
add `photo,` to the `payload` useMemo object (line 69) and add `photo` to its dependency array (line 74):

```tsx
      photo, phone, birthdate, bio, home_address: homeAddress,
```
```tsx
    [photo, phone, birthdate, bio, homeAddress, ecName, ecPhone, ecRelation, skills, education, trainings, religion, verseEnabled],
```

- [ ] **Step 7 (/w): render the control** — as the first child inside the `Personal` `BentoTile` grid (line 123), before the Phone label:

```tsx
            <div className="sm:col-span-2">
              <PhotoUpload value={photo || null} onChange={setPhoto} />
            </div>
```

- [ ] **Step 8: Build both**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/MyInfoScreen.tsx frontend-web/src/pages/MyInfo.tsx
git commit -m "feat(both): self-service real-photo upload on My Info"
```

---

### Task 11: Nametag uses real photo + intern school/major line

**Files:**
- Modify: `frontend/src/components/NametagSheet.tsx`
- Modify: `frontend/src/components/NametagPicker.tsx`

**Interfaces:**
- Consumes: `TeamWallUser.photo/is_intern/school/major` (Task 5/7).

- [ ] **Step 1: NametagSheet — prefer the real photo.** Update the print-gate count (line 63) to count either source:

```tsx
  const photoCount = users.filter((u) => u.photo || u.user_image).length
```

- [ ] **Step 2: NametagSheet — render the real photo + intern line.** Replace the face/name block inside the card (lines 117-136) with:

```tsx
              {logo ? <img src={logo} alt="" className="nametag-logo h-6 object-contain" /> : null}
              {(u.photo || u.user_image) ? (
                <img
                  src={(u.photo || u.user_image) as string}
                  alt=""
                  onLoad={() => setLoaded((n) => n + 1)}
                  onError={() => setLoaded((n) => n + 1)}
                  className="nametag-face h-28 w-28 rounded-full object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="nametag-face flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold text-slate-400 ring-1 ring-slate-200">
                  {initials(name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="nametag-name truncate text-base font-bold text-slate-900">{name}</p>
                {u.job_title ? (
                  <p className="nametag-title truncate text-sm text-slate-500">{u.job_title}</p>
                ) : null}
                {u.is_intern && (u.school || u.major) ? (
                  <p className="nametag-edu truncate text-xs text-slate-400">
                    {[u.school, u.major].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
```

- [ ] **Step 3: NametagPicker — thumbnail prefers the real photo.** Replace the thumbnail block (lines 86-92) with:

```tsx
              {(u.photo || u.user_image) ? (
                <img src={(u.photo || u.user_image) as string} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-700">
                  {initials(name)}
                </span>
              )}
```

- [ ] **Step 4: Build both** (both frontends import these shared components):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NametagSheet.tsx frontend/src/components/NametagPicker.tsx
git commit -m "feat(nametag): use real photo + intern school/major line"
```

---

### Task 12: Admin settings toggle for `force_photo_upload` (both frontends)

**Files:**
- Modify: `vernon_project/api/mobile.py` (`get_app_settings` ~2419, `update_settings` ~2504)
- Modify: `frontend/src/lib/types.ts` (`AppSettings`)
- Modify: `frontend/src/pages/SettingsScreen.tsx` (/m)
- Modify: `frontend-web/src/pages/Settings.tsx` (/w)

**Interfaces:**
- Consumes: `Vernon Settings.force_photo_upload` (Task 2).
- Produces: admins can flip the gate on/off from Settings on both platforms.

- [ ] **Step 1: `get_app_settings`** — add after the `disc_reminder_hours` line (~2440):

```python
		"force_photo_upload": int(g("force_photo_upload") or 0),
```

- [ ] **Step 2: `update_settings`** — add `force_photo_upload=None,` to the signature (after `disc_reminder_hours=None,`, ~2520) and add to the `int_fields` dict (after the `disc_reminder_hours` entry, ~2556):

```python
		"force_photo_upload": force_photo_upload,
```

- [ ] **Step 3: `AppSettings` type** (types.ts ~774) — add `force_photo_upload: number` alongside the other flags (e.g. after `disc_reminder_hours`). If unsure of the exact line, add it anywhere inside the interface body:

```typescript
  force_photo_upload: number
```

- [ ] **Step 4 (/m): SettingsScreen** — add state (after line 44):

```tsx
  const [forcePhotoUpload, setForcePhotoUpload] = useState<boolean>(false)
```
hydrate (after line 71):

```tsx
    setForcePhotoUpload(!!loaded.force_photo_upload)
```
add to the save payload (after line 123):

```tsx
        force_photo_upload: forcePhotoUpload ? 1 : 0,
```
and add the toggle JSX right after the DISC reminder block's closing `)}` (line 445, before the closing `</div>` of that card):

```tsx
          <p className="mb-3 mt-4 text-xs text-slate-500 dark:text-slate-400">
            Wajibkan anggota Internal Team &amp; Intern yang belum punya foto asli untuk mengunggahnya
            lewat modal yang tidak bisa dilewati saat membuka aplikasi. Default nonaktif.
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-card dark:bg-slate-900/40">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Wajib Unggah Foto Asli</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-600"
              checked={forcePhotoUpload}
              onChange={(e) => setForcePhotoUpload(e.target.checked)}
            />
          </label>
```

- [ ] **Step 5 (/w): Settings.tsx** — add state (after line 40):

```tsx
  const [forcePhotoUpload, setForcePhotoUpload] = useState<boolean>(false)
```
hydrate (after line 68):

```tsx
    setForcePhotoUpload(!!loaded.force_photo_upload)
```
add to the save payload (after line 132):

```tsx
        force_photo_upload: forcePhotoUpload ? 1 : 0,
```
and add the toggle JSX right after the DISC reminder block's closing `)}` (after line 489, before the Team-Wall-score label):

```tsx
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm font-semibold text-ink dark:text-slate-200">Wajib Unggah Foto Asli</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={forcePhotoUpload}
                onChange={(e) => setForcePhotoUpload(e.target.checked)}
              />
            </label>
            <p className="text-xs text-muted">
              Saat aktif, anggota Internal Team &amp; Intern tanpa foto asli wajib mengunggahnya lewat modal
              yang tidak bisa dilewati saat membuka aplikasi. Default nonaktif.
            </p>
```

- [ ] **Step 6: Build both + verify the setting round-trips**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.mobile import get_app_settings
print("force_photo_upload" in get_app_settings())
EOF
```
Expected: both builds succeed; `True`.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/api/mobile.py frontend/src/lib/types.ts frontend/src/pages/SettingsScreen.tsx frontend-web/src/pages/Settings.tsx
git commit -m "feat(both): admin toggle for force_photo_upload"
```

---

### Task 13: Docs data, deploy, verify, What's New

**Files:**
- Modify: `docs/assets/data.js` (generated)
- Data: one `App Release` row on the live site

- [ ] **Step 1: Regenerate docs data** (two new endpoints) and confirm determinism:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js
git add docs/assets/data.js && git commit -m "docs: regenerate data.js (upload_profile_photo, get_photo_gate)"
```

- [ ] **Step 2: Deploy** — migrate (fields already migrated in Tasks 1-2; re-run to be safe), rebuild both bundles (done per-task), restart:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 3: E2E verify** (use the `run` skill / a browser on the live site):
  - /m and /w → My Info → the **Foto** control shows; upload a JPG → it previews; Save → reload → photo persists (proves upload + `update_my_profile` + boot round-trip).
  - Team Wall → Nametag → pick yourself → Cetak → the printed badge shows the **real photo** (not the avatar). For an intern with an education row, the `school · major` line appears under the job title.
  - Gate (optional, only if enabling): flip **Wajib Unggah Foto Asli** on in Settings; as an Internal/Intern user with no photo, reload → the blocking modal appears; upload → it closes. Flip back off unless the user wants it live.

- [ ] **Step 4: Confirm the built bundle contains the feature** (per the What's New rule — source committed ≠ shipped):

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -o "Gunakan foto asli wajahmu" public/frontend/assets/index-*.js | head -1
grep -o "Gunakan foto asli wajahmu" public/frontend_web/assets/index-*.js | head -1
```
Expected: the string is found in both bundles.

- [ ] **Step 5: What's New** — insert one `App Release` row (Bahasa, `platform="Both"`, `published=1`, semver-bumped from the newest existing row). Cover only the visible parts. Write to a JSON file, insert loop-free, verify through the endpoint:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/42c0ce68-3014-4311-a84c-5fa2265d1f66/scratchpad/releases.json"))])
frappe.db.commit()
frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")
EOF
```
`releases.json` (one bullet per line in `notes`):

```json
[{"version": "<bump>", "release_date": "<live date YYYY-MM-DD>", "platform": "Both", "title": "Foto profil & name tag lebih rapi",
  "notes": "Unggah foto asli kamu di My Info (/m & /w) — dipakai untuk name tag & profil tim\nName tag sekarang memakai foto asli, bukan avatar\nUntuk anak magang, name tag menampilkan sekolah/kampus & jurusan"}]
```

- [ ] **Step 6: Final recap** — end with the `🍁🌼 You asked: …` one-line recap.

---

## Self-Review

**Spec coverage:**
- Real-photo field → Task 1. Upload endpoint → Task 3. Self-service write + boot → Task 4. Self-service UI both → Task 10. ✅
- Team wall photo + intern school/major (highest level) → Task 5. ✅
- Nametag prefers photo + intern line → Task 11. ✅
- Forcing gate (blocking, toggle-gated default-off, Internal/Intern scope) → settings flag (Task 2), `get_photo_gate` (Task 6), `PhotoGate` + mount (Task 9), admin toggle (Task 12). ✅
- Real-photo guidance copy → Task 8 (control) + Task 9 (gate modal). ✅
- Ship chores: docs data, migrate, build both, restart, What's New → Task 13. ✅

**Placeholder scan:** `<bump>` / `<live date>` in Task 13 Step 5 are deliberately deferred to ship time (the version/date are only known then); every code step is complete.

**Type consistency:** `photo`, `is_intern`, `school`, `major` on `TeamWallUser` (Task 7) match `get_team_wall` (Task 5) and the nametag reads (Task 11). `PhotoGate` `{enabled, owed}` (Task 7) matches `get_photo_gate` (Task 6). `usePhotoGate`/`keys.photoGate`/`keys.teamWall` names are used consistently across Tasks 7 and 9. `EmployeeSoft.photo` (Task 7) matches the payload key sent in Task 10 and consumed by Task 4.
