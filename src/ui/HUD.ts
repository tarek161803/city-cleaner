import * as THREE from 'three';
import { IS_TOUCH } from '../core/Quality';

const $ = (id: string) => document.getElementById(id)!;
const _v = new THREE.Vector3();

export type SmashKind = 'rickshaw' | 'stall';

const POINTS: Record<SmashKind, number> = { rickshaw: 100, stall: 150 };
const HIT_POINTS = 10;
/** Score multiplier for breaking something while its owner was standing guard. */
const DEFENDED_BONUS = 1.5;
/** Extra points for clearing a stall that was blocking the road itself. */
const ROAD_BONUS = 100;
/** Smash again within this window to keep the combo going. */
const COMBO_WINDOW = 4;
const MAX_MULTIPLIER = 8;
const POPUP_LIFE = 1.1;
const MILESTONE_EVERY = 10;
const MILESTONES = ['ROAD CLEARER!', 'CITY CLEANER!', 'TRAFFIC TAMER!', 'FOOTPATH FREED!', 'DHAKA LEGEND!'];
const COMBO_SHOUTS: Record<number, string> = { 3: 'NICE!', 5: 'UNSTOPPABLE!', 8: 'MAXIMUM CHAOS!' };

const BUBBLE_LIFE = 2.2;
/** Speech bubbles further than this from the camera are not shown. */
const BUBBLE_RANGE = 45;

interface Bubble {
  el: HTMLElement;
  /** Followed every frame (a person's feet position). */
  anchor: THREE.Vector3;
  t: number;
}

interface Popup {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
}

/** Arcade HUD: counting score, pop-in counters, combo multiplier, floating points and milestone banners. */
export class HUD {
  private scoreEl = $('score-val');
  private counters: Record<SmashKind, HTMLElement> = { rickshaw: $('rk'), stall: $('sl') };
  private chips: Record<SmashKind, HTMLElement> = { rickshaw: $('chip-rk'), stall: $('chip-sl') };
  private comboEl = $('combo');
  private comboX = $('combo-x');
  private comboFill = $('combo-fill');
  private toastEl = $('toast');
  private popupLayer = $('popups');
  private start = $('start');
  private hud = $('hud');
  private play = $('play');
  private started = false;

  private score = 0;
  private shownScore = 0;
  private counts: Record<SmashKind, number> = { rickshaw: 0, stall: 0 };
  private combo = 0;
  private comboT = 0;
  private toastT = 0;
  private popups: Popup[] = [];
  private bubbles: Bubble[] = [];
  /** Grit meters over defending owners, keyed by person. */
  private grits = new Map<object, { el: HTMLElement; pos: THREE.Vector3; shown: number }>();

  /** Reveal the title menu once the arcade font is in, so the text never reflows on screen. */
  ready() {
    if (IS_TOUCH) this.play.textContent = '▶ TAP TO PLAY';
    document.fonts.ready.then(() => this.start.classList.add('ready'));
  }

  get multiplier() {
    return Math.max(1, Math.min(this.combo, MAX_MULTIPLIER));
  }

  onHit(at: THREE.Vector3) {
    const pts = HIT_POINTS * this.multiplier;
    this.score += pts;
    this.popup(at, `+${pts}`, 'small');
  }

  onSmash(kind: SmashKind, at: THREE.Vector3, defended = false, blockedRoad = false) {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = COMBO_WINDOW;
    const mult = this.multiplier;
    const base = POINTS[kind] + (blockedRoad ? ROAD_BONUS : 0);
    const pts = Math.round(base * mult * (defended ? DEFENDED_BONUS : 1));
    this.score += pts;
    this.counts[kind]++;
    this.counters[kind].textContent = String(this.counts[kind]);
    bump(this.chips[kind]);
    bump(this.scoreEl);
    this.popup(at, mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, kind);
    if (defended) this.popup(at.clone().setY(at.y + 0.8), 'DEFENDED!', 'small');
    if (blockedRoad) this.popup(at.clone().setY(at.y + (defended ? 1.5 : 0.8)), 'ROAD FREED!', 'small');

    if (mult > 1) {
      this.comboX.textContent = `×${mult}`;
      this.comboEl.classList.add('on');
      bump(this.comboX);
    }
    const total = this.counts.rickshaw + this.counts.stall;
    if (COMBO_SHOUTS[this.combo]) this.toast(COMBO_SHOUTS[this.combo]);
    else if (total % MILESTONE_EVERY === 0) {
      this.toast(MILESTONES[Math.min(total / MILESTONE_EVERY - 1, MILESTONES.length - 1)], `${total} SMASHED`);
    }
  }

