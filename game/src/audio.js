// All sound is synthesised with WebAudio: no audio files, nothing to load.
// Short oscillator and noise voices make the effects; a two-voice loop (a
// pulsing bass line and a sparse minor-key arp) plays under the action.
// Sound starts on the first user gesture, as browsers require, and the whole
// engine is a no-op in screenshot mode so staged scenes stay silent.

export function createAudio(enabled) {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensureContext() {
    if (!enabled || muted) return null;
    if (context === null) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  /** A single oscillator blip: pitch glides from `from` to `to` over `seconds`. */
  function blip(from, to, seconds, type, volume, when = 0) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise, for explosions and the bomb. */
  function noise(seconds, volume, filterFrom, filterTo) {
    const ctx = ensureContext();
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, filterTo), ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  // The music loop: an A-minor bass pulse with an arp a fifth above, one
  // 8th-note step every 150 ms, scheduled a step ahead by a plain timer.
  const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 73.42, 0, 82.41, 0];
  const ARP = [220, 261.63, 329.63, 440, 329.63, 261.63, 196, 246.94];

  function scheduleStep() {
    const ctx = ensureContext();
    if (!ctx) return;
    const step = musicStep;
    musicStep += 1;
    const bass = BASS[step % BASS.length];
    if (bass) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = bass;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.connect(gain).connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
    if (step % 2 === 0) {
      const note = ARP[(step / 2) % ARP.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note * 2;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.connect(gain).connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  }

  return {
    /** Call from a user gesture: unlocks audio and starts the music loop. */
    unlock() {
      if (!ensureContext()) return;
      if (musicTimer === null) musicTimer = window.setInterval(scheduleStep, 150);
    },
    shoot() {
      blip(880, 320, 0.07, 'square', 0.05);
    },
    enemyShoot() {
      blip(340, 180, 0.09, 'sawtooth', 0.03);
    },
    explosion(big) {
      noise(big ? 0.55 : 0.25, big ? 0.5 : 0.22, big ? 2600 : 1800, 120);
      if (big) blip(160, 38, 0.5, 'sine', 0.5);
    },
    playerHit() {
      blip(420, 60, 0.4, 'sawtooth', 0.4);
      noise(0.35, 0.3, 2200, 200);
    },
    pickup() {
      blip(660, 660, 0.06, 'sine', 0.18);
      blip(990, 990, 0.06, 'sine', 0.18, 0.06);
      blip(1320, 1320, 0.1, 'sine', 0.18, 0.12);
    },
    powerDown() {
      blip(520, 140, 0.25, 'triangle', 0.25);
    },
    bomb() {
      noise(0.8, 0.6, 3200, 60);
      blip(110, 30, 0.7, 'sine', 0.6);
    },
    waveClear() {
      blip(523, 523, 0.09, 'triangle', 0.2);
      blip(784, 784, 0.09, 'triangle', 0.2, 0.09);
      blip(1046, 1046, 0.16, 'triangle', 0.22, 0.18);
    },
    bossAlarm() {
      for (let i = 0; i < 3; i += 1) {
        blip(196, 196, 0.16, 'square', 0.2, i * 0.36);
        blip(147, 147, 0.16, 'square', 0.2, i * 0.36 + 0.18);
      }
    },
    gameOver() {
      blip(392, 392, 0.2, 'triangle', 0.25);
      blip(311, 311, 0.2, 'triangle', 0.25, 0.22);
      blip(233, 180, 0.5, 'triangle', 0.25, 0.44);
    },
    victory() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((note, i) => blip(note, note, 0.16, 'triangle', 0.22, i * 0.13));
    },
    /** Toggle mute; returns the new muted state. */
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
