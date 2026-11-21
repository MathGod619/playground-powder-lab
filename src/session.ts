import { clampCamera, fitCamera, type Camera } from './camera.ts'
import { WORLDS, WORLD_SIZES, type WorldId } from './worlds.ts'
import { bands, MAX_BPM, MIN_BPM, type Clock, type Settings } from './beat.ts'
import { MAX_LIFT, MAX_WIND_TICKS, Sandbox, waveLimit,  } from './engine.ts'
import { Material as M, MAX_CHARGE, MAX_LIFE, type Material } from './materials.ts'

export const LOCAL_KEY = 'playground-powder-session-v1'
export const MAX_FILE_BYTES = 16_000_000
export const MAX_BRUSH = 42
const FORMAT = 'playground-powder'
const VERSION = 3
const UINT32_MAX = 0xffffffff

export function encodeSession(world: Sandbox, clock: Clock, settings: Settings, camera = fitCamera(world)): string {
  const cells: number[] = []
  for (let first = 0; first < world.cells.length;) {
    const id = world.cells[first]
    const life = world.life[first]
    const charge = world.charge[first]
    const lift = world.lift[first]
    let end = first + 1
    while (end < world.cells.length && world.cells[end] === id &&
      world.life[end] === life && world.charge[end] === charge && world.lift[end] === lift) end++
    cells.push(end - first, id, life, charge, lift)
    first = end
  }
  const session = {
    format: FORMAT,
    version: VERSION,
    world: {
      width: world.width, height: world.height, cells,
      template: world.template, regions: Array.from(world.regionState),
      rng: world.rng, tick: world.tickNumber, wave: world.wave, wind: world.wind,
    },
    clock,
    settings,
    camera,
  }
  return JSON.stringify(session)
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid session structure.')
  return value as Record<string, unknown>
}

function range(value: unknown, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min ||
      value > max || (integer && !Number.isInteger(value))) throw new Error('A session value is out of range.')
  return value
}

function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid session setting.')
  return value
}

export function decodeSession(text: string) {
  if (text.length > MAX_FILE_BYTES) throw new Error('Session is too large.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const root = object(value)
  if ('shapes' in root && 'connections' in root) {
    throw new Error('This is a Phase 1 drawing session. Open it in the original Canvas Lab.')
  }
  if (root.format !== FORMAT) throw new Error('This is not a PLAYGROUND Powder Lab session.')
  if (root.version !== 1 && root.version !== 2 && root.version !== VERSION) throw new Error('This session version is unsupported.')
  const stride = root.version === 1 ? 4 : 5

  const source = object(root.world)
  const size = WORLD_SIZES.find(size => source.width === size.width && source.height === size.height)
  if (!size || (root.version !== VERSION && size.name !== 'Classic')) throw new Error('Invalid world size.')
  const world = new Sandbox(size.width, size.height, range(source.rng, 1, UINT32_MAX))
  if (root.version === VERSION) {
    if (source.template !== 'classic' && source.template !== 'empty' && !WORLDS.some(scene => scene.id === source.template)) {
      throw new Error('Unknown world template.')
    }
    world.template = source.template as WorldId
  }
  const runs = source.cells
  if (!Array.isArray(runs) || runs.length % stride !== 0 || runs.length > world.cells.length * stride) {
    throw new Error('Invalid particle data.')
  }
  let index = 0
  for (let i = 0; i < runs.length; i += stride) {
    const length = range(runs[i], 1, world.cells.length - index)
    const material = range(runs[i + 1], M.Empty, M.Electricity) as Material
    const life = range(runs[i + 2], MAX_LIFE[material] === 0 ? 0 : 1, MAX_LIFE[material])
    const charge = range(runs[i + 3], 0, material === M.Water ? MAX_CHARGE : 0)
    const canLift = material === M.Sand || material === M.Water || material === M.Oil || material === M.Lava
    const lift = stride === 5 ? range(runs[i + 4], 0, canLift ? MAX_LIFT : 0) : 0
    world.cells.fill(material, index, index + length)
    world.life.fill(life, index, index + length)
    world.charge.fill(charge, index, index + length)
    world.lift.fill(lift, index, index + length)
    if (material !== M.Empty) world.occupied += length
    index += length
  }
  if (index !== world.cells.length) throw new Error('Incomplete particle data.')
  if (root.version === VERSION) {
    if (!Array.isArray(source.regions) || source.regions.length !== world.regionState.length) {
      throw new Error('Invalid region data.')
    }
    world.restoreRegions(source.regions.map(flag => range(flag, 0, 1)))
  } else {
    world.restoreRegions()
  }
  world.restoreTick(range(source.tick, 0, UINT32_MAX))

  if (source.wave !== null) {
    const wave = object(source.wave)
    world.wave = {
      x: range(wave.x, 0, world.width - 1),
      y: range(wave.y, 0, world.height - 1),
      radius: range(wave.radius, 0, waveLimit(world.width)),
      strength: range(wave.strength, 0, 1, false),
    }
  }
  if (source.wind !== null) {
    const wind = object(source.wind)
    if (wind.direction !== 1 && wind.direction !== -1) throw new Error('Invalid wind direction.')
    world.wind = {
      direction: wind.direction,
      ticks: range(wind.ticks, 1, MAX_WIND_TICKS),
      strength: range(wind.strength, 0, 1, false),
    }
  }
  const time = object(root.clock)
  const clock = { beat: range(time.beat, 0, UINT32_MAX), phase: range(time.phase, 0, 1, false) }
  if (clock.phase === 1) throw new Error('Invalid beat phase.')
  const controls = object(root.settings)
  const reactions = object(controls.bands)
  const settings: Settings = {
    bpm: range(controls.bpm, MIN_BPM, MAX_BPM),
    intensity: root.version === VERSION ? range(controls.intensity, 0, 160) : 100,
    enabled: bool(controls.enabled),
    paused: bool(controls.paused),
    glow: bool(controls.glow),
    grid: bool(controls.grid),
    fx: bool(controls.fx),
    brush: range(controls.brush, 1, MAX_BRUSH),
    material: range(controls.material, M.Empty, M.Electricity),
    bands: {} as Settings['bands'],
  }
  for (const band of bands) {
    const control = object(reactions[band])
    settings.bands[band] = { enabled: bool(control.enabled), sensitivity: range(control.sensitivity, 0, 100) }
  }
  let camera = fitCamera(world)
  if (root.version === VERSION) {
    const view = object(root.camera)
    camera = clampCamera(world, {
      x: range(view.x, 0, world.width, false),
      y: range(view.y, 0, world.height, false),
      zoom: range(view.zoom, 1 / 3, 4, false),
    })
  }
  return { world, clock, settings, camera }
}
