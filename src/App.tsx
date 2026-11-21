import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import { MapPlayer } from './analysis.ts'
import { AudioEngine, type SourceMode } from './audio.ts'
import { BeatDetector } from './detector.ts'
import { automaticDrops, beatOffset, MusicEnvelope, RaveSession, type DropResult } from './immersion.ts'
import { drawAtmosphere } from './atmosphere.ts'
import { fitSize, IMAGE_MODES, removeBackground, stampImage, type ImageMode, type Pixels } from './image.ts'
import { BLAST, isClickTool, isSolidTool, M, PADS, type Tool } from './materials.ts'
import { ClipRecorder, canRecord, type Clip } from './recorder.ts'
import { blastRadius, createRenderer, drawOverlay, type View } from './render.ts'
import { decodeWorld, encodeWorld, MAX_FILE_BYTES, SAVE_KEY } from './save.ts'
import { buildScene, gridFor, SCENES, WORLD_SIZES, type WorldSize } from './scenes.ts'
import { readLocal, writeLocal } from './storage.ts'
import { DEFAULT_REACTIONS, World, type Reactions, type SceneId } from './world.ts'

type Settings = { reactions: Reactions; glow: number; sensitivity: number; size: WorldSize; atmosphere: number }
const SETTINGS_KEY = 'powder-rave-settings-v1'
const DEFAULT_SETTINGS: Settings = { reactions: DEFAULT_REACTIONS, glow: 1, sensitivity: 1, size: 'medium', atmosphere: 1 }
const MAX_BRUSH = 30
const CLIP_SECONDS = 10
const STEP_MS = 1000 / 60

const SLIDERS: { key: keyof Reactions | 'glow' | 'sensitivity'; label: string; hint: string; min: number; max: number }[] = [
  { key: 'kick', label: 'Kick jump', hint: 'How high piles jump on each kick', min: 0, max: 2 },
  { key: 'speakers', label: 'Speaker blast', hint: 'How far speakers throw things', min: 0, max: 2 },
  { key: 'sparks', label: 'Sparks', hint: 'Embers on hi-hats', min: 0, max: 2 },
  { key: 'slosh', label: 'Slosh', hint: 'Midrange pushes water and smoke', min: 0, max: 2 },
  { key: 'glow', label: 'Glow', hint: 'Bloom strength', min: 0, max: 2 },
  { key: 'sensitivity', label: 'Beat sensitivity', hint: 'Raise this for quiet sources like a mic', min: .5, max: 2 },
]

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (saved) return { ...DEFAULT_SETTINGS, ...saved, reactions: { ...DEFAULT_REACTIONS, ...saved.reactions } }
  } catch { /* storage unavailable */ }
  return DEFAULT_SETTINGS
}

function makeWorld(size: WorldSize, scene: SceneId) {
  const { width, height } = gridFor(innerWidth, innerHeight, size)
  const world = new World(width, height)
  buildScene(world, scene)
  return world
}

const describe = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.'

