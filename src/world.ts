import { colorFor, FIRE_PALETTE, hsl, obsidian, pack, STEAM, type Rng } from './color.ts'
import { BRUSH_DENSITY, DENSITY, ERASE, FLUID, HOPPER, M, type Tool } from './materials.ts'

export const MAX_PARTICLES = 9000
export type SceneId = 'garden' | 'volcano' | 'blank'
export type Ring = { x: number; y: number; r: number; max: number; hue: number; width: number }

/** How hard each part of the music pushes the world. 1 is the default; 0 turns a reaction off. */
export type Reactions = { kick: number; speakers: number; sparks: number; slosh: number }
export const DEFAULT_REACTIONS: Reactions = { kick: 1, speakers: 1, sparks: 1, slosh: 1 }

/** Visual envelopes the renderer reads. They spike on events and decay every frame. */
export type Pulse = { kick: number; speaker: number; twinkle: number; flash: number; shake: number }

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
  particles = 0

  rng: Rng
  frame = 0
  private cur = 1
  hue = 300
  scene: SceneId = 'garden'
  craterY = 0
  slosh = 0
  sloshDirection: 1 | -1 = 1
  beats = 0
  rings: Ring[] = []
  bursts: { at: number; x: number; y: number }[] = []
  pulse: Pulse = { kick: 0, speaker: 0, twinkle: 0, flash: 0, shake: 0 }

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

  clear() {
    this.type.fill(0)
    this.life.fill(0)
    this.color.fill(0)
    this.particles = 0
    this.rings.length = 0
    this.bursts.length = 0
  }

  put(i: number, material: number, hue = this.hue) {
    const r = this.rng
    this.type[i] = material
    this.color[i] = colorFor(material, hue, r)
    this.life[i] =
      material === M.Fire ? 30 + r() * 50 :
      material === M.Smoke ? 70 + r() * 90 :
      material === M.Rocket ? 28 + r() * 40 :
      material === M.Plant ? (r() < .14 ? 16 + r() * 24 : 0) : 0
  }

  set(x: number, y: number, material: number, life?: number) {
    const i = this.index(x, y)
    this.put(i, material)
    if (life !== undefined) this.life[i] = life
  }

  // ---------------------------------------------------------------- particles

  addParticle(x: number, y: number, vx: number, vy: number, type: number, color: number, life: number) {
    const k = this.particles
    if (k >= MAX_PARTICLES) return false
    this.px[k] = x; this.py[k] = y; this.vx[k] = vx; this.vy[k] = vy
    this.pType[k] = type; this.pColor[k] = color; this.pLife[k] = life
    this.particles++
    return true
  }

  /** Lifts a cell out of the grid and throws it. */
  launch(i: number, vx: number, vy: number) {
    if (this.addParticle(i % this.width + .5, (i / this.width | 0) + .5, vx, vy, this.type[i], this.color[i], this.life[i])) {
      this.type[i] = M.Empty
      this.life[i] = 0
    }
  }

  private kill(k: number) {
    const n = --this.particles
    this.px[k] = this.px[n]; this.py[k] = this.py[n]; this.vx[k] = this.vx[n]; this.vy[k] = this.vy[n]
    this.pType[k] = this.pType[n]; this.pColor[k] = this.pColor[n]; this.pLife[k] = this.pLife[n]
  }

  /**
   * Puts a landed particle back into the grid at the nearest free cell above (x, y),
   * trying neighbouring columns if its own is full, so thrown material is never lost.
   */
  private land(k: number, x: number, y: number) {
    const W = this.width
    x = Math.min(W - 1, Math.max(0, x))
    y = Math.min(this.height - 1, Math.max(0, y))
    for (const dx of [0, -1, 1, -2, 2]) {
      const cx = x + dx
      if (cx < 0 || cx >= W) continue
      for (let cy = y; cy >= 0; cy--) {
        const j = cy * W + cx
        if (this.type[j] !== M.Empty) continue
        this.type[j] = this.pType[k]; this.color[j] = this.pColor[k]; this.life[j] = this.pLife[k]
        this.stamp[j] = this.cur
        return
      }
    }
  }

  private updateParticles() {
    const { width: W, height: H, type } = this
    for (let k = 0; k < this.particles; k++) {
      const spark = this.pType[k] === M.Spark
      if (spark) {
        if (--this.pLife[k] === 0) { this.kill(k--); continue }
        this.vy[k] += .045; this.vx[k] *= .985
      } else {
        this.vy[k] += .13; this.vx[k] *= .996
      }
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
        if (hit !== M.Empty) {
          if (spark) {
            if ((hit === M.Oil || hit === M.Plant) && this.rng() < .5) this.put(j, M.Fire)
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

  /** One simulation tick (60 per second). */
  step() {
    this.frame++
    this.cur = this.cur % 250 + 1
    this.stepCells()
    this.updateParticles()
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k]
      if (this.frame >= b.at) { this.explode(b.x, b.y, 1.3); this.bursts.splice(k, 1) }
    }
  }

  private stepCells() {
    const { width: W, height: H, type, life, color, rng } = this
    for (let y = H - 1; y >= 0; y--) {
      const leftToRight = (this.frame + y) & 1
      for (let k = 0; k < W; k++) {
        const x = leftToRight ? k : W - 1 - k, i = y * W + x, t = type[i]
        if (t === M.Empty || this.stamp[i] === this.cur) continue
        switch (t) {
          case M.Sand: case M.Glitter: this.fall(i, x, y, DENSITY[t]); break
          case M.Water: this.flow(i, x, y, 3, 5); break
          case M.Oil: this.flow(i, x, y, 2, 3); break
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

  // ---------------------------------------------------------------- music

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
  }

  /** Throws the exposed surface of every loose pile into the air. Bottom-up so it never cascades. */
  kickHop(strength: number) {
    if (strength <= 0) return
    const W = this.width, r = this.rng
    const p = .035 + .2 * strength * strength, up = .9 + 2.3 * strength
    for (let i = this.size - 1; i >= W; i--) {
      const t = this.type[i]
      if (!HOPPER[t] || this.type[i - W] !== M.Empty) continue
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
          const j = y * W + x
          if (!HOPPER[this.type[j]]) continue
          const d = Math.sqrt(d2), f = 1 - d / R
          if (r() < f * .95) {
            const speed = (1.2 + 3.6 * strength) * f + .5
            this.launch(j, dx / d * speed, dy / d * speed - 1.3 * f)
          }
        }
      }
      this.rings.push({ x: e.x, y: e.y, r: 2, max: R * 1.7, hue: this.hue, width: 2 })
    }
    return emitters.length
  }

  /** Every seed tip grows one cell; tips that run out of growth (or everything, on a drop) flower. */
  growPlants(bloom: boolean) {
    const W = this.width, r = this.rng, tips: number[] = []
    for (let i = 0; i < this.size; i++) if (this.type[i] === M.Plant && this.life[i] > 0) tips.push(i)
    for (const i of tips) {
      const life = this.life[i], x = i % W, y = i / W | 0
      if (bloom || life <= 1) { this.flower(i, x, y); continue }
      const dx = r() < .55 ? 0 : (r() < .5 ? -1 : 1), nx = x + dx
      if (y > 0 && nx >= 0 && nx < W && this.type[i - W + dx] === M.Empty) {
        const j = i - W + dx
        this.put(j, M.Plant); this.life[j] = life - 1; this.life[i] = 0
        const side = dx || 1, ox = x - side
        if (life > 6 && r() < .2 && ox >= 0 && ox < W && this.type[i - W - side] === M.Empty) {
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

  /** Volcano only: fresh lava spits out of the crater on every kick. */
  erupt(strength: number) {
    if (this.scene !== 'volcano' || strength <= 0) return
    const r = this.rng, n = (4 + 26 * strength * strength) | 0, cx = this.width / 2
    for (let k = 0; k < n; k++) {
      this.addParticle(cx + (r() - .5) * 3, this.craterY, (r() - .5) * (1 + 2 * strength), -(2 + r() * 3.2 * strength + 1.2 * strength), M.Lava, colorFor(M.Lava, 0, r), 0)
    }
  }

  onKick(strength: number, react: Reactions = DEFAULT_REACTIONS, paused = false) {
    this.beats++
    this.pulse.kick = 1
    this.pulse.shake = Math.max(this.pulse.shake, (3 + 7 * strength) * Math.min(1.5, react.kick))
    this.hue += 7 + 10 * strength
    if (this.beats % 4 === 0) this.sloshDirection = this.sloshDirection === 1 ? -1 : 1
    if (paused) return
    this.kickHop(strength * react.kick)
    this.speakerKick(strength * react.speakers)
    this.erupt(strength * react.kick)
    this.growPlants(false)
  }

  onHat(strength: number, react: Reactions = DEFAULT_REACTIONS, paused = false) {
    if (!paused) this.sparkle(strength * react.sparks)
    else this.pulse.twinkle = 1
  }

  setMidrange(level: number, react: Reactions = DEFAULT_REACTIONS) {
    this.slosh = Math.min(.85, level * 1.6 * react.slosh)
  }

  drop(paused = false) {
    Object.assign(this.pulse, { flash: 1, shake: 22, kick: 1 })
    this.hue += 150
    if (paused) return
    this.kickHop(1)
    this.speakerKick(1.5)
    this.growPlants(true)
    if (this.scene === 'volcano') for (let k = 0; k < 6; k++) this.erupt(1)
    const r = this.rng
    for (let k = 0; k < 8; k++) this.bursts.push({ at: this.frame + k * 7 + 2, x: this.width * (.1 + r() * .8), y: this.height * (.12 + r() * .35) })
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
        const solid = tool === M.Wall || tool === M.Speaker
        if (this.type[i] === M.Empty || (solid && HOPPER[this.type[i]])) this.put(i, tool)
      }
    }
  }
}
