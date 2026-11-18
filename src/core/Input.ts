export type BufferedAction = 'light' | 'heavy';

const GAME_KEYS = new Set(['Space']);
const BUFFER_WINDOW = 0.35;

export class Input {
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private buffered: { action: BufferedAction; time: number; frames: number } | null = null;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.bufferAction('light');
      else if (e.button === 2) this.bufferAction('heavy');
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code: string) {
    return this.keys.has(code);
  }

  wasPressed(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Attack inputs are buffered briefly so a click during recovery still chains the combo. */
  peekAction(): BufferedAction | null {
    if (!this.buffered) return null;
    // Always survive at least one frame, so a long frame can't swallow the click.
    if (this.buffered.frames > 0 && performance.now() / 1000 - this.buffered.time > BUFFER_WINDOW) this.buffered = null;
    return this.buffered?.action ?? null;
  }

  consumeAction() {
    this.buffered = null;
  }

  endFrame() {
    if (this.buffered) this.buffered.frames++;
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private bufferAction(action: BufferedAction) {
    this.buffered = { action, time: performance.now() / 1000, frames: 0 };
  }
}
