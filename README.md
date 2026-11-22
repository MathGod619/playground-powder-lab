# Powder Rave

A full-screen falling-sand world that hears your music. Kicks make the ground jump, speakers blast the dirt around, hi-hats throw sparks, and when the drop hits, everything goes off at once.

## Run it

1. Install Node.js 22.18+ (22.x line) or 24+.
2. `npm install`, then `npm run dev`, and open the URL Vite prints.
3. Hit **DROP THE BEAT** with sound on.

The first time someone plays, the HUD starts trimmed down to seven tools and a three-step **First drop** guide (paint something, plant a bomb, hit DROP). Finishing it, or pressing **Skip**, unlocks everything; **More** in the dock, or picking any other tool by key, shows the full dock early. Players who used the game before the guide existed skip it.

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

## The crowd

Tiny pixel ravers with glow sticks live in every world. They walk the terrain and step up small ledges, bob on every kick (some hop), wave on the hi-hats, and jump and cheer on the drop. Blasts, bombs, fireworks and speakers fling them; a hard landing leaves them dazed for a moment. Buried ravers climb out, ravers that fall in water swim to the surface, and anyone who touches fire or lava vanishes in a puff and walks back in from the edge a few seconds later. On the Moon they float; in Deep Sea they walk the seabed. Turn them off under **Mix → Crowd**.

## Night mode

Press **N**, the moon button in the dock, or **Mix → Lights → Night**. Everything that doesn't glow fades to moonlit blue-black, so only lava, fire, glitter, lit windows, sparks, speakers and the crowd's glow sticks show. Kicks lift the dark a little and the drop flash lights the whole world for a moment. Clips record it the way you see it.

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
- Connect a standard controller over USB or Bluetooth and press **A / Cross** or **Start / Options** with the game tab focused to start. **Y / Triangle** opens the controller menu for worlds, Rave Mode, and the controls guide. Use the **D-pad** or **left stick** to move, **A / Cross** to select, and **B / Circle** to go back.
- Use the **left stick** to aim, the **right stick** for fine aim, **A / Cross** or **RT / R2** to paint, **B / Circle** or **LT / L2** to erase, and the bumpers to cycle tools. **D-pad up/down** changes brush size, **X / Square** triggers a drop, and **Start / Options** freezes or resumes the world. On supported controllers, drops rumble. You can turn rumble off in the controller menu.
- If your browser asks for an audio gesture after a controller start, press **Enter** to enable the demo track.
- Connect a second controller and press a button to join local co-op. Both players share the world and music, with separate colored cursors, tools and brush sizes. Either player can trigger or retry a drop.

## Try another drop

Each manual drop in **Sandbox** saves the world immediately before the impact. Select **Retry the Drop**, press **U**, or press **D-pad left** to restore that setup while the same song keeps playing. Edit the restored setup or drop again to save a new checkpoint. Switching worlds or entering Rave Mode clears the checkpoint.

## Beat brushes

Open **Beat brushes** in the HUD, press **J**, **K** or **L**, or cycle to the beat brushes with the controller bumpers. Hold the paint button and move the brush to aim it. **Kick Sand** pours on kicks, **Hat Glitter** sprays on hi-hats, and **Bar Rocket** launches on the first kick of every group of four. Recorded tracks use the mapped kicks and hats once analysis finishes.

## Drop in your own images

Drag a picture onto the page, paste one (⌘V / Ctrl+V), press **I**, or use the picture button in the dock. A preview follows your pointer: scroll or **[ ]** to resize, then click (or **Enter**) to drop it in. Right-click or **Esc** cancels. **Cut background** removes a plain backdrop from photos; transparent PNGs come in clean either way.

Choose **Full Screen** to center-crop the image across the playfield, then **Place image**. Full-screen previews keep the background by default. On a controller, **Y / Triangle** toggles full-screen placement, **A / Cross** places the image, and **B / Circle** cancels.

Pick what the picture is made of:

