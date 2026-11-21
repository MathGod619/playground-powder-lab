import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BeatDetector, bandLevels } from '../src/detector.ts'

const FPS = 60
/** Simulated analyser output: a kick is a sharp bass spike that decays over ~10 frames. */
function feed(detector, seconds, { bpm = 124, kicks = true, start = 0 } = {}) {
  const events = []
  const period = 60 / bpm
  for (let f = 0; f < seconds * FPS; f++) {
    const time = start + f / FPS
    const phase = (time % period) / period
    const bass = kicks ? .2 + .7 * Math.max(0, 1 - phase * 6) : .15
    const treble = (time * 4 % 1) < .05 ? .4 : .05
    events.push({ time, ...detector.update({ bass, mid: .2, treble }, time) })
  }
  return events
}

test('finds kicks on a steady four-on-the-floor and estimates BPM', () => {
  const detector = new BeatDetector()
  const events = feed(detector, 8)
  const kicks = events.filter(e => e.kick)
  assert.ok(kicks.length >= 14 && kicks.length <= 18, `got ${kicks.length} kicks`)
  assert.ok(Math.abs(detector.bpm - 124) <= 3, `bpm ${detector.bpm}`)
  assert.equal(events.some(e => e.drop), false, 'no drop without a breakdown')
  assert.ok(events.some(e => e.hat), 'treble hits are reported')
})

test('calls a drop when the kick returns after a breakdown, once', () => {
  const detector = new BeatDetector()
  feed(detector, 6)
  feed(detector, 4, { kicks: false, start: 6 })
  const after = feed(detector, 4, { start: 10 })
  assert.equal(after.filter(e => e.drop).length, 1)
  assert.ok(after.find(e => e.drop).time < 10.2, 'drop lands on the first kick back')
})

test('a slow start is not mistaken for a drop', () => {
  const detector = new BeatDetector()
  feed(detector, 3, { kicks: false })
  const events = feed(detector, 4, { start: 3 })
  assert.equal(events.some(e => e.drop), false)
})

test('reset forgets the groove', () => {
  const detector = new BeatDetector()
  feed(detector, 5)
  detector.reset()
  assert.equal(detector.bpm, 0)
  assert.equal(detector.grooving, false)
})

test('band levels read the right bins', () => {
  const spectrum = new Uint8Array(1024)
  const hz = 48000 / 2048
  for (let i = Math.floor(30 / hz); i <= Math.floor(95 / hz); i++) spectrum[i] = 255
  const bands = bandLevels(spectrum, 48000, 2048)
  assert.ok(bands.bass > .9)
  assert.equal(bands.mid, 0)
  assert.equal(bands.treble, 0)
})

test('a breakdown is announced once, before the drop', () => {
  const detector = new BeatDetector()
  feed(detector, 6)
  const quiet = feed(detector, 4, { kicks: false, start: 6 })
  assert.equal(quiet.filter(e => e.breakdown).length, 1)
  assert.ok(quiet.find(e => e.breakdown).time < 8.2)
})
