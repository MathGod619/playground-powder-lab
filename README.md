# PLAYGROUND · Powder Lab

Powder Lab v0.4 is a music-reactive 2D particle playground. The World Library contains editable simulations made from the same eight materials you can paint and erase.

## Run on macOS

1. Install Node.js 22.18 or later in the 22.x line, or Node.js 24 or later. npm comes with Node.js.
2. Unzip the download and open Terminal in the extracted `playground-powder-lab` folder.
3. Run `npm install`, then `npm run dev`.
4. Open the local URL printed by Vite. Press Control-C to stop the server.

Run `npm test` for physics, audio analysis, world behavior, camera, and session tests. Run `npm run build` for the production build, and `npm run preview` to serve that build.

## Worlds and camera

Open **Worlds** to load Volcano, Deep Ocean, Neon City, Sandstorm, or a blank world. Choose Classic (416 × 232), Large (832 × 464), or Huge (1248 × 696). Large Volcano is the starting world. Dense scenes such as Huge Deep Ocean can run slower on some devices. Inactive regions sleep without stopping the rest of the world.

- Volcano sends lava and smoke out of the open crater on bass hits. Water turns lava into stone, and filling the vent can stop an eruption.
- Deep Ocean has opposing upper and lower currents. Bass can disturb the submerged sand.
- Neon City generates short lightning paths on treble hits. Water carries a charge that can ignite nearby oil.
- Sandstorm lifts loose sand with wind. Strong bass hits trigger heavier gusts.

Use the scroll wheel or zoom buttons to zoom. Click the zoom percentage to fit the whole world. Select **Pan** and drag, or drag with the middle mouse button. Use **Fullscreen** to expand the chamber. The brush radius is measured in world cells. Right-click or Control-click erases.

Use **1–8** to pick a material, **E** to erase, **[** and **]** to resize, and **Space** to pause or resume. With the chamber focused, the arrow keys position the brush and **Enter** paints. In Pan mode the arrows pan the view.

## Audio

- **System** requests screen or window audio through the desktop Chrome picker. Select a screen or window and enable **Share audio** when offered. This is the path for playing music in a desktop app. Availability depends on Chrome and macOS. The lab reports a missing audio track and will not switch to your mic.
- **Tab** shares Chrome tab playback. Open Spotify Web Player, YouTube, or another audio tab, choose it in the picker, and enable **Share tab audio**.
- **File** plays a local track. Choose a file and select **Play file**, or try the included **Demo loop**. MP3 or WAV are widely supported.
- **BPM** runs the silent 45–200 BPM simulator.
- **Mic or line input** is optional under System. It uses the Mac’s selected audio input. Capture requires explicit browser permission on localhost or HTTPS.

Use **World intensity** alongside the three band controls to tune the strength of the physics. **Test kick** acts as an independent bass pulse. **FX** controls the visual overlays and **Glow** controls material halos.

Audio stays in the browser. The Screen Capture API may also return a video track. The lab does not display or record video and releases capture when you disconnect or switch sources.

## Sessions

**Save** creates a browser checkpoint. **Load** restores it. The app keeps a separate draft and can reopen saves from earlier Powder Lab versions in the same browser. **Export** and **Import** move edited worlds, camera position, size, and simulation settings as JSON. Audio sources and permissions are not stored. The deployed site and localhost have separate browser storage, so use a JSON file to move a world between them.

Particle painting, wind, and optional visual effects draw inspiration from [DAN-BALL’s Powder Game 2](https://dan-ball.jp/en/javagame/dust2/).
