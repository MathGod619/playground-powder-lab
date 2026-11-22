import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSamples, profile, SHAPE_BINS } from '../src/analysis.ts'
import { M } from '../src/materials.ts'
import { buildScene } from '../src/scenes.ts'
import { buildSongWorld, looseDepth, playheadColumn, setSongShape, songMarkers, songShape } from '../src/song-world.ts'
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
  assert.ok(fallback.count(M.Sand) > 300, "a loose surface to play with")
  assert.ok(fallback.count(M.Wall) > 4000, "rock mountains underneath")
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

// ---------------------------------------------------------------- terrain retention
// Before the mountains were rock under a thin loose layer, 60 s of kicks moved 29% of columns by more
// than 5 cells (mean 6.3) and 120 s idle moved 16% (mean 3.3), as the cliffs slumped.

function seededWorld(width, height) {
  let s = 5
  return new World(width, height, () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1 >>> 0) / 4294967296))
}
function cliffSong() {
  const n = 96, wave = f => Array.from({ length: n }, (_, i) => f(i / (n - 1)))
  return {
    name: 'Cliffs', duration: 60, bpm: 128, drops: [30], kicksPerSecond: 2, hatsPerSecond: 2,
    loud: wave(u => u < .2 ? .1 : u < .45 ? .5 : u < .5 ? .12 : .95), bass: wave(() => .6), treble: wave(() => .4),
  }
}
const OPEN = new Set([M.Empty, M.Cloud, M.Water, M.Smoke])
const skyline = world => Array.from({ length: world.width }, (_, x) => {
  for (let y = 0; y < world.height; y++) if (!OPEN.has(world.at(x, y))) return y
  return world.height
})
function erosion(world, steps, kickEvery = 0) {
  const before = skyline(world)
  for (let k = 0; k < steps; k++) { if (kickEvery && k % kickEvery === 0) world.onKick(.9); world.step() }
  const after = skyline(world), drift = before.map((b, i) => Math.abs(after[i] - b))
  return {
    mean: drift.reduce((a, b) => a + b, 0) / drift.length,
    moved: drift.filter(d => d > 5).length / drift.length,
    deepestLoss: Math.max(...before.map((b, i) => after[i] - b)),
    peak: [Math.min(...before), Math.min(...after)],
  }
}

test('song-world mountains keep their shape through two idle minutes', () => {
  const world = seededWorld(380, 238)
  buildSongWorld(world, cliffSong())
  const r = erosion(world, 7200)
  assert.ok(r.mean < 1.5, `mean drift ${r.mean.toFixed(2)}`)
  assert.ok(r.moved < .08, `${(r.moved * 100).toFixed(0)}% of columns moved more than 5 cells`)
  assert.equal(r.peak[1], r.peak[0], 'the tallest peak stays as tall')
})

test('a minute of kicks moves the loose surface but never digs into the rock', () => {
  const world = seededWorld(380, 238)
  buildSongWorld(world, cliffSong())
  const r = erosion(world, 3600, 28)
  assert.ok(r.deepestLoss <= looseDepth(238) + 1, `a column lost ${r.deepestLoss} cells; the loose layer is ${looseDepth(238)}`)
  assert.ok(r.mean < 4.5, `mean drift ${r.mean.toFixed(2)}`)
  assert.ok(r.moved < .2, `${(r.moved * 100).toFixed(0)}% of columns moved more than 5 cells`)
  assert.ok(Math.abs(r.peak[1] - r.peak[0]) <= 1, 'the tallest peak stays as tall')
})

test('the rock under the loose layer keeps the beat-coloured stripes', () => {
  const world = seededWorld(200, 140)
  buildSongWorld(world, cliffSong())
  const x = 170, top = skyline(world)[x], depth = looseDepth(140)
  assert.ok([M.Sand, M.Glitter].includes(world.at(x, top + 1)), 'loose on top')
  const rock = Array.from({ length: 12 }, (_, k) => world.index(x, top + depth + k))
  assert.ok(rock.every(i => world.type[i] === M.Wall), 'rock below')
  assert.ok(new Set(rock.map(i => world.color[i])).size > 3, 'striped, not plain grey')
})

test('speakers stand on rock, so a minute of kicks never leaves them floating', () => {
  const world = seededWorld(380, 238)
  const song = { ...cliffSong(), bass: cliffSong().loud.map((_, i) => .4 + .6 * Math.abs(Math.sin(i / 95 * 9))), treble: cliffSong().loud.map(() => .6) }
  buildSongWorld(world, song)
  const bottoms = () => {
    const cols = new Map()
    for (let i = 0; i < world.size; i++) if (world.type[i] === M.Speaker) {
      const x = i % world.width, y = Math.floor(i / world.width)
      cols.set(x, Math.max(cols.get(x) ?? -1, y))
    }
    return cols
  }
  assert.ok(bottoms().size > 0, 'the song has speakers')
  for (let k = 0; k < 3600; k++) { if (k % 28 === 0) world.onKick(.9); world.step() }
  for (const [x, y] of bottoms()) assert.equal(world.at(x, y + 1), M.Wall, `speaker column ${x} is supported`)
})
