# best-game

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/keen-comet-10/best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/keen-comet-10/best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Neon Void — Starfall Defence.** A neon vertical-scrolling space shooter that runs entirely offline in a desktop browser. Pilot the starfighter *Vesper* through five waves of the void swarm — Mites, Loom spinners, Bastion gunships, Dart kamikazes and tumbling Shards — then face the **Voidmother**, a boss with aimed fans, radial rings and twin spiral streams that fights harder as her hull fails.

Chain kills to build a combo multiplier (up to ×8), catch falling pods to raise your cannon to level 5, arm a shield, stock screen-clearing bombs and earn extra lives. Every shot, explosion and pickup is synthesised live with WebAudio — there are no audio files — and the action is dressed with particles, shockwaves, screen shake and a parallax starfield.

**Controls:** move with the arrow keys or WASD, fire with Space or the mouse, hold Shift to focus (slow precision movement), drop a bomb with X or right-click, pause with P, mute with M. Win by destroying the Voidmother; lose when Vesper's last life burns. Your best score is kept between visits.

The game is plain static files under `game/` — no build step, no network requests — with its source split by job: `world.js` (rules), `enemies.js` (the swarm and the boss), `render.js` (all drawing and HUD), `particles.js` (effects), `audio.js` (synth sound), `input.js`, `shots.js` (deterministic screenshot scenes) and `main.js` (the loop). `main.ts` at the root packages the entry and writes its `dossier.json`.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 — or serve game/ with any static file server
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=rmz1atyq&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
