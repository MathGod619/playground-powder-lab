import assert from 'node:assert/strict'
import test from 'node:test'
import { World } from '../src/world.ts'
import { M } from '../src/materials.ts'
import { half, hsl } from '../src/color.ts'
import { createRenderer } from '../src/render.ts'

function seeded() {
  let s = 42
  return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296)
}

// The pre-optimization flow algorithm (75f37e5). Keep this independent so tests
// catch changes in random consumption, swap order, edge handling and drainage.
function originalFlow(i, x, y, density, spread) {
  if (this.fall(i, x, y, density)) return
  let dir = this.rng() < this.slosh ? this.sloshDirection : (this.rng() < .5 ? -1 : 1)
  for (let pass = 0; pass < 2; pass++, dir = -dir) {
    let last = -1
    for (let s = 1; s <= spread; s++) {
      const nx = x + dir * s
      if (nx < 0 || nx >= this.width) break
      const j = i + dir * s
      if (this.type[j] === M.Empty) last = j
      else { if (this.canEnter(j, density)) last = j; break }
    }
    if (last >= 0) { this.swap(i, last); return }
  }
}

for (const material of [M.Water, M.Oil, M.Lava]) {
  for (const slosh of [0, .7, 1]) test(`fluid shortcut matches original: material ${material}, slosh ${slosh}`, () => {
    const worlds = [new World(36, 30, seeded()), new World(36, 30, seeded())]
    worlds[1].flow = originalFlow
    for (const w of worlds) {
      w.slosh = slosh
      for (let y = 4; y < 24; y++) for (let x = 0; x < w.width; x++) w.set(x, y, material)
      for (let x = 0; x < w.width; x++) w.set(x, 24, M.Wall)
    }
    let drained = false
    for (let frame = 0; frame < 300; frame++) {
      for (const w of worlds) {
        if (frame === 30) w.set(18, 24, M.Empty) // Wake an enclosed pool.
        if (frame === 90) w.set(18, 10, M.Gravel) // Heavier material sinks.
        if (frame === 120) w.onKick(.8)
        if (frame === 180) w.blast(22, 16, 7, .8, true)
        w.step()
      }
      assert.deepEqual(worlds[0].type, worlds[1].type, `types at frame ${frame}`)
      assert.deepEqual(worlds[0].life, worlds[1].life, `life at frame ${frame}`)
      assert.deepEqual(worlds[0].color, worlds[1].color, `colors at frame ${frame}`)
      for (const key of ['px', 'py', 'vx', 'vy', 'pType', 'pLife', 'pColor', 'pGhost'])
        assert.deepEqual(worlds[0][key], worlds[1][key], `${key} at frame ${frame}`)
      assert.equal(worlds[0].particles, worlds[1].particles)
      drained ||= worlds[0].type.slice(25 * 36).includes(material)
    }
    assert.ok(drained, 'opening the floor releases liquid without waiting for a kick')
    assert.equal(worlds[0].rng(), worlds[1].rng(), 'same number of random draws')
  })
}

function canvas() {
  const target = { image: null, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: image => { target.image = new Uint32Array(image.data.buffer).slice() },
    clearRect() {}, drawImage() {},
  }) }
  return target
}

test('light rendering keeps base pixels identical while skipping glow uploads', () => {
  const w = new World(20, 20, seeded()), base = canvas(), glow = canvas(), bloom = canvas()
  for (let x = 0; x < w.width; x++) w.set(x, 10, x % 2 ? M.Lava : M.Glitter)
  const draw = createRenderer(w, base, glow, bloom)
  draw(0, false)
  const light = base.image.slice()
  assert.equal(glow.image, null, 'no glow buffer was uploaded')
  draw(0, true)
  assert.deepEqual(base.image, light, 'material colors and positions are unchanged')
  assert.ok(glow.image.some(c => c !== 0), 'Full effects still produces the emissive layer')
})

test('column-cached plant animation preserves exact colors and refreshes each draw', () => {
  const w = new World(40, 30, seeded()), base = canvas(), glow = canvas()
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.set(x, y, M.Plant, y % 2 ? 20 : 0)
  const draw = createRenderer(w, base, glow, canvas())
  for (const frame of [0, 1, 200, 200]) {
    w.frame = frame
    w.energy = { bass: .7, mid: frame ? .8 : 0, level: frame === 200 ? .9 : .2, treble: 0 }
    draw()
    for (let i = 0; i < w.size; i++) {
      const expected = w.life[i] > 0 ? hsl(115 + Math.sin(w.frame * .025 + i % w.width * .05) * w.energy.mid * 30, 90, 45 + w.energy.level * 25) : w.color[i]
      assert.equal(base.image[i], expected)
      assert.equal(glow.image[i], w.life[i] > 0 ? half(expected) : 0)
    }
    // Changing energy without advancing the simulation (paused/online rendering).
    w.energy.mid = .1
    draw()
    const i = w.width + 3
    assert.equal(base.image[i], hsl(115 + Math.sin(w.frame * .025 + .15) * .1 * 30, 90, 45 + w.energy.level * 25))
  }
})
