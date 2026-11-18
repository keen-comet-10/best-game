// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, game over and victory. Event flags from the world
// drive the sound effects and the screen-reader announcements.
//
// ?seed=N fixes the swarm's pattern. ?shot=start|play|boss|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP, WAVES } from './config.js';
import { createRandom } from './random.js';
import {
  EV_BOMB, EV_BOSS_DOWN, EV_BOSS_START, EV_ENEMY_SHOOT, EV_GAME_OVER,
  EV_KILL, EV_PICKUP, EV_PLAYER_HIT, EV_SHIELD_BREAK, EV_SHOOT,
  EV_WAVE_CLEAR, createWorld,
} from './world.js';
import {
  ACTION_BOMB, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long the final explosion plays before the end panel appears. */
const END_DELAY = 1.0;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio(!shot);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let endTimer = -1;
  let announcedWave = -1;
  let lastShootSound = 0;
  let lastEnemySound = 0;
  const ctrl = { moveX: 0, moveY: 0, fire: false, focus: false, bomb: false };

  world.reset();
  world.state.player.alive = false; // Docked on the title screen.

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.startRun();
    announcedWave = 0;
    endTimer = -1;
    screen = SCREEN_PLAY;
    announce('Wave 1. First Contact. Good hunting, pilot.');
  }

  function finishRun(won) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (won) {
      audio.victory();
      announce(`Victory. The Voidmother is destroyed. Score ${world.state.score}.`);
    } else {
      audio.gameOver();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function playEvents(events) {
    const now = performance.now();
    if (events & EV_SHOOT && now - lastShootSound > 50) {
      lastShootSound = now;
      audio.shoot();
    }
    if (events & EV_ENEMY_SHOOT && now - lastEnemySound > 110) {
      lastEnemySound = now;
      audio.enemyShoot();
    }
    if (events & EV_KILL) audio.explosion(false);
    if (events & EV_BOSS_DOWN) audio.explosion(true);
    if (events & EV_PLAYER_HIT) audio.playerHit();
    if (events & EV_SHIELD_BREAK) {
      audio.powerDown();
      announce('Shield down.');
    }
    if (events & EV_PICKUP) audio.pickup();
    if (events & EV_BOMB) audio.bomb();
    if (events & EV_WAVE_CLEAR) audio.waveClear();
    if (events & EV_BOSS_START) {
      audio.bossAlarm();
      announce('Warning. The Voidmother approaches.');
    }
    if (events & EV_GAME_OVER) announce('Vesper is down.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    ctrl.bomb = (actions & ACTION_BOMB) !== 0;
  }

  function stepPlay() {
    ctrl.moveX = input.moveX();
    ctrl.moveY = input.moveY();
    ctrl.fire = input.firing();
    ctrl.focus = input.focusing();
    const events = world.step(STEP, ctrl, false);
    ctrl.bomb = false;
    playEvents(events);
    if (world.state.wave !== announcedWave) {
      announcedWave = world.state.wave;
      announce(`Wave ${announcedWave + 1}. ${WAVES[announcedWave].name}.`);
    }
    if (world.state.outcome !== null && endTimer < 0) endTimer = END_DELAY;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();

    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, ctrl, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepPlay();
        accumulator -= STEP;
        if (endTimer > 0) {
          endTimer -= STEP;
          if (endTimer <= 0) finishRun(world.state.outcome === 'win');
        }
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      while (accumulator >= STEP) {
        world.stepAmbient(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting the swarm
  // shoot an empty chair.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Void. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
