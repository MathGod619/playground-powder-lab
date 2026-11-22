import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverCrop, elementFor, fitSize, removeBackground, stampImage } from '../src/image.ts'
import { M } from '../src/materials.ts'
import { World } from '../src/world.ts'
import { pack } from '../src/color.ts'

/** Builds RGBA pixels from a function (x, y) => [r, g, b, a]. */
function pixels(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(fn(x, y), (y * width + x) * 4)
  return { width, height, data }
}
const floor = w => { for (let x = 0; x < w.width; x++) w.set(x, w.height - 1, M.Wall) }
/** A "photo": a red disc on a slightly noisy light-grey backdrop. */
const photo = () => pixels(40, 40, (x, y) => (x - 20) ** 2 + (y - 20) ** 2 < 100
  ? [220, 30, 40, 255]
  : [200 + (x * 7 % 9), 205 + (y * 5 % 7), 210, 255])

test('a statue keeps every pixel colour exactly where it was drawn', () => {
  const world = new World(50, 50)
  const img = pixels(3, 2, (x, y) => [x * 80, y * 100, 50, 255])
  assert.equal(stampImage(world, img, 10, 20, 'statue'), 6)
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    const i = world.index(10 + x, 20 + y)
    assert.equal(world.type[i], M.Brick)
    assert.equal(world.color[i], pack(x * 80, y * 100, 50))
  }
  for (let n = 0; n < 50; n++) world.step()
  assert.equal(world.count(M.Brick), 6, 'statues stand on their own')
})

test('transparent pixels are skipped and the edges of the world clip the stamp', () => {
  const world = new World(20, 20)
  const img = pixels(10, 10, (x, y) => [255, 255, 255, x === 1 && y === 1 ? 0 : 255])
  assert.equal(stampImage(world, img, 15, 15, 'statue'), 5 * 5 - 1, 'only the opaque, on-screen part lands')
  assert.equal(world.at(16, 16), M.Empty, 'the transparent pixel is skipped')
  assert.equal(world.at(19, 19), M.Brick)
})

test('stamping never deletes speakers or bombs', () => {
  const world = new World(10, 10)
  world.set(2, 2, M.Speaker)
  world.set(3, 2, M.Bomb)
  stampImage(world, pixels(10, 10, () => [10, 200, 10, 255]), 0, 0, 'statue')
  assert.equal(world.at(2, 2), M.Speaker)
  assert.equal(world.at(3, 2), M.Bomb)
})

test('background removal cuts the backdrop and keeps the subject', () => {
  const cut = removeBackground(photo())
  const alpha = (x, y) => cut.data[(y * 40 + x) * 4 + 3]
  assert.equal(alpha(0, 0), 0)
  assert.equal(alpha(39, 20), 0)
  assert.equal(alpha(20, 20), 255, 'centre of the disc stays')
  let kept = 0
  for (let i = 3; i < cut.data.length; i += 4) if (cut.data[i]) kept++
  assert.ok(kept > 250 && kept < 330, `about the disc's area remains (${kept})`)
})

test('background removal leaves a picture with no clear backdrop mostly intact', () => {
  const busy = pixels(30, 30, (x, y) => [(x * 37) % 255, (y * 53) % 255, ((x + y) * 29) % 255, 255])
  const cut = removeBackground(busy)
  let kept = 0
  for (let i = 3; i < cut.data.length; i += 4) if (cut.data[i]) kept++
  assert.ok(kept > 900 * .8, `${kept} of 900 kept`)
})

test('a sand painting holds its shape until the first kick, then falls', () => {
  const world = new World(40, 60)
  floor(world)
  stampImage(world, pixels(10, 10, () => [240, 200, 120, 255]), 15, 5, 'sand')
  for (let n = 0; n < 60; n++) world.step()
  assert.equal(world.at(15, 5), M.Sand, 'still hanging in the air')
  world.onKick(.6)
  for (let n = 0; n < 300; n++) world.step()
  assert.equal(world.at(15, 5), M.Empty)
  assert.equal(world.count(M.Sand), 100, 'every grain survives the fall')
  assert.equal([...world.type].findIndex(t => t === M.Sand) > 40 * 40, true, 'it piled at the bottom')
})

test('thrown painting sand is never re-frozen where it lands', () => {
  const world = new World(40, 60)
  floor(world)
  stampImage(world, pixels(8, 8, () => [240, 200, 120, 255]), 15, 40, 'sand')
  world.blast(19, 44, 6, 1, false)
  for (let n = 0; n < 400; n++) world.step()
  for (let i = 0; i < world.size; i++) if (world.type[i] === M.Sand) {
    const below = i + 40
    if (below < world.size && world.type[below] === M.Empty) assert.fail('a grain is floating')
  }
})

test('elements mode turns colours into matching materials', () => {
  assert.equal(elementFor(30, 90, 230), M.Water)
  assert.equal(elementFor(230, 60, 20), M.Lava)
  assert.equal(elementFor(40, 180, 60), M.Plant)
  assert.equal(elementFor(250, 250, 250), M.Cloud)
  assert.equal(elementFor(10, 10, 12), M.Wall)
  assert.equal(elementFor(250, 220, 40), M.Glitter)
  assert.equal(elementFor(190, 160, 110), M.Sand)
  assert.equal(elementFor(224, 172, 140), M.Sand, 'skin tones are sand, not lava')
  const world = new World(20, 20)
  stampImage(world, pixels(2, 1, x => x ? [30, 90, 230, 255] : [40, 180, 60, 255]), 5, 5, 'elements')
  assert.equal(world.at(5, 5), M.Plant)
  assert.equal(world.at(6, 5), M.Water)
  assert.equal(world.color[world.index(6, 5)], pack(30, 90, 230), 'water keeps the picture colour')
})

test('fitSize keeps the aspect ratio', () => {
  assert.deepEqual(fitSize(1600, 900, 160), { width: 160, height: 90 })
  assert.deepEqual(fitSize(300, 600, 50), { width: 50, height: 100 })
  assert.equal(fitSize(10, 10, 1).width, 4, 'never vanishingly small')
})

test('full-screen images crop around the center and cover the world at its aspect ratio', () => {
  assert.deepEqual(coverCrop(900, 1600, 320, 180), { x: 0, y: 546.875, width: 900, height: 506.25 })
  assert.deepEqual(coverCrop(1600, 900, 180, 320), { x: 546.875, y: 0, width: 506.25, height: 900 })
  assert.deepEqual(coverCrop(1600, 900, 320, 180), { x: 0, y: 0, width: 1600, height: 900 })
})
