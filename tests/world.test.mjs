import assert from 'node:assert/strict'
import { test } from 'node:test'
import { World } from '../src/world.ts'
import { M, ERASE, BOMB_FUSE, BOMB_DROP_ONLY } from '../src/materials.ts'
import { buildScene, gridFor, SCENE_IDS } from '../src/scenes.ts'
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

test('volcano erupts lava out of the crater on bass and blows its top on the drop', () => {
  const world = make(160, 100)
  buildScene(world, 'volcano')
  world.hooks.kick(world, 1)
  assert.ok(world.particles > 20)
  assert.ok([...world.pType.subarray(0, world.particles)].every(t => t === M.Lava))
  const peakWalls = () => { let n = 0; for (let y = 0; y < world.craterY + 12; y++) for (let x = 60; x < 100; x++) if (world.at(x, y) === M.Wall) n++; return n }
  const before = peakWalls()
  world.drop()
  assert.ok(peakWalls() < before * .6, `the summit is blasted away (${before} → ${peakWalls()})`)
  assert.ok(world.count(M.Gravel) > 50, 'the summit becomes flying rubble')
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
    for (const id of SCENE_IDS) {
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

test('a blast smashes walls into gravel and throws everything clear of the crater', () => {
  const world = make(80, 60)
  floor(world)
  for (let y = 30; y < 59; y++) for (let x = 0; x < 80; x++) world.set(x, y, y < 45 ? M.Sand : M.Wall)
  const sand = world.count(M.Sand)
  world.blast(40, 40, 10, 1.2, true)
  assert.ok(world.count(M.Gravel) > 25, `walls turned to gravel (${world.count(M.Gravel)})`)
  assert.equal(world.at(40, 40), M.Empty, 'the centre is cleared')
  run(world, 600)
  assert.equal(world.particles, 0)
  assert.equal(world.count(M.Sand), sand, 'no sand created or lost')
})

test('blasts without smash leave walls alone', () => {
  const world = make(40, 40)
  for (let y = 20; y < 40; y++) for (let x = 0; x < 40; x++) world.set(x, y, M.Wall)
  const walls = world.count(M.Wall)
  world.blast(20, 22, 6, 1, false)
  assert.equal(world.count(M.Wall), walls)
})

test('bombs count down one beat per kick, show urgency, then go off', () => {
  const world = make(60, 40)
  floor(world)
  for (let y = 30; y < 39; y++) for (let x = 0; x < 60; x++) world.set(x, y, M.Wall)
  world.placeBomb(30, 29)
  assert.equal(world.life[world.index(30, 29)], BOMB_FUSE)
  const react = { kick: 0, speakers: 0, sparks: 0, slosh: 0 }
  for (let n = 0; n < BOMB_FUSE - 1; n++) world.onKick(1, react)
  assert.equal(world.count(M.Bomb), 1)
  assert.equal(world.life[world.index(30, 29)], 1)
  world.onKick(1, react)
  run(world, 3)
  assert.equal(world.count(M.Bomb), 0)
  assert.ok(world.count(M.Gravel) > 10, 'it cratered the floor')
})

test('drop-only bombs ignore kicks but go off on the drop, in a chain', () => {
  const world = make(120, 40)
  floor(world)
  for (const x of [20, 40, 60, 80, 100]) world.set(x, 38, M.Bomb, BOMB_DROP_ONLY)
  for (let n = 0; n < 20; n++) world.onKick(1, { kick: 0, speakers: 0, sparks: 0, slosh: 0 })
  assert.equal(world.count(M.Bomb), 5)
  world.drop()
  run(world, 40)
  assert.equal(world.count(M.Bomb), 0)
})

test('fire next to a bomb sets it off immediately', () => {
  const world = make(40, 30)
  floor(world)
  world.set(20, 28, M.Bomb)
  world.set(21, 28, M.Fire)
  world.step()
  assert.equal(world.count(M.Bomb), 0)
})

test('a gunpowder fuse burns from one end to the other', () => {
  const world = make(120, 20)
  floor(world)
  for (let x = 5; x < 115; x++) world.set(x, 18, M.Gunpowder)
  world.set(4, 18, M.Fire)
  run(world, 200)
  assert.ok(world.count(M.Gunpowder) < 5, `${world.count(M.Gunpowder)} grains left`)
})

test('brick towers collapse after their base is blasted', () => {
  const world = make(60, 80)
  floor(world)
  for (let y = 20; y < 79; y++) for (let x = 25; x < 35; x++) world.set(x, y, M.Brick)
  const bricks = world.count(M.Brick)
  world.blast(30, 76, 7, 1.2, true)
  run(world, 300)
  assert.ok(world.count(M.Brick) < bricks * .25, `tower fell (${world.count(M.Brick)} of ${bricks} bricks standing)`)
  let top = 79
  for (let y = 0; y < 80; y++) if ([...Array(60).keys()].some(x => world.at(x, y) !== M.Empty)) { top = y; break }
  assert.ok(top > 50, 'the rubble pile is far lower than the tower was')
})

test('brick with nothing under it stays put when there is no quake', () => {
  const world = make(30, 30)
  for (let x = 5; x < 25; x++) world.set(x, 10, M.Brick)
  run(world, 100)
  assert.equal(world.count(M.Brick), 20)
})

test('bubbles rise through water and become water again at the surface', () => {
  const world = make(10, 30)
  floor(world)
  for (let y = 10; y < 29; y++) for (let x = 0; x < 10; x++) world.set(x, y, M.Water)
  world.set(5, 27, M.Bubble)
  const fluid = world.count(M.Water) + world.count(M.Bubble)
  run(world, 5)
  const at = world.type.findIndex(t => t === M.Bubble)
  assert.ok(at >= 0 && (at / 10 | 0) < 27 && (at / 10 | 0) > 15, 'it rises steadily, not instantly')
  run(world, 60)
  assert.equal(world.count(M.Bubble), 0)
  assert.equal(world.count(M.Water), fluid)
})

test('clouds rain on hi-hats and lightning strikes from them', () => {
  const world = make(80, 60)
  floor(world)
  for (let y = 5; y < 10; y++) for (let x = 20; x < 60; x++) world.set(x, y, M.Cloud)
  world.onHat(1)
  assert.ok(world.particles > 5, 'raindrops falling')
  assert.ok([...world.pType.subarray(0, world.particles)].includes(M.Water))
  assert.equal(world.strike(), true)
  assert.equal(world.bolts.length, 1)
  assert.ok(world.bolts[0].points.length > 3)
})

test('moon gravity keeps thrown dust in the air much longer', () => {
  const airtime = scene => {
    const world = make(60, 300)
    buildScene(world, 'blank')
    if (scene === 'moon') world.rules = { ...world.rules, gravity: .28 }
    world.addParticle(30, 250, 0, -3, M.Sand, 0, 0)
    let t = 0
    while (world.particles && t < 2000) { world.step(); t++ }
    return t
  }
  assert.ok(airtime('moon') > airtime('earth') * 1.6)
})

test('under the sea, speakers throw sand through water without losing either', () => {
  const world = make(80, 60)
  buildScene(world, 'sea')
  const total = () => world.count(M.Sand) + world.count(M.Water) + world.count(M.Bubble)
  for (let i = 0; i < world.size; i++) if (world.type[i] === M.Lava) world.type[i] = M.Wall
  const before = total()
  world.speakerKick(1)
  assert.ok(world.particles > 10, 'sand launched into the water')
  run(world, 900)
  assert.equal(world.particles, 0)
  assert.ok(Math.abs(total() - before) <= 2, `conserved (${before} → ${total()})`)
})

test('kelp grows through water in the deep sea', () => {
  const world = make(40, 60)
  buildScene(world, 'sea')
  const plants = world.count(M.Plant)
  for (let n = 0; n < 10; n++) world.growPlants(false)
  assert.ok(world.count(M.Plant) > plants + 10)
})

test('city windows flicker on hi-hats and the drop demolishes the skyline', () => {
  const world = make(200, 120)
  buildScene(world, 'city')
  const colors = world.color.slice()
  world.hooks.hat(world, 1)
  assert.ok(world.color.some((c, i) => c !== colors[i]), 'windows changed')
  const bricks = world.count(M.Brick)
  world.drop()
  run(world, 500)
  assert.ok(world.count(M.Brick) < bricks * .7, `${world.count(M.Brick)} of ${bricks} bricks standing`)
})

test('the blast tool and bombs only act where there is room', () => {
  const world = make(30, 30)
  floor(world)
  world.set(10, 10, M.Wall)
  assert.equal(world.placeBomb(10, 10), false)
  assert.equal(world.placeBomb(12, 10), true)
  assert.equal(world.placeBomb(-1, 10), false)
})

test('saves keep the scene rules and vents', () => {
  const world = make(80, 60)
  buildScene(world, 'sea')
  const copy = decodeWorld(encodeWorld(world))
  assert.equal(copy.scene, 'sea')
  assert.equal(copy.rules.throughWater, true)
  assert.equal(copy.marks.length, world.marks.length)
  assert.ok(typeof copy.hooks.kick === 'function')
})

test('a lit bomb holds still so its fuse always finds it', () => {
  const world = make(30, 40)
  floor(world)
  world.set(15, 5, M.Bomb)
  world.schedule(world.index(15, 5), 20)
  run(world, 15)
  assert.equal(world.at(15, 5), M.Bomb, 'it did not fall')
  run(world, 10)
  assert.equal(world.count(M.Bomb), 0, 'and it went off')
})

test('moon speakers sit on the ground, not in the sky', () => {
  const world = make(300, 180)
  buildScene(world, 'moon')
  for (const e of world.speakers()) assert.ok(e.y > world.height * .6, `speaker at y=${e.y | 0}`)
})
