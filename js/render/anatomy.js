// Layered anatomical renderer for the homunculus.
// Layers (deep → surface): organs, skeleton, vascular, nerves, muscle, skin.
import { clamp, lerp, mixHex, rgba, hexToRgb } from '../util.js';
import { DIM } from './rig.js';

export const LAYERS = [
  { id: 'skin', name: 'Skin' },
  { id: 'muscle', name: 'Muscular' },
  { id: 'vascular', name: 'Circulatory' },
  { id: 'organs', name: 'Organs' },
  { id: 'skeleton', name: 'Skeletal' },
  { id: 'nerves', name: 'Nervous' },
];

const SKIN = '#d6a185';
const SKIN_SHADE = '#b57d63';
const MUSCLE = '#b8333c';
const BONE = '#efe6cf';
const NERVE = '#ffd84a';
const ARTERY = '#e0303c';
const VEIN = '#3d6fe0';

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
function taperPath(ctx, a, b, w1, w2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / len, ny = dx / len;
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(a.x + nx * w1, a.y + ny * w1);
  ctx.lineTo(b.x + nx * w2, b.y + ny * w2);
  ctx.arc(b.x, b.y, w2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.lineTo(a.x - nx * w1, a.y - ny * w1);
  ctx.arc(a.x, a.y, w1, ang - Math.PI / 2, ang + Math.PI / 2, true);
  ctx.closePath();
}

function along(a, b, t, off = 0) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.001;
  return { x: a.x + dx * t - (dy / len) * off, y: a.y + dy * t + (dx / len) * off };
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

// Affine frame from body-local 2D coordinates to screen.
function frameFor(rig, originLocal, tilt = 0) {
  const { toScreen, torsoPt } = rig;
  const o3 = torsoPt(originLocal[0], originLocal[1]);
  const O = toScreen(o3);
  const X = toScreen(torsoPt(originLocal[0] + 1, originLocal[1]));
  const Y = toScreen(torsoPt(originLocal[0], originLocal[1] + 1));
  let ax = X.x - O.x, bx = X.y - O.y, cx = Y.x - O.x, dy = Y.y - O.y;
  if (tilt) {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const a2 = ax * c + cx * s, b2 = bx * c + dy * s, c2 = -ax * s + cx * c, d2 = -bx * s + dy * c;
    ax = a2; bx = b2; cx = c2; dy = d2;
  }
  return { a: ax, b: bx, c: cx, d: dy, e: O.x, f: O.y, apply: (x, y) => ({ x: O.x + ax * x + cx * y, y: O.y + bx * x + dy * y }) };
}

function withFrame(ctx, F, fn) {
  ctx.save();
  ctx.transform(F.a, F.b, F.c, F.d, F.e, F.f);
  fn();
  ctx.restore();
}

// health (0..100) → tissue colour
const healthTint = (base, h, dead) => {
  const k = clamp(1 - h / 100, 0, 1);
  let c = mixHex(base, '#4a3b36', k * 0.8);
  if (dead) c = mixHex(c, '#6d6a78', 0.35);
  return c;
};

// ---------------------------------------------------------------------------
// skin tone from state
// ---------------------------------------------------------------------------
export function skinTone(body) {
  const S = body.symptoms, T = body.transform;
  let c = SKIN;
  if (T.werewolf > 0) c = mixHex(c, '#8a6040', clamp(T.werewolf, 0, 1) * 0.6);
  if (body.effects.photosynthesis) c = mixHex(c, '#5aa844', clamp(body.effects.photosynthesis * 0.4, 0, 0.8));
  if (S.flushed) c = mixHex(c, '#e0605a', S.flushed * 0.35);
  if (S.jaundice) c = mixHex(c, '#e0c440', S.jaundice * 0.55);
  if (S.pallor) c = mixHex(c, '#ece4dc', S.pallor * 0.55);
  if (S.cyanosis) c = mixHex(c, '#7a8ec8', S.cyanosis * 0.6);
  if (T.vampire > 0) c = mixHex(c, '#efe8ee', clamp(T.vampire, 0, 1) * 0.75);
  if (T.zombie > 0) c = mixHex(c, '#8a9a70', clamp(T.zombie, 0, 1) * 0.8);
  if (!body.alive && !body.undead) c = mixHex(c, '#a8a4b0', clamp(body.deadTime / 40, 0.25, 0.6));
  if (body.vitals.temp < 33) c = mixHex(c, '#9fc8ec', clamp((33 - body.vitals.temp) / 10, 0, 0.6));
  if (T.metal > 0) c = mixHex(c, '#aab4c0', clamp(T.metal, 0, 1) * 0.9);
  if (T.crystal > 0) c = mixHex(c, '#9ff5ea', clamp(T.crystal, 0, 1) * 0.8);
  if (T.gold > 0) c = mixHex(c, '#e8bc3a', clamp(T.gold, 0, 1) * 0.95);
  if (T.stone > 0) c = mixHex(c, '#8e8c86', clamp(T.stone, 0, 1) * 0.95);
  if (T.elastic > 0) c = mixHex(c, '#f09ac8', clamp(T.elastic, 0, 1) * 0.35);
  if (body.stasis === 'cryo') c = mixHex(c, '#bfe8ff', 0.65);
  return c;
}

export function bloodColor(body) {
  let c = '#b3202e';
  const b = body.blood;
  if (body.vitals.spo2 < 90) c = mixHex(c, '#5a1a3a', clamp((90 - body.vitals.spo2) / 40, 0, 0.8));
  if (b.toxins > 20) c = mixHex(c, '#6a9a2a', clamp(b.toxins / 100, 0, 0.7));
  if (b.mana > 20) c = mixHex(c, '#8a4aff', clamp(b.mana / 150, 0, 0.7));
  if (body.effects.asphyxiant > 1) c = mixHex(c, '#ff3048', 0.5);
  if (body.undead) c = '#3a3a24';
  if (body.transform.vampire >= 1) c = '#5a0a1a';
  if (body.mutations.includes('glowingVeins')) c = mixHex(c, '#6affc8', 0.5);
  return c;
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------
export function drawAnatomy(ctx, rig, body, actor, opts, time) {
  const hits = [];
  const P = rig.P, s = rig.s;
  const alphas = layerAlphas(opts);
  const T = body.transform;
  const invis = body.cap.invisibility || 0;
  const ghost = clamp(T.ghost, 0, 1);
  const bodyAlpha = (1 - ghost * 0.55);
  const torsoF = frameFor(rig, [0, 0]);
  const headF = frameFor(rig, [0, DIM.torsoTop - DIM.neck - DIM.headR + 4], rig.pose.headTilt || 0);
  const ctxInfo = { ctx, rig, body, actor, opts, time, P, s, torsoF, headF, hits, T };

  // depth ordering of limbs
  const zOf = (...ks) => ks.reduce((a, k) => a + P[k].z, 0) / ks.length;
  const limbs = [
    { id: 'armL', z: zOf('elL', 'wrL'), kind: 'arm', side: 'L' },
    { id: 'armR', z: zOf('elR', 'wrR'), kind: 'arm', side: 'R' },
    { id: 'legL', z: zOf('knL', 'anL') * 0.5, kind: 'leg', side: 'L' },
    { id: 'legR', z: zOf('knR', 'anR') * 0.5, kind: 'leg', side: 'R' },
  ];
  if (P.el2L) limbs.push({ id: 'arm2L', z: zOf('el2L', 'wr2L') - 1, kind: 'arm2', side: 'L' }, { id: 'arm2R', z: zOf('el2R', 'wr2R') - 1, kind: 'arm2', side: 'R' });
  const far = limbs.filter((l) => l.z < -3).sort((a, b) => a.z - b.z);
  const near = limbs.filter((l) => l.z >= -3).sort((a, b) => a.z - b.z);

  ctx.save();
  ctx.globalAlpha = bodyAlpha;

  // glow aura behind everything
  const glow = body.cap.glow || 0;
  if (glow > 0.05 && !body.gone) {
    const g = ctx.createRadialGradient(P.chest.x, P.chest.y, 10 * s, P.chest.x, P.chest.y, 190 * s);
    g.addColorStop(0, rgba(body.cap.glowColor, clamp(glow * 0.55, 0, 0.7)));
    g.addColorStop(1, rgba(body.cap.glowColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(P.chest.x - 220 * s, P.chest.y - 240 * s, 440 * s, 480 * s);
  }
  // divine halo
  if (T.divine > 0.2) {
    ctx.save();
    ctx.strokeStyle = rgba('#ffe9a0', clamp(T.divine, 0, 1) * 0.9);
    ctx.lineWidth = 3 * s;
    ctx.shadowColor = '#ffe9a0'; ctx.shadowBlur = 16 * s;
    const hp = headF.apply(0, -DIM.headR - 12);
    ellipse(ctx, hp.x, hp.y, 18 * s, 5 * s, rig.rot);
    ctx.stroke();
    ctx.restore();
  }
  // behind-body mutations
  drawBackMutations(ctxInfo, alphas);

  const order = ['organs', 'skeleton', 'vascular', 'nerves', 'muscle', 'skin'];
  const passes = order.filter((id) => alphas[id] > 0.01);
  // ghost silhouette when the skin is peeled away
  const skinVis = alphas.skin * (1 - invis);
  if (skinVis < 0.9) {
    ctx.save();
    ctx.globalAlpha = bodyAlpha * clamp(0.9 - skinVis, 0, 0.9) * 0.55;
    drawSilhouette(ctxInfo, far, near, '#1c2a33', rgba('#9fd8ff', 0.35));
    ctx.restore();
  }
  for (const layer of passes) {
    let a = alphas[layer];
    if (layer === 'skin') a *= 1 - invis;
    if (layer === 'muscle') a *= 1 - invis * 0.7;
    if (a <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = bodyAlpha * a;
    const fn = LAYER_DRAW[layer];
    for (const l of far) fn.limb(ctxInfo, l);
    fn.torso(ctxInfo);
    fn.head(ctxInfo);
    for (const l of near) fn.limb(ctxInfo, l);
    ctx.restore();
  }
  // invisible subjects shimmer
  if (invis > 0.3 && alphas.skin > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.25 * invis * (0.6 + 0.4 * Math.sin(time * 3));
    drawSilhouette(ctxInfo, far, near, 'rgba(0,0,0,0)', rgba('#e0f4ff', 0.9));
    ctx.restore();
  }
  // overlays
  if (opts.thermal) drawThermal(ctxInfo, far, near);
  if (opts.damage) drawDamage(ctxInfo, far, near);
  ctx.restore();
  if (opts.labels) drawLabels(ctxInfo, alphas);
  return hits;
}

export function layerAlphas(opts) {
  const out = {};
  if (opts.xray) {
    Object.assign(out, { skin: 0.12, muscle: 0.22, vascular: 0.55, organs: 0.85, skeleton: 0.6, nerves: 0.6 });
    return out;
  }
  const p = opts.peel;
  LAYERS.forEach((l, i) => {
    out[l.id] = i === 0 ? clamp(1 - p, 0, 1) : clamp(1 - Math.abs(p - i), 0, 1);
  });
  return out;
}

// ---------------------------------------------------------------------------
// silhouette (used for ghost outlines and overlays)
// ---------------------------------------------------------------------------
function limbJoints(P, l) {
  const sfx = l.side;
  if (l.kind === 'arm') return [P['sh' + sfx], P['el' + sfx], P['wr' + sfx], P['ha' + sfx]];
  if (l.kind === 'arm2') return [P['sh2' + sfx], P['el2' + sfx], P['wr2' + sfx], P['ha2' + sfx]];
  return [P['hp' + sfx], P['kn' + sfx], P['an' + sfx], P['to' + sfx]];
}

function limbWidths(body, l) {
  if (l.kind === 'leg') { const m = 0.75 + 0.25 * body.muscles['leg' + l.side].mass; return [12.5 * m, 8.5 * m, 5.6 * m]; }
  const m = 0.72 + 0.28 * body.muscles['arm' + l.side].mass;
  const k = l.kind === 'arm2' ? 0.85 : 1;
  return [8.4 * m * k, 6.6 * m * k, 4.8 * m * k];
}

function torsoPath(ctx, body) {
  const bulk = 0.85 + 0.15 * body.muscles.chest.mass;
  const w = (v) => v * bulk;
  ctx.beginPath();
  ctx.moveTo(-8.5, -118);
  ctx.bezierCurveTo(-12, -110, -20, -108, -w(29), -104);
  ctx.bezierCurveTo(-w(34), -100, -w(31), -90, -w(27), -84);
  ctx.bezierCurveTo(-24, -70, -21, -52, -21, -42);
  ctx.bezierCurveTo(-22, -26, -28, -16, -27, -6);
  ctx.bezierCurveTo(-24, 6, -14, 12, -4, 14);
  ctx.lineTo(4, 14);
  ctx.bezierCurveTo(14, 12, 24, 6, 27, -6);
  ctx.bezierCurveTo(28, -16, 22, -26, 21, -42);
  ctx.bezierCurveTo(21, -52, 24, -70, w(27), -84);
  ctx.bezierCurveTo(w(31), -90, w(34), -100, w(29), -104);
  ctx.bezierCurveTo(20, -108, 12, -110, 8.5, -118);
  ctx.lineTo(8.5, -126);
  ctx.lineTo(-8.5, -126);
  ctx.closePath();
}

function drawSilhouette(I, far, near, fill, stroke) {
  const { ctx, body, torsoF, headF, P, s } = I;
  const all = [...far, ...near];
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
  for (const l of all) {
    const j = limbJoints(P, l), w = limbWidths(body, l);
    taperPath(ctx, j[0], j[1], w[0] * s, w[1] * s); ctx.fill(); ctx.stroke();
    taperPath(ctx, j[1], j[2], w[1] * s, w[2] * s); ctx.fill(); ctx.stroke();
  }
  withFrame(ctx, torsoF, () => { torsoPath(ctx, body); ctx.fill(); ctx.lineWidth = 1.4 / Math.max(0.3, I.s); ctx.stroke(); });
  withFrame(ctx, headF, () => { ellipse(ctx, 0, 0, 17.5, 21.5); ctx.fill(); ctx.lineWidth = 1.4 / Math.max(0.3, I.s); ctx.stroke(); });
}

// ---------------------------------------------------------------------------
// SKIN
// ---------------------------------------------------------------------------
const SKIN_LAYER = {
  limb(I, l) {
    const { ctx, body, P, s } = I;
    const tone = skinTone(body);
    const j = limbJoints(P, l), w = limbWidths(body, l);
    const grad = ctx.createLinearGradient(j[0].x - 10 * s, j[0].y, j[0].x + 10 * s, j[0].y);
    grad.addColorStop(0, mixHex(tone, '#000000', 0.18)); grad.addColorStop(0.5, tone); grad.addColorStop(1, mixHex(tone, '#000000', 0.12));
    ctx.fillStyle = grad;
    ctx.strokeStyle = mixHex(tone, '#2a1a14', 0.55);
    ctx.lineWidth = 1.2;
    if (l.kind === 'leg') {
      // shorts cover the upper thigh
      taperPath(ctx, j[0], j[1], w[0] * s, w[1] * s); ctx.fill(); ctx.stroke();
      taperPath(ctx, j[1], j[2], w[1] * s, w[2] * s); ctx.fill(); ctx.stroke();
      drawFoot(ctx, j[2], j[3], s, tone, l.side);
      ctx.fillStyle = '#39424c';
      const m = along(j[0], j[1], 0.45);
      taperPath(ctx, j[0], m, (w[0] + 1.2) * s, (w[0] - 0.5) * s); ctx.fill();
      ctx.strokeStyle = '#1f252c'; ctx.stroke();
    } else {
      taperPath(ctx, j[0], j[1], w[0] * s, w[1] * s); ctx.fill(); ctx.stroke();
      taperPath(ctx, j[1], j[2], w[1] * s, w[2] * s); ctx.fill(); ctx.stroke();
      drawHand(ctx, j[2], j[3], s, tone, body);
    }
    skinMarks(I, j, w, l);
  },
  torso(I) {
    const { ctx, body, torsoF, T } = I;
    const tone = skinTone(body);
    withFrame(ctx, torsoF, () => {
      const g = ctx.createLinearGradient(-30, 0, 30, 0);
      g.addColorStop(0, mixHex(tone, '#000000', 0.2)); g.addColorStop(0.45, mixHex(tone, '#ffffff', 0.06)); g.addColorStop(1, mixHex(tone, '#000000', 0.15));
      ctx.fillStyle = g;
      torsoPath(ctx, body); ctx.fill();
      ctx.strokeStyle = mixHex(tone, '#2a1a14', 0.55); ctx.lineWidth = 1.1; ctx.stroke();
      // anatomy hints
      ctx.strokeStyle = rgba('#5a3020', 0.25); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-18, -84); ctx.quadraticCurveTo(-10, -74, -1, -80); ctx.moveTo(18, -84); ctx.quadraticCurveTo(10, -74, 1, -80); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -38, 1.3, 0, Math.PI * 2); ctx.fillStyle = rgba('#5a3020', 0.4); ctx.fill();
      if (body.muscles.core.mass > 1.25) { ctx.strokeStyle = rgba('#5a3020', 0.3); for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(-8, -66 + r * 10); ctx.lineTo(8, -66 + r * 10); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(0, -72); ctx.lineTo(0, -40); ctx.stroke(); }
      // shorts
      ctx.fillStyle = '#39424c';
      ctx.beginPath();
      ctx.moveTo(-26, -14); ctx.bezierCurveTo(-28, -4, -26, 6, -22, 12); ctx.lineTo(0, 14); ctx.lineTo(22, 12);
      ctx.bezierCurveTo(26, 6, 28, -4, 26, -14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b323a'; ctx.fillRect(-26, -16, 52, 4);
      ctx.fillStyle = '#c9d3dc'; ctx.font = '600 5px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText(body.name.replace('Subject ', ''), 13, -3);
      // conditions
      if (T.werewolf > 0.2) furPatches(ctx, T.werewolf, [[-20, -95], [20, -95], [0, -70], [-15, -55], [15, -55]]);
      if (body.mutations.includes('scales')) scalePattern(ctx, -20, -100, 40, 80, tone);
      if (T.stone > 0.1) stoneCracks(ctx, T.stone, -24, -110, 48, 120);
      if (T.crystal > 0.2) crystalFacets(ctx, T.crystal, -22, -105, 44, 100);
      if (T.gold > 0.2 || T.metal > 0.2) metalSheen(ctx, Math.max(T.gold, T.metal), -26, -110, 52, 120);
      if (body.mutations.includes('glowingVeins')) glowVeinsTorso(ctx, I.time);
      spotsAndRashes(ctx, body, -22, -100, 44, 90, I.time);
      burnsFrost(ctx, body, -24, -105, 48, 110);
      if (body.mutations.includes('gills')) { ctx.strokeStyle = rgba('#8a3040', 0.7); ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-7, -123 + i * 2.5); ctx.lineTo(-3, -122 + i * 2.5); ctx.moveTo(7, -123 + i * 2.5); ctx.lineTo(3, -122 + i * 2.5); ctx.stroke(); } }
      if (body.mutations.includes('crystalSpikes')) crystalSpikes(ctx);
    });
  },
  head(I) {
    drawHead(I, 'skin');
    I.hits.push({ kind: 'organ', id: 'skin', frame: I.torsoF, box: [-28, -126, 56, 140] });
    I.hits.push({ kind: 'organ', id: 'eyes', frame: I.headF, box: [-11, -6, 22, 8] });
    I.hits.push({ kind: 'organ', id: 'brain', frame: I.headF, box: [-18, -22, 36, 16] });
  },
};

function drawFoot(ctx, ankle, toe, s, tone, side) {
  ctx.fillStyle = mixHex(tone, '#000000', 0.08);
  const dx = toe.x - ankle.x;
  const len = 12 * s;
  ellipse(ctx, ankle.x + dx * 0.5, toe.y - 3 * s, Math.max(6 * s, Math.abs(dx) * 0.9 + 6 * s), 4 * s, 0);
  ctx.fill(); ctx.stroke();
  return len;
}

function drawHand(ctx, wrist, tip, s, tone, body) {
  ctx.fillStyle = tone;
  const m = along(wrist, tip, 0.5);
  const ang = Math.atan2(tip.y - wrist.y, tip.x - wrist.x);
  ellipse(ctx, m.x, m.y, 7.5 * s, 5 * s, ang);
  ctx.fill(); ctx.stroke();
  if (body.mutations.includes('claws') || body.transform.werewolf >= 1) {
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.5 * s;
    for (let i = -1; i <= 1; i++) {
      const b = { x: tip.x + Math.cos(ang + i * 0.35) * 2 * s, y: tip.y + Math.sin(ang + i * 0.35) * 2 * s };
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(ang + i * 0.35) * 6 * s, b.y + Math.sin(ang + i * 0.35) * 6 * s); ctx.stroke();
    }
  }
}

function skinMarks(I, j, w, l) {
  const { ctx, body, s, T, time } = I;
  if (T.werewolf > 0.2) {
    ctx.strokeStyle = rgba('#5a3a20', clamp(T.werewolf, 0, 1) * 0.8); ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const p = along(j[0], j[2], k / 8, (k % 2 ? 1 : -1) * w[1] * s * 0.6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3 * s, p.y + 4 * s); ctx.stroke();
    }
  }
  if (T.stone > 0.15 || T.gold > 0.15 || T.crystal > 0.15) {
    ctx.strokeStyle = rgba(T.gold > T.stone ? '#8a6a10' : T.crystal > T.stone ? '#e0fffa' : '#555', 0.6); ctx.lineWidth = 0.9;
    const k = Math.max(T.stone, T.gold, T.crystal);
    for (let i = 0; i < 4 * k; i++) {
      const p = along(j[0], j[2], (i * 0.27) % 1, ((i * 7) % 5 - 2) * s);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4 * s, p.y + 3 * s); ctx.lineTo(p.x + 2 * s, p.y + 7 * s); ctx.stroke();
    }
  }
  if (body.burns > 0.05 || body.frost > 0.05) {
    for (let i = 0; i < 3; i++) {
      const p = along(j[0], j[2], 0.2 + i * 0.3, (i - 1) * 2 * s);
      if (body.burns > 0.05) { ctx.fillStyle = rgba('#3a1a10', body.burns * 0.6); ellipse(ctx, p.x, p.y, 4 * s, 3 * s); ctx.fill(); }
      if (body.frost > 0.05) { ctx.fillStyle = rgba('#e8f8ff', body.frost * 0.7); ellipse(ctx, p.x + 2 * s, p.y - 2 * s, 3 * s, 2 * s); ctx.fill(); }
    }
  }
  if (body.mutations.includes('glowingVeins')) {
    ctx.strokeStyle = rgba('#6affc8', 0.5 + 0.3 * Math.sin(time * 3)); ctx.lineWidth = 1;
    ctx.beginPath(); const a = along(j[0], j[2], 0.05, 2 * s), b = along(j[0], j[2], 0.95, -1 * s); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  if (l.kind === 'arm' && (body.symptoms.rash || body.symptoms.spots || body.symptoms.boils)) {
    ctx.fillStyle = rgba(body.symptoms.boils ? '#8a5a1a' : '#c0303a', 0.55);
    for (let i = 0; i < 5; i++) { const p = along(j[0], j[2], 0.15 + i * 0.17, ((i * 3) % 3 - 1) * 2.5 * s); ellipse(ctx, p.x, p.y, (body.symptoms.boils ? 2.2 : 1.2) * s, (body.symptoms.boils ? 2.2 : 1.2) * s); ctx.fill(); }
  }
}

