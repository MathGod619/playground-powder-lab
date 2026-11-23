import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { removeBackground, type Pixels } from './image.ts'
import { buildImageScene, demoImage, fitPresetPhoto, IMAGE_PRESETS, imageRegion, resizePixels, type ImagePreset } from './image-presets.ts'
import { M } from './materials.ts'
import type { World } from './world.ts'

type Props = {
  image: ImageBitmap | null
  width: number; height: number
  initialPreset: ImagePreset
  canReset: boolean; canUndo: boolean
  onChoose: () => void
  onCreate: (preset: ImagePreset, pixels: Pixels) => void
  onStamp: (pixels: Pixels) => void
  onReset: () => void; onUndo: () => void; onClose: () => void
}

function photoFor(image: ImageBitmap | Pixels, preset: ImagePreset, width: number, height: number, cut: boolean): Pixels {
  const region = imageRegion(preset, width, height)
  const size = fitPresetPhoto(image.width, image.height, region.maxWidth, region.maxHeight)
  let pixels: Pixels
  if ('data' in image) pixels = resizePixels(image, size.width, size.height)
  else {
    const canvas = document.createElement('canvas')
    canvas.width = size.width; canvas.height = size.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0, size.width, size.height)
    pixels = ctx.getImageData(0, 0, size.width, size.height)
  }
  return cut ? removeBackground(pixels) : pixels
}

function paintPreview(canvas: HTMLCanvasElement, world: World) {
  if (canvas.width !== world.width) canvas.width = world.width
  if (canvas.height !== world.height) canvas.height = world.height
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(world.width, world.height), colors = new Uint32Array(pixels.data.buffer)
  for (let i = 0; i < world.size; i++) colors[i] = world.type[i] === M.Empty ? 0xff100e0b : world.color[i]
  for (let k = 0; k < world.particles; k++) {
    const x = Math.floor(world.px[k]), y = Math.floor(world.py[k])
    if (x >= 0 && x < world.width && y >= 0 && y < world.height) colors[y * world.width + x] = world.pColor[k]
  }
  ctx.putImageData(pixels, 0, 0)
}

export function ImageLab(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const animation = useRef(0)
  const [preset, setPreset] = useState(props.initialPreset)
  const [demo, setDemo] = useState(false), [cut, setCut] = useState(false), [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const demoPixels = useMemo(demoImage, [])
  const source = demo ? demoPixels : props.image
  const info = IMAGE_PRESETS.find(p => p.id === preset)!
  const previewScale = Math.min(1, 320 / props.width, 240 / props.height)
  const width = Math.max(48, Math.round(props.width * previewScale)), height = Math.max(40, Math.round(props.height * previewScale))

  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    node.querySelector<HTMLButtonElement>('[data-close]')?.focus()
    return () => { node.close(); cancelAnimationFrame(animation.current) }
  }, [])

  const prepare = () => buildImageScene(width, height, preset,
    photoFor(source ?? demoPixels, preset, width, height, source ? cut : false))

  useEffect(() => {
    cancelAnimationFrame(animation.current); setPlaying(false); setError('')
    try {
      const world = prepare()
      // Show the container before a photo is selected, with no placeholder grains.
      if (!source) for (const i of world.imageEffect!.cells) world.type[i] = M.Empty
      paintPreview(canvas.current!, world)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not prepare the image.') }
    return () => cancelAnimationFrame(animation.current)
  }, [source, preset, cut, width, height])

  function preview() {
    if (!source) return
    try {
      cancelAnimationFrame(animation.current)
      const world = prepare()
      world.drop()
      setPlaying(true); setError('')
      let ticks = 0, last = -Infinity
      const frame = (now: number) => {
        if (now - last >= 32) {
          last = now
          for (let k = 0; k < 2; k++) {
            if (ticks % 30 === 0) world.onKick(.7)
            world.step(); world.decay(); ticks++
          }
          paintPreview(canvas.current!, world)
        }
        if (ticks < 360) animation.current = requestAnimationFrame(frame)
        else setPlaying(false)
      }
      animation.current = requestAnimationFrame(frame)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not preview this image.') }
  }

  function usePhoto(stamp = false) {
    if (!source) return
    try {
      const pixels = photoFor(source, preset, props.width, props.height, cut)
      if (!pixels.data.some((v, i) => i % 4 === 3 && v >= 128)) throw new Error('No visible image remains. Turn off Cut background.')
      if (stamp) props.onStamp(pixels)
      else props.onCreate(preset, pixels)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not use this image.') }
  }

  return <dialog ref={dialog} className="image-lab" aria-labelledby="image-lab-title" onCancel={event => { event.preventDefault(); props.onClose() }}>
    <header className="image-lab-heading">
      <h2 id="image-lab-title">Image Lab<span>///</span></h2>
      <button data-close className="tool" aria-label="Close Image Lab" onClick={props.onClose}>×</button>
    </header>
    <div className="image-lab-body">
      <div className="image-lab-presets" role="group" aria-label="Image presets">
        {IMAGE_PRESETS.map(item => <button key={item.id} className={`image-preset ${preset === item.id ? 'selected' : ''}`} aria-pressed={preset === item.id} onClick={() => setPreset(item.id)}>
          {item.name}
        </button>)}
      </div>
      <p className="image-lab-description">{info.detail}</p>
      <div className="image-lab-preview"><canvas ref={canvas} role="img" aria-label={`${info.name} scene preview`} />
        {!source ? <div className="image-lab-empty">
          <b>Your picture, in motion.</b>
          <button className="chip on" onClick={props.onChoose}>Choose image</button>
          <button className="lab-text-button" onClick={() => setDemo(true)}>Try demo artwork</button>
        </div> : <>
          <div className="image-lab-source"><button onClick={() => { setDemo(false); props.onChoose() }}>Change image</button></div>
          <button className="lab-preview-play" onClick={preview} aria-label={playing ? 'Restart preview' : 'Preview effect'}>
            <span aria-hidden="true">▶</span> {playing ? 'Replay' : 'Preview'}
          </button>
        </>}
      </div>
      <details className="image-lab-options"><summary>More options</summary>
        <div className="image-lab-options-body">
          <label><input type="checkbox" checked={cut} disabled={!source} onChange={event => setCut(event.target.checked)} /> Remove background</label>
          <button className="lab-text-button" disabled={!source} onClick={() => usePhoto(true)}>Stamp into my current world</button>
          {props.canReset && <button className="lab-text-button" onClick={props.onReset}>Reset current image scene</button>}
          {props.canUndo && <button className="lab-text-button" onClick={props.onUndo}>Restore previous world</button>}
          {source && <button className="lab-text-button" onClick={() => setDemo(true)}>Use demo artwork</button>}
          <p>Images stay on this device. Online rooms share the resulting world.</p>
        </div>
      </details>
      {error && <p className="image-lab-error" role="alert">{error}</p>}
    </div>
    <footer className="image-lab-footer">
      <span>Build it. Then hit <b>DROP.</b></span>
      <button className="lab-build" disabled={!source} onClick={() => usePhoto()}>Build scene <span aria-hidden="true">↗</span></button>
    </footer>
  </dialog>
}
