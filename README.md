# Powder Rave

A full-screen falling-sand world that hears your music. Kicks make the ground jump, speakers blast the dirt around, hi-hats throw sparks, and when the drop hits, everything goes off at once.

## Run it

1. Install Node.js 22.18+ (22.x line) or 24+.
2. `npm install`, then `npm run dev`, and open the URL Vite prints.
3. Hit **DROP THE BEAT** with sound on.

`npm test` runs the physics, beat-detection and save tests. `npm run build` makes the production build in `dist/`, and `npm run preview` serves it.

## What the music does

| Sound | What happens |
| --- | --- |
| **Kick** (30–95 Hz) | The exposed top layer of every pile (sand, glitter, water, oil, lava) is thrown into the air and lands again. Speakers blast nearby loose cells outward with a shockwave ring. Seeds grow one step. The volcano erupts. The screen shakes and the colours shift. |
| **Hi-hats** (5–13 kHz) | Embers fly off fire and lava. Glitter twinkles. |
| **Midrange** (300 Hz–2 kHz) | Water and smoke slosh, switching direction every bar. |
| **The drop** | A hard kick after at least 1.7 s with no kick (once a steady beat has been heard). Flash, chromatic glitch, every speaker fires, every plant blooms, and fireworks go up. Press **D** or the DROP button to force one. |

## Materials

Sand, Water, Wall, Fire, Oil, Lava, **Glitter** (takes the current beat colour, so painting in rhythm leaves rainbow layers), **Seed** (grows on the beat, flowers on the drop), **Speaker** and **Rocket** (launches and bursts into sparks and glitter). Lava and water make obsidian and steam. Fire burns oil and plants.

## Controls

- Paint by dragging. Right-click erases.
- **1–0** pick materials, **E** erase, **[ ]** or scroll wheel change brush size.
- **Space** freezes the world while the music keeps playing. **R** resets the scene. **D** forces a drop.
- **Mix** has sliders for each reaction, glow and beat sensitivity (raise it for a quiet mic), the world detail level (Chunky / Normal / Fine), and Save / Load / Export / Import.

## Audio sources

- **Demo**: a 16-bar loop synthesised in the browser: groove, breakdown and build, drop. The first drop lands about 15 seconds in.
- **File**: pick or drag in any audio file.
- **Mic**: listens to your microphone (localhost or HTTPS only).
- **Tab**: shares a Chrome tab's audio (for example Spotify Web Player or YouTube). Tick **Share tab audio** in the picker.

Audio never leaves the browser.

## Code map

- `src/world.ts`: the grid, free (airborne) particles, cell rules and every music reaction.
- `src/scenes.ts`: Bass Garden, Volcano, Blank, and the grid-size presets.
- `src/detector.ts`: band levels, kick/hat onset detection, BPM and drop detection.
- `src/demoTrack.ts`: the synthesised demo loop.
- `src/audio.ts`: audio sources and the analyser.
- `src/render.ts`: pixel and glow layers, shockwave rings and the brush cursor.
- `src/save.ts`: world save format (v1).
- `src/App.tsx`: the HUD and main loop.

Inspired by DAN-BALL's [Powder Game](https://dan-ball.jp/en/javagame/dust2/).
