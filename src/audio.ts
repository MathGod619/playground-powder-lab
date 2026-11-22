import { analyzeSamples, mono, type BeatMap } from './analysis.ts'
import { bandLevels, type Bands } from './detector.ts'
import { DEMO_LOOP_SECONDS, startDemo } from './demoTrack.ts'

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
  /** Everything audible, as a stream clips can record. */
  private tap: MediaStreamAudioDestinationNode | null = null
  private element: HTMLAudioElement | null = null
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
      const tap = ctx.createMediaStreamDestination()
      comp.connect(tap)
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      Object.assign(this, { ctx, analyser, master, noise, tap })
    }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume().catch(() => {})
    return { ctx: this.ctx!, analyser: this.analyser!, master: this.master! }
  }

  stop() {
    this.stopCurrent?.()
    this.stopCurrent = null
    this.mode = null
  }

  private demoStartedAt = 0
  /** Name and length of the playing file, so online guests can match it. */
  fileName = ''

  playDemo(offset = 0) {
    const { ctx, master } = this.ensure()
    this.stop()
    this.stopCurrent = startDemo(ctx, master, this.noise!, offset)
    this.demoStartedAt = ctx.currentTime + .08 - offset
    this.mode = 'demo'
  }

  /** Seconds into the demo loop, or null when the demo is not playing. */
  demoTime() {
    if (this.mode !== 'demo' || !this.ctx) return null
    return ((this.ctx.currentTime - this.demoStartedAt) % DEMO_LOOP_SECONDS + DEMO_LOOP_SECONDS) % DEMO_LOOP_SECONDS
  }

  get fileDuration() { return this.mode === 'file' && this.element ? this.element.duration || 0 : 0 }

  /** Jumps the playing file to `t` seconds (online sync). */
  seekFile(t: number) {
    if (this.mode === 'file' && this.element && Number.isFinite(t)) this.element.currentTime = Math.max(0, t)
  }

  get demoNeedsActivation() { return this.mode === 'demo' && this.ctx?.state === 'suspended' }

  async enableDemoSound() {
    if (!this.demoNeedsActivation) return
    try { await this.ctx?.resume() } catch { /* the browser still requires a user gesture */ }
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
    this.element = el
    this.stopCurrent = () => { el.pause(); node.disconnect(); URL.revokeObjectURL(url); this.element = null }
    this.mode = 'file'
    this.fileName = file.name
  }

  /** Decodes a file and maps its kicks, hats and drops ahead of time. */
  async analyse(file: File): Promise<BeatMap> {
    const { ctx } = this.ensure()
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    await new Promise(r => setTimeout(r, 0))
    return analyzeSamples(mono(buffer), buffer.sampleRate)
  }

  /** Where the playing file is, in seconds, corrected for output delay. Null when no file plays. */
  fileTime() {
    if (this.mode !== 'file' || !this.element || !this.ctx) return null
    return this.element.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0)
  }

  /** The app's audio as a stream for recording (null before audio starts). */
  recordStream() { return this.tap?.stream ?? null }

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
    if (mode === 'tab' && this.tap) node.connect(this.tap)
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
