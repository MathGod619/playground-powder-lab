import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSamples, profile, SHAPE_BINS } from '../src/analysis.ts'
import { M } from '../src/materials.ts'
import { buildScene } from '../src/scenes.ts'
import { buildSongWorld, playheadColumn, setSongShape, songMarkers, songShape } from '../src/song-world.ts'
import { World } from '../src/world.ts'

/** A synthetic 60 s track: quiet intro, kick groove, silent breakdown, loud drop. */
function track(rate = 11025) {
  const out = new Float32Array(rate * 60), beat = 60 / 128
  for (let i = 0; i < out.length; i++) {
    const t = i / rate, b = t % beat
    const part = t < 12 ? 0 : t < 28 ? 1 : t < 36 ? 0 : 2
    let v = Math.sin(2 * Math.PI * 220 * t) * .03
    if (part) v += Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-b * 30)) * b) * Math.exp(-b * 7) * (part === 2 ? .9 : .5)
    out[i] = v
  }
  return out
}

const column = (world, x) => Array.from({ length: world.height }, (_, y) => world.at(x, y))
const groundAt = (world, x) => column(world, x).findIndex(t => t !== M.Empty && t !== M.Cloud)

test('the beat map carries the song shape, scaled 0–1', () => {
  const map = analyzeSamples(track(), 11025)
  assert.equal(map.shape.loud.length, SHAPE_BINS)
  assert.equal(Math.max(...map.shape.loud), 1)
  const at = s => map.shape.loud[Math.floor(s / 60 * SHAPE_BINS)]
  assert.ok(at(50) > at(5) * 3, 'the drop is much louder than the intro')
  assert.deepEqual(profile(new Float32Array([1, 1, 3, 3]), 2), [1 / 3, 1])
})

test('loud parts become mountains, quiet parts lakes, and each drop a labelled lava crater', () => {
  const map = analyzeSamples(track(), 11025), shape = songShape(map, 'Night Drive.mp3')
  assert.equal(shape.name, 'Night Drive')
  assert.ok(shape.drops.length >= 1)
  const world = new World(320, 200)
  const markers = buildSongWorld(world, shape)
  const x = s => Math.round(s / 60 * world.width)
  assert.ok(groundAt(world, x(50)) < groundAt(world, x(6)) - 20, 'the drop section towers over the intro')
  assert.ok(column(world, x(6)).includes(M.Water), 'the quiet intro is a lake')
  assert.equal(markers.length, shape.drops.length)
  for (const [n, m] of markers.entries()) {
    assert.equal(m.label, `DROP ${n + 1}`)
    assert.ok(Math.abs(m.x - shape.drops[n] / shape.duration * world.width) <= world.width * .04)
    let lava = 0
    for (let dx = -3; dx <= 3; dx++) lava += column(world, m.x + dx).filter(t => t === M.Lava).length
    assert.ok(lava > 5, 'crater holds lava')
  }
  assert.ok(world.count(M.Speaker) > 0)
})

test('the Song world rebuilds from the current song and falls back to a demo shape', () => {
  setSongShape(null)
  const fallback = new World(200, 120)
  buildScene(fallback, 'song')
  assert.equal(fallback.scene, 'song')
  assert.ok(fallback.count(M.Sand) > 1000)
  assert.equal(songMarkers().length, 2)

  const shape = songShape(analyzeSamples(track(), 11025), 'x.wav')
  setSongShape(shape)
  const world = new World(200, 120)
  buildScene(world, 'song')
  assert.equal(songMarkers().length, shape.drops.length)
  for (let k = 0; k < 120; k++) world.step()
  setSongShape(null)
})

test('the playhead walks across the world with the song', () => {
  const world = new World(300, 100), shape = { duration: 60 }
  assert.equal(playheadColumn(world, shape, 0), 0)
  assert.equal(playheadColumn(world, shape, 30), 150)
  assert.equal(playheadColumn(world, shape, 999), 299)
})

test('very short clips do not get a song world', () => {
  const map = analyzeSamples(new Float32Array(11025 * 4), 11025)
  assert.equal(songShape(map, 'blip.wav'), null)
})
