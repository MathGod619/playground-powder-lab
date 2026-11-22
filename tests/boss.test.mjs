import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bossBlast, chomp, OPEN_FRAMES } from '../src/boss.ts'
import { RaveSession } from '../src/immersion.ts'
import { BOMB_FIXED, M } from '../src/materials.ts'
import { prepareChallenge } from '../src/rave-challenges.ts'
import { buildScene } from '../src/scenes.ts'
import { World } from '../src/world.ts'

function arena() {
  let s = 11
  const world = new World(300, 190, () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1 >>> 0) / 4294967296))
  buildScene(world, 'blank')
  const challenge = prepareChallenge('boss', world)
  return { world, challenge, boss: world.boss }
}

const census = { bricks: 0, gravel: 0, bombs: 0, flowers: 0, airborne: 0, cells: 57000 }

test('the boss stands on the raised arena floor at full health', () => {
  const { world, boss } = arena()
  assert.equal(boss.hp, 100)
  assert.equal(world.at(Math.round(boss.x), boss.floor + 1), M.Wall)
  assert.equal(world.at(Math.round(boss.x), boss.floor), M.Empty)
  assert.ok(boss.floor < world.height * .85, 'clear of the dock')
})

test('the shield blocks blasts until a drop opens it', () => {
  const { world, boss } = arena()
  bossBlast(world, boss.x, boss.floor, 10, 1)
  assert.equal(boss.hp, 100)
  assert.ok(boss.blocked > 0)
  world.drop()
  assert.equal(boss.open, OPEN_FRAMES)
  const opened = boss.hp
  assert.ok(opened < 100, 'the drop itself lands a hit')
  bossBlast(world, boss.x, boss.floor, 10, 1)
  assert.ok(boss.hp < opened - 4)
  for (let k = 0; k < OPEN_FRAMES; k++) world.step()
  assert.equal(boss.open, 0)
})

test('bombs planted beside it and set off by the drop do real damage, more on the beat', () => {
  const hits = [1, 2].map(multiplier => {
    const { world, boss } = arena()
    for (const dx of [-12, -5, 5, 12]) world.placeBomb(Math.round(boss.x + dx), boss.floor, true)
    boss.multiplier = multiplier
    world.drop()
    for (let k = 0; k < 120; k++) world.step()
    return 100 - boss.hp
  })
  assert.ok(hits[0] > 15, `off-beat drop hit for ${hits[0]}`)
  assert.ok(hits[0] < 60, 'one off-beat drop cannot win')
  assert.ok(hits[1] > hits[0] * 1.6, 'a perfect drop hits about twice as hard')
})

test('it eats nearby bombs and leaves distant ones', () => {
  const { world, boss } = arena()
  world.placeBomb(Math.round(boss.x - boss.w / 2 - 2), boss.floor, true)
  world.placeBomb(Math.round(boss.x + boss.w), boss.floor, true)
  assert.equal(chomp(world, boss), 1)
  assert.equal(world.bombs().length, 1)
  assert.equal(world.life[world.bombs()[0]], BOMB_FIXED)
})

test('it attacks on every eighth beat, warning before it eats', () => {
  const { world, boss } = arena()
  world.placeBomb(Math.round(boss.x + boss.w / 2 + 1), boss.floor, true)
  for (let beat = 1; beat <= 7; beat++) world.onKick(.6)
  assert.ok(boss.warn > 0, 'mouth glows on beat 7')
  assert.equal(world.bombs().length, 1)
  world.onKick(.6)
  assert.equal(world.bombs().length, 0, 'eaten on beat 8')
  assert.equal(boss.next, 'spit')
})

test('damage adds up across drops; the run is judged after the last one, or cleared on the kill', () => {
  const { world, challenge, boss } = arena()
  const session = new RaveSession()
  session.start(challenge.objective)
  const drop = () => {
    session.charge = 1
    assert.ok(session.drop(0, census))
    world.drop()
    session.tick(5, 0)
  }
  boss.hp = 80
  drop()
  assert.equal(session.finished, false, 'a partial hit does not fail the run')
  boss.hp = 0; boss.dead = true
  drop()
  assert.equal(session.outcome, 'cleared')

  const again = arena(), lose = new RaveSession()
  lose.start(again.challenge.objective)
  for (let k = 0; k < 4; k++) { lose.charge = 1; lose.drop(0, census); again.world.drop(); lose.tick(5, 0) }
  assert.equal(lose.outcome, 'failed')
})
