// Keyboard and mouse input. Held keys and the pointer give continuous
// controls (steering, fire); one-shot presses (confirm, bomb, pause, mute)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_BOMB = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const FIRE = new Set(['Space', 'KeyJ', 'KeyZ']);
const FOCUS = new Set(['ShiftLeft', 'ShiftRight', 'KeyK']);
const CONFIRM = new Set(['Space', 'Enter']);
const BOMB = new Set(['KeyX', 'KeyB']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = { left: false, right: false, up: false, down: false, fire: false, focus: false };
  const pointer = { x: 0, y: 0, down: false, inside: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (FIRE.has(event.code)) held.fire = true;
    else if (FOCUS.has(event.code)) held.focus = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      if (!FIRE.has(event.code)) return;
    } else if (BOMB.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BOMB;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (FIRE.has(event.code)) held.fire = false;
    else if (FOCUS.has(event.code)) held.focus = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur so the ship never flies on its own.
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = held.fire = held.focus = false;
    pointer.down = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      actions |= ACTION_BOMB;
      return;
    }
    pointer.down = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    pointer.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Continuous steering, each axis -1, 0 or 1. */
    moveX() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    moveY() {
      return (held.down ? 1 : 0) - (held.up ? 1 : 0);
    },
    /** True while any fire control is held: Space, J, Z or the mouse button. */
    firing() {
      return held.fire || pointer.down;
    },
    /** True while a focus (slow, precise) control is held. */
    focusing() {
      return held.focus;
    },
    /** The pointer's position in CSS pixels, for menus. */
    pointer,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
