// Small shared helpers. Bundling convention for the whole project: every
// top-level name is unique across all modules, imports are plain named imports.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Move `v` toward `target` exponentially with rate per second.
export const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

export function weightedPick(entries) {
  // entries: [[item, weight], ...]
  let total = 0;
  for (const e of entries) total += Math.max(0, e[1]);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}

let uidCounter = 0;
export const uid = (p = 'id') => `${p}${++uidCounter}`;

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const c = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Weighted blend of colours: [[hex, weight], ...]
export function blendColors(list) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const [hex, wt] of list) {
    if (!hex || wt <= 0) continue;
    const c = hexToRgb(hex);
    r += c[0] * wt; g += c[1] * wt; b += c[2] * wt; w += wt;
  }
  if (w === 0) return '#888888';
  return rgbToHex(r / w, g / w, b / w);
}

export function mixHex(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t));
}

export const fmtNum = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '--');

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Fixed-size numeric ring buffer for vital-sign history.
export class Ring {
  constructor(size) { this.buf = new Float32Array(size); this.size = size; this.len = 0; this.head = 0; }
  push(v) { this.buf[this.head] = v; this.head = (this.head + 1) % this.size; this.len = Math.min(this.len + 1, this.size); }
  // i = 0 oldest .. len-1 newest
  get(i) { return this.buf[(this.head - this.len + i + this.size * 2) % this.size]; }
  last() { return this.len ? this.get(this.len - 1) : 0; }
}
