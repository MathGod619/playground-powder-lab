import { colorFor, hsl, pack } from './color.ts'
import { BOMB_DROP_ONLY, M } from './materials.ts'
import { buildSongWorld } from './song-world.ts'
import { DEFAULT_RULES, type SceneHooks, type SceneId, type SceneRules, type World } from './world.ts'

export type SceneInfo = { id: SceneId; name: string; detail: string }

export const SCENES: SceneInfo[] = [
  { id: 'garden', name: 'Bass Garden', detail: 'Dunes, a pool, two speakers and seeds waiting for the drop.' },
  { id: 'volcano', name: 'Volcano', detail: 'Bass spits lava. The drop blows the top off the mountain.' },
  { id: 'city', name: 'Demolition', detail: 'A skyline wired with bombs. Windows flicker on the hi-hats; the drop brings it all down.' },
  { id: 'moon', name: 'Moon', detail: 'Low gravity. Every kick launches dust into slow, floating arcs.' },
  { id: 'sea', name: 'Deep Sea', detail: 'Everything moves through water. Vents bubble on the kick and kelp grows to the beat.' },
  { id: 'storm', name: 'Storm', detail: 'Clouds rain on the hi-hats, lightning hunts the forest on the drop.' },
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

// ------------------------------------------------------------------ helpers

function fillWhere(world: World, material: number, test: (u: number, v: number, x: number, y: number) => boolean, hue?: number) {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (test(x / world.width, y / world.height, x, y)) world.put(world.index(x, y), material, hue)
    }
  }
}

function surfaceY(world: World, x: number, passable = [M.Empty as number]) {
  for (let y = 0; y < world.height; y++) if (!passable.includes(world.at(x, y))) return y
  return world.height
}

function seed(world: World, x: number, growth: number, passable?: number[]) {
  const y = surfaceY(world, x, passable) - 1
  if (y > 0) world.set(x, y, M.Plant, growth)
}

function speaker(world: World, cx: number, floor: number, scale = 1) {
  const w = Math.max(8, world.width * .035 * scale | 0), h = Math.max(10, world.height * .07 * scale | 0)
  for (let y = floor - h; y < floor + 2 && y < world.height; y++) {
    for (let x = cx - (w >> 1); x < cx + (w >> 1); x++) if (y >= 0 && x >= 0 && x < world.width) world.set(x, y, M.Speaker)
  }
}

const noise = (x: number, a: number, b: number, c: number) => Math.sin(x * a + c) * .5 + Math.sin(x * b + c * 2.3) * .5

// ------------------------------------------------------------------ worlds

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
  world.marks = [{ x: W / 2, y: world.craterY }]
  fillWhere(world, M.Lava, (u, v) => ((u - .5) / .075) ** 2 + ((v - .8) / .07) ** 2 < 1)
  fillWhere(world, M.Lava, (u, v) => Math.abs(u - .5) < .012 && v > profile(.5) + .02 && v < .8)
  fillWhere(world, M.Water, (u, v, x, y) => u < .17 && v > .83 && v < .88 && world.at(x, y) === M.Empty)
  fillWhere(world, M.Sand, (u, v, x, y) => u > .84 && v > .86 - .06 * Math.sin((u - .84) / .16 * Math.PI) && world.at(x, y) === M.Empty)
  fillWhere(world, M.Wall, (_u, v) => v > .95)
  for (let n = 0; n < 10; n++) seed(world, W * (n < 5 ? .16 + n * .06 : .56 + (n - 5) * .06) | 0, 10 + rng() * 18)
}

const volcanoHooks: SceneHooks = {
  kick: (w, s) => w.erupt(w.width / 2, w.craterY, s),
  drop: w => {
    // Blow the top off: a huge blast in the crater, then a column of lava.
    const peak = w.craterY
    w.blast(w.width / 2, peak + w.height * .05, Math.max(14, w.width * .085), 1.8, true)
    for (let k = 0; k < 10; k++) w.erupt(w.width / 2, peak, 1.2)
  },
}

