/** Band levels in 0..1 from one analyser frame. */
export type Bands = { bass: number; mid: number; treble: number }
export type BeatEvents = { kick: number; hat: number; drop: boolean }

/** Hz ranges for each band. Bass is kept tight so bass synths don't read as kicks. */
export const BAND_HZ = { bass: [30, 95], mid: [300, 2000], treble: [5000, 13000] } as const

export function bandLevels(spectrum: Uint8Array, sampleRate: number, fftSize: number): Bands {
  const hz = sampleRate / fftSize
  const level = ([lo, hi]: readonly [number, number]) => {
    let sum = 0, n = 0
    for (let i = Math.max(1, lo / hz | 0); i <= Math.min(spectrum.length - 1, hi / hz | 0); i++) { sum += spectrum[i]; n++ }
    return n ? sum / n / 255 : 0
  }
  return { bass: level(BAND_HZ.bass), mid: level(BAND_HZ.mid), treble: level(BAND_HZ.treble) }
}

/**
 * Finds kicks and hi-hats from rising edges in the bass and treble bands, using an
 * adaptive threshold, and calls a DROP when a hard kick lands after a breakdown.
 */
export class BeatDetector {
  sensitivity = 1
  private prevBass = 0
  private prevTreble = 0
  private bassFlux = 0
  private trebleFlux = 0
  private lastKick = -Infinity
  private lastHat = -Infinity
  private lastDrop = -Infinity
  private intervals: number[] = []

  reset() {
    this.prevBass = this.prevTreble = this.bassFlux = this.trebleFlux = 0
    this.lastKick = this.lastHat = this.lastDrop = -Infinity
    this.intervals = []
  }

  /** Median kick spacing as BPM, once a steady beat has been heard. */
  get bpm() {
    if (this.intervals.length < 4) return 0
    const sorted = [...this.intervals].sort((a, b) => a - b)
    return Math.round(60 / sorted[sorted.length >> 1])
  }

  /** True once a steady beat is established, so a breakdown can be told apart from a slow start. */
  get grooving() { return this.intervals.length >= 4 }

  update({ bass, treble }: Bands, time: number): BeatEvents {
    const out: BeatEvents = { kick: 0, hat: 0, drop: false }
    const k = this.sensitivity
    const riseBass = Math.max(0, bass - this.prevBass), riseTreble = Math.max(0, treble - this.prevTreble)
    this.bassFlux = this.bassFlux * .9 + riseBass * .1
    this.trebleFlux = this.trebleFlux * .9 + riseTreble * .1
    this.prevBass = bass
    this.prevTreble = treble

    if (riseBass > Math.max(.05 / k, this.bassFlux * 2.4) && bass > .32 / k && time - this.lastKick > .22) {
      const gap = time - this.lastKick
      if (gap > 1.7 && this.grooving && time - this.lastDrop > 6 && bass > .45 / k) {
        out.drop = true
        this.lastDrop = time
      }
      if (gap > .28 && gap < 1.1) {
        this.intervals.push(gap)
        if (this.intervals.length > 10) this.intervals.shift()
      }
      this.lastKick = time
      out.kick = Math.min(1, Math.max(.3, (bass - .25) * 1.6))
    }
    if (riseTreble > Math.max(.03 / k, this.trebleFlux * 2.6) && treble > .08 / k && time - this.lastHat > .09) {
      this.lastHat = time
      out.hat = Math.min(1, treble * 3)
    }
    return out
  }
}
