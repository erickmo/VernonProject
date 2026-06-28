# DiceBear 2D Avatar — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. SVG output is verifiable headlessly (DiceBear runs in Node) — no browser/WebGL needed.

**Goal:** Replace the three.js avatar UI with a DiceBear SVG avatar: a shared `DiceBearAvatar` component + a rewritten customizer (style + per-slot variant pickers + color swatches + premium buy) on `/m` and `/w`, snapshotting via `html-to-image` to the identity image.

**Architecture:** Add `@dicebear/core@9` + `@dicebear/collection@9`; remove `three`/`@react-three/fiber`/`@react-three/drei` + GLBs. A shared `frontend/src/avatar/` module renders SVG from a config and introspects each style's schema for the customizer. The backend (already shipped) serves `{premium, my:config}` and validates premium ownership on save.

**Tech Stack:** React 18 + Vite, `@dicebear/core` + `@dicebear/collection` (v9, MIT), `html-to-image` (already installed), TanStack Query.

## Global Constraints

- **Live site, user edits frontend in parallel.** `git add` ONLY the files each task changes — prefer `git commit <pathspec> -m ...` (the index may hold the user's pre-staged work; a bare `git add`+commit would sweep it). Never `-A`.
- **The current deployed frontend is broken against the new backend** (it expects the old `{items, my.base}` catalog). This plan fixes it; deploy is the last task.
- **DiceBear v9** pin: `@dicebear/core@^9` + `@dicebear/collection@^9` (matched majors). Import styles by name: `import { lorelei, adventurer, notionists } from '@dicebear/collection'`. Render: `createAvatar(style, options).toString()` → SVG string. Options are passed as **arrays** (`{hair:['variant10'], skinColor:['f2d3b1']}`). A style's allowed option groups + enum values are at `style.schema.properties` (`prop.items.enum`).
- **config shape:** `{ style: 'lorelei'|'adventurer'|'notionists', options: { <optionKey>: [values] } }` — exactly what the backend stores/validates.
- **Catalog shape (from backend):** `{ premium: [{name, item_name, style, slot, option_value, thumbnail, owned, price, reward}], my: <config> }`. Free options are NOT in `premium` — derive them from the style schema. A variant is **locked** iff a `premium` item matches `(style, slot, option_value)` and `owned===false`.
- **Curated slots** shown in the customizer (only those a style actually has): `hair, eyes, eyebrows, brows, mouth, lips, glasses, earrings, nose, features, hairAccessories, gesture`. Color groups: `skinColor, hairColor, backgroundColor`.
- **Optional slots use probability:** to show "none" set `<slot>Probability: 0`; to equip a value set the value + `<slot>Probability: 100` (applies to glasses/earrings/features/hairAccessories/gesture/beard).
- **No native alert/confirm** — use the existing dialog (`useConfirm` mobile, `Dialog` web) + Toast.
- **Web import gotcha:** shared code under `@`→`../frontend/src`; web's own under `@web`. DiceBear has no React-context concern → no dedupe needed (remove the three/r3f/drei dedupe entries).
- **Build is light now** (no three) — builds in normal RAM, no swap. Build to the real `public/` only at the deploy task; earlier tasks verify with `tsc`/Node, not a public build.

---

## Task 1: Swap dependencies + remove GLB assets

**Files:**
- Modify: `frontend/package.json` (remove three/r3f/drei/@types/three; add @dicebear/core + @dicebear/collection)
- Modify: `frontend-web/vite.config.ts` (remove three/r3f/drei dedupe entries)
- Delete: `vernon_project/public/models/` (all GLBs + CREDITS.md)

**Interfaces:**
- Produces: `@dicebear/core@^9` + `@dicebear/collection@^9` installed in `frontend/node_modules`; three/r3f/drei gone; no GLB assets.

- [ ] **Step 1: Edit `frontend/package.json` dependencies**

Remove these lines from `dependencies`: `"three"`, `"@react-three/fiber"`, `"@react-three/drei"`; from `devDependencies`: `"@types/three"`. Add to `dependencies`:
```json
    "@dicebear/core": "^9.0.0",
    "@dicebear/collection": "^9.0.0",
```

- [ ] **Step 2: Remove the three dedupe entries in `frontend-web/vite.config.ts`**

Delete the `'three'`, `'@react-three/fiber'`, `'@react-three/drei'` lines from the `dedupe: [...]` array (leave the react/react-query entries).

- [ ] **Step 3: Install + remove GLB assets**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm install
cd /home/frappe/frappe-bench/apps/vernon_project && git rm -r vernon_project/public/models
```
Expected: install adds dicebear, drops three; `git rm` stages the model deletions.

- [ ] **Step 4: Verify dicebear resolves in Node**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && node -e "const {createAvatar}=require('@dicebear/core'); const {lorelei}=require('@dicebear/collection'); console.log('len', createAvatar(lorelei,{seed:'x'}).toString().length)"
```
Expected: prints `len <number>` (a few thousand) — DiceBear works.

- [ ] **Step 5: Commit**

```bash
git commit frontend/package.json frontend/package-lock.json frontend-web/vite.config.ts vernon_project/public/models -m "feat(avatar): swap three.js deps for DiceBear; drop GLB assets"
```

---

## Task 2: Shared DiceBear module + types/api/hooks

**Files:**
- Create: `frontend/src/avatar/styles.ts`, `frontend/src/avatar/DiceBearAvatar.tsx`, `frontend/src/avatar/capture.ts`
- Delete: `frontend/src/avatar/AvatarViewer.tsx`, `anchors.ts`, `AvatarBoundary.tsx`, `useAvatarCapture.ts`
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces:
  - `StyleKey = 'lorelei'|'adventurer'|'notionists'`; `STYLE_LIST: StyleKey[]`; `renderAvatarSvg(style, options) -> string`; `slotsForStyle(style) -> {slot, values}[]` (curated enum slots present in the style); `COLOR_SLOTS`/palettes.
  - `<DiceBearAvatar config={AvatarConfig} className?>` — renders the SVG inline.
  - `captureAvatarPng(el: HTMLElement) -> Promise<string>` (html-to-image `toPng`).
  - types `AvatarConfig {style:StyleKey; options:Record<string,string[]>}`, `PremiumItem {name,item_name,style,slot,option_value,thumbnail,owned,price,reward}`, `AvatarCatalog {premium:PremiumItem[]; my:AvatarConfig}`.

- [ ] **Step 1: `styles.ts`**

```ts
import { createAvatar } from '@dicebear/core'
import { lorelei, adventurer, notionists } from '@dicebear/collection'

export const STYLES = { lorelei, adventurer, notionists } as const
export type StyleKey = keyof typeof STYLES
export const STYLE_LIST: StyleKey[] = ['lorelei', 'adventurer', 'notionists']

// Curated, user-meaningful slots; only those a style actually has are shown.
export const CURATED_SLOTS = ['hair','eyes','eyebrows','brows','mouth','lips','glasses','earrings','nose','features','hairAccessories','gesture']
// Slots that are optional (need a probability flag to show/hide).
export const PROB_SLOTS = ['glasses','earrings','features','hairAccessories','gesture','beard']
export const COLOR_SLOTS = ['skinColor','hairColor','backgroundColor']
export const COLOR_PALETTE = ['f2d3b1','ecad80','9e5622','763900','ffd5dc','b6e3f4','c0aede','d1d4f9','ffdfbf','transparent']

export function renderAvatarSvg(style: StyleKey, options: Record<string, string[]>): string {
  const col = STYLES[style] || STYLES.lorelei
  return createAvatar(col, options as any).toString()
}

export function slotsForStyle(style: StyleKey): { slot: string; values: string[] }[] {
  const col: any = STYLES[style] || STYLES.lorelei
  const props = col.schema?.properties || {}
  const out: { slot: string; values: string[] }[] = []
  for (const slot of CURATED_SLOTS) {
    const enumVals = props[slot]?.items?.enum
    if (Array.isArray(enumVals) && enumVals.length) out.push({ slot, values: enumVals })
  }
  return out
}

export function colorSlotsForStyle(style: StyleKey): string[] {
  const col: any = STYLES[style] || STYLES.lorelei
  const props = col.schema?.properties || {}
  return COLOR_SLOTS.filter((c) => props[c])
}
```

- [ ] **Step 2: `DiceBearAvatar.tsx`**

```tsx
import { useMemo } from 'react'
import { renderAvatarSvg, type StyleKey } from './styles'
import type { AvatarConfig } from '../lib/types'

export function DiceBearAvatar({ config, className }: { config: AvatarConfig; className?: string }) {
  const svg = useMemo(() => {
    try { return renderAvatarSvg(config.style as StyleKey, config.options || {}) }
    catch { return '' }
  }, [config])
  // SVG is library-generated (not user HTML) — safe to inline.
  return <div className={className} aria-label="avatar" dangerouslySetInnerHTML={{ __html: svg }} />
}
```

- [ ] **Step 3: `capture.ts`**

```ts
import { toPng } from 'html-to-image'
// Rasterize the avatar element to a PNG data-URL for the identity snapshot.
export async function captureAvatarPng(el: HTMLElement): Promise<string | null> {
  try { return await toPng(el, { pixelRatio: 2, cacheBust: true }) }
  catch { return null }
}
```

- [ ] **Step 4: Delete the 3D files**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git rm frontend/src/avatar/AvatarViewer.tsx frontend/src/avatar/anchors.ts frontend/src/avatar/AvatarBoundary.tsx frontend/src/avatar/useAvatarCapture.ts
```

- [ ] **Step 5: Update `types.ts`**

Replace the old `AvatarSlot`/`AvatarItem`/`AvatarConfig`/`AvatarCatalog` with:
```ts
export type StyleKey = 'lorelei' | 'adventurer' | 'notionists'
export interface AvatarConfig {
  style: StyleKey
  options: Record<string, string[]>
}
export interface PremiumItem {
  name: string
  item_name: string
  style: string
  slot: string
  option_value: string
  thumbnail: string | null
  owned: boolean
  price: number | null
  reward: string | null
}
export interface AvatarCatalog {
  premium: PremiumItem[]
  my: AvatarConfig
}
```

- [ ] **Step 6: Update `api.ts`**

Change the three avatar methods to:
```ts
  getAvatarCatalog: () =>
    api.get<import('./types').AvatarCatalog>(M + 'get_avatar_catalog'),
  getMyAvatar: () =>
    api.get<import('./types').AvatarConfig>(M + 'get_my_avatar'),
  saveMyAvatar: (config: import('./types').AvatarConfig, snapshot_dataurl?: string) =>
    api.post<import('./types').AvatarConfig>(M + 'save_my_avatar', {
      config_json: JSON.stringify(config),
      snapshot_dataurl,
    }),
```
(Param is now `config_json` to match the backend; uses the real `M`/`api` names already in the file.)

- [ ] **Step 7: Update `useData.ts`**

`useAvatarCatalog` is unchanged (key `['avatar-catalog']`). Update `useSaveAvatar`'s mutationFn signature to the new shape (still invalidates `['avatar-catalog']` + the boot key):
```ts
export function useSaveAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ config, snapshot }: { config: import('../lib/types').AvatarConfig; snapshot?: string }) =>
      mobileApi.saveMyAvatar(config, snapshot),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}
