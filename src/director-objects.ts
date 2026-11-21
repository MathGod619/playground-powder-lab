import { M } from './materials.ts'
import type { Operation } from './director-plan.ts'
import type { World } from './world.ts'

type Paint = (x: number, y: number, material: number, color: string | null, life?: number) => void
const shade = (color: string, amount: number) => '#' + [1, 3, 5].map(i =>
  Math.max(0, Math.min(255, Math.round(parseInt(color.slice(i, i + 2), 16) * amount))).toString(16).padStart(2, '0')).join('')

/** Detailed objects have explicit physical roles; a model cannot turn a plant
 * or load-bearing arch into falling sand by accidentally choosing sand. */
export function drawDirectorObject(world: World, op: Operation, paint: Paint): boolean {
  if (!['plant', 'rock', 'arch', 'building', 'terrain', 'aquarium', 'speaker-stack'].includes(op.shape)) return false
  const x = Math.round(op.x * (world.width - 1)), y = Math.round(op.y * (world.height - 1))
  const w = Math.max(1, Math.round(op.w * world.width)), h = Math.max(1, Math.round(op.h * world.height))
  // Every primitive stays within its object box, including branches and trim.
  const cell = (u: number, v: number, material: number, color: string, life = 0) => {
    const dx = Math.round(u * (w - 1)), dy = Math.round(v * (h - 1))
    if (dx >= 0 && dx < w && dy >= 0 && dy < h) paint(x + dx, y + dy, material, color, life)
  }
  const fill = (u: number, v: number, a: number, b: number, material: number, color: string, life = 0) => {
    const x0 = Math.max(0, Math.floor(u * w)), y0 = Math.max(0, Math.floor(v * h))
    for (let dy = y0; dy < Math.min(h, Math.ceil((v + b) * h)); dy++)
      for (let dx = x0; dx < Math.min(w, Math.ceil((u + a) * w)); dx++) paint(x + dx, y + dy, material, color, life)
  }
  const ellipse = (u: number, v: number, a: number, b: number, material: number, color: string) => {
    for (let dy = Math.max(0, Math.floor(v * h)); dy < Math.min(h, Math.ceil((v + b) * h)); dy++)
      for (let dx = Math.max(0, Math.floor(u * w)); dx < Math.min(w, Math.ceil((u + a) * w)); dx++)
        if (((dx + .5 - u * w) / (a * w) * 2 - 1) ** 2 + ((dy + .5 - v * h) / (b * h) * 2 - 1) ** 2 <= 1)
          paint(x + dx, y + dy, material, color, 0)
  }
  const line = (u: number, v: number, a: number, b: number, material: number, color: string, thickness = 1) => {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(a - u) * w, Math.abs(b - v) * h) * 2))
    for (let k = 0; k <= steps; k++) for (let n = 0; n < thickness; n++)
      cell(u + (a - u) * k / steps + n / w, v + (b - v) * k / steps, material, color)
  }
  const nested = (shape: Operation['shape'], u: number, v: number, a: number, b: number, color: string, material: Operation['material'] = 'wall') =>
    drawDirectorObject(world, { shape, material, color, x: (x + u * (w - 1)) / (world.width - 1),
      y: (y + v * (h - 1)) / (world.height - 1), w: a * w / world.width, h: b * h / world.height }, paint)

  if (op.shape === 'plant') {
    const c = op.color ?? '#4be5a0', dark = shade(c, .6), light = shade(c, 1.25)
    // Three stalks with paired leaves and living tips; bodies remain stationary.
    for (let stem = 0; stem < 3; stem++) {
      const base = .36 + stem * .14, top = .12 + (stem === 1 ? 0 : .12)
      let px = base, py = .98
      for (let n = 1; n <= 12; n++) {
        const v = .98 - (.98 - top) * n / 12, u = base + Math.sin(n * .65 + stem * 2) * .085
        line(px, py, u, v, M.Plant, dark, Math.max(1, Math.round(w * .025)))
        if (n % 2 === 0 && n < 11) {
          const side = n % 4 === 0 ? -1 : 1, tip = u + side * (.2 + .04 * stem)
          line(u, v, tip, v - .07, M.Plant, c)
          ellipse(Math.min(u, tip), v - .13, Math.abs(tip - u), .10, M.Plant, n % 4 ? c : light)
        }
        px = u; py = v
      }
      cell(px, py, M.Plant, light, 18 + stem * 5)
    }
    return true
  }
  if (op.shape === 'rock') {
    const c = op.color ?? '#655c84', material = op.material === 'brick' ? M.Brick : M.Wall
    ellipse(.02, .35, .63, .65, material, shade(c, .7))
    ellipse(.35, .16, .63, .84, material, c)
    ellipse(.43, .18, .35, .35, material, shade(c, 1.22))
    line(.45, .49, .65, .6, material, shade(c, .65))
    line(.16, .69, .31, .78, material, shade(c, 1.1))
    return true
  }
  if (op.shape === 'arch') {
    const c = op.color ?? '#a279bd', material = op.material === 'wall' ? M.Wall : M.Brick
    // Hollow interior: the arch does not erase existing water, photos or plants.
    for (let dy = 0; dy < Math.min(h, world.height - y); dy++) for (let dx = 0; dx < Math.min(w, world.width - x); dx++) {
      const u = (dx + .5) / w, v = (dy + .5) / h
      const outer = ((u - .5) / .5) ** 2 + ((v - .48) / .48) ** 2 <= 1
      const inner = ((u - .5) / .29) ** 2 + ((v - .48) / .29) ** 2 < 1
      if ((v < .48 && outer && !inner) || (v >= .48 && (u < .2 || u > .8)))
        paint(x + dx, y + dy, material, shade(c, ((dx + dy * 2) % 11 < 2 ? .7 : 1) * (.8 + .3 * (1 - u))), 0)
    }
    return true
  }
  if (op.shape === 'building') {
    const c = op.color ?? '#7e67ba', material = op.material === 'wall' ? M.Wall : M.Brick
    fill(.1, .08, .8, .92, material, c)
    fill(.06, .06, .88, .04, material, shade(c, 1.3))
    fill(.1, .1, .07, .9, material, shade(c, .65))
    fill(.84, .1, .06, .9, material, shade(c, .7))
    const cols = Math.max(2, Math.min(6, Math.floor(w / 6))), rows = Math.max(2, Math.min(14, Math.floor(h / 8)))
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const lit = (row * 7 + col * 3) % 5 !== 0
      fill(.22 + col * .56 / cols, .16 + row * .73 / rows, .3 / cols, .36 / rows,
        material, lit ? '#ffe5a0' : '#29233e', material === M.Brick ? (lit ? 1 : 2) : 0)
    }
    fill(.43, .9, .14, .1, material, shade(c, .45))
    line(.5, .06, .5, 0, material, '#d8a9e9')
    return true
  }
  if (op.shape === 'terrain') {
    const c = op.color ?? '#645477'
    for (let dx = 0; dx < Math.min(w, world.width - x); dx++) {
      const top = Math.floor(h * (.24 + .09 * Math.sin(dx / w * 11) + .04 * Math.sin(dx / w * 29)))
      for (let dy = top; dy < Math.min(h, world.height - y); dy++) {
        const cap = dy - top < Math.max(1, Math.round(h * .07))
        paint(x + dx, y + dy, cap ? M.Sand : M.Wall,
          cap ? '#d9b989' : shade(c, Math.floor(dy / Math.max(2, h * .15)) % 2 ? .78 : 1), 0)
      }
    }
    return true
  }
  if (op.shape === 'speaker-stack') {
    const c = op.color ?? '#bd6aff'
    // Paint each cell once: the shared painter preserves existing speaker cells.
    for (let dy = 0; dy < Math.min(h, world.height - y); dy++) for (let dx = 0; dx < Math.min(w, world.width - x); dx++) {
      const u = (dx + .5) / w, v = (dy + .5) / h, local = (v - .04 + .96) % .32
      const cone = ((u - .5) / .38) ** 2 + ((local - .145) / .145) ** 2
      const center = ((u - .5) / .1) ** 2 + ((local - .145) / .055) ** 2
      paint(x + dx, y + dy, cone <= 1 ? M.Speaker : M.Brick,
        cone <= 1 ? (center <= 1 ? c : cone < .55 ? '#100e18' : '#494153') : (u < .06 || u > .94 ? c : '#252031'), 0)
    }
    return true
  }
  // Aquarium is a complete, contained scene object, not a rectangle of powder.
  const water = op.color ?? '#184b72'
  world.rules = { ...world.rules, plantsInWater: true, throughWater: true }
  fill(.03, .14, .94, .78, M.Water, water)
  fill(0, .05, .025, .95, M.Wall, '#60839c'); fill(.975, .05, .025, .95, M.Wall, '#60839c')
  fill(0, .95, 1, .05, M.Wall, '#3d465b')
  fill(.025, .86, .95, .09, M.Sand, '#d4b787')
  fill(0, 0, 1, .045, M.Wall, '#363347')
  nested('rock', .11, .65, .18, .22, '#666e99')
  nested('rock', .72, .70, .19, .17, '#69617f')
  nested('arch', .43, .57, .21, .3, '#8796b0', 'wall')
  nested('plant', .2, .30, .18, .57, '#41e5b5', 'seed')
  nested('plant', .42, .43, .15, .44, '#dd75df', 'seed')
  nested('plant', .67, .35, .18, .52, '#b8de6b', 'seed')
  // Bright air pockets rise through water when the simulation starts.
  for (let n = 0; n < 10; n++) cell(.12 + .074 * n, .26 + (n % 4) * .13, M.Bubble, '#bce9f6')
  return true
}
