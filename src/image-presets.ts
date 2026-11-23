import { pack } from './color.ts'
import { stampImage, type Pixels } from './image.ts'
import { M } from './materials.ts'
import { World } from './world.ts'

export type ImagePreset = 'box' | 'sandfall' | 'split' | 'speakers' | 'fireworks'
export type ImageEffect = { preset: ImagePreset; cells: number[]; fired: boolean; x: number; y: number; width: number; height: number }
export const MAX_IMAGE_GRAINS = 9000
export const IMAGE_PRESETS: { id: ImagePreset; name: string; tag: string; detail: string }[] = [
  { id: 'box', name: 'Sand Box', tag: 'BURST + CATCH', detail: 'Your picture bursts into colored sand inside a solid box. Keep mixing it with the beat.' },
  { id: 'sandfall', name: 'Sandfall', tag: 'POUR + LAYER', detail: 'The picture melts into a sand curtain, tumbles through staggered chutes, and builds colorful layers.' },
  { id: 'split', name: 'Split Drop', tag: 'SPLIT + SORT', detail: 'The two halves fly apart into twin collectors. Watch the colors separate and settle.' },
  { id: 'speakers', name: 'Speaker Pit', tag: 'DROP + REMIX', detail: 'The picture falls into a speaker-lined pit. Bass kicks keep throwing its colors back into the air.' },
  { id: 'fireworks', name: 'Firework Reveal', tag: 'LAUNCH + RAIN', detail: 'Your picture erupts into a colorful firework, then rains back down as real sand into a wide tray.' },
]

export function imageRegion(preset: ImagePreset, width: number, height: number) {
  const maxWidth = width * (preset === 'split' ? .68 : .62)
  const maxHeight = height * (preset === 'sandfall' || preset === 'split' ? .28 : .4)
  return { maxWidth: Math.max(4, Math.floor(maxWidth)), maxHeight: Math.max(4, Math.floor(maxHeight)) }
}

/** Fit the entire photo; keep a fixed grain budget even in a Fine/large world. */
export function fitPresetPhoto(imageWidth: number, imageHeight: number, maxWidth: number, maxHeight: number) {
  if (![imageWidth, imageHeight, maxWidth, maxHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid image size.')
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, Math.sqrt(MAX_IMAGE_GRAINS / (imageWidth * imageHeight)))
  return { width: Math.max(1, Math.floor(imageWidth * scale)), height: Math.max(1, Math.floor(imageHeight * scale)) }
}

export function resizePixels(source: Pixels, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (Math.min(source.height - 1, Math.floor((y + .5) * source.height / height)) * source.width + Math.min(source.width - 1, Math.floor((x + .5) * source.width / width))) * 4
    data.set(source.data.subarray(i, i + 4), (y * width + x) * 4)
  }
  return { width, height, data }
}

/** Small built-in artwork so the whole Image Lab can be tried without a file. */
export function demoImage(): Pixels {
  const width = 96, height = 72, data = new Uint8ClampedArray(width * height * 4)
  const letters = ['11110', '10001', '10001', '11110', '10000', '10000', '10000']
  const r = ['11110', '10001', '10001', '11110', '10100', '10010', '10001']
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const d = Math.hypot(x - 48, y - 36), stripe = (x + y) % 16 < 8
    let color = d < 32 ? [220, 72 + y * 1.4, 56 + x] : stripe ? [32, 39, 63] : [42, 53, 80]
    for (const [glyph, left] of [[letters, 23], [r, 51]] as const) {
      const gx = Math.floor((x - left) / 4), gy = Math.floor((y - 22) / 4)
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyph[gy][gx] === '1') color = [244, 234, 203]
    }
    data.set([...color, 255], (y * width + x) * 4)
  }
  return { width, height, data }
}

