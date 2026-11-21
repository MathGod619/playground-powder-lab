import { M } from './materials.ts'
import type { SceneId, World } from './world.ts'

export const SCENES: { id: SceneId; name: string; detail: string }[] = [
  { id: 'garden', name: 'Bass Garden', detail: 'Dunes, a pool, two speakers and seeds waiting for the drop.' },
  { id: 'volcano', name: 'Volcano', detail: 'Bass erupts lava out of the crater.' },
  { id: 'blank', name: 'Blank', detail: 'A floor and two speakers. Build your own.' },
]

export const WORLD_SIZES = [
  { id: 'small', name: 'Chunky', cells: 45_000 },
  { id: 'medium', name: 'Normal', cells: 90_000 },
  { id: 'large', name: 'Fine', cells: 180_000 },
] as const
export type WorldSize = typeof WORLD_SIZES[number]['id']

/** Grid dimensions that cover a viewport with roughly `cells` square cells. */
export function gridFor(viewWidth: number, viewHeight: number, size: WorldSize) {
  const target = WORLD_SIZES.find(s => s.id === size)?.cells ?? 90_000
  const cell = Math.max(2, Math.sqrt(viewWidth * viewHeight / target))
  return { width: Math.max(80, Math.ceil(viewWidth / cell)), height: Math.max(60, Math.ceil(viewHeight / cell)) }
}

function fillWhere(world: World, material: number, test: (u: number, v: number, x: number, y: number) => boolean, hue?: number) {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (test(x / world.width, y / world.height, x, y)) world.put(world.index(x, y), material, hue)
    }
  }
}

function surfaceY(world: World, x: number) {
  for (let y = 0; y < world.height; y++) if (world.at(x, y) !== M.Empty) return y
  return world.height
}

function seed(world: World, x: number, growth: number) {
  const y = surfaceY(world, x) - 1
  if (y > 0) world.set(x, y, M.Plant, growth)
}

function speaker(world: World, cx: number, floor: number) {
  const w = Math.max(8, world.width * .035 | 0), h = Math.max(10, world.height * .07 | 0)
  for (let y = floor - h; y < floor + 2 && y < world.height; y++) {
    for (let x = cx - (w >> 1); x < cx + (w >> 1); x++) world.set(x, y, M.Speaker)
  }
}

function garden(world: World) {
  const { width: W, height: H, rng } = world
  const ground = (x: number) => H * (.80 - .055 * Math.sin(x / W * Math.PI * 3 + .4) - .025 * Math.sin(x / W * Math.PI * 9)) | 0
  for (let x = 0; x < W; x++) {
    const g = ground(x)
    for (let y = g; y < H; y++) {
      const i = world.index(x, y)
      if (y >= H - 3) world.put(i, M.Wall)
      else if ((y - g + (Math.sin(x * .07) * 2 | 0)) % 10 === 4) world.put(i, M.Glitter, x / W * 300 + 200)
      else world.put(i, M.Sand)
    }
  }
  const a = W * .42 | 0, b = W * .58 | 0
  let highest = H
  for (let x = a; x <= b; x++) highest = Math.min(highest, ground(x))
  const top = highest - (H * .1 | 0)
  for (let x = a; x <= b; x++) {
    const g = ground(x)
    for (let y = top; y < g + 2; y++) {
      if (x < a + 2 || x > b - 2 || y >= g) world.set(x, y, M.Wall)
      else if (y > top + 3) world.set(x, y, y < top + 7 ? M.Oil : M.Water)
    }
  }
  for (const u of [.17, .83]) speaker(world, W * u | 0, ground(W * u | 0))
  for (let n = 0; n < 14; n++) {
    const x = W * (.04 + n * .07 + rng() * .02) | 0
    if (x >= a - 2 && x <= b + 2) continue
    seed(world, x, 18 + rng() * 26)
  }
  fillWhere(world, M.Lava, (u, v, x, y) => ((u - .7) / .05) ** 2 + ((v - .9) / .035) ** 2 < 1 && world.at(x, y) !== M.Empty)
}

function volcano(world: World) {
  const { width: W, height: H, rng } = world
  const profile = (u: number) => .88 - .6 * Math.max(0, 1 - Math.abs(u - .5) / .36) ** 1.3
  fillWhere(world, M.Wall, (u, v) => v > profile(u) && !(Math.abs(u - .5) < .035 && v < profile(.5) + .05))
  world.craterY = H * (profile(.5) + .035) | 0
  fillWhere(world, M.Lava, (u, v) => ((u - .5) / .075) ** 2 + ((v - .8) / .07) ** 2 < 1)
  fillWhere(world, M.Lava, (u, v) => Math.abs(u - .5) < .012 && v > profile(.5) + .02 && v < .8)
  fillWhere(world, M.Water, (u, v, x, y) => u < .17 && v > .83 && v < .88 && world.at(x, y) === M.Empty)
  fillWhere(world, M.Sand, (u, v, x, y) => u > .84 && v > .86 - .06 * Math.sin((u - .84) / .16 * Math.PI) && world.at(x, y) === M.Empty)
  fillWhere(world, M.Wall, (_u, v) => v > .95)
  for (let n = 0; n < 10; n++) seed(world, W * (n < 5 ? .16 + n * .06 : .56 + (n - 5) * .06) | 0, 10 + rng() * 18)
}

function blank(world: World) {
  fillWhere(world, M.Wall, (_u, v) => v > .94)
  const floor = world.height * .94 | 0
  for (const u of [.3, .7]) speaker(world, world.width * u | 0, floor - 2)
}

export function buildScene(world: World, id: SceneId) {
  world.clear()
  world.scene = id
  world.craterY = 0;
  ({ garden, volcano, blank })[id](world)
}
