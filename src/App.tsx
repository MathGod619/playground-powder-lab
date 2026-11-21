import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import {
  Activity, AudioLines, CircleHelp, Download, Eraser, FolderOpen, Grid2X2, Hand, Maximize2, Minimize2,
  Layers3, Minus, Pause, Play, Plus, RotateCcw, Save, Sparkles, Upload, Waves, Wind, Zap, ZoomIn, ZoomOut,
} from 'lucide-react'
import { advanceBeat, applyAudioHits, bands, defaultSettings, MAX_BPM, MIN_BPM, newClock, type Band, type Settings } from './beat.ts'
import { AudioInput } from './audio.ts'
import { AudioSource, SOURCE_LABEL } from './AudioSource.tsx'
import { clampCamera, fitCamera, zoomAt, type Camera } from './camera.ts'
import { WorldLibrary } from './WorldLibrary.tsx'
import { makeWorld, WORLD_SIZES, WORLDS, type WorldId } from './worlds.ts'
import { DRAFT_KEY, readLocal, writeLocal } from './storage.ts'
import { HEIGHT, HZ, Sandbox, WIDTH, type Point } from './engine.ts'
import { Material as M, MATERIALS, type Material } from './materials.ts'
import { createRenderer } from './render.ts'
import { decodeSession, encodeSession, LOCAL_KEY, MAX_BRUSH, MAX_FILE_BYTES } from './session.ts'

const STEP_MS = 1000 / HZ
const BAND_LABELS = {
  bass: { name: 'Bass', effect: 'Shockwave', color: '#e9ba73', Icon: Waves },
  mid: { name: 'Midrange', effect: 'Wind', color: '#78cae0', Icon: Wind },
  treble: { name: 'Treble', effect: 'Sparks', color: '#c1a5ed', Icon: Zap },
}
const describeError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.'
const rangeStyle = (percent: number, color?: string) =>
  ({ '--progress': `${percent}%`, '--range-color': color }) as CSSProperties

function freshStart() {
  const { width, height } = WORLD_SIZES[1]
  const world = new Sandbox(width, height)
  makeWorld(world, 'volcano')
  return { world, clock: newClock(), settings: defaultSettings, camera: fitCamera(world) }
}

type Stroke = { pointerId: number; button: number; point: Point | null }

