import type { BeatEvents } from './detector.ts'

/** Everything the world reacts to, worked out ahead of time from a decoded song. */
export type BeatMap = {
  duration: number
  bpm: number
  kicks: { t: number; s: number }[]
  hats: { t: number; s: number }[]
  drops: number[]
}

const HOP = 512

function onePoleLowpass(input: Float32Array, rate: number, cutoff: number) {
  const out = new Float32Array(input.length)
  const a = Math.exp(-2 * Math.PI * cutoff / rate)
  let y = 0
  for (let i = 0; i < input.length; i++) { y = (1 - a) * input[i] + a * y; out[i] = y }
  return out
}

function frameEnergy(signal: Float32Array, frames: number) {
  const out = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const start = f * HOP, end = Math.min(signal.length, start + HOP)
    for (let i = start; i < end; i++) sum += signal[i] * signal[i]
    out[f] = Math.sqrt(sum / Math.max(1, end - start))
  }
  return out
}

function percentile(values: Float32Array, p: number) {
  if (!values.length) return 0
  const sorted = Float32Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/** Peak-picks onsets from an energy envelope using a local adaptive threshold. */
function onsets(energy: Float32Array, rate: number, minGap: number, factor: number, floor: number) {
  const n = energy.length, dt = HOP / rate
  const flux = new Float32Array(n)
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, energy[i] - energy[i - 1])
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + flux[i]
  const half = Math.max(2, Math.round(.4 / dt))
  const fluxTop = percentile(flux, .98), loud = percentile(energy, .95) || 1
  const out: { t: number; s: number }[] = []
  let last = -Infinity
  for (let i = 1; i < n - 1; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i + half + 1)
    const local = (prefix[b] - prefix[a]) / (b - a)
    if (flux[i] < local * factor + fluxTop * .12 || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue
    let peak = 0
    for (let k = i; k < Math.min(n, i + 5); k++) peak = Math.max(peak, energy[k])
    if (peak < loud * floor) continue
    const t = i * dt
    if (t - last < minGap) continue
    last = t
    out.push({ t, s: Math.min(1, Math.max(.3, peak / loud)) })
  }
  return out
}

/**
 * Finds kicks (low band), hi-hats (high band), tempo and drops in a mono signal.
 * A drop is a kick that lands after a breakdown: either a gap of 1.5 s+ with no kick,
 * or two seconds of bass far quieter than the two seconds that follow.
 */
export function analyzeSamples(samples: Float32Array, rate: number): BeatMap {
  const frames = Math.floor(samples.length / HOP), dt = HOP / rate
  const low = frameEnergy(onePoleLowpass(onePoleLowpass(samples, rate, 110), rate, 110), frames)
  const lp = onePoleLowpass(samples, rate, 4000)
  const highSignal = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) highSignal[i] = samples[i] - lp[i]
  const high = frameEnergy(highSignal, frames)

  const kicks = onsets(low, rate, .22, 2.2, .3)
  const hats = onsets(high, rate, .09, 2.5, .25)

  const intervals: number[] = []
  for (let k = 1; k < kicks.length; k++) {
    const gap = kicks[k].t - kicks[k - 1].t
    if (gap > .28 && gap < 1.1) intervals.push(gap)
  }
  intervals.sort((a, b) => a - b)
  let bpm = 0
  if (intervals.length >= 4) {
    // Average the gaps near the median: frame quantisation alternates them around the true value.
    const median = intervals[intervals.length >> 1]
    const near = intervals.filter(g => Math.abs(g - median) < median * .1)
    bpm = Math.round(60 / (near.reduce((a, b) => a + b, 0) / near.length))
  }

  const mean = (from: number, to: number) => {
    const a = Math.max(0, Math.floor(from / dt)), b = Math.min(frames, Math.ceil(to / dt))
    let sum = 0
    for (let i = a; i < b; i++) sum += low[i]
    return b > a ? sum / (b - a) : 0
  }
  let total = 0
  for (let i = 0; i < frames; i++) total += low[i]
  const average = total / Math.max(1, frames)
  const drops: number[] = []
  let heard = 0
  for (let k = 0; k < kicks.length; k++) {
    const t = kicks[k].t, gap = k ? t - kicks[k - 1].t : Infinity
    if (gap < 1.1) heard++
    const before = mean(t - 2, t), after = mean(t, t + 2)
    const breakdown = (gap >= 1.5 && heard >= 4) || (before < after * .45 && t > 4)
    if (breakdown && after > average && t - (drops.at(-1) ?? -Infinity) > 8) drops.push(t)
  }
  return { duration: samples.length / rate, bpm, kicks, hats, drops }
}

/** Mixes an AudioBuffer down to mono. */
export function mono(buffer: { numberOfChannels: number; length: number; getChannelData(c: number): Float32Array }) {
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += data[i] / buffer.numberOfChannels
  }
  return out
}

/** Replays a BeatMap against the song's playback position, handling loops and seeks. */
export class MapPlayer {
  readonly map: BeatMap
  private kick = 0
  private hat = 0
  private drop = 0
  private last = -1

  constructor(map: BeatMap) { this.map = map }

  private seek(t: number) {
    const first = <T>(list: T[], time: (x: T) => number) => {
      let lo = 0, hi = list.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (time(list[mid]) <= t) lo = mid + 1; else hi = mid }
      return lo
    }
    this.kick = first(this.map.kicks, k => k.t)
    this.hat = first(this.map.hats, h => h.t)
    this.drop = first(this.map.drops, d => d)
  }

  update(t: number): BeatEvents {
    const out: BeatEvents = { kick: 0, hat: 0, drop: false, breakdown: false }
    if (t < this.last - .25 || t > this.last + 1) this.seek(t)
    this.last = t
    const { kicks, hats, drops } = this.map
    while (this.kick < kicks.length && kicks[this.kick].t <= t) out.kick = Math.max(out.kick, kicks[this.kick++].s)
    while (this.hat < hats.length && hats[this.hat].t <= t) out.hat = Math.max(out.hat, hats[this.hat++].s)
    while (this.drop < drops.length && drops[this.drop] <= t) { out.drop = true; this.drop++ }
    return out
  }

  /** Seconds until the next drop, or Infinity. */
  untilDrop(t: number) {
    const next = this.map.drops.find(d => d > t)
    return next === undefined ? Infinity : next - t
  }
}
