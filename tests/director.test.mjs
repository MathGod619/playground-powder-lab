import test from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLE_PLAN, EMPTY_ENV, validatePlan } from '../src/director-plan.ts'
import { cloneWorld, prepareScene } from '../src/director-world.ts'
import { World } from '../src/world.ts'
import { M, BOMB_DROP_ONLY } from '../src/materials.ts'
import { encodeWorld, decodeWorld } from '../src/save.ts'
import { createDirectorServer } from '../server/director.mjs'

const plan = () => structuredClone(EXAMPLE_PLAN)
test('only bounded scene data and supported tools pass validation', () => {
  assert.deepEqual(validatePlan(plan()), plan())
  for (const change of [
    p => { p.code = 'alert(1)' }, p => { p.operations[0].shape = 'exec' },
    p => { p.environment.gravity = -1 }, p => { p.environment.hue = Infinity },
    p => { p.operations[0].color = 'url(https://example.com)' },
    p => { p.operations[0].x = NaN }, p => { p.operations = Array(49).fill(p.operations[0]) },
    p => { p.operations[0].material = 'unknown' }, p => { p.environment = { ...EMPTY_ENV, command: 'curl' } },
  ]) { const p = plan(); change(p); assert.throws(() => validatePlan(p)) }
})

test('preview has isolated buffers and queues; applying preserves image colours outside requested shapes', () => {
  const w = new World(120, 80)
  w.set(60, 40, M.Brick); w.color[w.index(60, 40)] = 0xff785634
  w.addParticle(12, 14, .2, -.4, M.Sand, 0xffaaaaaa, 5)
  w.bursts.push({ at: 42, x: 20, y: 25 })
  const edit = { title: 'Adjust gravity', description: 'Keep the image.', scene: null, environment: { ...EMPTY_ENV, gravity: .2, wind: .4 }, operations: [] }
  const preview = prepareScene(w, edit)
  assert.equal(w.rules.gravity, 1)
  assert.equal(preview.rules.gravity, .2)
  assert.equal(preview.directorWind, .4)
  assert.equal(preview.color[preview.index(60, 40)], 0xff785634)
  preview.type.fill(0); preview.px[0] = 99; preview.bursts[0].x = 100
  assert.equal(w.at(60, 40), M.Brick)
  assert.equal(w.px[0], 12)
  assert.equal(w.bursts[0].x, 20)
  const undo = cloneWorld(w)
  assert.deepEqual(undo.type, w.type)
  assert.equal(undo.particles, w.particles)
})

test('example builds towers, bridge and manual drop bombs without mutating its source', () => {
  const w = new World(160, 100)
  const next = prepareScene(w, plan())
  assert.equal(w.count(M.Brick), 0)
  assert.ok(next.count(M.Brick) > 100)
  assert.equal(next.count(M.Bomb), 2)
  for (let i = 0; i < next.size; i++) if (next.type[i] === M.Bomb) assert.equal(next.life[i], BOMB_DROP_ONLY)
  for (let k = 0; k < 8; k++) next.onKick(.5)
  assert.equal(next.count(M.Bomb), 2)
})

test('Director physics round-trip through save, while legacy worlds still load', () => {
  const w = prepareScene(new World(80, 60), plan())
  w.directorWind = -.6
  const saved = encodeWorld(w), next = decodeWorld(saved)
  assert.equal(next.rules.gravity, .7); assert.equal(next.directorWind, -.6)
  const old = JSON.parse(saved); delete old.physics
  assert.doesNotThrow(() => decodeWorld(JSON.stringify(old)))
})

