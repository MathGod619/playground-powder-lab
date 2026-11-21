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
test('coordinate grammar enumerates legal percentages instead of relying on range annotations', () => {
  const props = modelSchema('create').properties.operations.items.properties
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.equal(props[key].type, 'integer')
    assert.equal(props[key].enum.at(-1), 100)
    assert.equal(props[key].enum.includes(110), false)
    assert.equal(props[key].enum[0], key === 'x' || key === 'y' ? 0 : 1)
  }
})
test('explicit percent overshoot y=110 stays visible while preserving rectangle dimensions', () => {
  const p = structuredClone(EXAMPLE_PLAN)
  p.coordinateSpace = 'percent'
  p.operations = [{ shape: 'rect', material: 'seed', x: 20, y: 110, w: 8, h: 20, color: '#00ff00' }]
  const out = parseModelPlan(p).operations[0]
  assert.deepEqual([out.x, out.y, out.w, out.h], [.2, .8, .08, .2])
  assert.equal(p.operations[0].y, 110)
})
test('small overshoots fit either explicit unit system, including negative edges and oversize shapes', () => {
  for (const units of ['percent', 'normalized']) {
    const p = structuredClone(EXAMPLE_PLAN), scale = units === 'percent' ? 100 : 1
    p.coordinateSpace = units
    p.operations = [{ ...p.operations[0], x: -.1 * scale, y: 1.1 * scale, w: 1.1 * scale, h: .3 * scale }]
    const op = parseModelPlan(p).operations[0]
    assert.deepEqual([op.x, op.y, op.w, op.h], [0, .7, 1, .3])
  }
})
test('gross overshoot, missing units, nonfinite values and negative sizes cannot be silently fitted', () => {
  for (const [units, key, value] of [
    ['percent', 'y', 150], ['percent', 'x', -50], ['percent', 'w', 200],
    ['percent', 'h', -10], ['percent', 'y', Infinity], ['percent', 'x', '110'],
    [undefined, 'y', 1.1],
  ]) {
    const p = structuredClone(EXAMPLE_PLAN)
    if (units) p.coordinateSpace = units
    p.operations[0][key] = value
    assert.throws(() => parseModelPlan(p), /Operation 1/)
  }
})
