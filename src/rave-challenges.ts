import { pack } from './color.ts'
import type { RaveObjective } from './immersion.ts'
import { M } from './materials.ts'
import { CITY_TOWERS, cityStreet } from './scenes.ts'
import type { SceneId, World } from './world.ts'

export type RaveMode = 'freestyle' | 'skyline' | 'garden'
export const SKYLINE_GOAL = 6
export const GARDEN_GOAL = 6
const BED_NAMES = ['Left', 'Center', 'Right']
const WAVES = [[0, 1], [1, 2], [0, 2]]

export const RAVE_MODES: { id: RaveMode; name: string; scene?: SceneId; detail: string }[] = [
  { id: 'freestyle', name: 'Freestyle', detail: 'Three drops on your current world. Chain reactions and on-beat timing earn points.' },
  { id: 'skyline', name: 'Topple the Skyline', scene: 'city', detail: 'Plant charges in the towers. Bring down six of eight towers with one drop.' },
  { id: 'garden', name: 'Keep the Garden Alive', scene: 'garden', detail: 'Use water to protect at least six of nine roots through three lava waves.' },
]

export type ChallengeMarker = { x: number; y: number; label: string }
type PreparedChallenge = {
  objective: RaveObjective
  markers?: ChallengeMarker[]
  hint: (drops: number, scoring?: boolean) => string
}

function skyline(world: World): PreparedChallenge {
  const { width, height } = world, street = cityStreet(height)
  const towers = CITY_TOWERS.map(([left, right, top]) => ({
    x0: Math.floor(width * left), x1: Math.floor(width * right), y0: Math.floor(height * top),
  }))
  // Keep the ordinary Demolition world wired. This version starts with unarmed towers.
  for (const tower of towers) for (const fraction of [.25, .75]) {
    const x = Math.floor(tower.x0 + (tower.x1 - tower.x0) * fraction)
    world.set(x, street - 1, M.Brick)
  }
  const census = () => towers.map(({ x0, x1, y0 }) => {
    let bricks = 0
    for (let y = y0; y < street; y++) for (let x = x0; x < x1; x++) {
      if (world.at(x, y) === M.Brick) bricks++
    }
    return bricks
  })
  const initial = census()
  let beforeDrop: number[] | null = null
  return {
    objective: {
      dropLimit: 1, target: SKYLINE_GOAL, impactSeconds: 5,
      beforeDrop: () => { beforeDrop = census() },
      measure: () => {
        if (!beforeDrop) return 0
        const before = beforeDrop
        return census().filter((remaining, i) => before[i] - remaining >= initial[i] * .60).length
      },
    },
    hint: drops => drops ? 'Wait for the towers to settle.' : 'Plant several bombs inside each tower, starting low.',
  }
}

function garden(world: World): PreparedChallenge {
  const { width, height } = world
  const y = Math.floor(height * .63), spacing = Math.max(4, Math.round(width * .026))
  const soil = pack(64, 77, 97), rim = pack(109, 161, 148)
  const beds = [.20, .50, .80].map((u, i) => {
    const center = Math.floor(width * u), radius = spacing + 4
    for (let x = center - radius; x <= center + radius; x++) {
      const floor = world.index(x, y + 1)
      world.put(floor, M.Wall)
      world.color[floor] = soil
      if (x === center - radius || x === center + radius) {
        for (let edge = y - 2; edge <= y; edge++) {
          const cell = world.index(x, edge)
          world.put(cell, M.Wall)
          world.color[cell] = rim
        }
      }
    }
    const roots = [center - spacing, center, center + spacing]
    for (const x of [center - Math.floor(spacing / 2), center + Math.floor(spacing / 2)]) {
      world.set(x, y, M.Wall)
      world.set(x, y - 1, M.Wall)
      world.color[world.index(x, y)] = world.color[world.index(x, y - 1)] = rim
    }
    for (const x of roots) world.set(x, y, M.Plant, 4)
    return { roots, marker: { x: center, y: y + 2, label: BED_NAMES[i] } }
  })
  const isWatered = (x: number) => [-1, 0, 1].some(dx =>
    world.at(x + dx, y) === M.Water || world.at(x + dx, y - 1) === M.Water)
  let watered = new Set<number>()

  return {
    objective: {
      dropLimit: 3, target: GARDEN_GOAL, chargeSeconds: 4,
      measure: () => beds.reduce((sum, bed) => sum + bed.roots.filter(x => {
        const cell = world.at(x, y)
        return cell === M.Plant || cell === M.Flower
      }).length, 0),
      beforeDrop: () => { watered = new Set(beds.flatMap(bed => bed.roots.filter(isWatered))) },
      afterDrop: drop => {
        for (const bed of WAVES[drop - 1]) for (const x of beds[bed].roots) {
          if (watered.has(x) || isWatered(x)) continue
          const inlet = x + (drop === 2 ? -1 : 1)
          const cell = world.at(inlet, y)
          if (cell === M.Empty || cell === M.Smoke || cell === M.Plant || cell === M.Flower) world.set(inlet, y, M.Lava)
        }
      },
    },
    markers: beds.map(bed => bed.marker),
    hint: (drops, scoring) => {
      const wave = WAVES[scoring ? drops - 1 : drops]
      if (!wave) return ''
      const beds = wave.map(i => BED_NAMES[i].toLowerCase()).join(' and ')
      return scoring ? `Lava in the ${beds} beds. Keep watering!` : `Water the ${beds} beds before drop ${drops + 1}.`
    },
  }
}

export function prepareChallenge(mode: RaveMode, world: World): PreparedChallenge | null {
  if (mode === 'skyline') return skyline(world)
  if (mode === 'garden') return garden(world)
  return null
}
