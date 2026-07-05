# Mobile "My Info" page + admin employee management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the mobile self-service "My Info" editor into its own `/me/info` page, and give System-Manager admins full employee-profile editing inside the existing mobile Manage-Users form.

**Architecture:** Frontend-only, mobile app (`frontend/`). Feature 1 relocates the self-contained `MyInfoCard` (currently inline in `Profile.tsx`) into a new `MyInfoScreen` route. Feature 2 mirrors the already-shipped web combined form (`frontend-web/src/pages/UserForm.tsx`) into mobile's `UserFormScreen.tsx`, reusing backend endpoints and JS bindings that already exist and are used by web today. No backend, doctype, or API changes.

**Tech Stack:** React 18 + TypeScript, React Router v6, TanStack Query, Vite, Tailwind. Spec: `docs/superpowers/specs/2026-07-05-mobile-my-info-page-and-admin-employee-design.md`.

## Global Constraints

- **Mobile frontend only** — touch only `frontend/`. No backend / doctype / API edits (endpoints `get_employee_profile` / `update_employee_profile` and JS bindings already exist).
- **Do NOT touch `vernon_project/api/project_todo.py`** — unrelated in-flight work by the user. `git add` only the files each task names.
- **No new dependencies.**
- **Type gate:** `cd frontend && npx tsc --noEmit` must pass with 0 errors. `vite build` does NOT type-check, so tsc is the real gate.
- **`noUnusedLocals` is off** — unused imports never fail anything; prune them by hand (grep each candidate across the file first).
- **Deploy:** `cd frontend && npm run build` regenerates `vernon_project/public/frontend/*` and copies `vernon_project/www/m.html` (+ `www/vernon_sw.js`). The built assets are committed to the repo (the live site serves them) — see commit `f6fb845`.
- **No native `alert`/`confirm`/`prompt`** — use the existing toast/dialog components (the code being moved/mirrored already complies).
- **Re-check git state before every git action** — the user commits/switches branches in parallel.

---

### Task 1: Feature 1 — extract `MyInfoScreen` and rewire `Profile.tsx` + `App.tsx`

**Files:**
- Create: `frontend/src/pages/MyInfoScreen.tsx`
- Modify: `frontend/src/App.tsx` (add `/me/info` route)
- Modify: `frontend/src/pages/Profile.tsx` (delete inline card + component, add menu row, prune imports)

**Interfaces:**
- Consumes: `useBoot()` → `boot.employee` (`EmployeeSoft`) + `boot.leave` (`LeaveBalance`); `useSaveMyProfile()`; `DetailScreen` (`title`, `right`, `children`) from `@/components/Layout`.
- Produces: default-exported `MyInfoScreen` component; route path `/me/info`.

- [ ] **Step 1: Create `frontend/src/pages/MyInfoScreen.tsx`**

