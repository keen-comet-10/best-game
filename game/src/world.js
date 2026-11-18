// Neon Void's rules and state, with no drawing and no browser in it: the
// player ship, the swarm, both bullet pools, power-ups, the combo counter,
// waves and the boss. step() advances one fixed step and returns what
// happened as bit flags, so the caller can add sound and screens without
// the world knowing about them. Pools are allocated once, at boot.

import {
  BOSS, COMBO, DROP_CHANCE, FIELD, PLAYER, PLAYER_BULLET_SPEED,
  RAPID_INTERVAL_SCALE, RAPID_SECONDS, WAVES, WEAPON_INTERVALS,
} from './config.js';
import { createEffects } from './particles.js';
import {
  buildSpawnQueue, createBoss, createEnemyPool, launchBoss,
  spawnEnemy, updateBoss, updateEnemy,
} from './enemies.js';
import { range } from './random.js';

export const EV_KILL = 1;
export const EV_PLAYER_HIT = 2;
export const EV_PLAYER_DOWN = 4;
export const EV_PICKUP = 8;
export const EV_BOMB = 16;
export const EV_WAVE_CLEAR = 32;
export const EV_BOSS_DOWN = 64;
export const EV_GAME_OVER = 128;
export const EV_SHOOT = 256;
export const EV_ENEMY_SHOOT = 512;
export const EV_WAVE_START = 1024;
export const EV_BOSS_START = 2048;
export const EV_SHIELD_BREAK = 4096;

const KIND_COLORS = { mite: '#ff3d7f', loom: '#b26bff', bastion: '#ffb347', dart: '#ff5252', shard: '#9aa7c7' };

function makePool(size, make) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(make());
  return pool;
}

