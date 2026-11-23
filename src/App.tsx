import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import { effectProfile, LIGHT_DEVICE_QUERY, type EffectQuality } from './device-performance.ts'
import { SnapshotInbox } from './snapshot-inbox.ts'
import { ImageLab } from './ImageLab.tsx'
import { buildImageScene, IMAGE_PRESETS, type ImagePreset } from './image-presets.ts'
import { MaterialIcon } from './MaterialIcon.tsx'
import { fitWorld, localPoint } from './viewport.ts'
import { MapPlayer } from './analysis.ts'
import { AudioEngine, type SourceMode } from './audio.ts'
import { paintBeatBrush, type BrushBeats } from './beat-brush.ts'
import { BeatDetector } from './detector.ts'
import { CONTROL, Controller } from './controller.ts'
import { ControllerMenu, moveControllerFocus, type ControllerPage } from './ControllerMenu.tsx'
import { Director } from './Director.tsx'
import { cloneWorld } from './director-world.ts'
import type { ScenePlan } from './director-plan.ts'
import { automaticDrops, beatOffset, MusicEnvelope, RaveSession, type DropResult } from './immersion.ts'
import { drawAtmosphere } from './atmosphere.ts'
import { coverCrop, fitSize, IMAGE_MODES, removeBackground, stampImage, type ImageMode, type Pixels } from './image.ts'
import { BLAST, isBeatTool, isClickTool, isSolidTool, M, PADS, type Tool } from './materials.ts'
import { ClipRecorder, canRecord, type Clip } from './recorder.ts'
import { prepareChallenge, RAVE_MODES, type RaveMode } from './rave-challenges.ts'
import { blastRadius, createRenderer, drawOverlay, type BrushCursor, type Cursor, type View } from './render.ts'
import { decodeWorld, encodeWorld, MAX_FILE_BYTES, SAVE_KEY } from './save.ts'
import { buildScene, gridFor, SCENES, WORLD_SIZES, type WorldSize } from './scenes.ts'
import { spawnCrowd } from './crowd.ts'
import { getSongShape, playheadColumn, setSongShape, songMarkers, songShape } from './song-world.ts'
import { DEMO_LOOP_SECONDS } from './demoTrack.ts'
import { applySnapshot, encodeSnapshot, pack, snapshotSize, unpack, type RemoteCursor, type SyncBase } from './netsync.ts'
import { cleanCode, Online, randomName, validCode, type GuestAction, type HostNote, type Player, type Role } from './online.ts'
import { readLocal, writeLocal } from './storage.ts'
import { COACH_STEPS, completeStep, currentStep, isNewPlayer, ONBOARDED_KEY, STARTER_TOOLS, stepForPaint, type CoachStep } from './onboarding.ts'
import { DEFAULT_REACTIONS, World, type Reactions, type SceneId } from './world.ts'

type Settings = { quality: EffectQuality; reactions: Reactions; glow: number; sensitivity: number; size: WorldSize; atmosphere: number; dropRumble: boolean; crowd: boolean; night: boolean }
type Cell = { x: number; y: number }
type Brush = { tool: Tool; brush: number }
type Stroke = { last: Cell; erase: boolean }
type Seat = { point: Cursor | null; stroke: (Stroke & Brush & { world: World }) | null; stick: number }
const SETTINGS_KEY = 'powder-rave-settings-v1'
const NAME_KEY = 'powder-rave-name'
const NET_COLORS = ['#80f2ff', '#ff9bda', '#ffe66b', '#7dffb3']
const netColor = (id: number) => NET_COLORS[id % NET_COLORS.length]
/** A ?join=CODE invite link in the address. */
const INVITE = typeof location === 'undefined' ? '' : cleanCode(new URLSearchParams(location.search).get('join') ?? '')
const DEFAULT_SETTINGS: Settings = { quality: 'auto', reactions: DEFAULT_REACTIONS, glow: 1, sensitivity: 1, size: 'medium', atmosphere: 1, dropRumble: true, crowd: true, night: false }
const MAX_BRUSH = 30
const CLIP_SECONDS = 10
const STEP_MS = 1000 / 60
const PRIMARY_TOOLS: number[] = [M.Sand, M.Water, M.Wall, M.Fire, M.Oil, M.Lava, M.Glitter, M.Plant, M.Speaker, M.Rocket, BLAST, 200]
const BEAT_PADS = PADS.filter(pad => isBeatTool(pad.tool))

const SLIDERS: { key: keyof Reactions | 'glow' | 'sensitivity'; label: string; hint: string; min: number; max: number }[] = [
  { key: 'kick', label: 'Kick jump', hint: 'How high piles jump on each kick', min: 0, max: 2 },
  { key: 'speakers', label: 'Speaker blast', hint: 'How far speakers throw things', min: 0, max: 2 },
  { key: 'sparks', label: 'Sparks', hint: 'Embers on hi-hats', min: 0, max: 2 },
  { key: 'slosh', label: 'Slosh', hint: 'Midrange pushes water and smoke', min: 0, max: 2 },
  { key: 'glow', label: 'Glow', hint: 'Bloom strength', min: 0, max: 2 },
  { key: 'sensitivity', label: 'Beat sensitivity', hint: 'Raise this for quiet sources like a mic', min: .5, max: 2 },
]

function loadSettings(): Settings {
  const phone = matchMedia(LIGHT_DEVICE_QUERY).matches
  const defaults: Settings = { ...DEFAULT_SETTINGS, size: phone ? 'small' : 'medium' }
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (saved) return { ...defaults, ...saved, ...(!saved.quality && phone && saved.size !== 'large' ? { size: 'small' } : {}), reactions: { ...DEFAULT_REACTIONS, ...saved.reactions } }
  } catch { /* storage unavailable */ }
  return defaults
}

function makeWorld(size: WorldSize, scene: SceneId) {
  const field = document.querySelector('.stage')?.getBoundingClientRect()
  const { width, height } = gridFor(field?.width || innerWidth, field?.height || innerHeight, size)
  const world = new World(width, height)
  buildScene(world, scene)
  return world
}

const describe = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.'

