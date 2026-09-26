// Rig: turns the actor's current action into a pose, then into screen-space joints.
// Joints live in a 3D body frame (x = subject's LEFT, y = down, z = toward viewer),
// are rotated by yaw and projected orthographically. Subject's left appears on the
// viewer's right when facing front, like a real anatomical front view.
import { clamp, lerp } from '../util.js';

export const DIM = {
  headR: 20, neck: 12, shoulderY: -104, shoulderX: 30, hipX: 12,
  upperArm: 52, foreArm: 48, hand: 15, thigh: 66, shin: 62, footH: 7, footL: 20,
  chestW: 34, waistW: 24, hipW: 28, torsoTop: -112,
};
export const LEG_LEN = DIM.thigh + DIM.shin + DIM.footH; // pelvis height above floor when standing
export const PX_PER_M = (LEG_LEN + 112 + 12 + 2 * DIM.headR) / 1.75;

// Pose: angles in radians. Arms/legs use abduction `a` (sideways, positive = outward)
// and flexion `f` (forward toward viewer, positive = forward).
export function neutralPose() {
  return {
    lean: 0, sway: 0, twist: 0, crouch: 0, headTilt: 0, headNod: 0,
    armL: { a: 0.12, f: 0, ea: 0.1, ef: 0.1 }, armR: { a: 0.12, f: 0, ea: 0.1, ef: 0.1 },
    legL: { a: 0.04, f: 0, kf: 0 }, legR: { a: 0.04, f: 0, kf: 0 },
    mouth: 0, eyes: 1, brow: 0, smile: 0.2, tongue: 0,
  };
}

const lerpLimb = (a, b, t) => { const o = {}; for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k] ?? a[k], t); return o; };

export function blendPose(cur, target, t) {
  const out = {};
  for (const k of Object.keys(cur)) {
    out[k] = typeof cur[k] === 'object' ? lerpLimb(cur[k], target[k], t) : lerp(cur[k], target[k] ?? cur[k], t);
  }
  return out;
}

const S = Math.sin, C = Math.cos;

