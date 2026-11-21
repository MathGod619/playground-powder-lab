import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Sandbox } from '../src/engine.ts'
import { Material as M, MAX_CHARGE } from '../src/materials.ts'
import { advanceBeat, defaultSettings, newClock } from '../src/beat.ts'
import { makeDemo } from '../src/demo.ts'
import { decodeSession, encodeSession, MAX_FILE_BYTES } from '../src/session.ts'

const at = (world, x, y) => world.cells[world.index(x, y)]
const run = (world, ticks) => { for (let n = 0; n < ticks; n++) world.step() }
const materialCount = (world, material) => world.cells.filter(id => id === material).length

test('sand falls one cell per tick, sinks through water and settles on stone', () => {
  const world = new Sandbox(12, 10)
  for (let x = 0; x < 12; x++) world.set(x, 9, M.Stone)
  world.set(6, 4, M.Sand)
  world.step()
  assert.equal(at(world, 6, 5), M.Sand)
  for (let x = 0; x < 12; x++) for (let y = 6; y < 9; y++) world.set(x, y, M.Water)
  run(world, 10)
  assert.ok(world.cells.slice(8 * 12, 9 * 12).includes(M.Sand))
  assert.equal(materialCount(world, M.Stone), 12)
  assert.equal(materialCount(world, M.Water), 36)
})

test('water spreads on floors without crossing stone and settles beneath oil', () => {
  const world = new Sandbox(16, 10)
  for (let y = 0; y < 10; y++) world.set(8, y, M.Stone)
  for (let x = 0; x < 8; x++) {
    world.set(x, 9, M.Stone)
    world.set(x, 8, M.Oil)
    world.set(x, 7, M.Water)
  }
  run(world, 20)
  for (let x = 0; x < 8; x++) {
    assert.equal(at(world, x, 8), M.Water)
    assert.equal(at(world, x, 7), M.Oil)
  }
  assert.ok(world.cells.every((id, i) => i % 16 < 9 || id === M.Empty))
  const pool = new Sandbox(14, 10)
  for (let x = 0; x < pool.width; x++) pool.set(x, 9, M.Stone)
  pool.set(6, 8, M.Water)
  for (let x = 5; x < 8; x++) pool.set(x, 7, M.Water)
  run(pool, 5)
  assert.equal(pool.cells.slice(8 * 14, 9 * 14).filter(id => id === M.Water).length, 4)
})

test('water quenches fire and turns lava into stone and smoke', () => {
  const world = new Sandbox(10, 6)
  world.set(2, 4, M.Fire)
  world.set(2, 5, M.Water)
  world.set(7, 4, M.Lava)
  world.set(7, 5, M.Water)
  world.step()
  assert.equal(at(world, 2, 4), M.Smoke)
  assert.equal(at(world, 7, 4), M.Stone)
  assert.equal(at(world, 7, 5), M.Smoke)
})

test('sparks conduct through water, ignite oil, and decay', () => {
  const world = new Sandbox(3, 6)
  for (let y = 0; y < 6; y++) {
    world.set(0, y, M.Stone)
    world.set(2, y, M.Stone)
  }
  world.set(1, 0, M.Electricity)
  for (let y = 1; y < 5; y++) world.set(1, y, M.Water)
  world.set(1, 5, M.Stone)
  world.step()
  assert.equal(world.charge[world.index(1, 1)], MAX_CHARGE)
  run(world, 3)
  assert.equal(world.charge[world.index(1, 4)], MAX_CHARGE - 9)
  run(world, 30)
  assert.ok(world.charge.every(value => value === 0))

  world.set(1, 4, M.Oil)
  world.stamp({ x: 1, y: 4 }, 1, M.Electricity)
  assert.equal(at(world, 1, 4), M.Fire)
  assert.equal(at(world, 0, 4), M.Stone)
  assert.equal(at(world, 2, 4), M.Stone)
})

test('smoke rises and expires, and unsupported fire burns into smoke', () => {
  const world = new Sandbox(6, 6)
  world.set(1, 5, M.Smoke, 15)
  world.set(4, 5, M.Fire, 1)
  world.step()
  assert.equal(at(world, 4, 5), M.Smoke)
  run(world, 5)
  assert.ok(world.cells.slice(0, 4 * 6).includes(M.Smoke))
  run(world, 225)
  assert.equal(world.occupied, 0)
})

