import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImageScene, demoImage, fitPresetPhoto, IMAGE_PRESETS, imageRegion, MAX_IMAGE_GRAINS, releaseImage, resizePixels, rewindStroke } from '../src/image-presets.ts'
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
  for (const { id } of IMAGE_PRESETS.filter(p => p.id !== 'rewind')) {
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

test('swiping reconstructs only the selected original pixels, holds through kicks and releases on the next kick', () => {
  const w = buildImageScene(160, 120, 'rewind', photo(30, 24), seeded())
  const e = w.imageEffect
  const colors = e.cells.map(i => w.color[i])
  const grains = e.cells.length
  w.drop()
  for (let n = 0; n < 240; n++) w.step()
  assert.equal(w.particles, 0)
  const left = { x: e.x + 5, y: e.y + 7 }, right = { x: e.x + 23, y: left.y }
  rewindStroke(w, left, right, 2)
  assert.ok([...w.rewind.air.subarray(0, w.particles)].some(id => id < 0))
  for (let n = 0; n < 90; n++) {
    if (n % 30 === 0) w.onKick(.7)
    w.step()
  }
  let restored = 0
  for (const [index, i] of e.cells.entries()) {
    const x = i % w.width, y = Math.floor(i / w.width)
    const nearest = Math.max(left.x, Math.min(right.x, x))
    if ((x - nearest) ** 2 + (y - left.y) ** 2 <= 4) {
      assert.equal(w.rewind.grid[i], index + 1)
      assert.equal(w.color[i], colors[index])
      assert.equal(w.life[i], 1)
      restored++
    } else assert.notEqual(w.rewind.grid[i], index + 1)
  }
  assert.ok(restored > 80 && restored < grains / 4)
  w.rewind.holding = false
  w.step()
  assert.equal(w.life[w.index(left.x + 2, left.y)], 1)
  w.onKick(.7)
  for (let n = 0; n < 140; n++) w.step()
  assert.equal(w.count(M.Sand), grains)
  assert.ok(e.cells.every((i, n) => w.rewind.grid[i] !== n + 1))
})

test('Rewind keeps identical colors distinct and preserves in-flight identities through save and clone', () => {
  const pixels = photo(14, 14)
  pixels.data.fill(255)
  const w = buildImageScene(140, 100, 'rewind', pixels, seeded())
  const e = w.imageEffect, cell = e.cells[18]
  w.drop()
  for (let n = 0; n < 140; n++) w.step()
  const target = { x: cell % w.width, y: Math.floor(cell / w.width) }
  rewindStroke(w, target, target, 0)
  for (const copy of [cloneWorld(w), decodeWorld(encodeWorld(w))]) {
    for (let n = 0; n < 60; n++) copy.step()
    assert.equal(copy.rewind.grid[cell], 19)
    assert.equal(copy.count(M.Sand), e.cells.length)
    assert.equal(w.rewind.grid[cell], 0)
    copy.paint(target.x, target.y, 2, M.Sand, true)
    copy.put(cell, M.Sand)
    rewindStroke(copy, target, target, 0)
    assert.equal(copy.rewind.grid[cell], 0, 'painted sand never inherits an erased pixel')
  }
  const loaded = decodeWorld(encodeWorld(w))
  loaded.put(cell, M.Wall)
  for (let n = 0; n < 90; n++) loaded.step()
  assert.equal(loaded.type[cell], M.Wall)
  assert.equal(loaded.count(M.Sand), e.cells.length)
})
