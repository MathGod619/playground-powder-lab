import { Material as M, MAX_CHARGE } from './materials.ts'
import type { Material } from './materials.ts'
import { erupt, shockOrigin, type WorldId } from './worlds.ts'

export const WIDTH = 416
export const HEIGHT = 232
export const HZ = 60
export const MAX_WIND_TICKS = 36
export const WAVE_SPEED = 7
export const MAX_LIFT = 32
export const waveLimit = (width: number) => Math.ceil(width * 0.57)
export type Point = { x: number; y: number }
export type Wave = { x: number; y: number; radius: number; strength: number }
export type Wind = { direction: -1 | 1; ticks: number; strength: number }

const NEIGHBORS = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const
const DENSITY = [0, 5, 3, 0, 8, 2, 6, 0, 0]
const REGION = 32

export class Sandbox {
  readonly width: number
  readonly height: number
  readonly cells: Uint8Array
  readonly life: Uint8Array
  readonly charge: Uint8Array
  readonly lift: Uint8Array
  readonly regionColumns: number
  private readonly regionRows: number
  private readonly regionParticles: Uint16Array
  private awake: Uint8Array
  private active: Uint8Array
  private readonly visited: Uint32Array
  private tick = 0
  rng: number
  occupied = 0
  revision = 0
  wave: Wave | null = null
  wind: Wind | null = null
  template: WorldId = 'classic'
  runningRegions = 0

  constructor(width = WIDTH, height = HEIGHT, seed = 0x6d2b79f5) {
    this.width = width
    this.height = height
    this.cells = new Uint8Array(width * height)
    this.life = new Uint8Array(this.cells.length)
    this.charge = new Uint8Array(this.cells.length)
    this.lift = new Uint8Array(this.cells.length)
    this.regionColumns = Math.ceil(width / REGION)
    this.regionRows = Math.ceil(height / REGION)
    this.regionParticles = new Uint16Array(this.regionColumns * this.regionRows)
    this.awake = new Uint8Array(this.regionParticles.length)
    this.active = new Uint8Array(this.regionParticles.length)
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
    this.awake.fill(0)
    this.active.fill(0)
    this.regionParticles.fill(0)
    this.runningRegions = 0
    this.visited.fill(0)
    this.tick = 0
    this.rng = seed
    this.occupied = 0
    this.wave = null
    this.wind = null
    this.revision++
  }

  private write(index: number, material: Material, life?: number) {
    const previous = this.cells[index]
    const region = this.regionFor(index)
    this.regionParticles[region] += Number(this.movable(material)) - Number(this.movable(previous))
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
    this.wake(index)
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
    const spacing = Math.max(1, radius >> 2)
    let travel = 0
    while (true) {
      const endpoint = x === to.x && y === to.y
      if (endpoint || travel++ % spacing === 0) this.stamp({ x, y }, radius, material)
      if (endpoint) break
      const doubled = 2 * error
      if (doubled >= dy) { error += dy; x += sx }
      if (doubled <= dx) { error += dx; y += sy }
    }
  }

