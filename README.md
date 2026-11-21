# PLAYGROUND · Powder Lab

PLAYGROUND v0.3 is a React, TypeScript, and Vite falling-sand sandbox with live audio analysis. The chamber runs on a dedicated 2D cellular-automata engine and renders its particles with Canvas 2D.

## Run on macOS

1. Install Node.js 22.18 or later in the 22.x line, or Node.js 24 or later. npm comes with Node.js.
2. Unzip the download and open a Terminal window in the extracted `playground-powder-lab` folder. You can type `cd ` with a trailing space, drag the folder onto Terminal, then press Return.
3. Run:

   ```sh
   npm install
   npm run dev
   ```

4. Open the local address Vite prints, usually [http://localhost:5173/](http://localhost:5173/). Press Control-C in Terminal to stop the server.

Run `npm test` for the physics, audio analysis, beat, and save/load tests. Run `npm run build` to type-check and produce `dist/`. Run `npm run preview` to serve that build locally.

## Play

- Choose sand, water, fire, stone, oil, lava, smoke, or electricity and drag in the chamber. Hold down to keep pouring while it runs. Use Erase, right-click, or Control-click to remove particles.
- Change the brush radius with the slider. Pause lets you draw while the physics is frozen. Reset clears the chamber. Demo brings back the starter terrain.
- Oil floats on water and catches fire. Water quenches fire and cools lava into stone. Electricity passes through water as a short-lived charge and can ignite oil.
- Grid, FX, and Glow are visual switches. FX shows the shockwave and wind. Glow adds a halo around hot, charged, and water-surface pixels. The beat controls change the forces themselves.
- Use **1–8** to pick a material, **E** to erase, **[** and **]** to resize, and **Space** to pause or resume. Focus the chamber with Tab, use arrow keys to position the brush, and press **Enter** to paint.

## Audio sources

- **BPM** runs the original silent 45–200 BPM simulator.
- **File** plays a local audio track. Choose the file and press **Play file**. Format support depends on the browser. MP3 or WAV are good starting points. Choose **Demo loop** to hear the included drum and synth loop through the same analyzer.
- **Mic** uses the Mac’s default audio input. For a USB interface or virtual loopback, select it in macOS **System Settings → Sound → Input** before you connect. Live input is analyzed without speaker monitoring. Microphone access requires browser permission on localhost or HTTPS.
- **Share** uses the browser’s share picker. In desktop Chrome, pick the tab playing music and enable **Share tab audio**. Other system or window audio choices depend on the browser and macOS. The browser may also grant a video track for the sharing session. The lab leaves that track unused and releases the session when you disconnect.

The spectrum shows the signal from the selected real source. Bass impulses lift water and loose grains. Midrange attacks drive alternating wind, and treble attacks create sparks. Use the master switch, reaction switches, and sensitivity sliders to tune the physics. **Test kick** fires a manual bass pulse.

Click **Disconnect** or switch sources to stop playback or release a capture. Audio analysis stays in the browser. The app does not upload or record audio, and it does not reconnect microphones or shares automatically. Keep the lab visible to see the live reactions.

## Sessions

- **Save** creates a checkpoint in this browser. **Load** restores that checkpoint. The lab also maintains a separate working draft and reopens it on refresh.
- **Export** downloads a JSON file containing the particles, beat timing, and settings. **Import** checks the file before replacing the chamber. Exports are portable across browsers and computers. Sessions from the previous Powder Lab build still open. Files, live sources, and permissions are separate from saves.
- Browser storage is specific to the local address and port. Export a JSON file for a durable copy. Older Canvas Lab shape and connection saves still use the original Phase 1 app.

Particle painting, wind, and the optional visual effects draw inspiration from [DAN-BALL’s Powder Game 2](https://dan-ball.jp/en/javagame/dust2/).
