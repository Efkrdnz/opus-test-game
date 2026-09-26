// Bedside-monitor sweep traces and their signal generators.
import { clamp, rand } from '../util.js';

const gauss = (x, mu, sd) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));

// Heartbeat clock shared by ECG and pleth so they stay in phase.
export class BeatClock {
  constructor() { this.sinceBeat = 0; this.interval = 0.83; this.beats = 0; this.onBeat = null; }
  update(dt, body) {
    this.sinceBeat += dt;
    const pumping = body.alive && !body.stasis && body.rhythm !== 'vfib' && body.rhythm !== 'asystole' && body.vitals.hr > 5;
    if (!pumping) return;
    if (this.sinceBeat >= this.interval) {
      this.sinceBeat = 0;
      this.beats++;
      const base = 60 / clamp(body.vitals.hr, 10, 300);
      this.interval = body.rhythm === 'afib' ? base * rand(0.55, 1.45) : base;
      if (this.onBeat) this.onBeat(body);
    }
  }
}

export function ecgValue(body, clock, time) {
  if (body.gone) return 0;
  const noise = (Math.random() - 0.5) * 0.02;
  if (body.stasis || (!body.alive && !body.undead)) return noise * 0.5;
  if (body.undead) return noise + (Math.sin(time * 0.7) > 0.995 ? 0.2 : 0);
  if (body.rhythm === 'asystole') return noise;
  if (body.rhythm === 'vfib') return 0.45 * Math.sin(time * 31) * Math.sin(time * 3.3 + 1) + 0.25 * Math.sin(time * 47 + 2) + noise;
  const t = clock.sinceBeat;
  const w = clamp(clock.interval / 0.83, 0.5, 1.4);
  let v = 0;
  if (body.rhythm !== 'afib') v += 0.12 * gauss(t, 0.06 * w, 0.02);
  else v += 0.04 * Math.sin(time * 45) + 0.03 * Math.sin(time * 61);
  v -= 0.12 * gauss(t, 0.14, 0.008);
  v += 1.0 * gauss(t, 0.16, 0.009);
  v -= 0.28 * gauss(t, 0.185, 0.01);
  const stElev = body.organs.heart.health < 50 ? (50 - body.organs.heart.health) / 150 : 0;
  v += stElev * gauss(t, 0.25, 0.05);
  v += 0.28 * gauss(t, 0.33 * w, 0.045 * w);
  return v + noise;
}

export function plethValue(body, clock) {
  if (!body.alive || body.stasis || body.rhythm === 'vfib' || body.rhythm === 'asystole') return (Math.random() - 0.5) * 0.02;
  const t = clock.sinceBeat - 0.12;
  if (t < 0) return 0.08;
  const amp = clamp(body.perfusion ?? 1, 0.05, 1) * clamp(body.vitals.spo2 / 98, 0.2, 1);
  const up = t < 0.1 ? t / 0.1 : 1;
  const down = Math.exp(-Math.max(0, t - 0.1) * 4);
  const notch = 0.12 * gauss(t, 0.3, 0.03);
  return amp * (up * down + notch);
}

export function respValue(body, time, state) {
  if (!body.alive || body.stasis) return 0;
  state.ph = (state.ph || 0) + (1 / 60) * body.vitals.rr * (state.dt || 0) * Math.PI * 2;
  const depth = clamp(0.3 + (body.vitals.rr > 0 ? 0.7 : 0) - (body.effects.sedative || 0) * 0.08, 0.05, 1);
  return Math.sin(state.ph) * depth * (body.vitals.rr > 1 ? 1 : 0);
}

export function eegValue(body, time) {
  const n = () => (Math.random() - 0.5);
  if (body.gone || (!body.alive && !body.undead)) return n() * 0.03;
  if (body.stasis) return n() * 0.02;
  const bh = clamp(body.organs.brain.health / 100, 0, 1);
  if (body.undead) return (Math.sin(time * 2 * Math.PI * 1.5) * 0.35 + n() * 0.1) * bh;
  if (body.seizure > 0) {
    const ph = (time * 3) % 1;
    return (ph < 0.08 ? 1.1 : 0) - 0.5 * Math.sin(ph * Math.PI * 2) + n() * 0.15;
  }
  const E = body.effects;
  const c = body.vitals.consciousness / 100;
  let v = 0;
  if (body.sleeping || c < 0.25) v += 0.7 * Math.sin(time * 2 * Math.PI * 1.8) + 0.3 * Math.sin(time * 2 * Math.PI * 0.9 + 1);
  else {
    v += 0.28 * Math.sin(time * 2 * Math.PI * 10) * (1 - clamp((E.stimulant || 0) * 0.3, 0, 0.8));
    v += 0.18 * Math.sin(time * 2 * Math.PI * (18 + (E.stimulant || 0) * 4));
    if ((E.sedative || 0) > 0.8) v += 0.35 * Math.sin(time * 2 * Math.PI * 6);
    if ((body.hallucination || 0) > 0.8 || (E.intellect || 0) > 0.8) v += 0.25 * Math.sin(time * 2 * Math.PI * 40) * (0.5 + 0.5 * Math.sin(time * 3));
  }
  return (v + n() * 0.25) * bh * (0.35 + 0.65 * c + (body.sleeping ? 0.4 : 0));
}

// A sweeping trace: the pen moves left→right and erases just ahead of itself.
export class Sweep {
  constructor(canvas, color, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = color;
    this.speed = opts.speed || 90; // css px / second
    this.gain = opts.gain || 0.42;
    this.x = 0;
    this.lastY = null;
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.x = 0; this.lastY = null;
  }
  push(dt, sample) {
    const ctx = this.ctx;
    const steps = Math.max(1, Math.ceil(this.speed * dt / 2));
    for (let i = 0; i < steps; i++) {
      const v = sample(i / steps);
      const x0 = this.x;
      this.x += (this.speed * dt) / steps;
      if (this.x > this.w) { this.x = 0; this.lastY = null; }
      const y = this.h / 2 - v * this.h * this.gain;
      ctx.clearRect(this.x, 0, 14, this.h);
      if (this.lastY !== null && this.x > x0) {
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x0, this.lastY); ctx.lineTo(this.x, y); ctx.stroke();
      }
      this.lastY = y;
    }
  }
}