Scaffold below is complete. The large JSX body is a **verbatim relocation** of the existing, already-working card body — copy `frontend/src/pages/Profile.tsx:550-783` (the leave-balance chip through the end of the Trainings block, i.e. everything after the card header down to just before the card's closing `</div>`) as the `DetailScreen` children. That block references only the state setters and the `INPUT_CLS` / `PROFICIENCIES` / `EDU_LEVELS` consts defined here, so it moves cleanly. Do NOT copy the outer card `<div>` wrapper (`Profile.tsx:531`) or the card header block (`:532-548`) — the Save button becomes the `DetailScreen` `right` slot instead.

```tsx
import { useEffect, useState } from 'react'
import { User, Phone, MapPin, CalendarDays, Award, BookOpen, ClipboardList, Trash2, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, useSaveMyProfile } from '@/hooks/useData'
import type { EmployeeChildSkill, EmployeeChildEducation, EmployeeChildTraining } from '@/lib/types'

// Moved verbatim from Profile.tsx (was the MyInfoCard module consts).
const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500'
const PROFICIENCIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const EDU_LEVELS = ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']

export default function MyInfoScreen() {
  const { data: boot } = useBoot()
  const employee = boot?.employee
  const leave = boot?.leave
  const toast = useToast()
  const save = useSaveMyProfile()

  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [birthdate, setBirthdate] = useState(employee?.birthdate ?? '')
  const [bio, setBio] = useState(employee?.bio ?? '')
  const [homeAddress, setHomeAddress] = useState(employee?.home_address ?? '')
  const [ecName, setEcName] = useState(employee?.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(employee?.emergency_contact_phone ?? '')
  const [ecRelation, setEcRelation] = useState(employee?.emergency_contact_relation ?? '')
  const [skills, setSkills] = useState<EmployeeChildSkill[]>(employee?.skills ?? [])
  const [education, setEducation] = useState<EmployeeChildEducation[]>(employee?.education ?? [])
  const [trainings, setTrainings] = useState<EmployeeChildTraining[]>(employee?.trainings ?? [])

  // ponytail: one-shot hydration — useState ignores prop changes after first render; fire once when employee arrives
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (employee && !hydrated) {
      setPhone(employee.phone ?? '')
      setBirthdate(employee.birthdate ?? '')
      setBio(employee.bio ?? '')
      setHomeAddress(employee.home_address ?? '')
      setEcName(employee.emergency_contact_name ?? '')
      setEcPhone(employee.emergency_contact_phone ?? '')
      setEcRelation(employee.emergency_contact_relation ?? '')
      setSkills(employee.skills ?? [])
      setEducation(employee.education ?? [])
      setTrainings(employee.trainings ?? [])
      setHydrated(true)
    }
  }, [employee, hydrated])

  const doSave = () => {
    save.mutate(
      { phone, birthdate, bio, home_address: homeAddress,
        emergency_contact_name: ecName, emergency_contact_phone: ecPhone, emergency_contact_relation: ecRelation,
        skills, education, trainings },
      {
        onSuccess: () => toast('success', 'Profile saved'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save profile'),
      },
    )
  }

  return (
    <DetailScreen
      title="My Info"
      right={
        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending && <Spinner className="h-3.5 w-3.5" />}
          Save
        </button>
      }
    >
      <div className="flex flex-col">
        {/* === PASTE Profile.tsx:550-783 verbatim here (leave chip → Trainings block) === */}
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Add the route to `frontend/src/App.tsx`**

Import near the other page imports:
```tsx
import MyInfoScreen from '@/pages/MyInfoScreen'
```
Add the route directly after the existing `/me` route (around `App.tsx:250`). It is ungated (self-service — boot already guarantees an authenticated user):
```tsx
<Route path="/me/info" element={<MyInfoScreen />} />
```

- [ ] **Step 3: Remove `MyInfoCard` from `Profile.tsx` and add the menu entry**

1. Delete the inline render at `Profile.tsx:340`:
   ```tsx
   <MyInfoCard employee={boot.employee} leave={boot.leave} />
   ```
2. Delete the entire `MyInfoCard` function (`Profile.tsx:479-786`) **and** the three consts that preceded it and are now only used by the moved code: `INPUT_CLS`, `PROFICIENCIES`, `EDU_LEVELS` (`Profile.tsx:472-477`, including the `// Shared input style…` comment). Grep `INPUT_CLS`, `PROFICIENCIES`, `EDU_LEVELS` first to confirm no other use in `Profile.tsx` (there is none).
3. Add a new **first** section at the top of the `menu` array (the array currently starting at the `'Account'` section, ~`Profile.tsx:129`). Insert before it:
   ```tsx
   {
     title: 'Me',
     rows: [
       { icon: User, label: 'My Info', hue: 'indigo', onClick: () => navigate('/me/info') },
     ],
   },
   ```
   Note: `hue: 'indigo'` is not in `ROW_HUE` (`Profile.tsx:795-803`) — either add an `indigo` entry to `ROW_HUE` (`indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'`) or use an existing hue such as `'sky'`. Pick `'sky'` to avoid touching `ROW_HUE`.

- [ ] **Step 4: Prune now-unused imports in `Profile.tsx`**

`noUnusedLocals` is off, so nothing errors — remove by hand. For EACH identifier below, grep it across the *remaining* `Profile.tsx` and remove from the import only if it has zero other references:
- Hook: `useSaveMyProfile` (from the `@/hooks/useData` import, `Profile.tsx:7`).
- Types: `EmployeeSoft`, `LeaveBalance`, `EmployeeChildSkill`, `EmployeeChildEducation`, `EmployeeChildTraining` (from `@/lib/types`, `Profile.tsx:8`) — the whole `import type {…}` line likely goes.
- lucide icons (`Profile.tsx:2`): `Phone`, `MapPin`, `Award`, `Plus`, `Trash2`. **Keep** `User`, `CalendarDays`, `BookOpen`, `ClipboardList` — they are still used by the settings menu / other cards **and** `User` is now used by the new "My Info" menu row.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output / exit 0. If it reports an unused-var error, that means a still-referenced import was removed — restore it. If it reports a missing `MyInfoScreen` or `DetailScreen` type, fix the import path.

- [ ] **Step 6: Commit source (only these files)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/MyInfoScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(hr): move /m self-profile edit into its own /me/info page"
```

---

### Task 2: Feature 2 — employee-profile admin fields in `UserFormScreen.tsx`

**Files:**
- Modify: `frontend/src/pages/UserFormScreen.tsx`

**Interfaces:**
- Consumes: `mobileApi.getEmployeeProfile(name)` → object with `nik_ktp, npwp, bpjs_kesehatan, bpjs_ketenagakerjaan, bank_name, bank_account_no, bank_account_holder, employment_status, job_title, date_joined, contract_start, contract_end, annual_leave_quota, prior_leave_taken` and `leave` (`LeaveBalance`); `mobileApi.updateEmployeeProfile(name, payload)` (both from `@/lib/api`, already used by web `UserForm.tsx:72/124`).
- Produces: nothing new (extends existing screen reached via `/users/:name`).

Reference for exact field set + payload: `frontend-web/src/pages/UserForm.tsx` (web parity). Mobile styling below matches the existing inputs in this file.

- [ ] **Step 1: Add imports**

At the top of `UserFormScreen.tsx`, add:
```tsx
import { mobileApi } from '@/lib/api'
import type { LeaveBalance } from '@/lib/types'
```

- [ ] **Step 2: Add a shared mobile field className const**

Above the component (module scope), add (matches the existing inline input style used in this file):
```tsx
const field =
  'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
```

- [ ] **Step 3: Add employee-profile state**

After the existing `const [newPassword, setNewPassword] = useState('')` line (`UserFormScreen.tsx:43`):
```tsx
// Employee profile — legal/contract/leave (edit mode only)
const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
const [nikKtp, setNikKtp] = useState('')
const [npwp, setNpwp] = useState('')
const [bpjsKes, setBpjsKes] = useState('')
const [bpjsTk, setBpjsTk] = useState('')
const [bankName, setBankName] = useState('')
const [bankAccountNo, setBankAccountNo] = useState('')
const [bankAccountHolder, setBankAccountHolder] = useState('')
const [employmentStatus, setEmploymentStatus] = useState('')
const [jobTitle, setJobTitle] = useState('')
const [dateJoined, setDateJoined] = useState('')
const [contractStart, setContractStart] = useState('')
const [contractEnd, setContractEnd] = useState('')
const [annualLeaveQuota, setAnnualLeaveQuota] = useState<number | ''>('')
const [priorLeaveTaken, setPriorLeaveTaken] = useState<number | ''>('')
```

- [ ] **Step 4: Load the profile in edit mode**

After the existing `useEffect` that hydrates `existing` (`UserFormScreen.tsx:45-52`), add:
```tsx
useEffect(() => {
  if (!name) return
  mobileApi.getEmployeeProfile(name).then((ep) => {
    setNikKtp(ep.nik_ktp ?? '')
    setNpwp(ep.npwp ?? '')
    setBpjsKes(ep.bpjs_kesehatan ?? '')
    setBpjsTk(ep.bpjs_ketenagakerjaan ?? '')
    setBankName(ep.bank_name ?? '')
    setBankAccountNo(ep.bank_account_no ?? '')
    setBankAccountHolder(ep.bank_account_holder ?? '')
    setEmploymentStatus(ep.employment_status ?? '')
    setJobTitle(ep.job_title ?? '')
    setDateJoined(ep.date_joined ?? '')
    setContractStart(ep.contract_start ?? '')
    setContractEnd(ep.contract_end ?? '')
    setAnnualLeaveQuota(ep.annual_leave_quota ?? '')
    setPriorLeaveTaken(ep.prior_leave_taken ?? '')
    setLeaveBalance(ep.leave ?? null)
  }).catch(() => {
    // non-fatal: admin fields stay blank if fetch fails
  })
}, [name])
```

- [ ] **Step 5: Save the profile alongside the user update**

In `onSave`, inside the `if (isEdit) {` branch, immediately after the existing `await update.mutateAsync({…})` call (`UserFormScreen.tsx:59-62`) and before `toast('success', 'User updated')`:
```tsx
await mobileApi.updateEmployeeProfile(name as string, {
  nik_ktp: nikKtp, npwp, bpjs_kesehatan: bpjsKes, bpjs_ketenagakerjaan: bpjsTk,
  bank_name: bankName, bank_account_no: bankAccountNo, bank_account_holder: bankAccountHolder,
  employment_status: employmentStatus, job_title: jobTitle, date_joined: dateJoined,
  contract_start: contractStart, contract_end: contractEnd,
  annual_leave_quota: annualLeaveQuota === '' ? null : annualLeaveQuota,
  prior_leave_taken: priorLeaveTaken === '' ? null : priorLeaveTaken,
})
```

- [ ] **Step 6: Add the UI sections**

Inside the `{isEdit && ( <> … </> )}` block (`UserFormScreen.tsx:200-239`), insert these three sections immediately after the "Account enabled" toggle `</label>` (`:210`) and before the "Send password reset" button (`:211`):

```tsx
{/* Legal & ID */}
<div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Legal &amp; ID</p>
  <div className="flex flex-col gap-3">
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">NIK KTP</span>
      <input type="text" value={nikKtp} onChange={(e) => setNikKtp(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">NPWP</span>
      <input type="text" value={npwp} onChange={(e) => setNpwp(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">BPJS Kesehatan</span>
      <input type="text" value={bpjsKes} onChange={(e) => setBpjsKes(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">BPJS Ketenagakerjaan</span>
      <input type="text" value={bpjsTk} onChange={(e) => setBpjsTk(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank name</span>
      <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account number</span>
      <input type="text" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Account holder name</span>
      <input type="text" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} className={field} /></label>
  </div>
  {/* ponytail: attach_ktp + attach_npwp omitted — no generic private uploader exists (parity with web) */}
</div>

{/* Contract */}
<div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contract</p>
  <div className="flex flex-col gap-3">
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Employment status</span>
      <select value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} className={field}>
        <option value="">— select —</option>
        <option value="Permanent">Permanent</option>
        <option value="Contract">Contract</option>
        <option value="Probation">Probation</option>
        <option value="Intern">Intern</option>
      </select></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Job title</span>
      <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Date joined</span>
      <input type="date" value={dateJoined} onChange={(e) => setDateJoined(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contract start</span>
      <input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Contract end</span>
      <input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} className={field} /></label>
  </div>
</div>

{/* Leave */}
<div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leave</p>
  <div className="flex flex-col gap-3">
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Annual leave quota (days)</span>
      <input type="number" min={0} value={annualLeaveQuota}
        onChange={(e) => setAnnualLeaveQuota(e.target.value === '' ? '' : Number(e.target.value))} className={field} /></label>
    <label className="block"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">Leave already taken this year (pre-system, days)</span>
      <input type="number" min={0} value={priorLeaveTaken}
        onChange={(e) => setPriorLeaveTaken(e.target.value === '' ? '' : Number(e.target.value))} className={field} /></label>
    {leaveBalance && (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:bg-slate-900 dark:border-slate-700">
        <span className="block text-xs text-slate-500 dark:text-slate-400">This year</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{leaveBalance.remaining}</span>
        <span className="text-slate-500 dark:text-slate-400"> / {leaveBalance.quota} days remaining</span>
        {typeof leaveBalance.prior === 'number' && leaveBalance.prior > 0 && (
          <span className="text-slate-500 dark:text-slate-400"> · {leaveBalance.used} used (incl. {leaveBalance.prior} pre-system)</span>
        )}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output / exit 0. If `LeaveBalance` fields (`remaining`/`quota`/`used`/`prior`) mismatch, check the type in `frontend/src/lib/types.ts` and align (web uses the same fields, so this should pass as written).

- [ ] **Step 8: Commit source (only this file)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/UserFormScreen.tsx
git commit -m "feat(hr): /m admin employee editor (legal/contract/leave) in Manage Users"
```

---

### Task 3: Build and deploy the `/m` bundle

**Files:**
- Modify (generated): `vernon_project/public/frontend/**`, `vernon_project/www/m.html` (and `www/vernon_sw.js` if changed)

**Interfaces:**
- Consumes: the source from Tasks 1–2. Produces: committed built assets the live site serves.

- [ ] **Step 1: Production build**

Run: `cd frontend && npm run build`
Expected: Vite build succeeds; ends with a `[copy-html] …/index.html -> ../vernon_project/www/m.html` line. If it errors, fix the source and re-run (do not commit a broken bundle).

- [ ] **Step 2: Review what changed**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && git status --short vernon_project/public/frontend vernon_project/www`
Expected: new/updated hashed JS/CSS under `public/frontend/assets/` and a modified `www/m.html`. Confirm nothing outside `public/frontend` / `www` is staged.

- [ ] **Step 3: Commit the built bundle (only generated assets)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "build(hr): rebuild /m bundle with My Info page + admin employee editor"
```

- [ ] **Step 4: Manual smoke on the live site**

1. Open `/m` → the `/me` "Me" tab shows a new **"Me → My Info"** row. Tap it → `/me/info` opens with the leave chip, Personal, Emergency Contact, Skills, Education, Trainings. Edit a field → Save → success toast; reload → value persists. Confirm the old inline card is gone from `/me`.
2. As a **System Manager**: Me → Manage Users → tap a user → the Legal & ID / Contract / Leave sections appear populated. Edit e.g. job title + annual leave quota → Save → "User updated" toast; reopen → values persist. Confirm the read-only leave line reflects the quota.
3. As a **non-admin**: the Manage Users entry / `/users` route stays hidden/gated (unchanged behavior).

---

## Self-Review

**1. Spec coverage:**
- F1 "own page" → Task 1 (new `MyInfoScreen` + `/me/info` route). ✓
- F1 "own top menu section" → Task 1 Step 3 (`'Me'` section). ✓
- F1 "leave chip moves with card" → Task 1 Step 1 (chip is inside the relocated `:550-783` block). ✓
- F2 "fold into Manage Users, full parity" → Task 2 (all 14 fields + balance, in `UserFormScreen`). ✓
- F2 "reached via existing route, no backend" → Task 2 uses existing bindings; no route/API task. ✓
- "attach_* omitted (parity)" → Task 2 Step 6 ponytail comment. ✓
- Deploy (built assets committed) → Task 3. ✓
- Verification (tsc gate + manual) → Steps 5/7 + Task 3 Step 4. ✓

**2. Placeholder scan:** The only "paste here" marker (Task 1 Step 1) is a verbatim relocation of existing code with an exact line range (`Profile.tsx:550-783`), not an unspecified implementation — acceptable per DRY (reproducing 230 lines invites transcription bugs). All new code (Task 2) is shown in full.

**3. Type consistency:** Payload keys in Task 2 Step 5 match the `getEmployeeProfile` reads in Step 4 and the backend `update_employee_profile` args; state setter names are consistent across Steps 3–6. `MyInfoScreen` save payload matches `useSaveMyProfile`'s existing shape (copied from `MyInfoCard`). `DetailScreen` prop usage (`title`/`right`) matches its use in `UserFormScreen`.

## Execution Handoff

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.
