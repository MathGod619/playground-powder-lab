import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import {
  Activity, AudioLines, CircleHelp, Download, Eraser, FlaskConical, FolderOpen, Grid2X2,
  Layers3, Minus, Pause, Play, Plus, RotateCcw, Save, Sparkles, Upload, Waves, Wind, Zap,
} from 'lucide-react'
import { advanceBeat, applyAudioHits, bands, defaultSettings, MAX_BPM, MIN_BPM, newClock, type Band, type Settings } from './beat.ts'
import { AudioInput } from './audio.ts'
import { AudioSource, SOURCE_LABEL } from './AudioSource.tsx'
import { makeDemo } from './demo.ts'
import { HEIGHT, HZ, Sandbox, WIDTH, type Point } from './engine.ts'
import { Material as M, MATERIALS, type Material } from './materials.ts'
import { createRenderer } from './render.ts'
import { decodeSession, encodeSession, LOCAL_KEY, MAX_BRUSH, MAX_FILE_BYTES } from './session.ts'

const DRAFT_KEY = LOCAL_KEY + '-draft'
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
  const world = new Sandbox()
  makeDemo(world)
  return { world, clock: newClock(), settings: defaultSettings }
}

function startup() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) return decodeSession(draft)
  } catch {
    // A previous draft should never prevent the lab from opening.
  }
  return freshStart()
}

type Stroke = { pointerId: number; button: number; point: Point | null }

