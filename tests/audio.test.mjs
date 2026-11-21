import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAudioHits, defaultSettings, newClock } from '../src/beat.ts'
import { Sandbox } from '../src/engine.ts'
import { Material as M } from '../src/materials.ts'
import { decodeSession, encodeSession } from '../src/session.ts'
import { Onsets, Spectrum } from '../src/signal.ts'

test('FFT bins route to three independent bands and silence clears the spectrum', () => {
  const fftSize = 2048
  const sampleRate = 48000
  const bins = new Float32Array(fftSize / 2)
  const spectrum = new Spectrum(sampleRate, fftSize)
  for (const [frequency, expected] of [[94, 'bass'], [609, 'mid'], [6500, 'treble']]) {
    bins.fill(-Infinity)
    bins[Math.round(frequency * fftSize / sampleRate)] = -20
    const levels = spectrum.read(bins)
    assert.ok(levels[expected] > 0.8)
    assert.ok(Object.entries(levels).every(([band, value]) => band === expected || value === 0))
    assert.ok(spectrum.bars.some(value => value > 0.8))
  }
  bins.fill(-Infinity)
  spectrum.read(bins)
  assert.ok(Object.values(spectrum.levels).every(value => value === 0))
  assert.ok(spectrum.bars.every(value => value === 0))
})

test('onsets detect attacks, ignore steady audio and gate repeated hits', () => {
  const detector = new Onsets()
  const quiet = { bass: 0.05, mid: 0, treble: 0 }
  const kick = { ...quiet, bass: 0.8 }
  assert.equal(detector.read(quiet, 0).bass, 0)
  assert.ok(detector.read(kick, 0.05).bass > 0.5)
  assert.equal(detector.read(kick, 0.067).bass, 0)
  detector.read(quiet, 0.084)
  assert.equal(detector.read(kick, 0.1).bass, 0)
  detector.read(quiet, 0.19)
  assert.ok(detector.read(kick, 0.25).bass > 0.5)
  const steady = { bass: 0, mid: 0, treble: 0.6 }
  assert.ok(detector.read(steady, 0.3).treble > 0)
  for (let i = 1; i < 60; i++) assert.equal(detector.read(steady, 0.3 + i / 60).treble, 0)
})

test('real audio hits respect the master, pause, band toggles, and sensitivity', () => {
  const world = new Sandbox()
  const settings = structuredClone(defaultSettings)
  const hits = { bass: 0.8, mid: 0.5, treble: 1 }
  settings.paused = true
  assert.equal(applyAudioHits(settings, world, hits, -1), false)
  assert.equal(world.wave, null)
  settings.paused = false
  settings.enabled = false
  assert.equal(applyAudioHits(settings, world, hits, -1), false)
  assert.equal(world.wind, null)
  settings.enabled = true
  settings.bands.bass.sensitivity = 50
  settings.bands.mid.enabled = false
  assert.equal(applyAudioHits(settings, world, hits, -1), true)
  assert.equal(world.wave.strength, 0.4)
  assert.equal(world.wind, null)
  assert.ok(world.cells.includes(M.Electricity))
})

test('a bass hit throws water well above its surface and preserves particle mass', () => {
  const world = new Sandbox(56, 36)
  for (let x = 0; x < world.width; x++) {
    world.set(x, 31, M.Stone)
    for (let y = 28; y < 31; y++) world.set(x, y, M.Water)
  }
  world.shock(1)
  let peakY = world.height - 1
  for (let n = 0; n < 19; n++) {
    world.step()
    peakY = Math.min(peakY, Math.floor(world.cells.indexOf(M.Water) / world.width))
  }
  assert.ok(peakY < 23)
  assert.equal(world.occupied, world.width * 4)
  assert.ok(world.cells.slice(31 * world.width, 32 * world.width).every(cell => cell === M.Stone))
})

test('older powder saves open and new saves retain particle lift', () => {
  const world = new Sandbox()
  world.set(10, 10, M.Water)
  const i = world.index(10, 10)
  world.lift[i] = 10
  const saved = encodeSession(world, newClock(), defaultSettings)
  assert.equal(decodeSession(saved).world.lift[i], 10)

  const legacy = JSON.parse(saved)
  legacy.version = 1
  legacy.world.cells = legacy.world.cells.filter((_, i) => (i + 1) % 5 !== 0)
  const imported = decodeSession(JSON.stringify(legacy))
  assert.deepEqual(imported.world.cells, world.cells)
  assert.equal(imported.world.lift[i], 0)
  assert.deepEqual(imported.settings, defaultSettings)
})
