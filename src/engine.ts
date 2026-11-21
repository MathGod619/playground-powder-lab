import { Material as M, MAX_CHARGE } from './materials.ts'
import type { Material } from './materials.ts'

export const WIDTH = 416
export const HEIGHT = 232
export const HZ = 60
export const MAX_WIND_TICKS = 36
export const WAVE_SPEED = 7
export const MAX_LIFT = 15
export const waveLimit = (width: number) => Math.ceil(width * 0.57)
export type Point = { x: number; y: number }
export type Wave = { x: number; y: number; radius: number; strength: number }
export type Wind = { direction: -1 | 1; ticks: number; strength: number }

const NEIGHBORS = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const
const DENSITY = [0, 5, 3, 0, 8, 2, 6, 0, 0]

export class Sandbox {
  readonly width: number
  readonly height: number
  readonly cells: Uint8Array
  readonly life: Uint8Array
  readonly charge: Uint8Array
  readonly lift: Uint8Array
  private readonly visited: Uint32Array
  private tick = 0
  rng: number
  occupied = 0
  revision = 0
  wave: Wave | null = null
  wind: Wind | null = null

  constructor(width = WIDTH, height = HEIGHT, seed = 0x6d2b79f5) {
    this.width = width
    this.height = height
    this.cells = new Uint8Array(width * height)
    this.life = new Uint8Array(this.cells.length)
    this.charge = new Uint8Array(this.cells.length)
    this.lift = new Uint8Array(this.cells.length)
    this.visited = new Uint32Array(this.cells.length)
    this.rng = (seed >>> 0) || 1
  }

  random() {
    let state = this.rng
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    this.rng = state >>> 0
    return this.rng / 0x100000000
  }

  index(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? y * this.width + x : -1
  }

  clear(seed = 0x6d2b79f5) {
    this.cells.fill(0)
    this.life.fill(0)
    this.charge.fill(0)
    this.lift.fill(0)
    this.visited.fill(0)
    this.tick = 0
    this.rng = seed
    this.occupied = 0
    this.wave = null
    this.wind = null
    this.revision++
  }

  private write(index: number, material: Material, life?: number) {
    this.occupied += Number(material !== M.Empty) - Number(this.cells[index] !== M.Empty)
    this.cells[index] = material
    if (life === undefined) {
      switch (material) {
        case M.Fire: life = 34 + Math.floor(this.random() * 57); break
        case M.Smoke: life = 110 + Math.floor(this.random() * 111); break
        case M.Electricity: life = 6 + Math.floor(this.random() * 7); break
        default: life = 0
      }
    }
    this.life[index] = life
    this.charge[index] = 0
    this.lift[index] = 0
    this.visited[index] = this.tick
    this.revision++
  }

  set(x: number, y: number, material: Material, life?: number) {
    const index = this.index(x, y)
    if (index >= 0) this.write(index, material, life)
  }

  stamp(point: Point, radius: number, material: Material) {
    const radiusSquared = radius * radius
    for (let y = Math.max(0, point.y - radius); y <= Math.min(this.height - 1, point.y + radius); y++) {
      for (let x = Math.max(0, point.x - radius); x <= Math.min(this.width - 1, point.x + radius); x++) {
        const index = y * this.width + x
        const current = this.cells[index]
        if (current === material || (x - point.x) ** 2 + (y - point.y) ** 2 > radiusSquared) continue
        if (material === M.Electricity && current === M.Water) {
          this.energize(index, true)
        } else if ((material === M.Electricity || material === M.Fire) && current === M.Oil) {
          this.write(index, M.Fire)
        } else if (material === M.Empty || material === M.Stone || current === M.Empty || current === M.Smoke) {
          this.write(index, material)
        }
      }
    }
  }

  stroke(from: Point, to: Point, radius: number, material: Material) {
    let { x, y } = from
    const dx = Math.abs(to.x - x)
    const dy = -Math.abs(to.y - y)
    const sx = x < to.x ? 1 : -1
    const sy = y < to.y ? 1 : -1
    let error = dx + dy
    while (true) {
      this.stamp({ x, y }, radius, material)
      if (x === to.x && y === to.y) break
      const doubled = 2 * error
      if (doubled >= dy) { error += dy; x += sx }
      if (doubled <= dx) { error += dx; y += sy }
    }
  }