/** Window cells in the city: brick with life 1 (lit) or 2 (dark). */
const LIT = 1, DARK = 2
export const CITY_TOWERS: readonly (readonly [number, number, number])[] = [
  [.03, .12, .42], [.14, .22, .3], [.24, .34, .5], [.36, .44, .22], [.56, .64, .35], [.66, .76, .18], [.78, .86, .45], [.88, .97, .32],
]
export const cityStreet = (height: number) => Math.floor(height * .9)

function city(world: World) {
  const { width: W, height: H, rng } = world
  const street = cityStreet(H)
  fillWhere(world, M.Wall, (_u, _v, _x, y) => y >= street)
  // a canal in the street
  const c0 = W * .46 | 0, c1 = W * .54 | 0
  for (let y = street; y < street + Math.max(4, H * .05 | 0) && y < H - 2; y++) for (let x = c0; x < c1; x++) world.set(x, y, M.Water)
  const towers = CITY_TOWERS
  for (const [l, r, top] of towers) {
    const x0 = W * l | 0, x1 = W * r | 0, y0 = H * top | 0
    const hue = 30 + rng() * 40
    for (let y = y0; y < street; y++) {
      for (let x = x0; x < x1; x++) {
        const i = world.index(x, y)
        world.put(i, M.Brick)
        const wx = (x - x0) % 5, wy = (y - y0) % 7
        if (x > x0 + 1 && x < x1 - 2 && y > y0 + 1 && wx >= 2 && wx <= 3 && wy >= 3 && wy <= 4) {
          const lit = rng() < .35
          world.life[i] = lit ? LIT : DARK
          world.color[i] = lit ? hsl(hue + rng() * 20, 100, 70) : pack(26, 24, 44)
        }
      }
    }
    // charges at the base of every tower; only the drop (or fire) sets them off
    for (const fx of [.25, .75]) {
      const bx = x0 + (x1 - x0) * fx | 0
      world.set(bx, street - 1, M.Bomb, BOMB_DROP_ONLY)
    }
  }
  // rooftop speakers on two of the towers
  for (const t of [towers[2], towers[6]]) speaker(world, W * (t[0] + t[1]) / 2 | 0, (H * t[2] | 0) - 1, .7)
  // some rubble and a little sand in the street
  fillWhere(world, M.Sand, (u, v, x, y) => v > .86 && v < .9 && (u < .02 || (u > .44 && u < .46) || (u > .54 && u < .56)) && world.at(x, y) === M.Empty)
}

const cityHooks: SceneHooks = {
  // Hi-hats flicker the skyline.
  hat: w => {
    const r = w.rng
    for (let n = 0; n < 1500; n++) {
      const i = r() * w.size | 0
      if (w.type[i] !== M.Brick || w.life[i] === 0 || r() > .2) continue
      // switch the whole 2×2 window together
      const lit = w.life[i] === DARK, color = lit ? hsl(w.hue + r() * 60, 100, 70) : pack(26, 24, 44)
      const stack = [i], seen = new Set<number>()
      while (stack.length) {
        const j = stack.pop()!
        if (seen.has(j) || j < 0 || j >= w.size || w.type[j] !== M.Brick || w.life[j] === 0 || seen.size > 8) continue
        seen.add(j)
        w.life[j] = lit ? LIT : DARK
        w.color[j] = color
        stack.push(j + 1, j - 1, j + w.width, j - w.width)
      }
    }
  },
}