export function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [constrained, setConstrained] = useState(() => matchMedia(LIGHT_DEVICE_QUERY).matches)
  const profile = effectProfile(settings.quality, constrained)
  const [splash, setSplash] = useState(true)
  // First-run guide: a new player sees a few tools and three steps that lead to their first drop.
  const [starter, setStarter] = useState(() => isNewPlayer(localStorage, SETTINGS_KEY) && !validCode(INVITE))
  const [coachDone, setCoachDone] = useState<CoachStep[]>([])
  const [allTools, setAllTools] = useState(false)
  const [expandedTools, setExpandedTools] = useState(false)
  const [tool, setTool] = useState<Tool>(M.Sand)
  const [brush, setBrush] = useState(6)
  const [secondTool, setSecondTool] = useState<Tool>(M.Glitter)
  const [secondBrush, setSecondBrush] = useState(6)
  const [paused, setPaused] = useState(false)
  const [scene, setScene] = useState<SceneId>('garden')
  const [source, setSource] = useState<SourceMode | null>(null)
  const [soundLocked, setSoundLocked] = useState(false)
  const [bpm, setBpm] = useState(0)
  const [mixOpen, setMixOpen] = useState(false)
  const [toast, setToast] = useState({ text: '', id: 0 })
  const [dragging, setDragging] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [recording, setRecording] = useState(0)
  const [armed, setArmed] = useState(false)
  const [clip, setClip] = useState<Clip | null>(null)
  const [mapped, setMapped] = useState<'none' | 'analysing' | 'ready'>('none')
  /** Name of the mapped song whose world can be built (see song-world.ts). */
  const [songName, setSongName] = useState<string | null>(null)
  // Online play (online.ts, netsync.ts): the host's game runs the world and streams it; guests draw it and send actions.
  const online = useRef(new Online())
  const [net, setNet] = useState<{ role: Role; code: string; players: Player[] } | null>(null)
  const [onlineOpen, setOnlineOpen] = useState(false)
  const [netName, setNetName] = useState(() => { try { return localStorage.getItem(NAME_KEY) || randomName() } catch { return randomName() } })
  const [joinCode, setJoinCode] = useState(INVITE)
  const [netBusy, setNetBusy] = useState(false)
  const [netError, setNetError] = useState('')
  const remoteStrokes = useRef(new Map<number, Stroke & Brush & { world: World; seen: number }>())
  const remoteCursors = useRef(new Map<number, RemoteCursor & { seen: number }>())
  const guestView = useRef<{ cursors: RemoteCursor[]; haveKey: boolean }>({ cursors: [], haveKey: false })
  const [snapshotInbox] = useState(() => new SnapshotInbox(unpack, applyHostSnapshot, () => { guestView.current.haveKey = false }))
  const hostSync = useRef<{ base: SyncBase | null; sending: boolean; lastSent: number; lastKey: number; needKey: boolean; lastMusic: number }>(
    { base: null, sending: false, lastSent: 0, lastKey: 0, needKey: true, lastMusic: 0 })
  const musicHint = useRef('')
  const [dropReady, setDropReady] = useState(false)
  const session = useRef(new RaveSession())
  const [rave, setRave] = useState(() => session.current.status)
  const [raveMode, setRaveMode] = useState<RaveMode>('freestyle')
  const runningMode = useRef<RaveMode>('freestyle')
  const challenge = useRef<ReturnType<typeof prepareChallenge>>(null)
  const ravePickerFromMenu = useRef(false)
  const [result, setResult] = useState<DropResult | null>(null)
  const [menu, setMenu] = useState<'none' | 'scenes' | 'rec' | 'beats'>('none')
  const [fullscreen, setFullscreen] = useState(false)
  const [controllerConnected, setControllerConnected] = useState(false)
  const [secondConnected, setSecondConnected] = useState(false)
  const [controllerPage, setControllerPage] = useState<ControllerPage | null>(null)
  const [rumbleAvailable, setRumbleAvailable] = useState(false)
  const [directorOpen, setDirectorOpen] = useState(false)
  const [canDirectorUndo, setCanDirectorUndo] = useState(false)
  const imageBounds = useRef<{ world: World; x: number; y: number; w: number; h: number } | null>(null)
  const dropCheckpoint = useRef<{ world: World; image: typeof imageBounds.current } | null>(null)
  const directorUndo = useRef<{ world: World; settings: Settings; image: typeof imageBounds.current } | null>(null)
  /** An uploaded picture waiting to be placed. */
  const [placing, setPlacing] = useState<ImageBitmap | null>(null)
  const [imageLabOpen, setImageLabOpen] = useState(false)
  const [labImage, setLabImage] = useState<ImageBitmap | null>(null)
  const imageReady = useRef<World | null>(null)
  const imageLabUndo = useRef<{ world: World; image: typeof imageBounds.current } | null>(null)
  const [imgMode, setImgMode] = useState<ImageMode>('statue')
  const [cutBg, setCutBg] = useState(true)
  const [cutFullBg, setCutFullBg] = useState(false)
  const [imgWidth, setImgWidth] = useState(120)
  const [fillScreen, setFillScreen] = useState(false)
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 })
  /** The placement preview, downsampled to world cells. */
  const ghost = useRef<{ canvas: HTMLCanvasElement; pixels: Pixels; fullScreen: boolean } | null>(null)
  const imagePicker = useRef<HTMLInputElement>(null)
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled
  /** Last kick and beat length, on the same clock the drop button is read against. */
  const beat = useRef({ last: -Infinity, period: 0 })
  const envelope = useRef(new MusicEnvelope())
  const sky = useRef<HTMLCanvasElement>(null)

  const stage = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLElement>(null)
  const controllerDialog = useRef<HTMLDialogElement>(null)
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
  const [controllers] = useState(() => [new Controller(), new Controller()] as const)
  const mapPlayer = useRef<MapPlayer | null>(null)
  const mapToken = useRef(0)
  const heardKicks = useRef(0)
  const lastManualDrop = useRef(-Infinity)
  const chromaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const catching = useRef(false)
  const world = useRef<World>(null!)
  const draw = useRef<(night?: number, glowEnabled?: boolean) => void>(() => {})
  const view = useRef<View>({ x: 0, y: 0, scale: 1 })
  const controllerBlocked = directorOpen || imageLabOpen || !!clip || dragging
  const fewTools = starter && !allTools
  const visiblePads = fewTools ? PADS.filter(pad => STARTER_TOOLS.includes(pad.tool)) : PADS
  const live = useRef({ tool, brush, secondTool, secondBrush, paused, settings, splash, armed, placing: !!placing, controllerBlocked, controllerPage, starter, visiblePads, profile, imageLabOpen })
  live.current = { tool, brush, secondTool, secondBrush, paused, settings, splash, armed, placing: !!placing, controllerBlocked, controllerPage, starter, visiblePads, profile, imageLabOpen }
  const stroke = useRef<(Stroke & { id: number }) | null>(null)
  const cursor = useRef<(Cursor & { controller?: number }) | null>(null)

  const say = (text: string) => setToast(t => ({ text, id: t.id + 1 }))
  /** Guests in an online rave cannot change the world itself; the host does. */
  const hostOnly = () => {
    if (online.current.role !== 'guest') return false
    say('Only the host can do that in an online rave.')
    return true
  }

  const coach = (step: CoachStep | null) => {
    if (step && live.current.starter) setCoachDone(done => done.includes(step) ? done : completeStep(done, step))
  }

  function finishGuide(message?: string) {
    setStarter(false); setAllTools(false); setCoachDone([])
    try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* storage unavailable */ }
    if (message) say(message)
  }

  useEffect(() => {
    if (starter && COACH_STEPS.every(step => coachDone.includes(step.id)))
      finishGuide('That\'s the drop! Everything is unlocked: more materials, Rave mode, beat brushes, clips and the Mix.')
  }, [coachDone])

  // Picking a hidden tool by key or menu shows the whole dock.
  useEffect(() => {
    if (starter && !STARTER_TOOLS.includes(tool)) setAllTools(true)
  }, [tool])

  useEffect(() => {
    if (!toast.text) return
    const timer = setTimeout(() => setToast(t => ({ ...t, text: '' })), 2800)
    return () => clearTimeout(timer)
  }, [toast.id])

  // On a narrow screen the dock scrolls, so keep the selected tool visible after a key or bumper change.
  useEffect(() => {
    dock.current?.children[PADS.findIndex(p => p.tool === tool)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tool])

  useEffect(() => {
    const w = world.current
    if (!w) return
    if (!settings.crowd) w.ravers = []
    else if (!w.ravers.length) spawnCrowd(w)
  }, [settings.crowd])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ }
    detector.sensitivity = settings.sensitivity
  }, [settings])

  useEffect(() => {
    const query = matchMedia(LIGHT_DEVICE_QUERY)
    const change = () => setConstrained(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])

  useLayoutEffect(() => { if (world.current) layout() }, [profile.dpr])

  function layout() {
    const w = world.current
    if (!w || !layer.current || !overlay.current) return
    const width = stage.current!.clientWidth, height = stage.current!.clientHeight
    view.current = fitWorld(width, height, w.width, w.height)
    const { scale } = view.current
    Object.assign(layer.current.style, {
      width: `${w.width * scale}px`, height: `${w.height * scale}px`, left: `${view.current.x}px`, top: `${view.current.y}px`,
    })
    const dpr = Math.min(live.current.profile.dpr, devicePixelRatio || 1)
    recorder.setViewport(width, height, dpr)
    overlay.current.width = width * dpr
    overlay.current.height = height * dpr
    if (sky.current) { sky.current.width = width * dpr; sky.current.height = height * dpr }
  }

  function install(next: World, restoringDrop = false) {
    if (!restoringDrop && dropCheckpoint.current) {
      dropCheckpoint.current = null
      setCanRetry(false)
    }
    stroke.current = null
    if (live.current.settings.crowd && !next.ravers.length && online.current.role !== 'guest') spawnCrowd(next)
    world.current = next
    if (next.imageEffect) {
      const e = next.imageEffect
      imageBounds.current = { world: next, x: e.x / next.width, y: e.y / next.height, w: e.width / next.width, h: e.height / next.height }
    }
    imageReady.current = next.imageEffect && !next.imageEffect.fired ? cloneWorld(next) : null
    hostSync.current.base = null
    hostSync.current.needKey = true
    draw.current = createRenderer(next, base.current!, glow.current!, bloom.current!)
    setScene(next.scene)
    setGridSize({ width: next.width, height: next.height })
    layout()
  }

  function triggerDrop(manual = true) {
    if (online.current.role === 'guest') { if (manual) online.current.send({ a: 'drop' }); return }
    if (live.current.paused || live.current.controllerPage || live.current.imageLabOpen) return
    if (!manual && (world.current.imageEffect && !world.current.imageEffect.fired)) return
    if (!manual && performance.now() - lastManualDrop.current < 450) return
    const challenge = session.current
    if (challenge.finished) return
    if (challenge.active) {
      if (!manual) return
      if (challenge.charge < 1) { say('Still charging. Let the music fill the meter.'); return }
      const t = audio.fileTime() ?? performance.now() / 1000
      const r = challenge.drop(beatOffset(t, beat.current.last, beat.current.period), world.current.census())
      if (!r) return
      if (world.current.boss) world.current.boss.multiplier = r.grade.multiplier
      setResult({ ...r })
    }
    if (manual && !challenge.active && !challenge.finished) {
      const current = world.current, image = imageBounds.current
      dropCheckpoint.current = { world: cloneWorld(current), image: image?.world === current ? image : null }
      setCanRetry(true)
    }
    if (manual) { lastManualDrop.current = performance.now(); coach('drop') }
    setDropReady(false)
    if (live.current.armed && !recorder.active && manual && canRecord()) {
      recorder.start(8, audio.recordStream()); setArmed(false)
    }
    if (recorder.active && catching.current) { recorder.endIn(6); catching.current = false }
    world.current.drop(false)
    if (challenge.active) challenge.applyDropEffects()
    if (live.current.settings.dropRumble && document.hasFocus()) for (const controller of controllers) void controller.rumbleDrop()
    const el = layer.current
    if (el) {
      el.classList.add('chroma')
      clearTimeout(chromaTimer.current)
      chromaTimer.current = setTimeout(() => el.classList.remove('chroma'), 450)
    }
  }

  function retryDrop() {
    if (hostOnly()) return false
    const checkpoint = dropCheckpoint.current
    if (!checkpoint || session.current.active || session.current.finished) return false
    const restored = cloneWorld(checkpoint.world)
    install(restored, true)
    imageBounds.current = checkpoint.image ? { ...checkpoint.image, world: restored } : null
    clearTimeout(chromaTimer.current)
    layer.current?.classList.remove('chroma')
    say('Pre-drop setup restored.')
    return true
  }

  // Simulation + render loop
  useEffect(() => {
    install(makeWorld(live.current.settings.size, 'garden'))
    addEventListener('resize', layout)
    const fieldObserver = new ResizeObserver(layout)
    fieldObserver.observe(stage.current!)
    const root = document.documentElement
    const fx = overlay.current!.getContext('2d')!
    const sctx = spec.current!.getContext('2d')!
    let connected = false, secondJoined = false, hadRumble = false, shownSoundLock = false
    const seats: Seat[] = controllers.map(() => ({ point: null, stroke: null, stick: 0 }))
    const suspendController = () => {
      controllers.forEach(controller => controller.suspend())
      for (const seat of seats) { seat.stroke = null; seat.stick = 0 }
      if (cursor.current?.controller !== undefined) cursor.current = null
    }
    addEventListener('blur', suspendController)
    let lastHold = 0, lastCursor = 0
    let frame = 0, acc = 0, prev = performance.now(), nightLevel = live.current.settings.night ? 1 : 0, shownBpm = 0, shownCount: number | null = null, shownRec = 0, lastStatus = 0
    recorder.onDone = c => { setClip(c); setRecording(0); catching.current = false }

    function updateControllers(dt: number) {
      const previousStrokes = seats.map(seat => seat.stroke)
      for (const seat of seats) seat.stroke = null
      const { controllerBlocked, placing, splash, controllerPage } = live.current
      const blocked = controllerBlocked || !document.hasFocus()
      const wake = splash ? CONTROL.confirm | CONTROL.pause : 0
      const first = controllers[0].read(blocked, wake, controllers[1].deviceIndex)
      const second = controllers[1].read(blocked, wake, controllers[0].deviceIndex)
      const inputs = [first, second]
      if (connected !== !!(first || second)) {
        connected = !!(first || second)
        setControllerConnected(connected)
        if (connected && !splash) say('Controller connected. Y / Triangle opens the menu.')
      }
      if (secondJoined !== !!second) {
        secondJoined = !!second
        setSecondConnected(secondJoined)
        if (secondJoined && !splash) say('Player 2 joined. Each controller has its own brush.')
      }
      const canRumble = controllers.some(controller => controller.canRumble)
      if (hadRumble !== canRumble) { hadRumble = canRumble; setRumbleAvailable(canRumble) }

      for (let i = 0; i < inputs.length; i++) {
        if (inputs[i]) continue
        seats[i].point = null
        seats[i].stick = 0
        if (cursor.current?.controller === i) cursor.current = null
      }
      if (blocked || !connected) return
      const pressed = (first?.pressed ?? 0) | (second?.pressed ?? 0)
      if (splash) {
        if (pressed & (CONTROL.confirm | CONTROL.pause)) start(true)
        return
      }
      if (pressed && audio.demoNeedsActivation && navigator.userActivation?.isActive) void audio.enableDemoSound()

      const stickSteps = inputs.map((input, i) => {
        const y = input?.aim.y ?? 0
        const direction = Math.abs(y) > .55 ? Math.sign(y) : 0
        const step = direction !== seats[i].stick ? direction : 0
        seats[i].stick = direction
        return step
      })
      if (controllerPage) {
        const dialog = controllerDialog.current
        if (pressed & CONTROL.menu) changeControllerPage(null)
        else if (pressed & CONTROL.back) backControllerPage(controllerPage)
        else if (dialog) {
          const step = Number(!!(pressed & CONTROL.shrink)) - Number(!!(pressed & CONTROL.grow)) || stickSteps[0] || stickSteps[1]
          if (step) moveControllerFocus(dialog, step)
          else if (pressed & CONTROL.confirm) {
            const focused = document.activeElement
            if (focused instanceof HTMLButtonElement && dialog.contains(focused)) focused.click()
          }
        }
        return
      }
      if (!placing && (pressed & CONTROL.menu)) { changeControllerPage('main'); return }
      if (!placing && (pressed & CONTROL.retry) && retryDrop()) return

      const distance = Math.max(280, Math.min(stage.current!.clientWidth, stage.current!.clientHeight) * .75) * Math.min(dt, .05)
      inputs.forEach((input, i) => {
        if (!input) return
        const { aim, fineAim } = input
        const { x, y } = aim.x || aim.y ? aim : { x: fineAim.x * .28, y: fineAim.y * .28 }
        const seat = seats[i]
        const acting = x || y || (input.pressed & (CONTROL.paint | CONTROL.erase))
        if (acting || seat.point || secondJoined) {
          const mouse = !secondJoined && cursor.current?.controller === undefined ? cursor.current : null
          const point = mouse ?? seat.point ?? {
            sx: stage.current!.clientWidth * (secondJoined ? (i + 1) / 3 : .5), sy: stage.current!.clientHeight / 2,
          }
          seat.point = {
            sx: Math.max(0, Math.min(stage.current!.clientWidth - 1, point.sx + x * distance)),
            sy: Math.max(0, Math.min(stage.current!.clientHeight - 1, point.sy + y * distance)),
          }
          if (acting) cursor.current = { ...seat.point, controller: i }
        }
      })
      if (placing) {
        if (pressed & CONTROL.erase) setPlacing(null)
        else if (pressed & CONTROL.paint) {
          const player = inputs.findIndex(input => !!(input && (input.pressed & CONTROL.paint)))
          const point = seats[player]?.point
          if (point) cursor.current = { ...point, controller: player }
          placeLatest.current()
        }
        else if (pressed & CONTROL.menu) setFillScreen(full => !full)
        else {
          const size = Number(!!(pressed & CONTROL.grow)) - Number(!!(pressed & CONTROL.shrink))
          if (size) resizeImage(size * 8)
        }
        return
      }

      if (pressed & CONTROL.pause) setPaused(p => !p)
      if ((pressed & CONTROL.drop) && !session.current.finished) triggerDrop()

      inputs.forEach((input, i) => {
        if (!input) return
        const { held, pressed } = input
        const { tool, brush } = i === 0 ? live.current : { tool: live.current.secondTool, brush: live.current.secondBrush }
        const cycle = Number(!!(pressed & CONTROL.nextTool)) - Number(!!(pressed & CONTROL.previousTool))
        if (cycle) {
          const pads = live.current.visiblePads
          const index = pads.findIndex(p => p.tool === tool)
          const next = pads[(index + cycle + pads.length) % pads.length]
          const selectTool = i === 0 ? setTool : setSecondTool
          selectTool(next.tool)
          if (i === 0) dock.current?.children[PADS.indexOf(next)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
        const size = Number(!!(pressed & CONTROL.grow)) - Number(!!(pressed & CONTROL.shrink))
        if (size) {
          const selectBrush = i === 0 ? setBrush : setSecondBrush
          selectBrush(b => Math.max(1, Math.min(MAX_BRUSH, b + size)))
        }

        const seat = seats[i], point = seat.point, previous = previousStrokes[i]
        const erase = !!(held & CONTROL.erase)
        if ((!erase && !(held & CONTROL.paint)) || !point) return
        const cell = toCell(point.sx, point.sy)
        if (pressed & (erase ? CONTROL.erase : CONTROL.paint)) {
          setMixOpen(false)
          setMenu('none')
          paintAt(cell, erase, { tool, brush })
        } else if (previous?.world === world.current && previous.erase === erase) {
          const { last } = previous
          if ((cell.x !== last.x || cell.y !== last.y) && (erase || !isClickTool(tool))) paintLine(last, cell, erase, { tool, brush })
        } else return

        if (erase || !isClickTool(tool)) seat.stroke = { world: world.current, last: cell, erase, tool, brush }
      })
    }

    // One frame of the game. The animation loop runs it; while hosting online, a timer also runs it if the
    // tab is in the background (browsers pause animation frames there, which would freeze everyone's rave).
    let lastFrame = performance.now(), lastPaint = -Infinity
    const tick = (now: number) => {
      const w = world.current
      const { tool, brush, secondTool, secondBrush, settings, splash, armed, controllerPage } = live.current
      const paused = live.current.paused || !!controllerPage || live.current.imageLabOpen
      const guest = online.current.role === 'guest'
      const dt = Math.min(100, now - prev) / 1000
      acc += dt * 1000
      prev = now

      const bands = audio.read()
      const energy = envelope.current.update(bands, dt)
      if (!guest) w.setEnergy(energy, dt, settings.reactions, paused)
      if (!paused && !splash && !guest) session.current.tick(dt, energy.level)
      const heard = detector.update(bands, now / 1000)
      // A mapped song plays its beats from the map: exact timing, and we know when drops land.
      const songTime = audio.fileTime(), map = songTime === null ? null : mapPlayer.current
      const events = map ? map.update(songTime!) : heard
      if (audio.mode === 'tab' && (heard.breakdown || heard.drop)) setDropReady(true)
      if (events.kick && !guest) {
        w.onKick(events.kick, settings.reactions, paused)
        beat.current.last = map ? songTime! : now / 1000
      }
      if (events.hat && !guest) w.onHat(events.hat, settings.reactions, paused)
      const kick = events.kick > 0
      const downbeat = kick && (map ? (map.completedKicks - 1) % 4 === 0 : heardKicks.current++ % 4 === 0)
      const beats: BrushBeats = { kick, hat: events.hat > 0, downbeat }
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

      updateControllers(dt)
      if (w !== world.current) return
      if (events.drop && !guest && automaticDrops(audio.mode, session.current.active || session.current.finished)) triggerDrop(false)
      const strokes = seats.flatMap(seat => seat.stroke ? [seat.stroke] : [])
      if (stroke.current) strokes.push({ ...stroke.current, tool, brush, world: w })
      if (online.current.role === 'host') for (const [id, s] of remoteStrokes.current) {
        if (now - s.seen > 450 || s.world !== w) remoteStrokes.current.delete(id)
        else strokes.push(s)
      }
      // Guests' strokes are painted by the host; here they only steer the cursor.
      const editingLocked = (runningMode.current === 'skyline' && session.current.scoring) || guest
      if (!editingLocked && (beats.kick || beats.hat)) for (const s of strokes) {
        if (!s.erase && isBeatTool(s.tool)) paintBeatBrush(w, s.last.x, s.last.y, s.brush, s.tool, beats)
      }
      for (let n = 0; acc >= STEP_MS && n < 2; n++) {
        acc -= STEP_MS
        if (!paused && !guest) w.step()
        if (!editingLocked) for (const s of strokes) {
          if (s.erase || (!isSolidTool(s.tool) && !isClickTool(s.tool) && !isBeatTool(s.tool))) {
            w.paint(s.last.x, s.last.y, s.brush, s.tool, s.erase)
          }
        }
      }
      if (acc > STEP_MS) acc = 0
      w.decay()
      if (online.current.connected) {
        if (online.current.role === 'host' && online.current.players.length > 1) hostTick(now, w)
        if (guest && now - lastHold > 100 && (stroke.current || seats.some(seat => seat.stroke))) { lastHold = now; online.current.send({ a: 'hold' }) }
        const point = cursor.current ?? seats[0].point
        if (guest && point && now - lastCursor > 66) {
          lastCursor = now
          const c = toCell(point.sx, point.sy)
          online.current.send({ a: 'cursor', x: c.x, y: c.y, tool, brush })
        }
      }
      if (now - lastStatus > 250) {
        lastStatus = now
        const locked = !!audio.demoNeedsActivation
        if (locked !== shownSoundLock) { shownSoundLock = locked; setSoundLocked(locked) }
        const r = session.current
        if (r.scoring) { r.observe(w.census()); if (r.result) setResult({ ...r.result }) }
        r.observeObjective()
        setRave(r.status)
      }

      const visual = live.current.profile
      if (visual.light && now - lastPaint < 1000 / visual.fps - .5) return
      lastPaint = now
      const shake = w.pulse.shake, sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake
      if (layer.current) layer.current.style.transform = `translate(${sx}px,${sy}px) scale(${1 + w.pulse.kick * .006})`
      root.style.setProperty('--hue', (w.hue % 360).toFixed(1))
      root.style.setProperty('--pulse', w.pulse.kick.toFixed(3))
      root.style.setProperty('--glow', String(settings.glow))
      root.style.setProperty('--energy', energy.level.toFixed(3))

      drawAtmosphere(sky.current!.getContext('2d')!, w, now / 1000, visual.light ? 0 : settings.atmosphere)
      nightLevel += ((settings.night ? 1 : 0) - nightLevel) * Math.min(1, dt * 3)
      if (nightLevel < .002) nightLevel = 0
      draw.current(nightLevel, visual.glow)
      stage.current?.classList.toggle('night', nightLevel > .5)
      const placingNow = live.current.placing && ghost.current
      const cursors: BrushCursor[] = []
      if (!splash && !controllerPage && !recorder.active && !placingNow) {
        const point = cursor.current
        if (secondJoined) {
          const first = point && point.controller === undefined ? point : seats[0].point
          const second = seats[1].point
          if (first) cursors.push({ ...first, tool, brush, player: 1 })
          if (second) cursors.push({ ...second, tool: secondTool, brush: secondBrush, player: 2 })
        } else if (point) {
          cursors.push({ ...(point.controller === 0 ? seats[0].point ?? point : point), tool, brush })
        }
      }
      if (online.current.role && !splash) {
        const others = online.current.role === 'host' ? [...remoteCursors.current.values()]
          : guestView.current.cursors.filter(c => c.id !== online.current.you)
        const v = view.current
        for (const c of others) cursors.push({ sx: v.x + (c.x + .5) * v.scale, sy: v.y + (c.y + .5) * v.scale, tool: c.tool, brush: c.brush, label: c.name, color: netColor(c.id) })
      }
      const song = w.scene === 'song' ? getSongShape() : null, songAt = song && audio.mode === 'file' ? audio.fileTime() : null
      drawOverlay(fx, w, view.current, overlay.current!.width / stage.current!.clientWidth, cursors, challenge.current?.markers ?? (w.scene === 'song' ? songMarkers() : undefined),
        song && songAt !== null ? playheadColumn(w, song, songAt) : null)
      if (placingNow) drawGhost(fx, ghost.current!.canvas)
      if (recorder.active) {
        recorder.frame({ sky: sky.current!, base: base.current!, glow: glow.current!, bloom: bloom.current!, overlay: overlay.current! }, w, view.current,
          visual.glow ? settings.glow : 0, [sx, sy], nightLevel)
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
        sctx.fillStyle = '#9addd5'
        sctx.fillRect(k * sw / bars + 1, sh - bh, sw / bars - 3, bh)
      }
    }
    const loop = (now: number) => { lastFrame = performance.now(); tick(now); frame = requestAnimationFrame(loop) }
    frame = requestAnimationFrame(loop)
    const backstop = setInterval(() => {
      const now = performance.now()
      if (online.current.role === 'host' && now - lastFrame > 150) tick(now)
    }, 40)
    audio.onEnded = () => { setSource(null); say('Audio stopped. Pick another source.') }
    // Development-only handle for automated play-testing.
    if (import.meta.env.DEV) Object.assign(window, { __rave: { world: () => world.current, session: () => session.current, audio, recorder, step: (n: number) => { for (let k = 0; k < n; k++) world.current.step() }, draw: () => draw.current() } })
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(backstop)
      clearTimeout(chromaTimer.current)
      removeEventListener('resize', layout)
      fieldObserver.disconnect()
      removeEventListener('blur', suspendController)
      audio.stop()
    }
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

  const cutImageBackground = fillScreen ? cutFullBg : cutBg
  useEffect(() => () => placing?.close(), [placing])
  useEffect(() => () => labImage?.close(), [labImage])

  /** Rebuild the placement preview whenever the picture, size or background option changes. */
  useLayoutEffect(() => {
    if (!placing) { ghost.current = null; return }
    const { width, height } = fillScreen ? gridSize : fitSize(placing.width, placing.height, imgWidth)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingQuality = 'high'
    if (fillScreen) {
      const crop = coverCrop(placing.width, placing.height, width, height)
      ctx.drawImage(placing, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
    } else ctx.drawImage(placing, 0, 0, width, height)
    let pixels: Pixels = ctx.getImageData(0, 0, width, height)
    if (cutImageBackground) {
      pixels = removeBackground(pixels)
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0)
    }
    ghost.current = { canvas, pixels, fullScreen: fillScreen }
  }, [placing, imgWidth, fillScreen, gridSize, cutImageBackground])

  /** Where the preview sits: centred on the pointer, or the middle of the world before the pointer moves. */
  function ghostOrigin() {
    const g = ghost.current!, w = world.current, c = cursor.current
    if (g.fullScreen) return { x: 0, y: 0 }
    const cx = c ? (c.sx - view.current.x) / view.current.scale : w.width / 2
    const cy = c ? (c.sy - view.current.y) / view.current.scale : w.height / 2
    return { x: Math.round(cx - g.pixels.width / 2), y: Math.round(cy - g.pixels.height / 2) }
  }

  function drawGhost(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const dpr = overlay.current!.width / stage.current!.clientWidth, s = view.current.scale * dpr
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
    if (hostOnly()) return
    if (session.current.active && challenge.current) { say('Return to Sandbox to add an image.'); return }
    if (!file.type.startsWith('image/')) { say('That is not an image.'); return }
    try {
      let bitmap = await createImageBitmap(file)
      // Keep the reusable source compact on phones; simulation previews are smaller still.
      if (Math.max(bitmap.width, bitmap.height) > 1600) {
        const original = bitmap, scale = 1600 / Math.max(original.width, original.height)
        try { bitmap = await createImageBitmap(original, { resizeWidth: Math.max(1, Math.round(original.width * scale)), resizeHeight: Math.max(1, Math.round(original.height * scale)), resizeQuality: 'high' }) }
        finally { original.close() }
      }
      if (session.current.active && challenge.current) { bitmap.close(); return }
      const w = world.current
      // start at a size that fits comfortably: under half the width and 70% of the height
      const width = Math.round(Math.min(w.width * .45, w.height * .7 * bitmap.width / bitmap.height))
      setImgWidth(Math.max(12, width))
      setFillScreen(false)
      setLabImage(bitmap)
      setImageLabOpen(true)
      setMixOpen(false)
      setMenu('none')
      setControllerPage(null)
      setSplash(false)
    } catch {
      say('That image could not be opened.')
    }
  }

  function openImageLab() {
    if (hostOnly()) return
    if (session.current.active || session.current.finished) { say('Return to Sandbox to use Image Lab.'); return }
    setImageLabOpen(true); setMixOpen(false); setMenu('none'); setControllerPage(null)
  }

  function createImageScene(preset: ImagePreset, pixels: Pixels) {
    if (hostOnly()) return
    if (session.current.active || session.current.finished) { say('Return to Sandbox to build an image scene.'); return }
    const current = world.current
    const next = buildImageScene(current.width, current.height, preset, pixels)
    imageLabUndo.current = { world: cloneWorld(current), image: imageBounds.current }
    install(next)
    setImageLabOpen(false); setPlacing(null); setSplash(false); setPaused(false)
    if (live.current.starter) finishGuide()
    say(`${IMAGE_PRESETS.find(p => p.id === preset)!.name} ready. Press DROP to release your image.`)
  }

  async function stampLabImage(pixels: Pixels) {
    const bitmap = labImage ? await createImageBitmap(labImage) : await createImageBitmap(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height))
    const w = world.current
    setImgWidth(Math.max(12, Math.round(Math.min(w.width * .45, w.height * .7 * bitmap.width / bitmap.height))))
    setFillScreen(false); setPlacing(bitmap); setImageLabOpen(false); setSplash(false)
  }

  function resetImageScene() {
    if (!imageReady.current || hostOnly()) return
    install(cloneWorld(imageReady.current)); setImageLabOpen(false)
    say('Image scene reset. Press DROP when you are ready.')
  }

  function undoImageScene() {
    const previous = imageLabUndo.current
    if (!previous || hostOnly()) return
    install(previous.world)
    imageBounds.current = previous.image?.world ? { ...previous.image, world: previous.world } : null
    imageLabUndo.current = null; setImageLabOpen(false)
    say('Previous world restored.')
  }

  function placeImage() {
    const g = ghost.current
    if (!g) return
    const { x, y } = ghostOrigin()
    const placed = stampImage(world.current, g.pixels, x, y, imgMode)
    if (placed) imageBounds.current = { world: world.current, x: x / world.current.width, y: y / world.current.height, w: g.pixels.width / world.current.width, h: g.pixels.height / world.current.height }
    setPlacing(null)
    if (!placed) { say('Nothing landed. Try moving it onto the screen or turning off Cut background.'); return }
    say({
      statue: 'Statue placed. Bombs and blasts will knock it down.',
      sand: 'Sand painting placed. It lets go on the next kick.',
      elements: 'Placed as elements. Watch it come alive.',
    }[imgMode])
  }

  /** The latest placement action for the keyboard and controller handlers. */
  const placeLatest = useRef(placeImage)
  placeLatest.current = placeImage

  function resizeImage(delta: number) {
    setFillScreen(false)
    setImgWidth(v => Math.max(12, Math.min(world.current?.width ?? 400, v + delta)))
  }

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
      if (live.current.imageLabOpen) return
      if (live.current.controllerPage || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      const key = e.key.toLowerCase()
      if (live.current.splash) {
        if (key === 'enter' && !e.repeat) { e.preventDefault(); start() }
        return
      }
      if (key === 'enter' && audio.demoNeedsActivation) {
        e.preventDefault()
        void audio.enableDemoSound()
        return
      }
      if (live.current.placing) {
        if (key === 'escape') setPlacing(null)
        else if (key === '[' || key === '-') resizeImage(-6)
        else if (key === ']' || key === '=') resizeImage(6)
        else if (key === 'enter' && !(e.target instanceof HTMLElement && e.target.closest('button'))) placeLatest.current()
        return
      }
      if (key === 'i') { openImageLab(); return }
      const pad = PADS.find(p => p.key.toLowerCase() === key)
      if (pad) setTool(pad.tool)
      else if (key === '[' || key === '-') setBrush(b => Math.max(1, b - 1))
      else if (key === ']' || key === '=') setBrush(b => Math.min(MAX_BRUSH, b + 1))
      else if (key === ' ') { e.preventDefault(); setPaused(p => !p) }
      else if (key === 'd') triggerDrop()
      else if (key === 'u' && !e.repeat) retryDrop()
      else if (key === 'r') { if (imageReady.current) resetImageScene(); else loadScene(world.current.scene) }
      else if (key === 'f') toggleFullscreen()
      else if (key === 'n') setSettings(s => ({ ...s, night: !s.night }))
      else if (key === 'escape') { setMixOpen(false); setMenu('none') }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // ---------------------------------------------------------------- actions

  function changeControllerPage(page: ControllerPage | null) {
    setControllerPage(page)
    if (page === 'main') { setMenu('none'); setMixOpen(false) }
  }

  function openRavePicker(fromMenu = false) {
    if (hostOnly()) return
    if (session.current.active) return
    ravePickerFromMenu.current = fromMenu
    changeControllerPage('raves')
    setMenu('none')
    setMixOpen(false)
  }

  function backControllerPage(page: ControllerPage) {
    changeControllerPage(page === 'main' || (page === 'raves' && !ravePickerFromMenu.current) ? null : 'main')
  }

  function resetBeats() {
    detector.reset()
    heardKicks.current = 0
  }

  // ---------------------------------------------------------------- online play

  /** Host: stream the world about 12 times a second, with a keyframe every few seconds or when someone joins. */
  function hostTick(now: number, w: World) {
    const sync = hostSync.current, net = online.current
    if (now - sync.lastMusic > 2000) { sync.lastMusic = now; net.send(musicNote()) }
    if (sync.sending || now - sync.lastSent < 83 || net.backlog > 600_000) return
    sync.lastSent = now
    const key = sync.needKey || !sync.base || now - sync.lastKey > 4000
    const { bytes, base, keyframe } = encodeSnapshot(w, key ? null : sync.base, snapshotCursors())
    sync.base = base
    if (keyframe) { sync.lastKey = now; sync.needKey = false }
    sync.sending = true
    void pack(bytes).then(packed => net.sendSnapshot(packed)).catch(() => { sync.needKey = true }).finally(() => { sync.sending = false })
  }

  function snapshotCursors(): RemoteCursor[] {
    const list: RemoteCursor[] = [], net = online.current, now = performance.now()
    const point = cursor.current
    if (point) {
      const c = toCell(point.sx, point.sy)
      list.push({ id: net.you, name: net.players.find(p => p.id === net.you)?.name ?? 'Host', x: c.x, y: c.y, tool: live.current.tool, brush: live.current.brush })
    }
    for (const [id, c] of remoteCursors.current) {
      if (now - c.seen > 3000) remoteCursors.current.delete(id)
      else list.push({ id: c.id, name: c.name, x: c.x, y: c.y, tool: c.tool, brush: c.brush })
    }
    return list
  }

  function musicNote(): HostNote {
    const source = audio.mode
    const time = source === 'demo' ? audio.demoTime() ?? 0 : source === 'file' ? audio.fileTime() ?? 0 : 0
    return { t: 'music', source, time, name: source === 'file' ? audio.fileName : '', duration: audio.fileDuration }
  }

  /** Host: apply what a guest did, as if they were another player at this screen. */
  function onGuestAction(id: number, m: GuestAction) {
    const w = world.current, now = performance.now()
    const cell = (c: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(w.width - 1, Math.round(Number(c.x) || 0))), y: Math.max(0, Math.min(w.height - 1, Math.round(Number(c.y) || 0))),
    })
    const validTool = (t: unknown): t is Tool => PADS.some(p => p.tool === t)
    const sizeOf = (b: unknown) => Math.max(1, Math.min(MAX_BRUSH, Math.round(Number(b) || 1)))
    if (m.a === 'cursor') {
      if (!validTool(m.tool)) return
      const name = online.current.players.find(p => p.id === id)?.name ?? 'Raver'
      remoteCursors.current.set(id, { id, name, ...cell(m), tool: m.tool, brush: sizeOf(m.brush), seen: now })
      return
    }
    if (m.a === 'drop') { triggerDrop(); return }
    if (m.a === 'down') {
      if (!validTool(m.tool)) return
      const at = cell(m), brush = sizeOf(m.brush), erase = !!m.erase
      paintAt(at, erase, { tool: m.tool, brush })
      if (erase || !isClickTool(m.tool)) remoteStrokes.current.set(id, { last: at, erase, tool: m.tool, brush, world: w, seen: now })
      return
    }
    const s = remoteStrokes.current.get(id)
    if (!s) return
    if (m.a === 'up') { remoteStrokes.current.delete(id); return }
    s.seen = now
    if (m.a === 'move') {
      const at = cell(m)
      if (s.erase || !isClickTool(s.tool)) paintLine(s.last, at, s.erase, s)
      s.last = at
    }
  }

  /** Guest: keep the music in step with the host's. */
  function onHostNote(note: HostNote) {
    if (note.t === 'toast') { say(note.text); return }
    if (note.source === 'demo') {
      const target = note.time + .12, t = audio.demoTime()
      const d = t === null ? Infinity : (((t - target) % DEMO_LOOP_SECONDS) + DEMO_LOOP_SECONDS) % DEMO_LOOP_SECONDS
      if (Math.min(d, DEMO_LOOP_SECONDS - d) > .25) { audio.playDemo(target); setSource('demo') }
    } else if (note.source === 'file') {
      if (audio.mode === 'file' && audio.fileName === note.name) {
        const t = audio.fileTime()
        if (t !== null && Math.abs(t - note.time) > .3) audio.seekFile(note.time + .1)
      } else if (musicHint.current !== note.name) {
        musicHint.current = note.name
        say(`The host is playing “${note.name}”. Drop the same file in to hear it in sync.`)
      }
    } else if (note.source && musicHint.current !== note.source) {
      musicHint.current = note.source
      say('The host is playing live audio. You see every beat, but the sound stays on their device.')
    }
  }

  /** Guest: apply ordered decoded snapshots; the inbox bounds slow-device work. */
  function applyHostSnapshot(bytes: Uint8Array) {
    if (online.current.role !== 'guest') return
    const g = guestView.current, head = snapshotSize(bytes)
    let w = world.current
    if (w.width !== head.width || w.height !== head.height) {
      if (!head.keyframe) return
      w = new World(head.width, head.height)
      install(w)
      g.haveKey = false
    }
    const info = applySnapshot(w, bytes, g.haveKey)
    if (!info) return
    if (head.keyframe) g.haveKey = true
    g.cursors = info.cursors
    setScene(info.scene)
  }

  function onSnapshot(packed: Uint8Array) { snapshotInbox.offer(packed) }

  useEffect(() => {
    const net = online.current
    net.on('room', (code, _you, players, role) => {
      snapshotInbox.reset()
      setNet({ role, code, players })
      setNetError('')
      if (role === 'guest') {
        guestView.current.haveKey = false
        remoteStrokes.current.clear()
        if (session.current.active || session.current.finished) leaveRave()
        setDirectorOpen(false); setPlacing(null); setImageLabOpen(false)
        world.current.imageEffect = null; imageReady.current = null; imageLabUndo.current = null
        say(`Joined rave ${code}. Waiting for the host's world…`)
      } else {
        hostSync.current.needKey = true
        say(`Your rave is open. Code ${code}.`)
      }
      setStarter(false)
    })
    net.on('players', players => {
      setNet(n => n && { ...n, players })
      hostSync.current.needKey = true
      hostSync.current.lastMusic = 0
    })
    net.on('action', (id, m) => onGuestAction(id, m))
    net.on('snapshot', onSnapshot)
    net.on('note', onHostNote)
    net.on('closed', reason => {
      snapshotInbox.reset()
      setNet(null)
      remoteStrokes.current.clear(); remoteCursors.current.clear(); guestView.current.cursors = []
      say(`${reason} You keep the world.`)
    })
    return () => net.leave()
  }, [])

  function saveName() { try { localStorage.setItem(NAME_KEY, netName) } catch { /* storage unavailable */ } }

  async function hostRave() {
    if (session.current.active) { say('Finish the Rave before going online.'); return }
    saveName(); setNetBusy(true); setNetError('')
    try { await online.current.host(netName) } catch (error) { setNetError(describe(error)) } finally { setNetBusy(false) }
  }

  async function joinRave(code = joinCode) {
    if (!validCode(code)) { setNetError('Enter the 4-letter code.'); return }
    saveName(); setNetBusy(true); setNetError('')
    try { await online.current.join(code, netName) } catch (error) { setNetError(describe(error)) } finally { setNetBusy(false) }
  }

  function leaveOnline() {
    snapshotInbox.reset()
    const wasHost = online.current.role === 'host'
    online.current.leave()
    setNet(null)
    remoteStrokes.current.clear(); remoteCursors.current.clear(); guestView.current.cursors = []
    say(wasHost ? 'Rave ended.' : 'You left the rave. You keep the world.')
  }

  function copyInvite() {
    if (!net) return
    const params = new URLSearchParams({ join: net.code })
    const relay = new URLSearchParams(location.search).get('relay')
    if (relay) params.set('relay', relay)
    const link = `${location.origin}${location.pathname}?${params}`
    navigator.clipboard?.writeText(link).then(() => say('Invite link copied.'), () => say(link)) ?? say(link)
  }

  function loadScene(id: SceneId) {
    if (hostOnly()) return
    if (session.current.active) { say('Finish the Rave or return to Sandbox to change worlds.'); return }
    if (session.current.finished) leaveRave()
    install(makeWorld(live.current.settings.size, id))
  }

  function changeSize(size: WorldSize) {
    if (hostOnly()) return
    if (session.current.active) { say('Finish the Rave before changing world detail.'); return }
    if (session.current.finished) leaveRave()
    setSettings(s => ({ ...s, size }))
    install(makeWorld(size, world.current.scene))
  }

  async function pickSource(mode: SourceMode) {
    try {
      if (mode !== 'file') { mapPlayer.current = null; setMapped('none'); mapToken.current++ }
      if (mode === 'demo') { audio.playDemo(); resetBeats() }
      else if (mode === 'file') { audioPicker.current?.click(); return }
      else if (mode === 'mic') { await audio.listenMic(); resetBeats(); say('Listening to your mic. Play something loud.') }
      else { await audio.listenTab(); resetBeats(); say('Hooked into tab audio. Play Spotify or YouTube in that tab.') }
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
      resetBeats()
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
      const drops = map.drops.length, shape = songShape(map, file.name)
      setSongShape(shape)
      setSongName(shape?.name ?? null)
      say(`Mapped: ${map.bpm ? `${map.bpm} BPM, ` : ''}${drops} drop${drops === 1 ? '' : 's'} found${shape ? '. Press Build its world to play inside it.' : ''}`)
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

  function start(withController = false) {
    setSplash(false)
    try {
      audio.playDemo()
      resetBeats()
      setSource('demo')
      if (validCode(INVITE)) { setOnlineOpen(true); void joinRave(INVITE) }
      else if (withController) say('Left stick aims. A / Cross paints. Y / Triangle opens the menu.')
      else if (!live.current.starter) say('Paint with the dock. Right-click erases. Wait for the drop.')
    } catch (error) { say(describe(error)) }
  }

  function startRave(mode: RaveMode) {
    if (hostOnly()) return
    const def = RAVE_MODES.find(info => info.id === mode)!
    setDirectorOpen(false)
    if (mode !== 'freestyle') setPlacing(null)
    const w = makeWorld(live.current.settings.size, def.scene ?? world.current.scene)
    challenge.current = prepareChallenge(mode, w)
    runningMode.current = mode
    setRaveMode(mode)
    setPaused(false)
    install(w)
    session.current.start(challenge.current?.objective)
    setRave(session.current.status)
    setResult(null)
    setDropReady(false)
    setMenu('none')
    changeControllerPage(null)
    if (mode !== 'freestyle') {
      const startingTool = mode === 'garden' ? M.Water : M.Bomb
      setTool(startingTool)
      setSecondTool(startingTool)
      dock.current?.children[PADS.findIndex(p => p.tool === startingTool)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    if (challenge.current) setToast(t => ({ ...t, text: '' }))
    else say('90 seconds, three drops. Set up bombs, bricks and seeds, then drop on the beat.')
  }

  function leaveRave() {
    session.current.leave()
    challenge.current = null
    runningMode.current = 'freestyle'
    setRave(session.current.status)
    setResult(null)
  }

  async function save() {
    try {
      await writeLocal(SAVE_KEY, encodeWorld(world.current))
      say('World saved in this browser.')
    } catch (error) { say(describe(error)) }
  }

  async function load() {
    if (hostOnly()) return
    try {
      const data = await readLocal(SAVE_KEY)
      if (session.current.active && challenge.current) { say('Finish the challenge before loading a world.'); return }
      if (!data) { say('Nothing saved yet.'); return }
      if (session.current.finished) leaveRave()
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
    if (hostOnly()) return
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large.')
      const data = await file.text()
      if (session.current.active && challenge.current) { say('Finish the challenge before importing a world.'); return }
      if (session.current.finished) leaveRave()
      install(decodeWorld(data))
      say(`Loaded ${file.name}`)
    } catch (error) { say(describe(error)) }
  }

  // ---------------------------------------------------------------- painting

  const toCell = (x: number, y: number) => ({
    x: Math.floor((x - view.current.x) / view.current.scale),
    y: Math.floor((y - view.current.y) / view.current.scale),
  })

  function paintAt(cell: Cell, erase: boolean, { brush, tool }: Brush = live.current) {
    if (online.current.role === 'guest') { online.current.send({ a: 'down', x: cell.x, y: cell.y, erase, tool, brush }); return }
    if (runningMode.current === 'skyline' && session.current.scoring) return
    if (!erase && isBeatTool(tool)) return
    if (!erase && isClickTool(tool)) {
      if (tool === BLAST) world.current.blast(cell.x, cell.y, blastRadius(brush), .8 + brush / 25, true)
      else if (!world.current.placeBomb(cell.x, cell.y, session.current.active && (runningMode.current === 'skyline' || runningMode.current === 'boss'))) { say('No room for a bomb there.'); return }
    } else world.current.paint(cell.x, cell.y, brush, tool, erase)
    coach(stepForPaint(tool, erase))
  }

  function paintLine(from: Cell, to: Cell, erase: boolean, { brush, tool }: Brush = live.current) {
    if (online.current.role === 'guest') { online.current.send({ a: 'move', x: to.x, y: to.y }); return }
    if (runningMode.current === 'skyline' && session.current.scoring) return
    if (!erase && isBeatTool(tool)) return
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
    cursor.current = localPoint(e.clientX, e.clientY, stage.current!.getBoundingClientRect())
    if (placing) {
      if (e.button === 2) { setPlacing(null); say('Image cancelled.') }
      else placeImage()
      return
    }
    const cell = toCell(cursor.current.sx, cursor.current.sy), erase = e.button === 2
    if (erase || !isClickTool(tool)) stroke.current = { id: e.pointerId, erase, last: cell }
    paintAt(cell, erase)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    cursor.current = localPoint(e.clientX, e.clientY, stage.current!.getBoundingClientRect())
    const s = stroke.current
    if (!s || s.id !== e.pointerId) return
    const cell = toCell(cursor.current.sx, cursor.current.sy)
    if (!isClickTool(tool) || s.erase) paintLine(s.last, cell, s.erase)
    s.last = cell
  }

  function endStroke(e: ReactPointerEvent<HTMLDivElement>) {
    if (online.current.role === 'guest' && stroke.current?.id === e.pointerId) online.current.send({ a: 'up' })
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
  const modeName = RAVE_MODES.find(mode => mode.id === raveMode)?.name
  const objectiveLabel = raveMode === 'skyline' ? 'Towers toppled' : raveMode === 'boss' ? 'Boss damage' : 'Roots alive'

  function directorContext() {
    const w = world.current, bounds = imageBounds.current
    return { scene: w.scene, width: w.width, height: w.height, gravity: w.rules.gravity, hue: w.hue,
      reactions: live.current.settings.reactions,
      imageBounds: bounds?.world === w ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : null }
  }

  function applyDirector(next: World, plan: ScenePlan) {
    if (session.current.active || session.current.finished) { say('Return to Sandbox to use the Director.'); return }
    directorUndo.current = { world: world.current, settings: live.current.settings, image: imageBounds.current }
    if (plan.scene) imageBounds.current = null
    else if (imageBounds.current?.world === world.current) imageBounds.current = { ...imageBounds.current, world: next }
    const changes = plan.environment
    setSettings(s => ({ ...s, reactions: { kick: changes.kick ?? s.reactions.kick, speakers: changes.speakers ?? s.reactions.speakers,
      sparks: changes.sparks ?? s.reactions.sparks, slosh: changes.slosh ?? s.reactions.slosh } }))
    install(next)
    setCanDirectorUndo(true)
    say('Director applied: ' + plan.title)
  }

  function undoDirector() {
    const previous = directorUndo.current
    if (!previous || session.current.active || session.current.finished) return
    install(previous.world); setSettings(previous.settings); imageBounds.current = previous.image
    directorUndo.current = null; setCanDirectorUndo(false)
  }

  return (
<div className={`app ${profile.light ? 'light-render' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { if (!e.relatedTarget) setDragging(false) }} onDrop={onDrop}>
      <div ref={stage} className="stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={endStroke} onPointerCancel={endStroke}
        onPointerLeave={e => { if (!stroke.current && cursor.current?.controller === undefined && e.pointerType === 'mouse') cursor.current = null }}
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
          <div className="logo" aria-label="Powder Rave">POWDER RAVE <i aria-hidden>///</i></div>
          {!starter && <button className={`chip ${directorOpen ? 'on' : ''}`} aria-expanded={directorOpen} onClick={() => {
            if (session.current.active || session.current.finished) { say('Return to Sandbox to use the Director.'); return }
            if (hostOnly()) return
            setDirectorOpen(o => !o); setMixOpen(false); setMenu('none')
          }}>Director</button>}
          <div className="chips">
            <div className="menu-wrap">
              <button className={`chip scene-btn ${menu === 'scenes' ? 'on' : ''}`} aria-expanded={menu === 'scenes'}
                onClick={() => setMenu(m => m === 'scenes' ? 'none' : 'scenes')}>
                <span className="world-label">Worlds</span><span className="world-current">{world.current?.imageEffect ? IMAGE_PRESETS.find(p => p.id === world.current.imageEffect!.preset)?.name : scene === 'song' ? 'Song World' : SCENES.find(x => x.id === scene)?.name}</span><span aria-hidden>⌄</span>
              </button>
              {menu === 'scenes' && (
                <div className="menu" role="menu" aria-label="Worlds"><div className="panel-heading">Worlds<button aria-label="Close worlds" onClick={() => setMenu('none')}>×</button></div>
                  {songName && (
                    <button role="menuitem" className={`song-item ${scene === 'song' ? 'on' : ''}`} onClick={() => { setMenu('none'); loadScene('song') }}>
                      <b>♪ {songName}</b><small>A world shaped by your song: loud parts are mountains, quiet parts are lakes, and every drop is a lava crater.</small>
                    </button>
                  )}
                  {SCENES.map(x => (
                    <button key={x.id} role="menuitem" className={scene === x.id ? 'on' : ''}
                      onClick={() => { setMenu('none'); loadScene(x.id) }}>
                      <b>{x.name}</b><small>{x.detail}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!starter && <div className="seg mode" role="group" aria-label="Mode">
              <button className={!rave.active && !rave.finished ? 'on' : ''} onClick={leaveRave}>Sandbox</button>
              <button className={rave.active || rave.finished ? 'on' : ''} aria-haspopup="dialog"
                onClick={() => openRavePicker()}>Rave</button>
            </div>}
            {controllerConnected && (
              <button className="chip" aria-haspopup="dialog" onClick={() => changeControllerPage('main')}>Controller</button>
            )}
            {!starter && <div className="menu-wrap">
              <button className={`chip ${isBeatTool(tool) || menu === 'beats' ? 'on' : ''}`} aria-expanded={menu === 'beats'}
                onClick={() => setMenu(m => m === 'beats' ? 'none' : 'beats')}>Beat brushes</button>
              {menu === 'beats' && (
                <section className="menu beat-menu" aria-label="Beat brushes">
                  {BEAT_PADS.map(pad => (
                    <button key={pad.tool} className={tool === pad.tool ? 'on' : ''} aria-pressed={tool === pad.tool}
                      onClick={() => { setTool(pad.tool); setMenu('none'); dock.current?.children[PADS.indexOf(pad)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }}>
                      <b>{pad.name} · {pad.key}</b><small>{pad.hint}</small>
                    </button>
                  ))}
                </section>
              )}
            </div>}
          </div>
          {(!starter || net) && (
            <button className={`chip online-chip ${net ? 'on' : ''}`} aria-expanded={onlineOpen} onClick={() => { setOnlineOpen(o => !o); setMenu('none'); setMixOpen(false) }}>
              {net ? <><i aria-hidden />{net.code} · {net.players.length}</> : 'Online'}
            </button>
          )}
          {secondConnected && !splash && (
            <div className="coop" aria-label="Co-op brushes">
              <span><b>P1</b> {activePad?.name} · {brush}</span>
              <span><b>P2</b> {PADS.find(pad => pad.tool === secondTool)?.name} · {secondBrush}</span>
            </div>
          )}
        </div>
        <div className="header-tools">        <button className={`tool ${settings.night ? 'on' : ''}`} title={settings.night ? 'Lights on (N)' : 'Night mode (N)'} aria-pressed={settings.night}
          onClick={() => setSettings(s => ({ ...s, night: !s.night }))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
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
        </div>
      </header>
      <section className="deck hud" aria-label="Audio and transport">
        <div className="transport">        <button className="tool" title={paused ? 'Resume (Space)' : 'Freeze (Space)'} onClick={() => setPaused(p => !p)}>{paused ? '▶' : '❚❚'}</button>
        <button className="tool" title="Reset scene (R)" onClick={() => { if (imageReady.current) resetImageScene(); else loadScene(scene) }}>↺</button>
        <button className={`tool image-lab-shortcut ${placing ? 'on' : ''}`} title="Image Lab (I): photo presets or stamp an image into your world" onClick={openImageLab}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" />
          </svg><span>Images</span>
        </button>
</div>
        <div className="track-name" title={source === 'file' ? audio.fileName : undefined}><small>AUDIO IN</small><strong>{source === 'file' ? audio.fileName : source === 'demo' ? 'DEMO LOOP' : source === 'tab' ? 'TAB AUDIO' : source === 'mic' ? 'MICROPHONE' : 'SELECT A SOURCE'}</strong></div>
          <div className="chips">
            {(['demo', 'file', 'mic', 'tab'] as const).map(m => (
              <button key={m} className={`chip ${source === m ? 'on' : ''}`} onClick={() => pickSource(m)}>
                {{ demo: 'Demo', file: 'File', mic: 'Mic', tab: 'Tab' }[m]}
              </button>
            ))}
          </div>
          {soundLocked && !splash && <button className="chip on" onClick={() => void audio.enableDemoSound()}>Enable sound · Enter</button>}
          <div className="meter">
            <canvas ref={spec} width={264} height={60} className="spec" />
            <i className="dot" />
            <div className="bpm">{bpm || '—'}<small>BPM</small></div>
            {mapped !== 'none' && source === 'file' && (
              <span className={`mapped ${mapped}`} title={mapped === 'ready' ? 'Beats come from a map of the whole song' : 'Mapping the song…'}>
                {mapped === 'ready' ? 'MAPPED' : 'MAPPING…'}
              </span>
            )}
            {!starter && <div className="menu-wrap">
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
            </div>}
            {!starter && <button className={`chip mixbtn ${mixOpen ? 'on' : ''}`} onClick={() => { setMenu('none'); setMixOpen(o => !o) }} aria-expanded={mixOpen}>Mix</button>}
          </div>
          {songName && mapped === 'ready' && source === 'file' && scene !== 'song' && !rave.active && (
            <button className="chip on song-chip" title="Build a world shaped by this song" onClick={() => loadScene('song')}>Build its world</button>
          )}
          {mixOpen && !starter && (
            <section className="mix" aria-label="Mix and world settings"><div className="panel-heading">Mix<button aria-label="Close mix" onClick={() => setMixOpen(false)}>×</button></div>
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
              <div className="row-label">Lights</div>
              <div className="seg">
                <button className={settings.night ? '' : 'on'} onClick={() => setSettings(s => ({ ...s, night: false }))}>Day</button>
                <button className={settings.night ? 'on' : ''} onClick={() => setSettings(s => ({ ...s, night: true }))}>Night · N</button>
              </div>
              <div className="row-label">Crowd</div>
              <div className="seg">
                <button className={settings.crowd ? 'on' : ''} onClick={() => setSettings(s => ({ ...s, crowd: true }))}>Ravers on</button>
                <button className={settings.crowd ? '' : 'on'} onClick={() => setSettings(s => ({ ...s, crowd: false }))}>Off</button>
              </div>
              <div className="row-label">Effects</div>
              <div className="seg" role="group" aria-label="Effect quality">
                {(['auto', 'full', 'light'] as const).map(quality => <button key={quality} className={settings.quality === quality ? 'on' : ''}
                  aria-pressed={settings.quality === quality} onClick={() => setSettings(s => ({ ...s, quality }))}>{quality === 'auto' ? 'Auto' : quality === 'full' ? 'Full' : 'Light'}</button>)}
              </div>
              <small className="quality-hint">{profile.light ? 'Light effects · 30 fps visuals. Physics and online actions stay active.' : 'Full effects · bloom and atmosphere.'}</small>
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
              <button className="reset-mix" onClick={() => setSettings(s => ({ ...DEFAULT_SETTINGS, size: s.size, dropRumble: s.dropRumble, crowd: s.crowd, night: s.night }))}>Reset mix</button>
            </section>
          )}
      </section>

      <nav ref={dock} className="hud dock" aria-label="Materials and tools">
        {PADS.map(p => (
          <button key={p.tool} hidden={!visiblePads.includes(p) || (!fewTools && !expandedTools && !PRIMARY_TOOLS.includes(p.tool) && tool !== p.tool)} className={`pad ${isBeatTool(p.tool) ? 'beat-pad ' : ''}${tool === p.tool ? 'on' : ''}`} style={{ '--c': p.swatch } as CSSProperties}
            title={`${p.name} (${p.key}): ${p.hint}`} aria-pressed={tool === p.tool} onClick={() => setTool(p.tool)}>
            <kbd>{p.key}</kbd><MaterialIcon tool={p.tool} /><span>{p.name}</span>
          </button>
        ))}
        {(fewTools || !starter) && (
          <button className={`pad more-pad ${expandedTools ? 'on' : ''}`} title="Show every material and tool" aria-expanded={expandedTools} onClick={() => { setAllTools(true); setExpandedTools(v => !v) }}>
            <i className="more-icon" aria-hidden>•••</i><span>{expandedTools ? 'Less' : 'More'}</span>
          </button>
        )}
      </nav>
      <div className="brush-controls hud">
        <label htmlFor="brush-size">Brush</label>
        <div><button className="tool" aria-label="Smaller brush" onClick={() => setBrush(b => Math.max(1, b - 1))}>−</button>
          <input id="brush-size" aria-label="Brush size" type="range" min="1" max={MAX_BRUSH} value={brush} onChange={e => setBrush(+e.target.value)} />
          <button className="tool" aria-label="Bigger brush" onClick={() => setBrush(b => Math.min(MAX_BRUSH, b + 1))}>+</button>
          <output htmlFor="brush-size">{String(brush).padStart(2, '0')}</output></div>
      </div>


      {!splash && (
        <div className="drop-corner">
          {canRetry && !rave.active && !rave.finished && (
            <button className="chip retry-drop" title="Restore the setup before the last manual drop (U or D-pad left)"
              onClick={retryDrop}>Retry the Drop</button>
          )}
          {(rave.active || rave.finished) && (
            <section className={`rave-card${rave.objectiveTarget > 0 ? ' mission-card' : ''}`} aria-label="Rave challenge" aria-live="polite">
              <div className="rave-top">
                <strong>{rave.finished ? rave.outcome === 'timeout' ? 'TIME UP' : rave.outcome === 'failed' ? 'TRY AGAIN'
                  : rave.objectiveTarget ? 'CHALLENGE CLEARED' : 'RAVE COMPLETE' : secondConnected ? 'CO-OP RAVE' : 'RAVE'}</strong>
                <span className="pips" aria-label={`${rave.drops} of ${rave.dropLimit} drops`}>{Array.from({ length: rave.dropLimit }, (_, n) =>
                  <i key={n} className={n < rave.drops ? 'on' : ''} />)}</span>
                {rave.active && <span className={`clock ${rave.seconds <= 10 ? 'low' : ''}`}>{rave.seconds}s</span>}
              </div>
              {rave.objectiveTarget > 0 && (
                <div className="rave-objective">
                  <b>{modeName}</b>
                  <div><span>{objectiveLabel}</span><strong>{rave.objectiveProgress} · Goal {rave.objectiveTarget}</strong></div>
                  <progress aria-label={objectiveLabel} max={rave.objectiveTarget} value={Math.min(rave.objectiveProgress, rave.objectiveTarget)} />
                  {rave.active && <small>{challenge.current?.hint(rave.drops, rave.scoring)}</small>}
                </div>
              )}
              <div className="score">{rave.score.toLocaleString()}<small>pts</small></div>
              {result && (
                <div className={`grade ${result.grade.label === 'PERFECT' ? 'perfect' : result.grade.label === 'GREAT' ? 'great' : ''}`} key={result.drop}>
                  Drop {result.drop}: {result.grade.label}{result.grade.multiplier > 1 ? ` ×${result.grade.multiplier}` : ''} · +{result.points.toLocaleString()}
                </div>
              )}
              {rave.finished && (
                <div className="rave-actions">
                  <button className="chip on" onClick={() => startRave(raveMode)}>Play again</button>
                  <button className="chip" onClick={() => openRavePicker()}>Challenges</button>
                  <button className="chip" onClick={leaveRave}>Sandbox</button>
                </div>
              )}
            </section>
          )}
          {starter && !rave.active && !rave.finished && (
            <section className="coach" aria-label="Getting started" aria-live="polite">
              <div className="coach-head"><strong>FIRST DROP</strong><button onClick={() => finishGuide('Everything is unlocked.')}>Skip</button></div>
              <ol>
                {COACH_STEPS.map(step => {
                  const state = coachDone.includes(step.id) ? 'done' : currentStep(coachDone) === step.id ? 'now' : ''
                  return (
                    <li key={step.id} className={state}>
                      <b>{step.title}</b>{state === 'now' && <small>{step.detail}</small>}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
          {!rave.finished && (
            <button className={`dropbtn main-drop ${(rave.active ? rave.charge >= 1 && !rave.scoring : dropReady || (starter && currentStep(coachDone) === 'drop')) ? 'ready' : ''}`}
              style={{ '--charge': `${(rave.active ? rave.charge : 1) * 100}%` } as CSSProperties}
              title={rave.active ? 'The music charges your drop. Press D on the beat for a multiplier.' : 'Force a drop (D)'}
              onClick={() => triggerDrop()}>
              {rave.active ? rave.scoring ? 'SCORING…' : rave.charge >= 1 ? 'DROP!' : `CHARGING ${Math.floor(rave.charge * 100)}%` : dropReady ? 'DROP READY' : 'DROP'}
            </button>
          )}
        </div>
      )}
      {onlineOpen && !splash && (
        <section className="online-panel" aria-label="Online rave">
          <div className="online-head">
            <b>Online rave</b>
            <button aria-label="Close" onClick={() => setOnlineOpen(false)}>×</button>
          </div>
          {!net ? (
            <>
              <label>Your name
                <input value={netName} maxLength={20} onChange={e => setNetName(e.target.value)} />
              </label>
              <button className="chip on online-main" disabled={netBusy} onClick={() => void hostRave()}>Host a rave</button>
              <div className="online-join">
                <input aria-label="Room code" placeholder="CODE" value={joinCode} maxLength={4} autoCapitalize="characters"
                  onChange={e => setJoinCode(cleanCode(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') void joinRave() }} />
                <button className="chip" disabled={netBusy || !validCode(joinCode)} onClick={() => void joinRave()}>Join</button>
              </div>
              <small>Up to four people share one world and one beat. The host's game runs the world; everyone paints, plants bombs and hits DROP.</small>
              {netBusy && <small>Connecting…</small>}
              {netError && <p className="online-error" role="alert">{netError}</p>}
            </>
          ) : (
            <>
              <div className="online-code" aria-label="Room code">{net.code}</div>
              {net.role === 'host'
                ? <button className="chip on" onClick={copyInvite}>Copy invite link</button>
                : <small>You're in {net.players.find(p => p.host)?.name ?? 'the host'}'s rave. They pick the world and the music.</small>}
              <ul className="online-players">
                {net.players.map(p => (
                  <li key={p.id} style={{ '--c': netColor(p.id) } as CSSProperties}>
                    <i aria-hidden />{p.name}{p.host ? ' · host' : ''}{p.id === online.current.you ? ' (you)' : ''}
                  </li>
                ))}
              </ul>
              {net.role === 'host' && <small>{net.players.length < 2 ? 'Waiting for friends. Share the code or the link.' : 'Your game runs the world, so keep this tab open.'}</small>}
              <button className="chip" onClick={leaveOnline}>{net.role === 'host' ? 'End rave' : 'Leave'}</button>
            </>
          )}
        </section>
      )}
      {directorOpen && !splash && <Director getWorld={() => world.current} context={directorContext} apply={applyDirector}
        undo={undoDirector} canUndo={canDirectorUndo && !rave.active && !rave.finished} close={() => setDirectorOpen(false)} />}
      {activePad && !splash && <footer className="status-line"><span><b>{world.current?.imageEffect && !world.current.imageEffect.fired ? 'IMAGE READY' : activePad.name}</b><i>/</i>{world.current?.imageEffect && !world.current.imageEffect.fired ? 'Press DROP to release your picture.' : activePad.hint}</span><span className="keyboard-hints"><kbd>SPACE</kbd> Pause <kbd>R</kbd> Reset <kbd>I</kbd> Image</span></footer>}
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
      {imageLabOpen && <ImageLab image={labImage} width={world.current.width} height={world.current.height}
        initialPreset={world.current.imageEffect?.preset ?? 'box'} canReset={!!imageReady.current} canUndo={!!imageLabUndo.current}
        onChoose={() => imagePicker.current?.click()} onCreate={createImageScene} onStamp={pixels => { void stampLabImage(pixels).catch(error => say(describe(error))) }}
        onReset={resetImageScene} onUndo={undoImageScene} onClose={() => setImageLabOpen(false)} />}
      {placing && (
        <section className="placer" aria-label="Place image">
          <div className="placer-title">
            <b>{fillScreen ? 'Full-screen preview' : 'Click to drop it in'}</b>
            <span>{controllerConnected
              ? 'A/Cross to place · B/Circle to cancel · Y/Triangle for full screen'
              : fillScreen ? 'Centered and cropped to fill the playfield' : 'Scroll or [ ] to resize · right-click or Esc to cancel'}</span>
          </div>
          <div className="seg">
            {IMAGE_MODES.map(m => (
              <button key={m.id} className={imgMode === m.id ? 'on' : ''} title={m.detail} onClick={() => setImgMode(m.id)}>{m.name}</button>
            ))}
          </div>
          <small className="placer-detail">{IMAGE_MODES.find(m => m.id === imgMode)!.detail}</small>
          <div className="placer-row">
            <label className="check"><input type="checkbox" checked={cutImageBackground}
              onChange={e => (fillScreen ? setCutFullBg : setCutBg)(e.target.checked)} /> Cut background</label>
            {!fillScreen && (
              <span className="placer-size">
                <button className="tool" aria-label="Smaller" onClick={() => resizeImage(-8)}>−</button>
                <span>{imgWidth}</span>
                <button className="tool" aria-label="Bigger" onClick={() => resizeImage(8)}>+</button>
              </span>
            )}
          </div>
          <div className="placer-row placer-actions">
            <button className={`chip ${fillScreen ? 'on' : ''}`} aria-pressed={fillScreen}
              onClick={() => setFillScreen(full => !full)}>Full Screen</button>
            {fillScreen && <button className="chip on" onClick={placeImage}>Place image</button>}
            <button className="chip" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        </section>
      )}
      <input ref={audioPicker} type="file" accept="audio/*" hidden onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''
        if (file) void playFile(file)
      }} />
      <input ref={worldPicker} type="file" accept="application/json,.json" hidden onChange={importWorld} />

      <ControllerMenu dialog={controllerDialog} page={controllerPage} scene={scene} raveActive={rave.active}
        raveFinished={rave.finished} connected={controllerConnected} rumble={settings.dropRumble} onPage={changeControllerPage} onBack={backControllerPage}
        onRetry={canRetry && !rave.active && !rave.finished ? () => { retryDrop(); changeControllerPage(null) } : undefined}
        onWorld={id => { loadScene(id); changeControllerPage(null) }}
        onRavePicker={() => openRavePicker(true)} onRave={startRave} onReplay={() => startRave(raveMode)}
        onSandbox={() => { leaveRave(); changeControllerPage(null) }}
        onRumble={rumbleAvailable ? () => setSettings(s => ({ ...s, dropRumble: !s.dropRumble })) : undefined} />

      {splash && (
        <div className="splash">
          <div className="inner">
            <h1>POWDER<br />RAVE</h1>
            <p>A falling-sand world that hears your music. Kicks make the ground jump, speakers blast the dirt around, and the drop sets everything off.</p>
            <button className="start" onClick={() => start()}>DROP THE BEAT</button>
            <small>{controllerConnected ? 'Press A / Cross or Start / Options to play.' : 'Press Enter, or connect a controller and press A / Cross to play.'}</small>
          </div>
        </div>
      )}
    </div>
  )
}

