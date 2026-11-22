import type { Boss } from './boss.ts'
import type { Raver } from './crowd.ts'
import type { Energy } from './immersion.ts'
import type { Tool } from './materials.ts'
import type { Bolt, Pulse, Ring, SceneId, World } from './world.ts'

/**
 * Online play streams the host's world to guests as compact snapshots: a keyframe holds every cell,
 * a delta only the cells whose material, life or colour changed since the last one sent. Both carry
 * the airborne particles, the crowd, the boss, the visual pulses and everyone's cursors, and are
 * deflate-compressed. Guests only draw what they receive; the host runs the simulation.
 */
export const SYNC_VERSION = 1
const KEY = 1, DELTA = 2

export type RemoteCursor = { id: number; name: string; x: number; y: number; tool: Tool; brush: number }
export type SyncMeta = {
  frame: number; scene: SceneId; hue: number; pulse: Pulse; energy: Energy; dropTicks: number
  ravers: Raver[]; boss: Boss | null; rings: Ring[]; bolts: Bolt[]; cursors: RemoteCursor[]
}
/** The last state sent, so the next snapshot can carry only what changed. */
export type SyncBase = { width: number; height: number; type: Uint8Array; life: Uint8Array; color: Uint32Array }

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
const round = (n: number) => Math.round(n * 100) / 100

function meta(world: World, cursors: RemoteCursor[]): SyncMeta {
  return {
    frame: world.frame, scene: world.scene, hue: round(world.hue), pulse: { ...world.pulse }, energy: { ...world.energy },
    dropTicks: world.dropTicks,
    ravers: world.ravers.map(r => ({ ...r, x: round(r.x), y: round(r.y), vx: 0, vy: 0 })),
    boss: world.boss ? { ...world.boss } : null,
    rings: world.rings.map(r => ({ ...r, r: round(r.r) })), bolts: world.bolts, cursors,
  }
}

/**
 * Builds the next snapshot. Pass the previous base (or null for a keyframe); returns the uncompressed
 * bytes and the new base. A delta that would touch more than a third of the grid is sent as a keyframe.
 */
export function encodeSnapshot(world: World, base: SyncBase | null, cursors: RemoteCursor[] = []) {
  const { width, height, size, type, life, color } = world
  let kind = base && base.width === width && base.height === height ? DELTA : KEY
  let changed: Uint32Array | null = null
  if (kind === DELTA) {
    const b = base!, list: number[] = []
    for (let i = 0; i < size; i++) if (type[i] !== b.type[i] || life[i] !== b.life[i] || color[i] !== b.color[i]) list.push(i)
    if (list.length > size / 3) kind = KEY
    else changed = Uint32Array.from(list)
  }

  const parts: Uint8Array[] = []
  const header = new DataView(new ArrayBuffer(6))
  header.setUint8(0, SYNC_VERSION); header.setUint8(1, kind); header.setUint16(2, width, true); header.setUint16(4, height, true)
  parts.push(new Uint8Array(header.buffer))
  const json = new TextEncoder().encode(JSON.stringify(meta(world, cursors)))
  parts.push(new Uint8Array(new Uint32Array([json.length]).buffer), json)

  if (kind === KEY) {
    parts.push(bytesOf(type), bytesOf(life), bytesOf(color))
  } else {
    const n = changed!.length, t = new Uint8Array(n), l = new Uint8Array(n), c = new Uint32Array(n)
    for (let k = 0; k < n; k++) { const i = changed![k]; t[k] = type[i]; l[k] = life[i]; c[k] = color[i] }
    parts.push(new Uint8Array(new Uint32Array([n]).buffer), bytesOf(changed!), t, l, bytesOf(c))
  }

  const p = world.particles, px = new Int16Array(p), py = new Int16Array(p), pt = new Uint8Array(p), pl = new Uint16Array(p), pc = new Uint32Array(p)
  for (let k = 0; k < p; k++) {
    px[k] = Math.max(-32768, Math.min(32767, Math.round(world.px[k] * 16)))
    py[k] = Math.max(-32768, Math.min(32767, Math.round(world.py[k] * 16)))
    pt[k] = world.pType[k]; pl[k] = world.pLife[k]; pc[k] = world.pColor[k]
  }
  parts.push(new Uint8Array(new Uint32Array([p]).buffer), bytesOf(px), bytesOf(py), pt, bytesOf(pl), bytesOf(pc))

  const total = parts.reduce((n, part) => n + part.length, 0), bytes = new Uint8Array(total)
  let at = 0
  for (const part of parts) { bytes.set(part, at); at += part.length }
  const next: SyncBase = { width, height, type: type.slice(), life: life.slice(), color: color.slice() }
  return { bytes, base: next, keyframe: kind === KEY }
}

/** Reads a snapshot's grid size without applying it, so a guest can resize first. */
export function snapshotSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { version: view.getUint8(0), keyframe: view.getUint8(1) === KEY, width: view.getUint16(2, true), height: view.getUint16(4, true) }
}

/**
 * Applies a snapshot to a world of the same size. Returns the meta, or null when it cannot apply
 * (wrong version or size, or a delta without the keyframe it builds on).
 */
export function applySnapshot(world: World, bytes: Uint8Array, haveKeyframe: boolean): SyncMeta | null {
  const head = snapshotSize(bytes)
  if (head.version !== SYNC_VERSION || head.width !== world.width || head.height !== world.height) return null
  if (!head.keyframe && !haveKeyframe) return null
  const copy = (from: number, length: number) => bytes.slice(from, from + length)
  const u32 = (from: number) => new Uint32Array(copy(from, 4).buffer)[0]
  let at = 6
  const jsonLength = u32(at); at += 4
  const info = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + jsonLength))) as SyncMeta
  at += jsonLength
  const N = world.size
  if (head.keyframe) {
    world.type.set(bytes.subarray(at, at + N)); at += N
    world.life.set(bytes.subarray(at, at + N)); at += N
    world.color.set(new Uint32Array(copy(at, N * 4).buffer)); at += N * 4
  } else {
    const n = u32(at); at += 4
    const index = new Uint32Array(copy(at, n * 4).buffer); at += n * 4
    const t = bytes.subarray(at, at + n); at += n
    const l = bytes.subarray(at, at + n); at += n
    const c = new Uint32Array(copy(at, n * 4).buffer); at += n * 4
    for (let k = 0; k < n; k++) { const i = index[k]; world.type[i] = t[k]; world.life[i] = l[k]; world.color[i] = c[k] }
  }
  const p = Math.min(u32(at), world.px.length); at += 4
  const px = new Int16Array(copy(at, p * 2).buffer); at += p * 2
  const py = new Int16Array(copy(at, p * 2).buffer); at += p * 2
  const pt = bytes.subarray(at, at + p); at += p
  const pl = new Uint16Array(copy(at, p * 2).buffer); at += p * 2
  const pc = new Uint32Array(copy(at, p * 4).buffer)
  for (let k = 0; k < p; k++) {
    world.px[k] = px[k] / 16; world.py[k] = py[k] / 16
    world.pType[k] = pt[k]; world.pLife[k] = pl[k]; world.pColor[k] = pc[k]
  }
  world.particles = p
  world.frame = info.frame
  world.scene = info.scene
  world.hue = info.hue
  Object.assign(world.pulse, info.pulse)
  world.energy = info.energy
  world.dropTicks = info.dropTicks
  world.ravers = info.ravers
  world.boss = info.boss
  world.rings = info.rings
  world.bolts = info.bolts
  return info
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer()
  return new Uint8Array(out)
}
export const pack = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('deflate-raw'))
export const unpack = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('deflate-raw'))
