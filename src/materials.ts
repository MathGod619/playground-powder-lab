export const Material = {
  Empty: 0,
  Sand: 1,
  Water: 2,
  Fire: 3,
  Stone: 4,
  Oil: 5,
  Lava: 6,
  Smoke: 7,
  Electricity: 8,
} as const

export type Material = typeof Material[keyof typeof Material]
export const MATERIALS = [
  { id: Material.Sand, name: 'Sand', color: '#efc479', behavior: 'Falls, piles up, and sinks through liquids.' },
  { id: Material.Water, name: 'Water', color: '#57c4ff', behavior: 'Flows, quenches fire, and conducts sparks.' },
  { id: Material.Fire, name: 'Fire', color: '#ff7752', behavior: 'Rises, ignites oil, and burns out into smoke.' },
  { id: Material.Stone, name: 'Stone', color: '#a2afbd', behavior: 'Holds its shape. Draw walls and ledges.' },
  { id: Material.Oil, name: 'Oil', color: '#c095ed', behavior: 'Floats on water. Ignites near heat or sparks.' },
  { id: Material.Lava, name: 'Lava', color: '#f89a50', behavior: 'Flows slowly and hardens on contact with water.' },
  { id: Material.Smoke, name: 'Smoke', color: '#a39fb6', behavior: 'Drifts upward and disperses.' },
  { id: Material.Electricity, name: 'Electricity', color: '#e5fa80', behavior: 'Sends short sparks through water and ignites oil.' },
] as const

export const MAX_LIFE = [0, 0, 0, 90, 0, 0, 0, 220, 12] as const
export const MAX_CHARGE = 30
