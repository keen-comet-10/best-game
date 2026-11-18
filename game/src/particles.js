// Particles, floating score text and shockwaves: the juice layer. Pools are
// allocated once at boot and recycled, so a busy dogfight allocates nothing.
// The world owns one effects system and steps it with the simulation; the
// renderer only reads the pools and paints them.

import { range } from './random.js';

const MAX_PARTICLES = 420;
const MAX_TEXTS = 28;
const MAX_WAVES = 10;

export function createEffects(random) {
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 1, gravity: 0, glow: false });
  }
  const texts = [];
  for (let i = 0; i < MAX_TEXTS; i += 1) {
    texts.push({ active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, value: '', color: '#ffffff', size: 18 });
  }
  const waves = [];
  for (let i = 0; i < MAX_WAVES; i += 1) {
    waves.push({ active: false, x: 0, y: 0, radius: 0, speed: 0, life: 0, maxLife: 1, color: '#ffffff', width: 3 });
  }
  let shake = 0;

  function freeParticle() {
    for (const p of particles) if (!p.active) return p;
    return null;
  }

  function spawn(x, y, vx, vy, life, size, color, options = {}) {
    const p = freeParticle();
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.drag = options.drag ?? 1;
    p.gravity = options.gravity ?? 0;
    p.glow = options.glow ?? false;
  }

  return {
    particles,
    texts,
    waves,

    /** A radial burst of sparks, the workhorse explosion. */
    explosion(x, y, color, count = 16, power = 260) {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const speed = range(random, power * 0.25, power);
        spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          range(random, 0.3, 0.8), range(random, 1.5, 3.4), color, { drag: 0.9, glow: true });
      }
      // A few slow embers that hang in the air after the flash.
      for (let i = 0; i < Math.floor(count / 3); i += 1) {
        const angle = random() * Math.PI * 2;
        const speed = range(random, 20, 80);
        spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          range(random, 0.8, 1.5), range(random, 2, 4.5), '#ffd166', { drag: 0.98, glow: true });
      }
    },

    /** A tight white-hot core flash for the centre of a big explosion. */
    flash(x, y, color, count = 8) {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const speed = range(random, 30, 130);
        spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          range(random, 0.12, 0.3), range(random, 3, 6), color, { glow: true });
      }
    },

    /** Engine exhaust: one small fading dot behind the ship. */
    trail(x, y, color) {
      spawn(x + range(random, -3, 3), y, range(random, -14, 14), range(random, 90, 150),
        range(random, 0.22, 0.4), range(random, 1.6, 3), color, { drag: 0.96 });
    },

    /** Sparks knocked off a hull by a bullet that did not kill. */
    sparks(x, y, color, count = 4) {
      for (let i = 0; i < count; i += 1) {
        const angle = range(random, Math.PI * 0.15, Math.PI * 0.85);
        const speed = range(random, 90, 260);
        spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
          range(random, 0.15, 0.35), range(random, 1.2, 2.4), color, { glow: true });
      }
    },

    /** A ring that expands and fades: bomb blasts and boss deaths. */
    shockwave(x, y, color, speed = 620, width = 4) {
      for (const w of waves) {
        if (w.active) continue;
        w.active = true;
        w.x = x;
        w.y = y;
        w.radius = 8;
        w.speed = speed;
        w.life = 0.55;
        w.maxLife = 0.55;
        w.color = color;
        w.width = width;
        return;
      }
    },

    /** Floating score or notice text that rises and fades. */
    text(x, y, value, color = '#eaf6ff', size = 18) {
      let slot = null;
      for (const t of texts) if (!t.active) { slot = t; break; }
      if (!slot) slot = texts[0];
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vy = -56;
      slot.life = 0.95;
      slot.maxLife = 0.95;
      slot.value = value;
      slot.color = color;
      slot.size = size;
    },

    /** Add screen shake (in pixels of maximum offset); the largest wins. */
    addShake(amount) {
      shake = Math.min(16, Math.max(shake, amount));
    },
    shakeAmount() {
      return shake;
    },

    step(dt) {
      for (const p of particles) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        const drag = Math.pow(p.drag, dt * 60);
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const t of texts) {
        if (!t.active) continue;
        t.life -= dt;
        if (t.life <= 0) { t.active = false; continue; }
        t.y += t.vy * dt;
      }
      for (const w of waves) {
        if (!w.active) continue;
        w.life -= dt;
        if (w.life <= 0) { w.active = false; continue; }
        w.radius += w.speed * dt;
      }
      shake = Math.max(0, shake - dt * 26);
    },

    clear() {
      for (const p of particles) p.active = false;
      for (const t of texts) t.active = false;
      for (const w of waves) w.active = false;
      shake = 0;
    },
  };
}
