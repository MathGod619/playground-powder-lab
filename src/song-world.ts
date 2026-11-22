import type { BeatMap } from './analysis.ts'
import { M } from './materials.ts'
import type { ChallengeMarker } from './rave-challenges.ts'
import type { World } from './world.ts'

/**
 * Song-shaped worlds: a landscape built from an uploaded song's beat map. Left to right is the song
 * from start to end. Loud sections rise into mountains and quiet breakdowns sink into lakes; every
 * drop becomes a labelled lava crater at the moment it lands; speakers stand where the bass hits
 * hardest; hi-hat heavy songs get glitter strata and rain clouds, slow ones get seeds; and the
 * song's character picks the colours.
 */
export type SongShape = {
  name: string
  duration: number
  bpm: number
  drops: number[]
  kicksPerSecond: number
  hatsPerSecond: number
  loud: number[]; bass: number[]; treble: number[]
}

export function songShape(map: BeatMap, name: string): SongShape | null {
  if (!map.shape || map.duration < 8) return null
  const seconds = Math.max(1, map.duration)
  return {
    name: name.replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 40) || 'Your song',
    duration: map.duration, bpm: map.bpm, drops: [...map.drops],
    kicksPerSecond: map.kicks.length / seconds, hatsPerSecond: map.hats.length / seconds,
    loud: map.shape.loud, bass: map.shape.bass, treble: map.shape.treble,
  }
}

/** A gentle made-up song, so the Song world still builds before any song is mapped. */
const FALLBACK: SongShape = (() => {
  const n = 96, wave = (f: (u: number) => number) => Array.from({ length: n }, (_, i) => f(i / (n - 1)))
  return {
    name: 'Demo loop', duration: 32, bpm: 120, drops: [15, 31], kicksPerSecond: 2, hatsPerSecond: 3,
    loud: wave(u => .35 + .3 * Math.sin(u * 9) ** 2 + (u > .47 && u < .7 ? .35 : 0)),
    bass: wave(u => .4 + .6 * Math.abs(Math.sin(u * 7))),
    treble: wave(u => .3 + .5 * Math.abs(Math.cos(u * 11))),
  }
})()

let current: SongShape | null = null
let labels: ChallengeMarker[] = []
/** The drop labels of the most recently built Song world. */
export const songMarkers = () => labels
/** The song the Song world is built from (kept here so resets and detail changes rebuild it). */
export const setSongShape = (shape: SongShape | null) => { current = shape }
export const getSongShape = () => current

/** Reads an envelope at u (0–1) with linear interpolation, averaged over a small window to smooth it. */
function sample(values: number[], u: number, window = .015) {
  const at = (v: number) => {
    const f = Math.max(0, Math.min(1, v)) * (values.length - 1), i = Math.floor(f), t = f - i
    return values[i] * (1 - t) + (values[Math.min(values.length - 1, i + 1)] ?? values[i]) * t
  }
  return (at(u - window) + at(u) * 2 + at(u + window)) / 4
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)

/** How many cells of loose sand and glitter sit on top of the rock (6–8, by grid height). */
export const looseDepth = (height: number) => Math.max(6, Math.min(8, Math.round(height * .03)))

