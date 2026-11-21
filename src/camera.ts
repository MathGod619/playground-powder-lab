import { HEIGHT, WIDTH, type Point, type Sandbox } from './engine.ts'

export type Camera = Point & { zoom: number }
export const fitZoom = (world: Sandbox) => WIDTH / world.width

export function clampCamera(world: Sandbox, { x, y, zoom }: Camera): Camera {
  const scale = Math.min(4, Math.max(fitZoom(world), zoom))
  return {
    x: Math.max(0, Math.min(world.width - WIDTH / scale, x)),
    y: Math.max(0, Math.min(world.height - HEIGHT / scale, y)),
    zoom: scale,
  }
}

export const fitCamera = (world: Sandbox): Camera => ({ x: 0, y: 0, zoom: fitZoom(world) })

export function zoomAt(world: Sandbox, camera: Camera, zoom: number, center: Point): Camera {
  const scale = clampCamera(world, { ...camera, zoom }).zoom
  return clampCamera(world, {
    x: camera.x + center.x / camera.zoom - center.x / scale,
    y: camera.y + center.y / camera.zoom - center.y / scale,
    zoom: scale,
  })
}
