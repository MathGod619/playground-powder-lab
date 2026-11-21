import test from 'node:test'
import assert from 'node:assert/strict'
import { renderServiceUnit } from '../server/service-unit.mjs'
import { validatePlan, EXAMPLE_PLAN } from '../src/director-plan.mjs'

test('service emits an absolute unquoted WorkingDirectory, keeping ExecStart argument quoting', () => {
  const root = '/home/serveroverlord/projects/powder-rave-director'
  const unit = renderServiceUnit({ root, node: '/usr/bin/node', envPath: '/home/serveroverlord/.config/powder-rave-director/bridge.env' })
  assert.equal(unit.split('\n').find(l => l.startsWith('WorkingDirectory=')), 'WorkingDirectory=' + root)
  assert.ok(unit.includes('EnvironmentFile=/home/serveroverlord/.config/powder-rave-director/bridge.env\n'))
  assert.ok(unit.includes('ExecStart="/usr/bin/node" "' + root + '/server/director.mjs"'))
  assert.ok(unit.includes('Restart=on-failure'))
  assert.ok(unit.includes('WantedBy=default.target'))
  assert.equal(unit.includes('DIRECTOR_TOKEN='), false, 'secret is loaded from private file, never placed in unit')
})
test('service handles spaces and literal percent in install paths, and rejects injected directives', () => {
  const unit = renderServiceUnit({ root: '/home/test/Scene 100%', node: '/usr/bin/node', envPath: '/home/test/bridge.env' })
  assert.ok(unit.includes('WorkingDirectory=/home/test/Scene 100%%\n'))
  assert.throws(() => renderServiceUnit({ root: '/tmp/game\nExecStart=/bin/sh', node: '/usr/bin/node', envPath: '/tmp/bridge.env' }))
  assert.throws(() => renderServiceUnit({ root: 'relative/path', node: '/usr/bin/node', envPath: '/tmp/bridge.env' }))
})
test('finite hue angles wrap without mutating model output; invalid physics remain rejected', () => {
  for (const [input, expected] of [[420, 60], [-60, 300], [720, 0], [360, 0], [285, 285]]) {
    const p = structuredClone(EXAMPLE_PLAN); p.environment.hue = input
    assert.equal(validatePlan(p).environment.hue, expected)
    assert.equal(p.environment.hue, input)
  }
  for (const invalid of [Infinity, NaN, 'purple']) {
    const p = structuredClone(EXAMPLE_PLAN); p.environment.hue = invalid
    assert.throws(() => validatePlan(p))
  }
  const p = structuredClone(EXAMPLE_PLAN); p.environment.gravity = 99
  assert.throws(() => validatePlan(p), /gravity/)
})