function furPatches(ctx, k, pts) {
  ctx.strokeStyle = rgba('#5a3a20', clamp(k, 0, 1) * 0.8); ctx.lineWidth = 0.8;
  for (const [x, y] of pts) for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * 1.5 - 4, y); ctx.lineTo(x + i * 1.5 - 3, y + 4); ctx.stroke(); }
}

function scalePattern(ctx, x0, y0, w, h, tone) {
  ctx.strokeStyle = rgba(mixHex(tone, '#1a4a2a', 0.6), 0.55); ctx.lineWidth = 0.6;
  for (let y = y0; y < y0 + h; y += 5) for (let x = x0 + ((y / 5) % 2) * 2.5; x < x0 + w; x += 5) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI); ctx.stroke(); }
}

function stoneCracks(ctx, k, x0, y0, w, h) {
  ctx.strokeStyle = rgba('#4a4844', clamp(k, 0, 1) * 0.8); ctx.lineWidth = 0.7;
  for (let i = 0; i < 10 * k; i++) {
    const x = x0 + ((i * 37) % w), y = y0 + ((i * 53) % h);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 3); ctx.lineTo(x + 3, y + 8); ctx.lineTo(x + 7, y + 12); ctx.stroke();
  }
}

function crystalFacets(ctx, k, x0, y0, w, h) {
  ctx.strokeStyle = rgba('#ffffff', 0.5 * k); ctx.fillStyle = rgba('#bffff6', 0.18 * k); ctx.lineWidth = 0.6;
  for (let i = 0; i < 12 * k; i++) {
    const x = x0 + ((i * 29) % w), y = y0 + ((i * 41) % h);
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function metalSheen(ctx, k, x0, y0, w, h) {
  const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
  g.addColorStop(0, rgba('#ffffff', 0)); g.addColorStop(0.45, rgba('#ffffff', 0.35 * k)); g.addColorStop(0.55, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
}

function glowVeinsTorso(ctx, time) {
  ctx.strokeStyle = rgba('#6affc8', 0.5 + 0.3 * Math.sin(time * 3)); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, -110); ctx.bezierCurveTo(-8, -80, 8, -50, 0, -10);
  ctx.moveTo(0, -90); ctx.quadraticCurveTo(-15, -85, -22, -95); ctx.moveTo(0, -90); ctx.quadraticCurveTo(15, -85, 22, -95);
  ctx.moveTo(0, -50); ctx.quadraticCurveTo(-12, -40, -18, -30); ctx.moveTo(0, -50); ctx.quadraticCurveTo(12, -40, 18, -30); ctx.stroke();
}

function spotsAndRashes(ctx, body, x0, y0, w, h, time) {
  const S = body.symptoms;
  const n = (S.rash ? 14 : 0) + (S.spots ? 10 : 0) + (S.boils ? 6 : 0);
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i * 31) % w), y = y0 + ((i * 47) % h);
    const boil = S.boils && i % 3 === 0;
    ctx.fillStyle = rgba(boil ? '#9a6a2a' : S.spots && i % 2 ? '#9a2030' : '#d04050', boil ? 0.75 : 0.45);
    ellipse(ctx, x, y, boil ? 3 : 1.5, boil ? 3 : 1.5); ctx.fill();
  }
  if (S.sweat) {
    ctx.fillStyle = rgba('#dff4ff', 0.6 * S.sweat);
    for (let i = 0; i < 6; i++) { const x = x0 + ((i * 17 + time * 3) % w), y = y0 + ((i * 29 + time * 20) % h); ellipse(ctx, x, y, 0.9, 1.6); ctx.fill(); }
  }
}