export function createWorld(random) {
  const fx = createEffects(random);
  const enemies = createEnemyPool();
  const boss = createBoss();
  const pBullets = makePool(260, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0 }));
  const eBullets = makePool(340, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 5 }));
  const powerups = makePool(24, () => ({ active: false, kind: 'weapon', x: 0, y: 0, vy: 0, t: 0, baseX: 0 }));

  const player = {
    x: FIELD.width / 2, y: FIELD.height - 96, alive: true, lives: PLAYER.lives,
    invuln: 0, respawnTimer: 0, weapon: 1, rapidTimer: 0, shield: false,
    bombs: PLAYER.startBombs, fireTimer: 0,
  };
  const state = {
    player, enemies, boss, pBullets, eBullets, powerups, fx,
    score: 0, wave: 0, waveTime: 0, spawnQueue: [], time: 0, runTime: 0,
    combo: { count: 0, timer: 0, mult: 1 },
    stats: { kills: 0, shots: 0, hits: 0, maxCombo: 0, bombsUsed: 0 },
    outcome: null, flash: 0, titleTimer: 0,
  };

  const enemyCtx = {
    player,
    fireEnemyBullet(x, y, vx, vy) {
      for (const b of eBullets) {
        if (b.active) continue;
        b.active = true;
        b.x = x;
        b.y = y;
        b.vx = vx;
        b.vy = vy;
        return;
      }
    },
    onEnemyShoot() {
      state.pendingEvents |= EV_ENEMY_SHOOT;
    },
  };
  state.pendingEvents = 0;

  function beginWave(index) {
    state.wave = index;
    state.waveTime = 0;
    state.bossLaunched = false;
    state.spawnQueue = buildSpawnQueue(index, random);
    if (WAVES[index].boss) state.pendingEvents |= EV_BOSS_START;
    state.pendingEvents |= EV_WAVE_START;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height - 96;
    player.alive = true;
    player.lives = PLAYER.lives;
    player.invuln = 0;
    player.respawnTimer = 0;
    player.weapon = 1;
    player.rapidTimer = 0;
    player.shield = false;
    player.bombs = PLAYER.startBombs;
    player.fireTimer = 0;
    for (const e of enemies) e.active = false;
    for (const b of pBullets) b.active = false;
    for (const b of eBullets) b.active = false;
    for (const p of powerups) p.active = false;
    boss.active = false;
    state.score = 0;
    state.wave = 0;
    state.waveTime = 0;
    state.spawnQueue = [];
    state.runTime = 0;
    state.combo.count = 0;
    state.combo.timer = 0;
    state.combo.mult = 1;
    state.stats.kills = 0;
    state.stats.shots = 0;
    state.stats.hits = 0;
    state.stats.maxCombo = 0;
    state.stats.bombsUsed = 0;
    state.outcome = null;
    state.flash = 0;
    state.bossLaunched = false;
    state.titleTimer = 0;
    state.pendingEvents = 0;
    fx.clear();
  }

  function startRun() {
    reset();
    beginWave(0);
  }

  /** Jump straight to a wave (screenshot scenes and practice starts). */
  function startAtWave(index) {
    reset();
    beginWave(index);
    if (WAVES[index].boss) {
      launchBoss(boss);
      state.bossLaunched = true;
    }
  }

  function firePlayerBullet(x, y, vx, vy) {
    for (const b of pBullets) {
      if (b.active) continue;
      b.active = true;
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
      return;
    }
  }

  function playerShoot() {
    const { x, y } = player;
    const top = y - 18;
    const level = player.weapon;
    state.stats.shots += 1; // One "shot" per volley, however many bolts it holds.
    if (level === 1) {
      firePlayerBullet(x, top, 0, -PLAYER_BULLET_SPEED);
    } else if (level === 2) {
      firePlayerBullet(x - 8, top + 4, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x + 8, top + 4, 0, -PLAYER_BULLET_SPEED);
    } else if (level === 3) {
      firePlayerBullet(x, top, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x - 11, top + 6, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x + 11, top + 6, 0, -PLAYER_BULLET_SPEED);
    } else if (level === 4) {
      firePlayerBullet(x, top, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x - 11, top + 6, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x + 11, top + 6, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x - 6, top + 4, -PLAYER_BULLET_SPEED * 0.1, -PLAYER_BULLET_SPEED * 0.99);
      firePlayerBullet(x + 6, top + 4, PLAYER_BULLET_SPEED * 0.1, -PLAYER_BULLET_SPEED * 0.99);
    } else {
      firePlayerBullet(x, top, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x - 11, top + 6, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x + 11, top + 6, 0, -PLAYER_BULLET_SPEED);
      firePlayerBullet(x - 7, top + 4, -PLAYER_BULLET_SPEED * 0.14, -PLAYER_BULLET_SPEED * 0.99);
      firePlayerBullet(x + 7, top + 4, PLAYER_BULLET_SPEED * 0.14, -PLAYER_BULLET_SPEED * 0.99);
      firePlayerBullet(x - 4, top + 6, -PLAYER_BULLET_SPEED * 0.27, -PLAYER_BULLET_SPEED * 0.96);
      firePlayerBullet(x + 4, top + 6, PLAYER_BULLET_SPEED * 0.27, -PLAYER_BULLET_SPEED * 0.96);
    }
    fx.flash(player.x, player.y - 20, '#8ff8ff', 1);
  }

  function dropPowerup(x, y, guaranteed) {
    if (!guaranteed && random() >= DROP_CHANCE) return;
    for (const p of powerups) {
      if (p.active) continue;
      const roll = random();
      let kind = 'weapon';
      if (roll >= 0.86 && player.lives < PLAYER.lives + 1) kind = 'life';
      else if (roll >= 0.68) kind = 'rapid';
      else if (roll >= 0.46) kind = 'bomb';
      else if (roll >= 0.24) kind = 'shield';
      p.active = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.baseX = x;
      p.vy = 118;
      p.t = 0;
      return;
    }
  }

  function addScore(base, x, y) {
    const gained = base * state.combo.mult;
    state.score += gained;
    if (base >= 250) fx.text(x, y - 10, `+${gained}`, '#ffd166', 17);
  }

  function registerKill() {
    state.combo.count += 1;
    state.combo.timer = COMBO.windowSeconds;
    state.combo.mult = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo.count / COMBO.killsPerStep));
    if (state.combo.count > state.stats.maxCombo) state.stats.maxCombo = state.combo.count;
    if (state.combo.count % 15 === 0) {
      fx.text(player.x, player.y - 52, `COMBO x${state.combo.mult}`, '#ffd166', 24);
    }
  }

  function killEnemy(e, events) {
    e.active = false;
    state.stats.kills += 1;
    registerKill();
    addScore(e.score, e.x, e.y);
    const big = e.kind === 'bastion';
    fx.explosion(e.x, e.y, KIND_COLORS[e.kind], big ? 26 : 15, big ? 320 : 240);
    if (big) fx.addShake(5);
    dropPowerup(e.x, e.y, e.kind === 'bastion');
    return events | EV_KILL;
  }

  function hurtPlayer(events) {
    if (player.shield) {
      player.shield = false;
      player.invuln = Math.max(player.invuln, 0.8);
      fx.shockwave(player.x, player.y, '#57c7ff', 380, 3);
      fx.text(player.x, player.y - 34, 'SHIELD DOWN', '#57c7ff', 18);
      return events | EV_SHIELD_BREAK;
    }
    player.lives -= 1;
    player.alive = false;
    player.respawnTimer = PLAYER.respawnSeconds;
    player.weapon = Math.max(1, player.weapon - 1);
    player.rapidTimer = 0;
    state.combo.count = 0;
    state.combo.mult = 1;
    state.combo.timer = 0;
    fx.explosion(player.x, player.y, '#3df3ff', 30, 340);
    fx.shockwave(player.x, player.y, '#3df3ff', 480, 4);
    fx.addShake(11);
    events |= EV_PLAYER_HIT;
    if (player.lives <= 0) {
      state.outcome = 'over';
      events |= EV_PLAYER_DOWN | EV_GAME_OVER;
    }
    return events;
  }

  function useBomb(events) {
    player.bombs -= 1;
    state.stats.bombsUsed += 1;
    state.flash = 0.4;
    fx.addShake(14);
    fx.shockwave(player.x, player.y, '#ffd166', 900, 6);
    fx.shockwave(player.x, player.y, '#3df3ff', 650, 4);
    for (const b of eBullets) {
      if (!b.active) continue;
      b.active = false;
      fx.sparks(b.x, b.y, '#ff5d8f', 2);
      state.score += 2;
    }
    for (const e of enemies) {
      if (!e.active) continue;
      e.hp -= 24;
      e.flash = 1;
      if (e.hp <= 0) events = killEnemy(e, events);
    }
    if (boss.active) {
      boss.hp -= 30;
      boss.flash = 1;
      if (boss.hp <= 0) events = bossDown(events);
    }
    return events | EV_BOMB;
  }

  function bossDown(events) {
    boss.active = false;
    state.stats.kills += 1;
    registerKill();
    addScore(BOSS.score, boss.x, boss.y);
    fx.explosion(boss.x, boss.y, '#ff2e88', 70, 460);
    fx.explosion(boss.x - 40, boss.y + 10, '#ffd166', 40, 360);
    fx.explosion(boss.x + 42, boss.y - 6, '#3df3ff', 40, 360);
    fx.shockwave(boss.x, boss.y, '#ff2e88', 950, 7);
    fx.addShake(16);
    state.flash = 0.5;
    for (const b of eBullets) b.active = false;
    state.outcome = 'win';
    return events | EV_BOSS_DOWN | EV_KILL;
  }

  function applyPowerup(kind) {
    if (kind === 'weapon') {
      if (player.weapon < 5) {
        player.weapon += 1;
        fx.text(player.x, player.y - 36, `WEAPON LV ${player.weapon}`, '#52ffa8', 20);
      } else {
        state.score += 500;
        fx.text(player.x, player.y - 36, '+500 MAX WEAPON', '#52ffa8', 18);
      }
    } else if (kind === 'shield') {
      if (!player.shield) {
        player.shield = true;
        fx.text(player.x, player.y - 36, 'SHIELD ONLINE', '#57c7ff', 20);
      } else {
        state.score += 300;
        fx.text(player.x, player.y - 36, '+300', '#57c7ff', 18);
      }
    } else if (kind === 'bomb') {
      player.bombs = Math.min(PLAYER.maxBombs, player.bombs + 1);
      fx.text(player.x, player.y - 36, '+1 BOMB', '#ffd166', 20);
    } else if (kind === 'rapid') {
      player.rapidTimer = RAPID_SECONDS;
      fx.text(player.x, player.y - 36, 'RAPID FIRE', '#ff9ff3', 20);
    } else if (kind === 'life') {
      player.lives = Math.min(PLAYER.lives + 2, player.lives + 1);
      fx.text(player.x, player.y - 36, '+1 LIFE', '#52ffa8', 20);
    }
  }

  /**
   * One fixed step. `ctrl` is { moveX, moveY, fire, focus, bomb } with the
   * axes at -1, 0 or 1. With `harmless` set (the title backdrop) decorative
   * ships drift through and nothing can be hurt.
   */
  function step(dt, ctrl, harmless = false) {
    let events = state.pendingEvents;
    state.pendingEvents = 0;
    state.time += dt;
    fx.step(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

    if (harmless) {
      state.titleTimer -= dt;
      if (state.titleTimer <= 0) {
        state.titleTimer = 0.85;
        spawnEnemy(enemies, random() < 0.25 ? 'loom' : 'mite', range(random, 70, FIELD.width - 70), -36, random, 0);
      }
      for (const e of enemies) {
        if (e.active && !updateEnemy(e, dt, { player: { x: -9999, y: -9999, alive: false }, fireEnemyBullet: () => {}, onEnemyShoot: () => {} })) e.active = false;
      }
      return events;
    }

    state.runTime += dt;
    state.waveTime += dt;

    // Spawning: the wave's queue, then the boss once her warning has played.
    while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveTime) {
      const next = state.spawnQueue.shift();
      spawnEnemy(enemies, next.kind, next.x, next.y, random, state.wave);
    }
    if (WAVES[state.wave].boss && !boss.active && state.outcome === null && state.waveTime >= 1.4 && !state.bossLaunched) {
      state.bossLaunched = true;
      launchBoss(boss);
    }

    // Player.
    if (!player.alive && state.outcome === null) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0 && player.lives > 0) {
        player.alive = true;
        player.x = FIELD.width / 2;
        player.y = FIELD.height - 96;
        player.invuln = PLAYER.invulnerableSeconds;
      }
    }
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (player.rapidTimer > 0) player.rapidTimer = Math.max(0, player.rapidTimer - dt);
    if (player.alive) {
      const speed = ctrl.focus ? PLAYER.focusSpeed : PLAYER.speed;
      const len = Math.hypot(ctrl.moveX, ctrl.moveY) || 1;
      player.x += (ctrl.moveX / len) * speed * dt;
      player.y += (ctrl.moveY / len) * speed * dt;
      player.x = Math.min(FIELD.width - 24, Math.max(24, player.x));
      player.y = Math.min(FIELD.height - 26, Math.max(210, player.y));
      fx.trail(player.x - 5, player.y + 18, '#2de2ff');
      fx.trail(player.x + 5, player.y + 18, '#2de2ff');
      player.fireTimer -= dt;
      if (ctrl.fire) {
        const interval = WEAPON_INTERVALS[player.weapon - 1] * (player.rapidTimer > 0 ? RAPID_INTERVAL_SCALE : 1);
        while (player.fireTimer <= 0) {
          playerShoot();
          player.fireTimer += interval;
          events |= EV_SHOOT;
        }
      } else if (player.fireTimer < 0) {
        player.fireTimer = 0;
      }
      if (ctrl.bomb && player.bombs > 0) events = useBomb(events);
    }

    // Combo decay.
    if (state.combo.timer > 0) {
      state.combo.timer -= dt;
      if (state.combo.timer <= 0) {
        state.combo.count = 0;
        state.combo.mult = 1;
      }
    }

    // Enemies and the boss.
    for (const e of enemies) {
      if (!e.active) continue;
      if (!updateEnemy(e, dt, enemyCtx)) e.active = false;
    }
    if (boss.active) updateBoss(boss, dt, enemyCtx);

    // Player bullets.
    for (const b of pBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -24 || b.x < -24 || b.x > FIELD.width + 24) { b.active = false; continue; }
      let consumed = false;
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        if (dx * dx + dy * dy > (e.radius + 5) * (e.radius + 5)) continue;
        b.active = false;
        consumed = true;
        state.stats.hits += 1;
        e.hp -= 1;
        e.flash = 1;
        fx.sparks(b.x, b.y, '#eaffff', 3);
        if (e.hp <= 0) events = killEnemy(e, events);
        break;
      }
      if (consumed || !boss.active) continue;
      const dx = b.x - boss.x;
      const dy = b.y - boss.y;
      if (dx * dx + dy * dy <= (boss.radius + 5) * (boss.radius + 5)) {
        b.active = false;
        state.stats.hits += 1;
        boss.hp -= 1;
        boss.flash = 1;
        fx.sparks(b.x, b.y, '#ffd166', 3);
        if (boss.hp <= 0) events = bossDown(events);
      }
    }

    // Enemy bullets.
    for (const b of eBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -30 || b.y > FIELD.height + 30 || b.x < -30 || b.x > FIELD.width + 30) { b.active = false; continue; }
      if (!player.alive || player.invuln > 0 || state.outcome !== null) continue;
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      if (dx * dx + dy * dy <= (PLAYER.radius + b.radius - 2) * (PLAYER.radius + b.radius - 2)) {
        b.active = false;
        events = hurtPlayer(events);
      }
    }

    // Ramming.
    if (player.alive && player.invuln === 0 && state.outcome === null) {
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        if (dx * dx + dy * dy > (e.radius + PLAYER.radius - 4) * (e.radius + PLAYER.radius - 4)) continue;
        events = killEnemy(e, events);
        events = hurtPlayer(events);
        break;
      }
      if (player.alive && boss.active) {
        const dx = boss.x - player.x;
        const dy = boss.y - player.y;
        if (dx * dx + dy * dy <= (boss.radius + PLAYER.radius - 6) * (boss.radius + PLAYER.radius - 6)) {
          events = hurtPlayer(events);
        }
      }
    }

    // Power-ups: fall, sway, drift toward a near player, collect on touch.
    for (const p of powerups) {
      if (!p.active) continue;
      p.t += dt;
      p.y += p.vy * dt;
      p.x = p.baseX + Math.sin(p.t * 2.1) * 14;
      if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 110 && dist > 1) {
          p.x += (dx / dist) * 240 * dt;
          p.baseX = p.x;
          p.y += (dy / dist) * 240 * dt;
        }
        if (dist < PLAYER.radius + 17) {
          p.active = false;
          applyPowerup(p.kind);
          fx.explosion(p.x, p.y, '#52ffa8', 8, 130);
          events |= EV_PICKUP;
          continue;
        }
      }
      if (p.y > FIELD.height + 26) p.active = false;
    }

    // Wave flow: a wave ends when its queue is spent and the sky is clear.
    if (state.outcome === null && state.spawnQueue.length === 0 && !boss.active) {
      let anyEnemy = false;
      for (const e of enemies) if (e.active) { anyEnemy = true; break; }
      if (!anyEnemy && !WAVES[state.wave].boss) {
        if (state.wave < WAVES.length - 1) {
          events |= EV_WAVE_CLEAR;
          state.score += 250;
          beginWave(state.wave + 1);
          if (WAVES[state.wave].boss) state.bossLaunched = false;
        }
      }
    }

    return events;
  }

  /** Keep the backdrop alive behind the end screens: effects and drifting wrecks. */
  function stepAmbient(dt) {
    state.time += dt;
    fx.step(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    for (const b of pBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -24) b.active = false;
    }
    for (const b of eBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > FIELD.height + 30 || b.y < -30) b.active = false;
    }
  }

  reset();
  return { state, reset, startRun, startAtWave, step, stepAmbient };
}
