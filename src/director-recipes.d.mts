import type { ScenePlan } from './director-plan.ts'
export const SCENE_RECIPES: readonly { id: string; name: string }[]
export function getRecipe(id: string): ScenePlan
export function withRecipe(input: ScenePlan, id: string): ScenePlan