function burnsFrost(ctx, body, x0, y0, w, h) {
  if (body.burns > 0.05) {
    ctx.fillStyle = rgba('#2a120a', body.burns * 0.55);
    for (let i = 0; i < 6; i++) { ellipse(ctx, x0 + ((i * 23) % w), y0 + ((i * 37) % h), 6, 4, i); ctx.fill(); }
  }
  if (body.frost > 0.05) {
    ctx.fillStyle = rgba('#effaff', body.frost * 0.6);
    for (let i = 0; i < 7; i++) { ellipse(ctx, x0 + ((i * 29 + 7) % w), y0 + ((i * 19 + 11) % h), 5, 3, i); ctx.fill(); }
  }
}

function crystalSpikes(ctx) {
  ctx.fillStyle = rgba('#9ff5ea', 0.85); ctx.strokeStyle = '#e8fffb'; ctx.lineWidth = 0.6;
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = sx * (20 + i * 4), y = -106 + i * 2;
    ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + sx * 3, y - 11 + i * 2); ctx.lineTo(x + 2.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// HEAD (skin / muscle / skeleton variants share the face)
// ---------------------------------------------------------------------------
function drawHead(I, mode) {
  const { ctx, body, headF, rig, time, T, s } = I;
  const pose = rig.pose;
  const yawShift = Math.sin(rig.yaw) * 9;
  const tone = mode === 'skin' ? skinTone(body) : mode === 'muscle' ? '#b8333c' : BONE;
  withFrame(ctx, headF, () => {
    const lw = 1.1;
    // neck
    if (mode === 'skin') {
      ctx.fillStyle = mixHex(tone, '#000000', 0.12);
      ctx.fillRect(-8, 14, 16, 16);
    }
    // ears
    if (mode !== 'skeleton') {
      ctx.fillStyle = mixHex(tone, '#000000', 0.1); ctx.strokeStyle = mixHex(tone, '#2a1a14', 0.5); ctx.lineWidth = lw;
      const earPoint = T.werewolf >= 0.6 || T.vampire >= 1;
      for (const sx of [-1, 1]) {
        const ex = sx * 17.5 + yawShift * 0.3;
        ctx.beginPath();
        if (earPoint) { ctx.moveTo(ex, -2); ctx.lineTo(ex + sx * 7, -16); ctx.lineTo(ex + sx * 1, 4); ctx.closePath(); }
        else ellipse(ctx, ex, 1, 3.5, 6);
        ctx.fill(); ctx.stroke();
      }
    }
    // cranium
    ctx.fillStyle = tone;
    ctx.strokeStyle = mode === 'skeleton' ? '#8a8270' : mixHex(tone, '#2a1a14', 0.55);
    ctx.lineWidth = lw;
    ellipse(ctx, 0, -1, 17.5, 21.5); ctx.fill(); ctx.stroke();
    if (mode === 'muscle') {
      ctx.strokeStyle = rgba('#ffb0a8', 0.35); ctx.lineWidth = 0.6;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -20); ctx.quadraticCurveTo(i * 5, -5, i * 3.5, 12); ctx.stroke(); }
    }
    const fx = yawShift;
    if (mode === 'skeleton') {
      drawSkullFace(ctx, fx, body);
      return;
    }
    // hair
    if (mode === 'skin') {
      if (body.mutations.includes('tentacleHair')) {
        ctx.strokeStyle = '#7a3a8a'; ctx.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(i * 4, -18);
          ctx.quadraticCurveTo(i * 7 + Math.sin(time * 3 + i) * 5, -30, i * 9 + Math.sin(time * 2 + i) * 6, -26 + Math.cos(time * 2.5 + i) * 4);
          ctx.stroke();
        }
      } else {
        const hair = T.werewolf >= 0.6 ? '#4a3020' : body.age > 70 ? '#d8d8d8' : body.age > 55 ? '#8a8a8a' : T.gold > 0.5 ? '#b8900a' : '#2c2420';
        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.ellipse(fx * 0.2, -9, 18, 14, 0, Math.PI, Math.PI * 2);
        ctx.quadraticCurveTo(10 + fx * 0.3, -13, fx * 0.3 - 4, -12);
        ctx.quadraticCurveTo(-12, -11, -18, -8);
        ctx.fill();
      }
    }
    // face
    const eyeY = -2;
    const open = clamp(pose.eyes, 0, 1.3);
    const pupil = pupilSize(body);
    const dead = !body.alive && !body.undead;
    const eyeCol = T.vampire >= 1 ? '#c0102a' : body.undead ? '#c8c890' : T.werewolf >= 1 ? '#f0b020' : body.symptoms.glowEyes ? '#b8f0ff' : '#3a6a8a';
    for (const sx of [-1, 1]) {
      const ex = fx + sx * 6.5;
      if (dead) {
        ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ex - 2.5, eyeY - 2.5); ctx.lineTo(ex + 2.5, eyeY + 2.5); ctx.moveTo(ex + 2.5, eyeY - 2.5); ctx.lineTo(ex - 2.5, eyeY + 2.5); ctx.stroke();
        continue;
      }
      if (open < 0.12) {
        ctx.strokeStyle = '#3a2420'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ex - 3.5, eyeY); ctx.quadraticCurveTo(ex, eyeY + 1.5, ex + 3.5, eyeY); ctx.stroke();
        continue;
      }
      ctx.fillStyle = body.symptoms.jaundice ? mixHex('#ffffff', '#e8d040', body.symptoms.jaundice * 0.6) : (body.effects.hallucinogen > 1 || body.effects.intoxication > 1) ? '#ffe8e8' : '#f8f6f0';
      ellipse(ctx, ex, eyeY, 4, 2.8 * Math.min(1, open)); ctx.fill();
      ctx.fillStyle = eyeCol; ellipse(ctx, ex + fx * 0.08, eyeY, 2.3, 2.3 * Math.min(1, open)); ctx.fill();
      ctx.fillStyle = '#0a0a0e'; ellipse(ctx, ex + fx * 0.08, eyeY, pupil, pupil * Math.min(1, open)); ctx.fill();
      if (body.symptoms.glowEyes) { ctx.fillStyle = rgba(eyeCol, 0.4); ellipse(ctx, ex, eyeY, 6, 4); ctx.fill(); }
    }
    if (body.mutations.includes('thirdEye')) {
      ctx.fillStyle = '#f8f6f0'; ellipse(ctx, fx, -12, 2.6, 3.4); ctx.fill();
      ctx.fillStyle = '#8a2ac8'; ellipse(ctx, fx, -12, 1.6, 2); ctx.fill();
      ctx.fillStyle = '#000'; ellipse(ctx, fx, -12, 0.7, 1.2); ctx.fill();
    }
    // brows
    ctx.strokeStyle = '#2c2420'; ctx.lineWidth = 1.3;
    const br = pose.brow;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(fx + sx * 3, -6.5 - br * 1.2 * (br < 0 ? -1 : 1) * 0.6 - (br > 0 ? br : 0));
      ctx.lineTo(fx + sx * 9.5, -7 + (br < 0 ? br * 1.4 : -br * 0.4));
      ctx.stroke();
    }
    // nose
    ctx.strokeStyle = mixHex(tone, '#2a1a14', 0.4); ctx.lineWidth = 0.9;
    if (T.werewolf >= 0.8) {
      ctx.fillStyle = '#3a2418'; ellipse(ctx, fx * 1.1, 6, 5, 3.5); ctx.fill();
    } else { ctx.beginPath(); ctx.moveTo(fx * 1.05, 1); ctx.quadraticCurveTo(fx * 1.05 + 2, 6, fx * 1.05 - 1.5, 6.5); ctx.stroke(); }
    // mouth
    const mo = clamp(pose.mouth, 0, 1), sm = clamp(pose.smile, -1, 1);
    const my = 11.5;
    ctx.strokeStyle = '#5a2020'; ctx.lineWidth = 1.2;
    if (mo > 0.12) {
      ctx.fillStyle = '#3a1010';
      ellipse(ctx, fx, my + 0.5, 3.5 + mo * 1.5, 1 + mo * 3.2); ctx.fill();
      if (T.vampire >= 1) { ctx.fillStyle = '#fff'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + sx * 2.2, my - 1); ctx.lineTo(fx + sx * 1.4, my + 2.5); ctx.lineTo(fx + sx * 0.8, my - 1); ctx.fill(); } }
    } else {
      ctx.beginPath(); ctx.moveTo(fx - 5, my - sm * 1.5); ctx.quadraticCurveTo(fx, my + sm * 3.2, fx + 5, my - sm * 1.5); ctx.stroke();
    }
    if (body.symptoms.drool || (body.undead && Math.sin(time) > 0)) { ctx.strokeStyle = rgba('#d0e8ff', 0.7); ctx.beginPath(); ctx.moveTo(fx + 3, my + 1); ctx.lineTo(fx + 3.5, my + 6 + Math.sin(time * 2) * 1.5); ctx.stroke(); }
    if (body.symptoms.nosebleed) { ctx.strokeStyle = '#b3202e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx - 1, 7); ctx.lineTo(fx - 1.3, 10.5); ctx.stroke(); }
    // cheeks
    if (body.symptoms.flushed || body.cap.love > 0.5) { ctx.fillStyle = rgba('#e05060', 0.25 + 0.2 * (body.symptoms.flushed || 0)); ellipse(ctx, fx - 10, 6, 3.5, 2); ctx.fill(); ellipse(ctx, fx + 10, 6, 3.5, 2); ctx.fill(); }
    // head-top mutations
    if (body.mutations.includes('horns')) {
      ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 0.8;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 8, -17); ctx.quadraticCurveTo(sx * 20, -26, sx * 16, -38); ctx.quadraticCurveTo(sx * 14, -26, sx * 4, -19); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    if (body.mutations.includes('antennae')) {
      ctx.strokeStyle = '#3a3a2a'; ctx.lineWidth = 1;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 4, -20); ctx.quadraticCurveTo(sx * 10, -34 + Math.sin(time * 4 + sx) * 3, sx * 14, -38); ctx.stroke(); ctx.fillStyle = '#ff6a3a'; ellipse(ctx, sx * 14, -38, 2, 2); ctx.fill(); }
    }
  });
}

