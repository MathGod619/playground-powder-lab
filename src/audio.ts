import { bandLevels, type Bands } from './detector.ts'
import { startDemo } from './demoTrack.ts'

export type SourceMode = 'demo' | 'file' | 'mic' | 'tab'

/**
 * Owns the AudioContext and whichever source is playing. Demo and file audio go
 * through the speakers; mic and tab audio are only analysed (tab audio already plays).
 */
export class AudioEngine {
  mode: SourceMode | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  readonly spectrum = new Uint8Array(1024)
  private stopCurrent: (() => void) | null = null
  onEnded: (() => void) | null = null

  private ensure() {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = .5
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 4
      const master = ctx.createGain()
      master.gain.value = .85
      master.connect(comp)
      comp.connect(analyser)
      comp.connect(ctx.destination)
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      Object.assign(this, { ctx, analyser, master, noise })
    }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    return { ctx: this.ctx!, analyser: this.analyser!, master: this.master! }
  }

  stop() {
    this.stopCurrent?.()
    this.stopCurrent = null
    this.mode = null
  }

  playDemo() {
    const { ctx, master } = this.ensure()
    this.stop()
    this.stopCurrent = startDemo(ctx, master, this.noise!)
    this.mode = 'demo'
  }

  async playFile(file: File) {
    const { ctx, master } = this.ensure()
    const url = URL.createObjectURL(file)
    const el = new Audio(url)
    el.loop = true
    const node = ctx.createMediaElementSource(el)
    node.connect(master)
    try {
      await el.play()
    } catch {
      node.disconnect()
      URL.revokeObjectURL(url)
      throw new Error('That file could not be played. Try an MP3 or WAV.')
    }
    this.stop()
    this.stopCurrent = () => { el.pause(); node.disconnect(); URL.revokeObjectURL(url) }
    this.mode = 'file'
  }

  async listenMic() {
    const { ctx, analyser } = this.ensure()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    } catch {
      throw new Error('Microphone access was blocked.')
    }
    this.useStream(ctx, analyser, stream, 'mic')
  }

  async listenTab() {
    const { ctx, analyser } = this.ensure()
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Tab audio needs desktop Chrome or Edge.')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch {
      throw new Error('Tab sharing was cancelled.')
    }
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach(track => track.stop())
      throw new Error('No audio came through. Tick “Share tab audio” in the picker.')
    }
    this.useStream(ctx, analyser, stream, 'tab')
  }

  private useStream(ctx: AudioContext, analyser: AnalyserNode, stream: MediaStream, mode: SourceMode) {
    this.stop()
    const node = ctx.createMediaStreamSource(stream)
    node.connect(analyser)
    const ended = () => { if (this.mode === mode) { this.stop(); this.onEnded?.() } }
    stream.getAudioTracks()[0].addEventListener('ended', ended)
    this.stopCurrent = () => { node.disconnect(); stream.getTracks().forEach(track => track.stop()) }
    this.mode = mode
  }

  /** Reads the current spectrum. Returns silence before audio has started. */
  read(): Bands {
    if (!this.analyser || !this.ctx) return { bass: 0, mid: 0, treble: 0 }
    this.analyser.getByteFrequencyData(this.spectrum)
    return bandLevels(this.spectrum, this.ctx.sampleRate, this.analyser.fftSize)
  }
}
