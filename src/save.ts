import { HOPPER, M } from './materials.ts'
import { attachScene, SCENE_IDS } from './scenes.ts'
import { World, type SceneId } from './world.ts'
import { restoreImageEffect } from './image-presets.ts'

export const SAVE_KEY = 'powder-rave-save-v1'
export const MAX_FILE_BYTES = 16_000_000
const FORMAT = 'powder-rave'
const VERSION = 1

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function fromBase64(text: string) {
  const s = atob(text), out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * Serialises the grid (type, life and per-cell colour, so glitter keeps its rainbow).
 * Airborne particles are dropped back where they are, so nothing is lost mid-jump.
 */
export function encodeWorld(world: World) {
  const type = world.type.slice(), life = world.life.slice(), color = world.color.slice()
  for (let k = 0; k < world.particles; k++) {
    const t = world.pType[k]
    if (t === M.Spark || !HOPPER[t]) continue
    const x = world.px[k] | 0, y = world.py[k] | 0
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue
    const i = y * world.width + x
    if (type[i] === M.Empty) { type[i] = t; color[i] = world.pColor[k]; life[i] = world.pLife[k] }
  }
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    width: world.width,
    height: world.height,
    scene: world.scene,
    craterY: world.craterY,
    marks: world.marks,
    hue: world.hue,
    ...(world.imageEffect ? { imageEffect: world.imageEffect } : {}),
    physics: { gravity: world.rules.gravity, fall: world.rules.fall, wind: world.directorWind,
      plantsInWater: world.rules.plantsInWater, throughWater: world.rules.throughWater },
    type: toBase64(type),
    life: toBase64(life),
    color: toBase64(new Uint8Array(color.buffer)),
  })
}

export function decodeWorld(json: string) {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('That file is not a Powder Rave world.')
  }
  if (data?.format !== FORMAT) throw new Error('That file is not a Powder Rave world.')
  if (data.version !== VERSION) throw new Error('That world was saved by a newer version.')
  const { width, height } = data
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 8 || (height as number) < 8 ||
      (width as number) * (height as number) > 2_000_000) throw new Error('That world has an invalid size.')
  const world = new World(width as number, height as number)
  const type = fromBase64(String(data.type)), life = fromBase64(String(data.life)), color = fromBase64(String(data.color))
  if (type.length !== world.size || life.length !== world.size || color.length !== world.size * 4) throw new Error('That world file is damaged.')
  world.type.set(type)
  world.life.set(life)
  new Uint8Array(world.color.buffer).set(color)
  attachScene(world, SCENE_IDS.includes(data.scene as SceneId) ? data.scene as SceneId : 'blank')
  world.craterY = Number(data.craterY) || 0
  if (Array.isArray(data.marks)) {
    world.marks = data.marks.slice(0, 64).filter(m => Number.isFinite(m?.x) && Number.isFinite(m?.y)).map(m => ({ x: +m.x, y: +m.y }))
  }
  world.hue = Number(data.hue) || 300
  if (data.physics && typeof data.physics === 'object') {
    const p = data.physics as Record<string, unknown>
    if (typeof p.gravity !== 'number' || !Number.isFinite(p.gravity) || p.gravity < .05 || p.gravity > 2 ||
      typeof p.fall !== 'number' || !Number.isFinite(p.fall) || p.fall < .05 || p.fall > 1 ||
      typeof p.wind !== 'number' || !Number.isFinite(p.wind) || Math.abs(p.wind) > 1) throw new Error('Invalid world physics.')
    for (const key of ['plantsInWater', 'throughWater'])
      if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new Error('Invalid world physics.')
    world.rules = { ...world.rules, gravity: p.gravity, fall: p.fall,
      ...(typeof p.plantsInWater === 'boolean' ? { plantsInWater: p.plantsInWater } : {}),
      ...(typeof p.throughWater === 'boolean' ? { throughWater: p.throughWater } : {}) }
    world.directorWind = p.wind
  }
  if (data.imageEffect !== undefined) restoreImageEffect(world, data.imageEffect)
  return world
}
