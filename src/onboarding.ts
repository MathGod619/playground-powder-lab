import { ERASE, M, type Tool } from './materials.ts'

/** Set once a player has finished or skipped the first-run guide. */
export const ONBOARDED_KEY = 'powder-rave-onboarded-v1'

/** The tools a new player sees until the guide is done. */
export const STARTER_TOOLS: readonly Tool[] = [M.Sand, M.Water, M.Fire, M.Glitter, M.Speaker, M.Bomb, ERASE]

export type CoachStep = 'paint' | 'bomb' | 'drop'

export const COACH_STEPS: readonly { id: CoachStep; title: string; detail: string }[] = [
  { id: 'paint', title: 'Paint something', detail: 'Drag on the world. It jumps on every kick.' },
  { id: 'bomb', title: 'Plant a bomb', detail: 'Pick Bomb and tap the ground.' },
  { id: 'drop', title: 'Hit DROP', detail: 'Everything goes off at once.' },
]

/**
 * A new player has neither finished the guide nor used the game before.
 * Settings are saved on every visit, so their presence marks a returning player from before the guide existed.
 */
export function isNewPlayer(storage: Pick<Storage, 'getItem'>, settingsKey: string) {
  try {
    return storage.getItem(ONBOARDED_KEY) === null && storage.getItem(settingsKey) === null
  } catch {
    return false
  }
}

/** Records a finished step. Steps can be done in any order; the guide is done when all are. */
export function completeStep(done: readonly CoachStep[], step: CoachStep): CoachStep[] {
  return done.includes(step) ? [...done] : [...done, step]
}

export const currentStep = (done: readonly CoachStep[]) => COACH_STEPS.find(step => !done.includes(step.id))?.id ?? null

/** The step that a paint action finishes, if any. Erasing teaches nothing. */
export function stepForPaint(tool: Tool, erase: boolean): CoachStep | null {
  if (erase || tool === ERASE) return null
  return tool === M.Bomb ? 'bomb' : 'paint'
}
