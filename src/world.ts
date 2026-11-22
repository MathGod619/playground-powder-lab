import { colorFor, FIRE_PALETTE, hsl, obsidian, pack, STEAM, type Rng } from './color.ts'
import { bossBlast, bossDrop, bossKick, stepBoss, type Boss } from './boss.ts'
import { crowdDrop, crowdHat, crowdKick, crowdPush, stepCrowd, type Raver } from './crowd.ts'
import type { Energy } from './immersion.ts'
import {
  BOMB_DROP_ONLY, BOMB_FIXED, BOMB_FUSE, BREAKABLE, BRUSH_DENSITY, DENSITY, ERASE, FLUID, HOPPER, M, OVERWRITES, POWDER, type Tool,
} from './materials.ts'

export const MAX_PARTICLES = 12000
/** Sand life value meaning "held in place" (see image.ts). */
export const HELD_SAND = 1
export type SceneId = 'garden' | 'volcano' | 'city' | 'moon' | 'sea' | 'storm' | 'blank' | 'song'
export type Ring = { x: number; y: number; r: number; max: number; hue: number; width: number }
export type Bolt = { points: [number, number][]; life: number }

/** How hard each part of the music pushes the world. 1 is the default; 0 turns a reaction off. */
export type Reactions = { kick: number; speakers: number; sparks: number; slosh: number }
export const DEFAULT_REACTIONS: Reactions = { kick: 1, speakers: 1, sparks: 1, slosh: 1 }

/** Visual envelopes the renderer reads. They spike on events and decay every frame. */
export type Pulse = { kick: number; speaker: number; twinkle: number; flash: number; shake: number }

/** Physics that differ per world. */
export type SceneRules = {
  /** Multiplier on the pull felt by thrown material. */
  gravity: number
  /** Chance per tick that a loose cell moves at all (lower = slow, floaty settling). */
  fall: number
  /** Thrown material and sparks pass through water (with drag) instead of stopping on it. */
  throughWater: boolean
  /** Seeds can grow up through water (kelp). */
  plantsInWater: boolean
}
export const DEFAULT_RULES: SceneRules = { gravity: 1, fall: 1, throughWater: false, plantsInWater: false }

/** Extra things a world does on the beat, on top of the shared reactions. */
export type SceneHooks = {
  kick?: (world: World, strength: number) => void
  hat?: (world: World, strength: number) => void
  drop?: (world: World) => void
}

export class World {
  readonly width: number
  readonly height: number
  readonly size: number
  readonly type: Uint8Array
  readonly life: Uint8Array
  readonly color: Uint32Array
  private readonly stamp: Uint8Array

  // Free particles: cells the music has thrown into the air, plus sparks.
  readonly px = new Float32Array(MAX_PARTICLES)
  readonly py = new Float32Array(MAX_PARTICLES)
  readonly vx = new Float32Array(MAX_PARTICLES)
  readonly vy = new Float32Array(MAX_PARTICLES)
  readonly pType = new Uint8Array(MAX_PARTICLES)
  readonly pLife = new Uint16Array(MAX_PARTICLES)
  readonly pColor = new Uint32Array(MAX_PARTICLES)
  /** Ticks a blast fragment ignores collisions, so it clears the crater rim. */
  readonly pGhost = new Uint8Array(MAX_PARTICLES)
  particles = 0

  rng: Rng
  frame = 0
  private cur = 1
  hue = 300
  scene: SceneId = 'garden'
  rules: SceneRules = DEFAULT_RULES
  hooks: SceneHooks = {}
  /** Scene-specific points of interest (crater, vents…), set by the scene builder. */
  marks: { x: number; y: number }[] = []
  craterY = 0
  slosh = 0
  directorWind = 0
  energy: Energy = { bass: 0, mid: 0, treble: 0, level: 0 }
  dropTicks = 0
  pressure = 0
  private continuousReactions: Reactions = DEFAULT_REACTIONS
  sloshDirection: 1 | -1 = 1
  beats = 0
  /** Ticks during which unsupported brick crumbles. */
  quake = 0
  rings: Ring[] = []
  bolts: Bolt[] = []
  bursts: { at: number; x: number; y: number }[] = []
  fuses: { at: number; i: number }[] = []
  pulse: Pulse = { kick: 0, speaker: 0, twinkle: 0, flash: 0, shake: 0 }
  /** The dancing crowd (see crowd.ts). Empty when the crowd is off. */
  ravers: Raver[] = []
  /** The Boss Drop monster (see boss.ts), only in that challenge. */
  boss: Boss | null = null

  constructor(width: number, height: number, rng: Rng = Math.random) {
    this.width = width
    this.height = height
    this.size = width * height
    this.type = new Uint8Array(this.size)
    this.life = new Uint8Array(this.size)
    this.color = new Uint32Array(this.size)
    this.stamp = new Uint8Array(this.size)
    this.rng = rng
  }

  index(x: number, y: number) { return y * this.width + x }
  at(x: number, y: number) { return this.type[y * this.width + x] }

