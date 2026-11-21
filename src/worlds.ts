import { MAX_LIFT, Sandbox, type Point } from './engine.ts'
import { Material as M, type Material } from './materials.ts'
import { makeDemo } from './demo.ts'

export const WORLD_SIZES = [
  { name: 'Classic', width: 416, height: 232 },
  { name: 'Large', width: 832, height: 464 },
  { name: 'Huge', width: 1248, height: 696 },
] as const

export const WORLDS = [
  { id: 'volcano', name: 'Volcano', detail: 'Bass erupts through the crater. Pour water to build fresh stone.', color: '#f89252', sky: [21, 13, 19] },
  { id: 'ocean', name: 'Deep Ocean', detail: 'Midrange drives opposing currents. Bass ripples across the seafloor.', color: '#55bbef', sky: [8, 19, 31] },
  { id: 'city', name: 'Neon City', detail: 'Treble sends sparks and arcs through the rooftops and waterways.', color: '#c9a3f3', sky: [18, 12, 29] },
  { id: 'dunes', name: 'Sandstorm', detail: 'Wind shifts the dunes. Heavy bass kicks loose sand into the air.', color: '#efc17c', sky: [26, 18, 17] },
] as const

export type WorldId = typeof WORLDS[number]['id'] | 'classic' | 'empty'

