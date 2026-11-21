import { Onsets, Spectrum } from './signal.ts'

export type AudioMode = 'simulator' | 'file' | 'input' | 'tab' | 'system'
export type AudioState = {
  mode: AudioMode
  status: 'idle' | 'pending' | 'ready' | 'live' | 'error'
  label: string
}

const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach(track => track.stop())

export class AudioInput {
  private state: AudioState = { mode: 'simulator', status: 'idle', label: '' }
  private listeners = new Set<() => void>()
  private generation = 0
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private spectrum: Spectrum | null = null
  private bins: Float32Array<ArrayBuffer> | null = null
  private stream: MediaStream | null = null
  private streamNode: MediaStreamAudioSourceNode | null = null
  private fileNode: MediaElementAudioSourceNode | null = null
  private player: HTMLAudioElement | null = null
  private fileUrl = ''
  private onsets = new Onsets()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  snapshot = () => this.state
  signal = () => this.spectrum

  private publish(update: Partial<AudioState>) {
    this.state = { ...this.state, ...update }
    for (const listener of this.listeners) listener()
  }

  select(mode: AudioMode) {
    if (mode === this.state.mode) return
    this.disconnect()
    this.publish({ mode, status: 'idle', label: '' })
  }

  private setup() {
    if (!this.context || !this.analyser) {
      if (typeof AudioContext === 'undefined') throw new Error('Web Audio is unavailable in this browser.')
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0
      // Pull the analyzer graph even when the live source has no speaker output.
      const silentOutput = context.createGain()
      silentOutput.gain.value = 0
      analyser.connect(silentOutput)
      silentOutput.connect(context.destination)
      this.context = context
      this.analyser = analyser
      this.bins = new Float32Array(analyser.frequencyBinCount)
      this.spectrum = new Spectrum(context.sampleRate, analyser.fftSize)
    }
    return { context: this.context, analyser: this.analyser }
  }

  openFile(file: File, player: HTMLAudioElement) {
    this.attachFile(file, file.name, player)
  }

  openDemo(url: string, player: HTMLAudioElement) {
    if (this.attachFile(url, 'Powder Lab demo loop', player)) this.playFile()
  }

  private attachFile(source: string | File, name: string, player: HTMLAudioElement) {
    this.disconnect()
    try {
      const { context, analyser } = this.setup()
      this.player = player
      this.fileNode ??= context.createMediaElementSource(player)
      this.fileNode.connect(analyser)
      this.fileNode.connect(context.destination)
      this.fileUrl = typeof source === 'string' ? source : URL.createObjectURL(source)
      player.loop = typeof source === 'string'
      player.src = this.fileUrl
      this.publish({ status: 'ready', label: name })
      // Native Play is a second user gesture if the browser keeps the context suspended.
      void context.resume().catch(() => {})
      return true
    } catch {
      this.disconnect()
      this.publish({ status: 'error', label: 'Could not open this audio file in the browser.' })
      return false
    }
  }

  playFile() {
    if (!this.player || !this.fileUrl || !this.context) return
    const generation = this.generation
    void this.context.resume().catch(() => {})
    void this.player.play().catch(error => {
      if (generation !== this.generation || error.name === 'AbortError') return
      if (error.name !== 'NotAllowedError') this.fileError()
    })
  }

  filePlaying() {
    if (!this.fileUrl || !this.context) return
    const generation = this.generation
    void this.context.resume().then(() => {
      if (generation === this.generation && this.player && !this.player.paused) {
        this.publish({ status: 'live' })
      }
    }).catch(() => {
      if (generation === this.generation) this.fileError()
    })
  }

  filePaused() {
    if (!this.fileUrl || this.state.status !== 'live' || (!this.player?.paused && !this.player?.ended)) return
    this.clearSignal()
    this.publish({ status: 'ready' })
  }

  fileError() {
    if (!this.fileUrl) return
    this.disconnect()
    this.publish({ status: 'error', label: 'The browser could not play that audio file. Try MP3 or WAV.' })
  }

