export const MATERIALS = ['sand', 'water', 'wall', 'fire', 'oil', 'lava', 'smoke', 'glitter', 'seed', 'speaker', 'rocket', 'brick', 'powder', 'bomb', 'cloud'] as const
export const SHAPES = ['rect', 'ellipse', 'line', 'tower', 'bridge', 'bomb', 'speaker', 'plant', 'rock', 'arch', 'building', 'terrain', 'aquarium', 'speaker-stack'] as const
export const SCENE_NAMES = ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank'] as const
export type Operation = { shape: typeof SHAPES[number]; material: typeof MATERIALS[number]; x: number; y: number; w: number; h: number; color: string | null }
export type Environment = { gravity: number | null; fall: number | null; wind: number | null; hue: number | null; waterColor: string | null; kick: number | null; speakers: number | null; sparks: number | null; slosh: number | null }
export type ScenePlan = { title: string; description: string; scene: typeof SCENE_NAMES[number] | null; environment: Environment; operations: Operation[] }

// Both the browser and plain Node bridge use this single runtime validator.
export { PLAN_SCHEMA, validatePlan, EMPTY_ENV, EXAMPLE_PLAN } from './director-plan.mjs'
