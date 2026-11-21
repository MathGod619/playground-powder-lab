import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSamples, MapPlayer } from '../src/analysis.ts'

const RATE = 22050

/** Synthesises a track: groove, breakdown (pad only), then a louder groove. */
function track({ bpm = 120, groove = 8, breakdown = 6, drop = 14 } = {}) {
  const total = groove + breakdown + drop, out = new Float32Array(Math.round(total * RATE))
  let seed = 1
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - .5
  const beat = 60 / bpm
  const kick = (t, amp) => {
    const s = Math.round(t * RATE)
    for (let i = 0; i < RATE * .25 && s + i < out.length; i++) {
      const p = i / RATE, f = 150 * Math.exp(-p * 25) + 45
      out[s + i] += Math.sin(2 * Math.PI * f * p) * Math.exp(-p * 12) * amp
    }
  }
  const hat = t => {
    const s = Math.round(t * RATE)
    for (let i = 0; i < RATE * .04 && s + i < out.length; i++) out[s + i] += rnd() * .3 * Math.exp(-i / RATE * 90)
  }
  for (let t = 0; t < groove; t += beat) { kick(t, .7); hat(t + beat / 2) }
  for (let i = Math.round(groove * RATE); i < (groove + breakdown) * RATE; i++) out[i] += Math.sin(2 * Math.PI * 440 * i / RATE) * .08
  for (let t = groove + breakdown; t < total - .3; t += beat) { kick(t, 1); hat(t + beat / 2); hat(t + beat / 4) }
  return { samples: out, dropAt: groove + breakdown, beat }
}

test('maps kicks, tempo and the single drop of a synthetic track', () => {
  const { samples, dropAt } = track()
  const map = analyzeSamples(samples, RATE)
  assert.ok(Math.abs(map.bpm - 120) <= 3, `bpm ${map.bpm}`)
  const expected = Math.floor(8 / .5) + Math.floor(13.7 / .5) + 1
  assert.ok(Math.abs(map.kicks.length - expected) <= 3, `${map.kicks.length} kicks, expected about ${expected}`)
  assert.equal(map.drops.length, 1, `drops at ${map.drops}`)
  assert.ok(Math.abs(map.drops[0] - dropAt) < .08, `drop at ${map.drops[0]}, expected ${dropAt}`)
  assert.ok(map.hats.length > 30, 'hats found')
})

test('a steady track with no breakdown has no drops', () => {
  const { samples } = track({ breakdown: 0, groove: 20, drop: 0.5 })
  const map = analyzeSamples(samples, RATE)
  assert.equal(map.drops.length, 0)
  assert.ok(map.kicks.length >= 38)
})

test('silence maps to nothing', () => {
  const map = analyzeSamples(new Float32Array(RATE * 5), RATE)
  assert.deepEqual([map.kicks.length, map.drops.length, map.bpm], [0, 0, 0])
})

test('the map player fires events on time, counts down to drops, and survives a loop', () => {
  const map = { duration: 10, bpm: 120, kicks: [1, 1.5, 2, 6].map(t => ({ t, s: .8 })), hats: [{ t: 1.25, s: .5 }], drops: [6] }
  const player = new MapPlayer(map)
  const fired = []
  for (let t = 0; t <= 7; t += 1 / 60) {
    const e = player.update(t)
    if (e.kick) fired.push(+t.toFixed(2))
    if (e.drop) assert.ok(Math.abs(t - 6) < .02)
  }
  assert.equal(fired.length, 4)
  assert.ok(Math.abs(player.untilDrop(3) - 3) < 1e-9)
  assert.equal(player.untilDrop(7), Infinity)
  // loop back to the start: events fire again
  assert.equal(player.update(.5).kick, 0)
  assert.equal(player.update(1.01).kick, .8)
})
