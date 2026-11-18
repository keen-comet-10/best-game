// The void swarm: five enemy kinds and the Voidmother boss. This file knows
// how each kind moves and shoots; the world owns the pools, the collisions
// and the score. Spawn scripts live in config.js (WAVES); buildSpawnQueue
// turns one wave's script into timed spawn events.

import { BOSS, FIELD, WAVES } from './config.js';
import { range } from './random.js';

export const ENEMY_STATS = {
  mite: { hp: 1, radius: 14, speed: 122, score: 100 },
  loom: { hp: 3, radius: 16, speed: 76, score: 250 },
  bastion: { hp: 9, radius: 23, speed: 96, score: 500 },
  dart: { hp: 1, radius: 12, speed: 150, score: 200 },
  shard: { hp: 4, radius: 20, speed: 88, score: 150 },
};

const POOL_SIZE = 72;

export function createEnemyPool() {
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    pool.push({
      active: false, kind: 'mite', x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1,
      radius: 14, t: 0, phase: 0, baseX: 0, anchorY: 0, fireTimer: 0,
      burstLeft: 0, burstTimer: 0, dived: false, rot: 0, rotSpeed: 0, score: 0, flash: 0,
    });
  }
  return pool;
}

export function spawnEnemy(pool, kind, x, y, random, waveIndex) {
  for (const e of pool) {
    if (e.active) continue;
    const stats = ENEMY_STATS[kind];
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.baseX = x;
    e.vx = 0;
    e.vy = stats.speed * (1 + 0.05 * waveIndex);
    e.hp = stats.hp;
    e.maxHp = stats.hp;
    e.radius = stats.radius;
    e.score = stats.score;
    e.t = 0;
    e.phase = random() * Math.PI * 2;
    e.fireTimer = range(random, 1.1, 2.4);
    e.burstLeft = 0;
    e.burstTimer = 0;
    e.dived = false;
    e.rot = random() * Math.PI * 2;
    e.rotSpeed = range(random, -1.4, 1.4);
    e.flash = 0;
    e.anchorY = range(random, 130, 235);
    if (kind === 'shard') {
      e.radius = range(random, 16, 27);
      e.vx = range(random, -26, 26);
    }
    return e;
  }
  return null;
}

/** Expand one wave's group script into timed spawn events, sorted by time. */
export function buildSpawnQueue(waveIndex, random) {
  const wave = WAVES[waveIndex];
  const events = [];
  for (const group of wave.groups) {
    for (let i = 0; i < group.count; i += 1) {
      let x;
      if (group.pattern === 'column') x = FIELD.width / 2 + range(random, -140, 140);
      else if (group.pattern === 'vee') x = FIELD.width / 2 + (i - (group.count - 1) / 2) * 92;
      else if (group.pattern === 'walls') x = (i % 2 === 0 ? range(random, 70, 430) : range(random, 850, 1210));
      else x = range(random, 60, FIELD.width - 60);
      events.push({ at: group.at + i * group.gap, kind: group.kind, x, y: -36 - (group.pattern === 'vee' ? Math.abs(i - (group.count - 1) / 2) * 26 : 0) });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return events;
}

function aimAt(e, player, speed) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const len = Math.hypot(dx, dy) || 1;
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}

/**
 * Move and shoot one enemy for one step. `ctx` carries the player, the
 * enemy-bullet spawner and the effects system. Returns false when the enemy
 * has left the field and should be retired without scoring.
 */
export function updateEnemy(e, dt, ctx) {
  e.t += dt;
  if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
  const { player } = ctx;

  if (e.kind === 'mite') {
    e.y += e.vy * dt;
    e.x = e.baseX + Math.sin(e.t * 2.3 + e.phase) * 26;
  } else if (e.kind === 'loom') {
    e.y += e.vy * dt;
    e.x = e.baseX + Math.sin(e.t * 1.15 + e.phase) * 96;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && e.y > 10 && e.y < 400 && player.alive) {
      e.fireTimer = 2.3;
      const shot = aimAt(e, player, 238);
      ctx.fireEnemyBullet(e.x, e.y + 14, shot.vx, shot.vy);
      ctx.onEnemyShoot();
    }
  } else if (e.kind === 'bastion') {
    if (e.y < e.anchorY) {
      e.y += e.vy * dt;
    } else {
      e.x = e.baseX + Math.sin(e.t * 0.7 + e.phase) * 150;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && player.alive) {
        e.fireTimer = 2.7;
        e.burstLeft = 3;
        e.burstTimer = 0;
      }
      if (e.burstLeft > 0) {
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          e.burstTimer = 0.13;
          e.burstLeft -= 1;
          const shot = aimAt(e, player, 262);
          ctx.fireEnemyBullet(e.x, e.y + 18, shot.vx, shot.vy);
          ctx.onEnemyShoot();
        }
      }
    }
  } else if (e.kind === 'dart') {
    if (!e.dived) {
      e.y += e.vy * dt;
      e.x = e.baseX + Math.sin(e.t * 3 + e.phase) * 14;
      if (e.t > 0.75 && player.alive) {
        e.dived = true;
        const shot = aimAt(e, player, 348);
        e.vx = shot.vx;
        e.vy = shot.vy;
      } else if (e.t > 2.2) {
        e.dived = true;
        e.vx = 0;
        e.vy = 300;
      }
    } else {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
  } else if (e.kind === 'shard') {
    e.y += e.vy * dt;
    e.x += e.vx * dt;
    e.rot += e.rotSpeed * dt;
    if (e.x < e.radius) { e.x = e.radius; e.vx = Math.abs(e.vx); }
    if (e.x > FIELD.width - e.radius) { e.x = FIELD.width - e.radius; e.vx = -Math.abs(e.vx); }
  }

  // Off the bottom or far off the sides: gone, no score, no penalty.
  return !(e.y > FIELD.height + 60 || e.x < -90 || e.x > FIELD.width + 90);
}

