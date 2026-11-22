import assert from 'node:assert/strict'
import { test } from 'node:test'
import { paintBeatBrush } from '../src/beat-brush.ts'
import { BEAT_SAND, BEAT_GLITTER, BEAT_ROCKET, M } from '../src/materials.ts'
import { World } from '../src/world.ts'

test('beat brushes only emit their materials on the corresponding beat', () => {
  const world = new World(35, 30, () => .01)
  const paint = beats => {
    paintBeatBrush(world, 5, 5, 2, BEAT_SAND, beats)
    paintBeatBrush(world, 15, 5, 2, BEAT_GLITTER, beats)
    paintBeatBrush(world, 25, 5, 2, BEAT_ROCKET, beats)
  }
  paint({ kick: false, hat: false, downbeat: false })
  assert.equal(world.count(M.Empty), world.size)
  paint({ kick: true, hat: false, downbeat: false })
  assert(world.count(M.Sand) > 0)
  assert.equal(world.count(M.Glitter), 0)
  assert.equal(world.count(M.Rocket), 0)
  paint({ kick: false, hat: true, downbeat: false })
  assert(world.count(M.Glitter) > 0)
  assert.equal(world.count(M.Rocket), 0)
  paint({ kick: true, hat: false, downbeat: true })
  assert.equal(world.at(25, 5), M.Rocket)
  assert.equal(world.count(M.Rocket), 1)
})

test('a bar rocket leaves occupied and off-screen cells alone', () => {
  const world = new World(10, 10)
  world.set(5, 5, M.Wall)
  const downbeat = { kick: true, hat: false, downbeat: true }
  paintBeatBrush(world, 5, 5, 20, BEAT_ROCKET, downbeat)
  paintBeatBrush(world, -1, 6, 20, BEAT_ROCKET, downbeat)
  assert.equal(world.at(5, 5), M.Wall)
  assert.equal(world.count(M.Rocket), 0)
})
