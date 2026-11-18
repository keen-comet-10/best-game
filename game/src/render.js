// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred. The
// backdrop (nebula wash and three star layers) is pre-rendered or fixed-
// seeded, so a screenshot scene always paints the same sky. Ships are drawn
// as neon vector shapes with a glow pass; text that holds a number is
// rebuilt only when the number changes, so a frame allocates almost nothing.

import { BOSS, FIELD, FONT, PALETTE, WAVES } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const POWERUP_STYLE = {
  weapon: { color: '#52ffa8', label: 'W' },
  shield: { color: '#57c7ff', label: 'S' },
  bomb: { color: '#ffd166', label: 'B' },
  rapid: { color: '#ff9ff3', label: 'R' },
  life: { color: '#52ffa8', label: '+' },
};

function cachedLabel(prefix, suffix = '') {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next + suffix;
    }
    return text;
  };
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * rad;
    const py = y + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const comboLabel = cachedLabel('COMBO x');
  const waveLabel = cachedLabel('WAVE ');
  const finalScore = cachedLabel('Score  ');
  const killsLabel = cachedLabel('Kills  ');
  const timeLabel = cachedLabel('');

  // The nebula is painted once onto a small offscreen canvas and stretched:
  // soft radial washes of violet, teal and magenta over the deep-space base.
  const nebula = document.createElement('canvas');
  nebula.width = 640;
  nebula.height = 360;
  {
    const nctx = nebula.getContext('2d');
    const base = nctx.createLinearGradient(0, 0, 0, 360);
    base.addColorStop(0, PALETTE.spaceTop);
    base.addColorStop(1, PALETTE.spaceBottom);
    nctx.fillStyle = base;
    nctx.fillRect(0, 0, 640, 360);
    const blobRandom = createRandom(777);
    const colours = [PALETTE.nebulaA, PALETTE.nebulaB, PALETTE.nebulaC];
    for (let i = 0; i < 9; i += 1) {
      const x = blobRandom() * 640;
      const y = blobRandom() * 360;
      const r = 90 + blobRandom() * 170;
      const grad = nctx.createRadialGradient(x, y, 0, x, y, r);
      const colour = colours[i % colours.length];
      grad.addColorStop(0, colour);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      nctx.fillStyle = grad;
      nctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // Three star layers, fixed seed: the same sky in every screenshot.
  const starLayers = [];
  {
    const starRandom = createRandom(20261);
    const defs = [
      { count: 80, speed: 13, size: 1.1, alpha: 0.5 },
      { count: 54, speed: 32, size: 1.7, alpha: 0.75 },
      { count: 28, speed: 66, size: 2.5, alpha: 1 },
    ];
    for (const def of defs) {
      const stars = [];
      for (let i = 0; i < def.count; i += 1) {
        stars.push({ x: starRandom() * FIELD.width, y: starRandom() * FIELD.height, phase: starRandom() * 6.28 });
      }
      starLayers.push({ ...def, stars });
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function font(size, weight = 600) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', weight = 600) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function glowText(value, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = font(size, 800);
    ctx.textAlign = align;
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.fillText(value, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function drawBackdrop(state) {
    ctx.drawImage(nebula, 0, 0, FIELD.width, FIELD.height);
    for (const layer of starLayers) {
      ctx.fillStyle = '#cfe9ff';
      for (const star of layer.stars) {
        const y = (star.y + state.time * layer.speed) % FIELD.height;
        const twinkle = 0.7 + 0.3 * Math.sin(state.time * 2 + star.phase);
        ctx.globalAlpha = layer.alpha * twinkle;
        ctx.fillRect(star.x, y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayerShip(x, y, scale, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Engine flame, flickering with time.
    const flame = 12 + Math.sin(time * 41) * 4 + Math.sin(time * 97) * 2;
    ctx.beginPath();
    ctx.moveTo(-5, 16);
    ctx.lineTo(0, 16 + flame);
    ctx.lineTo(5, 16);
    ctx.closePath();
    ctx.fillStyle = '#ffb347';
    ctx.shadowColor = '#ff9a3d';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Hull: a swept dart with notched wings.
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(6, -4);
    ctx.lineTo(19, 10);
    ctx.lineTo(19, 15);
    ctx.lineTo(7, 12);
    ctx.lineTo(4, 16);
    ctx.lineTo(-4, 16);
    ctx.lineTo(-7, 12);
    ctx.lineTo(-19, 15);
    ctx.lineTo(-19, 10);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fillStyle = '#0d2b3a';
    ctx.fill();
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 2;
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Cockpit core.
    ctx.beginPath();
    ctx.arc(0, -2, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.playerCore;
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, time) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === 'mite') {
      ctx.rotate(Math.sin(e.t * 3) * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.lineTo(12, -8);
      ctx.lineTo(0, -14);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fillStyle = '#2a0a1c';
      ctx.fill();
      ctx.strokeStyle = PALETTE.mite;
      ctx.lineWidth = 2;
      ctx.shadowColor = PALETTE.mite;
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, -2, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd7e8';
      ctx.fill();
    } else if (e.kind === 'loom') {
      ctx.strokeStyle = PALETTE.loom;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = PALETTE.loom;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(0, 0, 15, e.t * 1.8, e.t * 1.8 + 4.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 9, -e.t * 2.6, -e.t * 2.6 + 4.4);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#efe2ff';
      ctx.fill();
    } else if (e.kind === 'bastion') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(angle) * 22;
        const py = Math.sin(angle) * 22;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#2b1a05';
      ctx.fill();
      ctx.strokeStyle = PALETTE.bastion;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = PALETTE.bastion;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.bastion;
      ctx.fillRect(-13, 14, 5, 10);
      ctx.fillRect(8, 14, 5, 10);
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff0d6';
      ctx.fill();
      // A hull arc shows the damage once this gunship is hurt.
      if (e.hp < e.maxHp) {
        ctx.beginPath();
        ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + (e.hp / e.maxHp) * Math.PI * 2);
        ctx.strokeStyle = '#52ffa8';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    } else if (e.kind === 'dart') {
      const flashing = e.dived && Math.floor(time * 9) % 2 === 0;
      ctx.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2 || 0);
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(8, -10);
      ctx.lineTo(0, -5);
      ctx.lineTo(-8, -10);
      ctx.closePath();
      ctx.fillStyle = flashing ? '#ffe9e9' : '#2a0d0d';
      ctx.fill();
      ctx.strokeStyle = PALETTE.dart;
      ctx.lineWidth = 2;
      ctx.shadowColor = PALETTE.dart;
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Shard: a tumbling rock with facet lines.
      ctx.rotate(e.rot);
      ctx.beginPath();
      const points = 7;
      for (let i = 0; i < points; i += 1) {
        const angle = (i / points) * Math.PI * 2;
        const rad = e.radius * (0.78 + ((i * 37) % 10) / 32);
        const px = Math.cos(angle) * rad;
        const py = Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#171c2c';
      ctx.fill();
      ctx.strokeStyle = PALETTE.shard;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-e.radius * 0.4, -e.radius * 0.2);
      ctx.lineTo(e.radius * 0.2, e.radius * 0.1);
      ctx.lineTo(-e.radius * 0.1, e.radius * 0.45);
      ctx.strokeStyle = 'rgba(154,167,199,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
    // Hit flash: a white bloom over the hull the frame it is struck.
    if (e.flash > 0) {
      ctx.save();
      ctx.globalAlpha = e.flash * 0.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBoss(boss, time) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    // Wing fans.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 18, -6);
      ctx.lineTo(side * 86, 26);
      ctx.lineTo(side * 78, 44);
      ctx.lineTo(side * 26, 30);
      ctx.closePath();
      ctx.fillStyle = '#2b0718';
      ctx.fill();
      ctx.strokeStyle = PALETTE.boss;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = PALETTE.boss;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Wing guns.
      ctx.beginPath();
      ctx.arc(side * 46, 26, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#450d28';
      ctx.fill();
      ctx.strokeStyle = PALETTE.bossCore;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    // Main hull.
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.lineTo(30, -18);
    ctx.lineTo(36, 26);
    ctx.lineTo(16, 48);
    ctx.lineTo(-16, 48);
    ctx.lineTo(-36, 26);
    ctx.lineTo(-30, -18);
    ctx.closePath();
    ctx.fillStyle = '#38091f';
    ctx.fill();
    ctx.strokeStyle = PALETTE.boss;
    ctx.lineWidth = 3;
    ctx.shadowColor = PALETTE.boss;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Pulsing core: the weak point.
    const pulse = 11 + Math.sin(time * 5) * 2.4;
    ctx.beginPath();
    ctx.arc(0, 2, pulse + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,209,102,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 2, pulse, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.bossCore;
    ctx.shadowColor = PALETTE.bossCore;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalAlpha = boss.flash * 0.4;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius + 16, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerup(p, time) {
    const style = POWERUP_STYLE[p.kind];
    const bob = Math.sin(time * 4 + p.t * 3) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.beginPath();
    ctx.arc(0, 0, 16 + Math.sin(time * 5) * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const s = 13;
    ctx.beginPath();
    ctx.roundRect(-s, -s, s * 2, s * 2, 6);
    ctx.fillStyle = 'rgba(6,10,24,0.92)';
    ctx.fill();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    text(style.label, 0, 6.5, 16, style.color, 'center', 800);
    ctx.restore();
  }

  function drawField(state) {
    drawBackdrop(state);
    const time = state.time;

    for (const p of state.powerups) if (p.active) drawPowerup(p, time);
    for (const e of state.enemies) if (e.active) drawEnemy(e, time);
    if (state.boss.active) drawBoss(state.boss, time);

    // Enemy bullets: magenta orbs with a hot core.
    ctx.shadowColor = PALETTE.enemyBullet;
    ctx.shadowBlur = 8;
    for (const b of state.eBullets) {
      if (!b.active) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.enemyBullet;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe3ee';
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Player bullets: short cyan bolts.
    ctx.strokeStyle = PALETTE.playerBullet;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (const b of state.pBullets) {
      if (!b.active) continue;
      const len = 13;
      const mag = Math.hypot(b.vx, b.vy) || 1;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / mag) * len, b.y - (b.vy / mag) * len);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // The player, blinking while invulnerable after a hit.
    const player = state.player;
    if (player.alive && (player.invuln === 0 || Math.floor(time * 11) % 2 === 0)) {
      drawPlayerShip(player.x, player.y, 1, time);
      if (player.shield) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x, player.y, 27 + Math.sin(time * 4) * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = PALETTE.shield;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.shadowColor = PALETTE.shield;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Effects: shockwaves under sparks, then floating text on top.
    const fx = state.fx;
    for (const w of fx.waves) {
      if (!w.active) continue;
      ctx.save();
      ctx.globalAlpha = (w.life / w.maxLife) * 0.8;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      ctx.stroke();
      ctx.restore();
    }
    for (const p of fx.particles) {
      if (!p.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 7;
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    for (const t of fx.texts) {
      if (!t.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      text(t.value, t.x, t.y, t.size, t.color, 'center', 700);
      ctx.restore();
    }

    // Bomb and boss-death flash.
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(240,250,255,${(state.flash * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state, muted) {
    const player = state.player;
    ctx.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 16, 27, PALETTE.text, 'left', 800);
    text(bestLabel(state.bestShown ?? 0), 24, 48, 15, PALETTE.muted, 'left');
    // Combo meter under the score while a chain is alive.
    if (state.combo.count >= 2) {
      text(comboLabel(state.combo.mult), 24, 74, 21, PALETTE.gold, 'left', 800);
      ctx.fillStyle = 'rgba(255,209,102,0.25)';
      ctx.fillRect(24, 100, 120, 5);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(24, 100, 120 * Math.max(0, state.combo.timer / 2.6), 5);
      text(cachedLabel('', ' chain')(state.combo.count), 152, 76, 15, PALETTE.muted, 'left');
    }
    text(waveLabel(state.wave + 1), FIELD.width / 2 - 52, 16, 22, PALETTE.text, 'right', 800);
    text(WAVES[state.wave].name.toUpperCase(), FIELD.width / 2 - 40, 19, 16, PALETTE.muted, 'left');

    // Boss hull bar, centred under the wave line.
    if (state.boss.active) {
      const w = 430;
      const x = (FIELD.width - w) / 2;
      text(BOSS.name, FIELD.width / 2, 46, 15, '#ff7ab0', 'center', 800);
      ctx.fillStyle = 'rgba(255,46,136,0.2)';
      ctx.fillRect(x, 66, w, 9);
      ctx.fillStyle = PALETTE.boss;
      ctx.fillRect(x, 66, (w * Math.max(0, state.boss.hp)) / state.boss.maxHp, 9);
      ctx.strokeStyle = 'rgba(255,122,176,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 66, w, 9);
    }

    // Lives as little ships, top right; bombs as dots beneath.
    for (let i = 0; i < player.lives; i += 1) {
      drawPlayerShip(FIELD.width - 34 - i * 34, 32, 0.62, state.time);
    }
    text('BOMBS', FIELD.width - 24, 52, 13, PALETTE.muted, 'right');
    for (let i = 0; i < player.bombs; i += 1) {
      ctx.beginPath();
      ctx.arc(FIELD.width - 32 - i * 20, 84, 6, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.gold;
      ctx.shadowColor = PALETTE.gold;
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Weapon pips and the rapid timer, bottom left.
    text('WEAPON', 24, FIELD.height - 40, 13, PALETTE.muted, 'left');
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < player.weapon ? PALETTE.green : 'rgba(143,163,199,0.3)';
      ctx.fillRect(96 + i * 22, FIELD.height - 42, 16, 12);
    }
    if (player.rapidTimer > 0) {
      text('RAPID', 224, FIELD.height - 40, 13, '#ff9ff3', 'left', 800);
      ctx.fillStyle = 'rgba(255,159,243,0.25)';
      ctx.fillRect(272, FIELD.height - 40, 74, 9);
      ctx.fillStyle = '#ff9ff3';
      ctx.fillRect(272, FIELD.height - 40, 74 * (player.rapidTimer / 9), 9);
    }
    if (player.shield) text('SHIELD', 370, FIELD.height - 40, 13, PALETTE.shield, 'left', 800);
    text(muted ? 'M SOUND OFF' : 'P PAUSE · M MUTE', FIELD.width - 24, FIELD.height - 40, 13, PALETTE.muted, 'right');

    // Wave banner for the first moments of a wave.
    if (state.waveTime < 2.3 && state.outcome === null) {
      const alpha = state.waveTime < 1.9 ? 1 : 1 - (state.waveTime - 1.9) / 0.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (WAVES[state.wave].boss) {
        const flashOn = Math.floor(state.time * 3.2) % 2 === 0;
        glowText('!! WARNING !!', FIELD.width / 2, 268, 44, flashOn ? '#ff5252' : '#ffd166');
        text('THE VOIDMOTHER APPROACHES', FIELD.width / 2, 306, 21, PALETTE.text, 'center', 700);
      } else {
        glowText(`WAVE ${state.wave + 1}`, FIELD.width / 2, 262, 42, PALETTE.panelEdge);
        text(WAVES[state.wave].name.toUpperCase(), FIELD.width / 2, 300, 20, PALETTE.text, 'center', 700);
      }
      ctx.restore();
    }

    // One life left: a breathing red edge.
    if (player.lives === 1 && player.alive) {
      const pulse = 0.1 + 0.07 * Math.sin(state.time * 5);
      const grad = ctx.createRadialGradient(640, 360, 300, 640, 360, 720);
      grad.addColorStop(0, 'rgba(255,40,60,0)');
      grad.addColorStop(1, `rgba(255,40,60,${pulse.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawPanel(title, lines, prompt, titleColor = PALETTE.panelEdge) {
    const width = 660;
    const height = 118 + lines.length * 31 + 66;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 + 26;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = titleColor;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    glowText(title, FIELD.width / 2, y + 62, 34, titleColor);
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      text(line, FIELD.width / 2, y + 108 + i * 31, 18, i === 0 ? PALETTE.text : PALETTE.muted, 'center', i === 0 ? 700 : 500);
    });
    if (prompt) {
      const blink = 0.72 + 0.28 * Math.sin(nowSeconds * 3.4);
      ctx.save();
      ctx.globalAlpha = blink;
      text(prompt, FIELD.width / 2, y + height - 26, 19, PALETTE.gold, 'center', 800);
      ctx.restore();
    }
    return { x, y, width, height };
  }

  function statsLines(state, best) {
    const stats = state.stats;
    const accuracy = stats.shots > 0 ? Math.min(100, Math.round((stats.hits / stats.shots) * 100)) : 0;
    const seconds = Math.floor(state.runTime);
    const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const maxMult = Math.min(8, 1 + Math.floor(stats.maxCombo / 7));
    return [
      finalScore(state.score) + (state.score >= best && state.score > 0 ? '   NEW BEST!' : ''),
      bestLabel(best),
      `Wave reached  ${state.wave + 1} of ${WAVES.length}      ${killsLabel(stats.kills)}`,
      `Accuracy  ${accuracy}%      Max combo  x${maxMult} (${stats.maxCombo} chain)`,
      `Time  ${timeLabel(mmss)}      Bombs used  ${stats.bombsUsed}`,
    ];
  }

  function drawTitle(state, best) {
    // A hero ship glides above the logo.
    drawPlayerShip(FIELD.width / 2 + Math.sin(state.time * 0.7) * 30, 66, 1.4, state.time);
    glowText('NEON VOID', FIELD.width / 2, 158, 72, PALETTE.panelEdge);
    text('S T A R F A L L   D E F E N C E', FIELD.width / 2, 188, 18, PALETTE.gold, 'center', 700);
    drawPanel('MISSION BRIEF', [
      'Five waves of the void swarm stand between Vesper and dawn.',
      'MOVE  Arrows / WASD        FIRE  Space / Mouse',
      'FOCUS  Shift        BOMB  X / Right-click        PAUSE  P',
      'Chain kills to raise your combo. Catch pods to power up.',
      best > 0 ? `Best score  ${best}` : 'No flights yet. Set the first best score.',
    ], 'PRESS ENTER OR CLICK TO LAUNCH');
    // The swarm legend: every enemy, its name and its worth.
    const legend = [
      ['mite', 'MITE · 100'], ['loom', 'LOOM · 250'], ['bastion', 'BASTION · 500'],
      ['dart', 'DART · 200'], ['shard', 'SHARD · 150'],
    ];
    ctx.textBaseline = 'top';
    legend.forEach(([kind, label], i) => {
      const x = 268 + i * 150;
      drawEnemy({ kind, x, y: 622, t: state.time, rot: state.time * 0.7, hp: 9, maxHp: 9, flash: 0, dived: false, vy: 1, vx: 0 }, state.time);
      text(label, x, 652, 13, PALETTE.muted, 'center', 700);
    });
  }

  function drawEnd(state, best, won) {
    const lines = statsLines(state, best);
    if (won) {
      // Star rating by score: a clean run with lives left shines brightest.
      const stars = state.score >= 42000 ? 3 : state.score >= 28000 ? 2 : 1;
      drawPanel('VOIDMOTHER DESTROYED', lines, 'PRESS ENTER TO FLY AGAIN', PALETTE.gold);
      for (let i = 0; i < 3; i += 1) {
        const x = FIELD.width / 2 + (i - 1) * 52;
        starPath(ctx, x, 128, 19);
        if (i < stars) {
          ctx.fillStyle = PALETTE.gold;
          ctx.shadowColor = PALETTE.gold;
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = 'rgba(255,209,102,0.4)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      text('DAWN BREAKS OVER THE DRIFT — THE SWARM IS SCATTERED', FIELD.width / 2, 168, 17, PALETTE.text, 'center', 700);
    } else {
      drawPanel('GAME OVER', lines, 'PRESS ENTER TO FLY AGAIN', '#ff5252');
      text('VESPER IS DOWN — THE DRIFT REMEMBERS HER PILOT', FIELD.width / 2, 168, 17, PALETTE.text, 'center', 700);
    }
  }

  let nowSeconds = 0;

  /** Paint one frame: the field, then the HUD or the screen's panel. */
  function draw(state, screen, best, muted = false) {
    nowSeconds = state.time;
    state.bestShown = best;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.fx.shakeAmount();
    const ox = Math.sin(state.time * 131.7) * shake * 0.6;
    const oy = Math.cos(state.time * 149.3) * shake * 0.6;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    ctx.textBaseline = 'alphabetic';
    drawField(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The swarm holds its breath.', 'Your score, combo and pods are all kept.'], 'PRESS P TO RESUME');
    } else if (screen === SCREEN_OVER) {
      drawEnd(state, best, false);
    } else if (screen === SCREEN_WIN) {
      drawEnd(state, best, true);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
