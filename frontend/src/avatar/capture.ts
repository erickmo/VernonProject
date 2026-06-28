import { toPng } from 'html-to-image'
// Rasterize the avatar element to a PNG data-URL for the identity snapshot.
export async function captureAvatarPng(el: HTMLElement): Promise<string | null> {
  try { return await toPng(el, { pixelRatio: 2, cacheBust: true }) }
  catch { return null }
}
