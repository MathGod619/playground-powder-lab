import { pack } from './color.ts'
import { M } from './materials.ts'
import { HELD_SAND as HELD, type World } from './world.ts'

/** What an uploaded picture is made of once it lands in the world. */
export type ImageMode = 'statue' | 'sand' | 'elements'

export const IMAGE_MODES: { id: ImageMode; name: string; detail: string }[] = [
  { id: 'statue', name: 'Statue', detail: 'Brick in its own colours. Blasts knock holes in it and the rest crumbles.' },
  { id: 'sand', name: 'Sand', detail: 'Holds its shape until the first kick, then the beat shakes it apart.' },
  { id: 'elements', name: 'Elements', detail: 'Colours become materials: blue water, red lava, green plants, white cloud.' },
]

/** Plain RGBA pixels (an ImageData, or anything shaped like one). */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array }


const dist = (d: Pixels['data'], i: number, r: number, g: number, b: number) =>
  Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b)

/**
 * Marks the background of a photo as transparent: flood-fills inward from the border through
 * pixels that change only gradually and stay close to the border's average colour.
 * Returns a new pixel buffer; already-transparent pixels stay transparent.
 */
export function removeBackground(src: Pixels, tolerance = 1): Pixels {
  const { width: w, height: h } = src
  const data = new Uint8ClampedArray(src.data)
  let r = 0, g = 0, b = 0, n = 0
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  for (const p of border) { const i = p * 4; if (data[i + 3] > 127) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++ } }
  if (!n) return { width: w, height: h, data }
  r /= n; g /= n; b /= n
  const step = 26 * tolerance, far = 95 * tolerance
  const seen = new Uint8Array(w * h), queue: number[] = []
  for (const p of border) {
    if (seen[p]) continue
    seen[p] = 1
    if (data[p * 4 + 3] <= 127 || dist(data, p * 4, r, g, b) < far) queue.push(p)
  }
  while (queue.length) {
    const p = queue.pop()!, i = p * 4, x = p % w, y = p / w | 0
    const pr = data[i], pg = data[i + 1], pb = data[i + 2]
    data[i + 3] = 0
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0 || seen[q]) continue
      const j = q * 4
      if (data[j + 3] > 127 && (dist(data, j, pr, pg, pb) > step || dist(data, j, r, g, b) > far)) continue
      seen[q] = 1
      queue.push(q)
    }
  }
  return { width: w, height: h, data }
}

function hslOf(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return { h: 0, s: 0, l, c: 0 }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return { h: (h + 360) % 360, s, l, c: d }
}

/** The material a pixel becomes in Elements mode. */
export function elementFor(r: number, g: number, b: number): number {
  const { h, s, l, c } = hslOf(r, g, b)
  if (l < .13) return M.Wall
  if (s < .2) return l > .78 ? M.Cloud : l > .45 ? M.Sand : M.Wall
  if (h >= 185 && h < 260) return M.Water
  if (h >= 160 && h < 185) return l > .6 ? M.Glitter : M.Water
  if (h >= 70 && h < 160) return M.Plant
  if (h >= 30 && h < 70) return s > .55 && l > .5 ? M.Glitter : M.Sand
  // reds and oranges: strong colour is lava; muted (skin, wood, brick) is sand
  if (h < 30 || h >= 335) return l < .3 ? M.Wall : c > .5 ? M.Lava : M.Sand
  return l < .35 ? M.Oil : M.Glitter
}

/** Cells an image may not overwrite, so stamping never deletes your speakers or bombs. */
const KEEP = new Set<number>([M.Speaker, M.Bomb])

/**
 * Stamps pixels into the world with their top-left at cell (x0, y0). Each opaque pixel becomes one
 * cell that keeps the pixel's colour. Returns the number of cells placed.
 */
export function stampImage(world: World, px: Pixels, x0: number, y0: number, mode: ImageMode) {
  const { width: W, height: H } = world, d = px.data, r = world.rng
  let placed = 0
  for (let py = 0; py < px.height; py++) {
    const y = y0 + py
    if (y < 0 || y >= H) continue
    for (let pxx = 0; pxx < px.width; pxx++) {
      const x = x0 + pxx
      if (x < 0 || x >= W) continue
      const i = (py * px.width + pxx) * 4
      if (d[i + 3] < 128) continue
      const cell = y * W + x
      if (KEEP.has(world.type[cell])) continue
      const color = pack(d[i], d[i + 1], d[i + 2])
      const material = mode === 'statue' ? M.Brick : mode === 'sand' ? M.Sand : elementFor(d[i], d[i + 1], d[i + 2])
      world.put(cell, material)
      world.life[cell] = 0
      if (material === M.Plant) world.life[cell] = r() < .05 ? 8 + r() * 14 : 0
      else if (material === M.Cloud) world.color[cell] = pack(d[i], d[i + 1], d[i + 2], 225)
      if (material !== M.Cloud) world.color[cell] = color
      if (mode === 'sand') world.life[cell] = HELD
      placed++
    }
  }
  return placed
}

/** Size in cells for an image `widthCells` wide, keeping its aspect ratio. */
export function fitSize(imageWidth: number, imageHeight: number, widthCells: number) {
  const w = Math.max(4, Math.round(widthCells))
  return { width: w, height: Math.max(1, Math.round(w * imageHeight / imageWidth)) }
}

/** Center-crop the source to cover the world without stretching or allocating off-screen pixels. */
export function coverCrop(imageWidth: number, imageHeight: number, width: number, height: number) {
  const scale = Math.max(width / imageWidth, height / imageHeight)
  const cropWidth = Math.min(imageWidth, width / scale), cropHeight = Math.min(imageHeight, height / scale)
  return { x: (imageWidth - cropWidth) / 2, y: (imageHeight - cropHeight) / 2, width: cropWidth, height: cropHeight }
}