export function createBoss() {
  return {
    active: false, x: FIELD.width / 2, y: -90, hp: BOSS.maxHp, maxHp: BOSS.maxHp,
    radius: BOSS.radius, t: 0, entered: false, attackTimer: 0, pattern: 0,
    fireTimer: 0, streamAngle: 0, flash: 0,
  };
}

export function launchBoss(boss) {
  boss.active = true;
  boss.x = FIELD.width / 2;
  boss.y = -90;
  boss.hp = BOSS.maxHp;
  boss.maxHp = BOSS.maxHp;
  boss.t = 0;
  boss.entered = false;
  boss.attackTimer = 1.2;
  boss.pattern = 0;
  boss.fireTimer = 0;
  boss.streamAngle = 0;
  boss.flash = 0;
}

/**
 * Move and shoot the boss. She cycles three attacks — aimed fans, radial
 * rings and twin spiral streams — and cycles faster, with wider rings, once
 * her hull drops below a third. Escorts come from the wave's spawn queue.
 */
export function updateBoss(boss, dt, ctx) {
  boss.t += dt;
  if (boss.flash > 0) boss.flash = Math.max(0, boss.flash - dt * 6);
  const { player } = ctx;

  if (!boss.entered) {
    boss.y += 95 * dt;
    if (boss.y >= BOSS.enterY) {
      boss.y = BOSS.enterY;
      boss.entered = true;
    }
    return;
  }

  boss.x = FIELD.width / 2 + Math.sin(boss.t * 0.45) * 305;
  boss.y = BOSS.enterY + Math.sin(boss.t * 0.8) * 24;

  const enraged = boss.hp <= boss.maxHp / 3;
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    boss.attackTimer = enraged ? 1.8 : 2.5;
    boss.pattern = (boss.pattern + 1) % 3;
    boss.fireTimer = 0.25;
  }
  boss.fireTimer -= dt;
  if (boss.fireTimer > 0 || !player.alive) return;

  if (boss.pattern === 0) {
    // Aimed fan: five bullets in a cone at the player, twice per cycle.
    boss.fireTimer = 0.55;
    const shot = aimAt(boss, player, 224);
    const base = Math.atan2(shot.vy, shot.vx);
    for (let i = -2; i <= 2; i += 1) {
      const angle = base + i * 0.16;
      ctx.fireEnemyBullet(boss.x, boss.y + 44, Math.cos(angle) * 224, Math.sin(angle) * 224);
    }
    ctx.onEnemyShoot();
  } else if (boss.pattern === 1) {
    // Radial ring with a gap aimed away from the player, so it can be read.
    boss.fireTimer = 1.05;
    const count = enraged ? 20 : 16;
    const gap = Math.atan2(player.y - boss.y, player.x - boss.x);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + boss.t * 0.4;
      if (Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap))) < 0.3) continue;
      ctx.fireEnemyBullet(boss.x, boss.y, Math.cos(angle) * 178, Math.sin(angle) * 178);
    }
    ctx.onEnemyShoot();
  } else {
    // Twin spiral streams from the wing guns.
    boss.fireTimer = 0.11;
    boss.streamAngle += 0.42;
    for (const side of [-1, 1]) {
      const angle = boss.streamAngle * side + (side < 0 ? 0 : Math.PI);
      ctx.fireEnemyBullet(boss.x + side * 46, boss.y + 26, Math.cos(angle) * 205, Math.sin(angle) * 205 + 60);
    }
  }
}
