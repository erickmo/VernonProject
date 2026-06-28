# 3D Avatar — Frontend Renderer, Customizer & Marketplace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Visual tasks are verified with the run/verify skill (build → deploy → load the live page → screenshot), not unit tests — the frontends have no test framework.

**Goal:** Render each user's customizable 3D avatar (three.js) on `/m` + `/w`, let them pick base style / hat / face / color, buy locked cosmetics with points, and save (snapshot becomes their identity image).

**Architecture:** A shared React-Three-Fiber module under `frontend/src/avatar/` (the web app imports it via its existing `@` → `../frontend/src` alias). Cosmetics attach at **bounding-box-computed anchors** keyed by a semantic `socket` value (`head_top`/`face`) — no embedded empty-nodes, no Blender (refines the spec). The customizer screens consume the Plan-1 backend API (`get_avatar_catalog`, `save_my_avatar`) and reuse `redeem_reward` for buying. GLB assets are CC0, fetched + optimized at build time into `vernon_project/public/models/`.

**Tech Stack:** React 18 + Vite, `three` + `@react-three/fiber` + `@react-three/drei`, TanStack Query, Frappe whitelisted API. Assets via `curl` + `npx @gltf-transform/cli`.

## Global Constraints

- **LIVE site, shared working tree, user editing frontend in parallel.** User explicitly authorized full execution now (build + deploy live) accepting that the deploy bundles their uncommitted frontend WIP and that shared files (`App.tsx`) carry their edits. Still: only `git add` the specific files each task changes; never `-A`/`.`.
- **Backend already shipped (Plan 1).** Endpoints `get_avatar_catalog`, `get_my_avatar`, `save_my_avatar` exist in `vernon_project/api/mobile.py`. They go HTTP-live by reloading gunicorn: `kill -HUP $(pgrep -f 'gunicorn' | head -1)` (no sudo; `bench restart` needs sudo and fails here). Reload before browser-verifying any task that calls them.
- **Catalog data already seeded:** Items `Human`(Base,default,free), `Cat`(Base,$200), `Cap`(Hat,default,free), `Crown`(Hat,$500), `Glasses`(Face,$150). `model_url` = `/assets/vernon_project/models/{base_human,base_cat,hat_cap,hat_crown,face_glasses}.glb` (files delivered in Task 2). `socket`: bases none, hats `head_top`, glasses `face`.
- **Asset URL convention:** GLBs live in `vernon_project/public/models/` → served at `/assets/vernon_project/models/<file>.glb`, fetched identically by both SPAs (NOT under either SPA's `--base`). This matches the seeded `model_url` exactly.
- **Web dedupe gotcha:** web resolves shared `@` code's bare deps from `frontend/node_modules` but its own code from `frontend-web/node_modules`; `frontend-web/vite.config.ts` force-dedupes singletons. `@react-three/fiber` builds a React reconciler and MUST use one React copy — so all three new deps go in `frontend/package.json`, and `three`/`@react-three/fiber`/`@react-three/drei` are ADDED to the web dedupe list. Keep ALL r3f usage inside `frontend/src/avatar/` so web screens import only `<AvatarViewer>` (no direct r3f import).
- **Build/deploy:** `cd frontend && npm run build` (→ `public/frontend`), `cd frontend-web && npm run build` (→ `public/frontend_web`). Both run `copy-html` after. Committing the built `public/frontend*` assets deploys live.
- **Design systems:** `/m` = Soft-Pop (paper-* tokens, indigo brand, Bricolage+Plus Jakarta fonts, lucide icons, animate-float/pop) — mirror existing screens like `MarketplaceScreen.tsx`/`Profile.tsx`. `/w` = Bento (`BentoGrid`/`BentoTile`/`BentoStat`) — mirror `Me.tsx`/`Marketplace.tsx`. NEVER native alert/confirm/prompt — use the existing dialog/Toast.
- **API client pattern:** `frontend/src/lib/api.ts` exposes `api.get/api.post`; module prefix `const M = 'vernon_project.api.mobile.'`; add methods as object properties mirroring `getMarketplace`/`redeemReward`. Hooks use TanStack Query in `frontend/src/hooks/useData.ts` mirroring `useMarketplace`/`useWallet`.

---

## Task 1: Add 3D deps + web dedupe

**Files:**
- Modify: `frontend/package.json` (dependencies)
- Modify: `frontend-web/package.json` (dependencies — react-three only if its own code ever imports them; here add for safety/types)
- Modify: `frontend-web/vite.config.ts` (dedupe list)

**Interfaces:**
- Produces: `three`, `@react-three/fiber`, `@react-three/drei` installed in `frontend/node_modules`; web build dedupes them.

- [ ] **Step 1: Add deps to mobile**

In `frontend/package.json` `dependencies`, add (use these version floors; npm resolves latest compatible):
```json
    "three": "^0.169.0",
    "@react-three/fiber": "^8.17.0",
    "@react-three/drei": "^9.114.0",
```
Also add to `frontend/package.json` `devDependencies` (for TS types):
```json
    "@types/three": "^0.169.0",
```

- [ ] **Step 2: Add the three deps to the web dedupe list**

In `frontend-web/vite.config.ts`, extend the existing `dedupe: [...]` array with:
```js
      'three',
      '@react-three/fiber',
      '@react-three/drei',
```

- [ ] **Step 3: Install**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm install`
Expected: installs without peer-dependency errors. (`@react-three/fiber` peers on `react@>=18` — satisfied.)

- [ ] **Step 4: Verify deps resolve + build works WITHOUT touching the live `public/` dir**

Run (build to a throwaway dir so the live `public/frontend` is not disturbed before the Task 5 deploy):
`cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx vite build --base=/assets/vernon_project/frontend/ --outDir /tmp/avatar-buildcheck --emptyOutDir`
Expected: build completes with no module-resolution errors. Then `rm -rf /tmp/avatar-buildcheck`. Do NOT run `npm run build` here (it would wipe/regenerate the committed `public/frontend` assets mid-plan).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend-web/vite.config.ts
git commit -m "feat(avatar): add three/r3f/drei deps + web dedupe"
```
(If `npm install` updated `frontend-web/package-lock.json` too, add it.)

---

## Task 2: Source + bundle CC0 GLB assets

**Files:**
- Create: `vernon_project/public/models/base_human.glb`, `base_cat.glb`, `hat_cap.glb`, `hat_crown.glb`, `face_glasses.glb`
- Create: `vernon_project/public/models/CREDITS.md` (CC0 source attribution)

**Interfaces:**
- Produces: five GLB files at the exact paths the catalog's `model_url` already points to, each a small (< ~300 KB) low-poly mesh, Y-up, roughly unit-height, centered near origin. Visual fit is tuned in Task 5 (anchors), not here — Task 2 only needs valid, loadable, reasonably-scaled meshes.

- [ ] **Step 1: Fetch CC0 source meshes**

Network egress works; `npx @gltf-transform/cli` (v4) is available. Source CC0 low-poly assets (Quaternius "Ultimate Modular Characters"/"Animated Characters", Kenney "Mini Characters"/"Holiday Kit" accessories — all CC0). Download a pack zip with `curl -L -o pack.zip <url>` and `unzip`, OR pull individual CC0 GLBs. For each of the five slots pick one mesh:
  - `base_human` — a humanoid low-poly character body
  - `base_cat` — a cat/animal low-poly character (Quaternius animated animals are CC0)
  - `hat_cap`, `hat_crown` — small headwear meshes
  - `face_glasses` — eyewear mesh
If a single clean source isn't found for a slot, a simple primitive built and exported via `@gltf-transform/core` (e.g., a torus = crown, box-brim = cap) is an acceptable CC0-free fallback — note which slots used fallbacks in CREDITS.md.

- [ ] **Step 2: Normalize + optimize each GLB**

For each mesh, produce a clean small GLB at the target path. Example with the CLI:
```bash
npx --yes @gltf-transform/cli optimize IN.glb vernon_project/public/models/base_human.glb \
  --texture-compress webp --simplify false
```
Then center + scale roughly to unit height (gltf-transform `center`; manual scale if needed). Goal: each base ~1 unit tall, hats/glasses proportioned to a head. Exact placement is Task 5's job.

- [ ] **Step 3: Verify each GLB loads + report size**

Run for each file:
```bash
npx --yes @gltf-transform/cli inspect vernon_project/public/models/base_human.glb | head -30
ls -la vernon_project/public/models/
```
Expected: `inspect` prints mesh/primitive info without error; each file < ~300 KB.

- [ ] **Step 4: Write CREDITS.md**

`vernon_project/public/models/CREDITS.md`: list each file, its CC0 source (author/URL) or "procedural fallback", and the CC0 license note.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/public/models/
git commit -m "feat(avatar): bundle CC0 GLB assets (2 bases, 2 hats, glasses)"
```

---

## Task 3: API client methods + data hooks + types

**Files:**
- Modify: `frontend/src/lib/api.ts` (add 3 methods)
- Modify: `frontend/src/lib/types.ts` (add avatar types)
- Modify: `frontend/src/hooks/useData.ts` (add 2 hooks)

**Interfaces:**
- Consumes: backend `get_avatar_catalog`, `get_my_avatar`, `save_my_avatar`.
- Produces:
  - types `AvatarItem { name, item_name, slot:'Base'|'Hat'|'Face', model_url, socket:string|null, thumbnail:string|null, owned:boolean, price:number|null, reward:string|null }`, `AvatarConfig { base:string|null, hat:string|null, face:string|null, skin_color:string, accent_color:string, snapshot:string|null }`, `AvatarCatalog { items: AvatarItem[], my: AvatarConfig }`.
  - `api.getAvatarCatalog(): Promise<AvatarCatalog>`, `api.getMyAvatar(): Promise<AvatarConfig>`, `api.saveMyAvatar(config, snapshotDataUrl?): Promise<AvatarConfig>`.
  - hooks `useAvatarCatalog()` (query key `['avatar-catalog']`), `useSaveAvatar()` (mutation; on success invalidates `['avatar-catalog']` and `['boot']`).

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts`:
```ts
export type AvatarSlot = 'Base' | 'Hat' | 'Face'
export interface AvatarItem {
  name: string
  item_name: string
  slot: AvatarSlot
  model_url: string
  socket: string | null
  thumbnail: string | null
  owned: boolean
  price: number | null
  reward: string | null
}
export interface AvatarConfig {
  base: string | null
  hat: string | null
  face: string | null
  skin_color: string
  accent_color: string
  snapshot: string | null
}
export interface AvatarCatalog {
  items: AvatarItem[]
  my: AvatarConfig
}
```

- [ ] **Step 2: Add api methods**

In `frontend/src/lib/api.ts`, near the marketplace methods, add:
```ts
  getAvatarCatalog: () =>
    api.get<import('./types').AvatarCatalog>(M + 'get_avatar_catalog'),
  getMyAvatar: () =>
    api.get<import('./types').AvatarConfig>(M + 'get_my_avatar'),
  saveMyAvatar: (config: Partial<import('./types').AvatarConfig>, snapshot_dataurl?: string) =>
    api.post<import('./types').AvatarConfig>(M + 'save_my_avatar', {
      config: JSON.stringify(config),
      snapshot_dataurl,
    }),
```
(`config` is JSON-stringified to match the backend `isinstance(config, str)` parse path.)

- [ ] **Step 3: Add hooks**

In `frontend/src/hooks/useData.ts`, mirroring `useMarketplace`:
```ts
export function useAvatarCatalog() {
  return useQuery({
    queryKey: ['avatar-catalog'],
    queryFn: () => api.getAvatarCatalog(),
  })
}

export function useSaveAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ config, snapshot }: { config: Partial<import('../lib/types').AvatarConfig>; snapshot?: string }) =>
      api.saveMyAvatar(config, snapshot),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avatar-catalog'] })
      qc.invalidateQueries({ queryKey: ['boot'] })
    },
  })
}
```
(Match the file's actual import names for `useQuery`/`useMutation`/`useQueryClient`/`api` — read the top of `useData.ts` first and use whatever it already imports. The boot query key may differ; use the same key `useBoot` uses.)

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new type errors from the added code. (Pre-existing errors elsewhere, if any, are out of scope — note them.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat(avatar): api methods + query hooks + types"
```

---

## Task 4: Shared AvatarViewer module (r3f)

**Files:**
- Create: `frontend/src/avatar/anchors.ts`
- Create: `frontend/src/avatar/AvatarViewer.tsx`
- Create: `frontend/src/avatar/useAvatarCapture.ts`

**Interfaces:**
- Consumes: `three`, `@react-three/fiber`, `@react-three/drei`, `AvatarItem`/`AvatarConfig` types.
- Produces:
  - `BASE_ANCHORS: Record<string, Record<string,{x?:number;y?:number;z?:number;scale?:number}>>` — per-base, per-socket offset config (fractions of the base bbox). Default fallbacks built in.
  - `computeAnchor(baseScene, socket, baseName) => { position: THREE.Vector3; scale: number }`.
  - `<AvatarViewer config items onCaptureRef? interactive? />` — loads the base GLB by `config.base`'s `model_url`, attaches hat/face GLBs at computed anchors, applies `skin_color` tint to the base body mesh(es), `OrbitControls` (rotate only) when `interactive`, fixed light rig. Exposes a capture function via `onCaptureRef` (a ref the parent calls to get a PNG data-URL).
  - `useAvatarCapture(glRef)` helper returning `() => string` (calls `gl.domElement.toDataURL('image/png')`).

- [ ] **Step 1: Anchor math**

`frontend/src/avatar/anchors.ts`:
```ts
import * as THREE from 'three'

type Off = { x?: number; y?: number; z?: number; scale?: number }
// Offsets are fractions of the base bounding box. y is measured from box.min.y
// (0 = feet, 1 = top of head). Tuned by eye in Task 5's verify step.
export const BASE_ANCHORS: Record<string, Record<string, Off>> = {
  // keyed by Avatar Item name; '_default' used when a base has no entry
  _default: {
    head_top: { x: 0, y: 0.98, z: 0, scale: 0.55 },
    face:     { x: 0, y: 0.86, z: 0.12, scale: 0.35 },
  },
}

export function computeAnchor(base: THREE.Object3D, socket: string, baseName: string) {
  const box = new THREE.Box3().setFromObject(base)
  const size = new THREE.Vector3(); box.getSize(size)
  const center = new THREE.Vector3(); box.getCenter(center)
  const cfg = (BASE_ANCHORS[baseName] || BASE_ANCHORS._default)[socket]
    || BASE_ANCHORS._default[socket] || { y: 1, scale: 0.4 }
  return {
    position: new THREE.Vector3(
      center.x + (cfg.x ?? 0) * size.x,
      box.min.y + (cfg.y ?? 1) * size.y,
      center.z + (cfg.z ?? 0) * size.z,
    ),
    scale: (cfg.scale ?? 0.4) * size.x,
  }
}
```

- [ ] **Step 2: Capture helper**

`frontend/src/avatar/useAvatarCapture.ts`:
```ts
import * as THREE from 'three'
// Read the WebGL canvas as a PNG data-URL. Requires the Canvas to be created
// with gl={{ preserveDrawingBuffer: true }}.
export function captureCanvas(gl: THREE.WebGLRenderer): string {
  return gl.domElement.toDataURL('image/png')
}
```

- [ ] **Step 3: The viewer**

`frontend/src/avatar/AvatarViewer.tsx`:
```tsx
import { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Bounds, Center } from '@react-three/drei'
import * as THREE from 'three'
import { computeAnchor } from './anchors'
import { captureCanvas } from './useAvatarCapture'
import type { AvatarItem, AvatarConfig } from '../lib/types'

function urlFor(items: AvatarItem[], name: string | null) {
  return items.find((i) => i.name === name)?.model_url || null
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return useMemo(() => scene.clone(true), [scene])
}

function Avatar({ config, items }: { config: AvatarConfig; items: AvatarItem[] }) {
  const baseUrl = urlFor(items, config.base)
  const hatUrl = urlFor(items, config.hat)
  const faceUrl = urlFor(items, config.face)
  const baseRef = useRef<THREE.Group>(null)

  // Tint the base body with skin_color (Task 5 may refine which meshes).
  useEffect(() => {
    const g = baseRef.current
    if (!g) return
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'color' in m) m.color = new THREE.Color(config.skin_color)
    })
  }, [config.skin_color, config.base])

  return (
    <Center>
      <group ref={baseRef}>
        {baseUrl && <Model url={baseUrl} />}
      </group>
      {baseUrl && hatUrl && config.hat && (
        <Attachment baseRef={baseRef} url={hatUrl} socket="head_top" baseName={config.base!} />
      )}
      {baseUrl && faceUrl && config.face && (
        <Attachment baseRef={baseRef} url={faceUrl} socket="face" baseName={config.base!} />
      )}
    </Center>
  )
}

