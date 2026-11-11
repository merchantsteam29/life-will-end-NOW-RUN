# LIFE WILL END: NOW RUN

**▶ Play: https://merchantsteam29.github.io/life-will-end-NOW-RUN/**

A first-person parkour shooter in a drowned neon megacity. HALCYON, the AI that runs the flood gates, is drowning the Lower Ring at dawn. You're a courier. Climb the Spire. Don't stop.

- Wall-run, wall-jump, slide, air jump, dash, launch pads, moving platforms.
- One hit kills, both ways. A pistol (6 shots) and a blade that kills up close and sends bullets back when you time it. Focus (hold Q) slows time.
- Six chapters: Last Delivery, Cable Street, The Floodworks, Neon Market, Spire Ascent, and HALCYON (boss).
- Times and S/A/B/C ranks per chapter, chapter select, achievements, ☁ Sync between devices, controller support, installable as an app.

## Code

Plain HTML + ES modules + Three.js 0.160 from a CDN, no build step.

- `js/levels.js`: the chapters, written with a small `Builder` (floor, gap, wallrun, zigzag, climb, arena, slideBar, padWall, mover, enemy, checkpoint, say). Jump budget: a running jump ~8 m, with the air jump ~13 m (3.9 m high), plus dash ~18 m, wall-runs ~16 m.
- `js/player.js`: movement and box collision. `js/enemies.js`: wardens, bullets, the gun / blade / deflect, and the boss. `js/world.js`: level meshes, skyline, water, rain, signs. `js/audio.js`: synthesized sound and music. `js/main.js`: the game.
- Test hook with `?test`: `window.__lw` (`start(id)`, `tp(x, y, z)`, `player`, `enemies`, `Player`), and `window.__lwGod = true` for no deaths.
