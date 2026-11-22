import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BODY, crowdDrop, crowdKick, spawnCrowd, surface } from '../src/crowd.ts'
import { cloneWorld } from '../src/director-world.ts'
import { M } from '../src/materials.ts'
import { buildScene } from '../src/scenes.ts'
import { World } from '../src/world.ts'

function seeded(seed = 7) {
  let s = seed
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1 >>> 0) / 4294967296)
}

function floorWorld(width = 120, height = 60) {
  const world = new World(width, height, seeded())
  for (let x = 0; x < width; x++) for (let y = height - 5; y < height; y++) world.set(x, y, M.Wall)
  return world
}

const run = (world, frames) => { for (let k = 0; k < frames; k++) world.step() }

test('ravers spawn standing on safe ground and stay on the map', () => {
  const world = floorWorld()
  assert.ok(spawnCrowd(world) >= 5)
  for (const r of world.ravers) assert.equal(r.y, world.height - 6)
  run(world, 600)
  for (const r of world.ravers) {
    assert.notEqual(r.mode, 'gone')
    assert.ok(r.x >= 1 && r.x <= world.width - 2)
    assert.equal(r.mode, 'ground')
  }
})

test('every world gets a crowd that settles instead of hovering', () => {
  for (const scene of ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank']) {
    const world = new World(300, 190, seeded(3))
    buildScene(world, scene)
    assert.ok(spawnCrowd(world) >= 5, `${scene} spawns a crowd`)
    run(world, 900)
    const settled = world.ravers.filter(r => r.mode === 'ground' || r.mode === 'swim').length
    assert.ok(settled >= world.ravers.length * .7, `${scene}: ${settled} of ${world.ravers.length} settled`)
  }
})

test('nobody spawns in lava, fire or water', () => {
  const world = floorWorld()
  for (let x = 0; x < 40; x++) world.set(x, world.height - 6, M.Lava)
  for (let x = 40; x < 80; x++) world.set(x, world.height - 6, M.Water)
  assert.equal(surface(world, 10), -1)
  assert.equal(surface(world, 60), -1)
  spawnCrowd(world, 12)
  for (const r of world.ravers) assert.ok(r.x >= 80, `spawned at ${r.x}`)
})

test('kicks bob the crowd and the drop makes everyone jump and cheer', () => {
  const world = floorWorld()
  spawnCrowd(world)
  crowdKick(world, 1)
  assert.ok(world.ravers.every(r => r.bob > 0))
  run(world, 200)
  crowdDrop(world)
  assert.ok(world.ravers.every(r => r.cheer > 0 && r.mode === 'air'))
  run(world, 300)
  assert.ok(world.ravers.every(r => r.mode === 'ground'))
})

test('a blast throws nearby ravers instead of burning them in place', () => {
  const world = floorWorld()
  spawnCrowd(world, 1)
  const raver = world.ravers[0], x0 = raver.x
  world.blast(raver.x + 3, raver.y - 2, 10, 1.2, true)
  assert.equal(raver.mode, 'air')
  run(world, 6)
  assert.notEqual(raver.mode, 'gone')
  assert.ok(raver.x < x0 - 2, 'thrown away from the blast')
  run(world, 400)
  assert.equal(raver.mode, 'ground')
})

test('a buried raver climbs out and lava sends one away to walk back in later', () => {
  const world = floorWorld()
  spawnCrowd(world, 1)
  const raver = world.ravers[0]
  for (let y = raver.y - BODY - 3; y <= raver.y; y++) for (let x = raver.x - 8; x <= raver.x + 8; x++) world.set(Math.round(x), y, M.Wall)
  run(world, 30)
  assert.ok(raver.y < world.height - 6 - BODY, 'climbed on top of the wall')

  const hot = floorWorld()
  spawnCrowd(hot, 1)
  const victim = hot.ravers[0]
  hot.set(Math.round(victim.x), victim.y - 2, M.Lava)
  run(hot, 1)
  assert.equal(victim.mode, 'gone')
  run(hot, 400)
  assert.equal(victim.mode, 'ground')
})

test('the crowd survives cloning for drop retries', () => {
  const world = floorWorld()
  spawnCrowd(world)
  const copy = cloneWorld(world)
  assert.equal(copy.ravers.length, world.ravers.length)
  copy.ravers[0].x += 5
  assert.notEqual(copy.ravers[0].x, world.ravers[0].x)
  run(copy, 10)
})