// Compute target pose for the actor's action at time t.
export function targetPose(actor, body, time) {
  const p = neutralPose();
  const cap = body.cap || {};
  const t = actor.t;
  const a = actor.action;
  const d = actor.data || {};
  const E = body.effects || {};
  const breathe = S(time * (body.vitals.rr / 60) * Math.PI * 2);
  p.lean = breathe * 0.008;
  p.armL.a += breathe * 0.01; p.armR.a += breathe * 0.01;
  p.eyes = blinkAt(time);
  p.smile = clamp((cap.mood || 0) / 100, -1, 1) * 0.8;
  p.brow = clamp(-(cap.aggression || 0) * 0.5 + (cap.fear || 0) * 0.5, -1, 1);
  if (body.vitals.pain > 40) { p.brow = 0.6; p.smile = -0.6; }
  if (body.speaking) p.mouth = 0.3 + 0.3 * Math.abs(S(time * 14));

  const walkCycle = (freq, amp, armAmp) => {
    const ph = time * freq;
    const sL = S(ph), sR = S(ph + Math.PI);
    p.legL.f = sL * amp; p.legR.f = sR * amp;
    p.legL.kf = Math.max(0, -C(ph)) * amp * 1.4 + 0.05; p.legR.kf = Math.max(0, C(ph)) * amp * 1.4 + 0.05;
    p.armL.f = -sL * armAmp; p.armR.f = -sR * armAmp;
    p.armL.ef = 0.3 + armAmp * 0.6; p.armR.ef = 0.3 + armAmp * 0.6;
    p.lean = 0.05 * amp;
  };

  switch (a) {
    case 'walk': case 'shamble': {
      const sp = (cap.speed || 1) * (a === 'shamble' ? 0.35 : 1);
      walkCycle(7 * clamp(sp, 0.3, 3), 0.45, 0.35);
      if (a === 'shamble') { p.armL.f = 1.4; p.armR.f = 1.4; p.armL.ef = 0; p.armR.ef = 0; p.headTilt = 0.3; p.lean = 0.15; p.mouth = 0.4; }
      if (body.symptoms.limp) { p.legL.kf *= 0.4; p.sway = S(time * 7) * 0.08; }
      break;
    }
    case 'run': case 'flee': {
      walkCycle(12 * clamp(cap.speed || 1, 0.4, 3), 0.85, 0.9);
      p.lean = 0.18; p.armL.ef = 1.4; p.armR.ef = 1.4;
      if (a === 'flee') { p.brow = 1; p.mouth = 0.7; }
      break;
    }
    case 'jump': case 'backflip': {
      if (d.phase === 'crouch') { p.crouch = 0.55 * Math.min(1, t / 0.3); p.armL.a = -0.2; p.armR.a = -0.2; p.armL.f = -0.6; p.armR.f = -0.6; p.lean = 0.2; }
      else if (d.phase === 'air') { p.armL.a = 2.6; p.armR.a = 2.6; p.legL.kf = 0.5; p.legR.kf = 0.5; p.legL.f = 0.3; p.legR.f = 0.3; p.mouth = 0.4; p.smile = 0.8; }
      else { p.crouch = 0.4 * Math.max(0, 1 - t / 0.35); }
      break;
    }
    case 'sit': {
      p.legL.f = 1.5; p.legR.f = 1.5; p.legL.kf = 1.5; p.legR.kf = 1.5; p.legL.a = 0.12; p.legR.a = 0.12;
      p.armL.f = 0.5; p.armR.f = 0.5; p.armL.ef = 1.2; p.armR.ef = 1.2;
      break;
    }
    case 'crouch': case 'cower': {
      p.crouch = 0.7; p.legL.a = 0.35; p.legR.a = 0.35;
      p.armL.f = 0.8; p.armR.f = 0.8; p.armL.ef = 2.2; p.armR.ef = 2.2; p.lean = 0.35;
      if (a === 'cower') { p.headNod = 0.4; p.brow = 1; p.smile = -0.8; p.armL.a = 0.6; p.armR.a = 0.6; p.armL.ea = 2.4; p.armR.ea = 2.4; }
      break;
    }
    case 'wave': {
      const arm = d.arm === 'L' ? p.armL : p.armR;
      arm.a = 2.3; arm.ea = 2.3 + S(time * 12) * 0.5; p.smile = 0.9; p.headTilt = 0.1;
      break;
    }
    case 'dance': {
      const q = clamp((d.quality || 60) / 100, 0.2, 1.3);
      const b = time * 6;
      p.sway = S(b) * 0.12 * q;
      p.armL.a = 1.2 + S(b) * 1.2 * q; p.armR.a = 1.2 - S(b) * 1.2 * q;
      p.armL.ea = p.armL.a + 0.8 + S(b * 2) * 0.6; p.armR.ea = p.armR.a + 0.8 - S(b * 2) * 0.6;
      p.legL.f = Math.max(0, S(b)) * 0.6 * q; p.legR.f = Math.max(0, -S(b)) * 0.6 * q;
      p.legL.kf = p.legL.f * 1.5; p.legR.kf = p.legR.f * 1.5;
      p.headTilt = S(b) * 0.2; p.smile = 1; p.crouch = (1 + S(b * 2)) * 0.08;
      break;
    }
    case 'lift': {
      const kg = d.kg || 60;
      const lifting = t > 0.8;
      const up = d.success ? clamp((t - 0.8) / 0.8, 0, 1) : clamp((t - 0.8) / 0.8, 0, 0.35) * (t > 2.2 ? 0 : 1);
      if (!lifting) { p.crouch = 0.65 * clamp(t / 0.6, 0, 1); p.armL.a = 0.3; p.armR.a = 0.3; p.armL.f = 0.4; p.armR.f = 0.4; p.lean = 0.25; }
      else {
        const hold = t > 2.8 ? clamp(1 - (t - 2.8) / 0.6, 0, 1) : 1;
        const h = up * hold;
        p.crouch = 0.65 * (1 - Math.min(1, h * 2));
        p.armL.a = lerp(0.3, 2.75, h); p.armR.a = lerp(0.3, 2.75, h);
        p.armL.ea = lerp(0.3, 2.95, h); p.armR.ea = lerp(0.3, 2.95, h);
        p.mouth = 0.5; p.brow = 0.8; p.smile = d.success ? 0.2 : -0.8;
        if (!d.success) { p.shake = 1; p.armL.a += S(time * 40) * 0.05; }
      }
      p.barbellKg = kg;
      break;
    }
    case 'punch': {
      const period = 0.55;
      const ph = (t % period) / period;
      const ext = ph < 0.35 ? ph / 0.35 : Math.max(0, 1 - (ph - 0.35) / 0.4);
      const side = actor.props.bagSide || 1;
      p.armL.a = 0.6; p.armL.f = 0.9; p.armL.ea = 0.3; p.armL.ef = 2.3;
      p.armR.a = 0.6; p.armR.f = 0.9; p.armR.ea = 0.3; p.armR.ef = 2.3;
      const arm = Math.floor(t / period) % 2 ? p.armL : p.armR;
      arm.a = lerp(0.6, 1.55, ext); arm.f = lerp(0.9, 0.1, ext); arm.ea = lerp(0.3, 1.57, ext); arm.ef = lerp(2.3, 0.1, ext);
      p.punchArm = arm === p.armL ? 'L' : 'R';
      p.faceSide = side;
      p.brow = -0.8;
      break;
    }
    case 'kick': {
      const period = 0.8;
      const ph = (t % period) / period;
      const ext = ph < 0.4 ? ph / 0.4 : Math.max(0, 1 - (ph - 0.4) / 0.4);
      p.legR.a = lerp(0.04, 1.3, ext); p.legR.kf = lerp(0.2, 0, ext);
      p.armL.a = 0.8; p.armR.a = 0.8; p.sway = -0.12 * ext; p.brow = -0.8;
      break;
    }
    case 'flex': {
      p.armL.a = 1.5; p.armR.a = 1.5; p.armL.ea = 3.0; p.armR.ea = 3.0; p.smile = 1; p.brow = -0.3;
      p.flex = 1;
      break;
    }
    case 'stretch': {
      const k = S(t * 1.5);
      p.armL.a = 2.9; p.armR.a = 2.9; p.armL.ea = 3.1; p.armR.ea = 3.1; p.sway = k * 0.15; p.eyes = 0.2;
      break;
    }
    case 'balance': {
      const w = actor.wobble || 0.1;
      p.legR.f = 0.9; p.legR.kf = 1.6; p.armL.a = 1.45; p.armR.a = 1.45;
      p.sway = S(time * 3.1) * w * 0.4 + S(time * 7.3) * w * 0.15;
      p.armL.a += S(time * 2.3) * w; p.armR.a -= S(time * 2.3) * w;
      break;
    }
    case 'think': {
      p.armR.a = 0.4; p.armR.f = 0.9; p.armR.ea = 2.5; p.armR.ef = 1.4; p.headTilt = 0.18; p.eyes = 0.8; p.smile = 0;
      break;
    }
    case 'talk': case 'sing': {
      p.armL.a = 0.5 + S(time * 3) * 0.3; p.armL.ea = 1.2; p.armL.f = 0.4;
      if (a === 'sing') { p.headTilt = S(time * 2) * 0.15; p.eyes = 0.3; p.mouth = 0.5 + 0.4 * Math.abs(S(time * 5)); }
      break;
    }
    case 'lookAround': p.headTilt = S(t * 2.4) * 0.35; break;
    case 'shiftWeight': p.sway = S(t * 1.4) * 0.07; break;
    case 'scratchHead': p.armR.a = 2.1; p.armR.ea = 3.6 + S(time * 18) * 0.15; p.headTilt = -0.12; break;
    case 'rage': {
      p.brow = -1; p.mouth = 0.6; p.smile = -1;
      const k = S(time * 14);
      p.armL.a = 0.9 + k * 0.5; p.armR.a = 0.9 - k * 0.5; p.armL.ea = 2 + k; p.armR.ea = 2 - k; p.crouch = 0.15;
      break;
    }
    case 'vomit': {
      p.lean = 0.55; p.crouch = 0.3; p.mouth = t > 0.7 && t < 1.4 ? 1 : 0.2; p.armL.f = 0.6; p.armR.f = 0.6; p.headNod = 0.4; p.eyes = 0.3; p.smile = -1;
      break;
    }
    case 'cough': case 'sneeze': case 'hiccup': {
      const k = Math.abs(S(t * (a === 'hiccup' ? 20 : 9)));
      p.lean = 0.2 * k; p.headNod = 0.25 * k; p.armR.a = 0.6; p.armR.f = 1.1; p.armR.ea = 2.4; p.armR.ef = 1.3; p.mouth = 0.5 * k; p.eyes = 0.2;
      break;
    }
    case 'laugh': {
      const k = Math.abs(S(time * 11));
      p.lean = 0.08 + 0.12 * k; p.mouth = 0.4 + 0.5 * k; p.smile = 1; p.eyes = 0.15; p.armL.f = 0.7; p.armR.f = 0.7; p.armL.ea = 1.4; p.armR.ea = 1.4; p.headTilt = -0.2;
      break;
    }
    case 'swat': {
      const k = S(time * 9);
      p.armR.a = 1.5 + k * 1.0; p.armR.ea = 2.2 + k; p.armL.a = 1.0 - k * 0.5; p.armL.ea = 1.8; p.brow = 0.8; p.headTilt = k * 0.3; p.mouth = 0.4;
      break;
    }
    case 'clutchChest': {
      p.armL.a = 0.3; p.armL.f = 1.1; p.armL.ea = -0.3; p.armL.ef = 2.2; p.lean = 0.25; p.brow = 1; p.smile = -1; p.mouth = 0.5; p.crouch = 0.15;
      break;
    }
    case 'holdHead': {
      p.armL.a = 2.4; p.armL.ea = 3.6; p.armR.a = 2.4; p.armR.ea = 3.6; p.headNod = 0.25; p.eyes = 0.1; p.smile = -0.8;
      break;
    }
    case 'scratch': {
      const k = S(time * 20) * 0.2;
      p.armR.a = 0.7; p.armR.f = 0.6; p.armR.ea = -0.2 + k; p.armR.ef = 1.9; p.armL.a = 0.5 + k; p.headTilt = 0.1;
      break;
    }
    case 'howl': { p.headNod = -0.5; p.mouth = 1; p.eyes = 0; p.armL.a = 0.4; p.armR.a = 0.4; p.lean = -0.1; break; }
    case 'breathFire': { p.headNod = -0.1; p.mouth = 1; p.lean = 0.1; p.armL.a = 0.6; p.armR.a = 0.6; p.fire = t > 0.4 && t < 1.4 ? 1 : 0; break; }
    case 'blowKiss': { p.armR.a = 0.8; p.armR.f = 1.2; p.armR.ea = 1.6 + S(t * 3) * 0.4; p.armR.ef = 2.2 - t; p.smile = 1; p.eyes = 0.4; p.mouth = 0.2; break; }
    case 'seizure': {
      const j = (k) => S(time * (31 + k * 7)) * 0.5;
      p.armL.a = 0.6 + j(1); p.armR.a = 0.6 + j(2); p.armL.ea = 1.2 + j(3); p.armR.ea = 1.2 + j(4);
      p.legL.f = 0.3 + j(5); p.legR.f = 0.3 + j(6); p.legL.kf = 0.5 + j(7); p.legR.kf = 0.5 + j(8);
      p.headTilt = j(9); p.eyes = 0.6; p.mouth = 0.4 + j(10) * 0.5; p.jitter = 1;
      break;
    }
    case 'dead': case 'collapsed': case 'sleeping': case 'fall': case 'lying': case 'lieDown': {
      p.armL.a = 0.25; p.armR.a = 0.4; p.legL.a = 0.08; p.legR.a = 0.15; p.legR.kf = 0.2;
      p.eyes = a === 'fall' ? 0.6 : a === 'lying' ? blinkAt(time) : 0;
      p.smile = a === 'sleeping' ? 0.3 : 0; p.mouth = a === 'dead' ? 0.2 : a === 'sleeping' ? 0.05 : 0;
      break;
    }
    case 'getUp': { p.crouch = 0.4 * Math.max(0, 1 - t / 1.2); break; }
    case 'stasis': break;
    default: break;
  }

  // crouching bends hips and knees; ground contact lowers the pelvis automatically
  if (p.crouch > 0) {
    for (const leg of [p.legL, p.legR]) { leg.f += p.crouch * 1.1; leg.kf += p.crouch * 2.1; leg.a += p.crouch * 0.2; }
    p.lean += p.crouch * 0.3;
  }
  // modifiers
  if (actor.posture === 'sit' && a !== 'sit' && ['talk', 'think', 'sing', 'wave', 'laugh', 'cough', 'sneeze'].includes(a)) {
    p.legL.f = 1.5; p.legR.f = 1.5; p.legL.kf = 1.5; p.legR.kf = 1.5;
  }
  if (body.symptoms.tremor || body.symptoms.shiver) {
    const k = (body.symptoms.tremor || 0) * 0.04 + (body.symptoms.shiver || 0) * 0.05;
    p.armL.a += S(time * 47) * k; p.armR.a += S(time * 53) * k; p.headTilt += S(time * 41) * k * 0.5;
  }
  if (body.transform.stone > 0.2 || body.transform.gold > 0.2) p.frozen = Math.max(body.transform.stone, body.transform.gold);
  if (body.vitals.consciousness < 55 && body.alive && !['dead', 'collapsed', 'sleeping'].includes(a)) { p.eyes = Math.min(p.eyes, 0.5); p.headNod += 0.15; }
  if ((E.sleep || 0) > 0.5 && body.alive) p.eyes = Math.min(p.eyes, 0.55);
  if (body.cap.hallucination > 1.5) p.eyes = Math.max(p.eyes, 1.2);
  return p;
}