function pupilSize(body) {
  if (!body.alive && !body.undead) return 2.2;
  const E = body.effects;
  const ne = body.neuro.norepinephrine;
  return clamp(1.25 + (ne - 50) / 70 + (E.stimulant || 0) * 0.15 + (E.hallucinogen || 0) * 0.3 - (E.analgesic || 0) * 0.28, 0.4, 2.2);
}

function drawSkullFace(ctx, fx, body) {
  ctx.fillStyle = '#2a2622';
  ellipse(ctx, fx - 6.5, -2, 4.2, 4.6); ctx.fill();
  ellipse(ctx, fx + 6.5, -2, 4.2, 4.6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx, 3); ctx.lineTo(fx - 2.5, 8); ctx.lineTo(fx + 2.5, 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8a8270'; ctx.lineWidth = 0.7;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(fx + i * 2, 11); ctx.lineTo(fx + i * 2, 15); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(fx - 7, 11); ctx.lineTo(fx + 7, 11); ctx.moveTo(fx - 7, 15); ctx.lineTo(fx + 7, 15); ctx.stroke();
  if (body.bones.skull.fractured) crack(ctx, -8, -16, 10, 0, 1);
  // neck vertebrae
  ctx.fillStyle = BONE; for (let i = 0; i < 3; i++) { ctx.fillRect(-3.5, 20 + i * 4.5, 7, 3.5); }
}

function crack(ctx, x, y, dx, dy, scale) {
  ctx.save();
  ctx.strokeStyle = '#ff2a3a'; ctx.lineWidth = 1.6 * scale; ctx.shadowColor = '#ff2a3a'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(x, y);
  const steps = 5;
  for (let i = 1; i <= steps; i++) ctx.lineTo(x + (dx * i) / steps + (i % 2 ? 3 : -3) * scale, y + (dy * i) / steps + (i % 2 ? -2 : 2) * scale);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// MUSCLE
// ---------------------------------------------------------------------------
function muscleColor(body, g) {
  const m = body.muscles[g];
  let c = healthTint(MUSCLE, m.health, !body.alive && !body.undead);
  c = mixHex(c, '#d8a040', clamp(m.fatigue / 100, 0, 1) * 0.55);
  const para = clamp((body.effects.paralysis || 0) * 0.3, 0, 1);
  if (para > 0) c = mixHex(c, '#b8a0a8', para * 0.7);
  if (body.transform.stone > 0.3) c = mixHex(c, '#8e8c86', body.transform.stone * 0.7);
  return c;
}

const MUSCLE_LAYER = {
  limb(I, l) {
    const { ctx, body, P, s, time } = I;
    const j = limbJoints(P, l), w = limbWidths(body, l);
    const g = l.kind === 'leg' ? 'leg' + l.side : 'arm' + l.side;
    const col = muscleColor(body, g);
    const sp = body.muscles[g].spasm;
    const jit = sp > 0.05 ? Math.sin(time * 60 + (l.side === 'L' ? 1 : 2)) * sp * 1.5 * s : 0;
    ctx.fillStyle = col; ctx.strokeStyle = mixHex(col, '#200a0a', 0.5); ctx.lineWidth = 1;
    const flex = I.rig.pose.flex && l.kind === 'arm' ? 1.35 : 1;
    // upper: bicep / quad belly
    const mid1 = along(j[0], j[1], 0.5, jit);
    taperPath(ctx, j[0], mid1, w[0] * 0.95 * s, w[0] * 1.08 * flex * s); ctx.fill(); ctx.stroke();
    taperPath(ctx, mid1, j[1], w[0] * 1.08 * flex * s, w[1] * 0.85 * s); ctx.fill(); ctx.stroke();
    // lower: forearm / calf
    const mid2 = along(j[1], j[2], l.kind === 'leg' ? 0.35 : 0.3, jit);
    taperPath(ctx, j[1], mid2, w[1] * 0.9 * s, w[1] * 1.05 * s); ctx.fill(); ctx.stroke();
    taperPath(ctx, mid2, j[2], w[1] * 1.05 * s, w[2] * 0.75 * s); ctx.fill(); ctx.stroke();
    // tendons & striations
    ctx.strokeStyle = rgba('#ffd0c8', 0.35); ctx.lineWidth = 0.7;
    for (let k = -1; k <= 1; k++) {
      const a = along(j[0], j[1], 0.12, k * w[0] * 0.5 * s), b = along(j[0], j[1], 0.88, k * w[1] * 0.4 * s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = along(j[1], j[2], 0.1, k * w[1] * 0.45 * s), d = along(j[1], j[2], 0.9, k * w[2] * 0.3 * s);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.fillStyle = '#e8d8c8';
    taperPath(ctx, along(j[1], j[2], 0.82), j[2], w[2] * 0.6 * s, w[2] * 0.55 * s); ctx.fill();
    // hands / feet as tendon-white
    if (l.kind === 'leg') { ctx.fillStyle = mixHex(col, '#e8d8c8', 0.4); ellipse(ctx, (j[2].x + j[3].x) / 2, j[3].y - 3 * s, 9 * s, 4 * s); ctx.fill(); }
    else { ctx.fillStyle = mixHex(col, '#e8d8c8', 0.35); const m = along(j[2], j[3], 0.5); ellipse(ctx, m.x, m.y, 7 * s, 4.6 * s, Math.atan2(j[3].y - j[2].y, j[3].x - j[2].x)); ctx.fill(); }
    // deltoid cap / knee
    ctx.fillStyle = mixHex(col, '#ffffff', 0.05);
    if (l.kind !== 'leg') { ellipse(ctx, j[0].x, j[0].y + 2 * s, w[0] * 1.15 * s, w[0] * 1.3 * s); ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = '#e8d8c8'; ellipse(ctx, j[1].x, j[1].y, w[1] * 0.55 * s, w[1] * 0.65 * s); ctx.fill(); }
    I.hits.push({ kind: 'muscle', id: g, a: j[0], b: j[2], r: w[0] * s });
  },
  torso(I) {
    const { ctx, body, torsoF, time } = I;
    withFrame(ctx, torsoF, () => {
      const chest = muscleColor(body, 'chest'), core = muscleColor(body, 'core'), neck = muscleColor(body, 'neck');
      const bulk = body.muscles.chest.mass;
      ctx.lineWidth = 0.8;
      // base (serratus / obliques)
      ctx.fillStyle = mixHex(core, '#401010', 0.2);
      torsoPath(ctx, body); ctx.fill();
      // neck
      ctx.fillStyle = neck; ctx.strokeStyle = mixHex(neck, '#200a0a', 0.5);
      ctx.beginPath(); ctx.moveTo(-8, -126); ctx.lineTo(-3, -108); ctx.lineTo(-10, -108); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -126); ctx.lineTo(3, -108); ctx.lineTo(10, -108); ctx.closePath(); ctx.fill(); ctx.stroke();
      // trapezius
      ctx.fillStyle = mixHex(neck, '#000', 0.1);
      ctx.beginPath(); ctx.moveTo(-8, -118); ctx.quadraticCurveTo(-20, -110, -29, -104); ctx.lineTo(-12, -106); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -118); ctx.quadraticCurveTo(20, -110, 29, -104); ctx.lineTo(12, -106); ctx.closePath(); ctx.fill();
      // pectorals
      ctx.fillStyle = chest; ctx.strokeStyle = mixHex(chest, '#200a0a', 0.5);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * 1, -104); ctx.lineTo(sx * 26 * (0.9 + bulk * 0.1), -102);
        ctx.quadraticCurveTo(sx * 28, -86, sx * 20, -79 - (bulk - 1) * 3);
        ctx.quadraticCurveTo(sx * 8, -74 - (bulk - 1) * 4, sx * 1, -80);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = rgba('#ffd0c8', 0.28);
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(sx * 2, -100 + i * 4.5); ctx.lineTo(sx * 22, -98 + i * 3.5); ctx.stroke(); }
        ctx.strokeStyle = mixHex(chest, '#200a0a', 0.5);
      }
      // abs
      ctx.fillStyle = core;
      const abW = 7 + (body.muscles.core.mass - 1) * 2;
      for (let r = 0; r < 4; r++) for (const sx of [-1, 1]) {
        const y = -73 + r * 11;
        ctx.beginPath(); ctx.roundRect(sx > 0 ? 1 : -1 - abW, y, abW, r === 3 ? 13 : 9.5, 2.5); ctx.fill(); ctx.stroke();
      }
      // obliques
      ctx.strokeStyle = rgba('#ffd0c8', 0.25);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx * 11, -70 + i * 10); ctx.lineTo(sx * 21, -64 + i * 10); ctx.stroke(); }
      // spasm flicker
      const sp = body.muscles.core.spasm;
      if (sp > 0.1) { ctx.fillStyle = rgba('#ffffff', sp * 0.2 * (0.5 + 0.5 * Math.sin(time * 40))); torsoPath(ctx, body); ctx.fill(); }
      // groin / shorts ghost
      ctx.fillStyle = rgba('#39424c', 0.5);
      ctx.beginPath(); ctx.moveTo(-26, -14); ctx.bezierCurveTo(-28, -4, -26, 6, -22, 12); ctx.lineTo(22, 12); ctx.bezierCurveTo(26, 6, 28, -4, 26, -14); ctx.closePath(); ctx.fill();
    });
    I.hits.push({ kind: 'muscle', id: 'chest', frame: torsoF, box: [-28, -106, 56, 30] });
    I.hits.push({ kind: 'muscle', id: 'core', frame: torsoF, box: [-22, -76, 44, 60] });
  },
  head(I) { drawHead(I, 'muscle'); },
};

