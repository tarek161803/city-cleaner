import { TouchControls } from './TouchControls';

export type BufferedAction = 'light' | 'heavy';

/** Phone or tablet: on-screen controls instead of mouse and keyboard (set on <html> before first paint). */
export const IS_TOUCH = document.documentElement.classList.contains('touch');

const GAME_KEYS = new Set(['Space']);
const BUFFER_WINDOW = 0.35;
/** Two Esc presses within this many ms leave fullscreen. */
const DOUBLE_ESC = 400;
/** Touch: taps this soon after pausing (ms) don't resume. */
const RESUME_GUARD = 500;

export class Input {
  mouseDX = 0;
  mouseDY = 0;
  /** Playing (not paused): the pointer is locked, or on touch, the game was tapped into. */
  locked = false;
  /** Analog movement from the touch joystick (x right, z forward), added to the keys. */
  moveX = 0;
  moveZ = 0;
  private lockUntil = 0;
  private touchControls: TouchControls | null = null;
  private pausedAt = 0;
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
    if (IS_TOUCH) this.setupTouch(canvas);
    else this.setupMouse(canvas);
  }

  private setupTouch(canvas: HTMLElement) {
    this.touchControls = new TouchControls(this, canvas);
    canvas.addEventListener('click', () => {
      // The tap on the pause button ends with a click that lands on the canvas once the button hides:
      // don't let it resume straight away.
      if (this.locked || performance.now() - this.pausedAt < RESUME_GUARD) return;
      this.locked = true;
      // Fullscreen where the browser allows it (Android; iPhone Safari doesn't). Either orientation plays.
      document.documentElement.requestFullscreen?.().catch(() => {});
    });
    const pause = () => this.pause();
    document.addEventListener('visibilitychange', () => document.hidden && pause());
    // Back gesture out of fullscreen on Android.
    document.addEventListener('fullscreenchange', () => !document.fullscreenElement && pause());
  }

  /** Touch only: stop playing and show the pause menu. */
  pause() {
    this.locked = false;
    this.pausedAt = performance.now();
    this.keys.clear();
    this.touchControls?.reset();
  }

  /** From the on-screen controls: a key held down or let go. */
  hold(code: string, on: boolean) {
    if (on) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** From the on-screen controls: a key tapped (seen by `wasPressed` this frame). */
  press(code: string) {
    this.pressed.add(code);
  }

  /** From the on-screen controls: an attack button tapped. */
  attack(action: BufferedAction) {
    this.bufferAction(action);
  }

  /** From the on-screen controls: a drag to look around, in screen pixels. */
  look(dx: number, dy: number) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  private setupMouse(canvas: HTMLElement) {
    // Entering fullscreen (and the macOS fullscreen animation) can refuse or drop a pointer lock
    // requested in the same click, so keep retrying for a moment until the lock sticks.
    const lock = () => {
      if (this.locked || !this.settling) return;
      void (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    };
    const retryLock = () => setTimeout(lock, 150);
    canvas.addEventListener('click', () => {
      if (this.locked) return;
      this.lockUntil = performance.now() + 2500;
      // Ask for the lock first: requesting fullscreen uses up the click's user activation.
      lock();
      // Fullscreen the whole page (not just the canvas) so the HUD overlay stays visible.
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().then(lock, lock);
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        // Keyboard Lock (Chrome/Edge) lets a short Esc reach the page instead of leaving fullscreen,
        // so pausing only releases the mouse and Resume doesn't have to re-enter fullscreen.
        void (navigator as Navigator & { keyboard?: { lock(keys: string[]): Promise<void> } }).keyboard
          ?.lock(['Escape'])
          .catch(() => {});
        retryLock();
      } else this.lockUntil = 0; // Leaving fullscreen means "pause", so stop trying to grab the mouse.
    });
    document.addEventListener('pointerlockerror', retryLock);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      // A lock that the fullscreen switch drops right after the click is taken again.
      if (!this.locked) retryLock();
    });
    // Esc pauses (releases the mouse); a quick second Esc also leaves fullscreen.
    let lastEsc = 0;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      const now = performance.now();
      if (now - lastEsc < DOUBLE_ESC) {
        lastEsc = 0;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      } else lastEsc = now;
      this.lockUntil = 0;
      if (this.locked) document.exitPointerLock();
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

  /** Just clicked to play and still waiting for the pointer lock to stick. */
  get settling() {
    return performance.now() < this.lockUntil;
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