export function App() {
  const [initial] = useState(startup)
  const [audio] = useState(() => new AudioInput())
  const source = useSyncExternalStore(audio.subscribe, audio.snapshot)
  const [settings, setSettings] = useState(initial.settings)
  const controls = useRef(settings)
  const world = useRef(initial.world)
  const clock = useRef(initial.clock)
  const [stats, setStats] = useState({ count: world.current.occupied, beat: clock.current.beat })
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
    world.current = data.world
    clock.current = data.clock
    change(data.settings)
    setStats({ count: data.world.occupied, beat: data.clock.beat })
  }

  function reset(demo: boolean) {
    importId.current++
    const next = new Sandbox()
    if (demo) makeDemo(next)
    restore({ world: next, clock: newClock(), settings: controls.current })
    show(demo ? 'Demo chamber loaded.' : 'Chamber reset.')
  }

  function save() {
    try {
      localStorage.setItem(LOCAL_KEY, encodeSession(world.current, clock.current, controls.current))
      show('Checkpoint saved in this browser.')
    } catch {
      show('Could not save in this browser. Use Export to keep a copy.', true)
    }
  }

  function load() {
    try {
      const saved = localStorage.getItem(LOCAL_KEY)
      if (!saved) {
        show('No checkpoint yet. Use Save to create one.', true)
        return
      }
      const data = decodeSession(saved)
      importId.current++
      restore(data)
      show('Checkpoint loaded.')
    } catch (error) {
      show(describeError(error), true)
    }
  }

  function download() {
    const contents = encodeSession(world.current, clock.current, controls.current)
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
        accumulated += elapsed
        for (let step = 0; accumulated >= STEP_MS && step < 4; step++) {
          accumulated -= STEP_MS
          const painting = stroke.current
          if (painting?.point) {
            active.stamp(painting.point, state.brush, painting.button === 2 ? M.Empty : state.material as Material)
          }
          if (activeSource.mode === 'simulator') advanceBeat(clock.current, state, active)
          active.step()
        }
      }
      render(active, state)
      if (now - lastStats >= 250 || clock.current.beat !== lastBeat) {
        lastStats = now
        lastBeat = clock.current.beat
        setStats(old => old.count === active.occupied && old.beat === lastBeat
          ? old : { count: active.occupied, beat: lastBeat })
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
    let lastSaved = ''
    const saveDraft = () => {
      try {
        const data = encodeSession(world.current, clock.current, controls.current)
        if (data !== lastSaved) {
          localStorage.setItem(DRAFT_KEY, data)
          lastSaved = data
        }
      } catch {
        // Manual Save reports storage errors. Export remains available.
      }
    }
    const persistWhenHidden = () => { if (document.hidden) saveDraft() }
    const interval = window.setInterval(saveDraft, 12000)
    window.addEventListener('pagehide', saveDraft)
    document.addEventListener('visibilitychange', persistWhenHidden)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pagehide', saveDraft)
      document.removeEventListener('visibilitychange', persistWhenHidden)
    }
  }, [])

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

  function showCursor(point: Point | null) {
    hover.current = point
    const element = cursor.current
    if (!element) return
    element.hidden = !point
    if (point) {
      element.style.left = `${(point.x + 0.5) / WIDTH * 100}%`
      element.style.top = `${(point.y + 0.5) / HEIGHT * 100}%`
    }
  }

  function getPoint(event: PointerEvent<HTMLCanvasElement>, clamp = false): Point | null {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.floor((event.clientX - rect.left) / rect.width * WIDTH)
    const y = Math.floor((event.clientY - rect.top) / rect.height * HEIGHT)
    if (!clamp && (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT)) return null
    return { x: Math.max(0, Math.min(WIDTH - 1, x)), y: Math.max(0, Math.min(HEIGHT - 1, y)) }
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current || (event.button !== 0 && event.button !== 2)) return
    event.preventDefault()
    const point = getPoint(event, true)!
    event.currentTarget.setPointerCapture(event.pointerId)
    const button = event.ctrlKey ? 2 : event.button
    stroke.current = { pointerId: event.pointerId, button, point }
    world.current.stamp(point, controls.current.brush, button === 2 ? M.Empty : controls.current.material as Material)
    showCursor(point)
  }

  function moveStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event)
    showCursor(point)
    const active = stroke.current
    if (!active || active.pointerId !== event.pointerId) return
    // Mouse capture can continue outside the world. Draw to the edge once, then stop pouring.
    const end = point ?? (active.point ? getPoint(event, true) : null)
    const state = controls.current
    if (end) world.current.stroke(active.point ?? end, end, state.brush, active.button === 2 ? M.Empty : state.material as Material)
    active.point = point
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.pointerId === event.pointerId) stroke.current = null
    if (event.pointerType !== 'mouse') showCursor(null)
  }

  function canvasKeys(event: KeyboardEvent<HTMLCanvasElement>) {
    const point = hover.current ?? { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2) }
    const step = event.shiftKey ? 1 : 4
    switch (event.key) {
      case 'ArrowLeft': point.x = Math.max(0, point.x - step); break
      case 'ArrowRight': point.x = Math.min(WIDTH - 1, point.x + step); break
      case 'ArrowUp': point.y = Math.max(0, point.y - step); break
      case 'ArrowDown': point.y = Math.min(HEIGHT - 1, point.y + step); break
      case 'Enter': world.current.stamp(point, settings.brush, settings.material as Material); break
      case ' ': if (!event.repeat) patch({ paused: !controls.current.paused }); break
      default: return
    }
    event.preventDefault()
    showCursor(point)
  }

  const selection = MATERIALS.find(material => material.id === settings.material)
  const cursorSize = (settings.brush * 2 + 1) / WIDTH * 100

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
            <p>Paint with particles and make them move to music.</p>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={16} /> How to play</button>
        </div>

        <div className="lab">
          <section className="chamber" aria-label="Simulation and drawing tools">
            <div className="stage-shell">
              <div className="stage-head">
                <div className="stage-title"><span className={settings.paused ? 'light paused' : 'light'} />{settings.paused ? 'Paused' : 'Running'}<span className="divider" /><span className="resolution">{WIDTH} × {HEIGHT}</span></div>
                <div className="stage-actions">
                  <button onClick={() => reset(true)} title="Replace the chamber with the demo"><FlaskConical size={15} />Demo</button>
                  <button onClick={() => reset(false)} title="Clear all particles"><RotateCcw size={15} />Reset</button>
                  <button className="play-button" onClick={() => patch({ paused: !settings.paused })}>
                    {settings.paused ? <Play size={15} /> : <Pause size={15} />}{settings.paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
              <div className="viewport">
                <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="simulation" tabIndex={0}
                  aria-label="Falling-sand chamber. Use arrow keys to move the brush, Enter to paint, and Space to pause."
                  onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke}
                  onPointerCancel={endStroke} onLostPointerCapture={endStroke}
                  onPointerLeave={() => showCursor(null)} onBlur={() => showCursor(null)}
                  onContextMenu={event => event.preventDefault()} onKeyDown={canvasKeys} />
                <canvas ref={halo} width={WIDTH} height={HEIGHT} className="halo" hidden={!settings.glow} aria-hidden="true" />
                <div ref={cursor} className="brush-cursor" style={{ width: `${cursorSize}%`, height: `${(settings.brush * 2 + 1) / HEIGHT * 100}%` }} hidden aria-hidden="true" />
                {canvasError && <div className="canvas-error" role="alert">{canvasError}</div>}
              </div>
              <div className="stage-foot">
                <span className="particle-count"><i />{stats.count.toLocaleString()} particles</span>
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
                : source.mode === 'share' ? 'Only audio is analyzed locally. Shared video is unused.' : 'Audio stays in your browser.'}</span>
            </div>
            <button className="test-kick" onClick={() => world.current.shock(1)} title="Send a bass pulse through the chamber"><Waves size={15} />Test kick</button>
          </aside>
        </div>
      </main>

      <div className={notice.error ? 'toast error' : 'toast'} role="status" hidden={!notice.text}>{notice.text}</div>
      <dialog ref={dialog} onClose={() => setHelp(false)}>
        <h2>How to play</h2>
        <p>Choose a material, then click or drag in the chamber. Hold to keep pouring. Right-click, Control-click, or select Erase to remove particles.</p>
        <p>Build a stone basin and pour in water. Add oil on top, then ignite it with fire or electricity. Water cools lava into stone.</p>
        <p>Use <kbd>1</kbd>–<kbd>8</kbd> to select materials, <kbd>E</kbd> to erase, <kbd>[</kbd> and <kbd>]</kbd> to resize, and <kbd>Space</kbd> to pause. With the chamber focused, use the arrow keys to move and <kbd>Enter</kbd> to paint.</p>
        <p>Use BPM for a silent beat, File to play a track, or Mic or Share to connect a live source.</p>
        <p>Save and Load use a local checkpoint. Export creates a portable JSON file you can reopen with Import.</p>
        <form method="dialog"><button className="play-button" autoFocus>Done</button></form>
      </dialog>
    </div>
  )
}