  count(material: number) {
    let n = 0
    for (let i = 0; i < this.size; i++) if (this.type[i] === material) n++
    for (let k = 0; k < this.particles; k++) if (this.pType[k] === material) n++
    return n
  }

  /** Counts the things Rave Mode scores in one pass. */
  census() {
    let bricks = 0, gravel = 0, flowers = 0, bombs = 0
    const t = this.type
    for (let i = 0; i < this.size; i++) {
      const v = t[i]
      if (v === M.Brick) bricks++
      else if (v === M.Gravel) gravel++
      else if (v === M.Flower) flowers++
      else if (v === M.Bomb) bombs++
    }
    for (let k = 0; k < this.particles; k++) if (this.pType[k] === M.Gravel) gravel++
    return { bricks, gravel, flowers, bombs, airborne: this.particles, cells: this.size }
  }

  clear() {
    this.type.fill(0)
    this.life.fill(0)
    this.color.fill(0)
    this.particles = 0
    this.rings.length = 0
    this.bolts.length = 0
    this.bursts.length = 0
    this.fuses.length = 0
    this.marks = []
    this.quake = 0
  }

  put(i: number, material: number, hue = this.hue) {
    const r = this.rng
    this.type[i] = material
    this.color[i] = colorFor(material, hue, r)
    this.life[i] =
      material === M.Fire ? 30 + r() * 50 :
      material === M.Smoke ? 70 + r() * 90 :
      material === M.Rocket ? 28 + r() * 40 :
      material === M.Bomb ? BOMB_FUSE :
      material === M.Plant ? (r() < .14 ? 16 + r() * 24 : 0) : 0
  }

  set(x: number, y: number, material: number, life?: number) {
    const i = this.index(x, y)
    this.put(i, material)
    if (life !== undefined) this.life[i] = life
  }

  // ---------------------------------------------------------------- particles

  addParticle(x: number, y: number, vx: number, vy: number, type: number, color: number, life: number, ghost = 0) {
    const k = this.particles
    if (k >= MAX_PARTICLES) return false
    this.px[k] = x; this.py[k] = y; this.vx[k] = vx; this.vy[k] = vy
    this.pType[k] = type; this.pColor[k] = color; this.pLife[k] = life; this.pGhost[k] = ghost
    this.particles++
    return true
  }

  /** Lifts a cell out of the grid and throws it. */
  launch(i: number, vx: number, vy: number, ghost = 0) {
    const life = this.type[i] === M.Sand ? 0 : this.life[i]
    if (this.addParticle(i % this.width + .5, (i / this.width | 0) + .5, vx, vy, this.type[i], this.color[i], life, ghost)) {
      this.type[i] = M.Empty
      this.life[i] = 0
    }
  }

  private kill(k: number) {
    const n = --this.particles
    this.px[k] = this.px[n]; this.py[k] = this.py[n]; this.vx[k] = this.vx[n]; this.vy[k] = this.vy[n]
    this.pType[k] = this.pType[n]; this.pColor[k] = this.pColor[n]; this.pLife[k] = this.pLife[n]; this.pGhost[k] = this.pGhost[n]
  }

  private passable(t: number) {
    return t === M.Empty || (t === M.Water && this.rules.throughWater)
  }

  /**
   * Puts a landed particle back into the grid at the nearest free cell above (x, y),
   * trying neighbouring columns if its own is full, so thrown material is never lost.
   * Underwater, the particle takes a water cell's place and that water moves up to the surface.
   */
  private land(k: number, x: number, y: number) {
    const W = this.width
    x = Math.min(W - 1, Math.max(0, x))
    y = Math.min(this.height - 1, Math.max(0, y))
    for (const dx of [0, -1, 1, -2, 2]) {
      const cx = x + dx
      if (cx < 0 || cx >= W) continue
      for (let cy = y; cy >= 0; cy--) {
        const j = cy * W + cx, t = this.type[j]
        if (t === M.Water && this.rules.throughWater) {
          const water = this.color[j]
          this.fill(j, k)
          this.surface(cx, cy, water)
          return
        }
        if (t !== M.Empty) continue
        this.fill(j, k)
        return
      }
    }
  }

  private fill(j: number, k: number) {
    this.type[j] = this.pType[k]; this.color[j] = this.pColor[k]; this.life[j] = this.pLife[k]
    this.stamp[j] = this.cur
  }

