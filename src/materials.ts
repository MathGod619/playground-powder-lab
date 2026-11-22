export const M = {
  Empty: 0,
  Sand: 1,
  Water: 2,
  Wall: 3,
  Fire: 4,
  Oil: 5,
  Lava: 6,
  Smoke: 7,
  Glitter: 8,
  Plant: 9,
  Speaker: 10,
  Rocket: 11,
  Flower: 12,
  Gunpowder: 13,
  Bomb: 14,
  Gravel: 15,
  Bubble: 16,
  Brick: 17,
  Cloud: 18,
  /** Only ever a free particle: a short-lived glowing ember. */
  Spark: 99,
} as const

export type Material = typeof M[keyof typeof M]
export const ERASE = 200
/** Click to set off an explosion at the cursor. */
export const BLAST = 201
export const BEAT_SAND = 202, BEAT_GLITTER = 203, BEAT_ROCKET = 204
export type BeatTool = typeof BEAT_SAND | typeof BEAT_GLITTER | typeof BEAT_ROCKET
export type Tool = Material | typeof ERASE | typeof BLAST | BeatTool
export const isBeatTool = (tool: Tool): tool is BeatTool => tool === BEAT_SAND || tool === BEAT_GLITTER || tool === BEAT_ROCKET

/** Beats a freshly placed bomb waits before going off. */
export const BOMB_FUSE = 8
/** Fuse value meaning "only the drop (or fire) sets this off". */
export const BOMB_DROP_ONLY = 250

const table = (entries: [number, number][], fill = 0) => {
  const out = new Int8Array(256).fill(fill)
  for (const [k, v] of entries) out[k] = v
  return out
}

/** Heavier things sink through lighter fluids. */
export const DENSITY = table([
  [M.Empty, -3], [M.Smoke, -2], [M.Fire, -1], [M.Oil, 2], [M.Water, 3], [M.Glitter, 4], [M.Sand, 5],
  [M.Gunpowder, 5], [M.Lava, 6], [M.Gravel, 7], [M.Bomb, 8],
])
/** Cells other materials can move into (by density). */
export const FLUID = table([M.Empty, M.Smoke, M.Fire, M.Oil, M.Water, M.Lava].map(t => [t, 1]))
/** Cells the beat can throw into the air. */
export const HOPPER = table([M.Sand, M.Glitter, M.Water, M.Oil, M.Lava, M.Gunpowder, M.Gravel].map(t => [t, 1]))
/** Powders: fall and pile. */
export const POWDER = table([M.Sand, M.Glitter, M.Gunpowder, M.Gravel, M.Bomb].map(t => [t, 1]))
/** Solids a blast can smash into gravel. */
export const BREAKABLE = table([M.Wall, M.Brick, M.Speaker].map(t => [t, 1]))
/** Cells that bloom on the glow layer. */
export const GLOWS = table([M.Fire, M.Lava, M.Glitter, M.Flower, M.Rocket, M.Spark, M.Bomb].map(t => [t, 1]))

export type Pad = { tool: Tool; name: string; key: string; swatch: string; hint: string }

