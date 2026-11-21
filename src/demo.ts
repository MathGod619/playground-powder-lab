import { type Point, type Sandbox } from './engine.ts'
import { Material as M, type Material } from './materials.ts'

export function makeDemo(world: Sandbox) {
  world.clear()
  const polygon = (vertices: Point[], material: Material) => {
    for (let y = Math.min(...vertices.map(p => p.y)); y <= Math.max(...vertices.map(p => p.y)); y++) {
      const intersections = vertices.flatMap((a, i) => {
        const b = vertices[(i + 1) % vertices.length]
        return (a.y <= y && b.y > y) || (b.y <= y && a.y > y)
          ? [a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)]
          : []
      }).sort((a, b) => a - b)
      for (let j = 0; j < intersections.length; j += 2) {
        for (let x = Math.ceil(intersections[j]); x <= intersections[j + 1]; x++) world.set(x, y, material)
      }
    }
  }
  const shape = (material: Material, ...points: [number, number][]) =>
    polygon(points.map(([x, y]) => ({ x, y })), material)

  // Jagged stone structures divide the chamber into separate basins.
  shape(M.Stone, [0, 151], [18, 151], [38, 181], [60, 198], [106, 198], [134, 187],
    [147, 159], [156, 155], [162, 177], [183, 202], [196, 205], [266, 205], [284, 186],
    [297, 169], [310, 152], [325, 161], [333, 185], [348, 203], [385, 203], [405, 184],
    [416, 164], [416, 232], [0, 232])
  shape(M.Stone, [20, 101], [34, 94], [61, 95], [81, 105], [114, 105], [125, 111],
    [117, 120], [87, 124], [55, 116], [31, 117])
  shape(M.Stone, [181, 91], [190, 85], [218, 80], [241, 83], [254, 96], [274, 103],
    [266, 111], [240, 109], [225, 100], [202, 102], [188, 103])
  shape(M.Stone, [316, 116], [340, 104], [355, 99], [386, 102], [406, 110], [416, 105],
    [416, 121], [386, 129], [356, 126], [338, 129], [325, 125])

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.cells[world.index(x, y)] !== M.Empty) continue
      const sandMound = y > 198 - (43 - Math.abs(x - 78) * 0.69) && x > 25 && x < 147
      const sandShelf = y > 108 - (34 - Math.abs(x - 54) * 0.78) && x >= 23 && x < 112 && y <= 104
      const waterPool = y >= 177 && x > 164 && x < 304
      const lavaPool = y >= 181 && x >= 326
      const oilShelf = y >= 92 && y < 106 && x > 352 && x < 393
      if (sandMound || sandShelf) world.set(x, y, M.Sand)
      else if (waterPool) world.set(x, y, M.Water)
      else if (lavaPool) world.set(x, y, M.Lava)
      else if (oilShelf) world.set(x, y, M.Oil)
    }
  }

  for (let x = 202; x < 232; x++) {
    for (let y = 64; y < 86; y++) {
      if (world.cells[world.index(x, y)] === M.Empty && world.random() > 0.3) world.set(x, y, M.Water)
    }
  }
  for (let n = 0; n < 50; n++) {
    const x = 363 + Math.floor(world.random() * 25)
    const y = 152 + Math.floor(world.random() * 27)
    world.set(x, y, world.random() < 0.45 ? M.Fire : M.Smoke)
  }
}
