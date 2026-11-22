import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTROL, Controller } from '../src/controller.ts'

function gamepad(t) {
  const pad = { index: 0, connected: true, mapping: 'standard', buttons: [], axes: [] }
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
  t.after(() => { delete navigator.getGamepads })
  return pad
}

test('a starting press can wake the title screen without leaking into gameplay', t => {
  const pad = gamepad(t)
  const controller = new Controller()
  pad.buttons[0] = { pressed: true }

  assert.equal(controller.read(false, CONTROL.confirm | CONTROL.pause).pressed, CONTROL.confirm)
  assert.equal(controller.read(false).held & CONTROL.paint, 0)
  pad.buttons[0].pressed = false
  controller.read(false)
  pad.buttons[0].pressed = true
  assert.equal(controller.read(false).pressed, CONTROL.confirm | CONTROL.paint)
})

test('blocked and reconnecting controllers do not replay held actions', t => {
  const pad = gamepad(t)
  const controller = new Controller()
  pad.buttons[9] = { pressed: true }
  const wake = CONTROL.confirm | CONTROL.pause

  assert.equal(controller.read(true, wake).pressed, 0)
  assert.equal(controller.read(false, wake).pressed, 0)
  pad.connected = false
  assert.equal(controller.read(false), null)
  pad.connected = true
  assert.equal(controller.read(false).pressed, 0)
  pad.buttons[9].pressed = false
  controller.read(false)
  pad.buttons[9].pressed = true
  assert.equal(controller.read(false).pressed, CONTROL.pause)
})

test('each stick has its own dead zone and triggers do not confirm menu choices', t => {
  const pad = gamepad(t)
  const controller = new Controller()
  pad.axes = [.1, -.05, 0, 1]
  controller.read(false)
  pad.buttons[7] = { pressed: true }

  const input = controller.read(false)
  assert.deepEqual(input.aim, { x: 0, y: 0 })
  assert.deepEqual(input.fineAim, { x: 0, y: 1 })
  assert.equal(input.pressed, CONTROL.paint)
})

test('drop rumble uses a supported actuator and handles disconnection', async t => {
  const pad = gamepad(t)
  const controller = new Controller()
  const calls = []
  pad.vibrationActuator = {
    effects: ['dual-rumble'],
    async playEffect(effect, options) {
      calls.push([effect, options.duration])
      throw new Error('Controller disconnected')
    },
  }
  controller.read(false)
  assert.equal(controller.canRumble, true)
  await controller.rumbleDrop()
  pad.connected = false
  controller.read(false)
  assert.equal(controller.canRumble, false)
  await controller.rumbleDrop()
  assert.deepEqual(calls, [['dual-rumble', 240]])
})