function moon(world: World) {
  const { width: W, height: H, rng } = world
  const phase = rng() * 10
  const ground = (x: number) => H * (.78 + .04 * noise(x / W, 7, 19, phase)) | 0
  const craters = [[.22, .07], [.5, .05], [.74, .09]].map(([u, r]) => ({ x: W * u, r: W * r }))
  for (let x = 0; x < W; x++) {
    let g = ground(x)
    for (const c of craters) {
      const d = Math.abs(x - c.x)
      if (d < c.r) g += (Math.sqrt(1 - (d / c.r) ** 2) * c.r * .35) | 0
      else if (d < c.r * 1.3) g -= ((1 - (d - c.r) / (c.r * .3)) * c.r * .08) | 0
    }
    for (let y = g; y < H; y++) {
      const i = world.index(x, y)
      if (y >= H - 3) { world.put(i, M.Wall); continue }
      world.put(i, y - g < 3 ? M.Glitter : M.Sand)
      world.color[i] = y - g < 3 ? hsl(210 + rng() * 40, 30, 70 + rng() * 15) : hsl(230, 6, 40 + rng() * 22)
    }
  }
  for (const u of [.36, .62]) { const x = W * u | 0; speaker(world, x, surfaceY(world, x), .8) }
  // a lander made of wall with a bomb in the fuel tank
  const lx = W * .88 | 0, ly = surfaceY(world, lx)
  for (let y = ly - 8; y < ly; y++) for (let x = lx - 5; x <= lx + 5; x++) if (y > ly - 7 || Math.abs(x - lx) < 3) world.set(x, y, M.Wall)
  world.set(lx, ly - 9, M.Bomb, BOMB_DROP_ONLY)
  // stars last, so nothing above mistakes them for the ground
  for (let n = 0; n < W * H * .0015; n++) {
    const x = rng() * W | 0, y = rng() * H * .55 | 0
    world.set(x, y, M.Flower)
    world.color[world.index(x, y)] = hsl(200 + rng() * 60, 60, 70 + rng() * 30)
  }
}

const moonRules: SceneRules = { ...DEFAULT_RULES, gravity: .28, fall: .45 }

function sea(world: World) {
  const { width: W, height: H, rng } = world
  const phase = rng() * 10
  const bed = (x: number) => H * (.82 + .05 * noise(x / W, 5, 13, phase)) | 0
  const surface = H * .12 | 0
  for (let x = 0; x < W; x++) {
    const g = bed(x)
    for (let y = surface; y < H; y++) {
      const i = world.index(x, y)
      if (y >= H - 3) world.put(i, M.Wall)
      else if (y >= g + 6) world.put(i, M.Wall)
      else if (y >= g) world.put(i, M.Sand)
      else {
        world.put(i, M.Water)
        const depth = (y - surface) / (H - surface)
        world.color[i] = hsl(198 + depth * 30 + rng() * 6, 85 - depth * 25, 40 - depth * 30 + rng() * 4)
      }
    }
  }
  // rock arches
  for (const [u, w2, h2] of [[.25, .07, .14], [.72, .09, .18]]) {
    const cx = W * u, rx = W * w2, ry = H * h2, base = bed(cx | 0)
    fillWhere(world, M.Wall, (_u, _v, x, y) => {
      const e = ((x - cx) / rx) ** 2 + ((y - base) / ry) ** 2
      return e < 1 && e > .45 && y < base
    })
  }
  // hydrothermal vents: lava chambers under the bed with a chimney up to the water
  world.marks = []
  for (const u of [.12, .48, .88]) {
    const x = W * u | 0, top = bed(x)
    for (let y = top; y < top + 5; y++) for (let dx = -1; dx <= 1; dx++) world.set(x + dx, y, M.Wall)
    fillWhere(world, M.Lava, (_u, _v, px, py) => ((px - x) / 4) ** 2 + ((py - (top + 7)) / 2) ** 2 < 1)
    world.marks.push({ x, y: top - 1 })
  }
  // kelp
  for (let n = 0; n < 16; n++) seed(world, W * (.03 + n * .06 + rng() * .02) | 0, 20 + rng() * 30, [M.Empty, M.Water])
  // speakers on the seabed
  for (const u of [.32, .62]) { const x = W * u | 0; speaker(world, x, bed(x), .7) }
}

