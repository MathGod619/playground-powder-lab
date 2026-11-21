import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConnection, saveConnection, forgetConnection } from '../src/director-connection.mjs'
const storage = () => {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
}
test('connection is persisted only by explicit opt-in and is restored on later visits', () => {
  const s = storage(), url = 'https://server.example:8443', token = 'test-connection-token-00000000000000000'
  saveConnection(s, url, token, false)
  assert.equal(loadConnection(s).token, '')
  saveConnection(s, url, token, true)
  assert.deepEqual(loadConnection(s), { url, token, remember: true })
  saveConnection(s, url, token, false)
  assert.equal(loadConnection(s).token, '')
})
test('forget removes both saved credentials and the legacy endpoint', () => {
  const s = storage()
  s.setItem('powder-rave-director-url', 'https://old.example')
  saveConnection(s, 'https://new.example', 'test-connection-token-00000000000000000', true)
  forgetConnection(s)
  assert.equal(loadConnection(s).remember, false)
  assert.equal(s.getItem('powder-rave-director-url'), null)
})
test('unavailable or malformed browser storage does not crash loading', () => {
  assert.equal(loadConnection({ getItem() { throw Error('blocked') } }).remember, false)
  assert.equal(loadConnection({ getItem() { return 'not-json' } }).remember, false)
})
