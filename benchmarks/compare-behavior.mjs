// Compare a baseline checkout with the current code without timing assertions.
// node benchmarks/compare-behavior.mjs /path/to/baseline .
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const roots = process.argv.slice(2)
assert.equal(roots.length, 2, 'Pass baseline and candidate checkout paths')
for (const scene of ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank', 'song']) {
  const signatures = []
  for (const root of roots) {
    const url = pathToFileURL(resolve(root) + '/')
    const { World } = await import(new URL('src/world.ts', url))
    const { buildScene } = await import(new URL('src/scenes.ts', url))
    const { spawnCrowd } = await import(new URL('src/crowd.ts', url))
    let s = 42
    const w = new World(180, 112, () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296))
    buildScene(w, scene)
    spawnCrowd(w)
    w.setEnergy({ bass: .7, mid: .5, treble: .6, level: .7 }, 1 / 60)
    for (let n = 0; n < 420; n++) {
      if (n % 28 === 0) w.onKick(.9)
      if (n % 14 === 0) w.onHat(.7)
      if (n === 100) w.drop()
      w.step()
      w.decay()
    }
    const hash = createHash('sha256')
    for (const key of ['type', 'life', 'color', 'px', 'py', 'vx', 'vy', 'pType', 'pLife', 'pColor', 'pGhost'])
      hash.update(new Uint8Array(w[key].buffer))
    hash.update(JSON.stringify({ particles: w.particles, ravers: w.ravers, rings: w.rings,
      bolts: w.bolts, bursts: w.bursts, fuses: w.fuses, pulse: w.pulse, rng: s }))
    signatures.push(hash.digest('hex'))
  }
  assert.equal(signatures[0], signatures[1], `${scene} simulation changed`)
  console.log(`${scene}: identical (${signatures[0].slice(0, 12)})`)
}
