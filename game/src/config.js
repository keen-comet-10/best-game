// Neon Void — every tuning number, colour and wave script in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the size of the player's screen.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second at any refresh rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  speed: 400,
  focusSpeed: 205,
  lives: 3,
  invulnerableSeconds: 2.2,
  respawnSeconds: 0.9,
  startBombs: 2,
  maxBombs: 5,
};

/** Fire interval in seconds for weapon levels 1 to 5 (index 0 is level 1). */
export const WEAPON_INTERVALS = [0.155, 0.15, 0.145, 0.135, 0.125];
export const RAPID_INTERVAL_SCALE = 0.55;
export const RAPID_SECONDS = 9;
export const PLAYER_BULLET_SPEED = 860;

export const COMBO = { windowSeconds: 2.6, killsPerStep: 7, maxMultiplier: 8 };

export const DROP_CHANCE = 0.16;

export const BOSS = {
  name: 'VOIDMOTHER',
  maxHp: 260,
  radius: 62,
  enterY: 118,
  score: 5000,
};

export const PALETTE = {
  backdrop: '#04050d',
  spaceTop: '#070a1e',
  spaceBottom: '#0b0620',
  nebulaA: 'rgba(64, 32, 140, 0.55)',
  nebulaB: 'rgba(10, 90, 120, 0.45)',
  nebulaC: 'rgba(150, 24, 90, 0.32)',
  player: '#3df3ff',
  playerCore: '#eaffff',
  playerBullet: '#8ff8ff',
  enemyBullet: '#ff5d8f',
  mite: '#ff3d7f',
  loom: '#b26bff',
  bastion: '#ffb347',
  dart: '#ff5252',
  shard: '#9aa7c7',
  boss: '#ff2e88',
  bossCore: '#ffd166',
  shield: '#57c7ff',
  text: '#eaf6ff',
  muted: '#8fa3c7',
  gold: '#ffd166',
  green: '#52ffa8',
  panel: 'rgba(10, 14, 34, 0.88)',
  panelEdge: '#2de2ff',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-void.best';

/**
 * The five waves. Each group spawns `count` ships of one kind, one every
 * `gap` seconds, starting `at` seconds into the wave, spread by `pattern`:
 * 'rain' scatters across the width, 'column' stacks one lane, 'vee' flies a
 * V, 'walls' leaves a gap in the middle. Wave 5 is the boss and her escorts.
 */
export const WAVES = [
  {
    name: 'First Contact',
    groups: [
      { at: 0.5, kind: 'mite', count: 5, gap: 0.55, pattern: 'rain' },
      { at: 4.5, kind: 'mite', count: 6, gap: 0.5, pattern: 'vee' },
      { at: 9.0, kind: 'shard', count: 3, gap: 1.1, pattern: 'rain' },
      { at: 12.0, kind: 'mite', count: 6, gap: 0.45, pattern: 'rain' },
    ],
  },
  {
    name: 'The Loom Tightens',
    groups: [
      { at: 0.5, kind: 'loom', count: 3, gap: 1.4, pattern: 'rain' },
      { at: 5.0, kind: 'mite', count: 8, gap: 0.4, pattern: 'walls' },
      { at: 10.0, kind: 'loom', count: 3, gap: 1.2, pattern: 'vee' },
      { at: 14.0, kind: 'dart', count: 4, gap: 0.8, pattern: 'rain' },
      { at: 17.0, kind: 'shard', count: 4, gap: 0.9, pattern: 'rain' },
    ],
  },
  {
    name: 'Crossfire',
    groups: [
      { at: 0.5, kind: 'bastion', count: 1, gap: 1, pattern: 'column' },
      { at: 3.0, kind: 'mite', count: 8, gap: 0.38, pattern: 'rain' },
      { at: 8.0, kind: 'loom', count: 4, gap: 1.1, pattern: 'rain' },
      { at: 13.0, kind: 'bastion', count: 1, gap: 1, pattern: 'column' },
      { at: 15.0, kind: 'dart', count: 5, gap: 0.7, pattern: 'vee' },
      { at: 19.0, kind: 'mite', count: 8, gap: 0.35, pattern: 'walls' },
    ],
  },
  {
    name: 'Swarmfall',
    groups: [
      { at: 0.5, kind: 'dart', count: 6, gap: 0.6, pattern: 'rain' },
      { at: 5.0, kind: 'bastion', count: 2, gap: 2.5, pattern: 'rain' },
      { at: 9.0, kind: 'loom', count: 5, gap: 1.0, pattern: 'vee' },
      { at: 14.0, kind: 'mite', count: 10, gap: 0.3, pattern: 'walls' },
      { at: 17.0, kind: 'shard', count: 5, gap: 0.8, pattern: 'rain' },
      { at: 20.0, kind: 'dart', count: 6, gap: 0.55, pattern: 'vee' },
    ],
  },
  {
    name: 'The Voidmother',
    boss: true,
    groups: [
      { at: 6.0, kind: 'mite', count: 4, gap: 0.7, pattern: 'walls' },
      { at: 16.0, kind: 'loom', count: 2, gap: 1.6, pattern: 'rain' },
      { at: 28.0, kind: 'dart', count: 4, gap: 0.8, pattern: 'vee' },
      { at: 42.0, kind: 'mite', count: 5, gap: 0.6, pattern: 'walls' },
      { at: 56.0, kind: 'loom', count: 2, gap: 1.6, pattern: 'rain' },
    ],
  },
];
