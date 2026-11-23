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
  const source = props.image ?? (demo ? demoPixels : null)
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
    <div className="image-lab-heading"><div><span className="eyebrow">PICTURES INTO PARTICLES</span><h2 id="image-lab-title">Image Lab<span>///</span></h2></div>
      <button data-close className="tool" aria-label="Close Image Lab" onClick={props.onClose}>×</button></div>
    <div className="image-lab-body">
      <div className="image-lab-preview-column">
        <div className="image-lab-source"><button className="chip on" onClick={props.onChoose}>{props.image ? 'Change image' : 'Choose image'}</button>
          <button className={`chip ${demo && !props.image ? 'on' : ''}`} onClick={() => setDemo(true)} disabled={!!props.image}>Try demo artwork</button>
          <label><input type="checkbox" checked={cut} disabled={!source} onChange={event => setCut(event.target.checked)} /> Cut background</label></div>
        <div className="image-lab-preview"><canvas ref={canvas} role="img" aria-label={`${info.name} scene preview`} />
          {!source && <div className="image-lab-empty"><b>Your picture.<br />A new kind of drop.</b><span>Pick a photo, cover art, or a logo.</span></div>}
          <span className="preview-label">{playing ? 'LIVE PHYSICS PREVIEW' : source ? 'READY FOR THE DROP' : 'PRESET PREVIEW'}</span>
        </div>

        <p className="image-lab-copy">Your image keeps its colors. Each pixel becomes a real grain you can remix with sand, speakers, and the beat.</p>
        {(props.canReset || props.canUndo) && <div className="image-lab-history">
          {props.canReset && <button className="chip" onClick={props.onReset}>Reset current image scene</button>}
          {props.canUndo && <button className="chip" onClick={props.onUndo}>Restore previous world</button>}
        </div>}
      </div>
      <div className="image-lab-presets" role="group" aria-label="Image presets">
        <span className="eyebrow">CHOOSE YOUR SETUP</span>
        {IMAGE_PRESETS.map(item => <button key={item.id} className={`image-preset ${preset === item.id ? 'selected' : ''}`} aria-pressed={preset === item.id} onClick={() => setPreset(item.id)}>
          <span className={`preset-mark ${item.id}`} aria-hidden="true"><i /><i /><i /></span>
          <span><small>{item.tag}</small><strong>{item.name}</strong><span>{item.detail}</span></span>
        </button>)}
      </div>
    </div>
    {error && <p className="image-lab-error" role="alert">{error}</p>}
    <div className="image-lab-footer"><div><b>{info.name}</b><span>Build a fresh scene, then press DROP. Your previous world can be restored.</span></div>
      <button className="chip" disabled={!source} onClick={preview}>{playing ? 'Restart preview' : 'Preview effect'}</button>
      <button className="lab-build" disabled={!source} onClick={() => usePhoto()}>Build scene</button></div>
    <div className="image-lab-advanced"><button disabled={!source} onClick={() => usePhoto(true)}>Or stamp the image into my current world</button><span>Processed on this device. Online rooms share the resulting world.</span></div>
  </dialog>
}
