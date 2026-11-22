export const CONTROL = {
  paint: 1 << 0,
  erase: 1 << 1,
  drop: 1 << 2,
  fullScreen: 1 << 3,
  previousTool: 1 << 4,
  nextTool: 1 << 5,
  pause: 1 << 6,
  grow: 1 << 7,
  shrink: 1 << 8,
} as const

const DEAD_ZONE = .2

/** Reads the browser's standard Xbox/PlayStation-style layout. */
export class Controller {
  private index = -1
  private previous = 0
  private suppressed = 0
  private unavailable = false

  suspend() { this.index = -1 }

  read(blocked: boolean) {
    if (this.unavailable || !navigator.getGamepads) return null
    let pads: ReturnType<Navigator['getGamepads']>
    try {
      pads = navigator.getGamepads()
    } catch {
      this.unavailable = true
      return null
    }
    const standard = (pad: Gamepad | null | undefined): pad is Gamepad =>
      !!pad?.connected && pad.mapping === 'standard'
    const current = pads[this.index]
    const pad = standard(current) ? current : pads.find(standard)
    if (!pad) { this.suspend(); return null }

    const down = (index: number) => pad.buttons[index]?.pressed
    let buttons = 0
    if (down(0) || down(7)) buttons |= CONTROL.paint
    if (down(1) || down(6)) buttons |= CONTROL.erase
    if (down(2)) buttons |= CONTROL.drop
    if (down(3)) buttons |= CONTROL.fullScreen
    if (down(4)) buttons |= CONTROL.previousTool
    if (down(5)) buttons |= CONTROL.nextTool
    if (down(9)) buttons |= CONTROL.pause
    if (down(12)) buttons |= CONTROL.grow
    if (down(13)) buttons |= CONTROL.shrink

    // A wake-up press or a button held through a dialog must be released before it can act.
    if (this.index !== pad.index || blocked) {
      this.suppressed = buttons
      this.previous = 0
      this.index = pad.index
    }
    this.suppressed &= buttons
    const held = buttons & ~this.suppressed
    const pressed = held & ~this.previous
    this.previous = held

    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0
    const length = Math.hypot(x, y)
    const scale = blocked || length <= DEAD_ZONE ? 0 : (Math.min(length, 1) - DEAD_ZONE) / ((1 - DEAD_ZONE) * length)
    return { held, pressed, x: x * scale, y: y * scale }
  }
}
