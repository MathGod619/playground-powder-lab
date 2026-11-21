import assert from 'node:assert/strict'
import { test } from 'node:test'
import { World } from '../src/world.ts'
import { M, ERASE } from '../src/materials.ts'
import { buildScene, gridFor } from '../src/scenes.ts'
import { decodeWorld, encodeWorld } from '../src/save.ts'

function seeded(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const make = (w, h) => new World(w, h, seeded(7))
const floor = world => { for (let x = 0; x < world.width; x++) world.set(x, world.height - 1, M.Wall) }
const run = (world, n) => { for (let k = 0; k < n; k++) world.step() }
const settle = world => { run(world, 600); assert.equal(world.particles, 0, 'everything thrown should land') }

test('sand falls and piles on a wall', () => {
  const world = make(12, 10)
  floor(world)
  world.set(6, 2, M.Sand)
  world.step()
  assert.equal(world.at(6, 3), M.Sand)
  run(world, 20)
  assert.equal(world.at(6, 8), M.Sand)
})

test('sand sinks below water, oil floats on water', () => {
  const world = make(6, 12)
  floor(world)
  for (let x = 0; x < 6; x++) { world.set(x, 1, M.Oil); world.set(x, 5, M.Water); world.set(x, 6, M.Water) }
  world.set(3, 0, M.Sand)
  run(world, 80)
  assert.equal(world.at(3, 10), M.Sand)
  const rows = y => [...Array(6).keys()].map(x => world.at(x, y))
  assert.ok(rows(9).every(t => t === M.Water || t === M.Sand))
  assert.ok(rows(8).filter(t => t === M.Oil).length >= 5, 'oil sits on top of the water')
})

test('lava meeting water makes obsidian and steam', () => {
  const world = make(10, 6)
  floor(world)
  world.set(4, 4, M.Lava)
  world.set(5, 4, M.Water)
  world.step()
  assert.equal(world.at(4, 4), M.Wall)
  assert.equal(world.count(M.Lava), 0)
  assert.ok(world.count(M.Smoke) >= 1)
})

test('fire spreads through oil and burns out', () => {
  const world = make(20, 6)
  floor(world)
  for (let x = 0; x < 20; x++) world.set(x, 4, M.Oil)
  world.set(0, 4, M.Fire)
  run(world, 400)
  assert.ok(world.count(M.Oil) <= 5, `most of the oil burned (${world.count(M.Oil)} left)`)
  run(world, 600)
  assert.equal(world.count(M.Fire), 0)
})

test('a kick throws the surface of a pile into the air and it all lands again', () => {
  const world = make(60, 40)
  floor(world)
  for (let y = 30; y < 39; y++) for (let x = 10; x < 50; x++) world.set(x, y, M.Sand)
  const before = world.count(M.Sand)
  world.kickHop(1)
  assert.ok(world.particles > 5, 'some sand is airborne')
  const surface = [...Array(40).keys()].filter(x => world.at(x + 10, 30) === M.Empty).length
  assert.ok(surface > 0, 'only the exposed top layer jumps')
  assert.equal(world.at(20, 31), M.Sand, 'buried sand stays put')
  settle(world)
  assert.equal(world.count(M.Sand), before, 'no sand is created or lost')
})

test('speakers blast nearby loose cells but never walls', () => {
  const world = make(80, 50)
  floor(world)
  for (let y = 40; y < 49; y++) for (let x = 0; x < 80; x++) world.set(x, y, M.Sand)
  for (let y = 30; y < 40; y++) for (let x = 36; x < 44; x++) world.set(x, y, M.Speaker)
  const sand = world.count(M.Sand), walls = world.count(M.Wall)
  assert.equal(world.speakers().length >= 1, true)
  world.speakerKick(1)
  assert.ok(world.particles > 50, 'speaker launched sand')
  assert.ok(world.rings.length >= 1, 'shockwave ring drawn')
  settle(world)
  assert.equal(world.count(M.Sand), sand)
  assert.equal(world.count(M.Wall), walls)
  assert.equal(world.count(M.Speaker), 80)
})

test('reactions at zero turn a kick off', () => {
  const world = make(40, 30)
  floor(world)
  for (let x = 0; x < 40; x++) world.set(x, 28, M.Sand)
  world.onKick(1, { kick: 0, speakers: 0, sparks: 0, slosh: 0 })
  assert.equal(world.particles, 0)
  assert.equal(world.beats, 1)
})

test('seeds grow one step per beat and flower on the drop', () => {
  const world = make(20, 40)
  floor(world)
  world.set(10, 38, M.Plant, 30)
  for (let n = 0; n < 5; n++) world.growPlants(false)
  assert.equal(world.count(M.Plant) >= 6, true)
  world.growPlants(true)
  assert.ok(world.count(M.Flower) >= 1)
  assert.equal([...world.life].some((l, i) => world.type[i] === M.Plant && l > 0), false, 'no tips left after blooming')
})

test('rockets rise and burst into sparks and glitter', () => {
  const world = make(40, 60)
  floor(world)
  world.set(20, 58, M.Rocket, 10)
  run(world, 12)
  assert.equal(world.count(M.Rocket), 0)
  assert.ok(world.particles > 40)
  run(world, 400)
  assert.ok(world.count(M.Glitter) > 10, 'glitter rains down and settles')
})

test('the drop blooms plants and queues fireworks', () => {
  const world = make(60, 40)
  buildScene(world, 'blank')
  world.set(10, 30, M.Plant, 20)
  world.drop()
  assert.ok(world.count(M.Flower) >= 1)
  assert.equal(world.bursts.length, 8)
  assert.equal(world.pulse.flash, 1)
  run(world, 80)
  assert.equal(world.bursts.length, 0)
})

test('volcano erupts lava out of the crater on bass', () => {
  const world = make(120, 80)
  buildScene(world, 'volcano')
  world.erupt(1)
  assert.ok(world.particles > 20)
  assert.ok([...world.pType.subarray(0, world.particles)].every(t => t === M.Lava))
})

test('painting respects walls and erasing clears', () => {
  const world = make(20, 20)
  world.paint(10, 10, 3, M.Wall)
  const walls = world.count(M.Wall)
  assert.ok(walls > 20)
  world.paint(10, 10, 3, M.Sand)
  assert.equal(world.count(M.Wall), walls, 'sand never overwrites walls')
  world.paint(10, 10, 5, ERASE)
  assert.equal(world.count(M.Wall), 0)
})

test('every scene builds at every grid size', () => {
  for (const size of ['small', 'medium', 'large']) {
    const { width, height } = gridFor(1440, 900, size)
    for (const id of ['garden', 'volcano', 'blank']) {
      const world = new World(width, height, seeded(3))
      buildScene(world, id)
      assert.equal(world.scene, id)
      assert.ok(world.count(M.Wall) > 0)
      run(world, 3)
    }
  }
})

test('save round-trips cells, colours and airborne particles', () => {
  const world = make(50, 30)
  buildScene(world, 'garden')
  world.kickHop(1)
  const airborne = world.particles
  assert.ok(airborne > 0)
  const total = world.count(M.Sand) + world.count(M.Glitter)
  const copy = decodeWorld(encodeWorld(world))
  assert.equal(copy.width, 50)
  assert.equal(copy.scene, 'garden')
  assert.ok(copy.count(M.Sand) + copy.count(M.Glitter) >= total - airborne * .2, 'airborne sand is written back')
  const i = world.type.findIndex(t => t === M.Glitter)
  assert.equal(copy.color[i], world.color[i])
  assert.throws(() => decodeWorld('{"format":"nope"}'), /not a Powder Rave world/)
  assert.throws(() => decodeWorld('not json'), /not a Powder Rave world/)
})
