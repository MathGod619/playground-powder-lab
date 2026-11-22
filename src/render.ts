import { FIRE_PALETTE, half, hsl } from './color.ts'
import { drawBoss } from './boss.ts'
import { drawCrowd } from './crowd.ts'
import { BLAST, BOMB_DROP_ONLY, ERASE, GLOWS, M, type Tool } from './materials.ts'
import type { ChallengeMarker } from './rave-challenges.ts'
import type { World } from './world.ts'

export type View = { x: number; y: number; scale: number }
export type Cursor = { sx: number; sy: number }
export type BrushCursor = Cursor & { brush: number; tool: Tool; player?: number; label?: string; color?: string }

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

  /**
   * `night` (0–1) darkens everything that does not glow and tints it moonlight blue, so only lava, fire,
   * glitter, lit windows, sparks and glow sticks show. The drop flash and kicks briefly light the world up.
   */
  return function draw(night = 0) {
    const { type, color, life, pulse } = world
    gpix.fill(0)
    const twinkle = pulse.twinkle > .05, speaker = pulse.speaker
    const speakerColor = hsl(world.hue, 100, 50 + world.energy.bass * 25), surf = hsl(195 + Math.sin(world.frame * .03) * world.energy.mid * 30, 100, 60 + pulse.kick * 15 + world.energy.mid * 15)
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
        case M.Plant: if (life[i] > 0) { c = hsl(115 + Math.sin(world.frame * .025 + i % W * .05) * world.energy.mid * 30, 90, 45 + world.energy.level * 25); gpix[i] = half(c) } break
        case M.Brick: if (life[i] === 1) gpix[i] = half(c); break
        case M.Bomb: {
          const fuse = life[i], urgent = fuse > 0 && fuse <= 3
          const on = pulse.kick > .55 || (urgent && (world.frame >> 2) & 1)
          c = on ? 0xff6060ff : c
          gpix[i] = on ? 0xff4040ff : half(c)
          if (fuse >= BOMB_DROP_ONLY && !on) gpix[i] = 0
          break
        }
        case M.Bubble: if (i >= W && type[i - W] !== M.Water) gpix[i] = half(c); break
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
    if (world.ravers.length) drawCrowd(world, pix, gpix)
    if (world.boss) drawBoss(world, pix, gpix)
    if (night > 0) darken(world, pix, gpix, night)
    ctx.putImageData(image, 0, 0)
    gctx.putImageData(glowImage, 0, 0)
    bctx.clearRect(0, 0, bloom.width, bloom.height)
    bctx.drawImage(glow, 0, 0, bloom.width, bloom.height)
  }
}

function darken(world: World, pix: Uint32Array, gpix: Uint32Array, night: number) {
  const p = world.pulse
  const light = Math.min(1, .07 + p.flash * 1.15 + p.kick * .05 + world.energy.level * .05)
  const dark = night * (1 - light), k = 1 - dark
  if (k > .995) return
  const kr = k * (1 - .25 * dark) * 256 | 0, kg = k * (1 - .1 * dark) * 256 | 0, kb = Math.min(256, k * (1 + .5 * dark) * 256) | 0
  for (let i = 0; i < pix.length; i++) {
    const c = pix[i]
    if (!c || gpix[i]) continue
    const r = ((c & 255) * kr) >> 8, g = (((c >>> 8) & 255) * kg) >> 8, b = (((c >>> 16) & 255) * kb) >> 8
    pix[i] = ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0
  }
}

const bombLabels: number[] = []

/** Blast tool radius for a given brush size. */
export const blastRadius = (brush: number) => Math.round(brush * 1.4 + 4)