  update(dt: number, locked: boolean, camera: THREE.Camera) {
    this.updateMenu(locked);

    // Score rolls up toward its real value.
    if (this.shownScore !== this.score) {
      this.shownScore = Math.min(this.score, this.shownScore + Math.max(1, (this.score - this.shownScore) * 10 * dt));
      this.scoreEl.textContent = Math.floor(this.shownScore).toLocaleString();
    }

    if (this.comboT > 0) {
      this.comboT -= dt;
      this.comboFill.style.width = `${(100 * Math.max(0, this.comboT)) / COMBO_WINDOW}%`;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.comboEl.classList.remove('on');
      }
    }

    this.toastT -= dt;
    if (this.toastT <= 0) this.toastEl.classList.remove('on');

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t >= POPUP_LIFE) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      _v.copy(p.pos).setY(p.pos.y + p.t * 1.4).project(camera);
      const k = p.t / POPUP_LIFE;
      const scale = k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3;
      p.el.style.display = _v.z < 1 ? 'block' : 'none';
      p.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${scale})`;
      p.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }

    for (const g of this.grits.values()) {
      _v.copy(g.pos).setY(g.pos.y + 2.0).project(camera);
      g.el.style.display = _v.z < 1 ? 'flex' : 'none';
      g.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      if (b.t >= BUBBLE_LIFE) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      const far = b.anchor.distanceTo(camera.position) > BUBBLE_RANGE;
      _v.copy(b.anchor).setY(b.anchor.y + 2.3).project(camera);
      b.el.style.display = _v.z < 1 && !far ? 'block' : 'none';
      const pop = Math.min(1, b.t / 0.12);
      b.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%) scale(${0.6 + 0.4 * pop})`;
      b.el.style.opacity = String(b.t > BUBBLE_LIFE - 0.3 ? (BUBBLE_LIFE - b.t) / 0.3 : 1);
    }
  }

  /** Title screen before the first click; pause menu with the current run's stats afterwards. */
  private updateMenu(locked: boolean) {
    const wasVisible = this.start.style.display !== 'none';
    this.start.style.display = locked ? 'none' : 'flex';
    this.hud.classList.toggle('menu-open', !locked);
    if (locked) {
      this.started = true;
      return;
    }
    if (wasVisible || !this.started) return;
    this.start.classList.add('paused');
    this.play.textContent = '▶ RESUME';
    $('p-score').textContent = this.score.toLocaleString();
    $('p-rk').textContent = String(this.counts.rickshaw);
    $('p-sl').textContent = String(this.counts.stall);
  }

  /** Show a grit meter (remaining nerve) over each defending owner; removes meters for the rest. */
  updateGrit(defenders: readonly { pos: THREE.Vector3; grit: number; gritMax: number }[]) {
    const seen = new Set<object>();
    for (const d of defenders) {
      seen.add(d);
      let g = this.grits.get(d);
      if (!g) {
        const el = document.createElement('div');
        el.className = 'grit';
        this.popupLayer.appendChild(el);
        g = { el, pos: d.pos, shown: -1 };
        this.grits.set(d, g);
      }
      if (g.shown !== d.grit) {
        g.el.innerHTML = Array.from({ length: d.gritMax }, (_, i) => `<i class="${i < d.grit ? '' : 'off'}"></i>`).join('');
        g.shown = d.grit;
      }
    }
    for (const [k, g] of this.grits) {
      if (seen.has(k)) continue;
      g.el.remove();
      this.grits.delete(k);
    }
  }

  /** Speech bubble that follows a person for a couple of seconds. */
  speak(anchor: THREE.Vector3, text: string) {
    // One bubble per person at a time.
    const old = this.bubbles.find((b) => b.anchor === anchor);
    if (old) old.t = BUBBLE_LIFE;
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    this.popupLayer.appendChild(el);
    this.bubbles.push({ el, anchor, t: 0 });
  }

  popup(at: THREE.Vector3, text: string, cls: string) {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.popupLayer.appendChild(el);
    this.popups.push({ el, pos: at.clone().setY(at.y + 1.2), t: 0 });
  }

  private toast(title: string, sub = '') {
    this.toastEl.innerHTML = `<div class="t1">${title}</div>${sub ? `<div class="t2">${sub}</div>` : ''}`;
    bump(this.toastEl, 'on');
    this.toastT = 1.6;
  }
}

/** Restart a CSS animation class on an element. */
function bump(el: HTMLElement, cls = 'bump') {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