// ---------------------------------------------------------------------------
// SKELETON
// ---------------------------------------------------------------------------
function boneColor(body, id) {
  const b = body.bones[id];
  let c = BONE;
  const dens = b.density;
  if (dens < 1) c = mixHex(c, '#8a8478', clamp(1 - dens, 0, 0.8));
  if (dens > 1.2) c = mixHex(c, '#dff4ff', clamp((dens - 1) / 3, 0, 0.7));
  c = mixHex(c, '#b89a5a', clamp(1 - b.health / 100, 0, 1) * 0.6);
  if (body.transform.metal > 0.5 || body.transform.gold > 0.5) c = mixHex(c, body.transform.gold > body.transform.metal ? '#e8bc3a' : '#b8c2cc', 0.5);
  return c;
}

function boneSeg(ctx, a, b, w, color, s, fractured) {
  ctx.fillStyle = color;
  ctx.strokeStyle = mixHex(color, '#3a3020', 0.55);
  ctx.lineWidth = 1;
  taperPath(ctx, a, b, w * 0.7 * s, w * 0.7 * s); ctx.fill(); ctx.stroke();
  ellipse(ctx, a.x, a.y, w * 1.15 * s, w * 1.15 * s); ctx.fill(); ctx.stroke();
  ellipse(ctx, b.x, b.y, w * 1.05 * s, w * 1.05 * s); ctx.fill(); ctx.stroke();
  if (fractured) {
    const m = along(a, b, 0.5);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    crack(ctx, m.x - Math.cos(ang) * w * 2 * s, m.y - Math.sin(ang) * w * 2 * s, Math.cos(ang) * w * 4 * s, Math.sin(ang) * w * 4 * s, s);
  }
}

const SKELETON_LAYER = {
  limb(I, l) {
    const { ctx, body, P, s } = I;
    const j = limbJoints(P, l);
    const side = l.side;
    if (l.kind === 'leg') {
      boneSeg(ctx, j[0], j[1], 3.8, boneColor(body, 'femur' + side), s, body.bones['femur' + side].fractured);
      const sh = boneColor(body, 'shin' + side);
      boneSeg(ctx, along(j[1], j[2], 0, -1.5 * s), along(j[2], j[1], 0, 1.5 * s), 3, sh, s, body.bones['shin' + side].fractured);
      boneSeg(ctx, along(j[1], j[2], 0.08, 4 * s), along(j[1], j[2], 0.95, 3.5 * s), 1.4, sh, s, false);
      ctx.fillStyle = BONE; ellipse(ctx, j[1].x, j[1].y, 4 * s, 4.5 * s); ctx.fill();
      const ft = boneColor(body, 'foot' + side);
      ctx.strokeStyle = ft; ctx.lineWidth = 2 * s;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(j[2].x + k * 1.5 * s, j[2].y); ctx.lineTo(j[3].x + k * 3 * s, j[3].y - 1 * s); ctx.stroke(); }
      if (body.bones['foot' + side].fractured) crack(ctx, j[3].x - 4 * s, j[3].y - 3 * s, 8 * s, 0, s);
      I.hits.push({ kind: 'bone', id: 'femur' + side, a: j[0], b: j[1], r: 7 * s });
      I.hits.push({ kind: 'bone', id: 'shin' + side, a: j[1], b: j[2], r: 6 * s });
      I.hits.push({ kind: 'bone', id: 'foot' + side, a: j[2], b: j[3], r: 6 * s });
    } else {
      const k = l.kind === 'arm2' ? 0.85 : 1;
      const hid = 'humerus' + side, fid = 'forearm' + side, nid = 'hand' + side;
      boneSeg(ctx, j[0], j[1], 3 * k, boneColor(body, hid), s, l.kind === 'arm' && body.bones[hid].fractured);
      boneSeg(ctx, along(j[1], j[2], 0, -1.6 * s), along(j[2], j[1], 0, 1.6 * s), 1.7 * k, boneColor(body, fid), s, l.kind === 'arm' && body.bones[fid].fractured);
      boneSeg(ctx, along(j[1], j[2], 0, 1.8 * s), along(j[2], j[1], 0, -1.8 * s), 1.4 * k, boneColor(body, fid), s, false);
      ctx.strokeStyle = boneColor(body, nid); ctx.lineWidth = 1.4 * s;
      const ang = Math.atan2(j[3].y - j[2].y, j[3].x - j[2].x);
      for (let f = -2; f <= 2; f++) {
        const a2 = ang + f * 0.18;
        ctx.beginPath(); ctx.moveTo(j[2].x, j[2].y); ctx.lineTo(j[2].x + Math.cos(a2) * 15 * s * k, j[2].y + Math.sin(a2) * 15 * s * k); ctx.stroke();
      }
      if (l.kind === 'arm' && body.bones[nid].fractured) crack(ctx, j[2].x, j[2].y, (j[3].x - j[2].x), (j[3].y - j[2].y), s);
      if (l.kind === 'arm') {
        I.hits.push({ kind: 'bone', id: hid, a: j[0], b: j[1], r: 6 * s });
        I.hits.push({ kind: 'bone', id: fid, a: j[1], b: j[2], r: 5 * s });
        I.hits.push({ kind: 'bone', id: nid, a: j[2], b: j[3], r: 6 * s });
      }
    }
  },
  torso(I) {
    const { ctx, body, torsoF } = I;
    withFrame(ctx, torsoF, () => {
      const lw = 1;
      // spine
      const sp = boneColor(body, 'spine');
      ctx.fillStyle = sp; ctx.strokeStyle = mixHex(sp, '#3a3020', 0.5); ctx.lineWidth = lw;
      for (let y = -118; y < -4; y += 5.6) { ctx.beginPath(); ctx.roundRect(-3.2, y, 6.4, 4.4, 1.2); ctx.fill(); ctx.stroke(); }
      if (body.bones.spine.fractured) crack(ctx, -8, -46, 16, 2, 1);
      // ribs
      const rb = boneColor(body, 'ribs');
      ctx.strokeStyle = rb; ctx.lineWidth = 2.4;
      for (let i = 0; i < 8; i++) {
        const y = -100 + i * 6.2;
        const wv = 24 - Math.abs(i - 3) * 1.4 - (i > 5 ? 3 : 0);
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sx * 3, y); ctx.bezierCurveTo(sx * wv * 0.9, y - 4, sx * wv * 1.05, y + 5, sx * wv * 0.75, y + 9); ctx.stroke();
        }
      }
      ctx.fillStyle = rb; ctx.beginPath(); ctx.roundRect(-2.8, -104, 5.6, 36, 2); ctx.fill();
      if (body.bones.ribs.fractured) crack(ctx, 10, -88, 10, 8, 1);
      // clavicles
      ctx.strokeStyle = BONE; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-3, -106); ctx.quadraticCurveTo(-15, -110, -29, -104); ctx.moveTo(3, -106); ctx.quadraticCurveTo(15, -110, 29, -104); ctx.stroke();
      // pelvis
      const pv = boneColor(body, 'pelvis');
      ctx.fillStyle = pv; ctx.strokeStyle = mixHex(pv, '#3a3020', 0.5); ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-4, -14); ctx.bezierCurveTo(-18, -26, -30, -18, -26, -6); ctx.bezierCurveTo(-22, 2, -14, 4, -12, 10);
      ctx.lineTo(-4, 8); ctx.lineTo(4, 8); ctx.lineTo(12, 10);
      ctx.bezierCurveTo(14, 4, 22, 2, 26, -6); ctx.bezierCurveTo(30, -18, 18, -26, 4, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1e24'; ellipse(ctx, -9, 2, 4, 3.4); ctx.fill(); ellipse(ctx, 9, 2, 4, 3.4); ctx.fill();
      if (body.bones.pelvis.fractured) crack(ctx, -20, -10, 12, 8, 1);
      // tail vertebrae
      if (body.mutations.includes('tail')) { ctx.fillStyle = sp; for (let i = 0; i < 5; i++) { ellipse(ctx, 0, 12 + i * 4, 2.2 - i * 0.3, 1.6); ctx.fill(); } }
    });
    I.hits.push({ kind: 'bone', id: 'ribs', frame: torsoF, box: [-24, -104, 48, 52] });
    I.hits.push({ kind: 'bone', id: 'spine', frame: torsoF, box: [-4, -52, 8, 40] });
    I.hits.push({ kind: 'bone', id: 'pelvis', frame: torsoF, box: [-28, -24, 56, 34] });
  },
  head(I) {
    drawHead(I, 'skeleton');
    I.hits.push({ kind: 'bone', id: 'skull', frame: I.headF, box: [-18, -22, 36, 44] });
  },
};

