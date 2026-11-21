import test from 'node:test'
import assert from 'node:assert/strict'
import { automaticDrops, beatOffset, gradeTiming, MusicEnvelope, RaveSession } from '../src/immersion.ts'
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

const calm = { bricks: 100, gravel: 0, flowers: 0, bombs: 2, airborne: 0 }

test('Rave requires three fully charged manual drops, then finishes once the last one is scored', () => {
  const s = new RaveSession()
  s.start()
  assert.equal(s.drop(0, calm), null, 'no charge yet')
  s.tick(6, 0)
  assert.equal(s.charge, 0, 'silence earns no charge')
  for (let i = 0; i < 3; i++) {
    s.tick(6, 1)
    assert.ok(s.drop(0, calm))
    assert.equal(s.drop(0, calm), null, 'charge is spent')
    s.tick(3.1, 0)
  }
  assert.equal(s.drops, 3)
  assert.equal(s.finished, true)
  assert.equal(s.active, false)
})

test('a drop scores for what it does to the world, not for sand the beat throws around', () => {
  const s = new RaveSession()
  s.start()
  s.tick(6, 1)
  s.observe({ ...calm, airborne: 4000 })
  assert.equal(s.score, 0, 'nothing scores between drops')
  s.drop(Infinity, calm)
  assert.equal(s.score, 500, 'a drop that changes nothing is worth the base')
  s.tick(1, 0)
  s.observe({ bricks: 40, gravel: 300, flowers: 10, bombs: 0, airborne: 800 })
  assert.equal(s.score, 500 + 60 * 2 + 300 + 2 * 150 + 10 * 4 + 800 * .25)
  s.tick(3, 0)
  const settled = s.score
  s.observe({ bricks: 0, gravel: 900, flowers: 50, bombs: 0, airborne: 0 })
  assert.equal(s.score, settled, 'damage after the 3-second window does not count')
})

test('impact is normalised by world size so detail settings score alike', () => {
  const run = cells => {
    const s = new RaveSession()
    s.start(); s.tick(6, 1)
    s.drop(Infinity, { ...calm, cells, bricks: cells / 100 })
    s.observe({ ...calm, cells, bricks: 0, gravel: cells / 50 })
    return s.score
  }
  assert.equal(run(45_000), run(180_000))
})

test('on-beat drops multiply their score', () => {
  assert.deepEqual(gradeTiming(.03), { label: 'PERFECT', multiplier: 2 })
  assert.deepEqual(gradeTiming(.1), { label: 'GREAT', multiplier: 1.5 })
  assert.equal(gradeTiming(.2).label, 'OFF BEAT')
  const s = new RaveSession()
  s.start()
  s.tick(6, 1)
  s.drop(.02, calm)
  s.observe({ ...calm, bricks: 50 })
  assert.equal(s.score, (500 + 100) * 2)
})

test('beat offset measures to the nearest beat on either side', () => {
  assert.equal(beatOffset(10, 9.5, .5), 0)
  assert.ok(Math.abs(beatOffset(10.05, 9.5, .5) - .05) < 1e-9, 'just after a beat')
  assert.ok(Math.abs(beatOffset(10.46, 9.5, .5) - .04) < 1e-9, 'just before the next beat')
  assert.equal(beatOffset(10, -Infinity, .5), Infinity)
  assert.equal(beatOffset(10, 9.5, 0), Infinity)
})

test('Rave timeout ends the round and restart resets charge, timer and score', () => {
  const s = new RaveSession()
  s.start()
  s.tick(91, 1)
  assert.equal(s.finished, true)
  assert.equal(s.drop(0, calm), null)
  s.start()
  assert.equal(s.seconds, 90)
  assert.equal(s.charge, 0)
  assert.equal(s.score, 0)
})

test('the world census counts what Rave Mode scores', () => {
  const w = new World(20, 20)
  w.set(1, 1, 17); w.set(2, 2, 15); w.set(3, 3, 12); w.set(4, 4, 14)
  w.addParticle(5, 5, 0, 0, 15, 0, 0)
  assert.deepEqual(w.census(), { bricks: 1, gravel: 2, flowers: 1, bombs: 1, airborne: 1, cells: 400 })
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
