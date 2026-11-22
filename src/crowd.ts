import { half, hsl } from './color.ts'
import { M } from './materials.ts'
import type { World } from './world.ts'

/**
 * Tiny pixel ravers that live on top of the world. They walk the terrain, bob and hop on kicks,
 * wave on hi-hats, jump and cheer on the drop, get flung by blasts and speakers, climb out when
 * buried, swim in water, and vanish in a puff when they touch fire or lava (then walk back in).
 *
 * Ravers are plain data on the world so they survive cloning (drop retry, Director undo).
 * Positions are in cells: (x, y) is the cell the feet stand in; the body rises BODY cells above it.
 */
export type Raver = {
  x: number; y: number; vx: number; vy: number
  mode: Mode; dir: 1 | -1; speed: number
  /** Frames left of: lying dazed after a hard landing, cheering after a drop, the kick bob, the hi-hat wave. */
  daze: number; cheer: number; bob: number; wave: number
  /** Frames a flung raver ignores fire, so a blast throws them instead of burning them where they stood. */
  safe: number
  /** Frames until a vanished raver walks back in. */
  respawn: number
  skin: number; hair: number; shirt: number; stick: number
}
export type Mode = 'ground' | 'air' | 'swim' | 'gone'

export const BODY = 7
const GRAVITY = .13
const WALK = .14
const RESPAWN = 150

const SOLID = new Uint8Array(256), HAZARD = new Uint8Array(256), LIQUID = new Uint8Array(256)
for (const t of [M.Sand, M.Wall, M.Glitter, M.Speaker, M.Rocket, M.Gunpowder, M.Bomb, M.Gravel, M.Brick]) SOLID[t] = 1
HAZARD[M.Fire] = HAZARD[M.Lava] = 1
LIQUID[M.Water] = LIQUID[M.Oil] = 1

const SKINS = [hsl(28, 60, 78), hsl(25, 45, 62), hsl(22, 40, 46), hsl(20, 38, 32), hsl(32, 70, 70)]
const HAIRS = [hsl(30, 40, 18), hsl(40, 70, 55), hsl(5, 70, 40), hsl(300, 90, 65), hsl(180, 90, 55), hsl(0, 0, 92)]

/** How many ravers a world of this width gets. */
export const crowdSize = (width: number) => Math.max(5, Math.min(20, Math.round(width / 20)))

function cell(world: World, x: number, y: number) {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi < 0 || xi >= world.width || yi < 0) return M.Empty
  if (yi >= world.height) return M.Wall
  return world.type[yi * world.width + xi]
}
const solidAt = (world: World, x: number, y: number) => SOLID[cell(world, x, y)] === 1
/** In the Deep Sea world water is just the medium they walk through. */
const wetAt = (world: World, x: number, y: number) => world.scene !== 'sea' && LIQUID[cell(world, x, y)] === 1

/** The feet row of the first place to stand in this column, or -1 when it is unsafe or blocked. */
export function surface(world: World, x: number) {
  for (let y = 0; y < world.height; y++) {
    const t = cell(world, x, y)
    if (HAZARD[t] || wetAt(world, x, y)) return -1
    if (SOLID[t]) return y - 1 >= BODY ? y - 1 : -1
  }
  return -1
}

function makeRaver(world: World, x: number, y: number, dir: 1 | -1): Raver {
  const r = world.rng
  return {
    x, y, vx: 0, vy: 0, mode: 'ground', dir, speed: WALK * (.6 + r() * .8),
    daze: 0, cheer: 0, bob: 0, wave: 0, safe: 0, respawn: 0,
    skin: SKINS[r() * SKINS.length | 0], hair: HAIRS[r() * HAIRS.length | 0],
    shirt: hsl(r() * 360, 95, 60), stick: hsl(r() * 360, 100, 65),
  }
}

/** Fills the world with a fresh crowd standing on safe ground. */
export function spawnCrowd(world: World, count = crowdSize(world.width)) {
  world.ravers = []
  for (let n = 0, tries = 0; n < count && tries < count * 30; tries++) {
    const x = Math.round(world.width * (.06 + world.rng() * .88)), y = surface(world, x)
    if (y < 0) continue
    world.ravers.push(makeRaver(world, x, y, world.rng() < .5 ? 1 : -1))
    n++
  }
  return world.ravers.length
}

function respawn(world: World, raver: Raver) {
  const first = world.rng() < .5 ? 1 : -1
  for (const side of [first, -first] as const) {
    const x = side === 1 ? 2 : world.width - 3, y = surface(world, x)
    if (y < 0) continue
    Object.assign(raver, { x, y, vx: 0, vy: 0, mode: 'ground', dir: side, daze: 0, cheer: 0, respawn: 0 })
    return
  }
  raver.respawn = 60
}

