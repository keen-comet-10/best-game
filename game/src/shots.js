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
 * A workmanlike pilot: it dodges bullets and hulls first, scoops up any
 * falling pod when the sky is clear, and otherwise hovers on a home row
 * under the nearest enemy, firing without pause.
 */
function autopilot(state) {
  const player = state.player;
  if (!player.alive) return IDLE;

  let threat = null;
  let threatDist = 140 * 140;
  for (const b of state.eBullets) {
    if (!b.active) continue;
    const d = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
    if (d < threatDist) { threatDist = d; threat = b; }
  }
  let body = null;
  let bodyDist = 110 * 110;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
    if (d < bodyDist) { bodyDist = d; body = e; }
  }
  const danger = threat || body;
  if (danger) {
    let moveX = danger.x <= player.x ? 1 : -1;
    if (player.x < 70) moveX = 1;
    if (player.x > FIELD.width - 70) moveX = -1;
    const moveY = danger.y < player.y - 30 ? 1 : danger.y > player.y + 30 ? -1 : 0;
    return { moveX, moveY, fire: true, focus: false, bomb: false };
  }

  let pod = null;
  let podDist = Infinity;
  for (const p of state.powerups) {
    if (!p.active) continue;
    const d = (p.x - player.x) ** 2 + (p.y - player.y) ** 2;
    if (d < podDist) { podDist = d; pod = p; }
  }
  if (pod) {
    return {
      moveX: pod.x > player.x + 12 ? 1 : pod.x < player.x - 12 ? -1 : 0,
      moveY: pod.y > player.y + 12 ? 1 : pod.y < player.y - 12 ? -1 : 0,
      fire: true, focus: false, bomb: false,
    };
  }

  let targetX = FIELD.width / 2;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.y >= player.y) continue;
    const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
    if (d < bestDist) { bestDist = d; targetX = e.x; }
  }
  if (state.boss.active) targetX = state.boss.x;
  const homeY = 600;
  return {
    moveX: targetX > player.x + 14 ? 1 : targetX < player.x - 14 ? -1 : 0,
    moveY: player.y < homeY - 10 ? 1 : player.y > homeY + 10 ? -1 : 0,
    fire: true, focus: false, bomb: false,
  };
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
    // Mid-campaign: wave 4, Swarmfall, at the moment the mite wall crosses
    // the loom line — the densest honest second of the wave.
    world.startAtWave(3);
    state.player.weapon = 3;
    state.player.shield = true;
    state.player.bombs = 3;
    runSteps(world, 940, autopilot);
    return { screen: SCREEN_PLAY, best: state.score };
  }

  if (name === 'boss') {
    // The Voidmother at a little over half hull, mid spiral-stream attack.
    world.startAtWave(4);
    state.player.weapon = 4;
    state.player.shield = true;
    state.player.bombs = 2;
    state.score = 31400;
    state.boss.hp = 235;
    runSteps(world, 430, autopilot);
    return { screen: SCREEN_PLAY, best: state.score };
  }

  if (name === 'win') {
    // The kill shot itself: a full run's tally is staged (score, kills,
    // accuracy, combo, time), the boss starts one volley from death, the
    // autopilot finishes her, and the explosion blooms behind the panel.
    world.startAtWave(4);
    state.player.weapon = 5;
    state.player.shield = true;
    state.player.lives = 2;
    state.score = 24850;
    state.stats.kills = 79;
    state.stats.shots = 640;
    state.stats.hits = 410;
    state.stats.maxCombo = 23;
    state.stats.bombsUsed = 1;
    state.combo.count = 23;
    state.combo.timer = 2.6;
    state.combo.mult = 4;
    state.runTime = 127;
    state.boss.hp = 14;
    let guard = 0;
    while (state.outcome !== 'win' && guard < 1200) {
      world.step(STEP, autopilot(state), false);
      guard += 1;
    }
    for (let i = 0; i < 22; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_WIN, best: state.score };
  }

  // start: the title over a drifting patrol, the ship still docked.
  world.reset();
  state.player.alive = false;
  for (let i = 0; i < 300; i += 1) world.step(STEP, IDLE, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