// ---------------------------------------------------------------------------
// ORGANS
// ---------------------------------------------------------------------------
const ORGAN_BASE = {
  lungL: '#e89aa8', lungR: '#e89aa8', heart: '#c0283a', liver: '#8a2a24', stomach: '#e0a0a0', spleen: '#7a3a6a',
  pancreas: '#e0c080', kidneyL: '#9a3a30', kidneyR: '#9a3a30', intestines: '#e8b0a0', brain: '#e8b8c0', eyes: '#f0f0f0',
};

function organColor(body, id, time) {
  const o = body.organs[id];
  let c = healthTint(ORGAN_BASE[id], o.health, !body.alive && !body.undead);
  if (o.inflammation > 10) c = mixHex(c, '#ff4040', clamp(o.inflammation / 100, 0, 0.5));
  if (body.transform.crystal > 0.3) c = mixHex(c, '#9ff5ea', body.transform.crystal * 0.5);
  if (body.transform.stone > 0.3) c = mixHex(c, '#8e8c86', body.transform.stone * 0.6);
  if (body.blood.toxins > 40 && (id === 'liver' || id === 'kidneyL' || id === 'kidneyR')) c = mixHex(c, '#6a8a2a', clamp((body.blood.toxins - 40) / 80, 0, 0.5));
  if (id.startsWith('lung') && body.vitals.spo2 < 85) c = mixHex(c, '#7a6ab8', clamp((85 - body.vitals.spo2) / 40, 0, 0.6));
  return c;
}

function critPulse(ctx, body, id, time, draw) {
  const h = body.organs[id].health;
  if (h < 30 && (body.alive || body.undead)) {
    ctx.save();
    ctx.strokeStyle = rgba('#ff3a4a', 0.4 + 0.4 * Math.sin(time * 6));
    ctx.lineWidth = 1.6;
    draw(); ctx.stroke();
    ctx.restore();
  }
}

