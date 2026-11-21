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
| **The drop** | A hard kick after at least 1.7 s with no kick (once a steady beat has been heard). Flash, chromatic glitch, every speaker fires, every plant blooms, every bomb goes off in a chain, lightning strikes from any clouds, and fireworks go up. Press **D** or the DROP button to force one. |

### Songs you upload are mapped first

When you play a file, Powder Rave decodes the whole song and maps its kicks, hi-hats, tempo and drops before reacting (the **MAPPED** badge). Beats then fire exactly on time instead of a moment late, and a **DROP IN 3 · 2 · 1** countdown appears before each drop. Demo, mic and tab audio still react live.

## Materials

Sand, Water, Wall, Fire, Oil, Lava, **Glitter** (takes the current beat colour, so painting in rhythm leaves rainbow layers), **Seed** (grows on the beat, flowers on the drop), **Speaker** and **Rocket** (launches and bursts into sparks and glitter). Lava and water make obsidian and steam. Fire burns oil and plants.

Things that blow up:

- **Bomb** (B): one per click. Counts down 8 beats (the number floats above it), then explodes. Fire, lava or the drop set it off early, and bombs caught in a blast chain-react.
- **Powder** (G): gunpowder. Lay a trail and light it for a fuse that crackles along.
- **Blast** (X): click anywhere to blow it up. Brush size sets the radius.
- **Brick** (C): build with it. Explosions shake the ground, and any brick left with nothing under it crumbles into falling gravel, so towers really collapse.
- **Cloud** (V): rains on hi-hats and throws lightning on the drop (and on very hard kicks).

Explosions smash walls, brick and speakers into gravel and throw everything else clear of the crater.

## Controls

- Paint by dragging. Right-click erases.
- **1–0** pick materials, **C** brick, **G** powder, **B** bomb, **V** cloud, **X** blast, **E** erase, **[ ]** or scroll wheel change brush size.
- **Space** freezes the world while the music keeps playing. **R** resets the scene. **D** forces a drop. **F** (or the ⛶ button in the dock) toggles full screen.
- **Clip** opens a menu: record 10 seconds now, or **Catch the next drop**, which arms a recording that starts during the build-up (or 5 s before a mapped drop) and ends 6 s after the drop, so the clip is built around the drop. When it's done you can watch it, download it (MP4 where the browser supports it, otherwise WebM), or share it.
- The world name at the top left opens the world list.
- **Mix** has sliders for each reaction, atmosphere, glow and beat sensitivity (raise it for a quiet mic), the world detail level (Chunky / Normal / Fine), and Save / Load / Export / Import.

## Drop in your own images

Drag a picture onto the page, paste one (⌘V / Ctrl+V), press **I**, or use the picture button in the dock. A preview follows your pointer: scroll or **[ ]** to resize, then click (or **Enter**) to drop it in. Right-click or **Esc** cancels. **Cut background** removes a plain backdrop from photos; transparent PNGs come in clean either way.

Pick what the picture is made of:

- **Statue**: brick in its own colours. Blasts and bombs knock holes in it and anything left hanging crumbles into coloured rubble. In Rave Mode, demolishing it scores.
- **Sand**: holds its shape until the next kick, then the beat shakes it into a pile of its own colours.
- **Elements**: colours become materials. Blue turns to water, strong reds and oranges to lava, green to plants that grow on the beat, white to rain clouds, dark to wall, bright yellow to glitter, and muted tones such as skin and wood to sand.

Images never leave your browser.

## Rave Mode

Switch from **Sandbox** to **Rave** for a 90-second round with three drops. The music charges the DROP button; when it reads **DROP!**, press it (or **D**).

Each drop scores for what it does to the world in the next three seconds: bricks demolished, walls smashed into gravel, bombs set off, flowers bloomed and material thrown. Scores are scaled so every detail level is worth the same. Press on the beat for a multiplier: **PERFECT ×2** within 70 ms of a beat, **GREAT ×1.5** within 140 ms. Nothing scores between drops, so use that time to set up: plant bombs, stack brick, sow seeds, place speakers.

## Worlds

| World | What's different |
| --- | --- |
| **Bass Garden** | Dunes with glitter layers, a pool, speakers and seeds. |
| **Volcano** | Bass spits lava from the crater. The drop blows the top off the mountain. |
| **Demolition** | A brick skyline wired with charges. Windows flicker on the hi-hats; the drop brings every tower down. |
| **Moon** | About a quarter of normal gravity. Every kick launches dust into slow, floating arcs, and the lander has a surprise in the tank. |
| **Deep Sea** | Thrown material moves *through* water with drag, so speakers blow sand clouds across the seabed. Vents breathe bubbles on the kick, plankton glows on the hi-hats, and kelp grows to the beat. |
| **Storm** | Clouds rain on the hi-hats. On the drop, lightning hunts the forest and sets it alight. |
| **Blank** | A floor and two speakers. |

## Audio sources

- **Demo**: a 16-bar loop synthesised in the browser: groove, breakdown and build, drop. The first drop lands about 15 seconds in.
- **File**: pick or drag in any audio file.
- **Mic**: listens to your microphone (localhost or HTTPS only).
- **Tab**: shares a Chrome tab's audio (for example Spotify Web Player or YouTube). Tick **Share tab audio** in the picker.

Audio never leaves the browser.

## Code map

- `src/world.ts`: the grid, free (airborne) particles, cell rules, explosions and every music reaction.
- `src/scenes.ts`: the seven worlds, each with its own build, physics rules and beat hooks, plus the grid-size presets.
- `src/detector.ts`: live band levels, kick/hat onset detection, BPM, breakdown and drop detection.
- `src/analysis.ts`: offline song mapping (kicks, hats, tempo, drops) and the map player.
- `src/recorder.ts`: clip recording, which recomposes the glow (CSS can't be captured) and adds a watermark.
- `src/demoTrack.ts`: the synthesised demo loop.
- `src/audio.ts`: audio sources and the analyser.
- `src/render.ts`: pixel and glow layers, shockwave rings and the brush cursor.
- `src/save.ts`: world save format (v1).
- `src/App.tsx`: the HUD and main loop.

Inspired by DAN-BALL's [Powder Game](https://dan-ball.jp/en/javagame/dust2/).