export function App() {
  const [initial] = useState(freshStart)
  const [audio] = useState(() => new AudioInput())
  const source = useSyncExternalStore(audio.subscribe, audio.snapshot)
  const [settings, setSettings] = useState(initial.settings)
  const controls = useRef(settings)
  const world = useRef(initial.world)
  const clock = useRef(initial.clock)
  const camera = useRef(initial.camera)
  const [scale, setScale] = useState(initial.camera.zoom)
  const [scene, setScene] = useState({ id: initial.world.template, width: initial.world.width, height: initial.world.height })
  const [library, setLibrary] = useState(false)
  const [panning, setPanning] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const chamber = useRef<HTMLElement>(null)
  const pan = useRef<{ pointerId: number; start: Point; view: Camera } | null>(null)
  const interacted = useRef(false)
  const [stats, setStats] = useState({ count: world.current.occupied, beat: clock.current.beat, regions: 0 })
  const [notice, setNotice] = useState({ text: '', error: false })
  const [help, setHelp] = useState(false)
  const [canvasError, setCanvasError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const halo = useRef<HTMLCanvasElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const stroke = useRef<Stroke | null>(null)
  const hover = useRef<Point | null>(null)
  const importId = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)

  function change(next: Settings) {
    interacted.current = true
    controls.current = next
    setSettings(next)
  }

  function patch(update: Partial<Settings>) {
    change({ ...controls.current, ...update })
  }

  function patchBand(band: Band, update: Partial<Settings['bands'][Band]>) {
    const reactions = controls.current.bands
    patch({ bands: { ...reactions, [band]: { ...reactions[band], ...update } } })
    if (update.enabled === false || update.sensitivity === 0) {
      const active = world.current
      if (band === 'bass' && active.wave) {
        active.wave = null
        active.revision++
      }
      if (band === 'mid' && active.wind) {
        active.wind = null
        active.revision++
      }
    }
  }

  function changeBpm(bpm: number) {
    patch({ bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm))) })
  }

  function toggleReactions() {
    const enabled = !controls.current.enabled
    if (!enabled) {
      world.current.wave = null
      world.current.wind = null
      world.current.revision++
    }
    patch({ enabled })
  }

  function show(text: string, error = false) { setNotice({ text, error }) }

  function restore(data: ReturnType<typeof decodeSession>) {
    stroke.current = null
    pan.current = null
    world.current = data.world
    clock.current = data.clock
    change(data.settings)
    setView(data.camera)
    setScene({ id: data.world.template, width: data.world.width, height: data.world.height })
    setStats({ count: data.world.occupied, beat: data.clock.beat, regions: 0 })
  }

  function loadWorld(id: WorldId, width: number, height: number) {
    importId.current++
    const next = new Sandbox(width, height)
    makeWorld(next, id)
    restore({ world: next, clock: newClock(), settings: controls.current, camera: fitCamera(next) })
    setLibrary(false)
  }

  function snapshot() {
    return encodeSession(world.current, clock.current, controls.current, camera.current)
  }

  async function save() {
    try {
      await writeLocal(LOCAL_KEY, snapshot())
      show('Checkpoint saved in this browser.')
    } catch {
      show('Could not save in this browser. Use Export to keep a copy.', true)
    }
  }

  async function load() {
    interacted.current = true
    const id = ++importId.current
    try {
      const saved = await readLocal(LOCAL_KEY)
      if (id !== importId.current) return
      if (!saved) {
        show('No checkpoint yet. Use Save to create one.', true)
        return
      }
      restore(decodeSession(saved))
      show('Checkpoint loaded.')
    } catch (error) {
      if (id === importId.current) show(describeError(error), true)
    }
  }

  function download() {
    const contents = snapshot()
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'playground-powder-session.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    show('Session exported.')
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    interacted.current = true
    const id = ++importId.current
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Session file is too large.')
      const data = decodeSession(await file.text())
      if (id !== importId.current) return
      restore(data)
      show('Session imported.')
    } catch (error) {
      if (id === importId.current) show(describeError(error), true)
    }
  }

  useEffect(() => {
    if (!canvas.current || !halo.current) return
    let render: ReturnType<typeof createRenderer>
    try {
      render = createRenderer(canvas.current, halo.current)
    } catch (error) {
      setCanvasError(describeError(error))
      return
    }
    let animation = 0
    let previous = 0
    let accumulated = 0
    let lastStats = 0
    let lastBeat = clock.current.beat
    let previousSource = audio.snapshot()
    let windDirection: -1 | 1 = 1
    const frame = (now: number) => {
      const state = controls.current
      const active = world.current
      const activeSource = audio.snapshot()
      if (activeSource.mode !== previousSource.mode ||
          (previousSource.status === 'live' && activeSource.status !== 'live')) {
        active.wave = null
        active.wind = null
        active.revision++
      }
      previousSource = activeSource
      const hits = document.hidden ? null : audio.read(now)
      if (hits && !state.paused && state.enabled) {
        applyAudioHits(state, active, hits, windDirection)
        if (hits.mid && state.bands.mid.enabled) windDirection = windDirection === 1 ? -1 : 1
      }
      const elapsed = Math.min(now - (previous || now), STEP_MS * 4)
      previous = now
      if (state.paused || document.hidden) {
        accumulated = 0
      } else {
        if (activeSource.mode === 'simulator') advanceBeat(clock.current, state, active, elapsed / STEP_MS)
        accumulated += elapsed
        const frameStart = performance.now()
        for (let step = 0; accumulated >= STEP_MS && step < 4; step++) {
          if (step > 0 && performance.now() - frameStart > 11) {
            accumulated %= STEP_MS
            break
          }
          accumulated -= STEP_MS
          const painting = stroke.current
          if (painting?.point) {
            active.stamp(painting.point, state.brush, painting.button === 2 ? M.Empty : state.material as Material)
          }
          active.step()
        }
      }
      render(active, state, camera.current)
      if (now - lastStats >= 250 || clock.current.beat !== lastBeat) {
        lastStats = now
        lastBeat = clock.current.beat
        setStats(old => old.count === active.occupied && old.beat === lastBeat && old.regions === active.runningRegions
          ? old : { count: active.occupied, beat: lastBeat, regions: active.runningRegions })
      }
      animation = requestAnimationFrame(frame)
    }
    animation = requestAnimationFrame(frame)
    const releaseAudio = () => audio.stop()
    window.addEventListener('pagehide', releaseAudio)
    return () => {
      cancelAnimationFrame(animation)
      window.removeEventListener('pagehide', releaseAudio)
      audio.dispose()
    }
  }, [audio])

  useEffect(() => {
    let alive = true
    let ready = false
    let lastSaved = ''
    void readLocal(DRAFT_KEY).then(saved => {
      if (saved && alive && !interacted.current) restore(decodeSession(saved))
    }).catch(() => {}).finally(() => { ready = true })
    const saveDraft = () => {
      if (!ready) return
      const data = snapshot()
      if (data === lastSaved) return
      lastSaved = data
      void writeLocal(DRAFT_KEY, data).catch(() => {
        if (lastSaved === data) lastSaved = ''
      })
    }
    const persistWhenHidden = () => { if (document.hidden) saveDraft() }
    const interval = window.setInterval(saveDraft, 10000)
    window.addEventListener('pagehide', saveDraft)
    document.addEventListener('visibilitychange', persistWhenHidden)
    return () => {
      alive = false
      window.clearInterval(interval)
      window.removeEventListener('pagehide', saveDraft)
      document.removeEventListener('visibilitychange', persistWhenHidden)
    }
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!stroke.current) {
        const point = screenPoint(event.clientX, event.clientY, element)
        const next = camera.current.zoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .003)
        setView(zoomAt(world.current, camera.current, next, point))
      }
    }
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === chamber.current)
    element.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => {
      element.removeEventListener('wheel', wheel)
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [])

  useEffect(() => {
    if (!overlay) return
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOverlay(false) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [overlay])

  useEffect(() => {
    if (!notice.text) return
    const timeout = window.setTimeout(() => setNotice({ text: '', error: false }), notice.error ? 6500 : 3600)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest('button, input, a, dialog'))) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return
      if (/^[1-8]$/.test(event.key)) patch({ material: Number(event.key) })
      else if (event.key.toLowerCase() === 'e') patch({ material: M.Empty })
      else if (event.code === 'Space') {
        event.preventDefault()
        patch({ paused: !controls.current.paused })
      } else if (event.key === '[' || event.key === ']') {
        patch({ brush: Math.max(1, Math.min(MAX_BRUSH, controls.current.brush + (event.key === ']' ? 1 : -1))) })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (help && !dialog.current?.open) dialog.current?.showModal()
    if (!help && dialog.current?.open) dialog.current.close()
  }, [help])

  function setView(next: Camera) {
    interacted.current = true
    camera.current = next
    showCursor(null)
    setScale(next.zoom)
  }

  function changeZoom(ratio: number) {
    setView(zoomAt(world.current, camera.current, camera.current.zoom * ratio, { x: WIDTH / 2, y: HEIGHT / 2 }))
  }

  async function toggleFullscreen() {
    if (overlay) { setOverlay(false); return }
    if (document.fullscreenElement === chamber.current && document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    try {
      if (!chamber.current?.requestFullscreen) throw new Error()
      await chamber.current.requestFullscreen()
    } catch { setOverlay(true) }
  }

  function showCursor(point: Point | null) {
    hover.current = point
    const element = cursor.current
    if (!element) return
    element.hidden = !point
    if (point) {
      const view = camera.current
      element.style.left = `${(point.x + 0.5 - view.x) * view.zoom / WIDTH * 100}%`
      element.style.top = `${(point.y + 0.5 - view.y) * view.zoom / HEIGHT * 100}%`
    }
  }

  function screenPoint(clientX: number, clientY: number, element: HTMLCanvasElement): Point {
    const rect = element.getBoundingClientRect()
    return { x: (clientX - rect.left) / rect.width * WIDTH, y: (clientY - rect.top) / rect.height * HEIGHT }
  }

  function getPoint(event: PointerEvent<HTMLCanvasElement>, clamp = false): Point | null {
    const at = screenPoint(event.clientX, event.clientY, event.currentTarget)
    if (!clamp && (at.x < 0 || at.y < 0 || at.x >= WIDTH || at.y >= HEIGHT)) return null
    const view = camera.current
    const x = Math.floor(view.x + Math.max(0, Math.min(WIDTH - .001, at.x)) / view.zoom)
    const y = Math.floor(view.y + Math.max(0, Math.min(HEIGHT - .001, at.y)) / view.zoom)
    return { x, y }
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current || pan.current || (event.button !== 0 && event.button !== 1 && event.button !== 2)) return
    event.preventDefault()
    interacted.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.button === 1 || (event.button === 0 && panning)) {
      pan.current = { pointerId: event.pointerId, start: screenPoint(event.clientX, event.clientY, event.currentTarget), view: camera.current }
      showCursor(null)
      return
    }
    const point = getPoint(event, true)!
    const button = event.ctrlKey ? 2 : event.button
    stroke.current = { pointerId: event.pointerId, button, point }
    world.current.stamp(point, controls.current.brush, button === 2 ? M.Empty : controls.current.material as Material)
    showCursor(point)
  }

  function moveStroke(event: PointerEvent<HTMLCanvasElement>) {
    const drag = pan.current
    if (drag?.pointerId === event.pointerId) {
      const now = screenPoint(event.clientX, event.clientY, event.currentTarget)
      setView(clampCamera(world.current, {
        x: drag.view.x + (drag.start.x - now.x) / drag.view.zoom,
        y: drag.view.y + (drag.start.y - now.y) / drag.view.zoom,
        zoom: drag.view.zoom,
      }))
      return
    }
    const point = getPoint(event)
    showCursor(panning ? null : point)
    const active = stroke.current
    if (!active || active.pointerId !== event.pointerId) return
    const end = point ?? (active.point ? getPoint(event, true) : null)
    const state = controls.current
    if (end) world.current.stroke(active.point ?? end, end, state.brush, active.button === 2 ? M.Empty : state.material as Material)
    active.point = point
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.pointerId === event.pointerId) stroke.current = null
    if (pan.current?.pointerId === event.pointerId) pan.current = null
    if (event.pointerType !== 'mouse') showCursor(null)
  }

  function canvasKeys(event: KeyboardEvent<HTMLCanvasElement>) {
    const view = camera.current
    const point = hover.current ?? { x: Math.floor(view.x + WIDTH / 2 / view.zoom), y: Math.floor(view.y + HEIGHT / 2 / view.zoom) }
    const step = event.shiftKey ? 1 : Math.max(4, Math.round(4 / view.zoom))
    switch (event.key) {
      case 'ArrowLeft': point.x = Math.max(Math.ceil(view.x), point.x - step); break
      case 'ArrowRight': point.x = Math.min(Math.floor(view.x + (WIDTH - 1) / view.zoom), point.x + step); break
      case 'ArrowUp': point.y = Math.max(Math.ceil(view.y), point.y - step); break
      case 'ArrowDown': point.y = Math.min(Math.floor(view.y + (HEIGHT - 1) / view.zoom), point.y + step); break
      case 'Enter': interacted.current = true; world.current.stamp(point, settings.brush, settings.material as Material); break
      case ' ': if (!event.repeat) patch({ paused: !controls.current.paused }); break
      default: return
    }
    if (panning && event.key.startsWith('Arrow')) {
      setView(clampCamera(world.current, { x: view.x + (event.key === 'ArrowLeft' ? -step * 4 : event.key === 'ArrowRight' ? step * 4 : 0),
        y: view.y + (event.key === 'ArrowUp' ? -step * 4 : event.key === 'ArrowDown' ? step * 4 : 0), zoom: view.zoom }))
    } else showCursor(point)
    event.preventDefault()
  }

  const selection = MATERIALS.find(material => material.id === settings.material)
  const cursorSize = (settings.brush * 2 + 1) * scale
  const sceneName = WORLDS.find(entry => entry.id === scene.id)?.name ?? (scene.id === 'empty' ? 'Blank World' : 'Classic Chamber')
  const expanded = fullscreen || overlay

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="identity">
            <div className="brandmark" aria-hidden="true"><Layers3 size={19} strokeWidth={2.4} /></div>
            <strong>PLAYGROUND</strong>
          </div>
          <div className="session-control" aria-label="Session controls">
            <button onClick={save}><Save size={15} />Save</button>
            <button onClick={load}><FolderOpen size={15} />Load</button>
            <span className="divider" aria-hidden="true" />
            <button onClick={download}><Download size={15} />Export</button>
            <button onClick={() => filePicker.current?.click()}><Upload size={15} />Import</button>
            <input ref={filePicker} hidden type="file" accept=".json,application/json" onChange={importFile} />
          </div>
        </div>
      </header>

      <main className="workspace">
        <div className="title-row">
          <div>
            <h1>Powder Lab<span>.</span></h1>
            <p>Build, break, and remix worlds with music.</p>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={16} /> How to play</button>
        </div>

        <div className="lab">
          <section className={overlay ? "chamber expanded" : "chamber"} ref={chamber} aria-label="Simulation and drawing tools">
            <div className="stage-shell">
              <div className="stage-head">
                <div className="stage-title">
                  <span className={settings.paused ? 'light paused' : 'light'} title={settings.paused ? 'Paused' : 'Running'} />
                  <strong>{sceneName}</strong><span className="divider" /><span className="resolution">{scene.width} × {scene.height}</span>
                </div>
                <div className="stage-actions">
                  <button className="world-button" onClick={() => setLibrary(true)} title="Open World Library"><Layers3 size={15} /><span>Worlds</span></button>
                  <button className="reset-world" onClick={() => loadWorld(scene.id, scene.width, scene.height)} aria-label="Reset world" title="Reset world"><RotateCcw size={15} /></button>
                  <button className="play-button" onClick={() => patch({ paused: !settings.paused })}>
                    {settings.paused ? <Play size={15} /> : <Pause size={15} />}{settings.paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
              <div className="viewport">
                <canvas ref={canvas} width={WIDTH} height={HEIGHT} className={panning ? "simulation pan-mode" : "simulation"} tabIndex={0}
                  aria-label="Falling-sand chamber. Use arrow keys to move the brush, Enter to paint, and Space to pause."
                  onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke}
                  onPointerCancel={endStroke} onLostPointerCapture={endStroke}
                  onPointerLeave={() => showCursor(null)} onBlur={() => showCursor(null)}
                  onContextMenu={event => event.preventDefault()} onKeyDown={canvasKeys} />
                <canvas ref={halo} width={WIDTH} height={HEIGHT} className="halo" hidden={!settings.glow} aria-hidden="true" />
                <div ref={cursor} className="brush-cursor" style={{ width: `${cursorSize / WIDTH * 100}%`, height: `${cursorSize / HEIGHT * 100}%` }} hidden aria-hidden="true" />
                {canvasError && <div className="canvas-error" role="alert">{canvasError}</div>}
              </div>
              <div className="stage-foot">
                <span className="particle-count"><i />{stats.count.toLocaleString()} particles<span className="regions-count" title="Active simulation regions">{stats.regions} active regions</span></span>
                <div className="camera-controls" role="group" aria-label="Camera controls">
                  <button aria-label="Pan tool" aria-pressed={panning} title="Pan tool" onClick={() => { setPanning(!panning); showCursor(null) }}><Hand size={15} /></button>
                  <button aria-label="Zoom out" title="Zoom out" disabled={scale <= WIDTH / scene.width} onClick={() => changeZoom(1 / Math.SQRT2)}><ZoomOut size={15} /></button>
                  <button className="fit-camera" aria-label="Fit world" title="Fit world" onClick={() => setView(fitCamera(world.current))}>{Math.round(scale * 100)}%</button>
                  <button aria-label="Zoom in" title="Zoom in" disabled={scale >= 4} onClick={() => changeZoom(Math.SQRT2)}><ZoomIn size={15} /></button>
                  <button aria-label={expanded ? 'Exit fullscreen' : 'Fullscreen'} title={expanded ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => { void toggleFullscreen() }}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
                </div>
                <div className="view-controls" aria-label="Visual effects">
                  <button aria-pressed={settings.grid} onClick={() => patch({ grid: !settings.grid })}><Grid2X2 size={14} />Grid</button>
                  <button aria-pressed={settings.fx} onClick={() => patch({ fx: !settings.fx })}><Activity size={15} />FX</button>
                  <button aria-pressed={settings.glow} onClick={() => patch({ glow: !settings.glow })}><Sparkles size={14} />Glow</button>
                </div>
              </div>
            </div>

            <div className="toolbox">
              <div className="toolbox-heading">
                <h2>Materials</h2>
                <label className="brush-size">
                  <span>Brush radius</span>
                  <input type="range" min={1} max={MAX_BRUSH} value={settings.brush}
                    style={rangeStyle((settings.brush - 1) / (MAX_BRUSH - 1) * 100)}
                    onChange={event => patch({ brush: event.target.valueAsNumber })} />
                  <output>{settings.brush} px</output>
                </label>
              </div>
              <div className="palette" aria-label="Drawing materials">
                {MATERIALS.map((material, index) => (
                  <button key={material.id} className="material" aria-pressed={settings.material === material.id}
                    style={{ '--swatch': material.color } as CSSProperties}
                    onClick={() => patch({ material: material.id })} title={`${material.behavior} [${index + 1}]`}>
                    <span className="swatch" aria-hidden="true" />{material.name}<kbd>{index + 1}</kbd>
                  </button>
                ))}
                <button className="material eraser" aria-pressed={settings.material === M.Empty}
                  onClick={() => patch({ material: M.Empty })} title="Erase [E]"><Eraser size={15} />Erase<kbd>E</kbd></button>
              </div>
              <div className="material-note">{selection?.behavior ?? 'Removes particles and cuts through stone.'}</div>
            </div>
          </section>

          <aside className="beat-panel" aria-labelledby="beat-title">
            <div className="beat-heading">
              <div className="beat-mark"><AudioLines size={19} strokeWidth={1.9} /></div>
              <div>
                <h2 id="beat-title">Beat engine</h2>
                <span className="signal-label">{SOURCE_LABEL[source.mode]}</span>
              </div>
              <button className="switch master" type="button" role="switch" aria-label="Music reactions" aria-checked={settings.enabled} onClick={toggleReactions}><span /></button>
            </div>

            <AudioSource input={audio} state={source} simulator={
              <div className="tempo">
                <div className="tempo-top">
                  <div className="tempo-value"><strong>{settings.bpm}</strong><span>BPM</span></div>
                  <div className="tempo-buttons">
                    <button aria-label="Decrease BPM" onClick={() => changeBpm(settings.bpm - 1)} disabled={settings.bpm <= MIN_BPM}><Minus size={15} /></button>
                    <button aria-label="Increase BPM" onClick={() => changeBpm(settings.bpm + 1)} disabled={settings.bpm >= MAX_BPM}><Plus size={15} /></button>
                  </div>
                </div>
                <input aria-label="Tempo (BPM)" type="range" min={MIN_BPM} max={MAX_BPM} value={settings.bpm}
                  style={rangeStyle((settings.bpm - MIN_BPM) / (MAX_BPM - MIN_BPM) * 100)}
                  onChange={event => changeBpm(event.target.valueAsNumber)} />
                <div className="beat-steps" aria-hidden="true">
                  {[0, 1, 2, 3].map(n => <span key={n} className={settings.enabled && stats.beat > 0 && (stats.beat - 1) % 4 === n ? 'hit' : ''} />)}
                </div>
              </div>
            } />

            <div className="reactions">
              <h3>Music reactions</h3>
              <label className="world-intensity" htmlFor="world-intensity">
                <span>World intensity<output>{settings.intensity}%</output></span>
                <input id="world-intensity" aria-label="World intensity" type="range" min={0} max={160} value={settings.intensity}
                  style={rangeStyle(settings.intensity / 1.6)}
                  onChange={event => patch({ intensity: event.target.valueAsNumber })} />
              </label>
              {bands.map(band => {
                const { name, effect, color, Icon } = BAND_LABELS[band]
                const value = settings.bands[band]
                return (
                  <div className="reaction" key={band} style={{ '--band': color } as CSSProperties}>
                    <div className="reaction-top">
                      <span className="reaction-icon"><Icon size={16} /></span>
                      <div className="reaction-name"><strong>{name}</strong><small>{effect}</small></div>
                      <button className="switch" type="button" role="switch" aria-label={name + ' reaction'} aria-checked={value.enabled}
                        onClick={() => patchBand(band, { enabled: !value.enabled })}><span /></button>
                    </div>
                    <div className="sensitivity">
                      <input type="range" min={0} max={100} value={value.sensitivity} aria-label={name + ' sensitivity'}
                        style={rangeStyle(value.sensitivity, color)} onChange={event => patchBand(band, { sensitivity: event.target.valueAsNumber })} />
                      <output>{value.sensitivity}%</output>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="audio-note">
              <AudioLines size={15} />
              <span>{source.mode === 'simulator'
                ? 'The BPM clock generates silent, simulated beats.'
                : (source.mode === 'system' || source.mode === 'tab') ? 'Only audio is analyzed locally. Shared video is unused.' : 'Audio stays in your browser.'}</span>
            </div>
            <button className="test-kick" onClick={() => { interacted.current = true; world.current.shock(1) }} title="Send a bass pulse through the chamber"><Waves size={15} />Test kick</button>
          </aside>
        </div>
      </main>

      {library && <WorldLibrary initial={scene.id} currentWidth={scene.width} onSelect={loadWorld} onClose={() => setLibrary(false)} />}
      <div className={notice.error ? 'toast error' : 'toast'} role="status" hidden={!notice.text}>{notice.text}</div>
      <dialog ref={dialog} onClose={() => setHelp(false)}>
        <h2>How to play</h2>
        <p>Choose a material, then click or drag in the chamber. Hold to keep pouring. Right-click, Control-click, or select Erase to remove particles.</p>
        <p>Build a stone basin and pour in water. Add oil on top, then ignite it with fire or electricity. Water cools lava into stone.</p>
        <p>Use <kbd>1</kbd>–<kbd>8</kbd> to select materials, <kbd>E</kbd> to erase, <kbd>[</kbd> and <kbd>]</kbd> to resize, and <kbd>Space</kbd> to pause. With the chamber focused, use the arrow keys to move and <kbd>Enter</kbd> to paint.</p>
        <p>Open Worlds to pick a scene and size. Scroll or use the zoom buttons. Turn on Pan and drag to look around. Use System or Tab to share playback, File to play a track, or BPM for a silent beat.</p>
        <p>Save and Load use a local checkpoint. Export creates a portable JSON file you can reopen with Import.</p>
        <form method="dialog"><button className="play-button" autoFocus>Done</button></form>
      </dialog>
    </div>
  )
}
