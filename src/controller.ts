export const CONTROL = {
  paint: 1 << 0,
  erase: 1 << 1,
  drop: 1 << 2,
  menu: 1 << 3,
  previousTool: 1 << 4,
  nextTool: 1 << 5,
  pause: 1 << 6,
  grow: 1 << 7,
  shrink: 1 << 8,
  confirm: 1 << 9,
  back: 1 << 10,
  retry: 1 << 11,
} as const

const DEAD_ZONE = .2
type RumbleActuator = GamepadHapticActuator & { readonly effects?: readonly GamepadHapticEffectType[] }

function stick(x = 0, y = 0) {
  const length = Math.hypot(x, y)
  if (length <= DEAD_ZONE) return { x: 0, y: 0 }
  const scale = (Math.min(length, 1) - DEAD_ZONE) / ((1 - DEAD_ZONE) * length)
  return { x: x * scale, y: y * scale }
}

/** Reads the browser's standard Xbox/PlayStation-style layout. */
export class Controller {
  private index = -1
  private previous = 0
  private suppressed = 0
  private unavailable = false
  private resync = true
  private actuator: RumbleActuator | undefined

  get deviceIndex() { return this.index }

  suspend() {
    this.resync = true
    this.actuator = undefined
  }

  get canRumble() {
    return !!this.actuator?.playEffect && (this.actuator.effects?.includes('dual-rumble') ?? true)
  }

  async rumbleDrop() {
    if (!this.canRumble) return
    try {
      await this.actuator?.playEffect('dual-rumble', { duration: 240, strongMagnitude: .85, weakMagnitude: .5 })
    } catch { /* the controller disconnected or declined the effect */ }
  }

  read(blocked: boolean, wakeActions = 0, reservedIndex = -1) {
    if (this.unavailable || !navigator.getGamepads) return null
    let pads: ReturnType<Navigator['getGamepads']>
    try {
      pads = navigator.getGamepads()
    } catch {
      this.unavailable = true
      return null
    }
    const standard = (pad: Gamepad | null | undefined): pad is Gamepad =>
      !!pad?.connected && pad.mapping === 'standard' && pad.index !== reservedIndex
    const current = pads[this.index]
    const pad = standard(current) ? current : pads.find(standard)
    if (!pad) { this.index = -1; this.suspend(); return null }
    this.actuator = pad.vibrationActuator

    const down = (index: number) => pad.buttons[index]?.pressed
    let buttons = 0
    if (down(0)) buttons |= CONTROL.confirm
    if (down(1)) buttons |= CONTROL.back
    if (down(0) || down(7)) buttons |= CONTROL.paint
    if (down(1) || down(6)) buttons |= CONTROL.erase
    if (down(2)) buttons |= CONTROL.drop
    if (down(3)) buttons |= CONTROL.menu
    if (down(4)) buttons |= CONTROL.previousTool
    if (down(5)) buttons |= CONTROL.nextTool
    if (down(9)) buttons |= CONTROL.pause
    if (down(12)) buttons |= CONTROL.grow
    if (down(13)) buttons |= CONTROL.shrink
    if (down(14)) buttons |= CONTROL.retry

    // Only the welcome screen accepts specific wake-up presses. Never replay blocked input.
    if (this.index !== pad.index || this.resync || blocked) {
      this.suppressed = blocked ? buttons : buttons & ~wakeActions
      this.previous = 0
      this.index = pad.index
      this.resync = false
    }
    this.suppressed &= buttons
    const held = buttons & ~this.suppressed
    const pressed = held & ~this.previous
    this.previous = held

    const axes = blocked ? [] : pad.axes
    return { held, pressed, aim: stick(axes[0], axes[1]), fineAim: stick(axes[2], axes[3]) }
  }
}