- **Statue**: brick in its own colours. Blasts and bombs knock holes in it and anything left hanging crumbles into coloured rubble. In Rave Mode, demolishing it scores.
- **Sand**: holds its shape until the next kick, then the beat shakes it into a pile of its own colours.
- **Elements**: colours become materials. Blue turns to water, strong reds and oranges to lava, green to plants that grow on the beat, white to rain clouds, dark to wall, bright yellow to glitter, and muted tones such as skin and wood to sand.

Images never leave your browser.

## Song-shaped worlds

When an uploaded song finishes mapping, press **Build its world** (or pick **♪ song name** at the top of the world menu). Powder Rave builds a landscape from the song: left to right is the song from start to end, loud sections rise into mountains and quiet breakdowns sink into lakes, every drop becomes a labelled lava crater at the moment it lands, speakers stand where the bass hits hardest, bright hi-hat sections get glitter strata (and busy hi-hats bring rain clouds), slow songs get seeds, and the song's character picks the colours. While it plays, a beam of light walks across the world, so you can watch the song arrive at each drop. **R** rebuilds it.

## Rave Mode

Switch from **Sandbox** to **Rave** for a 90-second round with three drops. The music charges the DROP button; when it reads **DROP!**, press it (or **D**).

In Freestyle, each drop scores for what it does to the world in the next three seconds: bricks demolished, walls smashed into gravel, bombs set off, flowers bloomed and material thrown. Scores are scaled so every detail level is worth the same. Press on the beat for a multiplier: **PERFECT ×2** within 70 ms of a beat, **GREAT ×1.5** within 140 ms. Nothing scores between drops, so use that time to set up: plant bombs, stack brick, sow seeds, place speakers.

Choose **Rave** to pick Freestyle or a challenge. On a controller, open the menu with **Y / Triangle**, then choose **Rave challenges**. A second controller can join at any time. Both players work on the same objective, score, and drop meter.

- **Topple the Skyline** gives you one drop. Place several bombs inside each tower, starting low. The charges stay where you place them and wait for the drop. Topple at least **six of eight towers**. A tower counts when it loses at least 60% of its original bricks during the five seconds after the drop.
- **Keep the Garden Alive** gives you three drops. The challenge card names the beds that will get hit next. Water those beds before the drop and keep at least **six of nine roots** alive after each wave.
- **Boss Drop** gives you four drops to take down a monster stomping across the arena. A shield protects it except for a few seconds after each drop, so plant bombs right beside it: they wait for the drop. Each drop hits it a little, bombs next to it hit hard, and on-beat timing multiplies all of it. Every eighth beat it fights back, either eating the bombs within reach (its mouth glows the beat before) or spitting lava. Kill it before the drops run out.

## Online rave

Open **Online** in the HUD. **Host a rave** opens a room with a 4-letter code; **Copy invite link** gives a link that joins it directly. Up to four people share one world and one beat:

- The host's game runs the world and streams it to everyone about 12 times a second (compressed keyframes plus changed cells, the airborne particles, the crowd and the boss). Keep the host's tab open; it keeps running in the background while music plays.
- Guests paint, plant bombs, use beat brushes and hit **DROP**; their strokes are applied on the host, so everyone sees the same world. Everyone sees everyone's named cursor.
- The host picks the world, the mode and the music. The demo plays in sync for everyone. For an uploaded song, guests drop in the same file and it locks to the host's position; mic and tab audio are heard only on the host's device.
- If the host leaves, the rave ends and guests keep the world.

The relay is `server/rave-relay.mjs` (see `server/README.md`). It forwards messages between the players in a room and stores nothing.

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
- `src/onboarding.ts`: the first-run guide steps and starter tools.
- `src/crowd.ts`: the dancing crowd: movement, beat reactions, blasts and sprites.
- `src/boss.ts`: the Boss Drop monster: shield, damage, attacks and sprite.
- `src/song-world.ts`: builds a world from a mapped song's shape.
- `src/online.ts`, `src/netsync.ts`: online rooms and the world snapshot format; `server/rave-relay.mjs` is the relay.
- `src/App.tsx`: the HUD and main loop.

Inspired by DAN-BALL's [Powder Game](https://dan-ball.jp/en/javagame/dust2/).
