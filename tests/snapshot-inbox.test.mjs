import assert from 'node:assert/strict'
import test from 'node:test'
import { SnapshotInbox } from '../src/snapshot-inbox.ts'
import { World } from '../src/world.ts'
import { M } from '../src/materials.ts'
import { applySnapshot, encodeSnapshot } from '../src/netsync.ts'

test('a slow guest discards obsolete work and recovers from a keyframe, never a skipped delta', async () => {
  const host = new World(20, 20), guest = new World(20, 20)
  let haveKey = false, release, first = true, decoded = 0
  const gate = new Promise(resolve => { release = resolve })
  const inbox = new SnapshotInbox(async packed => {
    decoded++
    if (first) { first = false; await gate }
    return packed
  }, bytes => {
    const info = applySnapshot(guest, bytes, haveKey)
    if (info) haveKey = true
  }, () => { haveKey = false }, 2)
  host.set(2, 2, M.Sand)
  const key = encodeSnapshot(host, null)
  inbox.offer(key.bytes)
  let base = key.base
  for (let x = 3; x < 7; x++) {
    host.set(x, 2, M.Wall)
    const delta = encodeSnapshot(host, base)
    base = delta.base
    inbox.offer(delta.bytes)
  }
  release()
  await inbox.whenIdle()
  assert.equal(haveKey, false, 'in-flight stale keyframe must not restore the dropped base')
  assert.equal(guest.count(M.Sand), 0, 'deltas after a dropped base were not applied')
  assert.ok(decoded < 5, 'the backlog was bounded instead of decoding every obsolete snapshot')
  inbox.offer(encodeSnapshot(host, null).bytes)
  await inbox.whenIdle()
  assert.equal(haveKey, true)
  assert.deepEqual(guest.type, host.type)
})

test('leaving or switching rooms invalidates a snapshot already being decompressed', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve }), applied = []
  const inbox = new SnapshotInbox(async bytes => { await gate; return bytes }, bytes => applied.push(bytes[0]), () => {})
  inbox.offer(new Uint8Array([1]))
  inbox.reset()
  release()
  await inbox.whenIdle()
  assert.deepEqual(applied, [])
  inbox.offer(new Uint8Array([2]))
  await inbox.whenIdle()
  assert.deepEqual(applied, [2])
})
