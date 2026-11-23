// CPU work only: canvas uploads and browser/GPU compositing are excluded.
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const roots = process.argv.slice(2)
if (!roots.length) roots.push('.')
const modules = await Promise.all(roots.map(async path => {
  const root = pathToFileURL(resolve(path) + '/')
  const { World } = await import(new URL('src/world.ts', root))
  const { M } = await import(new URL('src/materials.ts', root))
  const { buildScene } = await import(new URL('src/scenes.ts', root))
  const { createRenderer } = await import(new URL('src/render.ts', root))
  const { spawnCrowd } = await import(new URL('src/crowd.ts', root))
  return { path, World, M, buildScene, createRenderer, spawnCrowd }
}))
const canvas = () => ({ getContext: () => ({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {}, clearRect() {}, drawImage() {},
}) })
function seeded() {
  let s = 42
  return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296)
}
const scenarios = ['sea', 'song', 'city', 'powders', 'plants', 'particles']
const results = []
function prepare(name, { World, M, buildScene, createRenderer, spawnCrowd }) {
  const w = new World(568, 317, seeded()) // Fine: approximately 180,000 cells
  buildScene(w, ['powders', 'plants', 'particles'].includes(name) ? 'blank' : name)
  if (name === 'powders' || name === 'plants') {
    for (let y = 30; y < w.height - 10; y++) for (let x = 5; x < w.width - 5; x++)
      w.set(x, y, name === 'plants' ? M.Plant : (x % 3 ? M.Sand : M.Glitter), name === 'plants' ? 20 : 0)
  }
  if (name === 'particles') for (let k = 0; k < 12000; k++)
    w.addParticle(10 + k % 540, 30 + k % 200, (k % 7 - 3) * .3, -1, M.Spark, 0xffffffff, 65000)
  spawnCrowd(w)
  w.setEnergy({ bass: .7, mid: .5, treble: .6, level: .7 }, 1 / 60)
  const draw = createRenderer(w, canvas(), canvas(), canvas())
  return { w, draw }
}
for (const name of scenarios) {
  for (let sample = 0; sample < 3; sample++) {
    const cases = modules.map(module => ({ ...prepare(name, module), path: module.path,
      physics: 0, rendering: 0, reactions: 0 }))
    for (let n = 0; n < 60; n++) for (const { w, draw } of cases) { w.step(); draw(.7) }
    const frames = 180
    for (let n = 0; n < frames; n++) {
      // Pair every frame, alternating order, so system load affects both versions.
      const order = (n + sample) % 2 ? [...cases].reverse() : cases
      for (const c of order) {
        const { w, draw } = c
        let t = performance.now()
        if (n % 28 === 0 && name !== 'plants') w.onKick(.9)
        if (n % 14 === 0) w.onHat(.7)
        if (n === 100 && name !== 'plants') w.drop()
        c.reactions += performance.now() - t
        t = performance.now(); w.step(); c.physics += performance.now() - t
        t = performance.now(); draw(.7); c.rendering += performance.now() - t
        w.decay()
      }
    }
    for (const c of cases) results.push({ path: c.path, name, sample,
      physics: c.physics / frames, rendering: c.rendering / frames,
      reactions: c.reactions / frames, total: (c.physics + c.rendering + c.reactions) / frames })
  }
}
console.log(JSON.stringify(results, null, 2))