export function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [splash, setSplash] = useState(true)
  const [tool, setTool] = useState<Tool>(M.Sand)
  const [brush, setBrush] = useState(6)
  const [paused, setPaused] = useState(false)
  const [scene, setScene] = useState<SceneId>('garden')
  const [source, setSource] = useState<SourceMode | null>(null)
  const [bpm, setBpm] = useState(0)
  const [mixOpen, setMixOpen] = useState(false)
  const [toast, setToast] = useState({ text: '', id: 0 })
  const [dragging, setDragging] = useState(false)
  const [drops, setDrops] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [recording, setRecording] = useState(0)
  const [armed, setArmed] = useState(false)
  const [clip, setClip] = useState<Clip | null>(null)
  const [mapped, setMapped] = useState<'none' | 'analysing' | 'ready'>('none')
  const [dropReady, setDropReady] = useState(false)
  const [rave, setRave] = useState({ active: false, finished: false, charge: 0, drops: 0, score: 0, seconds: 90, scoring: false })
  const [result, setResult] = useState<DropResult | null>(null)
  const [menu, setMenu] = useState<'none' | 'scenes' | 'rec'>('none')
  const [fullscreen, setFullscreen] = useState(false)
  /** An uploaded picture waiting to be placed. */
  const [placing, setPlacing] = useState<{ name: string; source: CanvasImageSource; width: number; height: number } | null>(null)
  const [imgMode, setImgMode] = useState<ImageMode>('statue')
  const [cutBg, setCutBg] = useState(true)
  const [imgWidth, setImgWidth] = useState(120)
  /** The placement preview, downsampled to world cells. */
  const ghost = useRef<{ canvas: HTMLCanvasElement; pixels: Pixels } | null>(null)
  const imagePicker = useRef<HTMLInputElement>(null)
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled
  /** Last kick and beat length, on the same clock the drop button is read against. */
  const beat = useRef({ last: -Infinity, period: 0 })
  const session = useRef(new RaveSession())
  const envelope = useRef(new MusicEnvelope())
  const sky = useRef<HTMLCanvasElement>(null)

  const stage = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const glow = useRef<HTMLCanvasElement>(null)
  const bloom = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const spec = useRef<HTMLCanvasElement>(null)
  const audioPicker = useRef<HTMLInputElement>(null)
  const worldPicker = useRef<HTMLInputElement>(null)

  const [audio] = useState(() => new AudioEngine())
  const [detector] = useState(() => new BeatDetector())
  const [recorder] = useState(() => new ClipRecorder())
  const mapPlayer = useRef<MapPlayer | null>(null)
  const mapToken = useRef(0)
  const dropAt = useRef(-99)
  const catching = useRef(false)
  const world = useRef<World>(null!)
  const draw = useRef<() => void>(() => {})
  const view = useRef<View>({ x: 0, y: 0, scale: 1 })
  const live = useRef({ tool, brush, paused, settings, splash, armed, placing: !!placing })
  live.current = { tool, brush, paused, settings, splash, armed, placing: !!placing }
  const stroke = useRef<{ id: number; erase: boolean; last: { x: number; y: number } } | null>(null)
  const cursor = useRef<{ sx: number; sy: number } | null>(null)

  const say = (text: string) => setToast(t => ({ text, id: t.id + 1 }))

  useEffect(() => {
    if (!toast.text) return
    const timer = setTimeout(() => setToast(t => ({ ...t, text: '' })), 2800)
    return () => clearTimeout(timer)
  }, [toast.id])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ }
    detector.sensitivity = settings.sensitivity
  }, [settings])

  function layout() {
    const w = world.current
    if (!w || !layer.current || !overlay.current) return
    const scale = Math.max(innerWidth / w.width, innerHeight / w.height)
    view.current = { scale, x: (innerWidth - w.width * scale) / 2, y: (innerHeight - w.height * scale) / 2 }
    Object.assign(layer.current.style, {
      width: `${w.width * scale}px`, height: `${w.height * scale}px`, left: `${view.current.x}px`, top: `${view.current.y}px`,
    })
    const dpr = Math.min(2, devicePixelRatio || 1)
    overlay.current.width = innerWidth * dpr
    overlay.current.height = innerHeight * dpr
    if (sky.current) { sky.current.width = innerWidth * dpr; sky.current.height = innerHeight * dpr }
  }

  function install(next: World) {
    world.current = next
    draw.current = createRenderer(next, base.current!, glow.current!, bloom.current!)
    setScene(next.scene)
    layout()
  }

  function triggerDrop(manual = true) {
    if (live.current.paused) return
    const challenge = session.current
    if (challenge.active) {
      if (!manual) return
      if (challenge.charge < 1) { say('Still charging. Let the music fill the meter.'); return }
      const t = audio.fileTime() ?? performance.now() / 1000
      const r = challenge.drop(beatOffset(t, beat.current.last, beat.current.period), world.current.census())
      if (!r) return
      setResult({ ...r })
    }
    setDropReady(false)
    if (live.current.armed && !recorder.active && manual && canRecord()) {
      recorder.start(8, audio.recordStream()); setArmed(false)
    }
    dropAt.current = performance.now() / 1000
    if (recorder.active && catching.current) { recorder.endIn(6); catching.current = false }
    world.current.drop(live.current.paused)
    setDrops(n => n + 1)
    const el = layer.current
    if (el) {
      el.classList.add('chroma')
      setTimeout(() => el.classList.remove('chroma'), 450)
    }
  }

  // Simulation + render loop
  useEffect(() => {
    install(makeWorld(live.current.settings.size, 'garden'))
    addEventListener('resize', layout)
    const root = document.documentElement
    const fx = overlay.current!.getContext('2d')!
    const sctx = spec.current!.getContext('2d')!
    let frame = 0, acc = 0, prev = performance.now(), shownBpm = 0, shownCount: number | null = null, shownRec = 0, lastStatus = 0
    recorder.onDone = c => { setClip(c); setRecording(0); catching.current = false }

    const loop = (now: number) => {
      const w = world.current
      const { tool, brush, paused, settings, splash, armed } = live.current
      const dt = Math.min(100, now - prev) / 1000
      acc += dt * 1000
      prev = now

      const bands = audio.read()
      const energy = envelope.current.update(bands, dt)
      w.setEnergy(energy, dt, settings.reactions, paused)
      if (!paused && !splash) session.current.tick(dt, energy.level)
      const heard = detector.update(bands, now / 1000)
      // A mapped song plays its beats from the map: exact timing, and we know when drops land.
      const songTime = audio.fileTime(), map = songTime === null ? null : mapPlayer.current
      const events = map ? map.update(songTime!) : heard
      if (events.drop && automaticDrops(audio.mode, session.current.active || session.current.finished)) triggerDrop(false)
      if (audio.mode === 'tab' && (heard.breakdown || heard.drop)) setDropReady(true)
      if (events.kick) {
        w.onKick(events.kick, settings.reactions, paused)
        beat.current.last = map ? songTime! : now / 1000
      }
      if (events.hat) w.onHat(events.hat, settings.reactions, paused)
      const nowBpm = map ? map.map.bpm : detector.bpm
      beat.current.period = nowBpm ? 60 / nowBpm : 0
      if (nowBpm !== shownBpm) { shownBpm = nowBpm; setBpm(shownBpm) }
      const until = map && !session.current.active ? map.untilDrop(songTime!) : Infinity
      const count = until <= 3.2 ? Math.ceil(until) : null
      if (count !== shownCount) { shownCount = count; setCountdown(count) }

      // Catch the drop: start filming during the build-up so the clip lands on the drop.
      if (armed && !recorder.active) {
        const stream = audio.recordStream()
        if (map && !session.current.active && !session.current.finished && until <= 5) { recorder.start(until + 6, stream); setArmed(false) }
        else if (!map && audio.mode !== 'tab' && !session.current.active && heard.breakdown) { recorder.start(20, stream); catching.current = true; setArmed(false) }
      }

      for (let n = 0; acc >= STEP_MS && n < 2; n++) {
        acc -= STEP_MS
        if (!paused) w.step()
        const s = stroke.current
        if (s && (s.erase || (!isSolidTool(tool) && !isClickTool(tool)))) w.paint(s.last.x, s.last.y, brush, tool, s.erase)
      }
      if (acc > STEP_MS) acc = 0
      w.decay()
      if (now - lastStatus > 250) {
        lastStatus = now
        const r = session.current
        if (r.scoring) { r.observe(w.census()); if (r.result) setResult({ ...r.result }) }
        setRave({ active: r.active, finished: r.finished, charge: r.charge, drops: r.drops, score: r.score, seconds: Math.ceil(r.seconds), scoring: r.scoring })
      }

      const shake = w.pulse.shake, sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake
      if (layer.current) layer.current.style.transform = `translate(${sx}px,${sy}px) scale(${1 + w.pulse.kick * .006})`
      root.style.setProperty('--hue', (w.hue % 360).toFixed(1))
      root.style.setProperty('--pulse', w.pulse.kick.toFixed(3))
      root.style.setProperty('--glow', String(settings.glow))
      root.style.setProperty('--energy', energy.level.toFixed(3))

      drawAtmosphere(sky.current!.getContext('2d')!, w, now / 1000, settings.atmosphere)
      draw.current()
      const placingNow = live.current.placing && ghost.current
      drawOverlay(fx, w, view.current, overlay.current!.width / innerWidth, splash || recorder.active || placingNow ? null : cursor.current, brush, tool)
      if (placingNow) drawGhost(fx, ghost.current!.canvas)
      if (recorder.active) {
        recorder.frame({ sky: sky.current!, base: base.current!, glow: glow.current!, bloom: bloom.current!, overlay: overlay.current! }, w, view.current,
          settings.glow, now / 1000 - dropAt.current, [sx, sy])
        const left = Math.ceil(recorder.remaining())
        if (left !== shownRec) { shownRec = left; setRecording(left) }
      } else if (shownRec) { shownRec = 0; setRecording(0) }

      // spectrum strip
      const sw = sctx.canvas.width, sh = sctx.canvas.height, bars = 33
      sctx.clearRect(0, 0, sw, sh)
      for (let k = 0; k < bars; k++) {
        const a = (k / bars) ** 2 * 400 + 1 | 0, b = Math.max(a + 1, ((k + 1) / bars) ** 2 * 400 + 2 | 0)
        let sum = 0
        for (let i = a; i < b; i++) sum += audio.spectrum[i]
        const v = sum / (b - a) / 255, bh = Math.max(2, v * sh)
        sctx.fillStyle = `hsl(${w.hue + k * 6},100%,${55 + v * 25}%)`
        sctx.fillRect(k * sw / bars + 1, sh - bh, sw / bars - 3, bh)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    audio.onEnded = () => { setSource(null); say('Audio stopped. Pick another source.') }
    // Development-only handle for automated play-testing.
    if (import.meta.env.DEV) Object.assign(window, { __rave: { world: () => world.current, audio, recorder, step: (n: number) => { for (let k = 0; k < n; k++) world.current.step() }, draw: () => draw.current() } })
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', layout); audio.stop() }
  }, [])

  // Full screen: the browser fires a resize, which re-lays-out the world to fill the screen.
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenEnabled) { say('Full screen is not available in this browser. Try adding the page to your home screen.'); return }
    if (document.fullscreenElement) void document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => say('The browser blocked full screen.'))
  }

  // ---------------------------------------------------------------- images

  /** Rebuild the placement preview whenever the picture, size or background option changes. */
  useEffect(() => {
    if (!placing) { ghost.current = null; return }
    const { width, height } = fitSize(placing.width, placing.height, imgWidth)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(placing.source, 0, 0, width, height)
    let pixels: Pixels = ctx.getImageData(0, 0, width, height)
    if (cutBg) {
      pixels = removeBackground(pixels)
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0)
    }
    ghost.current = { canvas, pixels }
  }, [placing, imgWidth, cutBg])

  /** Where the preview sits: centred on the pointer, or the middle of the world before the pointer moves. */
  function ghostOrigin() {
    const g = ghost.current!, w = world.current, c = cursor.current
    const cx = c ? (c.sx - view.current.x) / view.current.scale : w.width / 2
    const cy = c ? (c.sy - view.current.y) / view.current.scale : w.height / 2
    return { x: Math.round(cx - g.pixels.width / 2), y: Math.round(cy - g.pixels.height / 2) }
  }

  function drawGhost(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const dpr = overlay.current!.width / innerWidth, s = view.current.scale * dpr
    const { x, y } = ghostOrigin()
    const X = view.current.x * dpr + x * s, Y = view.current.y * dpr + y * s, Wd = canvas.width * s, Hd = canvas.height * s
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = .72 + Math.sin(performance.now() / 180) * .12
    ctx.drawImage(canvas, X, Y, Wd, Hd)
    ctx.globalAlpha = 1
    ctx.setLineDash([6 * dpr, 5 * dpr])
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = 'rgba(255,255,255,.85)'
    ctx.strokeRect(X, Y, Wd, Hd)
    ctx.restore()
  }

  async function openImage(file: File) {
    if (!file.type.startsWith('image/')) { say('That is not an image.'); return }
    try {
      const bitmap = await createImageBitmap(file)
      const w = world.current
      // start at a size that fits comfortably: under half the width and 70% of the height
      const width = Math.round(Math.min(w.width * .45, w.height * .7 * bitmap.width / bitmap.height))
      setImgWidth(Math.max(12, width))
      setPlacing({ name: file.name, source: bitmap, width: bitmap.width, height: bitmap.height })
      setMixOpen(false)
      setMenu('none')
      setSplash(false)
    } catch {
      say('That image could not be opened.')
    }
  }

  function placeImage() {
    const g = ghost.current
    if (!g) return
    const { x, y } = ghostOrigin()
    const placed = stampImage(world.current, g.pixels, x, y, imgMode)
    setPlacing(null)
    if (!placed) { say('Nothing landed. Try moving it onto the screen or turning off Cut background.'); return }
    say({
      statue: 'Statue placed. Bombs and blasts will knock it down.',
      sand: 'Sand painting placed. It lets go on the next kick.',
      elements: 'Placed as elements. Watch it come alive.',
    }[imgMode])
  }

  /** The latest placeImage, for the keyboard handler (which is registered once). */
  const placeLatest = useRef(placeImage)
  placeLatest.current = placeImage

  const resizeImage = (delta: number) => setImgWidth(v => Math.max(12, Math.min(world.current?.width ?? 400, v + delta)))

  // Paste an image from the clipboard (Cmd/Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'))
      if (file) { e.preventDefault(); void openImage(file) }
    }
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  }, [])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (live.current.splash || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement)?.closest?.('input')) return
      const key = e.key.toLowerCase()
      if (live.current.placing) {
        if (key === 'escape') setPlacing(null)
        else if (key === '[' || key === '-') resizeImage(-6)
        else if (key === ']' || key === '=') resizeImage(6)
        else if (key === 'enter') placeLatest.current()
        return
      }
      if (key === 'i') { imagePicker.current?.click(); return }
      const pad = PADS.find(p => p.key.toLowerCase() === key)
      if (pad) setTool(pad.tool)
      else if (key === '[' || key === '-') setBrush(b => Math.max(1, b - 1))
      else if (key === ']' || key === '=') setBrush(b => Math.min(MAX_BRUSH, b + 1))
      else if (key === ' ') { e.preventDefault(); setPaused(p => !p) }
      else if (key === 'd') triggerDrop()
      else if (key === 'r') loadScene(world.current.scene)
      else if (key === 'f') toggleFullscreen()
      else if (key === 'escape') { setMixOpen(false); setMenu('none') }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // ---------------------------------------------------------------- actions

  function loadScene(id: SceneId) {
    if (session.current.active) { say('Finish the Rave or return to Sandbox to change worlds.'); return }
    install(makeWorld(live.current.settings.size, id))
  }

  function changeSize(size: WorldSize) {
    if (session.current.active) { say('Finish the Rave before changing world detail.'); return }
    setSettings(s => ({ ...s, size }))
    install(makeWorld(size, world.current.scene))
  }

  async function pickSource(mode: SourceMode) {
    try {
      if (mode !== 'file') { mapPlayer.current = null; setMapped('none'); mapToken.current++ }
      if (mode === 'demo') { audio.playDemo(); detector.reset() }
      else if (mode === 'file') { audioPicker.current?.click(); return }
      else if (mode === 'mic') { await audio.listenMic(); detector.reset(); say('Listening to your mic. Play something loud.') }
      else { await audio.listenTab(); detector.reset(); say('Hooked into tab audio. Play Spotify or YouTube in that tab.') }
      setSource(audio.mode)
      setDropReady(false)
      setArmed(false)
    } catch (error) {
      say(describe(error))
    }
  }

  async function playFile(file: File) {
    try {
      await audio.playFile(file)
      detector.reset()
      setSource('file')
      mapPlayer.current = null
      setMapped('analysing')
      say(`Playing “${file.name}”. Mapping the beats…`)
    } catch (error) {
      say(describe(error))
      return
    }
    const token = ++mapToken.current
    try {
      const map = await audio.analyse(file)
      if (token !== mapToken.current || audio.mode !== 'file') return
      mapPlayer.current = new MapPlayer(map)
      setMapped('ready')
      const drops = map.drops.length
      say(`Mapped: ${map.bpm ? `${map.bpm} BPM, ` : ''}${drops} drop${drops === 1 ? '' : 's'} found`)
    } catch {
      if (token !== mapToken.current) return
      setMapped('none')
      say('Could not map this song, so it will react live instead.')
    }
  }

  function record() {
    if (!canRecord()) { say('Recording needs a recent Chrome, Edge, Firefox or Safari.'); return }
    if (recorder.active) { recorder.stop(); return }
    recorder.start(CLIP_SECONDS, audio.recordStream())
    setRecording(CLIP_SECONDS)
  }

  function toggleCatch() {
    if (!canRecord()) { say('Recording needs a recent Chrome, Edge, Firefox or Safari.'); return }
    setArmed(a => {
      if (!a) say(audio.mode === 'tab' || session.current.active ? 'Armed. Your manual Drop starts an 8-second clip.' : mapPlayer.current ? 'Armed. Recording starts 5 seconds before the next drop.' : 'Armed. Recording starts when the beat drops out for the build-up.')
      return !a
    })
  }

  function closeClip() {
    if (clip) URL.revokeObjectURL(clip.url)
    setClip(null)
  }

  async function shareClip() {
    if (!clip) return
    const file = new File([clip.blob], clip.name, { type: clip.type })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Powder Rave' })
      else say('Sharing is not supported here. Use Download instead.')
    } catch { /* cancelled */ }
  }

  function start() {
    setSplash(false)
    audio.playDemo()
    detector.reset()
    setSource('demo')
    setTimeout(() => say('Paint with the dock. Right-click erases. Wait for the drop.'), 600)
  }

  function startRave() {
    const w = makeWorld(live.current.settings.size, world.current.scene)
    install(w)
    session.current.start()
    setRave({ active: true, finished: false, charge: 0, drops: 0, score: 0, seconds: 90, scoring: false })
    setResult(null)
    setDropReady(false)
    setMenu('none')
    say('90 seconds, three drops. Set up bombs, bricks and seeds, then drop on the beat. Bigger damage, bigger score.')
  }

  function leaveRave() {
    session.current.active = session.current.finished = false
    setRave(r => ({ ...r, active: false, finished: false }))
    setResult(null)
  }

  async function save() {
    try {
      await writeLocal(SAVE_KEY, encodeWorld(world.current))
      say('World saved in this browser.')
    } catch (error) { say(describe(error)) }
  }

  async function load() {
    try {
      const data = await readLocal(SAVE_KEY)
      if (!data) { say('Nothing saved yet.'); return }
      install(decodeWorld(data))
      say('Saved world loaded.')
    } catch (error) { say(describe(error)) }
  }

  function exportWorld() {
    const blob = new Blob([encodeWorld(world.current)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `powder-rave-${world.current.scene}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function importWorld(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large.')
      install(decodeWorld(await file.text()))
      say(`Loaded ${file.name}`)
    } catch (error) { say(describe(error)) }
  }

  // ---------------------------------------------------------------- painting

  const toCell = (e: { clientX: number; clientY: number }) => ({
    x: Math.floor((e.clientX - view.current.x) / view.current.scale),
    y: Math.floor((e.clientY - view.current.y) / view.current.scale),
  })

  function paintLine(from: { x: number; y: number }, to: { x: number; y: number }, erase: boolean) {
    const d = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
    const steps = Math.max(1, d / Math.max(1, brush * .5) | 0)
    for (let k = 0; k <= steps; k++) {
      world.current.paint(Math.round(from.x + (to.x - from.x) * k / steps), Math.round(from.y + (to.y - from.y) * k / steps), brush, tool, erase)
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (splash || (e.button !== 0 && e.button !== 2)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setMixOpen(false)
    setMenu('none')
    cursor.current = { sx: e.clientX, sy: e.clientY }
    if (placing) {
      if (e.button === 2) { setPlacing(null); say('Image cancelled.') }
      else placeImage()
      return
    }
    const cell = toCell(e)
    if (e.button === 0 && isClickTool(tool)) {
      if (tool === BLAST) world.current.blast(cell.x, cell.y, blastRadius(brush), .8 + brush / 25, true)
      else if (!world.current.placeBomb(cell.x, cell.y)) say('No room for a bomb there.')
      return
    }
    stroke.current = { id: e.pointerId, erase: e.button === 2, last: cell }
    cursor.current = { sx: e.clientX, sy: e.clientY }
    if (!isClickTool(tool) || e.button === 2) world.current.paint(cell.x, cell.y, brush, tool, e.button === 2)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    cursor.current = { sx: e.clientX, sy: e.clientY }
    const s = stroke.current
    if (!s || s.id !== e.pointerId) return
    const cell = toCell(e)
    if (!isClickTool(tool) || s.erase) paintLine(s.last, cell, s.erase)
    s.last = cell
  }

  function endStroke(e: ReactPointerEvent<HTMLDivElement>) {
    if (stroke.current?.id === e.pointerId) stroke.current = null
    if (e.pointerType !== 'mouse') cursor.current = null
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const image = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
    if (image) { void openImage(image); return }
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith('audio'))
    if (!file) { say('Drop an audio file to play it, or an image to drop into the world.'); return }
    setSplash(false)
    void playFile(file)
  }

  const activePad = PADS.find(p => p.tool === tool)

  return (
    <div className="app" onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { if (!e.relatedTarget) setDragging(false) }} onDrop={onDrop}>
      <div ref={stage} className="stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={endStroke} onPointerCancel={endStroke}
        onPointerLeave={e => { if (!stroke.current && e.pointerType === 'mouse') cursor.current = null }}
        onContextMenu={e => e.preventDefault()}
        onWheel={e => placing ? resizeImage(e.deltaY < 0 ? 4 : -4) : setBrush(b => Math.max(1, Math.min(MAX_BRUSH, b + (e.deltaY < 0 ? 1 : -1))))}>
        <canvas ref={sky} className={`atmosphere ${scene === 'sea' ? 'underwater' : ''}`} />
        <div ref={layer} className="layer">
          <canvas ref={base} className="base" />
          <canvas ref={glow} className="glow" />
          <canvas ref={bloom} className="bloom" />
        </div>
        <canvas ref={overlay} className="overlay" />
      </div>

      <header className="hud top">
        <div className="brand">
          <div className="logo">POWDER<b>RAVE</b></div>
          <div className="chips">
            <div className="menu-wrap">
              <button className={`chip scene-btn ${menu === 'scenes' ? 'on' : ''}`} aria-expanded={menu === 'scenes'}
                onClick={() => setMenu(m => m === 'scenes' ? 'none' : 'scenes')}>
                {SCENES.find(x => x.id === scene)?.name ?? 'World'} <span aria-hidden>▾</span>
              </button>
              {menu === 'scenes' && (
                <div className="menu" role="menu">
                  {SCENES.map(x => (
                    <button key={x.id} role="menuitem" className={scene === x.id ? 'on' : ''}
                      onClick={() => { setMenu('none'); loadScene(x.id) }}>
                      <b>{x.name}</b><small>{x.detail}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="seg mode" role="group" aria-label="Mode">
              <button className={!rave.active && !rave.finished ? 'on' : ''} onClick={leaveRave}>Sandbox</button>
              <button className={rave.active || rave.finished ? 'on' : ''} onClick={startRave}>Rave</button>
            </div>
          </div>
        </div>
        <div className="deck">
          <div className="chips">
            {(['demo', 'file', 'mic', 'tab'] as const).map(m => (
              <button key={m} className={`chip ${source === m ? 'on' : ''}`} onClick={() => pickSource(m)}>
                {{ demo: 'Demo', file: 'File', mic: 'Mic', tab: 'Tab' }[m]}
              </button>
            ))}
          </div>
          <div className="meter">
            <canvas ref={spec} width={264} height={60} className="spec" />
            <i className="dot" />
            <div className="bpm">{bpm || '—'}<small>BPM</small></div>
            {mapped !== 'none' && source === 'file' && (
              <span className={`mapped ${mapped}`} title={mapped === 'ready' ? 'Beats come from a map of the whole song' : 'Mapping the song…'}>
                {mapped === 'ready' ? 'MAPPED' : 'MAPPING…'}
              </span>
            )}
            <div className="menu-wrap">
              <button className={`chip recbtn ${recording ? 'live' : armed ? 'armed' : ''}`} aria-expanded={menu === 'rec'}
                title="Record a clip"
                onClick={() => recording ? record() : armed ? toggleCatch() : setMenu(m => m === 'rec' ? 'none' : 'rec')}>
                <i />{recording ? `${recording}s` : armed ? 'Armed' : 'Clip'}
              </button>
              {menu === 'rec' && (
                <div className="menu right" role="menu">
                  <button role="menuitem" onClick={() => { setMenu('none'); record() }}>
                    <b>Record {CLIP_SECONDS} seconds</b><small>Starts now, with sound.</small>
                  </button>
                  <button role="menuitem" onClick={() => { setMenu('none'); toggleCatch() }}>
                    <b>Catch the next drop</b><small>Starts in the build-up so the clip lands on the drop.</small>
                  </button>
                </div>
              )}
            </div>
            <button className={`chip mixbtn ${mixOpen ? 'on' : ''}`} onClick={() => { setMenu('none'); setMixOpen(o => !o) }} aria-expanded={mixOpen}>Mix</button>
          </div>
          {mixOpen && (
            <section className="mix" aria-label="Mix and world settings">
              <label className="slider" title="Aurora, light beams and drifting particles behind the world">
                <span>Atmosphere<em>{Math.round(settings.atmosphere * 100)}%</em></span>
                <input type="range" min="0" max="1" step=".1" value={settings.atmosphere}
                  style={{ '--p': `${settings.atmosphere * 100}%` } as CSSProperties}
                  onChange={e => setSettings(s => ({ ...s, atmosphere: +e.target.value }))} />
              </label>
              {SLIDERS.map(({ key, label, hint, min, max }) => {
                const value = key === 'glow' || key === 'sensitivity' ? settings[key] : settings.reactions[key]
                const set = (v: number) => setSettings(s => key === 'glow' || key === 'sensitivity'
                  ? { ...s, [key]: v } : { ...s, reactions: { ...s.reactions, [key]: v } })
                return (
                  <label key={key} className="slider" title={hint}>
                    <span>{label}<em>{Math.round(value * 100)}%</em></span>
                    <input type="range" min={min} max={max} step={.05} value={value}
                      style={{ '--p': `${(value - min) / (max - min) * 100}%` } as CSSProperties}
                      onChange={e => set(+e.target.value)} />
                  </label>
                )
              })}
              <div className="row-label">World detail</div>
              <div className="seg">
                {WORLD_SIZES.map(s => (
                  <button key={s.id} className={settings.size === s.id ? 'on' : ''} onClick={() => changeSize(s.id)}>{s.name}</button>
                ))}
              </div>
              <div className="row-label">World</div>
              <div className="seg">
                <button onClick={save}>Save</button>
                <button onClick={load}>Load</button>
                <button onClick={exportWorld}>Export</button>
                <button onClick={() => worldPicker.current?.click()}>Import</button>
              </div>
              <button className="reset-mix" onClick={() => setSettings(s => ({ ...DEFAULT_SETTINGS, size: s.size }))}>Reset mix</button>
            </section>
          )}
        </div>
      </header>

      <nav className="hud dock">
        {PADS.map(p => (
          <button key={p.tool} className={`pad ${tool === p.tool ? 'on' : ''}`} style={{ '--c': p.swatch } as CSSProperties}
            title={`${p.name} (${p.key}): ${p.hint}`} onClick={() => setTool(p.tool)}>
            <kbd>{p.key}</kbd><i className="sw" /><span>{p.name}</span>
          </button>
        ))}
        <i className="sep" />
        <button className="tool" title="Smaller brush ([)" onClick={() => setBrush(b => Math.max(1, b - 1))}>−</button>
        <span className="size" title="Brush size (scroll to change)">{brush}</span>
        <button className="tool" title="Bigger brush (])" onClick={() => setBrush(b => Math.min(MAX_BRUSH, b + 1))}>+</button>
        <button className="tool" title={paused ? 'Resume (Space)' : 'Freeze (Space)'} onClick={() => setPaused(p => !p)}>{paused ? '▶' : '❚❚'}</button>
        <button className="tool" title="Reset scene (R)" onClick={() => loadScene(scene)}>↺</button>
        <button className={`tool ${placing ? 'on' : ''}`} title="Drop an image into the world (I). You can also drag one in or paste it." onClick={() => imagePicker.current?.click()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" />
          </svg>
        </button>
        {canFullscreen && (
          <button className="tool" title={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'} aria-pressed={fullscreen} onClick={toggleFullscreen}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {fullscreen
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}
        <i className="sep" />
      </nav>

      {!splash && (
        <div className="drop-corner">
          {(rave.active || rave.finished) && (
            <section className="rave-card" aria-label="Rave challenge" aria-live="polite">
              <div className="rave-top">
                <strong>{rave.finished ? rave.drops === 3 ? 'RAVE COMPLETE' : 'TIME UP' : 'RAVE'}</strong>
                <span className="pips" aria-label={`${rave.drops} of 3 drops`}>{[0, 1, 2].map(n => <i key={n} className={n < rave.drops ? 'on' : ''} />)}</span>
                {rave.active && <span className={`clock ${rave.seconds <= 10 ? 'low' : ''}`}>{rave.seconds}s</span>}
              </div>
              <div className="score">{rave.score.toLocaleString()}<small>pts</small></div>
              {result && (
                <div className={`grade ${result.grade.label === 'PERFECT' ? 'perfect' : result.grade.label === 'GREAT' ? 'great' : ''}`} key={result.drop}>
                  Drop {result.drop}: {result.grade.label}{result.grade.multiplier > 1 ? ` ×${result.grade.multiplier}` : ''} · +{result.points.toLocaleString()}
                </div>
              )}
              {rave.finished && (
                <div className="rave-actions">
                  <button className="chip on" onClick={startRave}>Play again</button>
                  <button className="chip" onClick={leaveRave}>Sandbox</button>
                </div>
              )}
            </section>
          )}
          {!rave.finished && (
            <button className={`dropbtn main-drop ${(rave.active ? rave.charge >= 1 && !rave.scoring : dropReady) ? 'ready' : ''}`}
              style={{ '--charge': `${(rave.active ? rave.charge : 1) * 100}%` } as CSSProperties}
              title={rave.active ? 'The music charges your drop. Press D on the beat for a multiplier.' : 'Force a drop (D)'}
              onClick={() => triggerDrop()}>
              {rave.active ? rave.scoring ? 'SCORING…' : rave.charge >= 1 ? 'DROP!' : `CHARGING ${Math.floor(rave.charge * 100)}%` : dropReady ? 'DROP READY' : 'DROP'}
            </button>
          )}
        </div>
      )}
      {activePad && !splash && <div className="hint" key={activePad.name}>{activePad.hint}</div>}
      {drops > 0 && <div className="drop-text" key={drops}>DROP</div>}
      {countdown !== null && <div className="countdown" key={countdown}>DROP IN <b>{countdown}</b></div>}
      {clip && (
        <div className="clip" role="dialog" aria-label="Your clip">
          <div className="clip-card">
            <video src={clip.url} controls autoPlay loop playsInline />
            <div className="clip-actions">
              <a className="primary" href={clip.url} download={clip.name}>Download</a>
              {'share' in navigator && <button onClick={shareClip}>Share</button>}
              <button onClick={closeClip}>Close</button>
            </div>
          </div>
        </div>
      )}
      <div className={`toast ${toast.text ? 'show' : ''}`} role="status">{toast.text}</div>
      {dragging && <div className="dropzone">Drop it to play it</div>}
      {paused && !splash && <div className="frozen">FROZEN · music still playing</div>}

      <input ref={imagePicker} type="file" accept="image/*" hidden onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''
        if (file) void openImage(file)
      }} />
      {placing && (
        <section className="placer" aria-label="Place image">
          <div className="placer-title"><b>Click to drop it in</b><span>Scroll or [ ] to resize · right-click or Esc to cancel</span></div>
          <div className="seg">
            {IMAGE_MODES.map(m => (
              <button key={m.id} className={imgMode === m.id ? 'on' : ''} title={m.detail} onClick={() => setImgMode(m.id)}>{m.name}</button>
            ))}
          </div>
          <small className="placer-detail">{IMAGE_MODES.find(m => m.id === imgMode)!.detail}</small>
          <div className="placer-row">
            <label className="check"><input type="checkbox" checked={cutBg} onChange={e => setCutBg(e.target.checked)} /> Cut background</label>
            <span className="placer-size">
              <button className="tool" aria-label="Smaller" onClick={() => resizeImage(-8)}>−</button>
              <span>{imgWidth}</span>
              <button className="tool" aria-label="Bigger" onClick={() => resizeImage(8)}>+</button>
            </span>
            <button className="chip" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        </section>
      )}
      <input ref={audioPicker} type="file" accept="audio/*" hidden onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''
        if (file) void playFile(file)
      }} />
      <input ref={worldPicker} type="file" accept="application/json,.json" hidden onChange={importWorld} />

      {splash && (
        <div className="splash">
          <div className="inner">
            <h1>POWDER<br />RAVE</h1>
            <p>A falling-sand world that hears your music. Kicks make the ground jump, speakers blast the dirt around, and the drop sets everything off.</p>
            <button className="start" onClick={start}>DROP THE BEAT</button>
            <small>Sound on. You can also drag any audio file onto the page.</small>
          </div>
        </div>
      )}
    </div>
  )
}