function vanish(world: World, raver: Raver) {
  const r = world.rng
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2, s = .4 + r() * 1.4
    world.addParticle(raver.x, raver.y - BODY / 2, Math.cos(a) * s, Math.sin(a) * s - .6, M.Spark, k & 1 ? raver.shirt : raver.stick, 20 + r() * 25)
  }
  raver.mode = 'gone'
  raver.respawn = RESPAWN + (r() * 120 | 0)
}

function touching(world: World, raver: Raver, table: Uint8Array) {
  for (let h = 0; h < BODY; h += 2) if (table[cell(world, raver.x, raver.y - h)]) return true
  return false
}

/** Moves an airborne raver along its velocity, landing on or bouncing off solid cells. */
function fly(world: World, raver: Raver) {
  const sea = world.scene === 'sea'
  raver.vy += GRAVITY * world.rules.gravity * (sea ? .35 : 1)
  raver.vx *= sea ? .96 : .995
  if (sea) raver.vy *= .97
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(raver.vx), Math.abs(raver.vy))))
  for (let s = 0; s < steps; s++) {
    const nx = raver.x + raver.vx / steps, ny = raver.y + raver.vy / steps
    const offSide = nx < 1 || nx > world.width - 2
    if (offSide || solidAt(world, nx, raver.y) || solidAt(world, nx, raver.y - BODY + 1)) { raver.vx *= -.35 } else raver.x = nx
    if (raver.vy > 0 && solidAt(world, raver.x, ny + 1)) {
      if (raver.vy > 3.2) raver.daze = 50 + (raver.vy * 8 | 0)
      raver.vy = 0; raver.vx = 0; raver.mode = 'ground'
      raver.y = Math.round(ny + 1) - 1
      return
    }
    if (raver.vy < 0 && solidAt(world, raver.x, ny - BODY + 1)) raver.vy = 0
    else raver.y = ny
  }
}

function walk(world: World, raver: Raver) {
  const r = world.rng
  if (raver.daze > 0) { raver.daze--; return }
  if (raver.cheer > 0) return
  if (r() < .004) raver.dir = raver.dir === 1 ? -1 : 1
  const speed = raver.speed * (1 + world.energy.level * .8)
  const ahead = Math.round(raver.x + raver.dir * (speed + 1)), y = Math.round(raver.y)
  let turn = ahead < 1 || ahead > world.width - 2
  // Look down the path for fire, lava or a sheer drop into water.
  for (let d = 1; d <= 6 && !turn; d++) {
    const t = cell(world, ahead, y + d)
    if (HAZARD[t]) turn = true
    if (SOLID[t] || LIQUID[t]) break
  }
  if (!turn && HAZARD[cell(world, ahead, y)]) turn = true
  if (!turn && solidAt(world, ahead, y)) {
    // Step up ledges of one or two cells, turn at anything taller.
    const climb = !solidAt(world, ahead, y - 1) ? 1 : !solidAt(world, ahead, y - 2) ? 2 : 0
    if (climb && !solidAt(world, ahead, y - climb - BODY + 1)) { raver.y -= climb; raver.x = ahead; return }
    turn = true
  }
  if (turn) { raver.dir = raver.dir === 1 ? -1 : 1; return }
  raver.x += raver.dir * speed
}

/** One simulation frame for the whole crowd. */
export function stepCrowd(world: World) {
  for (const raver of world.ravers) {
    if (raver.bob > 0) raver.bob--
    if (raver.wave > 0) raver.wave--
    if (raver.cheer > 0) raver.cheer--
    if (raver.mode === 'gone') { if (--raver.respawn <= 0) respawn(world, raver); continue }
    raver.x = Math.max(1, Math.min(world.width - 2, raver.x))
    if (raver.safe > 0) raver.safe--
    else if (touching(world, raver, HAZARD)) { vanish(world, raver); continue }

    if (world.scene !== 'sea' && touching(world, raver, LIQUID)) {
      // Swim: float up until the head clears the surface, paddle the way they face.
      raver.mode = 'swim'
      raver.vy = raver.vy * .8 + (wetAt(world, raver.x, raver.y - BODY + 2) ? -.06 : .03)
      raver.vx = raver.vx * .9 + raver.dir * .02
      raver.y += raver.vy
      if (solidAt(world, raver.x + raver.vx + raver.dir, raver.y - 1)) raver.dir = raver.dir === 1 ? -1 : 1
      else raver.x += raver.vx
      if (solidAt(world, raver.x, raver.y + 1) && !wetAt(world, raver.x, raver.y - 2)) raver.mode = 'ground'
      continue
    }
    if (raver.mode === 'swim') raver.mode = 'ground'

    if (raver.mode === 'ground') {
      // Buried by sand or a wall: climb out the top.
      if (solidAt(world, raver.x, raver.y)) { raver.y -= 1; continue }
      if (!solidAt(world, raver.x, raver.y + 1)) { raver.mode = 'air'; raver.vy = 0; raver.vx = 0 }
      else { walk(world, raver); continue }
    }
    fly(world, raver)
  }
}