const ORGAN_LAYER = {
  limb(I, l) {
    // limbs appear as faint outlines in the organ view
  },
  torso(I) {
    const { ctx, body, torsoF, time } = I;
    const beat = heartBeat(body, time);
    const breath = body.alive && !body.stasis ? Math.sin(time * (body.vitals.rr / 60) * Math.PI * 2) * 0.5 + 0.5 : 0;
    withFrame(ctx, torsoF, () => {
      ctx.lineWidth = 0.9;
      // body cavity
      ctx.fillStyle = rgba('#2a1418', 0.55);
      ctx.beginPath(); ctx.moveTo(-22, -102); ctx.quadraticCurveTo(-26, -60, -22, -10); ctx.lineTo(22, -10); ctx.quadraticCurveTo(26, -60, 22, -102); ctx.closePath(); ctx.fill();
      // kidneys (behind)
      for (const [id, sx] of [['kidneyL', 1], ['kidneyR', -1]]) {
        ctx.fillStyle = organColor(body, id, time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#1a0808', 0.5);
        const p = () => { ctx.beginPath(); ctx.ellipse(sx * 15, -44, 5, 8, sx * 0.25, 0, Math.PI * 2); };
        p(); ctx.fill(); ctx.stroke(); critPulse(ctx, body, id, time, p);
        I.hits.push({ kind: 'organ', id, frame: torsoF, box: [sx * 15 - 5, -52, 10, 16] });
      }
      // intestines
      const ic = organColor(body, 'intestines', time);
      ctx.fillStyle = mixHex(ic, '#000', 0.1); ctx.strokeStyle = mixHex(ic, '#3a1a14', 0.6);
      ctx.beginPath(); ctx.roundRect(-18, -34, 36, 26, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = mixHex(ic, '#3a1a14', 0.35); ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let r = 0; r < 4; r++) { const y = -29 + r * 6; ctx.moveTo(-14, y); for (let x = -14; x <= 14; x += 4) ctx.quadraticCurveTo(x + 1, y + (x / 4) % 2 * 3, x + 2, y); }
      ctx.stroke();
      ctx.lineWidth = 0.9;
      critPulse(ctx, body, 'intestines', time, () => { ctx.beginPath(); ctx.roundRect(-18, -34, 36, 26, 8); });
      I.hits.push({ kind: 'organ', id: 'intestines', frame: torsoF, box: [-18, -34, 36, 26] });
      // liver (subject's right → negative x)
      ctx.fillStyle = organColor(body, 'liver', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#1a0808', 0.5);
      const liver = () => { ctx.beginPath(); ctx.moveTo(-22, -66); ctx.quadraticCurveTo(-22, -52, -12, -48); ctx.quadraticCurveTo(0, -48, 6, -58); ctx.quadraticCurveTo(0, -66, -10, -68); ctx.closePath(); };
      liver(); ctx.fill(); ctx.stroke(); critPulse(ctx, body, 'liver', time, liver);
      I.hits.push({ kind: 'organ', id: 'liver', frame: torsoF, box: [-22, -68, 26, 20] });
      // stomach (subject's left → positive x)
      ctx.fillStyle = organColor(body, 'stomach', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#3a1010', 0.5);
      const stom = () => { ctx.beginPath(); ctx.moveTo(8, -66); ctx.quadraticCurveTo(22, -66, 20, -54); ctx.quadraticCurveTo(16, -44, 6, -46); ctx.quadraticCurveTo(12, -52, 9, -58); ctx.closePath(); };
      stom(); ctx.fill(); ctx.stroke(); critPulse(ctx, body, 'stomach', time, stom);
      const oral = body.doses.filter((d) => d.route === 'oral' && d.depot > 0.05);
      if (oral.length) { ctx.fillStyle = rgba(oral[0].color, 0.8); ellipse(ctx, 14, -52, 4, 3); ctx.fill(); }
      I.hits.push({ kind: 'organ', id: 'stomach', frame: torsoF, box: [6, -66, 16, 20] });
      // spleen
      ctx.fillStyle = organColor(body, 'spleen', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#1a0808', 0.5);
      ellipse(ctx, 21, -58, 3, 6, 0.3); ctx.fill(); ctx.stroke();
      I.hits.push({ kind: 'organ', id: 'spleen', frame: torsoF, box: [18, -64, 6, 12] });
      // pancreas
      ctx.fillStyle = organColor(body, 'pancreas', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#3a2a10', 0.5);
      ctx.beginPath(); ctx.ellipse(4, -44, 10, 2.6, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      I.hits.push({ kind: 'organ', id: 'pancreas', frame: torsoF, box: [-6, -47, 20, 6] });
      // lungs
      const lb = 1 + breath * 0.06;
      for (const [id, sx] of [['lungL', 1], ['lungR', -1]]) {
        ctx.fillStyle = organColor(body, id, time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#3a1020', 0.5);
        const lung = () => {
          ctx.beginPath();
          ctx.moveTo(sx * 4, -104);
          ctx.quadraticCurveTo(sx * 20 * lb, -106, sx * 22 * lb, -84);
          ctx.quadraticCurveTo(sx * 23 * lb, -70, sx * 18 * lb, -66);
          ctx.quadraticCurveTo(sx * 9, -68, sx * (id === 'lungL' ? 10 : 4), -76);
          ctx.closePath();
        };
        lung(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = rgba('#7a2030', 0.35);
        ctx.beginPath(); ctx.moveTo(sx * 5, -98); ctx.lineTo(sx * 14, -88); ctx.moveTo(sx * 6, -90); ctx.lineTo(sx * 16, -78); ctx.stroke();
        critPulse(ctx, body, id, time, lung);
        I.hits.push({ kind: 'organ', id, frame: torsoF, box: [sx > 0 ? 4 : -22, -104, 18, 38] });
      }
      // trachea
      ctx.strokeStyle = '#e8c8c0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -126); ctx.lineTo(0, -102); ctx.moveTo(0, -102); ctx.lineTo(-4, -96); ctx.moveTo(0, -102); ctx.lineTo(4, -96); ctx.stroke();
      ctx.lineWidth = 0.9;
      // heart
      const hs = 1 + beat * 0.12;
      ctx.fillStyle = organColor(body, 'heart', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#1a0404', 0.5);
      const heart = () => {
        ctx.beginPath();
        const cx = 5, cy = -82;
        ctx.moveTo(cx - 1, cy - 6 * hs);
        ctx.bezierCurveTo(cx - 10 * hs, cy - 11 * hs, cx - 12 * hs, cy + 1, cx + 1, cy + 11 * hs);
        ctx.bezierCurveTo(cx + 12 * hs, cy + 2, cx + 10 * hs, cy - 10 * hs, cx - 1, cy - 6 * hs);
        ctx.closePath();
      };
      heart(); ctx.fill(); ctx.stroke();
      if (body.rhythm === 'vfib') { ctx.fillStyle = rgba('#ffffff', 0.15 + 0.15 * Math.sin(time * 50)); heart(); ctx.fill(); }
      critPulse(ctx, body, 'heart', time, heart);
      ctx.strokeStyle = '#c0283a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(4, -89); ctx.quadraticCurveTo(0, -100, -5, -94); ctx.stroke();
      I.hits.push({ kind: 'organ', id: 'heart', frame: torsoF, box: [-6, -94, 22, 24] });
      // skin hit area (whole torso) last so organs win
    });
  },
  head(I) {
    const { ctx, body, headF, time } = I;
    withFrame(ctx, headF, () => {
      ctx.fillStyle = rgba('#2a1418', 0.5); ellipse(ctx, 0, -1, 17.5, 21.5); ctx.fill();
      ctx.fillStyle = organColor(body, 'brain', time); ctx.strokeStyle = mixHex(ctx.fillStyle, '#3a1020', 0.5); ctx.lineWidth = 0.8;
      const brain = () => { ctx.beginPath(); ctx.ellipse(0, -8, 15, 12.5, 0, 0, Math.PI * 2); };
      brain(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba('#8a4050', 0.45);
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 3);
      for (let i = 0; i < 5; i++) { ctx.moveTo(-12, -16 + i * 4); ctx.quadraticCurveTo(-6, -18 + i * 4, -2, -14 + i * 4); ctx.moveTo(12, -16 + i * 4); ctx.quadraticCurveTo(6, -18 + i * 4, 2, -14 + i * 4); }
      ctx.stroke();
      critPulse(ctx, body, 'brain', time, brain);
      // eyes
      ctx.fillStyle = organColor(body, 'eyes', time);
      ellipse(ctx, -6.5, 6, 3.6, 3.6); ctx.fill(); ellipse(ctx, 6.5, 6, 3.6, 3.6); ctx.fill();
      ctx.fillStyle = '#3a6a8a'; ellipse(ctx, -6.5, 6, 1.6, 1.6); ctx.fill(); ellipse(ctx, 6.5, 6, 1.6, 1.6); ctx.fill();
    });
    I.hits.push({ kind: 'organ', id: 'brain', frame: I.headF, box: [-15, -20, 30, 24] });
    I.hits.push({ kind: 'organ', id: 'eyes', frame: I.headF, box: [-11, 2, 22, 8] });
  },
};

export function heartBeat(body, time) {
  if (!body.alive || body.stasis) return 0;
  if (body.rhythm === 'vfib') return 0.3 + 0.3 * Math.sin(time * 40);
  if (body.rhythm === 'asystole') return 0;
  const period = 60 / Math.max(20, body.vitals.hr);
  const ph = (time % period) / period;
  return ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
}

// ---------------------------------------------------------------------------
// VASCULAR
// ---------------------------------------------------------------------------
function flowDots(ctx, pts, time, speed, color, count, size) {
  // pts: polyline of screen points
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(l); total += l; }
  if (total < 1) return;
  ctx.fillStyle = color;
  for (let k = 0; k < count; k++) {
    let d = ((time * speed + (k / count) * total) % total + total) % total;
    let i = 0;
    while (i < segs.length && d > segs[i]) { d -= segs[i]; i++; }
    if (i >= segs.length) continue;
    const t = d / segs[i];
    const x = lerp(pts[i].x, pts[i + 1].x, t), y = lerp(pts[i].y, pts[i + 1].y, t);
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
}

function polyline(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

const VASCULAR_LAYER = {
  limb(I, l) {
    const { ctx, body, P, s, time } = I;
    const j = limbJoints(P, l);
    const flowing = body.alive && !body.stasis && body.rhythm !== 'vfib' && body.rhythm !== 'asystole';
    const speed = flowing ? 20 + body.vitals.hr * 0.9 : 0;
    const dens = Math.round(4 + body.vitals.bloodVolume / 20);
    const art = [along(j[0], j[1], 0, 2 * s), along(j[0], j[1], 1, 2 * s), along(j[1], j[2], 1, 1.5 * s), j[3]];
    const vein = [j[3], along(j[1], j[2], 1, -1.8 * s), along(j[0], j[1], 1, -2.4 * s), along(j[0], j[1], 0, -2.4 * s)];
    const bc = bloodColor(body);
    ctx.lineCap = 'round';
    ctx.strokeStyle = mixHex(ARTERY, bc, 0.5); ctx.lineWidth = 2.6 * s; polyline(ctx, art); ctx.stroke();
    ctx.strokeStyle = VEIN; ctx.lineWidth = 2.2 * s; polyline(ctx, vein); ctx.stroke();
    // capillary branches
    ctx.strokeStyle = rgba(ARTERY, 0.45); ctx.lineWidth = 0.8 * s;
    for (let k = 1; k < 4; k++) { const a = along(j[0], j[2], k / 4, 2 * s), b = along(j[0], j[2], k / 4 + 0.06, 7 * s); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    if (speed > 0) {
      flowDots(ctx, art, time, speed * s, '#ffb0b0', dens, 1.2 * s);
      flowDots(ctx, vein, time, speed * 0.7 * s, '#b0c8ff', dens, 1.1 * s);
    }
    ctx.lineCap = 'butt';
  },
  torso(I) {
    const { ctx, body, torsoF, time } = I;
    const beat = heartBeat(body, time);
    const bc = bloodColor(body);
    withFrame(ctx, torsoF, () => {
      ctx.lineCap = 'round';
      // aorta & branches
      ctx.strokeStyle = mixHex(ARTERY, bc, 0.5); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(5, -88); ctx.bezierCurveTo(4, -104, -6, -104, -2, -90); ctx.lineTo(-2, -4); ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-2, -100); ctx.lineTo(-6, -128); ctx.moveTo(1, -101); ctx.lineTo(6, -128);
      ctx.moveTo(-1, -99); ctx.quadraticCurveTo(-18, -104, -29, -103); ctx.moveTo(2, -99); ctx.quadraticCurveTo(18, -104, 29, -103);
      ctx.moveTo(-2, -6); ctx.lineTo(-12, 2); ctx.moveTo(-2, -6); ctx.lineTo(12, 2);
      ctx.moveTo(-2, -44); ctx.lineTo(-14, -44); ctx.moveTo(-2, -44); ctx.lineTo(14, -44);
      ctx.stroke();
      // vena cava
      ctx.strokeStyle = VEIN; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(2, -82); ctx.lineTo(3, -4); ctx.moveTo(3, -4); ctx.lineTo(12, 2); ctx.moveTo(3, -4); ctx.lineTo(-12, 2); ctx.moveTo(1, -90); ctx.lineTo(3, -128); ctx.stroke();
      // heart
      const hs = 1 + beat * 0.14;
      ctx.fillStyle = body.rhythm === 'asystole' || !body.alive ? '#5a2a30' : '#c0283a';
      ctx.beginPath(); const cx = 5, cy = -82;
      ctx.moveTo(cx - 1, cy - 6 * hs); ctx.bezierCurveTo(cx - 10 * hs, cy - 11 * hs, cx - 12 * hs, cy + 1, cx + 1, cy + 11 * hs);
      ctx.bezierCurveTo(cx + 12 * hs, cy + 2, cx + 10 * hs, cy - 10 * hs, cx - 1, cy - 6 * hs); ctx.fill();
      // flow
      const flowing = body.alive && !body.stasis && body.rhythm !== 'vfib' && body.rhythm !== 'asystole';
      if (flowing) {
        const sp = 20 + body.vitals.hr * 0.9;
        const pts = [{ x: 5, y: -88 }, { x: -2, y: -100 }, { x: -2, y: -60 }, { x: -2, y: -4 }];
        flowDots(ctx, pts, time, sp, '#ffb0b0', 10, 1.3);
        flowDots(ctx, [{ x: 3, y: -4 }, { x: 2, y: -82 }], time, sp * 0.7, '#b0c8ff', 8, 1.2);
      }
      // bleeding source
      if (body.bleedRate > 0.05) {
        ctx.fillStyle = rgba(bc, 0.6 + 0.3 * Math.sin(time * 5));
        ellipse(ctx, -2, -50, 4 + body.bleedRate * 6, 3 + body.bleedRate * 4); ctx.fill();
      }
      ctx.lineCap = 'butt';
    });
    withFrame(ctx, I.headF, () => {
      ctx.strokeStyle = rgba(ARTERY, 0.8); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-5, 22); ctx.quadraticCurveTo(-14, 0, -6, -18); ctx.moveTo(5, 22); ctx.quadraticCurveTo(14, 0, 6, -18); ctx.stroke();
      ctx.strokeStyle = rgba(VEIN, 0.7); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-8, 22); ctx.quadraticCurveTo(-16, 2, -10, -16); ctx.moveTo(8, 22); ctx.quadraticCurveTo(16, 2, 10, -16); ctx.stroke();
    });
    I.hits.push({ kind: 'vitals', id: 'blood', frame: torsoF, box: [-12, -104, 24, 100] });
  },
  head() {},
};

// ---------------------------------------------------------------------------
// NERVES
// ---------------------------------------------------------------------------
const REGION_LAYOUT = {
  frontal: [0, -15, 10, 6], motor: [0, -8, 13, 3], sensory: [0, -3, 13, 3], temporal: [0, 1, 0, 0],
  occipital: [0, 4, 7, 3], broca: [-10, 0, 3.5, 3], hippocampus: [0, -1, 4, 2.2], amygdala: [0, 2, 2.5, 1.6],
  cerebellum: [0, 9, 8, 3.5], brainstem: [0, 14, 2.6, 5],
};

function regionColor(body, id) {
  const r = body.brain[id];
  const act = clamp(r.activity / 100, 0, 1.5);
  let c = mixHex('#40203a', '#ffd84a', clamp(act, 0, 1));
  if (act > 1) c = mixHex(c, '#ffffff', clamp(act - 1, 0, 0.6));
  if (r.health < 60) c = mixHex(c, '#6a1010', clamp((60 - r.health) / 60, 0, 0.9));
  return c;
}

const NERVE_LAYER = {
  limb(I, l) {
    const { ctx, body, P, s, time } = I;
    const j = limbJoints(P, l);
    const nid = l.kind === 'leg' ? 'leg' + l.side : 'arm' + l.side;
    const n = body.nerves[nid] || body.nerves['arm' + l.side];
    const h = n.health / 100;
    const col = mixHex('#5a3a10', NERVE, h);
    ctx.strokeStyle = col; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    if (h < 0.5) ctx.setLineDash([4 * s, 3 * s]);
    const pts = [j[0], along(j[0], j[1], 1, 1 * s), along(j[1], j[2], 1, -1 * s), j[3]];
    polyline(ctx, pts); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 0.8 * s;
    for (let k = 1; k < 6; k++) {
      const a = along(j[0], j[2], k / 6), b = along(j[0], j[2], k / 6 + 0.07, (k % 2 ? 6 : -6) * s);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if ((body.alive || body.undead) && !body.stasis) {
      const sp = 60 * body.conductivity * (0.4 + h);
      flowDots(ctx, pts, time, sp * s, rgba('#ffffff', 0.9), 3, 1.6 * s);
    }
    if (h < 0.4 && Math.sin(time * 13) > 0.3) { ctx.fillStyle = rgba('#ff3a3a', 0.8); const m = along(j[0], j[2], 0.5); ellipse(ctx, m.x, m.y, 2.5 * s, 2.5 * s); ctx.fill(); }
    I.hits.push({ kind: 'nerve', id: nid, a: j[0], b: j[3], r: 6 * s });
  },
  torso(I) {
    const { ctx, body, torsoF, time } = I;
    const sh = body.nerves.spinal.health / 100;
    withFrame(ctx, torsoF, () => {
      ctx.strokeStyle = mixHex('#5a3a10', NERVE, sh); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      if (sh < 0.5) ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(0, -126); ctx.lineTo(0, -6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 9; i++) {
        const y = -100 + i * 10;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(-12, y + 2, -22, y + 6); ctx.moveTo(0, y); ctx.quadraticCurveTo(12, y + 2, 22, y + 6); ctx.stroke();
      }
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, -108); ctx.quadraticCurveTo(-16, -108, -29, -104); ctx.moveTo(0, -108); ctx.quadraticCurveTo(16, -108, 29, -104);
      ctx.moveTo(0, -8); ctx.lineTo(-12, 0); ctx.moveTo(0, -8); ctx.lineTo(12, 0); ctx.stroke();
      // vagus nerve to the heart
      ctx.strokeStyle = rgba(NERVE, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -124); ctx.quadraticCurveTo(-6, -100, 4, -84); ctx.stroke();
      ctx.lineCap = 'butt';
      if ((body.alive || body.undead) && !body.stasis) flowDots(ctx, [{ x: 0, y: -126 }, { x: 0, y: -6 }], time, 70 * body.conductivity, '#ffffff', 5, 1.5);
      if (sh < 0.4 && Math.sin(time * 11) > 0.2) { ctx.fillStyle = rgba('#ff3a3a', 0.8); ellipse(ctx, 0, -50, 3, 3); ctx.fill(); }
    });
    I.hits.push({ kind: 'nerve', id: 'spinal', frame: torsoF, box: [-5, -126, 10, 120] });
  },
  head(I) {
    const { ctx, body, headF, time } = I;
    const seizing = body.seizure > 0;
    withFrame(ctx, headF, () => {
      ctx.fillStyle = rgba('#1a1024', 0.7); ellipse(ctx, 0, -1, 17.5, 21.5); ctx.fill();
      ctx.fillStyle = '#3a2440'; ellipse(ctx, 0, -6, 15.5, 14); ctx.fill();
      for (const [id, [x, y, rx, ry]] of Object.entries(REGION_LAYOUT)) {
        let c = regionColor(body, id);
        if (seizing) c = mixHex(c, '#ffffff', 0.5 + 0.5 * Math.sin(time * 30 + x));
        ctx.fillStyle = c;
        if (id === 'temporal') { ellipse(ctx, -12, 1, 3.4, 5); ctx.fill(); ellipse(ctx, 12, 1, 3.4, 5); ctx.fill(); continue; }
        ellipse(ctx, x, y, rx, ry); ctx.fill();
        if (id === 'broca') { ellipse(ctx, x, y, rx, ry); ctx.fill(); }
      }
      ctx.strokeStyle = rgba('#ffd84a', 0.25); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 8); ctx.stroke();
      // cranial nerves
      const cn = body.nerves.cranial.health / 100;
      ctx.strokeStyle = mixHex('#5a3a10', NERVE, cn); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-6.5, 5); ctx.moveTo(0, 10); ctx.lineTo(6.5, 5); ctx.moveTo(0, 12); ctx.lineTo(-12, 12); ctx.moveTo(0, 12); ctx.lineTo(12, 12); ctx.stroke();
    });
    for (const [id, [x, y, rx, ry]] of Object.entries(REGION_LAYOUT)) {
      if (id === 'temporal') { I.hits.push({ kind: 'brain', id, frame: headF, box: [-16, -4, 8, 10] }); I.hits.push({ kind: 'brain', id, frame: headF, box: [8, -4, 8, 10] }); continue; }
      I.hits.push({ kind: 'brain', id, frame: headF, box: [x - rx, y - ry, rx * 2, ry * 2] });
    }
  },
};

const LAYER_DRAW = { skin: SKIN_LAYER, muscle: MUSCLE_LAYER, skeleton: SKELETON_LAYER, organs: ORGAN_LAYER, vascular: VASCULAR_LAYER, nerves: NERVE_LAYER };

// ---------------------------------------------------------------------------
// mutations drawn behind the body
// ---------------------------------------------------------------------------
function drawBackMutations(I, alphas) {
  const { ctx, body, torsoF, time, P, s } = I;
  const a = Math.max(alphas.skin, alphas.muscle, 0.25);
  ctx.save();
  ctx.globalAlpha *= a;
  if (body.mutations.includes('wings')) {
    withFrame(ctx, torsoF, () => {
      const flap = Math.sin(time * (I.actor.airborne ? 10 : 1.5)) * 0.25;
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(sx * 10, -96); ctx.rotate(sx * (0.2 + flap));
        ctx.fillStyle = rgba('#5a3a6a', 0.85); ctx.strokeStyle = '#2a1a30'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx * 70, -40); ctx.lineTo(sx * 64, -8); ctx.lineTo(sx * 58, 14); ctx.lineTo(sx * 40, 10); ctx.lineTo(sx * 22, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx * 64, -8); ctx.moveTo(0, 0); ctx.lineTo(sx * 40, 10); ctx.stroke();
        ctx.restore();
      }
    });
  }
  if (body.mutations.includes('tail') || body.transform.werewolf >= 1) {
    const base = torsoF.apply(0, 6);
    ctx.strokeStyle = body.transform.werewolf >= 1 ? '#5a3a20' : mixHex(skinTone(body), '#000', 0.15);
    ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base.x, base.y);
    const sw = Math.sin(time * 2) * 20 * s;
    ctx.bezierCurveTo(base.x + 30 * s + sw, base.y + 10 * s, base.x + 50 * s, base.y - 30 * s, base.x + 44 * s + sw, base.y - 60 * s);
    ctx.stroke(); ctx.lineCap = 'butt';
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// overlays
// ---------------------------------------------------------------------------
function tempColor(t) {
  const k = clamp((t - 25) / 20, 0, 1);
  const stops = ['#1a2a8a', '#2a8ae0', '#3ad08a', '#e0e030', '#ff8a20', '#ff2020', '#ffffff'];
  const f = k * (stops.length - 1);
  const i = Math.floor(f);
  return mixHex(stops[i], stops[Math.min(stops.length - 1, i + 1)], f - i);
}

function drawThermal(I, far, near) {
  const { ctx, body } = I;
  ctx.save();
  ctx.globalAlpha = 0.72;
  const core = body.vitals.temp;
  const limbT = core - 2.5 + (body.burning ? 15 : 0);
  drawSilhouetteFill(I, far, near, tempColor(limbT), tempColor(core));
  ctx.restore();
}

function drawSilhouetteFill(I, far, near, limbColor, coreColor) {
  const { ctx, body, torsoF, headF, P, s } = I;
  ctx.fillStyle = limbColor;
  for (const l of [...far, ...near]) {
    const j = limbJoints(P, l), w = limbWidths(body, l);
    taperPath(ctx, j[0], j[1], w[0] * s, w[1] * s); ctx.fill();
    taperPath(ctx, j[1], j[2], w[1] * s, w[2] * s); ctx.fill();
  }
  ctx.fillStyle = coreColor;
  withFrame(ctx, torsoF, () => { torsoPath(ctx, body); ctx.fill(); });
  withFrame(ctx, headF, () => { ellipse(ctx, 0, -1, 17.5, 21.5); ctx.fill(); });
}

function drawDamage(I, far, near) {
  const { ctx, body, torsoF, headF, P, s, time } = I;
  ctx.save();
  const dmg = (h) => rgba('#ff2a3a', clamp((100 - h) / 100, 0, 1) * 0.75);
  for (const l of [...far, ...near]) {
    const j = limbJoints(P, l), w = limbWidths(body, l);
    const g = l.kind === 'leg' ? 'leg' + l.side : 'arm' + l.side;
    const bones = l.kind === 'leg' ? ['femur', 'shin'] : ['humerus', 'forearm'];
    const h = Math.min(body.muscles[g].health, ...bones.map((b) => body.bones[b + l.side].health));
    ctx.fillStyle = dmg(h);
    taperPath(ctx, j[0], j[1], w[0] * s, w[1] * s); ctx.fill();
    taperPath(ctx, j[1], j[2], w[1] * s, w[2] * s); ctx.fill();
  }
  const organs = body.organs;
  withFrame(ctx, torsoF, () => {
    const spots = { heart: [5, -82, 9], lungL: [13, -86, 10], lungR: [-13, -86, 10], liver: [-10, -58, 10], stomach: [14, -56, 7], kidneyL: [15, -44, 6], kidneyR: [-15, -44, 6], intestines: [0, -22, 12], spleen: [21, -58, 5], pancreas: [4, -44, 6] };
    for (const [id, [x, y, r]] of Object.entries(spots)) {
      const h = organs[id].health;
      if (h > 95) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
      g.addColorStop(0, dmg(h)); g.addColorStop(1, rgba('#ff2a3a', 0));
      ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    }
  });
  withFrame(ctx, headF, () => {
    const h = Math.min(organs.brain.health, ...Object.values(body.brain).map((r) => r.health));
    if (h < 95) { ctx.fillStyle = dmg(h); ellipse(ctx, 0, -6, 15, 13); ctx.fill(); }
  });
  ctx.restore();
}

function drawLabels(I, alphas) {
  const { ctx, body, torsoF, headF, P, s } = I;
  const items = [];
  const top = Object.entries(alphas).sort((a, b) => b[1] - a[1])[0][0];
  if (top === 'organs') {
    for (const [id, [x, y]] of Object.entries({ heart: [5, -82], lungL: [14, -92], lungR: [-14, -92], liver: [-10, -58], stomach: [14, -58], kidneyL: [16, -44], kidneyR: [-16, -44], intestines: [0, -22], spleen: [22, -60], pancreas: [3, -44] })) items.push([torsoF.apply(x, y), body.organs[id].health, id]);
    items.push([headF.apply(0, -8), body.organs.brain.health, 'brain']);
  } else if (top === 'skeleton') {
    for (const id of ['femurL', 'femurR', 'shinL', 'shinR', 'humerusL', 'humerusR', 'forearmL', 'forearmR']) {
      const side = id.slice(-1), base = id.slice(0, -1);
      const [a, b] = base === 'femur' ? [P['hp' + side], P['kn' + side]] : base === 'shin' ? [P['kn' + side], P['an' + side]] : base === 'humerus' ? [P['sh' + side], P['el' + side]] : [P['el' + side], P['wr' + side]];
      items.push([along(a, b, 0.5), body.bones[id].health, id]);
    }
    items.push([torsoF.apply(0, -80), body.bones.ribs.health, 'ribs']);
    items.push([headF.apply(0, -10), body.bones.skull.health, 'skull']);
  } else if (top === 'muscle') {
    for (const g of ['armL', 'armR', 'legL', 'legR']) {
      const side = g.slice(-1);
      const [a, b] = g.startsWith('arm') ? [P['sh' + side], P['el' + side]] : [P['hp' + side], P['kn' + side]];
      items.push([along(a, b, 0.5), body.muscles[g].health, g]);
    }
    items.push([torsoF.apply(0, -90), body.muscles.chest.health, 'chest']);
    items.push([torsoF.apply(0, -55), body.muscles.core.health, 'core']);
  } else if (top === 'nerves') {
    for (const id of Object.keys(REGION_LAYOUT)) if (id !== 'temporal') items.push([headF.apply(REGION_LAYOUT[id][0], REGION_LAYOUT[id][1]), body.brain[id].health, id]);
  }
  ctx.save();
  ctx.font = `600 ${Math.max(9, 10 * Math.min(1.2, s))}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  for (const [p, h] of items) {
    const txt = `${Math.round(h)}`;
    const col = h > 70 ? '#7dffb0' : h > 35 ? '#ffd24a' : '#ff5a6a';
    ctx.fillStyle = 'rgba(8,14,18,0.78)';
    const w = ctx.measureText(txt).width + 6;
    ctx.fillRect(p.x - w / 2, p.y - 7, w, 13);
    ctx.fillStyle = col;
    ctx.fillText(txt, p.x, p.y + 3.5);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// hit testing
// ---------------------------------------------------------------------------
export function hitTest(hits, x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.frame) {
      // invert the affine frame
      const F = h.frame;
      const det = F.a * F.d - F.b * F.c;
      if (Math.abs(det) < 1e-6) continue;
      const dx = x - F.e, dy = y - F.f;
      const lx = (F.d * dx - F.c * dy) / det, ly = (-F.b * dx + F.a * dy) / det;
      const [bx, by, bw, bh] = h.box;
      if (lx >= bx && lx <= bx + bw && ly >= by && ly <= by + bh) return h;
    } else if (h.a) {
      const vx = h.b.x - h.a.x, vy = h.b.y - h.a.y;
      const t = clamp(((x - h.a.x) * vx + (y - h.a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      const px = h.a.x + vx * t, py = h.a.y + vy * t;
      if (Math.hypot(x - px, y - py) <= h.r) return h;
    }
  }
  return null;
}