```
(Use the file's actual `mobileApi`/`keys` names — read them first.)

- [ ] **Step 8: Typecheck + headless SVG check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
node -e "const {createAvatar}=require('@dicebear/core'); const c=require('@dicebear/collection'); for(const s of ['lorelei','adventurer','notionists']){const len=createAvatar(c[s],{seed:'x'}).toString().length; if(len<500) throw new Error(s); console.log(s,'ok',len)}"
```
Expected: tsc clean; each style prints `ok <len>`.

- [ ] **Step 9: Commit**

```bash
git commit frontend/src/avatar frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts -m "feat(avatar): DiceBear SVG renderer + schema helpers + new types/api/hooks"
```

---

## Task 3: Mobile customizer + Profile hero

**Files:**
- Modify: `frontend/src/pages/AvatarCustomizerScreen.tsx` (rewrite for DiceBear)
- Modify: `frontend/src/pages/Profile.tsx` (DiceBearAvatar hero — replaces AvatarViewer/AvatarBoundary)

**Interfaces:**
- Consumes: `DiceBearAvatar`, `captureAvatarPng`, `STYLE_LIST`/`slotsForStyle`/`colorSlotsForStyle`/`COLOR_PALETTE`/`PROB_SLOTS`, `useAvatarCatalog`/`useSaveAvatar`, `mobileApi.redeemReward`.
- Produces: `/avatar` route renders the DiceBear customizer; Profile hero shows `<DiceBearAvatar config={catalog.my}>`.

