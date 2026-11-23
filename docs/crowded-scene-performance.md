# Crowded-scene optimization proposal

Baseline: GitHub main `75f37e57979bc787963a39df60eecb3971f93537`.
Candidate: local branch `codex/optimize-crowded-scenes`, November 23, 2026.
Approved for publication by Anthony on November 23, 2026. Measurements below were recorded before publication.

## Changes

- `src/world.ts`: a completely enclosed liquid cell skips redundant movement checks. The shortcut checks its neighbors again every tick and consumes the same random draws as the original algorithm, preserving simulation order and seeded behavior. Drains and heavier material still take effect immediately.
- `src/world.ts`: calculate the shared wind once per particle update, rather than once per airborne particle.
- `src/render.ts`: calculate animated seed colors once per occupied column per draw. Previously each growing plant cell repeated the same sine and HSL conversion. The cache resets every draw, including paused and online frames where music energy can change without a simulation tick.
- Added focused regression tests, reproducible CPU benchmarks, and a separate before/after behavior comparison script.

## Verification

- Production build passes (`npm run build`).
- Full suite: 142 passed, 14 failed. The unchanged baseline has the same 14 failures (132 passed before the 10 new tests). These are Director and multiplayer server tests blocked by `listen EPERM` on `127.0.0.1` in this execution environment.
- All 10 new tests pass. Nine compare the optimized flow against the original algorithm for water, oil, and lava at three slosh strengths over 300 ticks. They open a drain, add gravel, trigger kicks and a blast, and compare all grid and particle arrays and the random generator state. One checks exact plant colors and glow output as frames and music energy change.
- All eight built-in worlds match the baseline exactly after 420 ticks with a crowd, sustained music energy, kicks, hats, and a drop. SHA-256 comparisons include grid and particle buffers, crowd, rings, bolts, bursts, fuses, pulse state, and the RNG state. Existing physics, challenge, crowd, boss, and song-world terrain-retention tests also pass.

## Measured CPU work

Three matched samples per scene. Times below are medians of CPU milliseconds per measured frame, including physics, reactions, and pixel-buffer rendering. The reduction range compares the two versions within each sample, which better accounts for varying machine load than dividing the separate medians. Raw samples: `benchmarks/crowded-results-2026-11-23.json`.

| Stress scene | Baseline ms/frame | Candidate ms/frame | Paired CPU change across samples |
| --- | ---: | ---: | --- |
| Deep Sea | 14.14 | 11.14 | +14.6% to +21.7% reduction |
| Song World | 4.28 | 4.79 | -23.2% to +0.6% reduction |
| Demolition | 5.46 | 5.57 | -30.6% to +16.6% reduction |
| Dense sand/glitter | 8.94 | 8.19 | +0.4% to +13.5% reduction |
| Dense growing plants | 24.85 | 5.50 | +77.7% to +78.2% reduction |
| Initially 12,000 sparks | 2.48 | 2.08 | -0.8% to +15.9% reduction |

Positive reductions mean less CPU work; negative reductions mean more. Dense growing plants show the largest repeatable improvement (about 78% overall, with median pixel rendering falling from 22.04 ms to 3.58 ms). Deep Sea improves in all three matched samples. Song World and Demolition are variable and do not establish a consistent speedup or regression; avoid interpreting this as a universal frame-rate gain. Airborne sparks and powders show smaller gains with some sample variability.

## Reproduce

Requires a supported Node version (tested with Node 24.22.0).

```sh
npm ci
npm run build
node --test tests/performance.test.mjs
npm test
npm run benchmark:cpu
```

To compare against a separate baseline checkout:

```sh
node benchmarks/crowded.mjs /path/to/baseline .
node benchmarks/compare-behavior.mjs /path/to/baseline .
```

CPU benchmarks use 568 × 317 cells (180,056, approximately the Fine setting), a crowd, music reactions, night shading, and a drop. Fixtures cover Deep Sea, Song World, Demolition, dense sand/glitter, dense growing plants, and an initial 12,000 airborne sparks. Each of three samples warms up for 60 ticks and measures 180 frames. Versions are interleaved every frame with alternating execution order.

Canvas upload methods are stubbed, so timings measure simulation, reactions, and pixel-buffer rendering only. They exclude canvas upload, CSS blur, browser compositing, React, recording, and networking; these results are not browser FPS measurements. Browser playtesting remains necessary, particularly on devices limited by GPU effects.
