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
  for (const key of ['x', 'y', 'w', 'h']) properties[key] = { type: 'number', minimum: 0, maximum: 100 }
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
    plan.operations.forEach((o, index) => {
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
    })
  }
  return validatePlan(plan)
}
