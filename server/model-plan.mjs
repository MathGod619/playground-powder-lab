import { PLAN_SCHEMA, validatePlan } from '../src/director-plan.mjs'

// Keep the model's drawing contract simple. Conversion happens once here; the
// game continues to receive only its strict 0..1 scene-plan format.
export function modelSchema(mode) {
  const format = structuredClone(PLAN_SCHEMA)
  format.required.push('coordinateSpace')
  format.properties.coordinateSpace = { type: 'string', enum: ['percent'] }
  format.properties.scene = mode === 'adjust' ? { type: 'null' } :
    { type: 'string', enum: ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank'] }
  format.properties.operations.maxItems = 16
  const properties = format.properties.operations.items.properties
  // Enumerate legal percentages: numeric min/max alone did not prevent the
  // installed model from emitting 110 even on its repair attempt.
  for (const key of ['x', 'y', 'w', 'h']) {
    const min = key === 'x' || key === 'y' ? 0 : 1
    properties[key] = { type: 'integer', minimum: min, maximum: 100,
      enum: Array.from({ length: 101 - min }, (_, i) => i + min) }
  }
  return format
}

export function parseModelPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validatePlan(raw)
  const plan = structuredClone(raw)
  const units = plan.coordinateSpace
  if (units !== undefined && units !== 'percent' && units !== 'normalized')
    throw Error('coordinateSpace must be percent or normalized.')
  delete plan.coordinateSpace
  if (Array.isArray(plan.operations)) {
    plan.operations.forEach(o => {
      if (!o || typeof o !== 'object') return
      for (const key of ['x', 'y', 'w', 'h']) {
        let value = o[key]
        if (typeof value === 'string' && /^-?\d+(\.\d+)?%$/.test(value))
          value = Number(value.slice(0, -1)) / 100
        else if (typeof value === 'number' && units === 'percent') value /= 100
        // Degenerate shapes are visible one-cell strokes rather than broken
        // model plans. Do not infer units or clamp arbitrary large positions.
        if ((key === 'w' || key === 'h') && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < .005)
          value = .005
        // Tolerate floating point rounding at the two borders only.
        if (typeof value === 'number' && Number.isFinite(value)) {
          if (value < 0 && value >= -1e-6) value = 0
          if (value > 1 && value <= 1 + 1e-6) value = 1
        }
        o[key] = value
      }
      // Explicit units let us correct modest layout overshoot without guessing
      // whether the model meant pixels, fractions or percentages. Keep the
      // shape's size, moving it just far enough to fit; shrink oversized shapes.
      // Gross mistakes, invalid types and negative sizes still go to repair.
      if (units === 'percent' || units === 'normalized') {
        for (const [position, size] of [['x', 'w'], ['y', 'h']]) {
          const start = o[position], extent = o[size]
          if (typeof start !== 'number' || !Number.isFinite(start) || start < -.25 || start > 1.25 ||
              typeof extent !== 'number' || !Number.isFinite(extent) || extent < .005 || extent > 1.25) continue
          if (start < 0 || start > 1 || extent > 1) {
            o[size] = Math.min(1, extent)
            o[position] = Math.max(0, Math.min(start, 1 - o[size]))
          }
        }
      }
    })
  }
  return validatePlan(plan)
}