test('brush clips at edges, fills between pointer samples, and erases stone', () => {
  const world = new Sandbox(20, 20)
  const from = { x: 0, y: 1 }
  const to = { x: 19, y: 1 }
  world.stroke(from, to, 2, M.Stone)
  assert.ok(world.cells.slice(20, 40).every(id => id === M.Stone))
  assert.equal(world.occupied, 80)
  world.stroke(from, to, 2, M.Empty)
  assert.equal(world.occupied, 0)
  assert.ok(world.cells.every(id => id === M.Empty))
})

test('bass physically lifts settled sand and wind advects smoke', () => {
  const baseline = new Sandbox(36, 20)
  const reactive = new Sandbox(36, 20)
  for (const world of [baseline, reactive]) {
    for (let x = 0; x < 36; x++) world.set(x, 18, M.Stone)
    for (let x = 4; x < 32; x++) world.set(x, 17, M.Sand)
  }
  reactive.shock(1)
  run(baseline, 3)
  run(reactive, 3)
  assert.ok(baseline.cells.slice(0, 17 * 36).every(id => id === M.Empty))
  assert.ok(reactive.cells.slice(0, 17 * 36).includes(M.Sand))
  assert.equal(materialCount(reactive, M.Sand), 28)

  const breeze = new Sandbox(100, 40, 17)
  breeze.set(20, 35, M.Smoke)
  breeze.gust(1, 1)
  run(breeze, 18)
  const smoke = breeze.cells.indexOf(M.Smoke)
  assert.ok(smoke >= 0 && smoke % breeze.width > 20)
})

test('the clock respects BPM, sensitivity, independent toggles, and the master switch', () => {
  const world = new Sandbox()
  const clock = newClock()
  const settings = structuredClone(defaultSettings)
  settings.bpm = 120
  settings.bands.bass.sensitivity = 0
  settings.bands.mid.enabled = false
  for (let n = 0; n < 29; n++) advanceBeat(clock, settings, world)
  assert.equal(clock.beat, 0)
  advanceBeat(clock, settings, world)
  assert.equal(clock.beat, 1)
  assert.equal(world.wind, null)
  assert.equal(world.wave, null)
  assert.ok(world.cells.includes(M.Electricity))
  settings.enabled = false
  for (let n = 0; n < 60; n++) advanceBeat(clock, settings, world)
  assert.equal(clock.beat, 1)
  settings.enabled = true
  settings.bands.bass.sensitivity = 100
  for (let n = 0; n < 30; n++) advanceBeat(clock, settings, world)
  assert.equal(clock.beat, 2)
  assert.ok(world.wave?.strength > 0)
  settings.paused = true
  const phase = clock.phase
  advanceBeat(clock, settings, world)
  assert.equal(clock.phase, phase)
})

test('session round-trip preserves particles, transient forces, settings and next simulation steps', () => {
  const world = new Sandbox()
  makeDemo(world)
  const clock = newClock()
  const settings = structuredClone(defaultSettings)
  settings.glow = true
  settings.bpm = 132
  settings.brush = 12
  for (let n = 0; n < 50; n++) {
    advanceBeat(clock, settings, world)
    world.step()
  }
  assert.ok(world.wave && world.wind)
  const saved = encodeSession(world, clock, settings)
  const opened = decodeSession(saved)
  assert.equal(encodeSession(opened.world, opened.clock, opened.settings), saved)
  assert.equal(opened.world.occupied, world.occupied)
  for (let n = 0; n < 45; n++) {
    advanceBeat(clock, settings, world)
    world.step()
    advanceBeat(opened.clock, opened.settings, opened.world)
    opened.world.step()
  }
  assert.equal(encodeSession(opened.world, opened.clock, opened.settings), encodeSession(world, clock, settings))
})

test('session validation rejects legacy files, invalid values, incomplete runs and oversized imports', () => {
  const saved = encodeSession(new Sandbox(), newClock(), defaultSettings)
  for (const corrupt of [
    session => { session.version++ },
    session => { session.world.width++ },
    session => { session.world.cells[0]++ },
    session => { session.world.cells = [1, 0, 0, 0] },
    session => { session.world.cells[1] = 99 },
    session => { session.world.cells[2] = 1 },
    session => { session.clock.phase = 1 },
    session => { session.settings.bpm = '120' },
    session => { session.settings.bands.mid.enabled = 1 },
  ]) {
    const session = JSON.parse(saved)
    corrupt(session)
    assert.throws(() => decodeSession(JSON.stringify(session)))
  }
  assert.throws(() => decodeSession('{"shapes":[],"connections":[]}'), /Phase 1/)
  assert.throws(() => decodeSession('broken'), /JSON/)
  assert.throws(() => decodeSession(' '.repeat(MAX_FILE_BYTES + 1)), /large/)
})
