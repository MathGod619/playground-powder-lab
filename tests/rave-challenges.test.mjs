import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RaveSession } from '../src/immersion.ts'
import { BOMB_FIXED, M } from '../src/materials.ts'
import { prepareChallenge } from '../src/rave-challenges.ts'
import { buildScene, CITY_TOWERS, cityStreet } from '../src/scenes.ts'
import { World } from '../src/world.ts'

function run(mode, width = 170, height = 110) {
  let seed = 23
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  const world = new World(width, height, rng)
  buildScene(world, mode === 'skyline' ? 'city' : 'garden')
  const challenge = prepareChallenge(mode, world)
  const rave = new RaveSession()
  rave.start(challenge.objective)
  function drop() {
    rave.tick(6, 1)
    assert(rave.drop(0, world.census()), 'a charged drop should fire')
    world.drop()
    rave.applyDropEffects()
    assert.equal(rave.drop(0, world.census()), null, 'another player cannot spend the same drop')
    for (let n = 0; n < 310 && rave.scoring; n++) {
      world.step()
      rave.tick(1 / 60, 0)
    }
  }
  return { world, rave, drop }
}

test('six or more rigged towers fall in a single drop', () => {
  const { world, rave, drop } = run('skyline')
  const street = cityStreet(world.height)
  assert.equal(world.count(M.Bomb), 0)
  for (const [left, right, top] of CITY_TOWERS) for (const frac of [.2, .5, .8]) {
    const x = Math.floor(world.width * (left + (right - left) * frac))
    const y = Math.floor(street - .18 * (street - world.height * top))
    assert(world.placeBomb(x, y, true))
    assert.equal(world.life[world.index(x, y)], BOMB_FIXED)
    world.onKick(.5)
    world.step()
    assert.equal(world.at(x, y), M.Bomb, 'the charge stays in position until the drop')
  }
  drop()
  assert.equal(rave.drops, 1)
  assert.equal(rave.outcome, 'cleared')
  assert(rave.objectiveProgress >= 6)
})

test('erasing the skyline before the drop does not count toward the objective', () => {
  const { world, rave, drop } = run('skyline')
  for (let i = 0; i < world.size; i++) if (world.type[i] === M.Brick) world.type[i] = M.Empty
  drop()
  assert.equal(rave.objectiveProgress, 0)
  assert.equal(rave.outcome, 'failed')
})

test('watering the threatened beds protects the roots through all three drops', () => {
  const { world, rave, drop } = run('garden')
  assert.equal(rave.objectiveProgress, 9)
  const y = Math.floor(world.height * .63), spacing = Math.max(4, Math.round(world.width * .026))
  for (let n = 0; n < 3; n++) {
    for (const u of [[.2, .5], [.5, .8], [.2, .8]][n]) for (const dx of [-spacing, 0, spacing]) {
      const x = Math.floor(world.width * u) + dx
      world.set(x + 1, y, M.Water)
    }
    drop()
    assert(rave.objectiveProgress >= 6)
    assert.equal(rave.finished, n === 2)
  }
  assert.equal(rave.outcome, 'cleared')
})

test('an unprotected garden can fail on the first wave', () => {
  const { rave, drop } = run('garden')
  drop()
  assert.equal(rave.outcome, 'failed')
  assert(rave.objectiveProgress < 6)
  assert.equal(rave.drops, 1)
})
