import assert from 'node:assert/strict'
import { request } from 'node:http'
import { test } from 'node:test'
import { decodeFrames, encodeFrame, LIMITS, originAllowed, startRelay } from '../server/rave-relay.mjs'
import { buildScene } from '../src/scenes.ts'
import { spawnCrowd } from '../src/crowd.ts'
import { applySnapshot, encodeSnapshot, pack, unpack } from '../src/netsync.ts'
import { cleanCode, Online, validCode } from '../src/online.ts'
import { M } from '../src/materials.ts'
import { World } from '../src/world.ts'

const wait = (ms = 30) => new Promise(r => setTimeout(r, ms))
async function until(check, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) { if (Date.now() > end) throw new Error('timed out'); await wait(10) }
}

test('frames round-trip at every length size and survive being split', () => {
  for (const size of [0, 5, 125, 126, 300, 70000]) {
    const data = Buffer.alloc(size, 7)
    const { frames, rest } = decodeFrames(encodeFrame(data, true))
    assert.equal(frames[0].data.length, size)
    assert.equal(frames[0].opcode, 2)
    assert.equal(rest.length, 0)
  }
  const whole = encodeFrame('hello')
  const first = decodeFrames(whole.subarray(0, 3))
  assert.equal(first.frames.length, 0)
  assert.equal(decodeFrames(Buffer.concat([first.rest, whole.subarray(3)])).frames[0].data.toString(), 'hello')
  assert.throws(() => decodeFrames(encodeFrame(Buffer.alloc(2000)), 1000))
})

test('only the game site and local dev servers may connect', () => {
  assert.ok(originAllowed('https://mathgod619.github.io'))
  assert.ok(originAllowed('http://localhost:5179'))
  assert.ok(originAllowed('http://127.0.0.1:4173'))
  assert.ok(!originAllowed('https://evil.example'))
  assert.ok(!originAllowed(undefined))
})

test('a room: host and guests meet by code, the world streams out and actions come back', async () => {
  const { server, port } = await startRelay({ port: 0, log: () => {}, allowMissingOrigin: true })
  const url = `ws://127.0.0.1:${port}`
  try {
    const host = new Online(), guest = new Online(), late = new Online()
    const actions = [], snapshots = [], closed = []
    host.on('action', (id, m) => actions.push([id, m]))
    guest.on('snapshot', b => snapshots.push(b)).on('closed', r => closed.push(r))

    await host.host('DJ <Host>', url)
    assert.ok(validCode(host.code))
    assert.equal(host.players[0].name, 'DJ Host', 'names are cleaned')
    await assert.rejects(guest.join('ZZZZ', 'Pat', url), /No rave with that code/)
    await guest.join(host.code.toLowerCase(), 'Pat', url)
    await until(() => host.players.length === 2)
    assert.deepEqual(guest.players.map(p => p.host), [true, false])

    host.sendSnapshot(new Uint8Array([1, 2, 3]))
    await until(() => snapshots.length === 1)
    assert.deepEqual([...snapshots[0]], [1, 2, 3])

    guest.send({ a: 'down', x: 3, y: 4, erase: false, tool: M.Sand, brush: 5 })
    await until(() => actions.length === 1)
    assert.equal(actions[0][0], guest.you)
    assert.equal(actions[0][1].a, 'down')

    // Guests cannot stream world data to each other.
    await late.join(host.code, 'Sam', url)
    const lateSnaps = []
    late.on('snapshot', b => lateSnaps.push(b))
    guest.sendSnapshot(new Uint8Array([9]))
    await wait(60)
    assert.equal(lateSnaps.length, 0)

    host.leave()
    await until(() => closed.length === 1)
    assert.match(closed[0], /host ended/)
    late.leave()
  } finally { server.close() }
})

test('rooms are capped at four players', async () => {
  const { server, port } = await startRelay({ port: 0, log: () => {}, allowMissingOrigin: true })
  const url = `ws://127.0.0.1:${port}`
  try {
    const host = new Online()
    await host.host('H', url)
    const guests = [new Online(), new Online(), new Online()]
    for (const g of guests) await g.join(host.code, 'G', url)
    await assert.rejects(new Online().join(host.code, 'X', url), /full/)
    host.leave(); guests.forEach(g => g.leave())
  } finally { server.close() }
  assert.equal(LIMITS.players, 4)
})

test('connections from other websites are refused', async () => {
  const { server, port } = await startRelay({ port: 0, log: () => {} })
  try {
    const status = await new Promise((resolve, reject) => {
      const req = request({ port, host: '127.0.0.1', headers: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://evil.example', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' } })
      req.on('response', res => resolve(res.statusCode))
      req.on('upgrade', () => resolve(101))
      req.on('error', reject)
      req.end()
    })
    assert.equal(status, 403)
  } finally { server.close() }
})

test('snapshots rebuild the host world exactly: keyframe, then deltas, through compression', async () => {
  const host = new World(160, 100)
  buildScene(host, 'garden')
  spawnCrowd(host)
  const guest = new World(160, 100)
  let { bytes, base, keyframe } = encodeSnapshot(host, null, [{ id: 1, name: 'A', x: 5, y: 6, tool: M.Sand, brush: 3 }])
  assert.ok(keyframe)
  const info = applySnapshot(guest, await unpack(await pack(bytes)), false)
  assert.equal(info.cursors[0].name, 'A')
  for (let f = 0; f < 20; f++) {
    for (let k = 0; k < 3; k++) host.step()
    if (f === 10) host.drop()
    if (f % 4 === 0) host.onKick(.9)
    const next = encodeSnapshot(host, base)
    base = next.base
    assert.ok(applySnapshot(guest, await unpack(await pack(next.bytes)), true))
  }
  assert.ok(guest.type.every((t, i) => t === host.type[i]))
  assert.ok(guest.color.every((c, i) => c === host.color[i]))
  assert.equal(guest.particles, host.particles)
  assert.equal(guest.ravers.length, host.ravers.length)
  assert.equal(guest.hue, Math.round(host.hue * 100) / 100)
})

test('a guest refuses snapshots it cannot place', () => {
  const host = new World(80, 60)
  buildScene(host, 'blank')
  const key = encodeSnapshot(host, null)
  const delta = encodeSnapshot(host, key.base)
  assert.equal(delta.keyframe, false)
  assert.equal(applySnapshot(new World(80, 60), delta.bytes, false), null, 'no keyframe yet')
  assert.equal(applySnapshot(new World(90, 60), key.bytes, false), null, 'wrong size')
})

test('room codes are cleaned to four letters', () => {
  assert.equal(cleanCode(' ab-c1d '), 'ABCD')
  assert.ok(validCode('KXQT'))
  assert.ok(!validCode('KXQ'))
})
