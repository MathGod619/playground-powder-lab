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

/** One pass over the world counting what a drop can change. */
export type Census = { bricks: number; gravel: number; flowers: number; bombs: number; airborne: number; cells?: number }

/** Scores are normalised to a world of this many cells, so Chunky and Fine detail score alike. */
const REFERENCE_CELLS = 90_000

export type Grade = { label: 'PERFECT' | 'GREAT' | 'OFF BEAT'; multiplier: number }
/** How close to a beat a drop was pressed (seconds either side). */
export function gradeTiming(offset: number): Grade {
  if (offset <= .07) return { label: 'PERFECT', multiplier: 2 }
  if (offset <= .14) return { label: 'GREAT', multiplier: 1.5 }
  return { label: 'OFF BEAT', multiplier: 1 }
}

/** Seconds between `time` and the nearest beat, given the last kick and the beat length. Infinity if unknown. */
export function beatOffset(time: number, lastKick: number, period: number) {
  if (!(period > 0) || !Number.isFinite(lastKick)) return Infinity
  const since = ((time - lastKick) % period + period) % period
  return Math.min(since, period - since)
}

export type DropResult = { grade: Grade; points: number; drop: number }
export type RaveObjective = {
  dropLimit: number
  target: number
  chargeSeconds?: number
  impactSeconds?: number
  measure: () => number
  beforeDrop?: () => void
  afterDrop?: (drop: number) => void
  /** Progress builds up over the drops (Boss Drop): only judge it after the last one, and clear early on reaching the target. */
  cumulative?: boolean
}
type RaveOutcome = 'cleared' | 'failed' | 'timeout'

const IMPACT_SECONDS = 3
const BASE_POINTS = 500

/**
 * Rave Mode: 90 seconds, three manual drops. The music charges each drop; a drop scores for
 * what it does to the world in the next three seconds (demolition, smashed walls, chained bombs,
 * bloomed flowers, material thrown) times how on-beat it was pressed.
 */
export class RaveSession {
  active = false
  finished = false
  charge = 0
  drops = 0
  score = 0
  seconds = 90
  /** The drop being scored right now (or the last one), for the on-screen popup. */
  result: DropResult | null = null
  outcome: RaveOutcome | null = null
  objectiveProgress = 0
  private objective: RaveObjective | null = null
  private clock = 0
  private impactUntil = -1
  private baseline: Census | null = null
  private peakAir = 0
  private banked = 0

  start(objective: RaveObjective | null = null) {
    this.active = true; this.finished = false; this.charge = 0; this.drops = 0; this.score = 0; this.seconds = 90
    this.result = null; this.clock = 0; this.impactUntil = -1; this.baseline = null; this.banked = 0
    this.objective = objective
    this.objectiveProgress = objective?.measure() ?? 0
    this.outcome = null
  }

  leave() {
    this.active = this.finished = false
    this.objective = null
    this.result = this.outcome = null
    this.impactUntil = -1
  }

  get dropLimit() { return this.objective?.dropLimit ?? 3 }
  get objectiveTarget() { return this.objective?.target ?? 0 }
  get status() {
    const { active, finished, charge, drops, score, seconds, scoring, dropLimit, objectiveProgress, objectiveTarget, outcome } = this
    return { active, finished, charge, drops, score, seconds: Math.ceil(seconds), scoring, dropLimit, objectiveProgress, objectiveTarget, outcome }
  }

  private finish(outcome: RaveOutcome) {
    this.active = false
    this.finished = true
    this.outcome = outcome
  }

  get scoring() { return this.clock < this.impactUntil }

  tick(dt: number, energy: number) {
    if (!this.active) return
    const wasScoring = this.scoring
    this.clock += dt
    if (this.drops < this.dropLimit) {
      this.seconds = Math.max(0, this.seconds - dt)
      if (!this.scoring) {
        const available = wasScoring ? this.clock - this.impactUntil : dt
        this.charge = Math.min(1, this.charge + available * energy / (this.objective?.chargeSeconds ?? 6))
      }
    }
    if (wasScoring && !this.scoring && this.objective) {
      this.objectiveProgress = this.objective.measure()
      const reached = this.objectiveProgress >= this.objective.target
      if (this.objective.cumulative && reached) { this.finish('cleared'); return }
      if (!reached && (!this.objective.cumulative || this.drops === this.dropLimit)) { this.finish('failed'); return }
    }
    if (!this.scoring) {
      if (this.drops === this.dropLimit) this.finish('cleared')
      else if (this.seconds === 0) this.finish('timeout')
    }
  }

  /** Fires a drop if charged. `offset` is seconds from the nearest beat. */
  drop(offset: number, census: Census) {
    if (!this.active || this.scoring || this.charge < 1 || this.drops >= this.dropLimit || this.seconds === 0) return null
    this.objective?.beforeDrop?.()
    this.charge = 0
    this.drops++
    this.baseline = { ...census }
    this.peakAir = census.airborne
    this.impactUntil = this.clock + (this.objective?.impactSeconds ?? IMPACT_SECONDS)
    this.banked = this.score
    this.result = { grade: gradeTiming(offset), points: 0, drop: this.drops }
    this.observe(census)
    return this.result
  }

  applyDropEffects() { this.objective?.afterDrop?.(this.drops) }

  observeObjective() {
    if (this.active && this.objective) this.objectiveProgress = this.objective.measure()
  }

  /** Call a few times a second; while a drop is being scored, its points climb with the damage. */
  observe(census: Census) {
    if (!this.result || !this.baseline || this.clock > this.impactUntil + .01) return
    const b = this.baseline
    this.peakAir = Math.max(this.peakAir, census.airborne)
    const impact =
      Math.max(0, b.bricks - census.bricks) * 2 +
      Math.max(0, census.gravel - b.gravel) +
      Math.max(0, b.bombs - census.bombs) * 150 +
      Math.max(0, census.flowers - b.flowers) * 4 +
      Math.max(0, this.peakAir - b.airborne) * .25
    const scale = REFERENCE_CELLS / (census.cells ?? REFERENCE_CELLS)
    this.result.points = Math.round((BASE_POINTS + impact * scale) * this.result.grade.multiplier)
    this.score = this.banked + this.result.points
  }
}
