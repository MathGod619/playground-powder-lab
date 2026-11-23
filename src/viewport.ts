/** All pointer, overlay and recording coordinates are local to the playfield. */
export function fitWorld(width: number, height: number, worldWidth: number, worldHeight: number) {
  const scale = Math.min(width / worldWidth, height / worldHeight)
  // Keep the ground at the bottom when a saved/wide world is opened on a tall screen.
  return { scale, x: (width - worldWidth * scale) / 2, y: height - worldHeight * scale }
}

export function localPoint(x: number, y: number, bounds: { left: number; top: number }) {
  return { sx: x - bounds.left, sy: y - bounds.top }
}
