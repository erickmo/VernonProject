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
