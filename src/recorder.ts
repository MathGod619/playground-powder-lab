import type { View } from './render.ts'
import type { World } from './world.ts'

export type Clip = { blob: Blob; url: string; name: string; type: string }
export type Layers = { sky: HTMLCanvasElement; base: HTMLCanvasElement; glow: HTMLCanvasElement; bloom: HTMLCanvasElement; overlay: HTMLCanvasElement }

const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

/**
 * Records the stage into a video. The page's glow is CSS (which a captured canvas can't see),
 * so each frame is recomposed here: background, pixels, blurred glow, overlay, DROP text.
 */
export class ClipRecorder {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private until = 0
  private type = ''
  onDone: ((clip: Clip) => void) | null = null

  get active() { return this.recorder?.state === 'recording' }
  /** Seconds left, or 0. */
  remaining() { return this.active ? Math.max(0, (this.until - performance.now()) / 1000) : 0 }

  start(seconds: number, audio: MediaStream | null) {
    if (this.active) { this.extend(seconds); return }
    const width = Math.min(1280, Math.round(innerWidth * Math.min(2, devicePixelRatio || 1))) & ~1
    this.canvas.width = width
    this.canvas.height = Math.round(width * innerHeight / innerWidth) & ~1
    const stream = this.canvas.captureStream(30)
    audio?.getAudioTracks().forEach(track => stream.addTrack(track))
    this.type = TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    this.chunks = []
    this.recorder = new MediaRecorder(stream, { mimeType: this.type || undefined, videoBitsPerSecond: 8_000_000 })
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data) }
    this.recorder.onstop = () => {
      const type = this.recorder?.mimeType || this.type || 'video/webm'
      const blob = new Blob(this.chunks, { type })
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      stream.getVideoTracks().forEach(t => t.stop())
      this.recorder = null
      this.onDone?.({ blob, url: URL.createObjectURL(blob), name: `powder-rave-${Date.now()}.${ext}`, type })
    }
    this.recorder.start(250)
    this.until = performance.now() + seconds * 1000
  }

  /** Keep recording until at least `seconds` from now. */
  extend(seconds: number) { this.until = Math.max(this.until, performance.now() + seconds * 1000) }

  /** Finish `seconds` from now, whatever was planned before. */
  endIn(seconds: number) { this.until = performance.now() + seconds * 1000 }

  stop() { if (this.active) this.recorder!.stop() }

  /** Draws one frame. Call every animation frame while recording. */
  frame(layers: Layers, world: World, view: View, glow: number, dropAge: number, shake: [number, number]) {
    if (!this.active) return
    if (performance.now() >= this.until) { this.stop(); return }
    const { ctx, canvas } = this, w = canvas.width, h = canvas.height, k = w / innerWidth
    const hue = world.hue % 360, pulse = world.pulse.kick

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.fillStyle = '#06050a'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createRadialGradient(w / 2, h * 1.15, 0, w / 2, h * 1.15, Math.max(w, h) * .9)
    g.addColorStop(0, `hsl(${hue} 95% ${10 + pulse * 22}%)`)
    g.addColorStop(1, 'transparent')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    if (world.scene !== 'sea') ctx.drawImage(layers.sky, 0, 0, w, h)
    const x = (view.x + shake[0]) * k, y = (view.y + shake[1]) * k
    const dw = world.width * view.scale * k, dh = world.height * view.scale * k
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(layers.base, x, y, dw, dh)
    ctx.imageSmoothingEnabled = true
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = Math.min(1, (.6 + pulse * .5) * glow)
    ctx.filter = `blur(${6 * k}px) saturate(1.5) brightness(1.5)`
    ctx.drawImage(layers.glow, x, y, dw, dh)
    ctx.globalAlpha = Math.min(1, (.45 + pulse * .7) * glow)
    ctx.filter = `blur(${26 * k}px) saturate(1.8)`
    ctx.drawImage(layers.bloom, x, y, dw, dh)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (world.scene === 'sea') ctx.drawImage(layers.sky, 0, 0, w, h)
    ctx.drawImage(layers.overlay, 0, 0, w, h)

    if (dropAge < .9) {
      const p = dropAge / .9
      const scale = p < .12 ? 1.8 - p / .12 * .85 : p < .22 ? .95 + (p - .12) / .1 * .08 : 1.03 + (p - .22) * .09
      const alpha = p < .12 ? p / .12 : p < .7 ? 1 - (p - .12) * .17 : .9 * (1 - (p - .7) / .3)
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.font = `900 ${Math.min(w * .26, 280 * k)}px Unbounded, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const off = 6 * k
      ctx.fillStyle = '#ff0a6c'; ctx.fillText('DROP', off, 0)
      ctx.fillStyle = '#00e1ff'; ctx.fillText('DROP', -off, 0)
      ctx.fillStyle = '#fff'; ctx.fillText('DROP', 0, 0)
      ctx.restore()
    }

    ctx.globalAlpha = .75
    ctx.font = `900 ${Math.round(16 * k)}px Unbounded, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#fff'
    ctx.fillText('POWDER RAVE', w - 14 * k, h - 12 * k)
    ctx.globalAlpha = 1
  }
}

