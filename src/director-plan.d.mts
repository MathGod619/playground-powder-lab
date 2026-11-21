import type { ScenePlan, Environment } from './director-plan.ts'
export const MATERIALS: readonly string[]
export const SHAPES: readonly string[]
export const SCENE_NAMES: readonly string[]
export const PLAN_SCHEMA: Record<string, unknown>
export function validatePlan(value: unknown): ScenePlan
export const EMPTY_ENV: Environment
export const EXAMPLE_PLAN: ScenePlan