export const PADS: Pad[] = [
  { tool: M.Sand, name: 'Sand', key: '1', swatch: 'linear-gradient(135deg,#f6d38f,#d9a24f)', hint: 'Piles up. Jumps on every kick.' },
  { tool: M.Water, name: 'Water', key: '2', swatch: 'linear-gradient(135deg,#6fd2ff,#1f7fd6)', hint: 'Flows and sloshes with the midrange.' },
  { tool: M.Wall, name: 'Wall', key: '3', swatch: 'linear-gradient(135deg,#5a5670,#2f2c3d)', hint: 'Solid. Nothing moves it.' },
  { tool: M.Fire, name: 'Fire', key: '4', swatch: 'linear-gradient(135deg,#ffe066,#ff3d1f)', hint: 'Burns oil and plants. Sparks on hi-hats.' },
  { tool: M.Oil, name: 'Oil', key: '5', swatch: 'linear-gradient(135deg,#9a6bc4,#4b2a6b)', hint: 'Floats on water. Very flammable.' },
  { tool: M.Lava, name: 'Lava', key: '6', swatch: 'linear-gradient(135deg,#ffb347,#ff3300)', hint: 'Turns water to steam and itself to obsidian.' },
  { tool: M.Glitter, name: 'Glitter', key: '7', swatch: 'conic-gradient(from 0deg,#ff2bd6,#ffd22b,#2bffb1,#2bb8ff,#a02bff,#ff2bd6)', hint: 'Takes the current beat colour. Twinkles on treble.' },
  { tool: M.Plant, name: 'Seed', key: '8', swatch: 'linear-gradient(135deg,#8dff6b,#1f9a4a)', hint: 'Grows one step per beat and flowers on the drop.' },
  { tool: M.Speaker, name: 'Speaker', key: '9', swatch: 'radial-gradient(circle,#ff2bd6 0 22%,#16131f 24% 46%,#3b3650 48% 60%,#16131f 62%)', hint: 'Blasts everything nearby on each kick.' },
  { tool: M.Rocket, name: 'Rocket', key: '0', swatch: 'radial-gradient(circle at 50% 35%,#fff 0 18%,#ffcf4a 20% 34%,#ff2bd6 36% 52%,#3a1046 54%)', hint: 'Launches and bursts into sparks and glitter.' },
  { tool: M.Brick, name: 'Brick', key: 'C', swatch: 'repeating-linear-gradient(0deg,#a0522d 0 6px,#5a2e1a 6px 8px)', hint: 'Build with it. Blasts make it crumble and collapse.' },
  { tool: M.Gunpowder, name: 'Powder', key: 'G', swatch: 'radial-gradient(circle at 30% 30%,#6b6470,#26222b 70%)', hint: 'Lay a fuse. Fire makes it go off in a chain.' },
  { tool: M.Bomb, name: 'Bomb', key: 'B', swatch: 'radial-gradient(circle at 40% 35%,#ff8a8a 0 12%,#e01b3c 14% 45%,#3a0912 48%)', hint: 'One bomb per click. Goes off after 8 beats, on the drop, or near fire.' },
  { tool: M.Cloud, name: 'Cloud', key: 'V', swatch: 'radial-gradient(circle at 35% 40%,#fff,#b9c1d6 55%,#6c7590)', hint: 'Rains on hi-hats. Lightning on the drop.' },
  { tool: BLAST, name: 'Blast', key: 'X', swatch: 'radial-gradient(circle,#fff 0 12%,#ffd24a 16% 30%,#ff4a1f 34% 50%,#3a0f0f 54%)', hint: 'Click anywhere to blow it up. Brush size sets the radius.' },
  { tool: ERASE, name: 'Erase', key: 'E', swatch: 'repeating-linear-gradient(45deg,#2a2536 0 5px,#3a3449 5px 10px)', hint: 'Clears cells. Right-click also erases.' },
  { tool: BEAT_SAND, name: 'Kick Sand', key: 'J', swatch: 'linear-gradient(135deg,#fff1ba,#ea8c37)', hint: 'Hold to pour sand on each kick.' },
  { tool: BEAT_GLITTER, name: 'Hat Glitter', key: 'K', swatch: 'conic-gradient(#ff9cfa,#9051ff,#65f8ec,#ff9cfa)', hint: 'Hold to spray glitter on hi-hats.' },
  { tool: BEAT_ROCKET, name: 'Bar Rocket', key: 'L', swatch: 'radial-gradient(circle at 50% 35%,#fff 0 19%,#f586dc 22% 42%,#7843e2 46% 64%,#271545 68%)', hint: 'Hold to launch a rocket on the first kick of each group of four.' },
]

/** Fraction of brush cells filled per dab, so powders pour instead of stamping. */
export const BRUSH_DENSITY: Record<number, number> = {
  [M.Sand]: .4, [M.Water]: .55, [M.Wall]: 1, [M.Fire]: .5, [M.Oil]: .55, [M.Lava]: .55,
  [M.Glitter]: .4, [M.Plant]: 1, [M.Speaker]: 1, [M.Rocket]: .02, [M.Gunpowder]: .5, [M.Brick]: 1, [M.Cloud]: .7,
}
/** Solid tools are drawn along the stroke; others keep pouring while the pointer is held still. */
export const isSolidTool = (tool: Tool) => tool === M.Wall || tool === M.Speaker || tool === M.Brick || tool === M.Cloud
/** Tools that act once per click instead of painting. */
export const isClickTool = (tool: Tool) => tool === M.Bomb || tool === BLAST
/** Solid tools may overwrite loose material when painted over it. */
export const OVERWRITES = table([M.Wall, M.Speaker, M.Brick, M.Cloud].map(t => [t, 1]))