/** Builds the world for a song and returns the labels to show over each drop crater. */
export function buildSongWorld(world: World, shape: SongShape = current ?? FALLBACK): ChallengeMarker[] {
  const { width: W, height: H } = world
  // Brighter, hat-heavy songs lean cool (cyan to violet), bass-heavy ones warm (red to amber).
  const brightness = shape.hatsPerSecond / Math.max(.1, shape.hatsPerSecond + shape.kicksPerSecond)
  const hue = (brightness < .5 ? 10 + brightness * 70 : 170 + (brightness - .5) * 220) % 360
  world.hue = hue
  const bedrock = H - 4, low = H * .86, high = H * .3
  const ground = new Int32Array(W)
  for (let x = 0; x < W; x++) {
    const u = x / Math.max(1, W - 1)
    // Ridges: gentle everywhere, jagged where the treble is bright.
    const ridge = (Math.sin(x * .21) * .45 + Math.sin(x * .053 + 1.3) * .55) * H * .03 * (.35 + sample(shape.treble, u))
    ground[x] = Math.round(low - (low - high) * Math.pow(sample(shape.loud, u), 1.35) + ridge)
  }

  // Strata: beat-coloured bands, glitter bands where the treble is bright. Only a surface layer is loose
  // sand and glitter for the music and players to move; below it the same bands are solid rock, so the
  // mountains keep the song's silhouette however long it plays. Blasts still smash the rock into gravel.
  const loose = looseDepth(H)
  for (let x = 0; x < W; x++) {
    const u = x / Math.max(1, W - 1), treble = sample(shape.treble, u), bass = sample(shape.bass, u)
    for (let y = ground[x]; y < H; y++) {
      const depth = y - ground[x], band = Math.floor(depth / 3), i = world.index(x, y)
      if (y >= bedrock || depth > (H - ground[x]) * .55) { world.set(x, y, M.Wall); continue }
      const material = treble > .55 && band % 3 === 1 ? M.Glitter : M.Sand
      world.put(i, material, hue + band * 23 + bass * 40)
      if (depth >= loose) world.type[i] = M.Wall
    }
  }

  // Quiet stretches below the waterline become lakes.
  const waterline = Math.round(low - (low - high) * .22)
  for (let x = 0; x < W; x++) for (let y = waterline; y < ground[x]; y++) world.set(x, y, M.Water)

  // Drops: a lava crater where each one lands, rimmed with rock and a ring of glitter.
  const markers: ChallengeMarker[] = []
  const radius = Math.max(4, Math.round(W * .028))
  /** Sets a structure into the terrain at `top`: clears what is above it and props it up on rock from below. */
  const seat = (x0: number, x1: number, top: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      for (let y = Math.min(top, ground[x]); y < top; y++) world.set(x, y, M.Empty)
      for (let y = top; y < Math.max(top, ground[x]); y++) world.set(x, y, M.Wall)
    }
  }
  const settle = (x0: number, x1: number) => {
    let sum = 0, n = 0
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) { sum += ground[x]; n++ }
    return Math.round(sum / Math.max(1, n))
  }
  shape.drops.forEach((t, n) => {
    const cx = Math.round(Math.max(radius + 2, Math.min(W - radius - 3, t / shape.duration * W)))
    const floor = Math.min(settle(cx - radius, cx + radius), waterline - 2)
    seat(cx - radius, cx + radius, floor - 1)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, depth = Math.round(Math.sqrt(radius * radius - dx * dx) * .8)
      for (let y = floor - 1; y <= floor + depth + 1; y++) {
        if (y < 0 || y >= H) continue
        const edge = y >= floor + depth || Math.abs(dx) >= radius - 1
        world.set(x, y, edge ? M.Wall : M.Lava)
      }
      if (Math.abs(dx) === radius) for (let y = floor - 3; y < floor - 1; y++) world.set(x, y, M.Glitter)
    }
    markers.push({ x: cx, y: floor + radius, label: `DROP ${n + 1}` })
  })

  // Speakers on the hardest-hitting bass, kept apart from each other and from the craters.
  const speakers = Math.max(1, Math.min(5, Math.round(shape.kicksPerSecond * 1.6)))
  const taken = markers.map(m => m.x)
  const spots = Array.from({ length: W }, (_, x) => x)
    .filter(x => x > W * .05 && x < W * .95 && ground[x] < waterline - 2)
    .sort((a, b) => sample(shape.bass, b / W) - sample(shape.bass, a / W))
  const sw = Math.max(6, Math.round(W * .025)), sh = Math.max(8, Math.round(H * .055))
  for (const x of spots) {
    if (taken.filter(t => Math.abs(t - x) < W * .12).length || taken.length >= speakers + markers.length) continue
    taken.push(x)
    const floor = settle(x - (sw >> 1), x + (sw >> 1))
    seat(x - (sw >> 1), x + (sw >> 1), floor)
    for (let y = floor - sh; y < floor + 2; y++) for (let dx = -(sw >> 1); dx < sw >> 1; dx++) world.set(x + dx, y, M.Speaker)
    // A rock footing down to the solid layer, so the music cannot wash the ground out from under it.
    for (let dx = -(sw >> 1); dx < sw >> 1; dx++) {
      const cx = x + dx
      if (cx < 0 || cx >= W) continue
      for (let y = floor + 2; y < H && world.at(cx, y) !== M.Wall; y++) {
        const i = world.index(cx, y)
        if (world.type[i] === M.Empty || world.type[i] === M.Water) world.put(i, M.Sand, hue)
        world.type[i] = M.Wall
      }
    }
  }

  // Busy hi-hats bring rain clouds over the brightest stretch; slow songs plant seeds.
  if (shape.hatsPerSecond > 2.5) {
    let best = 0
    for (let x = 0; x < W; x++) if (sample(shape.treble, x / W) > sample(shape.treble, best / W)) best = x
    const cy = Math.round(H * .22), rx = Math.round(W * .09), ry = Math.max(3, Math.round(H * .04))
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = best - rx; x <= best + rx; x++) {
      if (x < 0 || x >= W) continue
      if (((x - best) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && world.rng() < .8) world.set(x, y, M.Cloud)
    }
  }
  if ((shape.bpm && shape.bpm < 112) || mean(shape.treble) < .35) {
    for (let x = 6; x < W - 6; x += Math.max(6, Math.round(W / 24))) {
      const y = ground[x] - 1
      if (y > 2 && world.at(x, y) === M.Empty && world.at(x, y + 1) === M.Sand) world.set(x, y, M.Plant, 4)
    }
  }
  labels = markers
  return markers
}

/** Where the song is in its own landscape: the column under the playhead. */
export const playheadColumn = (world: World, shape: SongShape, seconds: number) =>
  Math.max(0, Math.min(world.width - 1, Math.round(seconds / shape.duration * world.width)))

