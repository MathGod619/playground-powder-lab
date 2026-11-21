import { bands, type Band } from './beat.ts'

export type BandValues = Record<Band, number>
export const zeroBands = (): BandValues => ({ bass: 0, mid: 0, treble: 0 })

const LIMITS: Record<Band, [number, number]> = {
  bass: [40, 175],
  mid: [175, 2500],
  treble: [2500, 11000],
}
const COOLDOWN: BandValues = { bass: 0.13, mid: 0.19, treble: 0.09 }
export const BAR_COUNT = 24
const toLevel = (db: number) => Math.max(0, Math.min(1, (db + 66) / 53))

export class Spectrum {
  readonly levels = zeroBands()
  readonly bars = new Float32Array(BAR_COUNT)
  private bandBins: Record<Band, [number, number]>
  private barBins: [number, number][]

  constructor(sampleRate: number, fftSize: number) {
    const binHz = sampleRate / fftSize
    const toBins = (low: number, high: number): [number, number] => {
      const first = Math.ceil(low / binHz)
      return [first, Math.min(fftSize / 2, Math.max(first + 1, Math.ceil(high / binHz)))]
    }
    this.bandBins = {
      bass: toBins(...LIMITS.bass),
      mid: toBins(...LIMITS.mid),
      treble: toBins(...LIMITS.treble),
    }
    this.barBins = Array.from({ length: BAR_COUNT }, (_, i) =>
      toBins(44 * 250 ** (i / BAR_COUNT), 44 * 250 ** ((i + 1) / BAR_COUNT)))
  }

  read(spectrum: Float32Array) {
    for (const band of bands) {
      const [first, end] = this.bandBins[band]
      let power = 0
      for (let i = first; i < end; i++) {
        const db = spectrum[i]
        if (db > -90) power += 10 ** (db / 10)
      }
      this.levels[band] = toLevel(10 * Math.log10(power))
    }
    for (let n = 0; n < this.bars.length; n++) {
      const [first, end] = this.barBins[n]
      let peak = -Infinity
      for (let i = first; i < end; i++) peak = Math.max(peak, spectrum[i])
      this.bars[n] = toLevel(peak)
    }
    return this.levels
  }

  clear() {
    for (const band of bands) this.levels[band] = 0
    this.bars.fill(0)
  }
}

export class Onsets {
  readonly hits = zeroBands()
  private baseline = zeroBands()
  private last = zeroBands()
  private lastTrigger = { bass: -Infinity, mid: -Infinity, treble: -Infinity }
  private time: number | undefined

  read(levels: BandValues, seconds: number) {
    const dt = this.time === undefined ? 1 / 60 : Math.max(0, Math.min(0.2, seconds - this.time))
    this.time = seconds
    const adaptation = 1 - Math.exp(-dt / 0.36)
    for (const band of bands) {
      const level = levels[band]
      const rise = level - this.last[band]
      const excess = level - this.baseline[band]
      const triggered = level > 0.13 && rise > 0.023 && excess > 0.052 &&
        seconds - this.lastTrigger[band] >= COOLDOWN[band]
      this.hits[band] = triggered ? Math.min(1, 0.20 + level * 0.39 + excess * 0.85) : 0
      if (triggered) this.lastTrigger[band] = seconds
      this.baseline[band] += excess * adaptation
      this.last[band] = level
    }
    return this.hits
  }

  reset() {
    for (const band of bands) {
      this.hits[band] = 0
      this.baseline[band] = 0
      this.last[band] = 0
      this.lastTrigger[band] = -Infinity
    }
    this.time = undefined
  }
}