function blinkAt(time) {
  const ph = (time * 0.31) % 1;
  return ph < 0.025 ? 0.05 : 1;
}

// ---------------------------------------------------------------------------
// Forward kinematics → screen joints
// ---------------------------------------------------------------------------
const dir3 = (sgn, a, f) => [sgn * S(a) * C(f), C(a) * C(f), S(f)];

export function solveRig(pose, actor, body, view) {
  const s = body.size * view.scale;
  const yaw = actor.yaw;
  const cy = C(yaw), sy = S(yaw);
  const mass = body.muscles;
  const bulkArm = (id) => 0.75 + 0.25 * mass[id].mass;
  // pelvis origin in body frame; everything relative to it
  const project = (x, y, z) => [x * cy + z * sy, y, -x * sy + z * cy];
  const J = {};
  const add = (name, v) => { J[name] = v; };
  const lean = pose.lean + (pose.headNod || 0) * 0;
  // torso: lean forward rotates about pelvis in sagittal plane (y,z); sway rotates in frontal plane (x,y)
  const torsoPt = (x, y, z = 0) => {
    // apply lean (forward) then sway (sideways)
    const y1 = y * C(lean) - z * S(lean) * -1;
    const z1 = z * C(lean) - y * S(lean);
    const x2 = x * C(pose.sway) - y1 * S(pose.sway);
    const y2 = x * S(pose.sway) + y1 * C(pose.sway);
    return [x2, y2, z1];
  };
  add('pelvis', [0, 0, 0]);
  add('neck', torsoPt(0, DIM.torsoTop));
  add('chest', torsoPt(0, -80));
  add('waist', torsoPt(0, -40));
  add('head', torsoPt(0, DIM.torsoTop - DIM.neck - DIM.headR + 4, 0));
  const limb = (side, root, L1, L2, L3, lp, isLeg) => {
    const sgn = side === 'L' ? 1 : -1;
    const a1 = lp.a, f1 = lp.f;
    const d1 = dir3(sgn, a1, f1);
    let d2;
    if (isLeg) {
      const kf = lp.kf || 0;
      d2 = dir3(sgn, a1 * 0.6, f1 - kf);
    } else d2 = dir3(sgn, lp.ea, lp.ef);
    const r = root;
    const j1 = [r[0] + d1[0] * L1, r[1] + d1[1] * L1, r[2] + d1[2] * L1];
    const j2 = [j1[0] + d2[0] * L2, j1[1] + d2[1] * L2, j1[2] + d2[2] * L2];
    const j3 = isLeg ? [j2[0] + sgn * 2, j2[1] + DIM.footH, j2[2] + DIM.footL * 0.6] : [j2[0] + d2[0] * L3, j2[1] + d2[1] * L3, j2[2] + d2[2] * L3];
    return [j1, j2, j3];
  };
  const shL = torsoPt(DIM.shoulderX, DIM.shoulderY), shR = torsoPt(-DIM.shoulderX, DIM.shoulderY);
  // arms: lean affects arm roots only (arm angles are absolute)
  const [elL, wrL, haL] = limb('L', shL, DIM.upperArm, DIM.foreArm, DIM.hand, pose.armL, false);
  const [elR, wrR, haR] = limb('R', shR, DIM.upperArm, DIM.foreArm, DIM.hand, pose.armR, false);
  const hpL = [DIM.hipX, 0, 0], hpR = [-DIM.hipX, 0, 0];
  const [knL, anL, toL] = limb('L', hpL, DIM.thigh, DIM.shin, 0, pose.legL, true);
  const [knR, anR, toR] = limb('R', hpR, DIM.thigh, DIM.shin, 0, pose.legR, true);
  Object.assign(J, { shL, shR, elL, elR, wrL, wrR, haL, haR, hpL, hpR, knL, knR, anL, anR, toL, toR });
  // extra arms (mutation) hang from the lower ribcage
  if (body.mutations.includes('extraArms')) {
    const rootL = torsoPt(DIM.shoulderX - 6, -64), rootR = torsoPt(-DIM.shoulderX + 6, -64);
    const pl = { a: pose.armL.a * 0.7 + 0.3, f: pose.armL.f + 0.2, ea: pose.armL.ea * 0.7 + 0.2, ef: pose.armL.ef };
    const pr = { a: pose.armR.a * 0.7 + 0.3, f: pose.armR.f + 0.2, ea: pose.armR.ea * 0.7 + 0.2, ef: pose.armR.ef };
    const [e2L, w2L, h2L] = limb('L', rootL, DIM.upperArm * 0.85, DIM.foreArm * 0.85, DIM.hand * 0.9, pl, false);
    const [e2R, w2R, h2R] = limb('R', rootR, DIM.upperArm * 0.85, DIM.foreArm * 0.85, DIM.hand * 0.9, pr, false);
    Object.assign(J, { sh2L: rootL, sh2R: rootR, el2L: e2L, el2R: e2R, wr2L: w2L, wr2R: w2R, ha2L: h2L, ha2R: h2R });
  }

  // Place the pelvis so the lowest point touches the floor (standing, sitting or lying).
  const lieAngle = actor.lie * (Math.PI / 2) * (actor.lieDir || 1);
  const shakeX = (pose.jitter ? Math.sin(view.time * 70) * 2 : 0) + (actor.shake ? Math.sin(view.time * 60) * 4 * actor.shake : 0);
  const rel = (v, r) => {
    const [x, y, z] = project(v[0], v[1], v[2]);
    const sx = x * s, sy2 = y * s;
    return [sx * C(r) - sy2 * S(r), sx * S(r) + sy2 * C(r), z];
  };
  let maxY = -Infinity;
  for (const v of Object.values(J)) { const r = rel(v, lieAngle); if (r[1] > maxY) maxY = r[1]; }
  const margin = actor.lie * 10 * s;
  const pelvisY = view.floorY - maxY - margin - actor.y * view.pxPerM;
  const baseX = view.cx + actor.x * view.pxPerM + shakeX;
  const flip = actor.action === 'backflip' && actor.data.phase === 'air' ? -clamp(actor.data.airT / 0.75, 0, 1) * Math.PI * 2 * (actor.data.success ? 1 : 0.75) : 0;
  const rot = lieAngle + flip;
  const pivot = flip ? -60 * s : 0;
  const toScreen = (v) => {
    const [x, y, z] = project(v[0], v[1], v[2]);
    const sx = x * s, sy2 = y * s - pivot;
    return { x: baseX + sx * C(rot) - sy2 * S(rot), y: pelvisY + pivot + sx * S(rot) + sy2 * C(rot), z };
  };
  const P = {};
  for (const [k, v] of Object.entries(J)) P[k] = toScreen(v);
  const floorY = view.floorY;
  return {
    P, s, yaw, cy, sy, rot, lean, pose, bulkArm,
    toScreen,
    torsoPt,
    widthScale: Math.abs(cy) * 0.75 + 0.25,
    floorY,
    baseX,
    pelvisY,
  };
}
