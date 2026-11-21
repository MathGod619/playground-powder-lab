import { M } from './materials.ts'

export type Rng = () => number

/** Packs RGBA into the little-endian layout an ImageData Uint32 view expects. */
export const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

export function hsl(h: number, s: number, l: number, a = 255) {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const q = s * Math.min(l, 1 - l)
  const f = (n: number) => l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return pack(f(0) * 255 | 0, f(8) * 255 | 0, f(4) * 255 | 0, a)
}

export const half = (color: number) => (((color >>> 1) & 0x7f7f7f) | 0xff000000) >>> 0

export const FIRE_PALETTE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  const k = Math.min(1, i / 70)
  FIRE_PALETTE[i] = hsl(4 + 52 * k, 100, 32 + 44 * k)
}

export const STEAM = pack(225, 225, 240)
export const obsidian = (rng: Rng) => hsl(268, 28, 12 + rng() * 7)

export function colorFor(type: number, hue: number, rng: Rng) {
  switch (type) {
    case M.Sand: return hsl(36 + rng() * 10, 70, 54 + rng() * 16)
    case M.Water: return hsl(203 + rng() * 12, 90, 48 + rng() * 10)
    case M.Wall: return hsl(255, 12, 22 + rng() * 9)
    case M.Oil: return hsl(285, 42, 26 + rng() * 9)
    case M.Lava: return hsl(12 + rng() * 18, 100, 50 + rng() * 8)
    case M.Glitter: return hsl(hue + rng() * 40, 100, 60 + rng() * 12)
    case M.Plant: return hsl(105 + rng() * 35, 75, 32 + rng() * 14)
    case M.Speaker: return rng() < .25 ? pack(38, 34, 52) : pack(22, 19, 32)
    case M.Rocket: return pack(255, 240, 214)
    case M.Flower: return hsl(hue + rng() * 50, 100, 68)
    case M.Smoke: return pack(170, 165, 190)
  }
  return 0
}
