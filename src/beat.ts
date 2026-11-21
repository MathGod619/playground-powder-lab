import { HZ, type Sandbox } from './engine.ts'

export const MIN_BPM = 45
export const MAX_BPM = 200
export const bands = ['bass', 'mid', 'treble'] as const
export type Band = typeof bands[number]
export type Settings = {
  bpm: number
  enabled: boolean
  paused: boolean
  glow: boolean
  grid: boolean
  fx: boolean
  brush: number
  material: number
  bands: Record<Band, { enabled: boolean; sensitivity: number }>
}

export const defaultSettings: Settings = {
  bpm: 108,
  enabled: true,
  paused: false,
  glow: false,
  grid: true,
  fx: true,
  brush: 5,
  material: 1,
  bands: {
    bass: { enabled: true, sensitivity: 72 },
    mid: { enabled: true, sensitivity: 55 },
    treble: { enabled: true, sensitivity: 42 },
  },
}

export type Clock = { beat: number; phase: number }
export const newClock = (): Clock => ({ beat: 0, phase: 0 })

function strength(settings: Settings, band: Band) {
  const control = settings.bands[band]
  return control.enabled ? control.sensitivity / 100 : 0
}

export function applyAudioHits(
  settings: Settings, world: Sandbox, hits: Record<Band, number>, windDirection: -1 | 1,
) {
  if (!settings.enabled || settings.paused) return false
  const bass = hits.bass * strength(settings, 'bass')
  world.shock(bass)
  world.gust(hits.mid * strength(settings, 'mid'), windDirection)
  world.sparks(hits.treble * strength(settings, 'treble'))
  return bass > 0
}

export function advanceBeat(clock: Clock, settings: Settings, world: Sandbox) {
  if (!settings.enabled || settings.paused) return false
  const before = clock.phase
  clock.phase += settings.bpm / (60 * HZ)
  const hit = clock.phase >= 1 - 1e-10
  if (hit) {
    clock.phase = Math.max(0, clock.phase - 1)
    clock.beat = (clock.beat + 1) >>> 0
    world.shock(strength(settings, 'bass') * (clock.beat % 4 === 1 ? 1 : 0.76))
  }
  if (!hit && before < 0.26 && clock.phase >= 0.26) {
    world.gust(strength(settings, 'mid'), clock.beat % 4 < 2 ? 1 : -1)
  }
  if (!hit && before < 0.5 && clock.phase >= 0.5) {
    world.sparks(strength(settings, 'treble'))
  }
  return hit
}
