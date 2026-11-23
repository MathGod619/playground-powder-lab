import assert from 'node:assert/strict'
import test from 'node:test'
import { effectProfile } from '../src/device-performance.ts'

test('Auto limits phone rendering without reducing desktop effects', () => {
  const phone = effectProfile('auto', true), desktop = effectProfile('auto', false)
  assert.equal(phone.fps, 30)
  assert.equal(phone.dpr, 1)
  assert.equal(phone.glow, false)
  assert.equal(desktop.fps, 60)
  assert.equal(desktop.dpr, 2)
  assert.equal(desktop.glow, true)
})

test('explicit quality choices override automatic device detection', () => {
  assert.equal(effectProfile('full', true).light, false)
  assert.equal(effectProfile('light', false).light, true)
})
