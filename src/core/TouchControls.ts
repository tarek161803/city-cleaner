import type { Input } from './Input';

/** How far the joystick knob travels from its centre (CSS px). */
const STICK_R = 56;
/** Pushing the stick this far out sprints. */
const SPRINT_PUSH = 0.85;
/** Touches starting left of this fraction of the screen move; the rest look around. Wider on a tall screen. */
const STICK_ZONE = 0.4;
const STICK_ZONE_PORTRAIT = 0.5;
/** Finger drags are shorter than mouse sweeps, so turn faster per pixel. */
const LOOK_SCALE = 1.8;

/**
 * On-screen controls for phones and tablets: a floating joystick on the left half, drag anywhere
 * else to look, and buttons for attacks, jump, mute and pause. They feed the same Input the
 * keyboard and mouse do. The elements live in #touch (index.html) and hide with the menu.
 */
export class TouchControls {
  private stickId: number | null = null;
  private lookId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private lookX = 0;
  private lookY = 0;
  private stick = document.getElementById('stick')!;
  private knob = document.getElementById('knob')!;

  constructor(private input: Input, canvas: HTMLElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!input.locked) return;
      if (this.stickId === null && e.clientX < innerWidth * (innerWidth < innerHeight ? STICK_ZONE_PORTRAIT : STICK_ZONE)) {
        this.stickId = e.pointerId;
        this.stickX = e.clientX;
        this.stickY = e.clientY;
        this.stick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.knob.style.transform = '';
        this.stick.classList.add('on');
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookX = e.clientX;
        this.lookY = e.clientY;
      }
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX - this.stickX, e.clientY - this.stickY);
      else if (e.pointerId === this.lookId) {
        input.look((e.clientX - this.lookX) * LOOK_SCALE, (e.clientY - this.lookY) * LOOK_SCALE);
        this.lookX = e.clientX;
        this.lookY = e.clientY;
      }
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.releaseStick();
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);

    this.button('btn-light', () => input.attack('light'));
    this.button('btn-heavy', () => input.attack('heavy'));
    this.button('btn-jump', () => input.press('Space'));
    this.button('btn-mute', () => input.press('KeyM'));
    this.button('btn-pause', () => input.pause());
  }

  /** Paused: drop whatever fingers were down. */
  reset() {
    this.releaseStick();
    this.lookId = null;
  }

  private button(id: string, onPress: () => void) {
    const el = document.getElementById(id)!;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.input.locked) return;
      onPress();
      el.classList.add('down');
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  private moveStick(dx: number, dy: number) {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_R ? STICK_R / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const push = Math.min(1, len / STICK_R);
    // Small dead zone so a resting thumb doesn't creep.
    const live = push < 0.15 ? 0 : 1 / Math.max(len, 1);
    this.input.moveX = dx * live;
    this.input.moveZ = -dy * live;
    this.input.hold('ShiftLeft', push > SPRINT_PUSH);
  }

  private releaseStick() {
    this.stickId = null;
    this.stick.classList.remove('on');
    this.input.moveX = this.input.moveZ = 0;
    this.input.hold('ShiftLeft', false);
  }
}
