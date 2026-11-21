import type { Camera } from './camera.ts'
import { WORLDS } from './worlds.ts'
import type { Settings } from './beat.ts'
import type { Sandbox } from './engine.ts'
import { Material as M } from './materials.ts'

type RGB = readonly [number, number, number]
const palette: RGB[][] = [
  [],
  [[190, 133, 66], [219, 164, 92], [238, 187, 111], [248, 211, 148]],
  [[28, 105, 167], [32, 130, 192], [42, 157, 211], [77, 185, 230]],
  [[202, 54, 40], [249, 85, 51], [255, 138, 55], [255, 205, 96]],
  [[39, 49, 57], [49, 61, 69], [59, 71, 79], [76, 89, 94]],
  [[103, 68, 144], [137, 89, 177], [163, 112, 204], [190, 143, 228]],
  [[189, 65, 36], [228, 92, 32], [244, 119, 42], [252, 162, 66]],
  [[59, 57, 76], [70, 67, 83], [82, 76, 94], [97, 88, 106]],
  [[171, 205, 77], [211, 238, 107], [232, 249, 146], [249, 255, 195]],
]
const chargeColor: RGB = [187, 248, 209]

export function createRenderer(canvas: HTMLCanvasElement, halo: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false })
  const glow = halo.getContext('2d')
  if (!ctx || !glow) throw new Error('Canvas 2D is unavailable.')
  const { width, height } = canvas
  const image = ctx.createImageData(width, height)
  const glowImage = glow.createImageData(width, height)
  const size = width * height
  const texture = new Uint8Array(size)
  const background = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    const hash = Math.imul(i ^ 0xa591, 0x45d9f3b)
    texture[i] = (hash ^ (hash >>> 16)) & 15
    const vignette = Math.abs(x - width / 2) / width
    background[i] = Math.max(0, Math.round(5 - vignette * 6 + y / height * 3))
  }
  ctx.imageSmoothingEnabled = false
  let lastWorld: Sandbox | null = null
  let lastRevision = -1
  let lastSettings: Settings | null = null
  let lastCamera: Camera | null = null
  const viewColumns = new Int32Array(width)
  const viewRows = new Int32Array(height)

  return (world: Sandbox, settings: Settings, camera: Camera) => {
    if (world === lastWorld && world.revision === lastRevision && lastCamera === camera && lastSettings &&
        settings.glow === lastSettings.glow && settings.grid === lastSettings.grid && settings.fx === lastSettings.fx) return
    lastWorld = world
    lastRevision = world.revision
    lastSettings = settings
    lastCamera = camera
    const { x: offsetX, y: offsetY, zoom } = camera
    const theme = WORLDS.find(scene => scene.id === world.template)?.sky ?? [12, 17, 23]
    for (let x = 0; x < width; x++) viewColumns[x] = Math.min(world.width - 1, Math.floor(offsetX + x / zoom))
    for (let y = 0; y < height; y++) viewRows[y] = Math.min(world.height - 1, Math.floor(offsetY + y / zoom))
    const data = image.data
    const light = glowImage.data
    if (settings.glow) light.fill(0)
    for (let y = 0; y < height; y++) {
      const worldY = viewRows[y]
      const gridStep = zoom < .75 ? 32 : 16
      const gridY = settings.grid && (worldY % gridStep < Math.max(1, Math.round(1 / zoom)))
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const offset = i * 4
        const worldX = viewColumns[x]
        const index = worldY * world.width + worldX
        const id = world.cells[index]
        const shade = texture[index % size]
        let color: RGB
        let rim = 0
        if (id === M.Empty) {
          const grid = gridY || (settings.grid && (worldX % gridStep < Math.max(1, Math.round(1 / zoom)))) ? 5 : 0
          const d = background[i] + grid + Number(shade === 0)
          data[offset] = theme[0] + d
          data[offset + 1] = theme[1] + d
          data[offset + 2] = theme[2] + d
        } else {
          const level = shade >= 15 ? 3 : shade >= 11 ? 2 : shade >= 5 ? 1 : 0
          color = world.charge[index] > 14 ? chargeColor : palette[id][level]
          if (worldY > 0 && world.cells[index - world.width] === M.Empty) {
            rim = id === M.Water || id === M.Lava ? 28 : id === M.Stone ? 14 : 6
          }
          data[offset] = color[0] + rim
          data[offset + 1] = color[1] + rim
          data[offset + 2] = color[2] + rim
          if (settings.glow && (id === M.Fire || id === M.Lava || id === M.Electricity ||
              world.charge[index] > 14 || (id === M.Water && rim > 0))) {
            light[offset] = data[offset]
            light[offset + 1] = data[offset + 1]
            light[offset + 2] = data[offset + 2]
            light[offset + 3] = id === M.Electricity ? 215 : 130
          }
        }
        data[offset + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
    if (settings.glow) glow.putImageData(glowImage, 0, 0)

    if (settings.fx && world.wave && world.wave.radius > 0) {
      const { x, y, radius, strength } = world.wave
      const alpha = (1 - radius / (world.width * 0.6)) * strength
      const centerX = (x - offsetX) * zoom
      const centerY = (y - offsetY) * zoom
      ctx.strokeStyle = `rgba(198, 226, 242, ${alpha * 0.58})`
      ctx.lineWidth = 0.65
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * zoom, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = `rgba(121, 178, 206, ${alpha * 0.15})`
      ctx.beginPath()
      ctx.arc(centerX, centerY, (radius + 3) * zoom, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (settings.fx && world.wind) {
      const { direction, strength, ticks } = world.wind
      const ocean = world.template === 'ocean'
      ctx.fillStyle = `rgba(135, 212, 215, ${strength * ticks / 74})`
      for (let n = 0; n < 32; n++) {
        const y = (n * 41 + 13) % (ocean ? height : height - 30)
        const progress = world.tickNumber * direction * (ocean && viewRows[y] > world.height * .63 ? -3 : 3)
        const x = (((n * 211 + progress) % width) + width) % width
        const cell = world.cells[viewRows[y] * world.width + viewColumns[x]]
        if (cell === M.Empty || (ocean && cell === M.Water)) ctx.fillRect(x, y, 4 + n % 6, 1)
      }
    }
  }
}
