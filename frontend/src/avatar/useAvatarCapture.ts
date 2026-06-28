import * as THREE from 'three'
// Read the WebGL canvas as a PNG data-URL. Requires the Canvas to be created
// with gl={{ preserveDrawingBuffer: true }}.
export function captureCanvas(gl: THREE.WebGLRenderer): string {
  return gl.domElement.toDataURL('image/png')
}
