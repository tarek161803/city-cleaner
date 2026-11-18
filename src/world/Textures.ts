import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/** Procedural canvas textures for the street: worn asphalt, brick pavers, striped kerbs, facades. */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const grey = (v: number) => `rgb(${v},${v},${v})`;

/** Worn grey asphalt with speckle, darker repair patches and cracks. One tile ≈ 8 m. */
export function asphaltTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = mulberry32(5);
  g.fillStyle = '#6a6966';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = 85 + Math.floor(r() * 45);
    g.fillStyle = grey(v);
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  // Patches of newer, darker tar.
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(45,45,45,${0.1 + r() * 0.15})`;
    g.beginPath();
    const cx = r() * S, cy = r() * S, w = 30 + r() * 90, h = 20 + r() * 60;
    g.moveTo(cx, cy);
    g.lineTo(cx + w, cy + r() * 10);
    g.lineTo(cx + w - r() * 10, cy + h);
    g.lineTo(cx + r() * 10, cy + h - r() * 8);
    g.fill();
  }
  // Cracks.
  g.strokeStyle = 'rgba(35,35,35,0.45)';
  for (let i = 0; i < 10; i++) {
    g.lineWidth = 0.8 + r() * 0.8;
    g.beginPath();
    let x = r() * S, y = r() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 22;
      y += (r() - 0.5) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c);
}

/** Red, brown and grey brick pavers in a running bond. One tile ≈ 1.6 m. */
export function paverTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = mulberry32(9);
  g.fillStyle = '#5b5248';
  g.fillRect(0, 0, S, S);
  const colors = ['#a2513c', '#93482f', '#8c8782', '#a39d93', '#b0603f', '#7d7670'];
  const bw = 64, bh = 32;
  for (let row = 0; row < S / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x + off + 2, row * bh + bh - 8, bw - 4, 6);
    }
  }
  return toTexture(c);
}

/** Yellow and black kerb stripes: two stripes per texture width (≈ 1 m). */
export function kerbTexture() {
  const [c, g] = canvas(128, 16);
  g.fillStyle = '#f0c22e';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#1c1c1c';
  g.fillRect(64, 0, 64, 16);
  return toTexture(c);
}

/**
 * One floor × one bay of plaster facade, tinted per building. Variants:
 * 0 grilled window under a sunshade, 1 balcony door with railing, 2 wide sliding window with an AC unit.
 */
export function plasterTexture(variant = 0) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // Floor band (slab edge).
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 120, 128, 8);
  if (variant === 0) {
    g.fillStyle = '#d4d4d4';
    g.fillRect(20, 22, 88, 8);
    windowWithFrame(g);
  } else if (variant === 1) {
    g.fillStyle = '#d4d4d4';
    g.fillRect(24, 12, 80, 7);
    g.fillStyle = '#e9e4da';
    g.fillRect(36, 20, 56, 100);
    g.fillStyle = '#3b2f2a';
    g.fillRect(40, 24, 48, 96);
    g.fillStyle = 'rgba(160,190,210,0.3)';
    g.fillRect(40, 24, 22, 60);
    g.fillStyle = '#9ca3af';
    for (let x = 30; x < 100; x += 8) g.fillRect(x, 82, 3, 38);
    g.fillRect(26, 80, 76, 4);
  } else {
    g.fillStyle = '#e9e4da';
    g.fillRect(14, 30, 100, 56);
    g.fillStyle = '#334155';
    g.fillRect(18, 34, 92, 48);
    g.fillStyle = 'rgba(170,200,220,0.35)';
    g.fillRect(18, 34, 46, 48);
    g.fillStyle = '#cbd5e1';
    g.fillRect(63, 34, 3, 48);
    // AC unit below the window.
    g.fillStyle = '#f1f5f9';
    g.fillRect(74, 92, 34, 20);
    g.fillStyle = '#94a3b8';
    for (let y = 96; y < 110; y += 4) g.fillRect(78, y, 26, 2);
  }
  return toTexture(c);
}

/**
 * One floor × one bay of the other common Dhaka apartment finishes (white, so it takes the building's
 * tint): 0 small square ceramic tile cladding around a wide window with a decorative grill,
 * 1 weathered cement plaster with dark monsoon stains streaking down from the sill and slab edge.
 */
export function claddingTexture(variant = 0) {
  const [c, g] = canvas(128, 128);
  const r = mulberry32(13 + variant);
  if (variant === 0) {
    // Tiles: slightly uneven shades with pale grout lines.
    g.fillStyle = '#d9d9d6';
    g.fillRect(0, 0, 128, 128);
    const t = 8;
    for (let y = 0; y < 128; y += t) {
      for (let x = 0; x < 128; x += t) {
        const v = Math.round(236 + r() * 19);
        g.fillStyle = `rgb(${v},${v},${v - 4})`;
        g.fillRect(x + 1, y + 1, t - 1, t - 1);
      }
    }
    g.fillStyle = '#c9c9c4';
    g.fillRect(0, 118, 128, 10);
    // Wide window with a curly decorative grill, framed in plain plaster.
    g.fillStyle = '#efece6';
    g.fillRect(14, 26, 100, 72);
    g.fillStyle = '#2f3d48';
    g.fillRect(18, 30, 92, 64);
    g.fillStyle = 'rgba(160,190,210,0.3)';
    g.fillRect(18, 30, 44, 64);
    g.strokeStyle = '#7c7c7c';
    g.lineWidth = 2;
    for (let x = 18; x <= 110; x += 23) g.strokeRect(x, 30, 23, 64);
    for (let x = 29.5; x < 110; x += 23) {
      for (const y of [46, 78]) {
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.fillStyle = '#d4d0c8';
    g.fillRect(10, 98, 108, 6);
  } else {
    // Cement plaster: blotchy grey, darker toward the bottom where the rain runs.
    g.fillStyle = '#e4e4e0';
    g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 160; k++) {
      const v = Math.round(200 + r() * 40);
      g.fillStyle = `rgba(${v},${v},${v - 6},0.35)`;
      g.fillRect(r() * 128, r() * 128, 4 + r() * 14, 3 + r() * 10);
    }
    // Sunshade slab over a grilled window.
    g.fillStyle = '#cfcfca';
    g.fillRect(18, 20, 92, 9);
    windowWithFrame(g);
    // Monsoon streaks: dark trails running down from the sunshade, the sill and the floor slab.
    for (const [y0, len] of [[29, 10], [102, 26], [0, 18]] as const) {
      for (let k = 0; k < 9; k++) {
        const x = 16 + r() * 96, l = len * (0.4 + r());
        const grad = g.createLinearGradient(0, y0, 0, y0 + l);
        grad.addColorStop(0, 'rgba(70,72,68,0.45)');
        grad.addColorStop(1, 'rgba(70,72,68,0)');
        g.fillStyle = grad;
        g.fillRect(x, y0, 2 + r() * 4, l);
      }
    }
    g.fillStyle = '#d2d2cd';
    g.fillRect(0, 120, 128, 8);
  }
  return toTexture(c);
}

/** Blue-green curtain-wall glass with mullions, for the odd office tower. */
export function glassTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#6fa3b8');
  grad.addColorStop(1, '#2e5d73');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(10, 10, 40, 100);
  g.fillStyle = '#c7d2d9';
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 0, 4, 128);
  g.fillRect(62, 0, 3, 128);
  return toTexture(c);
}

/** Ground-floor shopfronts, two bays per tile: a rolled-down shutter, then an open shop full of goods. */
export function shutterTexture() {
  const [c, g] = canvas(256, 128);
  const r = mulberry32(21);
  g.fillStyle = '#d9d4ca';
  g.fillRect(0, 0, 256, 128);
  // Closed shutter.
  g.fillStyle = '#8f969c';
  g.fillRect(8, 26, 112, 102);
  g.fillStyle = '#737a80';
  for (let y = 30; y < 128; y += 6) g.fillRect(8, y, 112, 2);
  g.fillStyle = '#5b6066';
  g.fillRect(56, 116, 16, 6);
  // Open shop: dark interior, lit shelves of colourful stock, a counter.
  g.fillStyle = '#2a211c';
  g.fillRect(136, 26, 112, 102);
  g.fillStyle = 'rgba(255,230,160,0.25)';
  g.fillRect(136, 26, 112, 30);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 34 + shelf * 18;
    g.fillStyle = '#6b4a2b';
    g.fillRect(140, y + 12, 104, 3);
    for (let x = 142; x < 242; x += 7) {
      g.fillStyle = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#1982c4', '#ffffff', '#8ac926'][Math.floor(r() * 7)];
      g.fillRect(x, y + 2 + r() * 3, 5, 10);
    }
  }
  g.fillStyle = '#8b5a2b';
  g.fillRect(140, 104, 104, 24);
  // Shutter box above each opening.
  g.fillStyle = '#a3a3a3';
  g.fillRect(4, 18, 120, 8);
  g.fillRect(132, 18, 120, 8);
  return toTexture(c);
}

/** How a shop signboard is painted. */
export interface SignStyle {
  main: string;
  sub?: string;
  bg: string;
  /** Second colour for bands, stripes and the badge. */
  bg2: string;
  fg: string;
  look: 'plain' | 'band' | 'stripes' | 'badge';
}

/** Atlas of shop signboards, one per row, each in its own style. Rows are 1024 × 160. */
export function signAtlasTexture(signs: SignStyle[]) {
  const W = 1024, H = 160;
  const [c, g] = canvas(W, H * signs.length);
  const font = '"Kohinoor Bangla", "Bangla Sangam MN", "Noto Sans Bengali", sans-serif';
  signs.forEach((s, i) => {
    const y = i * H;
    g.fillStyle = s.bg;
    g.fillRect(0, y, W, H);
    let left = 20, right = W - 20;
    if (s.look === 'band') {
      g.fillStyle = s.bg2;
      g.fillRect(0, y + H - 34, W, 34);
    } else if (s.look === 'stripes') {
      g.fillStyle = s.bg2;
      for (let k = 0; k < 3; k++) {
        g.fillRect(0, y + 10 + k * 10, W, 4);
        g.fillRect(0, y + H - 14 - k * 10, W, 4);
      }
    } else if (s.look === 'badge') {
      g.fillStyle = s.bg2;
      g.beginPath();
      g.arc(90, y + H / 2, 56, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = s.bg;
      g.font = `bold 64px ${font}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(s.main.slice(0, 1), 90, y + H / 2 + 22);
      left = 160;
    }
    g.strokeStyle = s.fg;
    g.lineWidth = 6;
    g.strokeRect(8, y + 8, W - 16, H - 16);
    g.fillStyle = s.fg;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const cx = (left + right) / 2, maxW = right - left - 20;
    if (s.sub) {
      g.font = `bold 66px ${font}`;
      g.fillText(s.main, cx, y + 78, maxW);
      g.font = `bold 30px ${font}`;
      g.fillStyle = s.look === 'band' ? s.bg : s.fg;
      g.fillText(s.sub, cx, y + H - 22, maxW);
    } else {
      g.font = `bold 76px ${font}`;
      g.fillText(s.main, cx, y + 100, maxW);
    }
  });
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Rooftop billboard ads (2 × 2 atlas): [headline, tagline, background, accent]. */
export function billboardTexture(ads: [string, string, string, string][]) {
  const W = 512, H = 192;
  const [c, g] = canvas(W * 2, H * 2);
  const font = '"Kohinoor Bangla", "Bangla Sangam MN", "Noto Sans Bengali", sans-serif';
  ads.slice(0, 4).forEach(([head, tag, bg, accent], i) => {
    const x = (i % 2) * W, y = Math.floor(i / 2) * H;
    g.fillStyle = bg;
    g.fillRect(x, y, W, H);
    g.fillStyle = accent;
    g.beginPath();
    g.arc(x + W - 70, y + 70, 90, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x, y + H - 40, W, 40);
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `bold 56px ${font}`;
    g.fillText(head, x + 24, y + 86, W - 150);
    g.font = `bold 28px ${font}`;
    g.fillText(tag, x + 24, y + 130, W - 150);
    g.fillStyle = bg;
    g.font = `bold 22px sans-serif`;
    g.fillText('০১৭XX-XXXXXX', x + 24, y + H - 12);
  });
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function windowWithFrame(g: CanvasRenderingContext2D) {
  g.fillStyle = '#e9e4da';
  g.fillRect(26, 32, 76, 64);
  g.fillStyle = '#2f3d48';
  g.fillRect(30, 36, 68, 56);
  g.fillStyle = 'rgba(160,190,210,0.35)';
  g.fillRect(30, 36, 30, 56);
  g.strokeStyle = '#7c7c7c';
  g.lineWidth = 3;
  for (let x = 40; x < 98; x += 10) {
    g.beginPath();
    g.moveTo(x, 36);
    g.lineTo(x, 92);
    g.stroke();
  }
  g.fillStyle = '#cfcac0';
  g.fillRect(22, 96, 84, 6);
}
