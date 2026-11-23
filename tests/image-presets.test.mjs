import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImageScene, demoImage, fitPresetPhoto, IMAGE_PRESETS, imageRegion, MAX_IMAGE_GRAINS, releaseImage, resizePixels } from '../src/image-presets.ts'
import { pack } from '../src/color.ts'
import { cloneWorld } from '../src/director-world.ts'
import { M } from '../src/materials.ts'
import { decodeWorld, encodeWorld } from '../src/save.ts'

function photo(width = 18, height = 12) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([x * 11, y * 17, 140, (x + y) % 13 ? 255 : 0], (y * width + x) * 4)
  return { width, height, data }
}
function seeded() { let n = 42; return () => ((n = Math.imul(n, 1664525) + 1013904223 >>> 0) / 4294967296) }

for (const { id } of IMAGE_PRESETS) {
  test(`${id}: photo colors stay intact through music until DROP`, () => {
    const pixels = photo(), original = pixels.data.slice()
    const world = buildImageScene(160, 120, id, pixels, seeded())
    const effect = world.imageEffect
    for (let n = 0; n < 180; n++) { if (n % 30 === 0) world.onKick(.7); world.step() }
    assert.equal(effect.fired, false)
    for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
      const i = (y * pixels.width + x) * 4
      if (pixels.data[i + 3] < 128) continue
      const cell = world.index(effect.x + x, effect.y + y)
      assert.equal(world.type[cell], M.Brick)
      assert.equal(world.color[cell], pack(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]))
    }
    assert.deepEqual(pixels.data, original, 'the input image is unchanged')
  })

  test(`${id}: release conserves photo grains and keeps the solid setup intact`, () => {
    const world = buildImageScene(160, 120, id, photo(30, 24), seeded())
    const grains = world.count(M.Brick), walls = world.type.map(t => t === M.Wall ? 1 : 0)
    assert.ok(grains > 600)
    world.drop()
    assert.equal(world.imageEffect.fired, true)
    assert.equal(world.count(M.Brick), 0)
    assert.equal(world.count(M.Sand), grains, 'every visible photo pixel became sand')
    assert.equal(releaseImage(world), 0, 'an effect cannot duplicate its grains')
    for (let n = 0; n < 720; n++) { if (n % 30 === 0) world.onKick(.7); world.step() }
    assert.equal(world.count(M.Sand), grains, 'all grains survive collisions, music, and settling')
    for (let i = 0; i < world.size; i++) if (walls[i]) assert.equal(world.type[i], M.Wall, `wall cell ${i} survives`)
  })
}

test('the five effects have distinct initial movement and the speaker pit includes real emitters', () => {
  const signatures = new Set()
  for (const { id } of IMAGE_PRESETS) {
    const world = buildImageScene(160, 120, id, photo(), seeded())
    releaseImage(world)
    signatures.add(JSON.stringify([world.particles, [...world.vx.slice(0, 4)], [...world.vy.slice(0, 4)]]))
    if (id === 'sandfall') assert.equal(world.particles, 0, 'sand falls naturally without being flung')
    if (id === 'speakers') assert.ok(world.speakers().length >= 2, 'the regular music physics drives actual speakers')
  }
  assert.equal(signatures.size, 5)
})

test('photo fitting bounds allocation and grain count for portrait, landscape, and Fine worlds', () => {
  for (const [w, h] of [[80, 300], [600, 180], [568, 317]]) for (const { id } of IMAGE_PRESETS) {
    const region = imageRegion(id, w, h)
    for (const [iw, ih] of [[6000, 4000], [4000, 6000], [20000, 1]]) {
      const size = fitPresetPhoto(iw, ih, region.maxWidth, region.maxHeight)
      assert.ok(size.width <= region.maxWidth && size.height <= region.maxHeight)
      assert.ok(size.width * size.height <= MAX_IMAGE_GRAINS)
      const image = resizePixels(photo(), size.width, size.height)
      const world = buildImageScene(w, h, id, image, seeded())
      assert.ok(world.imageEffect.cells.every(i => i >= 0 && i < world.size))
    }
  }
})

test('cloning and saving a prepared scene keep its DROP effect attached to the correct world', () => {
  const source = buildImageScene(160, 120, 'box', photo(), seeded())
  const clone = cloneWorld(source), saved = decodeWorld(encodeWorld(source))
  clone.drop(); saved.drop()
  assert.equal(source.imageEffect.fired, false)
  assert.ok(source.count(M.Brick) > 0)
  assert.equal(clone.count(M.Brick), 0)
  assert.equal(saved.count(M.Brick), 0)
  assert.equal(saved.count(M.Sand), source.count(M.Brick))
  const fired = decodeWorld(encodeWorld(saved))
  assert.equal(fired.imageEffect.fired, true)
  assert.equal(releaseImage(fired), 0)
})

test('empty photos and corrupt saved image metadata fail before creating an unusable setup', () => {
  const empty = photo(); empty.data.fill(0)
  assert.throws(() => buildImageScene(160, 120, 'box', empty), /No visible image/)
  const good = buildImageScene(160, 120, 'box', photo())
  const data = JSON.parse(encodeWorld(good))
  data.imageEffect.cells = [good.size + 1]
  assert.throws(() => decodeWorld(JSON.stringify(data)), /Invalid image preset/)
})

test('the built-in demo fits the same path as a user photo', () => {
  const demo = demoImage()
  assert.equal(demo.data.length, demo.width * demo.height * 4)
  const region = imageRegion('box', 160, 120)
  const size = fitPresetPhoto(demo.width, demo.height, region.maxWidth, region.maxHeight)
  const world = buildImageScene(160, 120, 'box', resizePixels(demo, size.width, size.height))
  assert.ok(world.count(M.Brick) > 1000)
})