function Attachment({ baseRef, url, socket, baseName }: {
  baseRef: React.RefObject<THREE.Group>; url: string; socket: string; baseName: string
}) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!baseRef.current || !ref.current) return
    const a = computeAnchor(baseRef.current, socket, baseName)
    ref.current.position.copy(a.position)
    ref.current.scale.setScalar(a.scale)
  })
  return <group ref={ref}><Model url={url} /></group>
}

function CaptureBridge({ onReady }: { onReady?: (fn: () => string) => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => { onReady?.(() => captureCanvas(gl)) }, [gl, onReady])
  return null
}

export function AvatarViewer({ config, items, interactive = true, onCapture }: {
  config: AvatarConfig
  items: AvatarItem[]
  interactive?: boolean
  onCapture?: (fn: () => string) => void
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 3], fov: 40 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          <Avatar config={config} items={items} />
        </Bounds>
      </Suspense>
      {interactive && <OrbitControls enablePan={false} enableZoom={false} />}
      <CaptureBridge onReady={onCapture} />
    </Canvas>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors from `src/avatar/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/avatar
git commit -m "feat(avatar): shared r3f AvatarViewer + bbox anchors + capture"
```

---

## Task 5: Mobile customizer screen + route + profile hero (vertical slice)

**Files:**
- Create: `frontend/src/pages/AvatarCustomizerScreen.tsx`
- Modify: `frontend/src/App.tsx` (add `/avatar` route + import)
- Modify: `frontend/src/pages/Profile.tsx` (replace static avatar with `<AvatarViewer interactive={false}>` hero + a "Customize" button → `/avatar`)

**Interfaces:**
- Consumes: `useAvatarCatalog`, `useSaveAvatar`, `AvatarViewer`, existing `Segmented`/`Pill`/`Spinner`/`Toast` primitives from `@/components/ui`.
- Produces: route `/avatar` rendering the customizer. The customizer shows the live `AvatarViewer`, slot tabs (Base/Hat/Face/Color), an item grid per slot (owned items equippable; locked items show 🔒 + price — Task 6 wires buying), color swatches for the Color tab, and Save. Save captures the canvas → data-URL → `useSaveAvatar({config, snapshot})`; on success toasts and navigates back.

- [ ] **Step 1: Build the customizer screen**

Create `frontend/src/pages/AvatarCustomizerScreen.tsx` following the Soft-Pop style of `MarketplaceScreen.tsx`. Behavior:
  - Load `useAvatarCatalog()`. Keep a local `draft: AvatarConfig` seeded from `catalog.my`.
  - Top: `<AvatarViewer config={draft} items={catalog.items} onCapture={fn => (captureRef.current = fn)} />` in a fixed-height paper card.
  - `<Segmented>` tabs: Base / Hat / Face / Color.
  - Base/Hat/Face tabs: grid of items filtered by slot. Tapping an OWNED item sets `draft[slot] = item.name` (Hat/Face toggle off if re-tapped). LOCKED items render with a 🔒 + `point_cost` badge and are non-equip for now (Task 6).
  - Color tab: a row of preset skin swatches (set `draft.skin_color`) + accent swatches (`draft.accent_color`). Use `<input type="color">` for a custom picker (native platform feature, not a lib).
  - Save button: `const dataUrl = captureRef.current?.(); saveAvatar.mutate({ config: draft, snapshot: dataUrl })`. On success: success Toast + `navigate(-1)`.
  - Loading → `<Spinner>`; error → existing error UI.

- [ ] **Step 2: Add the route**

In `frontend/src/App.tsx`: add `import AvatarCustomizerScreen from './pages/AvatarCustomizerScreen'` with the other imports, and `<Route path="/avatar" element={<AvatarCustomizerScreen />} />` inside `<Routes>`.

- [ ] **Step 3: Profile hero**

In `frontend/src/pages/Profile.tsx`, replace the static `<Avatar>`/image header with `<AvatarViewer config={...} items={...} interactive={false} />` (load via `useAvatarCatalog`; fall back to the existing image avatar while loading or if WebGL is unavailable) and add a "Customize" button → `navigate('/avatar')`. Keep the existing badge pill.

- [ ] **Step 4: Build, deploy, reload, browser-verify**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
kill -HUP $(pgrep -f 'gunicorn' | head -1)   # make backend endpoints HTTP-live
```
Then use the run/verify skill: load `https://project.vernon.id/m/avatar` (authenticated), screenshot. Verify: the avatar renders (base + default cap), switching Base to Cat swaps the model, Color changes tint, Save returns to profile and the profile hero + identity image reflect the new look. **Tune `BASE_ANCHORS` (Task 4) here** until the hat/glasses sit right; commit anchor tweaks as part of this task. Capture a screenshot as evidence.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AvatarCustomizerScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx frontend/src/avatar/anchors.ts vernon_project/public/frontend
git commit -m "feat(avatar): mobile customizer + route + profile hero"
```
(Include `vernon_project/public/frontend` built assets — this deploys the slice live. NOTE: the build also bundles the user's other frontend WIP, per their authorization.)

---

## Task 6: Buy locked cosmetics from the customizer

**Files:**
- Modify: `frontend/src/pages/AvatarCustomizerScreen.tsx`

**Interfaces:**
- Consumes: existing `api.redeemReward` (already in api.ts) + a wallet-balance source (mirror how `MarketplaceScreen` reads balance), `useAvatarCatalog` (refetch after buy).
- Produces: tapping a LOCKED item opens a confirm dialog ("Buy {item} for {price} points?"); on confirm calls `redeemReward(item.reward)`, then invalidates `['avatar-catalog']` so the item becomes `owned`, then auto-equips it. Insufficient-balance / out-of-stock errors surface via Toast/dialog (server-enforced).

- [ ] **Step 1: Wire the buy flow**

In the locked-item tap handler: show the existing dialog modal (NOT native confirm) with the price; on confirm:
```ts
await api.redeemReward(item.reward!)
await qc.invalidateQueries({ queryKey: ['avatar-catalog'] })
setDraft((d) => ({ ...d, [slotKey]: item.name }))   // auto-equip after buy
toast.success(`Unlocked ${item.item_name}`)
```
Wrap in try/catch; on error show `toast.error(err.message)` (server returns "Insufficient balance"/"Out of stock"). Show the caller's point balance somewhere in the header so the price is meaningful.

- [ ] **Step 2: Build, deploy, reload, browser-verify**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
kill -HUP $(pgrep -f 'gunicorn' | head -1)
```
run/verify: on `/m/avatar`, tap a locked item (e.g. Crown $500) as a user with enough points → confirm → it unlocks, equips, and balance drops; as a user without enough points → "Insufficient balance" toast, stays locked. Screenshot both.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AvatarCustomizerScreen.tsx vernon_project/public/frontend
git commit -m "feat(avatar): buy locked cosmetics from customizer (reuse redeem)"
```

---

## Task 7: Web customizer + route + Me hero

**Files:**
- Create: `frontend-web/src/pages/AvatarCustomizer.tsx`
- Modify: `frontend-web/src/App.tsx` (route + import)
- Modify: `frontend-web/src/pages/Me.tsx` (Bento tile with `<AvatarViewer>` + Customize button)

**Interfaces:**
- Consumes: shared `@/avatar/AvatarViewer`, `@/hooks/useData` (`useAvatarCatalog`/`useSaveAvatar`), `@/lib/api`, web `BentoGrid`/`BentoTile`/`Button`/`Drawer`.
- Produces: route `/avatar` on web rendering a Bento-styled customizer with the same behavior as mobile (equip/color/buy/save→snapshot); `Me.tsx` shows a live avatar tile + Customize.

- [ ] **Step 1: Build the web customizer**

Create `frontend-web/src/pages/AvatarCustomizer.tsx` mirroring the mobile screen's logic but in Bento style (mirror `Marketplace.tsx`/`Me.tsx`). Reuse the SAME hooks (`@/hooks/useData`) and `@/avatar/AvatarViewer` — only the layout/styling differs. Buy flow uses the web dialog/Drawer, not native confirm.

- [ ] **Step 2: Route + Me hero**

`frontend-web/src/App.tsx`: import + `<Route path="/avatar" element={<AvatarCustomizer />} />`. `frontend-web/src/pages/Me.tsx`: add a `BentoTile` rendering `<AvatarViewer interactive={false}>` + a "Customize" `Button` → `/avatar`.

- [ ] **Step 3: Build, deploy, reload, browser-verify**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
kill -HUP $(pgrep -f 'gunicorn' | head -1)
```
run/verify: load `https://project.vernon.id/w/avatar`, confirm render/equip/color/buy/save all work and the snapshot updates identity on web. Screenshot. Confirm NO "two React copies"/"No QueryClient" console error (the dedupe from Task 1 prevents it) — if it appears, the dedupe list is the fix.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/AvatarCustomizer.tsx frontend-web/src/App.tsx frontend-web/src/pages/Me.tsx vernon_project/public/frontend_web
git commit -m "feat(avatar): web customizer + route + Me hero"
```

---

## Done

After this plan: users can open the customizer on `/m` and `/w`, pick base/hat/face/color, buy locked cosmetics with points, and save — with the composed avatar becoming their identity image everywhere. Backend (Plan 1) + frontend (this) = the full feature shipped. Remaining polish (idle animation, more bases/cosmetics, leaderboard live-3D) is future, optional work.