export function buildImageScene(width: number, height: number, preset: ImagePreset, photo: Pixels, rng = Math.random) {
  if (width < 48 || height < 40 || !IMAGE_PRESETS.some(p => p.id === preset)) throw new Error('Invalid image preset.')
  const region = imageRegion(preset, width, height)
  if (photo.width > region.maxWidth || photo.height > region.maxHeight || photo.width * photo.height > MAX_IMAGE_GRAINS || photo.data.length !== photo.width * photo.height * 4)
    throw new Error('That image needs to be fitted to the preset first.')
  if (!photo.data.some((v, i) => i % 4 === 3 && v >= 128)) throw new Error('No visible image remains. Try turning off Cut background.')
  const world = new World(width, height, rng)
  world.scene = 'blank'
  const wall = pack(126, 132, 125), edge = pack(214, 207, 182)
  const rect = (x0: number, y0: number, x1: number, y1: number, material = M.Wall as number) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(height, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(width, Math.round(x1)); x++) {
        const i = world.index(x, y); world.put(i, material)
        if (material === M.Wall) world.color[i] = y === Math.round(y0) ? edge : wall
      }
  }
  const thick = Math.max(2, Math.round(Math.min(width, height) * .012)), floor = Math.round(height * .93)
  // A continuous floor and side rails catch every grain, even in portrait layouts.
  rect(0, floor, width, height)
  rect(0, 0, thick, height); rect(width - thick, 0, width, height)
  if (preset === 'box') {
    rect(width * .08, height * .1, width * .08 + thick, floor)
    rect(width * .92 - thick, height * .1, width * .92, floor)
    rect(width * .08, height * .1, width * .92, height * .1 + thick)
  } else if (preset === 'sandfall') {
    rect(thick, height * .5, width * .62, height * .5 + thick)
    rect(width * .38, height * .67, width - thick, height * .67 + thick)
  } else if (preset === 'split') {
    rect(width * .5 - thick / 2, height * .48, width * .5 + thick / 2, floor)
    rect(width * .06, height * .6, width * .06 + thick, floor)
    rect(width * .94 - thick, height * .6, width * .94, floor)
  } else if (preset === 'speakers') {
    for (const u of [.22, .78]) {
      const x = Math.round(width * u), w = Math.max(6, Math.round(width * .045)), h = Math.max(8, Math.round(height * .12))
      rect(x - w / 2, floor - h, x + w / 2, floor, M.Speaker)
      rect(x - w / 2 - thick, floor, x + w / 2 + thick, floor + thick)
    }
  } else {
    rect(width * .06, height * .68, width * .06 + thick, floor)
    rect(width * .94 - thick, height * .68, width * .94, floor)
  }
  const x = Math.floor((width - photo.width) / 2)
  const y = Math.round(height * (preset === 'sandfall' || preset === 'split' ? .12 : .24))
  stampImage(world, photo, x, y, 'statue')
  const cells: number[] = []
  for (let py = 0; py < photo.height; py++) for (let px = 0; px < photo.width; px++) {
    if (photo.data[(py * photo.width + px) * 4 + 3] >= 128) cells.push(world.index(x + px, y + py))
  }
  world.imageEffect = { preset, cells, fired: false, x, y, width: photo.width, height: photo.height }
  attachImageEffect(world)
  return world
}

/** Converts only the photo's cells. Solid scenery remains solid and reusable. */
export function releaseImage(world: World) {
  const effect = world.imageEffect
  if (!effect || effect.fired) return 0
  effect.fired = true
  const cx = effect.x + effect.width / 2, cy = effect.y + effect.height / 2
  let released = 0
  for (const i of effect.cells) {
    if (world.type[i] !== M.Brick) continue
    world.type[i] = M.Sand; world.life[i] = 0; released++
    const x = i % world.width + .5, y = (i / world.width | 0) + .5
    if (effect.preset === 'sandfall') continue
    const dx = (x - cx) / Math.max(1, effect.width / 2), dy = (y - cy) / Math.max(1, effect.height / 2)
    if (effect.preset === 'box') world.launch(i, dx * 3.3, dy * 2.4 - 1.8)
    else if (effect.preset === 'split') world.launch(i, (dx < 0 ? -1 : 1) * (1.3 + Math.abs(dx) * 2), -.7 - world.rng())
    else if (effect.preset === 'speakers') world.launch(i, dx * .4, -.4)
    else {
      const color = world.color[i]
      world.launch(i, dx * 3.5, dy * 2.8 - 3)
      if (released % 40 === 0) world.addParticle(x, y, dx * 4, dy * 3 - 3.5, M.Spark, color, 45)
    }
  }
  return released
}

export function attachImageEffect(world: World) {
  // The hook takes its World argument: cloned worlds never call back into the original.
  world.hooks = { ...world.hooks, drop: releaseImage }
}

/** Optional save metadata; ordinary world saves remain backward-compatible. */
export function restoreImageEffect(world: World, value: unknown) {
  const e = value as ImageEffect | null
  if (!e || !IMAGE_PRESETS.some(p => p.id === e.preset) || typeof e.fired !== 'boolean' || !Array.isArray(e.cells) || e.cells.length > MAX_IMAGE_GRAINS ||
    !e.cells.every(i => Number.isInteger(i) && i >= 0 && i < world.size) ||
    ![e.x, e.y, e.width, e.height].every(Number.isInteger) || e.x < 0 || e.y < 0 || e.width < 1 || e.height < 1 || e.x + e.width > world.width || e.y + e.height > world.height ||
    !e.cells.every(i => i % world.width >= e.x && i % world.width < e.x + e.width && Math.floor(i / world.width) >= e.y && Math.floor(i / world.width) < e.y + e.height))
    throw new Error('Invalid image preset data.')
  world.imageEffect = { preset: e.preset, fired: e.fired, cells: [...e.cells], x: e.x, y: e.y, width: e.width, height: e.height }
  attachImageEffect(world)
}
