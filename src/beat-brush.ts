import { BEAT_GLITTER, BEAT_ROCKET, BEAT_SAND, M, type BeatTool } from './materials.ts'
import type { World } from './world.ts'

export type BrushBeats = { kick: boolean; hat: boolean; downbeat: boolean }

export function paintBeatBrush(world: World, x: number, y: number, radius: number, tool: BeatTool, beats: BrushBeats) {
  if (tool === BEAT_SAND && beats.kick) world.paint(x, y, radius, M.Sand)
  else if (tool === BEAT_GLITTER && beats.hat) world.paint(x, y, radius, M.Glitter)
  else if (tool === BEAT_ROCKET && beats.downbeat && x >= 0 && x < world.width && y >= 0 && y < world.height &&
    world.at(x, y) === M.Empty) world.set(x, y, M.Rocket)
}
