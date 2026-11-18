import * as THREE from 'three';

export type Material = 'metal' | 'wood';

/** Sounds further than this are skipped entirely. */
const MAX_DIST = 70;
/** Cap on simultaneous voices so a heavy spin through a crowd of stalls doesn't overload. */
const MAX_VOICES = 24;
const VOLUME = 0.5;

type HornKind = 'car' | 'bus' | 'cng';
/** Two detuned square tones per horn, Hz. */
const HORNS: Record<HornKind, [number, number]> = { car: [415, 523], bus: [233, 294], cng: [740, 760] };

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const _d = new THREE.Vector3();

/**
 * Procedural sound effects (Web Audio, no asset files). Positional: quieter with distance and
 * panned relative to the camera. The context starts on the first click (browser autoplay rules).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private voices = 0;
  private listener = new THREE.Vector3();
  private right = new THREE.Vector3(1, 0, 0);
  private muted = false;
  /** Shared city reverb; big sounds send some of their signal here for a cinematic tail. */
  private reverb!: AudioNode;
  private crunchCurve!: Float32Array;
  private hornT = 1;

  /** Call from a user gesture (click) — browsers only allow audio after one. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(comp);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Reverb: a generated impulse response (decaying stereo noise, darker as it fades).
      const len = Math.floor(ctx.sampleRate * 2.4);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len;
          lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.5 * k);
          d[i] = lp * Math.pow(1 - k, 2.6);
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      conv.connect(wet).connect(this.master);
      this.reverb = conv;
      // Soft-clipping curve for gritty crunches.
      this.crunchCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        this.crunchCurve[i] = Math.tanh(x * 6);
      }
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    else if (!paused && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** Camera position and yaw (camera looks along (sin yaw, 0, cos yaw)). */
  setListener(pos: THREE.Vector3, yaw: number) {
    this.listener.copy(pos);
    this.right.set(-Math.cos(yaw), 0, Math.sin(yaw));
  }

  /** Background horns from unseen traffic around the listener; call every frame (dt = 0 while paused). */
  tick(dt: number) {
    const ctx = this.ctx;
    if (!ctx || dt <= 0) return;
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = rand(0.5, 2.4);
      const a = Math.random() * Math.PI * 2, d = rand(15, 65);
      const at = this.listener.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      const r = Math.random();
      this.horn(at, r < 0.45 ? 'car' : r < 0.65 ? 'bus' : 'cng');
    }
  }

  /** Impatient honking: one to three blasts. */
  horn(at: THREE.Vector3, kind: HornKind) {
    const v = this.voice(at, 1.6);
    if (!v) return;
    const [f1, f2] = HORNS[kind];
    const honks = 1 + Math.floor(Math.random() * 3);
    let t = v.t;
    for (let k = 0; k < honks; k++) {
      const dur = kind === 'cng' ? rand(0.08, 0.16) : rand(0.15, 0.5);
      const g = v.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.015);
      g.gain.setValueAtTime(0.16, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      const lp = v.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = kind === 'bus' ? 1400 : 2400;
      lp.connect(g).connect(v.out);
      for (const f of [f1, f2]) {
        const o = v.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f * rand(0.98, 1.02);
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.08);
      }
      t += dur + rand(0.07, 0.18);
    }
  }

  /** A rickshaw puller ringing the bell (stuck in a jam). */
  ringBell(at: THREE.Vector3) {
    const v = this.voice(at, 0.8);
    if (!v) return;
    this.bell(v, 0.22, 0);
    if (Math.random() < 0.6) this.bell(v, 0.22, rand(0.18, 0.28));
  }

  /** Heavy blow that doesn't break it: punchy thump, then a clang (metal) or a woody knock. */
  hammerHit(at: THREE.Vector3, material: Material) {
    const v = this.voice(at, 1.2, 0.35);
    if (!v) return;
    this.thud(v, 1.1, rand(120, 150), 0.25, 45);
    this.thud(v, 0.7, 70, 0.35, 30);
    this.noiseHit(v, 0.9, 'highpass', 1800, 0.7, 0.04, 0);
    if (material === 'metal') {
      this.clank(v, 0.6, rand(0.9, 1.15));
      this.crunch(v, 0.35, 3000, 900, 0.18, 0.01);
    } else {
      this.crack(v, 0.8, 0.14);
      this.crunch(v, 0.4, 1600, 500, 0.16, 0.01);
    }
  }

  /**
   * Movie-style destruction: sub-bass drop, sharp impact, distorted crunch, groaning metal or
   * splintering wood, scattering debris and a rumbling tail, all washed in reverb.
   */
  smash(at: THREE.Vector3, material: Material) {
    const v = this.voice(at, 2.8, 0.6);
    if (!v) return;
    const metal = material === 'metal';
    // Body: two falling sub tones.
    this.thud(v, 1.4, 95, 0.7, 28);
    this.thud(v, 0.9, 55, 1.0, 22);
    // Transient crack of the impact.
    this.noiseHit(v, 1.3, 'highpass', 1500, 0.6, 0.05, 0);
    // Gritty, sweeping crunch.
    this.crunch(v, 0.9, metal ? 3400 : 2200, metal ? 700 : 450, 0.45, 0.01);
    if (metal) {
      // Twisting sheet metal: inharmonic partials bending down in pitch, plus a low groan.
      for (const [f, d] of [[311, 0], [523, 0.03], [877, 0.06], [1460, 0.02]] as const) this.bend(v, 0.12, f, 0.75, 0.9, d);
      this.groan(v, 0.3, 82, 38, 0.9);
      this.zap(v, 0.25);
      this.clank(v, 0.4, rand(1.3, 1.6), 0.12);
    } else {
      // Splintering: a fast run of sharp cracks, then a lower wooden collapse.
      for (let k = 0; k < 7; k++) this.crack(v, rand(0.35, 0.7), rand(0.05, 0.1), k * rand(0.03, 0.06));
      this.thud(v, 0.6, 160, 0.3, 70);
    }
    // Debris raining down, then a rumbling tail.
    for (let k = 0; k < 14; k++) {
      this.clack(v, rand(0.08, 0.28), metal ? rand(2500, 6500) : rand(700, 2400), 0.15 + Math.pow(Math.random(), 1.6) * 1.3);
    }
    this.noiseHit(v, 0.55, 'lowpass', 260, 0.7, 1.6, 0.05);
  }

  /** A damaged battery shorting out: an electric fizz with a few sharp snaps. */
  shortCircuit(at: THREE.Vector3, vol = 1) {
    const v = this.voice(at, 0.8, 0.2);
    if (!v) return;
    this.zap(v, 0.5 * vol);
    for (let k = 0; k < 3; k++) this.clack(v, rand(0.1, 0.25) * vol, rand(4000, 8000), k * rand(0.03, 0.08));
  }

  /** Whoosh of the hammer cutting the air. */
  whoosh(at: THREE.Vector3, heavy: boolean) {
    const v = this.voice(at, 0.9, 0.1);
    if (!v) return;
    const src = v.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = v.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    const t = v.t, dur = heavy ? 0.6 : 0.35;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(heavy ? 1100 : 1600, t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(heavy ? 1.3 : 0.9, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(v.out);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  /** Soft footstep on asphalt or pavers. */
  footstep(at: THREE.Vector3, running: boolean) {
    const v = this.voice(at, 0.2);
    if (!v) return;
    this.noiseHit(v, running ? 0.18 : 0.1, 'bandpass', rand(500, 800), 1.5, 0.06, 0);
    this.thud(v, running ? 0.25 : 0.15, 90, 0.07, 50);
  }

  slam(at: THREE.Vector3) {
    const v = this.voice(at, 1.2);
    if (!v) return;
    this.thud(v, 1.3, 75, 0.6, 28);
    this.burst(v, 0.6, 420, 0.5);
  }

  /** Two rickshaws colliding: a metal bang and an angry bell. */
  crash(at: THREE.Vector3) {
    const v = this.voice(at, 0.9);
    if (!v) return;
    this.thud(v, 0.7, rand(130, 160), 0.2);
    this.clank(v, 0.5, rand(1.0, 1.3));
    this.burst(v, 0.35, 3000, 0.25);
    this.bell(v, 0.3, 0.12);
    this.bell(v, 0.3, 0.32);
  }

  // ---- building blocks -----------------------------------------------------


  /** Output chain for one sound at a world position, or null if inaudible. */
  private voice(at: THREE.Vector3, length: number, wet = 0): { out: AudioNode; t: number; ctx: AudioContext } | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || this.voices >= MAX_VOICES) return null;
    _d.subVectors(at, this.listener);
    const dist = _d.length();
    if (dist > MAX_DIST) return null;
    const gain = ctx.createGain();
    gain.gain.value = 1 / (1 + (dist * dist) / 150);
    const pan = ctx.createStereoPanner();
    pan.pan.value = dist > 0.5 ? THREE.MathUtils.clamp(_d.setY(0).normalize().dot(this.right), -1, 1) * 0.8 : 0;
    gain.connect(pan).connect(this.master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.reverb);
    }
    this.voices++;
    setTimeout(() => {
      this.voices--;
      gain.disconnect();
    }, (length + 0.3) * 1000);
    return { out: gain, t: ctx.currentTime, ctx };
  }

  private env(ctx: AudioContext, out: AudioNode, t: number, peak: number, decay: number) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(out);
    return g;
  }

  /** Low body thump with a falling pitch. */
  private thud(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, freq: number, decay: number, endFreq = 40) {
    const o = v.ctx.createOscillator();
    o.frequency.setValueAtTime(freq, v.t);
    o.frequency.exponentialRampToValueAtTime(endFreq, v.t + decay);
    o.connect(this.env(v.ctx, v.out, v.t, vol, decay + 0.05));
    o.start(v.t);
    o.stop(v.t + decay + 0.1);
  }

  /** Inharmonic metallic ring (sheet metal / frame). */
  private clank(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, pitch: number, delay = 0) {
    const t = v.t + delay;
    for (const [f, type] of [[523, 'square'], [847, 'triangle'], [1373, 'square'], [2210, 'triangle']] as const) {
      const o = v.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * pitch;
      o.connect(this.env(v.ctx, v.out, t, vol * 0.18, rand(0.25, 0.45)));
      o.start(t);
      o.stop(t + 0.5);
    }
    this.clack(v, vol * 0.6, 5000, delay);
  }

  /** Splintering wood: band-passed noise snap. */
  private crack(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, decay: number, delay = 0) {
    this.noiseHit(v, vol, 'bandpass', rand(900, 1400), 1.2, decay, delay);
  }

  /** Broad noise explosion. */
  private burst(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, cutoff: number, decay: number) {
    this.noiseHit(v, vol, 'lowpass', cutoff, 0.7, decay, 0);
  }

  private clack(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, freq: number, delay: number) {
    this.noiseHit(v, vol, 'bandpass', freq, 3, 0.05, delay);
  }

  private noiseHit(
    v: { out: AudioNode; t: number; ctx: AudioContext },
    vol: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    decay: number,
    delay: number,
  ) {
    const t = v.t + delay;
    const src = v.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = v.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(v.ctx, v.out, t, vol, decay));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  /** Distorted noise with a falling band: the gritty "crunch" of something giving way. */
  private crunch(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, from: number, to: number, decay: number, delay: number) {
    const t = v.t + delay;
    const src = v.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = v.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + decay);
    const pre = v.ctx.createGain();
    pre.gain.value = 3;
    const shaper = v.ctx.createWaveShaper();
    shaper.curve = this.crunchCurve as Float32Array<ArrayBuffer>;
    src.connect(f).connect(pre).connect(shaper).connect(this.env(v.ctx, v.out, t, vol * 0.5, decay));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  /** A metallic partial that bends down in pitch as it rings out. */
  private bend(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, freq: number, drop: number, decay: number, delay: number) {
    const t = v.t + delay;
    const o = v.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * rand(0.97, 1.03), t);
    o.frequency.exponentialRampToValueAtTime(freq * drop, t + decay);
    o.connect(this.env(v.ctx, v.out, t, vol, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** Low, filtered sawtooth sliding down: metal frame buckling. */
  private groan(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, from: number, to: number, decay: number) {
    const o = v.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, v.t);
    o.frequency.exponentialRampToValueAtTime(to, v.t + decay);
    const f = v.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    o.connect(f).connect(this.env(v.ctx, v.out, v.t, vol, decay));
    o.start(v.t);
    o.stop(v.t + decay + 0.05);
  }

  /** Electric fizz from a cracked battery. */
  private zap(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number) {
    const o = v.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, v.t);
    o.frequency.linearRampToValueAtTime(60, v.t + 0.35);
    const f = v.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 600;
    o.connect(f).connect(this.env(v.ctx, v.out, v.t, vol, 0.35));
    o.start(v.t);
    o.stop(v.t + 0.4);
  }

  /** Rickshaw bell: "tring" — two bright partials with a fast warble. */
  private bell(v: { out: AudioNode; t: number; ctx: AudioContext }, vol: number, delay: number) {
    const t = v.t + delay;
    const g = this.env(v.ctx, v.out, t, vol, 0.35);
    const trem = v.ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = v.ctx.createOscillator();
    lfo.frequency.value = 28;
    const depth = v.ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(trem.gain);
    trem.connect(g);
    for (const f of [2093, 2637]) {
      const o = v.ctx.createOscillator();
      o.frequency.value = f;
      o.connect(trem);
      o.start(t);
      o.stop(t + 0.4);
    }
    lfo.start(t);
    lfo.stop(t + 0.4);
  }
}
