import type { Bands } from './detector.ts'
import type { SourceMode } from './audio.ts'

export type Energy = Bands & { level: number }
export class MusicEnvelope {
  value: Energy = { bass: 0, mid: 0, treble: 0, level: 0 }
  update(input: Bands, dt: number): Energy {
    for (const key of ['bass', 'mid', 'treble'] as const) {
      const target = Math.min(1, Math.max(0, input[key]) * 1.65)
      this.value[key] += (target - this.value[key]) * (1 - Math.exp(-dt / (target > this.value[key] ? .065 : .45)))
    }
    this.value.level = Math.min(1, this.value.bass * .5 + this.value.mid * .3 + this.value.treble * .2)
    return this.value
  }
}

export const automaticDrops = (source: SourceMode | null, challenge: boolean) => source !== 'tab' && !challenge

/** Three charged manual drops; charge is earned by listening, score by changing the world. */
export class RaveSession {
  active = false
  finished = false
  charge = 0
  drops = 0
  score = 0
  seconds = 90
  private lastParticles = 0
  private lastFlowers = 0
  private lastBricks = 0
  start(particles: number, flowers: number, bricks: number) {
    this.active = true; this.finished = false; this.charge = 0; this.drops = 0; this.score = 0; this.seconds = 90
    this.lastParticles = particles; this.lastFlowers = flowers; this.lastBricks = bricks
  }
  tick(dt: number, energy: number) {
    if (!this.active) return
    this.seconds = Math.max(0, this.seconds - dt)
    this.charge = Math.min(1, this.charge + dt * energy / 6)
    if (!this.seconds) { this.active = false; this.finished = true }
  }
  observe(particles: number, flowers: number, bricks: number) {
    if (!this.active) return
    this.score += Math.max(0, particles - this.lastParticles) + Math.max(0, flowers - this.lastFlowers) * 12 + Math.max(0, this.lastBricks - bricks) * 3
    this.lastParticles = particles; this.lastFlowers = flowers; this.lastBricks = bricks
  }
  drop() {
    if (!this.active || this.charge < 1) return false
    this.charge = 0; this.drops++; this.score += 1000
    if (this.drops === 3) { this.active = false; this.finished = true }
    return true
  }
}