  shock(strength: number) {
    if (strength <= 0) return
    this.wave = {
      ...shockOrigin(this),
      radius: 0,
      strength,
    }
    if (this.template === 'volcano') erupt(this, strength)
    if (this.template === 'dunes' && strength > 0.51) {
      this.gust(strength, this.random() < .5 ? -1 : 1)
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
    if (this.template === 'city') {
      const width = this.width
      for (let n = 0; n < Math.ceil(2 + 5 * strength); n++) {
        let x = Math.floor(width * (.08 + this.random() * .84))
        const y = Math.floor(this.height * .18)
        for (let i = 0; i < Math.floor(this.height * (.16 + strength * .18)); i++) {
          const index = this.index(x, y + i)
          if (index < 0 || this.cells[index] === M.Stone) break
          if (this.cells[index] === M.Empty && i % 2 === 0) this.write(index, M.Electricity)
          if (this.cells[index] === M.Water) this.energize(index)
          if (i % 3 === 0) x += this.random() < .5 ? -2 : 2
        }
      }
    }
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
    const other = this.cells[to]
    if (other === M.Empty || material === M.Empty) {
      const a = this.regionFor(from)
      const b = this.regionFor(to)
      if (a !== b) {
        this.regionParticles[a] += Number(this.movable(other)) - Number(this.movable(material))
        this.regionParticles[b] += Number(this.movable(material)) - Number(this.movable(other))
      }
    }
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
    this.wake(from)
    this.wake(to)
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

  private energize(index: number, restart = false, charge = MAX_CHARGE as number) {
    if (this.charge[index] === 0 || restart) {
      this.charge[index] = charge
      this.visited[index] = this.tick
      this.wake(index)
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
    const spread = charged && this.charge[index] > 13 ? this.charge[index] - 3 : 0
    if (charged) {
      this.charge[index]--
      if (this.charge[index]) this.wake(index)
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
          if (spark) this.energize(other)
          else this.energize(other, false, spread)
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
    return false
  }

  private applyForces(index: number, x: number, y: number, material: Material, direction: number) {
    if (this.lift[index]) {
      const rise = this.lift[index]--
      this.revision++
      if (rise >= 9 && this.cells[this.index(x, y - 1)] === M.Empty) {
        if (material === M.Lava && this.template === 'volcano') {
          const ventSide = Math.sign(x - this.width / 2) || direction
          const lateral = this.random() < .7 ? ventSide : -ventSide
          if (this.move(index, x + lateral, y - 2)) return true
        }
        if (this.move(index, x, y - 2)) return true
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
          const displacement = this.template === 'ocean' && material === M.Sand ? DENSITY[M.Sand] : 0
          let nextX = x + outward
          let nextY = y - 1
          if (!this.move(index, nextX, nextY, displacement)) {
            nextX = x
            if (!this.move(index, nextX, nextY, displacement)) {
              nextX = x + outward
              nextY = y
              if (!this.move(index, nextX, nextY, displacement)) return false
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
      const ocean = this.template === 'ocean'
      const dunes = this.template === 'dunes'
      const direction = ocean && y > this.height * .63 ? -wind.direction : wind.direction
      const mobility = DENSITY[material] === 0 ? 0.85 : material === M.Water || material === M.Oil
        ? (ocean ? .82 : .18) : (dunes && material === M.Sand ? .69 : .05)
      const pressure = wind.strength * (0.4 + 0.6 * wind.ticks / MAX_WIND_TICKS)
      if (this.random() < mobility * pressure) {
        if (this.move(index, x + direction, y, ocean && material === M.Sand ? DENSITY[M.Sand] : 0)) return true
        if (dunes && material === M.Sand && this.move(index, x + direction, y - 1)) {
          this.lift[this.index(x + direction, y - 1)] = Math.max(1, Math.round(pressure * 5))
          return true
        }
      }
    }
    return false
  }

  private flow(index: number, x: number, y: number, material: Material, dir: number) {
    if (material === M.Lava && this.random() > 0.36) {
      for (let dx = -1; dx <= 1; dx++) {
        const below = this.cells[this.index(x + dx, y + 1)]
        if (DENSITY[below] < DENSITY[M.Lava] || (dx !== 0 && this.cells[this.index(x + dx, y)] === M.Empty)) {
          this.wake(index)
          break
        }
      }
      return
    }
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
    // A fully surrounded particle cannot move or exchange heat this tick.
    const w = this.width
    if (DENSITY[material] > 0 && !this.lift[index] && !this.charge[index] &&
        x > 0 && x + 1 < w && this.cells[index - 1] === material && this.cells[index + 1] === material &&
        this.cells[index - w] === material && this.cells[index + w] === material &&
        this.cells[index - w - 1] === material && this.cells[index - w + 1] === material &&
        this.cells[index + w - 1] === material && this.cells[index + w + 1] === material) return
    if (this.react(index, x, y, material)) return
    if (this.life[index]) {
      this.life[index]--
      this.wake(index)
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

  private movable(material: number) { return material !== M.Empty && material !== M.Stone }

  private regionFor(index: number) {
    return Math.floor(index / this.width / REGION) * this.regionColumns + ((index % this.width) >> 5)
  }

  private wake(index: number) {
    const x = index % this.width
    const y = Math.floor(index / this.width)
    // Sideways liquid motion reaches four cells. Wake neighbors across that margin.
    const first = Math.max(0, x - 4) >> 5
    const last = Math.min(this.width - 1, x + 4) >> 5
    const start = (Math.max(0, y - 2) >> 5) * this.regionColumns
    const end = (Math.min(this.height - 1, y + 2) >> 5) * this.regionColumns
    for (let row = start; row <= end; row += this.regionColumns) {
      for (let col = first; col <= last; col++) this.awake[row + col] = 1
    }
  }

  private wakeForces() {
    const wave = this.wave
    if (!wave && !this.wind) return
    for (let i = 0; i < this.active.length; i++) {
      if (!this.regionParticles[i] || this.active[i]) continue
      if (this.wind) {
        this.active[i] = 1
      } else if (wave) {
        const x = (i % this.regionColumns + .5) * REGION
        const y = (Math.floor(i / this.regionColumns) + .5) * REGION
        const distance = Math.hypot(x - wave.x, y - wave.y)
        if (Math.abs(distance - wave.radius) <= 34) this.active[i] = 1
      }
    }
  }

  get regionState() { return this.awake }

  restoreRegions(state?: number[]) {
    this.regionParticles.fill(0)
    for (let i = 0; i < this.cells.length; i++) {
      if (this.movable(this.cells[i])) this.regionParticles[this.regionFor(i)]++
    }
    if (state) this.awake.set(state)
    else this.awake.fill(1)
  }

  step() {
    this.tick = (this.tick + 1) >>> 0
    if (this.tick === 0) {
      this.visited.fill(0)
      this.tick = 1
    }
    if (this.wave) {
      this.wave.radius += Math.max(1, Math.round(WAVE_SPEED * this.width / WIDTH))
      if (this.wave.radius > waveLimit(this.width)) this.wave = null
      this.revision++
    }
    if (this.wind) {
      if (--this.wind.ticks <= 0) this.wind = null
      this.revision++
    }
    const previous = this.active
    this.active = this.awake
    this.awake = previous
    this.awake.fill(0)
    this.wakeForces()
    this.runningRegions = 0
    for (let i = 0; i < this.active.length; i++) {
      if (!this.regionParticles[i]) this.active[i] = 0
      this.runningRegions += this.active[i]
    }
    if (!this.runningRegions) return
    for (let y = this.height - 1; y >= 0; y--) {
      const offset = y * this.width
      const regionRow = (y >> 5) * this.regionColumns
      const rightToLeft = (y + this.tick) % 2 !== 0
      const direction = rightToLeft ? -1 : 1
      let region = rightToLeft ? this.regionColumns - 1 : 0
      for (; region >= 0 && region < this.regionColumns; region += direction) {
        if (!this.active[regionRow + region]) continue
        const first = region * REGION
        const last = Math.min(this.width - 1, first + REGION - 1)
        const start = rightToLeft ? last : first
        const end = rightToLeft ? first : last
        for (let x = start; x !== end + direction; x += direction) this.update(offset + x, x, y)
      }
    }
  }

  get tickNumber() { return this.tick }

  restoreTick(tick: number) {
    this.tick = tick
    this.visited.fill(tick)
  }
}