  shock(strength: number) {
    if (strength <= 0) return
    this.wave = {
      x: Math.floor(this.width * 0.49),
      y: Math.floor(this.height * 0.80),
      radius: 0,
      strength,
    }
    this.revision++
  }

  gust(strength: number, direction: -1 | 1) {
    if (strength <= 0) return
    this.wind = { direction, ticks: Math.ceil(14 + 22 * strength), strength }
    this.revision++
  }

  sparks(strength: number) {
    if (strength <= 0) return
    const count = Math.ceil(23 * strength)
    for (let n = 0; n < count; n++) {
      const x = Math.floor(this.random() * this.width)
      const start = Math.floor(this.random() * this.height * 0.35)
      for (let y = start; y < this.height - 1; y++) {
        const i = this.index(x, y)
        const below = this.cells[i + this.width]
        if (this.cells[i] === M.Empty && below !== M.Empty) {
          this.write(i, M.Electricity)
          break
        }
        if (y === this.height - 2 && this.cells[i] === M.Empty && n % 3 === 0) {
          this.write(this.index(x, start), M.Electricity)
        }
      }
    }
  }

  private swap(from: number, to: number) {
    const material = this.cells[from]
    const lifetime = this.life[from]
    const charge = this.charge[from]
    const lift = this.lift[from]
    this.cells[from] = this.cells[to]
    this.life[from] = this.life[to]
    this.charge[from] = this.charge[to]
    this.lift[from] = this.lift[to]
    this.cells[to] = material
    this.life[to] = lifetime
    this.charge[to] = charge
    this.lift[to] = lift
    this.visited[from] = this.tick
    this.visited[to] = this.tick
    this.revision++
  }

  private move(index: number, x: number, y: number, density = 0) {
    const to = this.index(x, y)
    if (to < 0 || this.visited[to] === this.tick) return false
    const material = this.cells[to]
    if (material !== M.Empty && DENSITY[material] >= density) return false
    this.swap(index, to)
    return true
  }

  private energize(index: number, restart = false) {
    if (this.charge[index] === 0 || restart) {
      this.charge[index] = MAX_CHARGE
      this.visited[index] = this.tick
      this.revision++
    }
  }

  private cool(hot: number, water: number) {
    if (this.cells[hot] === M.Lava) {
      this.write(hot, M.Stone)
      this.write(water, M.Smoke)
    } else {
      this.write(hot, M.Smoke)
    }
  }

  private react(index: number, x: number, y: number, material: Material) {
    const hot = material === M.Fire || material === M.Lava
    const spark = material === M.Electricity
    const water = material === M.Water
    if (!hot && !spark && !water) return false

    const charged = water && this.charge[index] > 0
    const spread = charged && this.charge[index] === MAX_CHARGE
    if (charged) {
      this.charge[index]--
      this.revision++
    }
    for (const [dx, dy] of NEIGHBORS) {
      const other = this.index(x + dx, y + dy)
      if (other < 0) continue
      const target = this.cells[other]
      if (water && (target === M.Fire || target === M.Lava)) {
        this.cool(other, index)
        return true
      }
      if (target === M.Water) {
        if (spark || spread) {
          this.energize(other)
          if (spark) {
            this.write(index, M.Empty)
            return true
          }
        } else if (hot) {
          this.cool(index, other)
          return true
        }
      }
      if (target === M.Oil && (hot || spark || spread)) {
        if (material !== M.Fire || this.random() < 0.38) this.write(other, M.Fire)
      }
    }
    return spread
  }

