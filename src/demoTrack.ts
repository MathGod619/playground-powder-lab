/**
 * The built-in demo: a 16-bar loop synthesised live with Web Audio.
 * Bars 1–4 groove, 5–8 break down and build (no kick), 9–16 drop.
 */
export const DEMO_BPM = 124
const SIXTEENTH = 60 / DEMO_BPM / 4
/** One pass of the 16-bar loop, in seconds. */
export const DEMO_LOOP_SECONDS = SIXTEENTH * 256
const ROOTS = [110, 87.31, 130.81, 98]
const CHORDS = [[440, 523.25, 659.25], [349.23, 440, 523.25], [523.25, 659.25, 783.99], [392, 493.88, 587.33]]

/** Starts the loop `offset` seconds in (used to join someone else's demo in sync). */
export function startDemo(ctx: AudioContext, output: AudioNode, noise: AudioBuffer, offset = 0) {
  const bus = ctx.createGain()
  bus.connect(output)
  const into = ((offset % DEMO_LOOP_SECONDS) + DEMO_LOOP_SECONDS) % DEMO_LOOP_SECONDS
  let step = Math.ceil(into / SIXTEENTH)
  let next = ctx.currentTime + .08 + (step * SIXTEENTH - into)

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay)
  }
  const kick = (t: number, v = 1) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + .13)
    env(g, t, 1.1 * v, .002, .38)
    o.connect(g).connect(bus); o.start(t); o.stop(t + .45)
  }
  const hiss = (t: number, type: BiquadFilterType, f: number, q: number, v: number, a: number, d: number) => {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q
    env(g, t, v, a, d)
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * .5); s.stop(t + a + d + .05)
  }
  const hat = (t: number, open: boolean, v = 1) => hiss(t, 'highpass', 8000, .7, (open ? .22 : .12) * v, .001, open ? .16 : .035)
  const clap = (t: number, v = 1) => { for (let k = 0; k < 3; k++) hiss(t + k * .011, 'bandpass', 1400, 1.2, .55 * v, .001, k === 2 ? .16 : .02) }
  const synth = (t: number, f: number, dur: number, type: OscillatorType, cut: number, v: number, res = 6) => {
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = type; o.frequency.value = f
    fl.type = 'lowpass'; fl.Q.value = res
    fl.frequency.setValueAtTime(cut * 3, t); fl.frequency.exponentialRampToValueAtTime(cut, t + dur)
    env(g, t, v, .004, dur)
    o.connect(fl).connect(g).connect(bus); o.start(t); o.stop(t + dur + .05)
  }
  const pad = (t: number, notes: number[], dur: number) => {
    for (const f of notes) for (const detune of [-7, 7]) {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain()
      o.type = 'sawtooth'; o.frequency.value = f / 2; o.detune.value = detune
      fl.type = 'lowpass'; fl.frequency.value = 900
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035, t + dur * .3); g.gain.linearRampToValueAtTime(0, t + dur)
      o.connect(fl).connect(g).connect(bus); o.start(t); o.stop(t + dur + .05)
    }
  }
  const riser = (t: number, dur: number) => {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = noise; s.loop = true
    fl.type = 'bandpass'; fl.Q.value = 3
    fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(9000, t + dur)
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.5, t + dur); g.gain.setValueAtTime(0, t + dur)
    s.connect(fl).connect(g).connect(bus); s.start(t); s.stop(t + dur + .02)
  }

  const play = (n: number, t: number) => {
    const bar = (n >> 4) % 16, s = n & 15, chord = bar % 4, root = ROOTS[chord], notes = CHORDS[chord]
    if (bar < 4) {
      if (s % 4 === 0) kick(t, .95)
      if (s % 4 === 2) { hat(t, true); synth(t, root, .16, 'sawtooth', 300, .32) }
      if (s % 2 === 1) hat(t, false, .7)
      if (bar >= 2 && (s === 4 || s === 12)) clap(t, .8)
    } else if (bar < 8) {
      if (s === 0) pad(t, notes, SIXTEENTH * 16)
      if (bar === 4 && s === 0) riser(t, SIXTEENTH * 64)
      if (bar === 6 && s % 4 === 0) clap(t, .4)
      if (bar === 7 && (s < 8 ? s % 2 === 0 : true)) clap(t, .35 + s * .04)
      if (s % 4 === 2 && bar < 6) hat(t, false, .5)
    } else {
      if (s % 4 === 0) kick(t, 1.05)
      else synth(t, root * (s % 4 === 2 ? 2 : 1), .11, 'sawtooth', 520, .3, 10)
      if (s === 4 || s === 12) clap(t, 1)
      hat(t, s % 4 === 2, s % 2 ? .6 : .9)
      if ([0, 3, 6, 10, 12].includes(s)) synth(t, notes[(s + bar) % 3] * 2, .12, 'square', 2200, .07, 2)
      if (bar === 8 && s === 0) hiss(t, 'highpass', 3000, .5, .5, .002, 1.6)
    }
  }

  const schedule = () => {
    while (next < ctx.currentTime + .12) { play(step++, next); next += SIXTEENTH }
  }
  const timer = setInterval(schedule, 25)
  schedule()

  return () => {
    clearInterval(timer)
    bus.gain.setTargetAtTime(0, ctx.currentTime, .02)
    setTimeout(() => bus.disconnect(), 400)
  }
}