export function makeWorld(world: Sandbox, id: WorldId) {
  world.clear()
  world.template = id
  if (id === 'empty') return
  if (id === 'classic') {
    if (world.width === 416) { makeDemo(world); return }
    const classic = new Sandbox()
    makeDemo(classic)
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const id = classic.cells[classic.index(Math.floor(x * 416 / world.width), Math.floor(y * 232 / world.height))] as Material
        if (id !== M.Empty) world.set(x, y, id)
      }
    }
    return
  }

  const w = world.width
  const h = world.height
  const draw = (material: Material, intersect: (x: number, y: number) => boolean) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (intersect(x / w, y / h)) world.set(x, y, material)
      }
    }
  }
  const peaks = (x: number, knots: readonly (readonly [number, number])[]) => {
    for (let i = 1; i < knots.length; i++) {
      const [right, max] = knots[i]
      const [left, min] = knots[i - 1]
      if (x < right) return min + (x - left) / (right - left) * (max - min)
    }
    return knots.at(-1)![1]
  }
  const mound = (x: number, center: number, rise: number, width: number) =>
    Math.max(0, rise * (1 - Math.abs(x - center) / width))

  if (id === 'volcano') {
    const left = [[0.16, .92], [.26, .76], [.31, .72], [.39, .54], [.435, .44], [.48, .37], [.491, .39]] as const
    const right = [[.509, .39], [.53, .36], [.58, .44], [.617, .51], [.665, .65], [.74, .77], [.86, .92]] as const
    draw(M.Stone, (x, y) => {
      const floor = .9 - mound(x, .11, .07, .10) - mound(x, .88, .07, .095)
      if (x > .491 && x < .509 && y < .91) return false
      const face = x >= .16 && x <= .86 ? peaks(x, x < .50 ? left : right) : 1
      if (x > .43 && x < .57 && y > .71 && y < .86 && ((x - .5) / .07) ** 2 + ((y - .79) / .083) ** 2 < 1) return false
      return y > Math.min(floor, face)
    })
    draw(M.Lava, (x, y) => y > .765 && y < .86 && ((x - .5) / .065) ** 2 + ((y - .79) / .071) ** 2 < 1)
    draw(M.Lava, (x, y) => x > .493 && x < .507 && y > .695 && y < .89)
    draw(M.Water, (x, y) => x < .15 && y > .844 && y < .888 && world.cells[world.index(Math.round(x * w), Math.round(y * h))] === M.Empty)
    draw(M.Sand, (x, y) => x > .77 && y > .895 - mound(x, .875, .10, .09) && y < .875 &&
      world.cells[world.index(Math.round(x * w), Math.round(y * h))] === M.Empty)
  } else if (id === 'ocean') {
    const shore = [[0, .64], [.09, .66], [.23, .86], [.36, .88], [.49, .83], [.65, .91], [.82, .86], [1, .61]] as const
    draw(M.Stone, (x, y) => y > peaks(x, shore) + .035 ||
      y > .66 && y < .73 && (x > .23 && x < .33 || x > .68 && x < .81) ||
      x > .465 && x < .486 && y > .575 && y < .88 ||
      x > .49 && x < .51 && y > .61 && y < .86)
    draw(M.Sand, (x, y) => y >= peaks(x, shore) && y < peaks(x, shore) + .035)
    draw(M.Water, (x, y) => y > .30 && y < peaks(x, shore) &&
      world.cells[world.index(Math.round(x * w), Math.round(y * h))] === M.Empty)
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(w * (.20 + world.random() * .61))
      const y = Math.floor(h * (.665 + world.random() * .09))
      world.set(x, y, M.Electricity)
    }
  } else if (id === 'city') {
    const buildings = [
      [.055, .12, .56], [.14, .22, .45], [.25, .34, .62], [.36, .44, .42],
      [.45, .53, .30], [.55, .63, .47], [.66, .75, .55], [.77, .84, .40], [.875, .95, .53],
    ] as const
    const floor = (x: number) => x > .64 && x < .79 ? .965 : .89
    draw(M.Stone, (x, y) => {
      if (y > floor(x)) return true
      for (const [left, right, top] of buildings) {
        if (x <= left || x >= right || y <= top) continue
        const rim = x < left + .006 || x > right - .006
        const story = (y - top) % .059
        const column = (x - left) % .023
        if (rim || story < .018 || column > .012 || y > .84) return true
      }
      return false
    })
    draw(M.Water, (x, y) => x > .645 && x < .785 && y > .915 && y < .957 &&
      world.cells[world.index(Math.round(x * w), Math.round(y * h))] === M.Empty)
    for (const [left, right, top] of buildings) {
      draw(M.Oil, (x, y) => x > left + .012 && x < right - .009 && y > top - .025 && y < top)
    }
  } else {
    const ridge = (x: number) => .90 - mound(x, .20, .32, .24)
      - mound(x, .55, .19, .19) - mound(x, .86, .30, .20)
    draw(M.Stone, (x, y) => y > .94 - mound(x, .33, .12, .10) - mound(x, .72, .09, .095) ||
      x < .027 && y > .61 || x > .97 && y > .59)
    draw(M.Sand, (x, y) => y >= ridge(x) && y < .94 &&
      world.cells[world.index(Math.round(x * w), Math.round(y * h))] === M.Empty)
    draw(M.Stone, (x, y) => y > .73 - mound(x, .09, .05, .055) && y < .78 && x > .035 && x < .155)
  }
}

export function shockOrigin(world: Sandbox): Point {
  const x = Math.floor(world.width * (world.template === 'ocean' ? .47 : .50))
  const height = world.template === 'volcano' ? .39 : world.template === 'city' ? .66 : .80
  return { x, y: Math.floor(world.height * height) }
}

export function erupt(world: Sandbox, strength: number) {
  const vent = shockOrigin(world)
  const radius = Math.max(2, Math.round(world.width * .007))
  const cells = Math.ceil(strength * radius * 16)
  for (let n = 0; n < cells; n++) {
    const x = vent.x + Math.floor((world.random() * 2 - 1) * radius)
    const y = vent.y - Math.floor(world.random() * radius * 2)
    const index = world.index(x, y)
    if (world.cells[index] !== M.Empty || world.cells[world.index(x, vent.y + radius)] === M.Stone) continue
    if (n % 8 === 0) {
      world.set(x, y, M.Smoke)
    } else {
      world.set(x, y, M.Lava)
      world.lift[index] = Math.min(MAX_LIFT, Math.floor(10 + 24 * strength * (.54 + .46 * world.random())))
    }
  }
}
