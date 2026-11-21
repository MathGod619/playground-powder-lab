import { M, BOMB_DROP_ONLY } from './materials.ts'
import { pack } from './color.ts'
import { buildScene } from './scenes.ts'
import { World } from './world.ts'
import { validatePlan, type ScenePlan } from './director-plan.ts'

const materials = { sand: M.Sand, water: M.Water, wall: M.Wall, fire: M.Fire, oil: M.Oil, lava: M.Lava, smoke: M.Smoke, glitter: M.Glitter, seed: M.Plant, speaker: M.Speaker, rocket: M.Rocket, brick: M.Brick, powder: M.Gunpowder, bomb: M.Bomb, cloud: M.Cloud }
const hex = (c: string) => pack(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16))

/** Snapshot grid, particles, queues and physics without sharing mutable buffers. */
export function cloneWorld(source: World): World {
  const target = new World(source.width, source.height)
  for (const key of Object.keys(source)) {
    const value = (source as unknown as Record<string, unknown>)[key]
    const cloned = ArrayBuffer.isView(value) ? (value as Uint8Array).slice() :
      key === 'hooks' || typeof value === 'function' ? value : structuredClone(value)
    ;(target as unknown as Record<string, unknown>)[key] = cloned
  }
  return target
}

export function prepareScene(current: World, input: ScenePlan): World {
  const plan = validatePlan(input)
  const world = plan.scene ? new World(current.width, current.height) : cloneWorld(current)
  if (plan.scene) buildScene(world, plan.scene)
  const e = plan.environment
  world.rules = { ...world.rules, ...(e.gravity !== null ? { gravity: e.gravity } : {}), ...(e.fall !== null ? { fall: e.fall } : {}) }
  if (e.hue !== null) world.hue = e.hue
  if (e.wind !== null) world.directorWind = e.wind
  const paint = (x: number, y: number, material: number, color: string | null) => {
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) return
    const i = world.index(x, y)
    if (world.type[i] === M.Speaker || world.type[i] === M.Bomb) return
    world.put(i, material)
    if (material === M.Bomb) world.life[i] = BOMB_DROP_ONLY
    if (color) world.color[i] = hex(color)
  }
  for (const o of plan.operations) {
    const x = Math.round(o.x * (world.width - 1)), y = Math.round(o.y * (world.height - 1))
    const w = Math.max(1, Math.round(o.w * world.width)), h = Math.max(1, Math.round(o.h * world.height))
    if (o.shape === 'bomb') { paint(x, y, M.Bomb, o.color); continue }
    if (o.shape === 'speaker') {
      for (let dy = 0; dy < Math.min(h, 16); dy++) for (let dx = 0; dx < Math.min(w, 16); dx++) paint(x + dx, y + dy, M.Speaker, o.color)
      continue
    }
    const type = materials[o.material]
    for (let dy = 0; dy < Math.min(h, world.height - y); dy++) {
      for (let dx = 0; dx < Math.min(w, world.width - x); dx++) {
        if (o.shape === 'ellipse' && ((dx + .5) / w * 2 - 1) ** 2 + ((dy + .5) / h * 2 - 1) ** 2 > 1) continue
        if (o.shape === 'line' && Math.abs(dy / h - dx / w) > Math.max(2 / h, 2 / w)) continue
        const window = o.shape === 'tower' && dx % 6 >= 2 && dx % 6 <= 3 && dy % 8 >= 3 && dy % 8 <= 4
        paint(x + dx, y + dy, type, window ? '#ffe09c' : o.color)
      }
    }
  }
  if (e.waterColor) for (let i = 0; i < world.size; i++) if (world.type[i] === M.Water) world.color[i] = hex(e.waterColor)
  return world
}
