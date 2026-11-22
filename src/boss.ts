import { half, hsl } from './color.ts'
import { crowdDrop, crowdPush } from './crowd.ts'
import { M } from './materials.ts'
import type { World } from './world.ts'

/**
 * Boss Drop: a big pixel monster that stomps along the floor. A shield protects it except for the few
 * seconds after a drop, so damage comes from charges planted next to it and set off by the drop, scaled
 * by how on-beat the drop was. Every eighth beat it fights back, alternating between eating the bombs
 * within reach (its mouth glows the beat before) and spitting lava.
 *
 * Like the crowd, the boss is plain data on the world, stepped and drawn by world.ts and render.ts.
 */
export type Boss = {
  x: number
  /** The row its feet stand in. */
  floor: number
  w: number; h: number
  hp: number; max: number
  dir: 1 | -1
  /** Frames left of the post-drop window when the shield is down. */
  open: number
  /** Timing multiplier of the drop that opened the shield. */
  multiplier: number
  /** Frames left of: hit flash, shield ripple, stomp pose, the glowing-mouth warning. */
  hit: number; blocked: number; stomp: number; warn: number
  beats: number
  next: 'chomp' | 'spit'
  /** Bombs it has eaten, and damage taken during the current window (for the HUD). */
  eaten: number; lastHit: number
  dead: boolean
}

export const BOSS_HP = 100
/** Frames the shield stays down after a drop. */
export const OPEN_FRAMES = 210
const ATTACK_EVERY = 8

export function spawnBoss(world: World) {
  const w = Math.max(18, Math.min(44, Math.round(world.width * .09))), h = Math.round(w * 1.2)
  const x = Math.round(world.width * .62)
  let floor = world.height - 2
  for (let y = 0; y < world.height; y++) if (world.at(x, y) === M.Wall) { floor = y - 1; break }
  world.boss = {
    x, floor, w, h, hp: BOSS_HP, max: BOSS_HP, dir: -1, open: 0, multiplier: 1,
    hit: 0, blocked: 0, stomp: 0, warn: 0, beats: 0, next: 'chomp', eaten: 0, lastHit: 0, dead: false,
  }
  return world.boss
}

const left = (b: Boss) => Math.round(b.x - b.w / 2)
const top = (b: Boss) => b.floor - b.h + 1
const center = (b: Boss) => ({ x: b.x, y: b.floor - b.h / 2 })

/** Distance from a point to the boss's body box (0 inside it). */
function distance(b: Boss, x: number, y: number) {
  const dx = Math.max(left(b) - x, 0, x - (left(b) + b.w)), dy = Math.max(top(b) - y, 0, y - b.floor)
  return Math.hypot(dx, dy)
}

function damage(world: World, b: Boss, amount: number) {
  if (b.dead || amount <= 0) return
  b.hp = Math.max(0, b.hp - amount)
  b.lastHit += amount
  b.hit = 10
  if (b.hp > 0) return
  b.dead = true
  const { x, y } = center(b)
  for (let k = 0; k < 4; k++) world.explode(x + (k - 1.5) * b.w * .3, y - k * 3, 1.6)
  world.rings.push({ x, y, r: 2, max: b.w * 4, hue: 50, width: 6 })
  Object.assign(world.pulse, { flash: 1, shake: 30 })
  crowdDrop(world)
}

export function stepBoss(world: World) {
  const b = world.boss
  if (!b || b.dead) return
  if (b.open > 0 && --b.open === 0) b.lastHit = 0
  if (b.hit > 0) b.hit--
  if (b.blocked > 0) b.blocked--
  if (b.stomp > 0) b.stomp--
  if (b.warn > 0) b.warn--
  if (b.open <= 0) {
    // Pace the arena. It stands still while the shield is down so the drop can land.
    const min = world.width * .14 + b.w / 2, max = world.width * .86 - b.w / 2
    b.x += b.dir * .12
    if (b.x < min) { b.x = min; b.dir = 1 }
    if (b.x > max) { b.x = max; b.dir = -1 }
  } else if (world.frame % 6 === 0) {
    // Fire and lava touching it burn while the shield is down.
    let burning = 0
    for (let y = top(b); y <= b.floor; y += 2) for (let x = left(b); x < left(b) + b.w; x += 2) {
      const t = world.at(x, y)
      if (t === M.Fire || t === M.Lava) burning++
    }
    damage(world, b, Math.min(1.5, burning * .02) * b.multiplier)
  }
}

/** Every kick is a stomp; every eighth beat it attacks. */
export function bossKick(world: World) {
  const b = world.boss
  if (!b || b.dead) return
  b.beats++
  b.stomp = 8
  crowdPush(world, b.x, b.floor, b.w * .5, .25)
  if (b.open > 0) return
  const phase = b.beats % ATTACK_EVERY
  if (phase === ATTACK_EVERY - 1 && b.next === 'chomp') b.warn = 45
  if (phase !== 0) return
  if (b.next === 'chomp') chomp(world, b)
  else spit(world, b)
  b.next = b.next === 'chomp' ? 'spit' : 'chomp'
}

/** Eats every bomb within a few cells of its body. */
export function chomp(world: World, b: Boss) {
  const reach = 5, x0 = left(b) - reach, x1 = left(b) + b.w + reach, y0 = top(b) - reach
  let eaten = 0
  for (let y = Math.max(0, y0); y <= Math.min(world.height - 1, b.floor + 1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(world.width - 1, x1); x++) {
      const i = world.index(x, y)
      if (world.type[i] !== M.Bomb) continue
      world.type[i] = M.Empty
      eaten++
      world.addParticle(x, y, (b.x - x) * .05, -.5, M.Spark, hsl(20, 100, 60), 18)
    }
  }
  b.eaten += eaten
  const mouth = center(b)
  world.rings.push({ x: mouth.x, y: mouth.y, r: 2, max: b.w * 1.1, hue: 15, width: 3 })
  return eaten
}