  /** Moves displaced water to the first open cell above it (or above a nearby column, if kelp or rock is in the way). */
  private surface(x: number, y: number, color: number) {
    for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      const cx = x + dx
      if (cx < 0 || cx >= this.width) continue
      for (let cy = y - 1; cy >= 0; cy--) {
        const j = cy * this.width + cx
        if (this.type[j] === M.Empty) { this.type[j] = M.Water; this.color[j] = color; this.life[j] = 0; return }
      }
    }
  }

  private updateParticles() {
    const { width: W, height: H, type, rules } = this
    for (let k = 0; k < this.particles; k++) {
      const spark = this.pType[k] === M.Spark
      const cx = this.px[k] | 0, cy = this.py[k] | 0
      const wet = rules.throughWater && cx >= 0 && cx < W && cy >= 0 && cy < H && type[cy * W + cx] === M.Water
      if (spark) {
        if (--this.pLife[k] === 0) { this.kill(k--); continue }
        this.vy[k] += .045 * rules.gravity; this.vx[k] *= .985
      } else {
        this.vy[k] += .13 * rules.gravity * (this.scene === 'moon' ? 1 - this.energy.bass * .7 : 1) * (wet ? .3 : 1); this.vx[k] *= .996
      }
      this.vx[k] += (Math.sin(this.frame * .012) * this.energy.mid * .012 + this.directorWind * .02) * this.continuousReactions.slosh
      if (wet) { this.vx[k] *= .9; this.vy[k] *= .9 }
      const ghost = this.pGhost[k] > 0
      if (ghost) this.pGhost[k]--
      const x0 = this.px[k], y0 = this.py[k], x1 = x0 + this.vx[k], y1 = y0 + this.vy[k]
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
      let lx = -1, ly = -1, dead = false, bounced = false
      for (let s = 1; s <= steps; s++) {
        const fx = x0 + (x1 - x0) * s / steps, fy = y0 + (y1 - y0) * s / steps
        const ix = fx | 0, iy = fy | 0
        if (fx < 0 || ix >= W) { this.vx[k] *= -.5; bounced = true; break }
        if (fy < 0) { lx = ix; ly = -1; continue }
        if (iy >= H) {
          if (!spark) this.land(k, lx < 0 ? ix : lx, ly < 0 ? H - 1 : ly)
          dead = true
          break
        }
        const j = iy * W + ix, hit = type[j]
        if (!this.passable(hit)) {
          if (ghost) continue
          if (spark) {
            if ((hit === M.Oil || hit === M.Plant || hit === M.Gunpowder) && this.rng() < .5) this.put(j, M.Fire)
          } else if (hit === M.Water && this.pType[k] === M.Lava) {
            type[j] = M.Wall; this.color[j] = obsidian(this.rng)
          } else {
            this.land(k, lx >= 0 ? lx : x0 | 0, ly >= 0 ? ly : lx >= 0 ? iy - 1 : y0 | 0)
          }
          dead = true
          break
        }
        lx = ix; ly = iy
      }
      if (dead) { this.kill(k--); continue }
      if (bounced) this.px[k] = Math.min(W - .01, Math.max(0, x0))
      else { this.px[k] = x1; this.py[k] = y1 }
    }
  }

  // ---------------------------------------------------------------- cells

  private swap(i: number, j: number) {
    const { type, color, life } = this
    const a = type[i], b = color[i], d = life[i]
    type[i] = type[j]; color[i] = color[j]; life[i] = life[j]
    type[j] = a; color[j] = b; life[j] = d
    this.stamp[i] = this.stamp[j] = this.cur
  }

  private canEnter(j: number, density: number) {
    const t = this.type[j]
    return FLUID[t] === 1 && DENSITY[t] < density
  }

  private fall(i: number, x: number, y: number, density: number) {
    if (y >= this.height - 1) return false
    const W = this.width, below = i + W
    if (this.canEnter(below, density)) { this.swap(i, below); return true }
    const s = this.rng() < .5 ? -1 : 1
    if (x + s >= 0 && x + s < W && this.canEnter(below + s, density)) { this.swap(i, below + s); return true }
    if (x - s >= 0 && x - s < W && this.canEnter(below - s, density)) { this.swap(i, below - s); return true }
    return false
  }

  private flow(i: number, x: number, y: number, density: number, spread: number) {
    if (this.fall(i, x, y, density)) return
    let dir: number = this.rng() < this.slosh ? this.sloshDirection : (this.rng() < .5 ? -1 : 1)
    for (let pass = 0; pass < 2; pass++, dir = -dir) {
      let last = -1
      for (let s = 1; s <= spread; s++) {
        const nx = x + dir * s
        if (nx < 0 || nx >= this.width) break
        const j = i + dir * s
        if (this.type[j] === M.Empty) last = j
        else { if (this.canEnter(j, density)) last = j; break }
      }
      if (last >= 0) { this.swap(i, last); return }
    }
  }

  private neighbors(i: number, x: number, y: number, fn: (j: number) => boolean | void) {
    const W = this.width
    return (y > 0 && fn(i - W)) || (y < this.height - 1 && fn(i + W)) || (x > 0 && fn(i - 1)) || (x < W - 1 && fn(i + 1))
  }

  private touches(i: number, x: number, y: number, a: number, b: number) {
    return !!this.neighbors(i, x, y, j => this.type[j] === a || this.type[j] === b)
  }

  /** One simulation tick (60 per second). */
  step() {
    this.frame++
    if (this.ravers.length) stepCrowd(this)
    if (this.boss) stepBoss(this)
    if (this.scene === 'volcano' && this.energy.bass > .15 && this.frame % 12 === 0)
      this.erupt(this.width / 2, this.craterY, this.pressure * .7 * this.continuousReactions.kick)
    if (this.frame % 18 === 0 && this.energy.treble > .15) this.sparkle(this.energy.treble * this.continuousReactions.sparks)
    if (this.dropTicks > 0) {
      this.dropTicks--
      const age = 180 - this.dropTicks
      if (age % 18 === 0) {
        const x = this.width * (.1 + .8 * age / 180)
        if (this.scene === 'volcano') this.erupt(this.width / 2, this.craterY, .8 + this.dropTicks / 180)
        else if (this.scene === 'storm') this.strike()
        else if (this.scene === 'moon') {
          for (let n = 0; n < 6; n++) this.addParticle(x, 1, 1 + this.rng(), 2 + this.rng(), M.Spark, hsl(210, 100, 80), 120)
        } else if (this.scene === 'sea') this.hooks.hat?.(this, 1)
        else if (this.scene === 'garden') { this.growPlants(false); this.rings.push({ x, y: this.height * .8, r: 0, max: this.width * .25, hue: this.hue + age, width: 2 }) }
      }
    }
    this.cur = this.cur % 250 + 1
    if (this.quake > 0) this.quake--
    this.stepCells()
    this.updateParticles()
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k]
      if (this.frame >= b.at) { this.explode(b.x, b.y, 1.3); this.bursts.splice(k, 1) }
    }
    for (let k = this.fuses.length - 1; k >= 0; k--) {
      const f = this.fuses[k]
      if (this.frame < f.at) continue
      this.fuses.splice(k, 1)
      if (this.type[f.i] === M.Bomb) this.detonate(f.i)
    }
    for (let k = this.bolts.length - 1; k >= 0; k--) if (--this.bolts[k].life <= 0) this.bolts.splice(k, 1)
  }

  private stepCells() {
    const { width: W, height: H, type, life, color, rng } = this
    const slow = this.rules.fall < 1
    for (let y = H - 1; y >= 0; y--) {
      const leftToRight = (this.frame + y) & 1
      for (let k = 0; k < W; k++) {
        const x = leftToRight ? k : W - 1 - k, i = y * W + x, t = type[i]
        if (t === M.Empty || this.stamp[i] === this.cur) continue
        if (slow && (POWDER[t] || t === M.Water || t === M.Oil) && rng() > this.rules.fall) continue
        switch (t) {
          case M.Sand: if (life[i] === HELD_SAND) break // an image held in place until the beat
          // falls through
          case M.Glitter: case M.Gravel: this.fall(i, x, y, DENSITY[t]); break
          case M.Gunpowder:
            if (this.touches(i, x, y, M.Fire, M.Lava)) { this.ignite(i, x, y); break }
            this.fall(i, x, y, DENSITY[t])
            break
          case M.Bomb:
            if (this.touches(i, x, y, M.Fire, M.Lava)) { this.detonate(i); break }
            if (life[i] === 0 || life[i] === BOMB_FIXED) break
            this.fall(i, x, y, DENSITY[t])
            break
          case M.Speaker:
          case M.Brick:
            if (this.quake > 0 && y < H - 1 && FLUID[type[i + W]] && rng() < .5) { type[i] = M.Gravel; life[i] = 0; this.quake = Math.max(this.quake, 40) }
            break
          case M.Water: this.flow(i, x, y, 3, 5); break
          case M.Oil: this.flow(i, x, y, 2, 3); break
          case M.Bubble: {
            if (y === 0) { type[i] = M.Water; break }
            const up = type[i - W]
            if (up === M.Water || up === M.Oil) {
              const dx = rng() < .25 ? (rng() < .5 ? -1 : 1) : 0, nx = x + dx
              const j = nx >= 0 && nx < W && type[i - W + dx] === M.Water ? i - W + dx : i - W
              this.swap(i, j)
            } else {
              type[i] = M.Water
              color[i] = colorFor(M.Water, 0, rng)
              if (up === M.Empty && rng() < .3) this.addParticle(x + .5, y, (rng() - .5) * .6, -.6, M.Spark, pack(200, 245, 255), 10 + rng() * 8)
            }
            break
          }
          case M.Lava: {
            const quenched = this.neighbors(i, x, y, j => {
              const n = type[j]
              if (n === M.Water) {
                type[i] = M.Wall; color[i] = obsidian(rng)
                this.put(j, M.Smoke); color[j] = STEAM
                return true
              }
              if ((n === M.Oil || n === M.Plant || n === M.Flower) && rng() < .3) this.put(j, M.Fire)
            })
            if (quenched) break
            if (y > 0 && type[i - W] === M.Empty) {
              if (rng() < .004) this.put(i - W, M.Fire)
              if (rng() < .0006) { type[i] = M.Wall; color[i] = obsidian(rng); break }
            }
            if (rng() < .45) this.flow(i, x, y, 6, 1)
            break
          }
          case M.Fire: {
            if (--life[i] === 0 || life[i] > 250) {
              if (rng() < .35) this.put(i, M.Smoke)
              else type[i] = M.Empty
              break
            }
            const doused = this.neighbors(i, x, y, j => {
              const n = type[j]
              if (n === M.Water) return true
              if (n === M.Gunpowder) { this.ignite(j, j % W, j / W | 0); return }
              if (n === M.Oil && rng() < .45) { this.put(j, M.Fire); life[j] = 60 + rng() * 60 }
              else if ((n === M.Plant || n === M.Flower) && rng() < .06) this.put(j, M.Fire)
            })
            if (doused) { this.put(i, M.Smoke); color[i] = STEAM; break }
            if (y > 0 && rng() < .45) {
              const dx = (rng() * 3 | 0) - 1, nx = x + dx
              if (nx >= 0 && nx < W) {
                const j = i - W + dx
                if (type[j] === M.Empty || type[j] === M.Smoke) this.swap(i, j)
              }
            }
            break
          }
          case M.Smoke: {
            if (--life[i] === 0) { type[i] = M.Empty; break }
            if (y > 0 && type[i - W] === M.Water) { type[i] = M.Bubble; color[i] = colorFor(M.Bubble, 0, rng); break }
            if (y > 0 && rng() < .8) {
              const dx = (rng() * 3 | 0) - 1 + (rng() < this.slosh ? this.sloshDirection : 0), nx = x + dx
              if (nx >= 0 && nx < W && type[i - W + dx] === M.Empty) this.swap(i, i - W + dx)
            }
            break
          }
          case M.Rocket: {
            life[i]--
            if (y > 0 && life[i] > 0 && type[i - W] === M.Empty) {
              this.swap(i, i - W)
              this.addParticle(x + .5, y + .5, (rng() - .5) * .4, .3, M.Spark, pack(255, 190, 90), 8 + rng() * 10)
            } else {
              type[i] = M.Empty
              this.explode(x, y, 1)
            }
            break
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- explosions

  /** Fireworks: sparks and glitter, no damage. */
  explode(x: number, y: number, power: number) {
    const r = this.rng, hue = r() * 360, n = (70 + r() * 50) * power
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, s = (.6 + r() * 2.6) * power
      const color = hsl(hue + r() * 50, 100, 62 + r() * 20)
      if (r() < .55) this.addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - .4, M.Spark, color, 30 + r() * 50)
      else this.addParticle(x, y, Math.cos(a) * s * .8, Math.sin(a) * s * .8 - .6, M.Glitter, color, 0)
    }
    this.rings.push({ x, y, r: 1, max: 26 * power, hue, width: 3 })
    this.pulse.flash = Math.max(this.pulse.flash, .18 * power)
    crowdPush(this, x, y, 8 * power, .3 * power)
    bossBlast(this, x, y, 6 * power, .25 * power)
  }

  /** The radius a bomb blast covers on this grid. */
  get bombRadius() { return Math.max(8, Math.round(Math.min(this.width, this.height) * .075)) }

  /**
   * A real explosion. Loose material is thrown clear of the crater, gunpowder catches,
   * other bombs go off a few ticks later, and (with `smash`) walls, brick and speakers
   * break into gravel. Unsupported brick crumbles for a while afterwards.
   */
  blast(cx: number, cy: number, radius: number, power: number, smash: boolean) {
    const { width: W, height: H, type, rng: r } = this
    const R = Math.max(2, radius), R2 = R * R
    if (smash) this.quake = Math.max(this.quake, 90 + 90 * power)
    for (let dy = -Math.ceil(R); dy <= R; dy++) {
      const y = Math.round(cy) + dy
      if (y < 0 || y >= H) continue
      for (let dx = -Math.ceil(R); dx <= R; dx++) {
        const x = Math.round(cx) + dx
        if (x < 0 || x >= W) continue
        const d2 = dx * dx + dy * dy
        if (d2 > R2) continue
        const j = y * W + x, t = type[j], d = Math.sqrt(d2) || .5, f = 1 - d / R
        if (t === M.Empty) { if (d < R * .45 && r() < .45) { this.put(j, M.Fire); this.life[j] = 12 + r() * 20 } continue }
        if (t === M.Bomb) { if (d > .5) this.schedule(j, 4 + r() * 10); continue }
        if (t === M.Gunpowder) { this.put(j, M.Fire); this.life[j] = 15 + r() * 15; continue }
        if (t === M.Plant || t === M.Flower || t === M.Oil) { if (r() < .7) this.put(j, M.Fire); continue }
        if (t === M.Cloud) { if (r() < f * 1.5) type[j] = M.Empty; continue }
        if (t === M.Water && d < R * .5 && r() < .3) { this.put(j, M.Smoke); this.color[j] = STEAM; continue }
        if (BREAKABLE[t]) {
          if (!smash || r() > (f * 2.2 - .1) * Math.min(1.5, power)) continue
          type[j] = M.Gravel
        } else if (!HOPPER[t] && t !== M.Fire && t !== M.Smoke && t !== M.Bubble) continue
        const speed = (1.4 + 4.5 * power) * (.35 + f) * (.7 + r() * .6)
        this.launch(j, dx / d * speed, dy / d * speed - (1 + 1.6 * f) * power, 4 + (f * 6 | 0))
      }
    }
    const sparks = Math.min(160, 30 + R * 4 * power)
    for (let k = 0; k < sparks; k++) {
      const a = r() * Math.PI * 2, s = 1 + r() * 4.5 * power
      this.addParticle(cx, cy, Math.cos(a) * s, Math.sin(a) * s - 1, M.Spark, FIRE_PALETTE[80 + r() * 150 | 0], 15 + r() * 35)
    }
    crowdPush(this, cx, cy, R, power)
    bossBlast(this, cx, cy, R, power)
    this.rings.push({ x: cx, y: cy, r: 1, max: R * 2.4, hue: 25, width: 4 })
    this.pulse.flash = Math.max(this.pulse.flash, Math.min(.8, .3 * power))
    this.pulse.shake = Math.max(this.pulse.shake, 8 + 12 * power)
    this.pulse.kick = 1
  }

  /** Sets off the bomb at cell i right now. */
  detonate(i: number) {
    const x = i % this.width, y = i / this.width | 0
    this.type[i] = M.Empty
    this.life[i] = 0
    this.blast(x, y, this.bombRadius, 1.2, true)
  }

  /** Queues the bomb at cell i to go off `ticks` from now (chain reactions). */
  schedule(i: number, ticks: number) {
    if (this.fuses.some(f => f.i === i)) return
    this.life[i] = 0
    this.fuses.push({ at: this.frame + Math.max(1, ticks | 0), i })
  }

  private ignite(i: number, x: number, y: number) {
    this.put(i, M.Fire)
    this.life[i] = 20
    this.blast(x, y, 2.6, .35, false)
  }

  bombs() {
    const out: number[] = []
    for (let i = 0; i < this.size; i++) if (this.type[i] === M.Bomb) out.push(i)
    return out
  }

  /** Every bomb's fuse burns down one beat. */
  tickBombs() {
    for (const i of this.bombs()) {
      const fuse = this.life[i]
      if (fuse === 0 || fuse >= BOMB_DROP_ONLY) continue
      this.life[i] = fuse - 1
      if (fuse - 1 === 0) this.schedule(i, 1)
    }
  }

  /** A jagged lightning bolt from a random cloud to whatever is below it. */
  strike() {
    const { width: W, height: H, type, rng: r } = this
    let start = -1
    for (let n = 0; n < 4000 && start < 0; n++) {
      const i = r() * (this.size - W) | 0
      if (type[i] === M.Cloud && type[i + W] === M.Empty) start = i
    }
    if (start < 0) return false
    let x = start % W, y = (start / W | 0) + 1
    const points: [number, number][] = [[x + .5, y]]
    while (y < H - 1) {
      const nx = Math.min(W - 1, Math.max(0, x + (r() < .5 ? -1 : 1) * (r() * 3 | 0)))
      const ny = y + 1 + (r() * 3 | 0)
      let hit = false
      for (let sy = y + 1; sy <= Math.min(ny, H - 1); sy++) if (type[sy * W + nx] !== M.Empty && type[sy * W + nx] !== M.Smoke) { y = sy; hit = true; break }
      x = nx
      if (hit) break
      y = Math.min(ny, H - 1)
      points.push([x + .5, y])
    }
    points.push([x + .5, y])
    this.bolts.push({ points, life: 14 })
    this.blast(x, y - 1, Math.max(3, this.bombRadius * .4), .5, false)
    for (let k = 0; k < 6; k++) {
      const j = Math.max(0, y - 1 - k) * W + x
      if (type[j] === M.Empty) { this.put(j, M.Fire); this.life[j] = 30 }
    }
    this.pulse.flash = Math.max(this.pulse.flash, .7)
    return true
  }

  /** Clouds drip rain on hi-hats. */
  rain(strength: number) {
    const { width: W, type, rng: r } = this
    for (let n = 0; n < 5000; n++) {
      const i = r() * (this.size - W) | 0
      if (type[i] === M.Cloud && type[i + W] === M.Empty && r() < .35 * strength) {
        this.addParticle(i % W + .5, (i / W | 0) + 1.2, (r() - .5) * .3 + this.slosh * this.sloshDirection * .4, .6 + r() * .6, M.Water, colorFor(M.Water, 0, r), 0)
      }
    }
  }

  // ---------------------------------------------------------------- music

  /** Throws the exposed surface of every loose pile into the air. Bottom-up so it never cascades. */
  kickHop(strength: number) {
    if (strength <= 0) return
    const W = this.width, r = this.rng
    const p = .035 + .2 * strength * strength, up = .9 + 2.3 * strength
    for (let i = this.size - 1; i >= W; i--) {
      const t = this.type[i]
      if (!HOPPER[t] || !this.passable(this.type[i - W]) || (this.type[i - W] === M.Water && t === M.Water)) continue
      const chance = t === M.Lava ? p * 1.6 : t === M.Water ? p * .9 : p
      if (r() < chance) this.launch(i, (r() - .5) * .9, -(up * (.45 + r() * .75)) * (t === M.Water ? .8 : 1))
    }
  }

  /** Groups speaker cells into emitters (one per 8×8 block holding at least 5). */
  speakers() {
    const B = 8, W = this.width, bw = Math.ceil(W / B), bh = Math.ceil(this.height / B)
    const count = new Uint16Array(bw * bh), sx = new Float32Array(bw * bh), sy = new Float32Array(bw * bh)
    for (let i = 0; i < this.size; i++) {
      if (this.type[i] !== M.Speaker) continue
      const x = i % W, y = i / W | 0, b = (y / B | 0) * bw + (x / B | 0)
      count[b]++; sx[b] += x; sy[b] += y
    }
    const out: { x: number; y: number }[] = []
    for (let b = 0; b < count.length; b++) if (count[b] >= 5) out.push({ x: sx[b] / count[b], y: sy[b] / count[b] })
    return out
  }

  speakerKick(strength: number) {
    if (strength <= 0) return 0
    const emitters = this.speakers(), W = this.width, H = this.height, r = this.rng
    if (emitters.length) this.pulse.speaker = 1
    for (const e of emitters) {
      const R = Math.round(14 + strength * 16), cx = e.x | 0, cy = e.y | 0
      for (let dy = -R; dy <= R; dy++) {
        const y = cy + dy
        if (y < 0 || y >= H) continue
        for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx
          if (x < 0 || x >= W) continue
          const d2 = dx * dx + dy * dy
          if (d2 > R * R || d2 < 4) continue
          const j = y * W + x, t = this.type[j]
          if (!HOPPER[t] || (t === M.Water && this.rules.throughWater)) continue
          const d = Math.sqrt(d2), f = 1 - d / R
          if (r() < f * .95) {
            const speed = (1.2 + 3.6 * strength) * f + .5
            this.launch(j, dx / d * speed, dy / d * speed - 1.3 * f)
          }
        }
      }
      crowdPush(this, e.x, e.y, Math.min(R * .4, this.width * .06), strength * .25)
      this.rings.push({ x: e.x, y: e.y, r: 2, max: R * 1.7, hue: this.hue, width: 2 })
    }
    return emitters.length
  }

  /** Every seed tip grows one cell; tips that run out of growth (or everything, on a drop) flower. */
  growPlants(bloom: boolean) {
    const W = this.width, r = this.rng, tips: number[] = []
    const open = (j: number) => this.type[j] === M.Empty || (this.rules.plantsInWater && this.type[j] === M.Water)
    for (let i = 0; i < this.size; i++) if (this.type[i] === M.Plant && this.life[i] > 0) tips.push(i)
    for (const i of tips) {
      const life = this.life[i], x = i % W, y = i / W | 0
      if (bloom || life <= 1) { this.flower(i, x, y); continue }
      const dx = r() < .55 ? 0 : (r() < .5 ? -1 : 1), nx = x + dx
      if (y > 0 && nx >= 0 && nx < W && open(i - W + dx)) {
        const j = i - W + dx
        this.put(j, M.Plant); this.life[j] = life - 1; this.life[i] = 0
        const side = dx || 1, ox = x - side
        if (life > 6 && r() < .2 && ox >= 0 && ox < W && open(i - W - side)) {
          const k = i - W - side
          this.put(k, M.Plant); this.life[k] = life * .6 | 0
        }
      } else this.life[i] = life - 1
    }
    return tips.length
  }

  private flower(i: number, x: number, y: number) {
    const hue = this.hue + this.rng() * 120
    this.type[i] = M.Flower; this.color[i] = hsl(hue, 100, 72); this.life[i] = 0
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= this.width || ny < 0) continue
      const j = ny * this.width + nx
      if (this.type[j] === M.Empty) { this.type[j] = M.Flower; this.color[j] = hsl(hue + this.rng() * 30, 100, 60 + this.rng() * 15) }
    }
  }

  /** Treble hits: embers fly off fire and lava, glitter twinkles. */
  sparkle(strength: number) {
    this.pulse.twinkle = 1
    if (strength <= 0) return
    const r = this.rng, W = this.width
    for (let n = 0; n < 2500; n++) {
      const i = r() * this.size | 0, t = this.type[i]
      if ((t === M.Fire || t === M.Lava) && i > W && this.type[i - W] === M.Empty) {
        this.addParticle(i % W + .5, i / W | 0, (r() - .5) * 1.4, -1 - r() * 2 * strength, M.Spark, FIRE_PALETTE[60 + r() * 60 | 0], 20 + r() * 30)
      }
    }
  }

  /** Spits fresh lava out of the given point (used by the volcano). */
  erupt(x: number, y: number, strength: number) {
    if (strength <= 0) return
    const r = this.rng, n = (4 + 26 * strength * strength) | 0
    for (let k = 0; k < n; k++) {
      this.addParticle(x + (r() - .5) * 3, y, (r() - .5) * (1 + 2 * strength), -(2 + r() * 3.2 * strength + 1.2 * strength), M.Lava, colorFor(M.Lava, 0, r), 0)
    }
  }

  /** Lets go of sand pictures that were holding their shape. Returns how many cells were released. */
  release() {
    let n = 0
    for (let i = 0; i < this.size; i++) if (this.type[i] === M.Sand && this.life[i] === HELD_SAND) { this.life[i] = 0; n++ }
    return n
  }

  onKick(strength: number, react: Reactions = DEFAULT_REACTIONS, paused = false) {
    this.beats++
    this.pulse.kick = 1
    this.pulse.shake = Math.max(this.pulse.shake, (3 + 7 * strength) * Math.min(1.5, react.kick))
    this.hue += 7 + 10 * strength
    if (this.beats % 4 === 0) this.sloshDirection = this.sloshDirection === 1 ? -1 : 1
    if (paused) return
    this.release()
    this.kickHop(strength * react.kick)
    this.speakerKick(strength * react.speakers)
    this.growPlants(false)
    this.tickBombs()
    crowdKick(this, strength * react.kick)
    bossKick(this)
    if (strength > .85 && this.rng() < .12) this.strike()
    this.hooks.kick?.(this, strength * react.kick)
  }

  onHat(strength: number, react: Reactions = DEFAULT_REACTIONS, paused = false) {
    this.pulse.twinkle = 1
    if (paused) return
    this.sparkle(strength * react.sparks)
    this.rain(Math.max(.4, strength) * Math.max(react.sparks, .5))
    crowdHat(this)
    this.hooks.hat?.(this, strength * react.sparks)
  }

  setMidrange(level: number, react: Reactions = DEFAULT_REACTIONS) {
    this.slosh = Math.min(.85, level * 1.6 * react.slosh)
  }

  setEnergy(energy: Energy, dt: number, react: Reactions = DEFAULT_REACTIONS, paused = false) {
    this.energy = { ...energy }
    this.continuousReactions = react
    if (paused) return
    this.pressure = Math.max(0, Math.min(1, this.pressure + dt * (energy.bass * .3 - .035)))
    this.slosh = Math.min(.95, energy.mid * 1.9 * react.slosh)
  }

  /** The drop: everything goes off. */
  drop(paused = false) {
    Object.assign(this.pulse, { flash: 1, shake: 22, kick: 1 })
    this.hue += 150
    if (paused) return
    this.dropTicks = 180
    this.pressure = 0
    this.release()
    this.kickHop(1)
    this.speakerKick(1.5)
    this.growPlants(true)
    const bombs = this.bombs().sort((a, b) => (a % this.width) - (b % this.width))
    bombs.forEach((i, n) => this.schedule(i, this.life[i] === BOMB_FIXED ? 3 + (n % 12) * 3 : 3 + n * 4))
    crowdDrop(this)
    bossDrop(this)
    for (let k = 0; k < 3; k++) if (!this.strike()) break
    const r = this.rng
    for (let k = 0; k < 8; k++) this.bursts.push({ at: this.frame + k * 7 + 2, x: this.width * (.1 + r() * .8), y: this.height * (.12 + r() * .35) })
    this.hooks.drop?.(this)
  }

  /** Per-frame decay of visual envelopes. */
  decay() {
    const p = this.pulse
    p.kick *= .9; p.speaker *= .86; p.twinkle *= .85; p.flash *= .88; p.shake *= .82
    this.hue += .05
  }

  // ---------------------------------------------------------------- painting

  paint(cx: number, cy: number, radius: number, tool: Tool, erase = false) {
    const density = BRUSH_DENSITY[tool] ?? 1, r = this.rng
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue
        const x = cx + dx, y = cy + dy
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue
        const i = y * this.width + x
        if (erase || tool === ERASE) { this.type[i] = M.Empty; this.life[i] = 0; continue }
        const chance = tool === M.Rocket && radius <= 2 ? .25 : density
        if (r() > chance) continue
        if (this.type[i] === M.Empty || (OVERWRITES[tool] && HOPPER[this.type[i]])) this.put(i, tool)
      }
    }
  }

  /** Drops a single bomb at (x, y), if there is room. */
  placeBomb(x: number, y: number, fixed = false) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false
    const i = this.index(x, y)
    if (this.type[i] !== M.Empty && !HOPPER[this.type[i]] && !(fixed && this.type[i] === M.Brick)) return false
    this.put(i, M.Bomb)
    if (fixed) this.life[i] = BOMB_FIXED
    return true
  }
}

