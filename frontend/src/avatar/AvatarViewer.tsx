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
  // ponytail: primitive wraps raw THREE.Group — useMemo inline returns Group not ReactNode
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} />
}

function Avatar({ config, items, readyRef }: { config: AvatarConfig; items: AvatarItem[]; readyRef: React.MutableRefObject<boolean> }) {
  const baseUrl = urlFor(items, config.base)
  const hatUrl = urlFor(items, config.hat)
  const faceUrl = urlFor(items, config.face)
  const baseRef = useRef<THREE.Group>(null)

  // ponytail: Avatar mounts only after Suspense resolves (GLTF loaded), so this is the right place to mark ready
  useEffect(() => { if (baseUrl) readyRef.current = true }, [baseUrl, readyRef])

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

function CaptureBridge({ onReady, readyRef }: { onReady?: (fn: () => string | null) => void; readyRef: React.MutableRefObject<boolean> }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => { onReady?.(() => readyRef.current ? captureCanvas(gl) : null) }, [gl, onReady, readyRef])
  return null
}

export function AvatarViewer({ config, items, interactive = true, onCapture }: {
  config: AvatarConfig
  items: AvatarItem[]
  interactive?: boolean
  onCapture?: (fn: () => string | null) => void
}) {
  const readyRef = useRef<boolean>(false)
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
          <Avatar config={config} items={items} readyRef={readyRef} />
        </Bounds>
      </Suspense>
      {interactive && <OrbitControls enablePan={false} enableZoom={false} />}
      <CaptureBridge onReady={onCapture} readyRef={readyRef} />
    </Canvas>
  )
}