  private applyForces(index: number, x: number, y: number, material: Material, direction: number) {
    if (this.lift[index]) {
      const rise = this.lift[index]--
      this.revision++
      if (rise >= 9 && this.cells[this.index(x, y - 1)] === M.Empty && this.move(index, x, y - 2)) {
        return true
      }
      if (this.move(index, x, y - 1) || this.move(index, x + direction, y - 1)) return true
      this.lift[index] = 0
    }
    const wave = this.wave
    if (wave) {
      const dx = x - wave.x
      const dy = y - wave.y
      const front = wave.radius
      const distanceSquared = dx * dx + dy * dy
      const inner = Math.max(0, front - 8)
      if (distanceSquared >= inner * inner && distanceSquared <= (front + 6) ** 2) {
        const outward = Math.sign(dx) || direction
        const mobility = material === M.Lava ? 0.23 : material === M.Sand ? 0.63 : 0.86
        if (this.random() < wave.strength * mobility) {
          const loft = material === M.Water || material === M.Oil ? 15 : material === M.Sand ? 8 : 0
          let nextX = x + outward
          let nextY = y - 1
          if (!this.move(index, nextX, nextY)) {
            nextX = x
            if (!this.move(index, nextX, nextY)) {
              nextX = x + outward
              nextY = y
              if (!this.move(index, nextX, nextY)) return false
            }
          }
          if (loft && nextY < y) {
            const impulse = wave.strength * loft * (0.45 + 0.55 * this.random())
            this.lift[this.index(nextX, nextY)] = Math.max(1, Math.round(impulse))
          }
          return true
        }
      }
    }
    const wind = this.wind
    if (wind) {
      const mobility = DENSITY[material] === 0 ? 0.85 : material === M.Water || material === M.Oil ? 0.18 : 0.05
      const pressure = wind.strength * (0.4 + 0.6 * wind.ticks / MAX_WIND_TICKS)
      if (this.random() < mobility * pressure && this.move(index, x + wind.direction, y)) return true
    }
    return false
  }

  private flow(index: number, x: number, y: number, material: Material, dir: number) {
    if (material === M.Lava && this.random() > 0.36) return
    if (this.move(index, x, y + 1, DENSITY[material]) ||
        this.move(index, x + dir, y + 1, DENSITY[material]) ||
        this.move(index, x - dir, y + 1, DENSITY[material])) return
    if (material === M.Sand) return

    // Scan contiguous space only. Liquid spreads without tunneling through barriers.
    const reach = material === M.Water ? 4 : material === M.Oil ? 2 : 1
    for (let side = dir; side !== 0; side = side === dir ? -dir : 0) {
      let destination = x
      for (let gap = 1; gap <= reach; gap++) {
        const next = x + side * gap
        const target = this.index(next, y)
        if (target < 0 || this.cells[target] !== M.Empty || this.visited[target] === this.tick) break
        destination = next
        const below = this.index(next, y + 1)
        if (below >= 0 && this.cells[below] === M.Empty) break
      }
      if (destination !== x && this.move(index, destination, y)) return
    }
    if (material === M.Oil) {
      const above = this.index(x, y - 1)
      if (above >= 0 && this.cells[above] === M.Water && this.visited[above] !== this.tick) this.swap(index, above)
    }
  }

  private update(index: number, x: number, y: number) {
    const material = this.cells[index] as Material
    if (material === M.Empty || material === M.Stone || this.visited[index] === this.tick) return
    if (this.react(index, x, y, material)) return
    if (this.life[index]) {
      this.life[index]--
      this.revision++
      if (this.life[index] === 0) {
        this.write(index, material === M.Fire ? M.Smoke : M.Empty)
        return
      }
    }

    const direction = this.random() < 0.5 ? -1 : 1
    if (this.applyForces(index, x, y, material, direction)) return
    if (DENSITY[material] > 0) {
      this.flow(index, x, y, material, direction)
    } else if (material === M.Electricity) {
      if (!this.move(index, x + direction, y + 1) && !this.move(index, x, y + 1)) {
        this.move(index, x + direction, y)
      }
    } else if (material !== M.Smoke || this.random() < 0.62) {
      if (!this.move(index, x, y - 1) && !this.move(index, x + direction, y - 1)) {
        this.move(index, x + direction, y)
      }
    }
  }

  step() {
    this.tick = (this.tick + 1) >>> 0
    if (this.tick === 0) {
      this.visited.fill(0)
      this.tick = 1
    }
    if (this.wave) {
      this.wave.radius += WAVE_SPEED
      if (this.wave.radius > waveLimit(this.width)) this.wave = null
      this.revision++
    }
    if (this.wind) {
      if (--this.wind.ticks <= 0) this.wind = null
      this.revision++
    }
    if (!this.occupied) return
    for (let y = this.height - 1; y >= 0; y--) {
      const offset = y * this.width
      const rightToLeft = (y + this.tick) % 2 !== 0
      let x = rightToLeft ? this.width - 1 : 0
      const direction = rightToLeft ? -1 : 1
      for (; x >= 0 && x < this.width; x += direction) this.update(offset + x, x, y)
    }
  }

  get tickNumber() { return this.tick }

  restoreTick(tick: number) {
    this.tick = tick
    this.visited.fill(tick)
  }
}
