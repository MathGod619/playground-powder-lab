import assert from 'node:assert/strict'
import test from 'node:test'
import { Online } from '../src/online.ts'
import { LIMITS } from '../server/rave-relay.mjs'

for (const role of ['host', 'guest']) test(`${role} keeps an idle room alive and clears its timer on leave`, async () => {
  const keys = ['WebSocket', 'setInterval', 'clearInterval']
  const old = Object.fromEntries(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  let socket, heartbeat, interval, cleared = false
  try {
    globalThis.setInterval = (callback, ms) => { heartbeat = callback; interval = ms; return 123 }
    globalThis.clearInterval = id => { assert.equal(id, 123); cleared = true }
    globalThis.WebSocket = class {
      static OPEN = 1
      readyState = 1
      sent = []
      constructor() { socket = this }
      send(message) { this.sent.push(JSON.parse(message)) }
      close() { this.readyState = 3 }
    }
    const net = new Online()
    const pending = role === 'host' ? net.host('Test', 'ws://test') : net.join('ABCD', 'Test', 'ws://test')
    socket.onopen()
    socket.onmessage({ data: JSON.stringify({ t: 'room', code: 'ABCD', you: 1, players: [] }) })
    await pending
    assert.ok(interval < LIMITS.idleMs / 2, 'traffic reaches the relay before its idle deadline')
    heartbeat()
    assert.deepEqual(socket.sent.at(-1), { t: 'keepalive' })
    const count = socket.sent.length
    net.leave()
    assert.ok(cleared)
    heartbeat()
    assert.equal(socket.sent.length, count, 'a stale callback cannot write to a closed connection')
  } finally {
    for (const [key, descriptor] of Object.entries(old)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
