import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ERASE, M, PADS } from '../src/materials.ts'
import { completeStep, currentStep, isNewPlayer, ONBOARDED_KEY, STARTER_TOOLS, stepForPaint } from '../src/onboarding.ts'

const store = (items = {}) => ({ getItem: key => items[key] ?? null })

test('only a first-time visitor gets the guide', () => {
  assert.equal(isNewPlayer(store(), 'settings'), true)
  assert.equal(isNewPlayer(store({ [ONBOARDED_KEY]: '1' }), 'settings'), false)
  assert.equal(isNewPlayer(store({ settings: '{}' }), 'settings'), false, 'players from before the guide skip it')
  assert.equal(isNewPlayer({ getItem() { throw new Error('blocked') } }, 'settings'), false, 'blocked storage never traps a player in the guide')
})

test('steps finish in any order and the guide ends when all three are done', () => {
  let done = []
  assert.equal(currentStep(done), 'paint')
  done = completeStep(done, 'drop')
  assert.equal(currentStep(done), 'paint')
  done = completeStep(done, 'paint')
  done = completeStep(done, 'paint')
  assert.deepEqual(done, ['drop', 'paint'])
  assert.equal(currentStep(done), 'bomb')
  done = completeStep(done, 'bomb')
  assert.equal(currentStep(done), null)
})

test('painting and bombs map to their steps, erasing to none', () => {
  assert.equal(stepForPaint(M.Sand, false), 'paint')
  assert.equal(stepForPaint(M.Bomb, false), 'bomb')
  assert.equal(stepForPaint(M.Sand, true), null)
  assert.equal(stepForPaint(ERASE, false), null)
})

test('every starter tool is in the dock, including the bomb the guide asks for', () => {
  for (const tool of STARTER_TOOLS) assert.ok(PADS.some(pad => pad.tool === tool))
  assert.ok(STARTER_TOOLS.includes(M.Bomb))
})
