import type { World } from './world.ts'

/** Bounded screen-space atmosphere, drawn behind the physical world and included in clips. */
export function drawAtmosphere(ctx: CanvasRenderingContext2D, world: World, time: number, amount: number) {
  const { width: w, height: h } = ctx.canvas, e = world.energy
  ctx.clearRect(0, 0, w, h)
  if (!amount) return
  const scene = world.scene, drop = Math.max(0, world.dropTicks / 180)
  ctx.globalAlpha = amount
  const hue = scene === 'volcano' ? 15 : scene === 'sea' ? 185 : scene === 'storm' ? 235 : world.hue
  const glow = ctx.createRadialGradient(w * .5, h * .65, 0, w * .5, h * .5, Math.max(w, h) * .8)
  glow.addColorStop(0, `hsla(${hue},90%,50%,${.025 + e.level * .2 + drop * .12})`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h)
  if (scene === 'garden' || scene === 'blank' || scene === 'moon') {
    // Aurora ribbons: invisible in quiet passages, thin neon lines that bend with the mids as energy builds.
    const presence = Math.min(.8, Math.max(0, (e.level - .2) / .6) + drop * .6)
    if (presence > .01) {
      ctx.globalCompositeOperation = 'lighter'
      for (let band = 0; band < 4; band++) {
        ctx.beginPath()
        for (let i = 0; i <= 60; i++) {
          const x = i / 60 * w, y = h * (.2 + band * .055) + Math.sin(i * .14 + time * .35 + band * 1.7) * h * (.015 + e.mid * .05)
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        const color = (a: number) => `hsla(${hue + band * 35},100%,68%,${a * presence})`
        ctx.strokeStyle = color(.08)
        ctx.lineWidth = Math.max(4, h * (.012 + e.bass * .016))
        ctx.stroke()
        ctx.strokeStyle = color(.5)
        ctx.lineWidth = Math.max(1, h * (.0018 + e.bass * .002))
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  }
  if (scene === 'city') {
    for (let i = 0; i < 6; i++) {
      const x = w * (i + .5) / 6
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + Math.sin(time * .3 + i) * w * .35, 0); ctx.lineTo(x + Math.sin(time * .3 + i) * w * .35 + w * .065, 0); ctx.closePath()
      ctx.fillStyle = `hsla(${hue + i * 30},100%,70%,${e.mid * .08})`; ctx.fill()
    }
  }
  if (scene === 'volcano' || scene === 'storm') {
    for (let i = 0; i < 12; i++) {
      const x = ((i * .137 + time * .006 * (1 + e.mid)) % 1) * w
      const y = h * (scene === 'volcano' ? .15 + (i % 4) * .065 : .12 + (i % 3) * .045)
      ctx.beginPath(); ctx.ellipse(x, y, w * .16, h * (.035 + e.bass * .025), 0, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${hue},35%,${scene === 'storm' ? 48 : 30}%,${.025 + e.level * .07})`; ctx.fill()
    }
  }
  for (let i = 0; i < 80; i++) {
    const seed = ((i * 73.37) % 97) / 97, drift = time * (.012 + e.mid * .02)
    const x = ((seed + Math.sin(time * .2 + i) * .015 + drift * .2) % 1) * w
    const y = ((i * .618 + (scene === 'storm' ? drift * 3 : -drift) + 100) % 1) * h * .85
    ctx.strokeStyle = ctx.fillStyle = `hsla(${hue + i % 70},100%,80%,${(.04 + e.treble * .65) * (.4 + .6 * Math.sin(time + i) ** 2)})`
    const r = (1 + e.bass * 2 + drop * 2) * w / 1400
    ctx.beginPath()
    if (scene === 'sea') { ctx.arc(x, y, r * 3, 0, 7); ctx.stroke() }
    else if (scene === 'storm') { ctx.moveTo(x, y); ctx.lineTo(x + e.mid * 8, y + 6 + e.level * 14); ctx.stroke() }
    else { ctx.arc(x, y, Math.max(.6, r), 0, 7); ctx.fill() }
  }
  ctx.globalAlpha = 1
}
