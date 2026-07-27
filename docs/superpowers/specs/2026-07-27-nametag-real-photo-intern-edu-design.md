# Nametag: real photo + intern school/major

Date: 2026-07-27
Status: Approved design (pending spec review)

## Problem

The printable employee nametag (`/team-wall/nametags`, shared by /m and /w) shows a
**DiceBear avatar** instead of a real face for many employees. Root cause: the nametag
renders `User.user_image`, but `save_my_avatar` (`vernon_project/api/mobile.py:4905`)
overwrites `user_image` with the composed avatar snapshot whenever a user builds an avatar.
So `user_image` is not a reliable real-photo source.

Additionally, for **intern** employees the tag should also show which school they attend and
their major — data that already exists in the `Employee Education` child table but is not
surfaced on the tag.

## Decisions

- **Real photo source:** a new dedicated `photo` field on `Employee Profile`, independent of
  `user_image` (which the avatar keeps clobbering — unchanged).
- **Upload path:** self-service only. Each person uploads their own photo on their profile
  screen. No admin/HR upload UI in this change.
- **Intern education row:** show the **highest-level** education entry (level rank = order in
  the SD…S3 Select; tie-break by higher `year`, then last row). Omit the line entirely if the
  intern has no education row filled.
- **Intern line placement:** one line `institution · major` **under** the job title. Job title
  still shows if set. Non-interns are unchanged (name + job title only).

## Components

### 1. Data — Employee Profile
Add one field to `vernon_project/vernon_project/doctype/employee_profile/employee_profile.json`:

- `photo` — `Attach Image`, permlevel 0 (self-editable), first field in the existing
  **Personal** section (before `gender`), so it reads as the profile photo.

No other doctype changes. `Employee Education` (level/institution/major/year) already exists.

### 2. Backend — `vernon_project/api/mobile.py`
- **`upload_profile_photo`** — new `@frappe.whitelist()` multipart endpoint mirroring
  `upload_reward_image`: reads the uploaded file, `save_file(..., is_private=0)`, returns the
  public file URL. (Public matches the existing avatar-snapshot + reward-image convention; the
  team wall is org-wide readable anyway.)
- **`update_my_profile`** — add `photo=None` parameter; `if photo is not None: doc.set("photo", photo)`.
  Personal soft field, so self-service write is in scope (legal/contract fields remain unreachable here).
- **`get_team_wall`** — for each returned user add:
  - `photo` — `Employee Profile.photo` (add `photo` + `employment_status` to the Employee Profile
    field read; currently reads `job_title`).
  - `is_intern` — `employment_status == "Intern"`.
  - `school`, `major` — from the intern's highest-level `Employee Education` row. Computed only
    for interns. One batched query over `Employee Education` filtered to the intern parents
    (`parent in [intern users]`, `parenttype = "Employee Profile"`; child `parent` == user email
    because Employee Profile autonames `field:user`). Rank levels by their index in the Select
    options list; pick max (tie-break year desc, then last).

### 3. Shared — `frontend/src` (imported by both frontends)
- `lib/types.ts`:
  - `TeamWallUser` += `photo?: string; is_intern?: boolean; school?: string; major?: string`.
  - `EmployeeSoft` (self-service payload type) += `photo?: string`.
- `lib/api.ts`: `uploadProfilePhoto(file: File): Promise<string>` — multipart helper mirroring
  `uploadRewardImage`, posts to `vernon_project.api.mobile.upload_profile_photo`.
- `components/PhotoUpload.tsx`: small shared control — shows current photo (or `user_image`
  fallback, or initials), a file picker (`accept="image/*"`), uploads via `uploadProfilePhoto`,
  calls `onChange(url)`. Neutral styling that reads acceptably in both design systems; a screen
  may wrap it if needed. Shared logic (pick → upload → state) lives here per the two-frontend rule.

### 4. Nametag (shared components used by both frontends)
- `components/NametagSheet.tsx`:
  - Face image = `u.photo || u.user_image` → initials fallback (existing).
  - The `onLoad`/`onError` print-gate `photoCount` counts `u.photo || u.user_image`.
  - If `u.is_intern` and (`school` or `major`), render one truncated line
    `school · major` (join non-empty parts with " · ") under the job title.
- `components/NametagPicker.tsx`: thumbnail also prefers `u.photo || u.user_image` so the pick
  list matches the printed face.

### 5. Self-service UI (both frontends — same capability, own design system)
- `/m` `frontend/src/pages/MyInfoScreen.tsx`: add `<PhotoUpload>` in the Personal section; the
  chosen URL flows into the `updateMyProfile` payload (add `photo` to the saved fields).
- `/w` `frontend-web/src/pages/MyInfo.tsx`: same, in its Personal tile.

## Out of scope (YAGNI)
- Admin/HR uploading photos for others (explicitly deferred — self-service only).
- Changing how the avatar writes `user_image` (unchanged; the new `photo` field sidesteps it).
- Showing school/major for non-interns.

## Ship chores
- `python3 scripts/gen_docs.py` (new whitelisted endpoint changes the docs data) + commit `data.js`.
- Rebuild **both** bundles (`frontend` + `frontend-web`), `sudo /usr/local/bin/tj-restart`.
- Migrate the site (new doctype field).
- Add a What's New (`App Release`) entry after it is live (Bahasa, `Both`).

## Testing / verification
- Backend: a user with an avatar-clobbered `user_image` + a `photo` set → `get_team_wall`
  returns the real `photo`; an intern with education rows → correct highest-level `school`/`major`;
  a non-intern → `is_intern` false, no school/major. One small `test_*` assertion for the
  highest-level pick (rank + tie-break).
- E2E on the live site: upload a photo on /m and /w MyInfo, open the nametag sheet, confirm the
  real photo prints and an intern shows the school·major line.
