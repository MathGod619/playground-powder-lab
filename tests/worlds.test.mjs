import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceBeat, defaultSettings, newClock } from '../src/beat.ts'
import { clampCamera, fitCamera, zoomAt } from '../src/camera.ts'
import { HEIGHT, Sandbox, WIDTH } from '../src/engine.ts'
import { Material as M } from '../src/materials.ts'
import { decodeSession, encodeSession } from '../src/session.ts'
import { makeWorld, shockOrigin, WORLDS, WORLD_SIZES } from '../src/worlds.ts'

const step = (world, n) => { while (n-- > 0) world.step() }

test('the four templates generate editable cells at all supported scales', () => {
  for (const size of WORLD_SIZES) {
    for (const { id } of WORLDS) {
      const world = new Sandbox(size.width, size.height)
      makeWorld(world, id)
      assert.equal(world.template, id)
      assert.ok(world.occupied > 0)
      assert.ok(world.cells.includes(M.Empty))
      assert.ok(world.cells.includes(M.Stone))
      const firstStone = world.cells.indexOf(M.Stone)
      world.stamp({ x: firstStone % world.width, y: Math.floor(firstStone / world.width) }, 3, M.Empty)
      assert.equal(world.cells[firstStone], M.Empty)
    }
  }
})

test('a bass hit erupts lava above the Volcano crater, and covering the vent stops it', () => {
  const world = new Sandbox(832, 464)
  makeWorld(world, 'volcano')
  const vent = shockOrigin(world)
  const crater = () => world.cells.subarray(0, vent.y * world.width).filter(value => value === M.Lava).length
  assert.equal(crater(), 0)
  world.shock(1)
  step(world, 8)
  assert.ok(crater() > 10)
  assert.ok(world.lift.some(lift => lift > 0))
  makeWorld(world, 'volcano')
  for (let x = vent.x - 10; x <= vent.x + 10; x++) world.set(x, vent.y + 6, M.Stone)
  world.shock(1)
  assert.equal(crater(), 0)
})

test('the world profiles give Ocean, City and Sandstorm their own force behavior', () => {
  const ocean = new Sandbox(128, 96)
  ocean.template = 'ocean'
  ocean.set(60, 38, M.Smoke, 200)
  ocean.set(60, 78, M.Smoke, 200)
  ocean.gust(1, 1)
  step(ocean, 12)
  const smoke = ocean.cells.map((id, i) => id === M.Smoke ? i % ocean.width : 0).filter(x => x > 0)
  assert.equal(smoke.length, 2)
  assert.ok(smoke[0] > 60 && smoke[1] < 60)
  assert.ok(shockOrigin(ocean).y > ocean.height * .7)

  const city = new Sandbox()
  makeWorld(city, 'city')
  city.sparks(.8)
  assert.ok(city.cells.filter(id => id === M.Electricity).length > 35)

  const dunes = new Sandbox()
  makeWorld(dunes, 'dunes')
  dunes.shock(.4)
  assert.equal(dunes.wind, null)
  dunes.shock(.9)
  assert.ok(dunes.wind && dunes.wind.strength === .9)
})

test('settled regions sleep and editing or a pulse wakes neighboring particles', () => {
  const world = new Sandbox(128, 96)
  for (let x = 0; x < 128; x++) world.set(x, 63, M.Stone)
  world.set(63, 62, M.Sand)
  step(world, 10)
  assert.equal(world.runningRegions, 0)
  for (let x = 62; x <= 65; x++) world.set(x, 63, M.Empty)
  step(world, 5)
  assert.equal(world.cells[world.index(63, 67)], M.Sand)

  const dune = new Sandbox()
  for (let x = 0; x < dune.width; x++) {
    dune.set(x, 183, M.Stone)
    dune.set(x, 182, M.Sand)
  }
  step(dune, 4)
  assert.equal(dune.runningRegions, 0)
  dune.shock(1)
  step(dune, 8)
  assert.ok(dune.lift.some(value => value > 0))
})

test('camera zoom preserves the anchored point and clamps pans to the world', () => {
  const world = new Sandbox(832, 464)
  const original = fitCamera(world)
  assert.equal(original.zoom, .5)
  const pointer = { x: WIDTH * .7, y: HEIGHT * .2 }
  const enlarged = zoomAt(world, original, 1, pointer)
  assert.equal(enlarged.x + pointer.x / enlarged.zoom, pointer.x / original.zoom)
  assert.equal(enlarged.y + pointer.y / enlarged.zoom, pointer.y / original.zoom)
  assert.deepEqual(clampCamera(world, {x: -99, y: 999, zoom: 1}), {x: 0, y: 232, zoom: 1})
})

test('a large modified world round-trips camera, intensity and sleeping regions', () => {
  const world = new Sandbox(832, 464)
  makeWorld(world, 'volcano')
  const settings = { ...defaultSettings, intensity: 140 }
  const camera = { x: 72, y: 90, zoom: 1.2 }
  const clock = newClock()
  for (let i = 0; i < 39; i++) {
    advanceBeat(clock, settings, world)
    world.step()
  }
  const encoded = encodeSession(world, clock, settings, camera)
  const decoded = decodeSession(encoded)
  assert.equal(decoded.world.template, 'volcano')
  assert.deepEqual(decoded.camera, camera)
  assert.deepEqual(decoded.world.regionState, world.regionState)
  for (let i = 0; i < 11; i++) {
    for (const [field, time] of [[world, clock], [decoded.world, decoded.clock]]) {
      advanceBeat(time, settings, field)
      field.step()
    }
  }
  assert.equal(encodeSession(decoded.world, decoded.clock, decoded.settings, decoded.camera), encodeSession(world, clock, settings, camera))
})