  async connect() {
    const mode = this.state.mode
    if (mode === 'simulator' || mode === 'file') return
    const share = mode === 'tab' || mode === 'system'
    this.disconnect()
    const generation = this.generation
    this.publish({ status: 'pending', label: '' })
    let received: MediaStream | null = null
    try {
      const devices = navigator.mediaDevices
      if (!devices) throw new Error('Audio capture requires localhost or HTTPS.')
      const { context, analyser } = this.setup()
      const resumed = context.resume()
      void resumed.catch(() => {})
      // Start the picker in the click handler so the browser can verify user activation.
      if (share) {
        if (!devices.getDisplayMedia) throw new Error('Audio sharing is unavailable in this browser. Try desktop Chrome or an audio file.')
        const tab = mode === 'tab'
        const options = {
          video: { displaySurface: tab ? 'browser' : 'monitor' },
          audio: true,
          systemAudio: tab ? 'exclude' : 'include',
          selfBrowserSurface: 'exclude',
          windowAudio: tab ? 'exclude' : 'system',
          monitorTypeSurfaces: tab ? 'exclude' : 'include',
        } satisfies DisplayMediaStreamOptions & {
          systemAudio: string; selfBrowserSurface: string; windowAudio: string; monitorTypeSurfaces: string
        }
        received = await devices.getDisplayMedia(options)
      } else {
        received = await devices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        })
      }
      if (generation !== this.generation) {
        stopTracks(received)
        return
      }
      const [audioTrack] = received.getAudioTracks()
      const surface = received.getVideoTracks()[0]?.getSettings().displaySurface
      if (mode === 'system' && surface === 'browser') {
        throw new Error('That was a browser tab. Use Browser Tab, or select a screen or window for system audio.')
      }
      if (mode === 'tab' && surface && surface !== 'browser') {
        throw new Error('Choose a browser tab for tab audio. Use System Audio for a screen or window.')
      }
      if (!audioTrack || audioTrack.readyState === 'ended') {
        throw new Error(mode === 'system'
          ? 'No system audio track. Enable audio in the screen or window picker if available. Browser Tab and File also work.'
          : 'No audio track. Choose the tab playing music and enable tab audio.')
      }
      this.stream = received
      this.streamNode = context.createMediaStreamSource(new MediaStream([audioTrack]))
      this.streamNode.connect(analyser)
      const end = () => {
        if (generation !== this.generation) return
        this.stop()
        this.publish({ label: share ? 'Sharing ended.' : 'Audio input disconnected.' })
      }
      for (const track of received.getTracks()) track.addEventListener('ended', end, { once: true })
      // A shared video track may be required to keep the browser's audio session alive.
      // It is never attached to an element, analyser, or recorder.
      await resumed
      if (generation !== this.generation) return
      this.publish({ status: 'live', label: share ? (mode === 'tab' ? 'Browser tab audio' : 'Shared system audio') : (audioTrack.label || 'Default audio input') })
    } catch (error) {
      stopTracks(received)
      if (generation !== this.generation) return
      this.disconnect()
      const label = error instanceof DOMException && error.name === 'NotAllowedError'
        ? share ? 'Audio sharing was cancelled or blocked.' : 'Microphone permission was denied.'
        : error instanceof Error ? error.message : 'Could not connect the audio source.'
      this.publish({ status: 'error', label })
    }
  }

  read(now: number) {
    if (this.state.status !== 'live' || this.context?.state !== 'running' ||
        !this.analyser || !this.bins || !this.spectrum) return null
    this.analyser.getFloatFrequencyData(this.bins)
    return this.onsets.read(this.spectrum.read(this.bins), now / 1000)
  }

  private clearSignal() {
    this.spectrum?.clear()
    this.onsets.reset()
  }

  private disconnect() {
    this.generation++
    this.streamNode?.disconnect()
    this.streamNode = null
    stopTracks(this.stream)
    this.stream = null
    this.fileNode?.disconnect()
    if (this.player && this.fileUrl) {
      this.player.pause()
      this.player.removeAttribute('src')
      this.player.load()
    }
    if (this.fileUrl.startsWith('blob:')) URL.revokeObjectURL(this.fileUrl)
    this.fileUrl = ''
    this.clearSignal()
  }

  stop() {
    this.disconnect()
    this.publish({ status: 'idle', label: '' })
  }

  dispose() {
    this.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
  }
}
