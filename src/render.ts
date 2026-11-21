import { FIRE_PALETTE, half, hsl } from './color.ts'
import { ERASE, GLOWS, M, type Tool } from './materials.ts'
import type { World } from './world.ts'

export type View = { x: number; y: number; scale: number }
export type Cursor = { sx: number; sy: number } | null

/**
 * Draws the grid into a pixelated canvas plus a glow canvas that only holds emissive cells.
 * The page blurs the glow canvases with CSS and screens them on top, which reads as bloom.
 */
export function createRenderer(world: World, base: HTMLCanvasElement, glow: HTMLCanvasElement, bloom: HTMLCanvasElement) {
  const { width: W, height: H, size: N } = world
  base.width = glow.width = W
  base.height = glow.height = H
  bloom.width = Math.max(1, W >> 1)
  bloom.height = Math.max(1, H >> 1)
  const ctx = base.getContext('2d')!, gctx = glow.getContext('2d')!, bctx = bloom.getContext('2d')!
  const image = ctx.createImageData(W, H), pix = new Uint32Array(image.data.buffer)
  const glowImage = gctx.createImageData(W, H), gpix = new Uint32Array(glowImage.data.buffer)

  return function draw() {
    const { type, color, life, pulse } = world
    gpix.fill(0)
    const twinkle = pulse.twinkle > .05, speaker = pulse.speaker
    const speakerColor = hsl(world.hue, 100, 62), surf = hsl(195, 100, 70 + pulse.kick * 15)
    const frameHash = Math.imul(world.frame, 2654435761)
    for (let i = 0; i < N; i++) {
      const t = type[i]
      if (t === M.Empty) { pix[i] = 0; continue }
      let c = color[i]
      switch (t) {
        case M.Fire: c = FIRE_PALETTE[life[i]]; gpix[i] = c; break
        case M.Smoke: c = ((c & 0xffffff) | ((Math.min(1, life[i] / 140) * 150 | 0) << 24)) >>> 0; break
        case M.Lava: case M.Flower: case M.Rocket: gpix[i] = c; break
        case M.Glitter:
          if (twinkle && ((Math.imul(i, 2246822519) ^ frameHash) >>> 0) % 61 === 0) { c = 0xffffffff; gpix[i] = c }
          else gpix[i] = half(c)
          break
        case M.Speaker:
          if (speaker > .05 && (c & 0xff) > 30) { c = speakerColor; gpix[i] = c }
          else if (speaker > .05 && ((i % W + (i / W | 0)) & 1) === 0) gpix[i] = half(speakerColor)
          break
        case M.Water: if (i >= W && type[i - W] === M.Empty) { c = surf; gpix[i] = half(half(c)) } break
        case M.Plant: if (life[i] > 0) { c = 0xff70ff70; gpix[i] = half(c) } break
      }
      pix[i] = c
    }
    for (let k = 0; k < world.particles; k++) {
      const x = world.px[k] | 0, y = world.py[k] | 0
      if (x < 0 || x >= W || y < 0 || y >= H) continue
      const i = y * W + x, t = world.pType[k], c = world.pColor[k]
      if (t === M.Spark) {
        const a = Math.min(1, world.pLife[k] / 25)
        pix[i] = a < 1 ? ((c & 0xffffff) | ((a * 255 | 0) << 24)) >>> 0 : c
        gpix[i] = c
      } else {
        pix[i] = c
        if (GLOWS[t]) gpix[i] = c
      }
    }
    ctx.putImageData(image, 0, 0)
    gctx.putImageData(glowImage, 0, 0)
    bctx.clearRect(0, 0, bloom.width, bloom.height)
    bctx.drawImage(glow, 0, 0, bloom.width, bloom.height)
  }
}

/** Screen-space overlay: shockwave rings, the brush cursor and the drop flash. */
export function drawOverlay(ctx: CanvasRenderingContext2D, world: World, view: View, dpr: number, cursor: Cursor, brush: number, tool: Tool) {
  const s = view.scale * dpr, ox = view.x * dpr, oy = view.y * dpr
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (let k = world.rings.length - 1; k >= 0; k--) {
    const ring = world.rings[k]
    ring.r += (ring.max - ring.r) * .12 + .6
    const a = 1 - ring.r / ring.max
    if (a <= 0) { world.rings.splice(k, 1); continue }
    const X = ox + ring.x * s, Y = oy + ring.y * s, R = ring.r * s
    ctx.strokeStyle = `hsla(${ring.hue},100%,65%,${a * .25})`
    ctx.lineWidth = R * .25
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.stroke()
    ctx.strokeStyle = `hsla(${ring.hue},100%,80%,${a * .9})`
    ctx.lineWidth = ring.width * dpr
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.stroke()
  }
  if (cursor) {
    const X = cursor.sx * dpr, Y = cursor.sy * dpr, R = Math.max(3, brush * view.scale) * dpr
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = tool === ERASE ? 'rgba(255,255,255,.8)' : `hsla(${world.hue % 360},100%,75%,.9)`
    ctx.setLineDash(tool === ERASE ? [4 * dpr, 4 * dpr] : [])
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.fillRect(X - dpr, Y - dpr, 2 * dpr, 2 * dpr)
  }
  if (world.pulse.flash > .01) {
    ctx.fillStyle = `rgba(255,240,255,${world.pulse.flash * .55})`
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
}
