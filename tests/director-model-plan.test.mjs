import test from 'node:test'
import assert from 'node:assert/strict'
import { modelSchema, parseModelPlan } from '../server/model-plan.mjs'
import { EXAMPLE_PLAN } from '../src/director-plan.mjs'

test('model percent coordinates convert to the game fractions without mutating output', () => {
  const input = structuredClone(EXAMPLE_PLAN)
  input.coordinateSpace = 'percent'
  for (const op of input.operations) for (const key of ['x', 'y', 'w', 'h']) op[key] *= 100
  const out = parseModelPlan(input)
  for (let i = 0; i < input.operations.length; i++) for (const key of ['x', 'y', 'w', 'h'])
    assert.ok(Math.abs(out.operations[i][key] - EXAMPLE_PLAN.operations[i][key]) < 1e-10)
  assert.equal('coordinateSpace' in out, false)
  assert.equal(input.coordinateSpace, 'percent')
})
test('explicit percent strings convert and harmless zero-size strokes become visible', () => {
  const p = structuredClone(EXAMPLE_PLAN)
  p.operations[0] = { ...p.operations[0], x: '20%', y: '40%', w: 0, h: '45%' }
  const result = parseModelPlan(p)
  assert.deepEqual([result.operations[0].x, result.operations[0].y, result.operations[0].w, result.operations[0].h], [.2, .4, .005, .45])
})
test('invalid units, unknown tools, large coordinates and negative sizes still fail with useful errors', () => {
  const p = structuredClone(EXAMPLE_PLAN)
  p.coordinateSpace = 'cells'
  assert.throws(() => parseModelPlan(p), /coordinateSpace/)
  delete p.coordinateSpace
  p.operations[0].x = 150
  assert.throws(() => parseModelPlan(p), /Operation 1.*x=150/)
  p.operations[0].x = .2; p.operations[0].h = -.1
  assert.throws(() => parseModelPlan(p), /Operation 1.*h=-0.1/)
  p.operations[0].h = .2; p.operations[0].shape = 'exec'
  assert.throws(() => parseModelPlan(p), /Unsupported/)
})
test('percent grammar and mode constraints are independent for each request', () => {
  const edit = modelSchema('adjust'), create = modelSchema('create')
  assert.deepEqual(edit.properties.scene, { type: 'null' })
  assert.deepEqual(create.properties.coordinateSpace.enum, ['percent'])
  assert.equal(create.properties.operations.items.properties.x.maximum, 100)
  edit.properties.operations.maxItems = 1
  assert.equal(create.properties.operations.maxItems, 16)
})