/** Screen-space overlay: shockwave rings, the brush cursor and the drop flash. */
export function drawOverlay(ctx: CanvasRenderingContext2D, world: World, view: View, dpr: number, cursors: BrushCursor[], markers: readonly ChallengeMarker[] = [], playhead: number | null = null) {
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
  // lightning
  for (const bolt of world.bolts) {
    const a = Math.min(1, bolt.life / 8)
    for (const [width, alpha] of [[10, .18], [4, .5], [1.6, 1]] as const) {
      ctx.strokeStyle = `rgba(220,235,255,${alpha * a})`
      ctx.lineWidth = width * dpr
      ctx.beginPath()
      bolt.points.forEach(([x, y], n) => n ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s))
      ctx.stroke()
    }
  }
  // bomb countdowns
  if (world.frame % 2 === 0 || bombLabels.length === 0) {
    bombLabels.length = 0
    for (let i = 0; i < world.size && bombLabels.length < 40; i++) {
      if (world.type[i] === M.Bomb && world.life[i] > 0 && world.life[i] < BOMB_DROP_ONLY) bombLabels.push(i)
    }
  }
  if (bombLabels.length) {
    ctx.font = `700 ${Math.max(10, s * 3)}px "Space Mono", monospace`
    ctx.textAlign = 'center'
    for (const i of bombLabels) {
      if (world.type[i] !== M.Bomb) continue
      const fuse = world.life[i], x = ox + (i % world.width + .5) * s, y = oy + ((i / world.width | 0) - 1.2) * s
      ctx.fillStyle = fuse <= 3 ? '#ff5a6e' : 'rgba(255,255,255,.85)'
      ctx.fillText(String(fuse), x, y)
    }
  }
  if (playhead !== null) {
    // Song worlds: a soft beam over the column the song has reached.
    const X = ox + (playhead + .5) * s, top = oy, bottom = oy + world.height * s
    const beam = ctx.createLinearGradient(0, top, 0, bottom)
    beam.addColorStop(0, `hsla(${world.hue % 360},100%,75%,0)`)
    beam.addColorStop(.25, `hsla(${world.hue % 360},100%,75%,${.22 + world.pulse.kick * .3})`)
    beam.addColorStop(1, `hsla(${world.hue % 360},100%,75%,0)`)
    ctx.fillStyle = beam
    ctx.fillRect(X - 1.5 * dpr, top, 3 * dpr, bottom - top)
  }
  if (markers.length) {
    ctx.font = `700 ${13 * dpr}px "Space Mono", monospace`
    ctx.textAlign = 'center'
    ctx.lineWidth = 4 * dpr
    ctx.strokeStyle = '#0e0a18'
    ctx.fillStyle = '#b0f2d8'
    for (const { x, y, label } of markers) {
      ctx.strokeText(label, ox + x * s, oy + y * s + 13 * dpr)
      ctx.fillText(label, ox + x * s, oy + y * s + 13 * dpr)
    }
  }
  for (const { sx, sy, brush, tool, player, label, color } of cursors) {
    const X = sx * dpr, Y = sy * dpr
    const R = Math.max(3, (tool === BLAST ? blastRadius(brush) : tool === M.Bomb ? world.bombRadius : brush) * view.scale) * dpr
    ctx.lineWidth = 1.5 * dpr
    const playerColor = color ?? (player === 1 ? '#80f2ff' : player === 2 ? '#ff9bda' : null)
    ctx.strokeStyle = playerColor ?? (tool === ERASE ? 'rgba(255,255,255,.8)' : tool === BLAST ? 'rgba(255,120,60,.95)' : `hsla(${world.hue % 360},100%,75%,.9)`)
    ctx.setLineDash(tool === ERASE || tool === BLAST ? [4 * dpr, 4 * dpr] : [])
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.fillRect(X - dpr, Y - dpr, 2 * dpr, 2 * dpr)
    if (playerColor) {
      ctx.font = `700 ${13 * dpr}px "Space Mono", monospace`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = '#0e0a18'
      ctx.fillStyle = playerColor
      const text = label ?? 'P' + player, y = Y > R + 18 * dpr ? Y - R - 5 * dpr : Y + R + 17 * dpr
      const x = Math.max(12 * dpr, Math.min(ctx.canvas.width - 12 * dpr, X))
      ctx.strokeText(text, x, y)
      ctx.fillText(text, x, y)
    }
  }
  if (world.pulse.flash > .01) {
    ctx.fillStyle = `rgba(255,240,255,${world.pulse.flash * .55})`
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }
}

