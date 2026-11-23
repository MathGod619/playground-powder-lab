import assert from 'node:assert/strict'
import test from 'node:test'

test('clip dimensions and world placement follow the playfield, not the browser window', async () => {
  const old = Object.fromEntries(['document', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'MediaRecorder'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  const draws = [], canvases = []
  const ctx = {
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {},
    drawImage: (...args) => draws.push(args),
  }
  try {
    globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 2
    globalThis.document = { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ addTrack() {}, getVideoTracks: () => [] }) }
      canvases.push(canvas)
      return canvas
    } }
    globalThis.MediaRecorder = class {
      static isTypeSupported() { return true }
      state = 'inactive'
      start() { this.state = 'recording' }
    }
    const { ClipRecorder } = await import('../src/recorder.ts')
    const recorder = new ClipRecorder()
    recorder.setViewport(1256, 474)
    recorder.start(10, null)
    assert.equal(canvases[0].width, 1280)
    assert.equal(canvases[0].height, Math.round(1280 * 474 / 1256) & ~1)
    const layers = Object.fromEntries(['sky', 'base', 'glow', 'bloom', 'overlay'].map(k => [k, { id: k }]))
    recorder.frame(layers, { hue: 30, pulse: { kick: 0 }, width: 628, height: 237, scene: 'garden' }, { x: 0, y: 0, scale: 2 }, 1, [0, 0])
    const base = draws.find(args => args[0] === layers.base)
    assert.equal(base[1], 0)
    assert.equal(base[2], 0, 'no toolbar offset is added to the recorded canvas')
    assert.equal(base[3], 1280, 'world fills the clip width at the playfield scale')
  } finally {
    for (const [key, descriptor] of Object.entries(old)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