const seaRules: SceneRules = { ...DEFAULT_RULES, throughWater: true, plantsInWater: true, fall: .7 }

const seaHooks: SceneHooks = {
  // Vents and the seabed breathe out bubbles on the kick.
  kick: (w, s) => {
    const r = w.rng
    for (const m of w.marks) {
      for (let k = 0; k < 3 + s * 10; k++) {
        const x = Math.round(m.x + (r() - .5) * 4), y = Math.round(m.y - r() * 4)
        if (x < 0 || x >= w.width || y < 0) continue
        const i = w.index(x, y)
        if (w.type[i] === M.Water) { w.type[i] = M.Bubble; w.color[i] = colorFor(M.Bubble, 0, r) }
      }
    }
  },
  // Glowing plankton drift up on the hi-hats.
  hat: (w, s) => {
    const r = w.rng
    for (let k = 0; k < 4 + s * 10; k++) {
      w.addParticle(r() * w.width, w.height * (.3 + r() * .5), (r() - .5) * .4, -.2 - r() * .3, M.Spark, hsl(170 + r() * 40, 100, 70), 40 + r() * 40)
    }
  },
}

function storm(world: World) {
  const { width: W, height: H, rng } = world
  const phase = rng() * 10
  const ground = (x: number) => H * (.74 + .07 * noise(x / W, 4, 11, phase)) | 0
  for (let x = 0; x < W; x++) {
    const g = ground(x)
    for (let y = g; y < H; y++) {
      const i = world.index(x, y)
      if (y >= H - 3) { world.put(i, M.Wall); continue }
      world.put(i, M.Sand)
      world.color[i] = hsl(28 + rng() * 10, 35, 24 + rng() * 10 + Math.min(20, (y - g) * 2))
    }
  }
  // a lake in the lowest dip
  let low = 0
  for (let x = 1; x < W - 1; x++) if (ground(x) > ground(low)) low = x
  fillWhere(world, M.Water, (_u, _v, x, y) => Math.abs(x - low) < W * .1 && y >= ground(low) - H * .04 && world.at(x, y) === M.Empty && y < ground(x) + 2)
  // a dense forest
  for (let n = 0; n < 34; n++) {
    const x = W * (.01 + n * .029 + rng() * .01) | 0
    if (Math.abs(x - low) < W * .1) continue
    seed(world, x, 22 + rng() * 22)
  }
  // clouds
  for (let n = 0; n < 7; n++) {
    const cx = W * (.06 + n * .145 + (rng() - .5) * .05), cy = H * (.2 + rng() * .08), rx = W * (.06 + rng() * .04), ry = H * (.03 + rng() * .02)
    fillWhere(world, M.Cloud, (_u, _v, x, y) => {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + noise(x / W, 40, 90, n) * .25
      return e < 1
    })
  }
}

function blank(world: World) {
  fillWhere(world, M.Wall, (_u, v) => v > .94)
  const floor = world.height * .94 | 0
  for (const u of [.3, .7]) speaker(world, world.width * u | 0, floor - 2)
}

const BUILDERS: Record<SceneId, (w: World) => void> = { garden, volcano, city, moon, sea, storm, blank, song: w => { buildSongWorld(w) } }
const RULES: Partial<Record<SceneId, SceneRules>> = { moon: moonRules, sea: seaRules }
const HOOKS: Partial<Record<SceneId, SceneHooks>> = { volcano: volcanoHooks, city: cityHooks, sea: seaHooks }

export const SCENE_IDS = Object.keys(BUILDERS) as SceneId[]

/** Gives a world the physics and beat behaviour of a scene, without rebuilding it. */
export function attachScene(world: World, id: SceneId) {
  world.scene = id
  world.rules = RULES[id] ?? DEFAULT_RULES
  world.hooks = HOOKS[id] ?? {}
}

export function buildScene(world: World, id: SceneId) {
  world.clear()
  world.craterY = 0
  attachScene(world, id)
  BUILDERS[id](world)
}