function hop(world: World, raver: Raver, up: number) {
  raver.mode = 'air'
  raver.vy = -up
  raver.vx = (world.rng() - .5) * .4
}

export function crowdKick(world: World, strength: number) {
  for (const raver of world.ravers) {
    if (raver.mode !== 'ground' || raver.daze > 0) continue
    raver.bob = 7
    if (world.rng() < .3 + strength * .3) hop(world, raver, .8 + strength * 1.1 + world.rng() * .4)
  }
}

export function crowdHat(world: World) {
  for (const raver of world.ravers) if (raver.mode !== 'gone' && world.rng() < .5) raver.wave = 8
}

export function crowdDrop(world: World) {
  for (const raver of world.ravers) {
    if (raver.mode === 'gone') continue
    raver.cheer = 200; raver.daze = 0
    if (raver.mode === 'ground') hop(world, raver, 2.2 + world.rng() * 1.2)
  }
}

/** Throws ravers away from a point, like blasts and speakers throw sand. */
export function crowdPush(world: World, x: number, y: number, radius: number, power: number) {
  const reach = radius * 1.7
  for (const raver of world.ravers) {
    if (raver.mode === 'gone') continue
    const dx = raver.x - x, dy = raver.y - BODY / 2 - y, d = Math.hypot(dx, dy) || .5
    if (d > reach) continue
    const f = 1 - d / reach, speed = (1.5 + 4.5 * power) * f + .4
    raver.vx += dx / d * speed
    raver.vy += dy / d * speed - (1 + 1.5 * f) * power
    const cap = 2 + 4.5 * power, v = Math.hypot(raver.vx, raver.vy)
    if (v > cap) { raver.vx *= cap / v; raver.vy *= cap / v }
    raver.mode = 'air'
    raver.daze = 0
    raver.safe = 24
  }
}

// ---------------------------------------------------------------- drawing

/**
 * Paints the crowd into the pixel buffers. Sprites are 3 cells wide and BODY tall:
 * hair, face, arms and shirt, then legs. Dazed ravers lie on their side; the glow stick lights the glow layer.
 */
export function drawCrowd(world: World, pix: Uint32Array, gpix: Uint32Array) {
  const W = world.width, H = world.height
  const plot = (x: number, y: number, c: number, glow = 0) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return
    const i = y * W + x
    pix[i] = c
    if (glow) gpix[i] = glow
  }
  const kick = world.pulse.kick > .5
  for (const raver of world.ravers) {
    if (raver.mode === 'gone') continue
    const x = Math.round(raver.x), y = Math.round(raver.y)
    const { skin, hair, shirt, stick } = raver
    const shirtGlow = kick ? half(shirt) : 0
    if (raver.daze > 0 && raver.mode === 'ground') {
      // Lying down, head toward where they were walking.
      const d = raver.dir
      for (let k = 0; k < 2; k++) plot(x + d * (3 - k), y, k ? skin : hair)
      for (let k = -1; k <= 1; k++) plot(x + d * k, y, shirt)
      plot(x - d * 2, y, skin); plot(x - d * 3, y, skin)
      if ((world.frame >> 3) & 1) plot(x + d * 3, y - 2, 0xffffffff)
      continue
    }
    const crouch = raver.bob > 3 || raver.mode === 'swim' ? 1 : 0
    const top = y - BODY + 1 + crouch
    const armsUp = raver.cheer > 0 || raver.wave > 0 || raver.mode === 'air'
    plot(x, top, hair)
    plot(x, top + 1, skin)
    for (let k = 2; k <= 4; k++) plot(x, top + k, shirt, shirtGlow)
    if (armsUp) {
      plot(x - 1, top + 1, skin); plot(x + 1, top + 1, skin)
      plot(x - 1, top + 2, shirt); plot(x + 1, top + 2, shirt)
      plot(x + raver.dir, top - 1, stick, stick)
    } else {
      plot(x - 1, top + 2, shirt); plot(x + 1, top + 2, shirt)
      plot(x - 1, top + 3, skin); plot(x + 1, top + 3, skin)
      plot(x + raver.dir, top + 4, stick, stick)
    }
    if (raver.mode === 'swim') continue
    const stride = raver.mode === 'ground' && raver.cheer <= 0 && ((raver.x * 1.5 | 0) & 1)
    if (crouch) { plot(x - 1, y, skin); plot(x + 1, y, skin) }
    else if (stride) { plot(x, y - 1, skin); plot(x, y, skin) }
    else { plot(x - 1, y - 1, skin); plot(x + 1, y - 1, skin); plot(x - 1, y, skin); plot(x + 1, y, skin) }
  }
}
