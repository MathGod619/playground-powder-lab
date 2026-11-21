import test from 'node:test'
import assert from 'node:assert/strict'
import { automaticDrops, MusicEnvelope, RaveSession } from '../src/immersion.ts'
import { World } from '../src/world.ts'
import { buildScene } from '../src/scenes.ts'

test('Tab never fires automatic drops; a challenge requires manual drops on every source', () => {
  assert.equal(automaticDrops('tab', false), false)
  for (const source of ['tab', 'mic', 'file', 'demo']) assert.equal(automaticDrops(source, true), false)
  assert.equal(automaticDrops('file', false), true)
  assert.equal(automaticDrops('demo', false), true)
})

test('music envelopes rise promptly, decay smoothly and are independent of frame rate', () => {
  const a = new MusicEnvelope(), b = new MusicEnvelope()
  const signal = { bass: .6, mid: .4, treble: .2 }
  for (let i = 0; i < 60; i++) a.update(signal, 1 / 60)
  for (let i = 0; i < 30; i++) b.update(signal, 1 / 30)
  assert.ok(Math.abs(a.value.level - b.value.level) < .00001)
  assert.ok(a.value.bass > .9)
  a.update({ bass: 0, mid: 0, treble: 0 }, .1)
  assert.ok(a.value.bass > .5)
  for (let i = 0; i < 240; i++) a.update({ bass: 0, mid: 0, treble: 0 }, 1 / 60)
  assert.ok(a.value.level < .001)
})

test('Rave requires three fully charged manual drops and stops scoring after completion', () => {
  const s = new RaveSession()
  s.start(0, 2, 100)
  assert.equal(s.drop(), false)
  s.tick(6, 0)
  assert.equal(s.charge, 0, 'silence earns no charge')
  s.observe(100, 4, 90)
  assert.equal(s.score, 154)
  for (let i = 0; i < 3; i++) {
    s.tick(6, 1)
    assert.equal(s.drop(), true)
    assert.equal(s.drop(), false)
  }
  assert.equal(s.drops, 3)
  assert.equal(s.finished, true)
  assert.equal(s.active, false)
  const final = s.score
  s.observe(2000, 200, 0)
  assert.equal(s.score, final)
})

test('Rave timeout ends the round and restart resets charge, timer and score', () => {
  const s = new RaveSession()
  s.start(0, 0, 0)
  s.tick(91, 1)
  assert.equal(s.finished, true)
  assert.equal(s.drop(), false)
  s.start(0, 0, 0)
  assert.equal(s.seconds, 90)
  assert.equal(s.charge, 0)
  assert.equal(s.score, 0)
})

test('every world survives its extended drop sequence with bounded particles', () => {
  for (const id of ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank']) {
    const w = new World(120, 80)
    buildScene(w, id)
    w.setEnergy({ bass: .7, mid: .4, treble: .5, level: .6 }, .1)
    w.drop()
    for (let i = 0; i < 190; i++) w.step()
    assert.equal(w.dropTicks, 0, id)
    assert.ok(w.particles <= 12000, id)
    for (let i = 0; i < w.particles; i++) assert.ok(Number.isFinite(w.px[i]) && Number.isFinite(w.py[i]), id)
  }
})
