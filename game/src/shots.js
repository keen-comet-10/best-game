// The screenshot scenes behind ?shot=start|play|boss|win. Each one runs the
// real rules forward from a fresh world with a fixed seed, steered by a
// simple autopilot, so the frame is what a real game looks like and the
// same seed always gives the same frame. Later scenes stage the entry
// conditions a screenshot needs (weapon level, shield, a wounded boss) and
// then let the simulation play them out honestly.

import { FIELD, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const IDLE = { moveX: 0, moveY: 0, fire: false, focus: false, bomb: false };

/**
 * A workmanlike pilot: it hovers low, lines up under the nearest threat,
 * fires without pause, and sidesteps any bullet that gets close.
 */
function autopilot(state) {
  const player = state.player;
  if (!player.alive) return IDLE;
  let targetX = FIELD.width / 2;
  let bestDist = Infinity;
  const consider = (x, y) => {
    const d = (x - player.x) * (x - player.x) + (y - player.y) * (y - player.y);
    if (d < bestDist) {
      bestDist = d;
      targetX = x;
    }
  };
  for (const e of state.enemies) if (e.active) consider(e.x, e.y);
  if (state.boss.active) consider(state.boss.x, state.boss.y);

  let moveX = targetX > player.x + 16 ? 1 : targetX < player.x - 16 ? -1 : 0;
  let moveY = 0;
  // Dodge: the nearest incoming bullet inside a small box wins over aiming.
  let threat = null;
  let threatDist = 130 * 130;
  for (const b of state.eBullets) {
    if (!b.active) continue;
    const d = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
    if (d < threatDist) {
      threatDist = d;
      threat = b;
    }
  }
  if (threat) {
    moveX = threat.x <= player.x ? 1 : -1;
    if (player.x < 60) moveX = 1;
    if (player.x > FIELD.width - 60) moveX = -1;
    moveY = threat.y < player.y ? 1 : 0;
  }
  return { moveX, moveY, fire: true, focus: false, bomb: false };
}

function runSteps(world, steps, control) {
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, typeof control === 'function' ? control(world.state) : control, false);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  const state = world.state;

  if (name === 'play') {
    // Mid-campaign: wave 3, Crossfire, with a level-3 cannon and a shield.
    world.startAtWave(2);
    state.player.weapon = 3;
    state.player.shield = true;
    state.player.bombs = 3;
    runSteps(world, 545, autopilot);
    return { screen: SCREEN_PLAY, best: state.score };
  }

  if (name === 'boss') {
    // The Voidmother at a little over half hull, mid spiral-stream attack.
    world.startAtWave(4);
    state.player.weapon = 4;
    state.player.shield = true;
    state.player.bombs = 2;
    state.score = 31400;
    state.boss.hp = 148;
    runSteps(world, 430, autopilot);
    return { screen: SCREEN_PLAY, best: state.score };
  }

  if (name === 'win') {
    // The kill shot itself: the boss starts one volley from death, the
    // autopilot finishes her, and the explosion blooms behind the panel.
    world.startAtWave(4);
    state.player.weapon = 5;
    state.player.shield = true;
    state.player.lives = 2;
    state.score = 39850;
    state.boss.hp = 14;
    let guard = 0;
    while (state.outcome !== 'win' && guard < 1200) {
      world.step(STEP, autopilot(state), false);
      guard += 1;
    }
    for (let i = 0; i < 46; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_WIN, best: state.score };
  }

  // start: the title over a drifting patrol, the ship still docked.
  world.reset();
  state.player.alive = false;
  for (let i = 0; i < 300; i += 1) world.step(STEP, IDLE, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