const TOKEN = 'test-only-director-token-0000000000000000'
const ORIGIN = 'https://mathgod619.github.io'
async function withBridge(t, fetchImpl, fn) {
  const server = createDirectorServer({ token: TOKEN, origins: [ORIGIN], fetchImpl })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = 'http://127.0.0.1:' + server.address().port
  const request = (path, body, extra = {}) => fetch(url + path, { method: body ? 'POST' : 'GET',
    headers: { Origin: ORIGIN, Authorization: 'Bearer ' + TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  await fn(request)
}
test('bridge blocks bad credentials, foreign origins and malformed requests before calling Ollama', async t => {
  let calls = 0
  await withBridge(t, async () => { calls++; throw new Error() }, async request => {
    assert.equal((await request('/health', null, { Authorization: 'Bearer wrong' })).status, 401)
    assert.equal((await request('/health', null, { Origin: 'https://evil.invalid' })).status, 403)
    assert.equal((await request('/plan', { mode: 'adjust', prompt: '', context: {} })).status, 400)
    assert.equal((await request('/plan', { mode: 'adjust', prompt: 'hello', context: {} }, { 'Content-Type': 'text/plain' })).status, 415)
    assert.equal(calls, 0)
  })
})
test('bridge sends structured requests and returns validated plans', async t => {
  let payload
  await withBridge(t, async (url, opts) => {
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:4b-instruct' }] })
    payload = JSON.parse(opts.body)
    return Response.json({ message: { content: JSON.stringify(plan()) } })
  }, async request => {
    const health = await request('/health')
    assert.equal(health.status, 200)
    assert.equal(health.headers.get('access-control-allow-origin'), ORIGIN)
    const r = await request('/plan', { mode: 'create', prompt: 'Build a neon city', context: { scene: 'garden' } })
    assert.equal(r.status, 200)
    assert.deepEqual((await r.json()).plan, plan())
    assert.equal(payload.stream, false)
    assert.equal(payload.format.type, 'object')
    assert.equal('think' in payload, false)
    assert.equal(payload.format.properties.scene.type, 'string')
  })
})
test('bridge rejects replacement in adjust mode and rejects invalid model output', async t => {
  let invalid = false
  await withBridge(t, async () => Response.json({ message: { content: invalid ? '{"code":"exec"}' : JSON.stringify(plan()) } }), async request => {
    const body = { mode: 'adjust', prompt: 'Lighter gravity', context: {} }
    assert.equal((await request('/plan', body)).status, 502)
    invalid = true
    assert.equal((await request('/plan', body)).status, 502)
  })
})
test('bridge reports missing model rather than claiming a connection', async t => {
  await withBridge(t, async () => Response.json({ models: [] }), async request => {
    assert.equal((await request('/health')).status, 503)
  })
})
test('bridge repairs an invalid scene once with the concrete validation error', async t => {
  let attempts = 0
  await withBridge(t, async (_url, options) => {
    const payload = JSON.parse(options.body)
    assert.deepEqual(payload.format.properties.scene, { type: 'null' })
    attempts++
    if (attempts === 1) return Response.json({ message: { content: '{"wrong":"shape"}' } })
    assert.match(payload.messages.at(-1).content, /unsupported fields/)
    const fixed = plan(); fixed.scene = null
    return Response.json({ message: { content: JSON.stringify(fixed) } })
  }, async request => {
    const response = await request('/plan', { mode: 'adjust', prompt: 'Lighter gravity', context: {} })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).plan.scene, null)
    assert.equal(attempts, 2)
  })
})
test('bridge exposes Ollama API rejection rather than blaming the prompt', async t => {
  let calls = 0
  await withBridge(t, async () => { calls++; return Response.json({ error: 'model does not support this option' }, { status: 400 }) }, async request => {
    const response = await request('/plan', { mode: 'create', prompt: 'A garden', context: {} })
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /HTTP 400.*model does not support/)
    assert.equal(calls, 1)
  })
})
test('bridge retries truncated output and stops after the bounded repair', async t => {
  let calls = 0
  await withBridge(t, async () => { calls++; return Response.json({ done_reason: 'length', message: { content: '{"title":' } }) }, async request => {
    const response = await request('/plan', { mode: 'create', prompt: 'A garden', context: {} })
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /cut off at the output limit/)
    assert.equal(calls, 2)
  })
})
