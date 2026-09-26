// The observation chamber: background, props, particles, speech and banners.
import { clamp, lerp, rand, pick, rgba, mixHex, chance } from '../util.js';
import { PX_PER_M, neutralPose, targetPose, blendPose, solveRig, DIM } from './rig.js';
import { drawAnatomy, hitTest } from './anatomy.js';

export const LOGICAL_H = 600;
const FLOOR_Y = 540;

const TRANSFORM_COLORS = {
  stone: '#9a9a90', zombie: '#8a9a70', werewolf: '#b5763c', vampire: '#c0102a', ghost: '#b8f2ff', crystal: '#9ff5ea',
  metal: '#b8c2cc', gold: '#ffd24a', elastic: '#ff9ad5', divine: '#ffe9a0',
};

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------
export class FX {
  constructor() { this.parts = []; this.flash = 0; this.flashColor = '#ffffff'; this.shake = 0; this.fog = null; this.beam = 0; }
  add(p) { if (this.parts.length < 900) this.parts.push({ life: 1, age: 0, vx: 0, vy: 0, g: 0, size: 3, rot: 0, ...p }); }
  burst(kind, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(o.minSp ?? 20, o.maxSp ?? 120);
      this.add({ kind, x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), life: rand(o.minLife ?? 0.4, o.maxLife ?? 1.1), size: rand(o.minSize ?? 2, o.maxSize ?? 5), color: o.color, g: o.g ?? 0, text: o.text });
    }
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.beam = Math.max(0, this.beam - dt * 0.35);
    if (this.fog) { this.fog.t += dt; if (this.fog.t > this.fog.dur) this.fog = null; }
    const keep = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += dt * 3;
      if (p.kind === 'fire' || p.kind === 'smoke') { p.vx *= 1 - dt * 1.5; }
      if (p.floor && p.y > FLOOR_Y) { p.y = FLOOR_Y; p.vy = 0; p.vx *= 0.5; }
      keep.push(p);
    }
    this.parts = keep;
  }
  draw(ctx) {
    for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(k * 1.2, 0, 1);
      switch (p.kind) {
        case 'fire': {
          const r = p.size * (1 + p.age / p.life);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, rgba('#fff2b0', k)); g.addColorStop(0.4, rgba('#ff9a2a', k * 0.9)); g.addColorStop(1, rgba('#ff3a0a', 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'smoke': ctx.fillStyle = rgba(p.color || '#6a6a70', 0.35 * k); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.age * 2), 0, Math.PI * 2); ctx.fill(); break;
        case 'spark': ctx.strokeStyle = p.color || '#fff27a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break;
        case 'drop': case 'blood': case 'vomit':
          ctx.fillStyle = p.color || (p.kind === 'blood' ? '#b3202e' : p.kind === 'vomit' ? '#9ab83a' : '#bfe6ff');
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.7, p.size, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'ice': ctx.fillStyle = '#e8f8ff'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); break;
        case 'mote': { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2); g.addColorStop(0, rgba(p.color || '#ffffff', k)); g.addColorStop(1, rgba(p.color || '#ffffff', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2); ctx.fill(); break; }
        case 'ring': ctx.strokeStyle = p.color || '#ffffff'; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.age * (p.speed || 160), 0, Math.PI * 2); ctx.stroke(); break;
        case 'bubble': ctx.strokeStyle = rgba(p.color || '#e8f4ff', 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); break;
        case 'text': case 'glyph':
          ctx.fillStyle = p.color || '#ffffff';
          ctx.font = `${p.kind === 'text' ? '700' : '400'} ${p.size}px ${p.kind === 'text' ? '"Chakra Petch", system-ui, sans-serif' : 'system-ui, sans-serif'}`;
          ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); break;
        case 'psy': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.strokeStyle = p.color; ctx.lineWidth = 2;
          if (p.shape === 0) { ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); ctx.fill(); }
          else if (p.shape === 1) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.lineTo(Math.cos(a) * p.size * 1.5, Math.sin(a) * p.size * 1.5); ctx.lineTo(Math.cos(a + 0.6) * p.size * 0.6, Math.sin(a + 0.6) * p.size * 0.6); } ctx.closePath(); ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-p.size * 2, -p.size * 2, -p.size * 2, p.size, 0, 0); ctx.bezierCurveTo(p.size * 2, -p.size * 2, p.size * 2, p.size, 0, 0); ctx.stroke(); }
          ctx.restore(); break;
        }
        case 'bolt': {
          ctx.strokeStyle = p.color || '#bfe8ff'; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          let x = p.x, y = p.y;
          for (let i = 0; i < 5; i++) { x += rand(-12, 12); y += p.size / 5; ctx.lineTo(x, y); }
          ctx.stroke(); ctx.shadowBlur = 0; break;
        }
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------
export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new FX();
    this.pose = neutralPose();
    this.hits = [];
    this.zoom = 1;
    this.W = 960;
    this.dpr = 1;
    this.rig = null;
    this.emit = {};
    this.lastSeenGone = false;
    this.camX = 0;
    this.camY = 0;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.cssW = r.width; this.cssH = r.height;
    this.k = r.height / LOGICAL_H;
    this.W = r.width / this.k;
  }

  // CSS pixel → logical
  toLogical(x, y) { return { x: x / this.k, y: y / this.k - this.camY }; }

  hit(x, y) { const p = this.toLogical(x, y); return hitTest(this.hits, p.x, p.y); }

  view(body) {
    const fit = clamp(this.W / 900, 0.62, 1);
    const sz = body.size;
    const zoomT = sz > 1.5 ? 1.5 / sz : sz < 0.55 ? Math.min(1.6, 0.55 / sz) : 1;
    return { fit, zoomT };
  }

  render(state, dt, time) {
    const { body, actor, env, opts } = state;
    const ctx = this.ctx;
    const { fit, zoomT } = this.view(body);
    this.zoom = lerp(this.zoom, zoomT, 1 - Math.exp(-Math.max(dt, 0.016) * 2));
    const scale = 1.4 * fit * this.zoom;
    const pxPerM = PX_PER_M * scale;
    // camera follows the subject, but never shows past the chamber walls
    const halfView = this.W / 2 / pxPerM;
    const limit = Math.max(0, 2.9 - halfView);
    const want = clamp(this.camX, actor.x - halfView * 0.45, actor.x + halfView * 0.45);
    this.camX = clamp(lerp(this.camX, want, 1 - Math.exp(-Math.max(dt, 0.016) * 4)), -limit, limit);
    const view = { cx: this.W / 2 - this.camX * pxPerM, floorY: FLOOR_Y, scale, pxPerM, time };

    // vertical camera: rise with jumps and levitation so the head stays in frame
    let top = 200;
    if (this.rig) { const P = this.rig.P, rs = this.rig.s; top = Math.min(P.head.y - 26 * rs, P.toL.y - 10 * rs, P.toR.y - 10 * rs, P.knL.y, P.knR.y); }
    const wantY = clamp(40 - top, 0, 2000);
    this.camY = lerp(this.camY, wantY, 1 - Math.exp(-Math.max(dt, 0.016) * 5));
    ctx.setTransform(this.dpr * this.k, 0, 0, this.dpr * this.k, 0, 0);
    ctx.translate(0, this.camY);
    // camera shake
    const sh = this.fx.shake + actor.shake * 0.3;
    if (sh > 0) ctx.translate(rand(-8, 8) * sh, rand(-6, 6) * sh);

    this.drawChamber(ctx, view, env, body, time);

    // pose & rig
    actor.yaw = lerp(actor.yaw, (actor.facing || 0) * 0.75, 1 - Math.exp(-dt * 8));
    const target = targetPose(actor, body, time);
    const frozen = body.stasis ? 0 : 1;
    const rate = actor.action === 'seizure' ? 30 : actor.action === 'punch' || actor.action === 'kick' ? 22 : 9;
    this.pose = frozen ? blendPose(this.pose, target, 1 - Math.exp(-dt * rate * (1 - (target.frozen || 0) * 0.9))) : this.pose;
    for (const k of ['barbellKg', 'punchArm', 'fire', 'flex', 'jitter', 'faceSide']) this.pose[k] = target[k];
    const rig = body.gone ? null : solveRig(this.pose, actor, body, view);
    this.rig = rig;

    if (rig) {
      this.drawPropsBehind(ctx, view, actor, body, rig, time);
      this.hits = drawAnatomy(ctx, rig, body, actor, opts, time);
      this.drawPropsFront(ctx, view, actor, body, rig, time);
      if (opts.hover) this.drawHover(ctx, opts.hover);
    } else this.hits = [];

    // effects
    this.handleFlashes(body, rig, view, actor);
    if (rig) this.emitters(body, actor, rig, dt, time, view);
    this.fx.update(dt);
    this.fx.draw(ctx);
    if (rig && actor.teleportFx > 0) {
      ctx.strokeStyle = rgba('#9aa8ff', actor.teleportFx); ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(rig.P.pelvis.x, rig.P.pelvis.y - 40 * rig.s, (40 + i * 20) * rig.s * (1.6 - actor.teleportFx), 90 * rig.s, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (rig && actor.speech) this.drawSpeech(ctx, rig, actor, body);
    ctx.translate(0, -this.camY);
    // fog overlay
    if (this.fx.fog) {
      const f = this.fx.fog;
      const a = clamp(Math.min(f.t / 3, (f.dur - f.t) / 8), 0, 1) * 0.28;
      const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
      g.addColorStop(0, rgba(f.color, a * 0.4)); g.addColorStop(1, rgba(f.color, a));
      ctx.fillStyle = g; ctx.fillRect(-20, -20, this.W + 40, LOGICAL_H + 40);
    }
    if (this.fx.beam > 0) {
      const g = ctx.createLinearGradient(view.cx - 80, 0, view.cx + 80, 0);
      const bx = this.lastPelvisX || view.cx;
      g.addColorStop(0, rgba('#fff6c2', 0)); g.addColorStop(0.5, rgba('#fff6c2', this.fx.beam * 0.9)); g.addColorStop(1, rgba('#fff6c2', 0));
      ctx.fillStyle = g; ctx.save(); ctx.translate(bx - view.cx, 0); ctx.fillRect(view.cx - 80, 0, 160, FLOOR_Y + this.camY); ctx.restore();
    }
    if (rig) this.lastPelvisX = rig.P.pelvis.x;
    // environment vignette
    this.drawEnvOverlay(ctx, env, time);
    if (this.fx.flash > 0) { ctx.fillStyle = rgba(this.fx.flashColor, clamp(this.fx.flash, 0, 1)); ctx.fillRect(-20, -20, this.W + 40, LOGICAL_H + 40); }
    this.drawBanner(ctx, body);
  }

  // ------------------------------------------------------------------------
  drawChamber(ctx, view, env, body, time) {
    const W = this.W;
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    g.addColorStop(0, '#0b171d'); g.addColorStop(1, '#13262e');
    ctx.fillStyle = g; ctx.fillRect(-20, -40 - this.camY, W + 40, FLOOR_Y + 40 + this.camY);
    // wall panels
    ctx.strokeStyle = 'rgba(120,180,200,0.07)'; ctx.lineWidth = 1;
    const panel = 150 * view.scale;
    for (let x = view.cx % panel; x < W; x += panel) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, FLOOR_Y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(W, 60); ctx.stroke();
    // ceiling light strips
    for (const lx of [W * 0.25, W * 0.5, W * 0.75]) {
      ctx.fillStyle = 'rgba(210,240,255,0.55)'; ctx.fillRect(lx - 60, 22, 120, 5);
      const cone = ctx.createLinearGradient(0, 26, 0, FLOOR_Y);
      cone.addColorStop(0, 'rgba(170,220,240,0.10)'); cone.addColorStop(1, 'rgba(170,220,240,0)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(lx - 60, 27); ctx.lineTo(lx + 60, 27); ctx.lineTo(lx + 200, FLOOR_Y); ctx.lineTo(lx - 200, FLOOR_Y); ctx.closePath(); ctx.fill();
    }
    // height chart (a stadiometer on the wall)
    const chartX = 26;
    ctx.strokeStyle = 'rgba(160,210,225,0.35)'; ctx.fillStyle = 'rgba(160,210,225,0.55)';
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'left';
    const maxM = Math.min(8, (FLOOR_Y - 40) / view.pxPerM);
    const step = maxM > 4 ? 0.5 : 0.1;
    ctx.beginPath(); ctx.moveTo(chartX, FLOOR_Y); ctx.lineTo(chartX, FLOOR_Y - maxM * view.pxPerM); ctx.stroke();
    for (let m = 0; m <= maxM + 1e-6; m += step) {
      const y = FLOOR_Y - m * view.pxPerM;
      const major = Math.abs(m * 2 - Math.round(m * 2)) < 1e-6;
      ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + (major ? 14 : 6), y); ctx.stroke();
      if (major && m > 0) ctx.fillText(`${m.toFixed(1)} m`, chartX + 17, y + 3);
    }
    // wall sign
    ctx.fillStyle = 'rgba(150,200,215,0.35)'; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`OBSERVATION CHAMBER 3  ·  ${body.name.toUpperCase()}`, W - 24, 52);
    // floor
    const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, LOGICAL_H);
    fg.addColorStop(0, '#1a2e36'); fg.addColorStop(1, '#0c171c');
    ctx.fillStyle = fg; ctx.fillRect(-20, FLOOR_Y, W + 40, LOGICAL_H - FLOOR_Y + 20);
    ctx.strokeStyle = 'rgba(120,180,200,0.10)';
    for (let i = -12; i <= 12; i++) { const x0 = view.cx + i * 80 * view.scale; ctx.beginPath(); ctx.moveTo(x0, FLOOR_Y); ctx.lineTo(view.cx + i * 150 * view.scale, LOGICAL_H); ctx.stroke(); }
    for (const y of [FLOOR_Y + 16, FLOOR_Y + 38]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // hazard edge
    ctx.save(); ctx.beginPath(); ctx.rect(0, FLOOR_Y - 3, W, 6); ctx.clip();
    for (let x = -20; x < W + 20; x += 18) { ctx.fillStyle = '#d9a52a'; ctx.beginPath(); ctx.moveTo(x, FLOOR_Y - 3); ctx.lineTo(x + 9, FLOOR_Y - 3); ctx.lineTo(x + 3, FLOOR_Y + 3); ctx.lineTo(x - 6, FLOOR_Y + 3); ctx.fill(); }
    ctx.restore();
    // walls of the chamber (movement limits)
    ctx.strokeStyle = 'rgba(120,180,200,0.12)'; ctx.setLineDash([4, 6]);
    for (const sx of [-1, 1]) { const x = view.cx + sx * 2.75 * view.pxPerM; ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x, FLOOR_Y); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  drawEnvOverlay(ctx, env, time) {
    const W = this.W;
    if (env.temp < 5) {
      const k = clamp((5 - env.temp) / 45, 0, 1);
      const g = ctx.createRadialGradient(W / 2, LOGICAL_H / 2, LOGICAL_H * 0.3, W / 2, LOGICAL_H / 2, W * 0.7);
      g.addColorStop(0, rgba('#bfe8ff', 0)); g.addColorStop(1, rgba('#bfe8ff', 0.35 * k));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, LOGICAL_H);
    } else if (env.temp > 40) {
      const k = clamp((env.temp - 40) / 60, 0, 1);
      const g = ctx.createLinearGradient(0, LOGICAL_H, 0, 0);
      g.addColorStop(0, rgba('#ff6a1a', 0.25 * k)); g.addColorStop(1, rgba('#ff6a1a', 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, LOGICAL_H);
    }
    if (env.oxygen < 15) { ctx.fillStyle = rgba('#200008', clamp((15 - env.oxygen) / 15, 0, 1) * 0.35); ctx.fillRect(0, 0, W, LOGICAL_H); }
    if (env.radiation > 0.05) {
      ctx.fillStyle = rgba('#9dff4a', clamp(env.radiation / 5, 0, 1) * 0.08); ctx.fillRect(0, 0, W, LOGICAL_H);
      for (let i = 0; i < env.radiation * 6; i++) { ctx.fillStyle = rgba('#c8ff8a', rand(0.2, 0.7)); ctx.fillRect(rand(0, W), rand(0, LOGICAL_H), 2, 2); }
    }
  }

  drawPropsBehind(ctx, view, actor, body, rig, time) {
    const P = actor.props;
    const s = rig.s;
    if (P.stool > 0.02) {
      ctx.save(); ctx.globalAlpha = P.stool;
      const x = rig.P.pelvis.x, seatY = rig.P.pelvis.y + 8 * s;
      ctx.strokeStyle = '#6a7a84'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(x - 20 * s, seatY); ctx.lineTo(x - 26 * s, FLOOR_Y); ctx.moveTo(x + 20 * s, seatY); ctx.lineTo(x + 26 * s, FLOOR_Y); ctx.moveTo(x, seatY); ctx.lineTo(x, FLOOR_Y); ctx.stroke();
      ctx.fillStyle = '#3e4c55'; ctx.beginPath(); ctx.ellipse(x, seatY, 30 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (P.bag > 0.02) {
      ctx.save(); ctx.globalAlpha = P.bag;
      const side = P.bagSide || 1;
      const swing = Math.sin(time * 6) * P.bagHit * 0.25 * side;
      const topX = rig.P.pelvis.x + side * 0.62 * view.pxPerM * body.size, topY = -this.camY - 10;
      const len = Math.max(20, rig.P.chest.y - 50 * s - topY);
      ctx.strokeStyle = '#8a9aa4'; ctx.lineWidth = 2;
      const bx = topX + Math.sin(swing) * len, by = topY + Math.cos(swing) * len;
      ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(bx, by); ctx.stroke();
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-swing);
      ctx.fillStyle = '#7a2a2a'; ctx.beginPath(); ctx.roundRect(-18 * s, 0, 36 * s, 120 * s, 12 * s); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-18 * s, 20 * s, 36 * s, 5 * s); ctx.fillRect(-18 * s, 95 * s, 36 * s, 5 * s);
      ctx.restore(); ctx.restore();
    }
  }

  drawPropsFront(ctx, view, actor, body, rig, time) {
    const P = actor.props;
    if (P.barbell > 0.02) {
      const s = rig.s;
      ctx.save(); ctx.globalAlpha = P.barbell;
      const kg = actor.data.kg || actor.liftKg;
      const hL = rig.P.haL, hR = rig.P.haR;
      let cx = (hL.x + hR.x) / 2, cy = (hL.y + hR.y) / 2;
      if (actor.action === 'lift' && actor.data && !actor.data.success && actor.t > 2.2) cy = FLOOR_Y - 18 * s;
      cy = Math.min(cy, FLOOR_Y - 18 * s);
      const half = 70 * s;
      ctx.strokeStyle = '#b8c2cc'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy); ctx.stroke();
      const plates = clamp(Math.ceil(kg / 40), 1, 8);
      const pr = clamp(12 + kg / 12, 12, 34) * s;
      for (const sx of [-1, 1]) for (let i = 0; i < plates; i++) {
        ctx.fillStyle = i % 2 ? '#2a3238' : '#3a4a54';
        ctx.fillRect(cx + sx * (half - 10 * s - i * 5 * s) - 2.5 * s, cy - pr, 5 * s, pr * 2);
      }
      ctx.fillStyle = '#ffd24a'; ctx.font = `700 ${Math.max(10, 11 * s)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
      ctx.fillText(`${kg} kg`, cx, cy - pr - 6);
      ctx.restore();
    }
  }

  drawHover(ctx, h) {
    ctx.save();
    ctx.strokeStyle = '#6ff0ff'; ctx.lineWidth = 2; ctx.shadowColor = '#6ff0ff'; ctx.shadowBlur = 10;
    if (h.frame) {
      const F = h.frame;
      ctx.transform(F.a, F.b, F.c, F.d, F.e, F.f);
      const [x, y, w, hh] = h.box;
      ctx.lineWidth = 1.5 / Math.max(0.2, Math.hypot(F.a, F.b));
      ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, hh + 2, 3); ctx.stroke();
    } else if (h.a) {
      const dx = h.b.x - h.a.x, dy = h.b.y - h.a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * h.r, ny = dx / len * h.r;
      ctx.beginPath(); ctx.moveTo(h.a.x + nx, h.a.y + ny); ctx.lineTo(h.b.x + nx, h.b.y + ny); ctx.arc(h.b.x, h.b.y, h.r, Math.atan2(ny, nx), Math.atan2(-ny, -nx)); ctx.lineTo(h.a.x - nx, h.a.y - ny); ctx.arc(h.a.x, h.a.y, h.r, Math.atan2(-ny, -nx), Math.atan2(ny, nx)); ctx.stroke();
    }
    ctx.restore();
  }

  drawSpeech(ctx, rig, actor, body) {
    const sp = actor.speech;
    const head = rig.P.head;
    const s = rig.s;
    const fade = clamp(Math.min(sp.t / 0.2, (sp.dur - sp.t) / 0.4), 0, 1);
    const size = sp.helium ? 11 : 13;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `${sp.kind === 'think' ? 'italic ' : ''}${sp.helium ? '600' : '500'} ${size}px "Barlow", system-ui, sans-serif`;
    const words = sp.text.split(' ');
    const lines = []; let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > 210 && line) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line);
    const lh = size + 4;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22;
    const h = lines.length * lh + 14;
    let x = head.x + 30 * s, y = head.y - 60 * s - h;
    x = clamp(x, 8, this.W - w - 8); y = clamp(y, 8, LOGICAL_H - h - 60);
    const think = sp.kind === 'think';
    ctx.fillStyle = think ? 'rgba(236,228,255,0.95)' : 'rgba(244,248,246,0.96)';
    ctx.strokeStyle = think ? '#8a6ad8' : '#2a3a40'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, think ? 16 : 8); ctx.fill(); ctx.stroke();
    if (think) {
      for (const [k, r] of [[0.35, 6], [0.65, 4]]) { ctx.beginPath(); ctx.arc(lerp(x + 18, head.x + 8 * s, k), lerp(y + h + 4, head.y - 26 * s, k), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x + 16, y + h - 1); ctx.lineTo(head.x + 10 * s, head.y - 24 * s); ctx.lineTo(x + 30, y + h - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 16, y + h); ctx.lineTo(head.x + 10 * s, head.y - 24 * s); ctx.lineTo(x + 30, y + h); ctx.stroke();
    }
    ctx.fillStyle = think ? '#3a2a6a' : '#12202a';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      const wob = sp.helium ? Math.sin(sp.t * 12 + i) * 1.5 : 0;
      ctx.fillText(l, x + 11, y + 7 + lh * (i + 0.75) + wob);
    });
    ctx.restore();
  }

  drawBanner(ctx, body) {
    let text = null, color = '#ff5a6a';
    if (body.gone) { text = body.goneKind === 'ascended' ? 'ASCENDED · the subject has left this plane' : body.goneKind === 'erased' ? 'ERASED · the subject no longer exists' : `NO SUBJECT · ${body.deathCause || 'destroyed'}`; color = body.goneKind === 'ascended' ? '#ffe9a0' : '#ff5a6a'; }
    else if (body.undead) { text = 'UNDEAD · reanimated corpse'; color = '#b8d08a'; }
    else if (!body.alive) { text = `DECEASED · ${body.deathCause}`; }
    else if (body.stasis === 'stone') { text = 'PETRIFIED · stasis'; color = '#c8c8c0'; }
    else if (body.stasis === 'gold') { text = 'SOLID GOLD · stasis'; color = '#ffd24a'; }
    else if (body.stasis === 'cryo') { text = 'CRYOSTASIS · frozen solid'; color = '#bfe8ff'; }
    if (!text) return;
    ctx.save();
    ctx.font = '700 15px "Chakra Petch", system-ui, sans-serif';
    const w = ctx.measureText(text).width + 36;
    const x = this.W / 2 - w / 2;
    ctx.fillStyle = 'rgba(6,10,14,0.82)'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, 78, w, 32, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, this.W / 2, 99);
    if (body.gone) { ctx.font = '500 12px "Barlow", system-ui, sans-serif'; ctx.fillStyle = '#9fb6c0'; ctx.fillText('Use “New subject” to grow another homunculus.', this.W / 2, 128); }
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  bonePoint(rig, id) {
    const P = rig.P;
    const side = id.slice(-1);
    const m = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (id.startsWith('femur')) return m(P['hp' + side], P['kn' + side]);
    if (id.startsWith('shin')) return m(P['kn' + side], P['an' + side]);
    if (id.startsWith('foot')) return P['to' + side];
    if (id.startsWith('humerus')) return m(P['sh' + side], P['el' + side]);
    if (id.startsWith('forearm')) return m(P['el' + side], P['wr' + side]);
    if (id.startsWith('hand')) return P['ha' + side];
    if (id === 'skull') return P.head;
    if (id === 'ribs') return P.chest;
    if (id === 'spine') return P.waist;
    return P.pelvis;
  }

  handleFlashes(body, rig, view, actor) {
    const fx = this.fx;
    const s = rig ? rig.s : view.scale;
    const P = rig ? rig.P : null;
    const mouth = P ? { x: P.head.x + Math.sin(actor.yaw) * 9 * s, y: P.head.y + 11 * s } : { x: view.cx, y: 300 };
    for (const f of body.flashes) {
      const at = P ? P.chest : { x: this.lastPelvisX || view.cx, y: FLOOR_Y - 150 };
      switch (f.kind) {
        case 'dose': {
          const pt = !P ? at : f.route === 'oral' || f.route === 'inhale' ? mouth : f.route === 'eye' ? P.head : f.route === 'cranial' ? P.head : f.route === 'spinal' ? P.waist : f.route === 'splash' ? P.chest : f.route === 'im' || f.route === 'topical' ? (f.site && f.site.startsWith('leg') ? P['kn' + f.site.slice(-1)] : f.site && f.site.startsWith('arm') ? P['el' + f.site.slice(-1)] : P.chest) : P['el' + 'L'];
          fx.add({ kind: 'ring', x: pt.x, y: pt.y, size: 4, life: 0.7, color: f.color, speed: 60 });
          if (f.route === 'splash') fx.burst('drop', pt.x, pt.y, 26, { color: f.color, g: 400, maxSp: 160, minLife: 0.6, maxLife: 1.2 });
          else fx.burst('mote', pt.x, pt.y, 8, { color: f.glow || f.color, maxSp: 40, maxLife: 0.8 });
          break;
        }
        case 'explosion': {
          fx.flash = 0.9; fx.flashColor = '#ffd0a0'; fx.shake = clamp(0.5 + f.power * 0.3, 0.5, 1.5);
          fx.burst('fire', at.x, at.y, 60, { maxSp: 260, minSize: 6, maxSize: 16, maxLife: 1 });
          fx.burst('smoke', at.x, at.y, 30, { maxSp: 90, minSize: 8, maxSize: 18, minLife: 1, maxLife: 2.2 });
          fx.add({ kind: 'text', x: at.x, y: at.y - 60, text: 'BOOM', size: 34, color: '#ffb04a', vy: -30, life: 1.2 });
          break;
        }
        case 'annihilate': fx.flash = 1.4; fx.flashColor = '#ffffff'; fx.shake = 1.6; fx.add({ kind: 'ring', x: at.x, y: at.y, size: 10, life: 1.4, color: '#ffffff', speed: 700 }); break;
        case 'ascend': fx.beam = 1.6; fx.burst('mote', at.x, at.y, 80, { color: '#fff6c2', maxSp: 200, vy: -80, maxLife: 2 }); break;
        case 'death': if (f.kind === 'death' && f.gone) break; fx.burst('smoke', at.x, at.y, 6, { color: '#9aa8b8', maxSp: 20, vy: -30, maxLife: 1.6 }); break;
        case 'revive': fx.add({ kind: 'ring', x: at.x, y: at.y, size: 10, life: 1, color: '#ffd27a', speed: 300 }); fx.burst('mote', at.x, at.y, 30, { color: '#ffe9a0', maxSp: 140, maxLife: 1.4 }); fx.flash = 0.35; fx.flashColor = '#ffe9a0'; break;
        case 'rise': fx.burst('smoke', at.x, at.y, 40, { color: '#6a8a4a', maxSp: 80, vy: -40, minSize: 6, maxSize: 14, maxLife: 2 }); fx.add({ kind: 'text', x: at.x, y: at.y - 100, text: 'IT RISES', size: 22, color: '#b8d08a', vy: -20, life: 1.8 }); break;
        case 'transform': fx.add({ kind: 'ring', x: at.x, y: at.y, size: 20, life: 1.2, color: TRANSFORM_COLORS[f.id] || '#ffffff', speed: 220 }); fx.burst('mote', at.x, at.y, 40, { color: TRANSFORM_COLORS[f.id] || '#ffffff', maxSp: 160, maxLife: 1.3 }); break;
        case 'mutation': fx.burst('mote', at.x, at.y - 30, 24, { color: '#a0ff3a', maxSp: 120, maxLife: 1.2 }); break;
        case 'seizure': if (P) for (let i = 0; i < 4; i++) fx.add({ kind: 'bolt', x: P.head.x + rand(-30, 30), y: P.head.y - 40, size: 50, life: 0.25, color: '#dff4ff' }); break;
        case 'spark': if (P) { const j = pick(['elL', 'elR', 'knL', 'knR', 'chest', 'head']); fx.burst('spark', P[j].x, P[j].y, 8, { color: '#fff27a', maxSp: 180, maxLife: 0.35 }); } break;
        case 'fracture': if (P) { const bp = this.bonePoint(rig, f.bone); fx.add({ kind: 'ring', x: bp.x, y: bp.y, size: 3, life: 0.5, color: '#ff3a4a', speed: 90 }); fx.add({ kind: 'text', x: bp.x, y: bp.y - 18, text: 'CRACK', size: 18, color: '#ff5a6a', vy: -40, life: 1 }); fx.shake = Math.max(fx.shake, 0.3); } break;
        case 'thud': if (P) fx.burst('smoke', rig.baseX, FLOOR_Y - 4, 10, { color: '#5a6a70', maxSp: 60, vy: -10, maxLife: 0.8, minSize: 3, maxSize: 6 }); break;
        case 'freeze': fx.burst('ice', at.x, at.y, 40, { maxSp: 160, maxLife: 1.2, g: 200 }); fx.flash = 0.3; fx.flashColor = '#dff4ff'; break;
        case 'teleport': fx.burst('mote', at.x, at.y, 20, { color: '#9aa8ff', maxSp: 90, maxLife: 0.8 }); break;
        case 'holy': fx.burst('mote', at.x, at.y, 30, { color: '#fff6c2', maxSp: 200, maxLife: 0.8 }); fx.burst('smoke', at.x, at.y, 12, { color: '#d8d0c0', maxSp: 50, vy: -40, maxLife: 1.4 }); break;
        case 'fog': fx.fog = { color: f.color, t: 0, dur: f.duration || 60 }; break;
        case 'zzz': if (P) fx.add({ kind: 'glyph', x: P.head.x + 12, y: P.head.y - 20, text: 'z', size: rand(12, 18), color: '#bcd0ff', vx: 14, vy: -22, life: 2 }); break;
        case 'vomit': fx.burst('vomit', mouth.x, mouth.y, 26, { maxSp: 90, vx: (actor.facing || 0.3) * 60, vy: 40, g: 500, maxLife: 1.1, minSize: 2, maxSize: 4 }); break;
        case 'sneeze': fx.burst('drop', mouth.x, mouth.y - 4, 16, { maxSp: 140, vx: 50, g: 200, maxLife: 0.6, minSize: 1, maxSize: 2 }); fx.add({ kind: 'text', x: mouth.x + 30, y: mouth.y - 30, text: 'ACHOO!', size: 16, color: '#dff4ff', vy: -20, life: 1 }); break;
        case 'fireBreath': {
          const dir = Math.abs(actor.facing) > 0.2 ? Math.sign(actor.facing) : 1;
          for (let i = 0; i < 50; i++) fx.add({ kind: 'fire', x: mouth.x, y: mouth.y, vx: dir * rand(180, 380), vy: rand(-60, 30), size: rand(5, 11), life: rand(0.4, 0.9) });
          break;
        }
        case 'hearts': if (P) for (let i = 0; i < 5; i++) fx.add({ kind: 'glyph', x: mouth.x + rand(-10, 20), y: mouth.y - 10, text: '♥', size: rand(12, 20), color: '#ff6a9a', vx: rand(10, 50), vy: rand(-60, -30), life: 1.6 }); break;
        case 'howl': for (let i = 0; i < 3; i++) fx.add({ kind: 'ring', x: mouth.x, y: mouth.y - 10, size: 6 + i * 8, life: 1.2, color: '#d8c8a8', speed: 90 }); break;
        case 'boing': fx.add({ kind: 'text', x: at.x, y: FLOOR_Y - 20, text: 'BOING', size: 18, color: '#ff9ad5', vy: -40, life: 0.9 }); break;
        case 'defib': fx.flash = 0.5; fx.flashColor = '#dff4ff'; if (P) { for (let i = 0; i < 6; i++) fx.add({ kind: 'bolt', x: P.chest.x + rand(-20, 20), y: P.chest.y - 30, size: 60, life: 0.3 }); fx.add({ kind: 'text', x: P.chest.x, y: P.head.y - 50, text: 'CLEAR!', size: 22, color: '#dff4ff', vy: -20, life: 1 }); } break;
        default: break;
      }
    }
    body.flashes.length = 0;
  }

  emitters(body, actor, rig, dt, time, view) {
    const fx = this.fx, P = rig.P, s = rig.s;
    const rate = (r) => chance(r * dt);
    const anyJoint = () => P[pick(['head', 'chest', 'waist', 'pelvis', 'elL', 'elR', 'wrL', 'wrR', 'knL', 'knR', 'anL', 'anR', 'shL', 'shR'])];
    const S = body.symptoms, E = body.effects, cap = body.cap;
    const living = (body.alive || body.undead) && !body.stasis;
    if (body.burning > 0.05) for (let i = 0; i < 3; i++) if (rate(18 * body.burning)) { const j = anyJoint(); fx.add({ kind: 'fire', x: j.x + rand(-8, 8) * s, y: j.y, vx: rand(-10, 10), vy: rand(-90, -40), size: rand(5, 10) * s, life: rand(0.4, 0.8) }); }
    if (body.burning > 0.05 && rate(4)) { const j = anyJoint(); fx.add({ kind: 'smoke', x: j.x, y: j.y - 20, vy: -40, size: 6, life: 1.6 }); }
    if ((E.electric || 0) > 0.7 && rate(5 * E.electric)) { const j = anyJoint(); fx.burst('spark', j.x, j.y, 4, { color: '#fff27a', maxSp: 150, maxLife: 0.3 }); }
    if (S.sweat && living && rate(2.5 * S.sweat)) fx.add({ kind: 'drop', x: P.head.x + rand(-14, 14) * s, y: P.head.y - 6 * s, vy: 10, g: 260, size: 2, life: 1.1, floor: true });
    if (body.blood.mana > 30 && rate(body.blood.mana / 25)) { const j = anyJoint(); fx.add({ kind: 'mote', x: j.x + rand(-15, 15), y: j.y, vy: rand(-40, -15), size: rand(1.5, 3), color: '#c08bff', life: 1.2 }); }
    if (((E.radiation || 0) > 0.4 || body.blood.radiation > 1.5) && rate(3)) { const j = anyJoint(); fx.add({ kind: 'mote', x: j.x + rand(-12, 12), y: j.y, vy: -15, size: 1.5, color: '#9dff4a', life: 0.9 }); }
    if (cap.glow > 0.3 && rate(cap.glow * 4)) { const j = anyJoint(); fx.add({ kind: 'mote', x: j.x + rand(-25, 25) * s, y: j.y + rand(-10, 10), vy: rand(-30, -8), size: rand(1.5, 3), color: cap.glowColor, life: 1.4 }); }
    if (body.bleedRate > 0.08 && (body.alive || body.undead) && rate(body.bleedRate * 10)) { const j = pick([P.waist, P.chest, P.knL, P.knR]); fx.add({ kind: 'blood', x: j.x + rand(-6, 6) * s, y: j.y, vy: 20, g: 420, size: rand(1.6, 2.8), life: 1.4, floor: true }); }
    if (body.stasis === 'cryo' && rate(3)) { const j = anyJoint(); fx.add({ kind: 'ice', x: j.x + rand(-10, 10), y: j.y, vy: -5, size: 2.5, life: 1 }); }
    if (body.sleeping && rate(0.8)) fx.add({ kind: 'glyph', x: P.head.x + 12, y: P.head.y - 16, text: 'z', size: rand(11, 17), color: '#bcd0ff', vx: 14, vy: -22, life: 2 });
    if (cap.hallucination > 1 && living && rate(cap.hallucination)) {
      fx.add({ kind: 'psy', shape: Math.floor(rand(0, 3)), x: P.head.x + rand(-120, 120), y: P.head.y + rand(-100, 40), vx: rand(-20, 20), vy: rand(-20, 20), size: rand(5, 11), color: pick(['#ff6ef0', '#5affd8', '#ffe84a', '#9a8aff']), life: rand(1.5, 3) });
    }
    if (cap.love > 0.8 && living && rate(0.8)) fx.add({ kind: 'glyph', x: P.head.x + rand(-20, 20), y: P.head.y - 30, text: '♥', size: rand(10, 16), color: '#ff6a9a', vy: -30, life: 1.5 });
    if (cap.drunk > 1 && living && rate(1.2)) fx.add({ kind: 'bubble', x: P.head.x + rand(-10, 18), y: P.head.y - 20, vx: rand(-8, 8), vy: -25, size: rand(2, 5), life: 1.6 });
    if ((body.vitals.temp < 35 || this.envCold) && living && rate(0.9)) fx.add({ kind: 'smoke', x: P.head.x + 6 * s, y: P.head.y + 12 * s, vx: 20, vy: -8, size: 4, color: '#dfeef5', life: 1.2 });
    if (body.undead && rate(1.5)) fx.add({ kind: 'mote', x: P.head.x + rand(-30, 30), y: P.head.y + rand(-30, 10), vx: rand(-40, 40), vy: rand(-40, 40), size: 1.2, color: '#2a2a1a', life: 0.8 });
    if (body.transform.divine > 0.3 && rate(3)) fx.add({ kind: 'mote', x: P.chest.x + rand(-40, 40), y: P.chest.y + rand(-80, 60), vy: -30, size: 2, color: '#ffe9a0', life: 1.6 });
    if (actor.action === 'breathFire' && this.pose.fire) {
      const dir = Math.abs(actor.facing) > 0.2 ? Math.sign(actor.facing) : 1;
      const mouth = { x: P.head.x + Math.sin(actor.yaw) * 9 * s, y: P.head.y + 11 * s };
      for (let i = 0; i < 3; i++) fx.add({ kind: 'fire', x: mouth.x, y: mouth.y, vx: dir * rand(200, 360), vy: rand(-50, 20), size: rand(5, 10) * s, life: rand(0.35, 0.7) });
    }
    if (actor.action === 'cough' && rate(3)) fx.add({ kind: 'text', x: P.head.x + 24, y: P.head.y - 10, text: '*cough*', size: 12, color: '#cfe0e6', vy: -20, life: 0.9 });
    if (actor.action === 'hiccup' && actor.t < 0.05) fx.add({ kind: 'text', x: P.head.x + 24, y: P.head.y - 10, text: '*hic*', size: 12, color: '#e6d8a0', vy: -20, life: 0.8 });
    if (actor.action === 'sing' && rate(2.5)) fx.add({ kind: 'glyph', x: P.head.x + 20, y: P.head.y, text: pick(['♪', '♫']), size: rand(12, 18), color: '#bfe6ff', vx: rand(10, 40), vy: -30, life: 1.4 });
    if (actor.action === 'laugh' && rate(2)) fx.add({ kind: 'text', x: P.head.x + rand(-20, 30), y: P.head.y - 20, text: pick(['ha', 'HA', 'hehe']), size: 13, color: '#ffe066', vy: -25, life: 0.9 });
    if (actor.props.bagHit > 0.95) fx.burst('smoke', rig.P.pelvis.x + (actor.props.bagSide || 1) * 0.5 * view.pxPerM * body.size, P.chest.y, 5, { color: '#9a8a7a', maxSp: 50, maxLife: 0.4, minSize: 2, maxSize: 4 });
  }
}
