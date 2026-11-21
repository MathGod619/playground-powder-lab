import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareScene } from '../src/director-world.ts'
import { World } from '../src/world.ts'
import { M } from '../src/materials.ts'
import { EMPTY_ENV, SHAPES, validatePlan } from '../src/director-plan.mjs'
import { SHAPES as TS_SHAPES } from '../src/director-plan.ts'
import { SCENE_RECIPES, getRecipe, withRecipe } from '../src/director-recipes.mjs'
import { encodeWorld, decodeWorld } from '../src/save.ts'

const objectPlan = (shape, material = 'sand', x = .1, y = .1, w = .7, h = .7) => ({
  title: 'Physical object', description: 'Detailed bounded geometry', scene: null, environment: { ...EMPTY_ENV },
  operations: [{ shape, material, x, y, w, h, color: null }],
})
test('shared runtime and TypeScript object catalogs stay in sync', () => assert.deepEqual(SHAPES, TS_SHAPES))
test('objects use structural materials even if the model mistakenly chooses sand', () => {
  for (const [shape, solid] of [['plant', M.Plant], ['rock', M.Wall], ['arch', M.Brick], ['building', M.Brick], ['speaker-stack', M.Speaker]]) {
    const w = prepareScene(new World(160, 100, () => .5), objectPlan(shape))
    assert.equal(w.count(M.Sand), 0, shape)
    assert.ok(w.count(solid) > 10, shape)
    const types = w.type.slice()
    for (let n = 0; n < 180; n++) w.step()
    assert.deepEqual(w.type, types, shape + ' should hold its shape without music or damage')
  }
})
test('aquarium remains contained after five seconds and all three foliage colors survive', () => {
  const w = prepareScene(new World(200, 120, () => .5), getRecipe('aquarium'))
  const plants = w.count(M.Plant), water = w.count(M.Water), bubbles = w.count(M.Bubble)
  assert.ok(plants > 100)
  assert.ok(water > 3000)
  assert.ok(w.speakers().length >= 2)
  const plantColors = new Set([...w.color].filter((_, i) => w.type[i] === M.Plant))
  assert.ok(plantColors.size >= 9, 'three shaded foliage palettes')
  const stationary = w.type.map(t => t === M.Wall || t === M.Plant ? t : 0)
  for (let n = 0; n < 300; n++) w.step()
  assert.equal(w.count(M.Plant), plants)
  assert.equal(w.count(M.Water) + w.count(M.Bubble), water + bubbles)
  for (let i = 0; i < w.size; i++) {
    if (stationary[i]) assert.equal(w.type[i], stationary[i])
    if (w.type[i] === M.Water) assert.ok(i % w.width >= 20 && i % w.width < 180, 'water stays inside tank')
  }
})
test('aquarium plants and loose surfaces react to beats while walls remain in place', () => {
  const w = prepareScene(new World(180, 110, () => .5), getRecipe('aquarium'))
  const plants = w.count(M.Plant), walls = w.count(M.Wall)
  for (let n = 0; n < 8; n++) { w.onKick(.5); for (let k = 0; k < 6; k++) w.step() }
  assert.ok(w.count(M.Plant) > plants, 'tips grow into water')
  assert.equal(w.count(M.Wall), walls)
  assert.ok(w.particles > 0, 'music moves loose cells')
  w.drop()
  assert.ok(w.count(M.Flower) > 0, 'manual drop blooms the plants')
})
test('detailed geometry stays within requested bounding boxes at different grid sizes', () => {
  for (const [width, height] of [[80, 60], [240, 140], [400, 240]]) {
    for (const shape of ['plant', 'rock', 'arch', 'building', 'terrain', 'aquarium', 'speaker-stack']) {
      const w = prepareScene(new World(width, height), objectPlan(shape, 'wall', .2, .2, .5, .5))
      assert.ok(w.type.some(t => t !== M.Empty), shape)
      const x = Math.round(.2 * (width - 1)), y = Math.round(.2 * (height - 1))
      for (let i = 0; i < w.size; i++) if (w.type[i] !== M.Empty) {
        assert.ok(i % width >= x && i % width < x + Math.round(.5 * width), shape + ' x')
        assert.ok((i / width | 0) >= y && (i / width | 0) < y + Math.round(.5 * height), shape + ' y')
      }
    }
  }
})
test('all starters build at portrait and landscape sizes and survive a manual drop', () => {
  for (const { id } of SCENE_RECIPES) for (const [width, height] of [[80, 120], [240, 140]]) {
    const w = prepareScene(new World(width, height, () => .5), getRecipe(id))
    assert.ok(w.count(M.Wall) > 50)
    w.onKick(.6); w.onHat(.4); w.drop()
    for (let n = 0; n < 180; n++) w.step()
    assert.ok(w.particles <= 12000)
    assert.equal(w.type.length, width * height)
  }
})
test('starters are isolated and retained when the model returns only a tiny addition', () => {
  const input = objectPlan('rock'); input.scene = 'blank'; input.environment.hue = 300
  const base = getRecipe('aquarium'), result = withRecipe(input, 'aquarium')
  assert.equal(result.operations.length, base.operations.length + 1)
  assert.equal(result.environment.hue, 300)
  assert.equal(result.environment.slosh, .9)
  result.operations[0].x = .7
  assert.equal(getRecipe('aquarium').operations[0].x, .1)
  assert.equal(input.operations.length, 1)
  assert.throws(() => getRecipe('__proto__'))
  assert.throws(() => withRecipe({ ...input, operations: Array(48).fill(input.operations[0]) }, 'aquarium'))
  validatePlan(base)
})
test('aquarium underwater physics survive save/load and older physics saves still work', () => {
  const original = prepareScene(new World(100, 70), getRecipe('aquarium'))
  const saved = encodeWorld(original), restored = decodeWorld(saved)
  assert.equal(restored.rules.plantsInWater, true)
  assert.equal(restored.rules.throughWater, true)
  assert.deepEqual(restored.type, original.type)
  const old = JSON.parse(saved)
  delete old.physics.plantsInWater; delete old.physics.throughWater
  assert.doesNotThrow(() => decodeWorld(JSON.stringify(old)))
  old.physics.plantsInWater = 'true'
  assert.throws(() => decodeWorld(JSON.stringify(old)), /Invalid world physics/)
})