function spit(world: World, b: Boss) {
  const r = world.rng, mouth = center(b)
  for (let k = 0; k < 7; k++) {
    const vx = (r() < .5 ? -1 : 1) * (1 + r() * 2.2), vy = -2 - r() * 1.8
    world.addParticle(mouth.x, mouth.y, vx, vy, M.Lava, hsl(20 + r() * 20, 100, 55), 0)
  }
}

/** A drop drops the shield. Opening hit: a little damage on its own, scaled by timing. */
export function bossDrop(world: World) {
  const b = world.boss
  if (!b || b.dead) return
  b.open = OPEN_FRAMES
  b.warn = 0
  b.lastHit = 0
  damage(world, b, 3 * b.multiplier)
}

/** Blasts hurt it while the shield is down and ripple off the shield otherwise. */
export function bossBlast(world: World, x: number, y: number, radius: number, power: number) {
  const b = world.boss
  if (!b || b.dead) return
  const reach = radius * 1.4 + 2, d = distance(b, x, y)
  if (d > reach) return
  if (b.open <= 0) { b.blocked = 12; return }
  damage(world, b, 6.5 * power * (1 - d / reach) * b.multiplier)
}

// ---------------------------------------------------------------- drawing

export function drawBoss(world: World, pix: Uint32Array, gpix: Uint32Array) {
  const b = world.boss
  if (!b || b.dead) return
  const W = world.width, H = world.height, x0 = left(b), y0 = top(b)
  const plot = (x: number, y: number, c: number, glow = 0) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return
    pix[y * W + x] = c
    if (glow) gpix[y * W + x] = glow
  }
  const flash = b.hit > 0 && (b.hit & 2) > 0
  const open = b.open > 0
  const eye = open ? hsl(0, 100, 60) : hsl(185, 100, 65)
  const mouthLit = b.warn > 0 && ((world.frame >> 2) & 1)
  const step = b.stomp > 4 ? 1 : 0
  const es = Math.max(2, Math.round(b.w / 11))

  for (let cy = y0 - 2; cy <= b.floor; cy++) {
    const v = (b.floor - cy) / b.h
    for (let cx = x0 - 2; cx < x0 + b.w + 2; cx++) {
      const u = (cx - b.x) / (b.w / 2), au = Math.abs(u)
      let body = false
      if (v < .2) {
        // Two stomping legs, one lifted on the beat.
        const lift = u < 0 ? step : 0
        body = au > .2 && au < .62 && v >= lift / b.h
      } else {
        const e = u * u + ((v - .54) / .36) ** 2
        body = e <= 1
        // Horns and back spikes.
        if (!body && v > .84 && v < 1.08 && au > .3 && au < .62 && Math.abs(au - .3 - (v - .84) * 1.1) < .09) body = true
        if (!body && e <= 1.12 && v > .7 && ((cx + (cy >> 1)) % 5 === 0)) body = true
      }
      if (body) {
        const shade = ((cx * 7 + cy * 13) & 7) * 1.5
        let c = au < .42 && v < .55 && v > .22 ? hsl(285, 38, 38 + shade) : hsl(272, 48, 22 + shade)
        if (flash) c = 0xffffffff
        plot(cx, cy, c, flash ? half(c) : 0)
      } else if (!open && cy >= y0 - 2) {
        // Shield bubble: sparse glinting outline just outside the body.
        const e = u * u * .8 + ((v - .5) / .58) ** 2
        if (e > .98 && e < 1.06 && ((cx + cy + (world.frame >> 2)) % 3 === 0)) {
          const c = hsl(185, 100, b.blocked > 0 ? 80 : 55)
          plot(cx, cy, c, b.blocked > 0 ? c : half(c))
        }
      }
    }
  }
  // Eyes.
  const eyeY = Math.round(b.floor - b.h * .68)
  for (const side of [-1, 1]) {
    const ex = Math.round(b.x + side * b.w * .2) - (es >> 1)
    for (let dy = 0; dy < es; dy++) for (let dx = 0; dx < es; dx++) plot(ex + dx, eyeY + dy, eye, eye)
  }
  // Mouth: dark, or glowing with teeth before a chomp.
  const mouthY = Math.round(b.floor - b.h * .5), mw = Math.round(b.w * .36)
  for (let dx = -mw; dx <= mw; dx++) {
    const tooth = (dx & 1) === 0
    for (let dy = 0; dy < 2; dy++) {
      const c = mouthLit ? (tooth && dy === 0 ? 0xffffffff : hsl(25, 100, 55)) : (tooth && dy === 0 ? hsl(0, 0, 85) : hsl(280, 60, 8))
      plot(Math.round(b.x) + dx, mouthY + dy, c, mouthLit ? c : 0)
    }
  }
  // Health bar above the head.
  const barY = y0 - 5, filled = Math.round(b.w * b.hp / b.max)
  for (let dx = -1; dx <= b.w; dx++) for (let dy = -1; dy <= 1; dy++) {
    const inside = dx >= 0 && dx < b.w && dy === 0
    const c = !inside ? hsl(0, 0, 12) : dx < filled ? hsl(b.hp / b.max * 110, 100, 55) : hsl(0, 30, 22)
    plot(x0 + dx, barY + dy, c, inside && dx < filled ? c : 0)
  }
}
