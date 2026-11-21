import { useEffect, useRef, useState } from 'react'
import { Check, Layers3, X } from 'lucide-react'
import { defaultSettings } from './beat.ts'
import { fitCamera } from './camera.ts'
import { Sandbox } from './engine.ts'
import { createRenderer } from './render.ts'
import { makeWorld, WORLDS, WORLD_SIZES, type WorldId } from './worlds.ts'

function Preview({ id }: { id: WorldId }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const halo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current || !halo.current) return
    const world = new Sandbox()
    makeWorld(world, id)
    if (id === 'volcano') { world.shock(.8); for (let i = 0; i < 12; i++) world.step() }
    if (id === 'city') world.sparks(.45)
    createRenderer(canvas.current, halo.current)(world, { ...defaultSettings, grid: false, fx: false }, fitCamera(world))
  }, [id])
  return <>
    <canvas ref={canvas} width={416} height={232} aria-hidden="true" />
    <canvas ref={halo} width={416} height={232} hidden aria-hidden="true" />
  </>
}

export function WorldLibrary({ initial, currentWidth, onSelect, onClose }: {
  initial: WorldId
  currentWidth: number
  onSelect: (id: WorldId, width: number, height: number) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<WorldId>(initial === 'classic' ? 'volcano' : initial)
  const [size, setSize] = useState(WORLD_SIZES.findIndex(s => s.width === currentWidth))
  useEffect(() => { dialog.current?.showModal() }, [])
  const chosen = WORLD_SIZES[size] ?? WORLD_SIZES[1]

  return (
    <dialog className="world-library" ref={dialog} onClose={onClose} aria-labelledby="library-title">
      <header className="library-title">
        <div><h2 id="library-title"><Layers3 size={20} />World Library</h2><p>Pick a world, then reshape it with your brush.</p></div>
        <form method="dialog"><button aria-label="Close World Library"><X size={20} /></button></form>
      </header>
      <div className="world-choices" role="group" aria-label="Playable worlds">
        {WORLDS.map(({ id, name, detail, color }) => (
          <button className="world-card" key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}>
            <Preview id={id} />
            <span className="world-card-body">
              <strong><i style={{ background: color }} />{name}{selected === id && <Check size={16} />}</strong>
              <span>{detail}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="library-controls">
        <button aria-pressed={selected === 'empty'} className="empty-world" onClick={() => setSelected('empty')}>Blank world</button>
        <label>World size
          <select value={size} onChange={event => setSize(Number(event.target.value))}>
            {WORLD_SIZES.map((size, index) => <option key={size.name} value={index}>{size.name} · {size.width} × {size.height}</option>)}
          </select>
        </label>
        <button className="play-button" onClick={() => onSelect(selected, chosen.width, chosen.height)}>Load world</button>
      </div>
      <p className="replace-note">Loading a world replaces the current chamber. Save it first to keep your edits.</p>
    </dialog>
  )
}
