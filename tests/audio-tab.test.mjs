import test from 'node:test'
import assert from 'node:assert/strict'
import { AudioEngine } from '../src/audio.ts'

class FakeNode {
  connections = []
  connect(node) { this.connections.push(node); return node }
  disconnect() { this.connections = [] }
}

class FakeAudioContext {
  state = 'running'
  sampleRate = 48000
  destination = new FakeNode()
  createAnalyser() { return Object.assign(new FakeNode(), { fftSize: 0, smoothingTimeConstant: 0 }) }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: { value: 0 },
      ratio: { value: 0 },
    })
  }
  createGain() { return Object.assign(new FakeNode(), { gain: { value: 0 } }) }
  createMediaStreamDestination() { return Object.assign(new FakeNode(), { stream: { getTracks: () => [] } }) }
  createBuffer(_channels, length) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  createMediaStreamSource(stream) { return Object.assign(new FakeNode(), { stream }) }
  resume() { this.state = 'running'; return Promise.resolve() }
}

function fakeTrack() {
  return {
    stopped: false,
    listeners: new Map(),
    stop() { this.stopped = true },
    addEventListener(name, fn) { this.listeners.set(name, fn) },
  }
}

test('tab mode requests browser-tab audio and attaches the captured audio stream', async () => {
  globalThis.AudioContext = FakeAudioContext
  const audioTrack = fakeTrack()
  const videoTrack = fakeTrack()
  const stream = {
    getAudioTracks: () => [audioTrack],
    getTracks: () => [audioTrack, videoTrack],
  }
  let requested
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: async constraints => { requested = constraints; return stream } } },
  })

  const engine = new AudioEngine()
  await engine.listenTab()

  assert.deepEqual(requested, { video: true, audio: true })
  assert.equal(engine.mode, 'tab')
  assert.equal(audioTrack.listeners.has('ended'), true)

  engine.stop()
  assert.equal(audioTrack.stopped, true)
  assert.equal(videoTrack.stopped, true)
})

test('tab mode rejects a share that omitted tab audio and stops its tracks', async () => {
  globalThis.AudioContext = FakeAudioContext
  const videoTrack = fakeTrack()
  const stream = {
    getAudioTracks: () => [],
    getTracks: () => [videoTrack],
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: async () => stream } },
  })

  await assert.rejects(
    new AudioEngine().listenTab(),
    /Tick “Share tab audio”/,
  )
  assert.equal(videoTrack.stopped, true)
})
