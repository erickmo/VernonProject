# Deploy runbook — six features (Web Push, badges, notifications, comments)

Run on the server hosting **project.vernon.id**. Code is already committed on `main` (HEAD `a0b777e`);
this activates it. Steps 5 (restart) needs sudo.

Paths: bench root `/home/frappe/frappe-bench`; app `apps/vernon_project`; site `project.vernon.id`.

---

## 1. Install pywebpush (push is a silent no-op until this exists)

```bash
cd /home/frappe/frappe-bench
./env/bin/pip install pywebpush
```
Pulls `cryptography` (already present), `http-ece`, `py-vapid`. The `_notify` helper guards the import
(`mobile.py:133-135`) — nothing crashes if you skip this, push just doesn't send.

## 2. Generate a VAPID keypair

```bash
cd /home/frappe/frappe-bench
./env/bin/python vapid_keygen.py     # (copy vapid_keygen.py here first)
```
Prints `vapid_public_key` (87 chars) and `vapid_private_key` (43 chars). **The private key is a secret** —
it only goes into site_config (step 3), never into git/chat/tickets.

## 3. Write the three keys into the SITE config

`set-config` edits `sites/project.vernon.id/site_config.json` JSON-safely:

```bash
cd /home/frappe/frappe-bench
bench --site project.vernon.id set-config vapid_public_key  '<PUBLIC_KEY_FROM_STEP_2>'
bench --site project.vernon.id set-config vapid_private_key '<PRIVATE_KEY_FROM_STEP_2>'
bench --site project.vernon.id set-config vapid_subject     'mailto:mo@intinusa.id'
```
The code reads exactly these keys (`mobile.py:126-128`, exposed to the browser via
`bootstrap()` `mobile.py:606`). `vapid_subject` must be a `mailto:` or `https:` URL.

## 4. Migrate — create the new doctype tables

```bash
bench --site project.vernon.id migrate
```
Creates: **Vernon Notification**, **Push Subscription**, **Badge Settings** (Single), **Badge Tier** (child).

## 5. Restart Python (needs sudo)

```bash
sudo supervisorctl restart all      # or: bench restart  (also calls supervisor; needs sudo)
```

## 6. Build the PWA frontend

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend
npm install
npm run build           # vite build (base /assets/vernon_project/frontend/) -> ../vernon_project/public/frontend + copies html
cd /home/frappe/frappe-bench
bench --site project.vernon.id clear-cache
```
The service worker bumped to cache **v6** — open clients pick up the new SW + push/notificationclick
handlers on next load (close/reopen the PWA to force it).

---

## 7. Verify live

**Push subscription**
1. Open `https://project.vernon.id/m` (on iOS: must be an **installed** PWA — Add to Home Screen, iOS 16.4+).
2. Log in → accept the push soft-prompt (or Profile → enable push).
3. Confirm a row was stored:
   ```bash
   bench --site project.vernon.id console
   >>> frappe.db.count("Push Subscription")
   ```

**Notifications (bell + OS push)** — trigger each event, expect bell unread to increment and, with the
app closed, an OS notification that deep-links in:
- Assign / reassign a task (assignee notified)
- Advance a task into an approval queue (next approver notified)
- Comment with an `@mention` (mentioned user notified)
- Grant / gift points; fulfill a redemption (recipient notified)

**Badges** — as System Manager: `https://project.vernon.id/m/badge-settings` → define tiers (e.g.
Bronze 0 / Silver 500 / Gold 2000) → confirm the chip shows on Profile, leaderboard rows, and comment
authors. A user with grants/gifts but few Todo points should NOT be lifted by them (Todo-source only).

**Comments** — newest-first ordering; attach an image (renders inline); `@`-autocomplete lists only
project participants.

---

## Rollback

- Push: `bench --site project.vernon.id set-config vapid_public_key ''` (browser stops subscribing; bell/feed still work).
- Everything else is plain code on `main`; revert the relevant commits if needed (`git log --oneline` — feature commits `4e413fb`..`a0b777e`).