- [ ] **Step 1: Rewrite the mobile customizer**

Rewrite `AvatarCustomizerScreen.tsx` (Soft-Pop, mirror the old screen's structure). Behavior:
  - `useAvatarCatalog()` → `{premium, my}`. Local `draft: AvatarConfig` seeded from `my` (useState + useEffect-once).
  - Preview: a ref'd div wrapping `<DiceBearAvatar config={draft} />` (the ref is the snapshot target).
  - **Style tabs:** `<Segmented>` of `STYLE_LIST`. Switching style sets `draft = {style, options: {}}` (reset to that style's defaults).
  - **Slot pickers:** for each `slotsForStyle(draft.style)` entry, a horizontal variant strip. Tapping a value sets `draft.options[slot] = [value]` (immutably). For `PROB_SLOTS`, also set `draft.options[slot+'Probability'] = [100]`; a "none" chip sets `[0]` on the probability and removes the value. A variant is **locked** if a `premium` item matches `(draft.style, slot, value)` with `owned===false` → show 🔒 + price; tapping → `useConfirm` → `mobileApi.redeemReward(item.reward)` → invalidate `['avatar-catalog']` → equip + toast.
  - **Color pickers:** for each `colorSlotsForStyle(draft.style)`, a row of `COLOR_PALETTE` swatches → `draft.options[colorSlot] = [hex]` (`transparent` allowed for backgroundColor).
  - **Save:** `const png = await captureAvatarPng(previewRef.current!); saveAvatar.mutate({config: draft, snapshot: png ?? undefined}, {onSuccess: ()=>{toast; navigate(-1)}})`. Disable Save while `saveAvatar.isPending` or a buy is in flight.
  - Loading → `<Spinner>`; show point balance in the header (mirror how the old screen got it).

- [ ] **Step 2: Profile hero**

In `Profile.tsx`, replace the `AvatarBoundary`/`AvatarViewer` block with:
```tsx
{catalog ? (
  <div className="h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-paper-edge dark:border-slate-700">
    <DiceBearAvatar config={catalog.my} className="h-full w-full" />
  </div>
) : (
  <Avatar name={boot.full_name} image={boot.image} size={72} />
)}
```
Update imports: remove `AvatarViewer`/`AvatarBoundary`, add `import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'`. Keep the "Customize" button + the menu Row.

- [ ] **Step 3: Typecheck**

`cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit` → clean (no new errors).

- [ ] **Step 4: Commit**

```bash
git commit frontend/src/pages/AvatarCustomizerScreen.tsx frontend/src/pages/Profile.tsx -m "feat(avatar): DiceBear mobile customizer + profile hero"
```

---

## Task 4: Web customizer + Me hero

**Files:**
- Modify: `frontend-web/src/pages/AvatarCustomizer.tsx` (rewrite, Bento, mirror mobile logic)
- Modify: `frontend-web/src/pages/Me.tsx` (DiceBearAvatar tile — replace AvatarViewer/AvatarBoundary)

**Interfaces:**
- Consumes: same shared module via `@/avatar/*` + `@/hooks/useData` + `@/lib/api`; web `Dialog`/`Button`/Bento.

- [ ] **Step 1: Rewrite the web customizer**

Mirror Task 3's logic in Bento style (read `frontend/src/pages/AvatarCustomizerScreen.tsx` for the logic + `frontend-web/src/pages/Marketplace.tsx`/`Me.tsx` for styling). Reuse the SAME shared `@/avatar/*` + hooks. Buy confirm uses the web `Dialog` (from `@web/components/overlays/Dialog`), not native confirm.

- [ ] **Step 2: Me hero**

In `Me.tsx`, replace the `AvatarBoundary`/`AvatarViewer` tile content with `<DiceBearAvatar config={catalog.my} className="..."/>` (keep the tile + Customize button; fall back to the existing image avatar when `catalog` is undefined). Update imports (remove AvatarViewer/AvatarBoundary, add DiceBearAvatar).

- [ ] **Step 3: Typecheck**

`cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git commit frontend-web/src/pages/AvatarCustomizer.tsx frontend-web/src/pages/Me.tsx -m "feat(avatar): DiceBear web customizer + Me hero"
```

---

## Task 5: Build + deploy + verify

**Files:** (no source — build artifacts)

- [ ] **Step 1: Build both (light — no swap needed)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && NODE_OPTIONS=--max-old-space-size=2048 npm run build
```
Expected: both succeed (bundle ~hundreds of KB smaller than the three.js build).

- [ ] **Step 2: Deploy (commit built assets) + reload**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git commit vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js -m "build(avatar): deploy DiceBear avatar bundles"
kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
```

- [ ] **Step 3: Verify live**

```bash
curl -sS -o /dev/null -w "/m=%{http_code}\n" https://project.vernon.id/m
curl -sS -o /dev/null -w "/w=%{http_code}\n" https://project.vernon.id/w
curl -sS "https://project.vernon.id/api/method/vernon_project.api.mobile.get_avatar_catalog" | head -c 120
```
Expected: `/m` `/w` = 200; the catalog call returns the login-required PermissionError (whitelisted, needs auth) — same as other endpoints. Ask the user to open `/m/avatar`, pick a style + attributes, and confirm it renders + saves.

---

## Done

DiceBear avatar live on `/m` and `/w`: style + attribute customization, premium buy, snapshot→identity. three.js/GLBs gone; bundle lighter; builds without swap. Remaining polish (more styles, thumbnails per variant) is optional future work.
