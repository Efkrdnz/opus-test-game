// Physiology: one fixed step of the homunculus' body.
import { MUTATIONS, TRANSFORMS } from '../data/vocab.js';
import { clamp, approach, smoothstep, chance, pick, rand } from '../util.js';
import { organFn, regionFn, pushEvent, pushFlash, damageTissue, killBody, avgFatigue, HISTORY_KEYS } from './body.js';
import { processDoses, grantMutation, detonate } from './pharmacology.js';
import { applyDiseases, progressDiseases, checkTriggers, infectionLoad } from './diseases.js';

export const DEFAULT_ENV = { temp: 22, gravity: 1, oxygen: 21, radiation: 0, light: 1 };
export const SIM_STEP = 0.1;

const ANTIDOTE_TARGETS = ['poison', 'neurotoxin', 'cardiotoxin', 'hepatotoxin', 'nephrotoxin', 'sedative', 'analgesic',
  'intoxication', 'hallucinogen', 'paralysis', 'asphyxiant', 'hemorrhage', 'nausea', 'corrosive', 'necrotic', 'blindness'];

const TRANSFORM_TEXT = {
  stone:    ['Grey patches spread across the skin. Petrification has begun.', 'FULLY PETRIFIED. The subject is now a statue.'],
  zombie:   ['The flesh greys and cools. Something undead is taking hold.', 'The subject has turned.'],
  werewolf: ['Coarse fur sprouts along the arms. The jaw aches.', 'TRANSFORMATION COMPLETE. A werewolf stands in the chamber.'],
  vampire:  ['The skin pales, the canines lengthen.', 'TRANSFORMATION COMPLETE. The subject is a vampire.'],
  ghost:    ['The subject flickers, briefly translucent.', 'The subject is fully spectral.'],
  crystal:  ['Crystal facets bloom across the skin.', 'The subject is now living crystal.'],
  metal:    ['The skin takes on a metallic sheen.', 'The skin has become solid metal.'],
  gold:     ['Gold leaf creeps outward from the fingertips.', 'The subject is solid gold.'],
  elastic:  ['The limbs feel rubbery.', 'The subject is fully elastic.'],
  divine:   ['A soft halo flickers into being.', 'The subject radiates divinity.'],
};

const effectSeed = (k) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 997; return h; };

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------
export function stepBody(body, env, dt) {
  if (body.gone) { body.effects = {}; return; }
  body.time += dt;
  const T = body.transform;

  const E = {};
  processDoses(body, E, dt);

  let dtB = dt;
  if (body.stasis === 'stone' || body.stasis === 'gold') dtB = 0;
  else if (body.stasis === 'cryo') dtB = dt * 0.03;
  dtB *= 1 + clamp((E.timeDilation || 0) * 0.5, 0, 3);

  const symptoms = {};
  if ((body.alive || body.undead) && dtB > 0) applyDiseases(body, E, symptoms, dtB);
  if (env.radiation > 0) E.radiation = (E.radiation || 0) + env.radiation;

  // inherent effects of transformations & mutations
  const add = (k, v) => { if (v > 0) E[k] = (E[k] || 0) + v; };
  if (T.werewolf >= 1) { add('strength', 1.2); add('haste', 0.5); add('rage', 0.4); } else add('strength', T.werewolf * 0.4);
  if (T.vampire >= 1) { add('strength', 0.8); add('haste', 0.5); }
  add('levitation', T.ghost > 0.3 ? T.ghost * 0.9 : 0);
  if (T.divine > 0.15) { add('glow', T.divine * 1.5); add('levitation', T.divine * 0.8); add('calm', T.divine * 0.6); }
  add('heavy', T.metal > 0.3 ? T.metal * 0.8 : 0);
  if (T.gold > 0.3) { add('heavy', T.gold); add('slow', T.gold); }
  add('slow', T.stone > 0.15 ? T.stone * 2.2 : 0);
  add('glow', T.crystal > 0.3 ? T.crystal * 0.5 : 0);
  if (body.mutations.includes('glowingVeins')) add('glow', 0.35);
  if (body.blood.mana > 25) add('glow', body.blood.mana / 160);

  // antagonisms
  const ant = E.antidote || 0;
  if (ant > 0) for (const k of ANTIDOTE_TARGETS) if (E[k]) E[k] /= 1 + ant * 0.8;
  if (E.calm) { if (E.fear) E.fear /= 1 + E.calm; if (E.rage) E.rage /= 1 + E.calm * 0.7; }
  if (E.purify) {
    if (E.necrotic) E.necrotic = Math.max(0, E.necrotic - E.purify);
    if (E.undeath) E.undeath = Math.max(0, E.undeath - E.purify);
  }
  if (E.chaos > 0.05) {
    body.chaosPhase = (body.chaosPhase || 0) + dt;
    const amp = Math.min(1, E.chaos * 0.6);
    for (const k of Object.keys(E)) {
      if (k === 'chaos') continue;
      const s = effectSeed(k);
      E[k] *= Math.max(0, 1 + Math.sin(body.chaosPhase * (0.3 + (s % 7) * 0.13) + s) * amp * 1.4);
    }
  }
  body.effects = E;
  body.symptoms = symptoms;
  body.hurt = Math.max(0, (body.hurt || 0) - 3 * dt);

  if (!body.alive && !body.undead) {
    stepDead(body, E, env, dt);
  } else if (body.undead) {
    stepUndead(body, E, env, dt);
  } else if (body.stasis) {
    stepStasis(body, E, env, dt);
  } else {
    stepTransforms(body, E, dtB);
    stepNeuro(body, E, dtB);
    stepCardio(body, E, env, dtB);
    stepResp(body, E, env, dtB);
    stepBrain(body, E, dtB);
    stepThermo(body, E, env, dtB);
    stepMetabolic(body, E, env, dtB);
    stepBlood(body, E, dtB);
    stepToxic(body, E, dtB);
    stepRestore(body, E, dtB);
    stepMuscles(body, E, dtB);
    stepBones(body, E, env, dtB);
    stepMorph(body, E, dtB);
    stepImmune(body, E, dtB);
    deriveSymptoms(body, E, symptoms);
    stepSymptoms(body, symptoms, dtB);
    stepPain(body, E, symptoms, dtB);
    progressDiseases(body, E, dtB);
    body.triggerClock = (body.triggerClock || 0) + dtB;
    if (body.triggerClock >= 1) { body.triggerClock -= 1; checkTriggers(body, E); }
    stepDeathCheck(body, E);
  }
  deriveCapabilities(body, E, env);
  body.histClock = (body.histClock || 0) + dt;
  if (body.histClock >= 0.5) {
    body.histClock -= 0.5;
    const v = body.vitals;
    const rec = { hr: v.hr, sys: v.sys, dia: v.dia, spo2: v.spo2, rr: v.rr, temp: v.temp, glucose: v.glucose, consciousness: v.consciousness };
    for (const k of HISTORY_KEYS) body.history[k].push(rec[k]);
  }
}

// ---------------------------------------------------------------------------
function stepTransforms(body, E, dt) {
  const T = body.transform;
  const pur = E.purify || 0, reg = E.regeneration || 0;
  const rates = {
    stone:    [(E.petrify || 0) * 0.05, pur * 0.12 + reg * 0.04, 0.004],
    zombie:   [(E.undeath || 0) * 0.02 + (E.necrotic || 0) * 0.004, pur * 0.12 + (E.healing || 0) * 0.01, 0.01],
    werewolf: [(E.lycanthropy || 0) * 0.05, pur * 0.1, 0.008],
    vampire:  [(E.vampirism || 0) * 0.05, pur * 0.1, 0.008],
    ghost:    [(E.ethereal || 0) * 0.06, (E.resurrection || 0) * 0.05, 0.03],
    crystal:  [(E.crystallize || 0) * 0.04, reg * 0.05 + pur * 0.05, 0.005],
    metal:    [(E.metallize || 0) * 0.05, 0, 0.01],
    gold:     [(E.gilding || 0) * 0.04, pur * 0.1, 0.004],
    elastic:  [(E.elastic || 0) * 0.08, 0, 0.02],
    divine:   [(E.divinity || 0) * 0.05, (E.necrotic || 0) * 0.05, 0.02],
  };
  body.tfFlags = body.tfFlags || {};
  for (const [k, [up, cure, idle]] of Object.entries(rates)) {
    const before = T[k];
    const decay = cure + (up <= 0 && before < 1 ? idle : 0) + (up <= 0 && before >= 1 && (k === 'metal' || k === 'elastic' || k === 'divine' || k === 'ghost') ? idle * 0.5 : 0);
    T[k] = clamp(before + (up - decay) * dt, 0, 1.2);
    if (before < 0.25 && T[k] >= 0.25 && !body.tfFlags[k + 'a']) { body.tfFlags[k + 'a'] = true; pushEvent(body, TRANSFORM_TEXT[k][0], 'mutation'); }
    if (before < 1 && T[k] >= 1) { pushEvent(body, TRANSFORM_TEXT[k][1], 'mutation'); pushFlash(body, 'transform', { id: k }); }
    if (before >= 1 && T[k] < 1) pushEvent(body, `The ${TRANSFORMS[k].name.toLowerCase()} transformation recedes.`, 'good');
    if (T[k] < 0.05) body.tfFlags[k + 'a'] = false;
  }
  if (T.stone >= 1) { body.stasis = 'stone'; body.sleeping = false; }
  if (T.gold >= 1) { body.stasis = 'gold'; body.sleeping = false; }
  if (T.zombie >= 1) {
    killBody(body, 'Consumed by undeath');
    body.reanimate = 3;
  }
  if (T.divine >= 1 && (E.divinity || 0) > 3.5) {
    pushFlash(body, 'ascend', {});
    killBody(body, 'Ascended to a higher plane', { gone: true, kind: 'ascended' });
  }
}

function stepNeuro(body, E, dt) {
  const n = body.neuro, v = body.vitals;
  const e = (k) => E[k] || 0;
  const target = {
    dopamine: 50 + e('stimulant') * 10 + e('euphoria') * 16 + e('love') * 15 + e('intoxication') * 6 + e('rage') * 6 + e('intellect') * 5 - e('sedative') * 4,
    serotonin: 50 + e('euphoria') * 9 + e('hallucinogen') * 14 + e('calm') * 8 - e('rage') * 12 + e('laughter') * 6,
    norepinephrine: 50 + e('stimulant') * 18 + e('fear') * 25 + e('rage') * 20 + v.pain * 0.15 - e('sedative') * 10 - e('calm') * 12 - e('sleep') * 8,
    gaba: 50 + e('sedative') * 18 + e('intoxication') * 12 + e('calm') * 10 + e('sleep') * 8 - e('stimulant') * 6 - e('neurotoxin') * 6,
    glutamate: 50 + e('stimulant') * 6 + e('hallucinogen') * 8 + e('intellect') * 8 + e('neurotoxin') * 10 + e('electric') * 8 - e('intoxication') * 10 - e('sedative') * 6,
    acetylcholine: 50 + e('intellect') * 12 + e('spasm') * 20 - e('paralysis') * 25 - e('amnesia') * 15 - e('neurotoxin') * 8,
    endorphin: 50 + e('analgesic') * 25 + e('laughter') * 15 + e('euphoria') * 8 + body.exertion * 15 + v.pain * 0.1,
    melatonin: 50 + e('sleep') * 25 + e('sedative') * 6 - e('stimulant') * 12 - e('fear') * 6 + (body.sleeping ? 8 : 0) + (body.symptoms.drowsy ? 12 : 0) - (body.symptoms.insomnia ? 15 : 0),
  };
  for (const k of Object.keys(target)) n[k] = approach(n[k], clamp(target[k], 0, 100), 0.35, dt);
  let nerve = 0;
  for (const x of Object.values(body.nerves)) nerve += x.health;
  nerve /= 600;
  body.conductivity = clamp(nerve * (1 + e('electric') * 0.2 + e('haste') * 0.3 + e('stimulant') * 0.05 - e('cold') * 0.15 - e('neurotoxin') * 0.2 - e('sedative') * 0.08 - e('slow') * 0.2), 0.02, 3);
}

function stepCardio(body, E, env, dt) {
  const v = body.vitals, b = body.blood, T = body.transform;
  const e = (k) => E[k] || 0;
  const heartFn = organFn(body, 'heart');
  const stem = regionFn(body, 'brainstem');

  let hr = 72 * (body.age < 12 ? 1.25 : 1);
  const sat = (x, max, k) => max * (1 - Math.exp(-x / k));
  hr += sat(e('stimulant'), 130, 3.5) + sat(e('fear'), 45, 1.5) + sat(e('rage'), 40, 1.5) + v.pain * 0.25 + (v.stress - 20) * 0.25 + body.exertion * 70;
  hr -= sat(e('sedative'), 24, 2) + sat(e('calm'), 10, 1.5) + sat(e('sleep'), 8, 1.5) + sat(e('analgesic'), 8, 3);
  hr += Math.max(0, v.temp - 37) * 9;
  if (v.temp < 35) hr -= (35 - v.temp) * 9;
  hr += Math.max(0, 85 - v.bloodVolume) * 1.6 + Math.max(0, 70 - v.map) * 0.8 + Math.max(0, 94 - v.spo2) * 0.9;
  hr += e('timeDilation') * 20 + e('haste') * 8 + e('love') * 10 + e('electric') * 5;
  if (T.vampire >= 1) hr -= 40;
  if (heartFn < 0.5) hr += (0.5 - heartFn) * 40;
  if (body.sleeping) hr -= 10;
  hr *= 0.35 + 0.65 * stem;
  hr = clamp(hr, 18, 260);

  // rhythm
  body.rhythmClock = (body.rhythmClock || 0) + dt;
  body.shock = Math.max(0, (body.shock || 0) - dt * 0.5);
  if (body.rhythmClock >= 1) {
    body.rhythmClock -= 1;
    let risk = 0.06 * Math.max(0, e('cardiotoxin') - 0.3) + 0.04 * Math.max(0, e('stimulant') - 2.5)
      + 0.05 * Math.max(0, e('electric') - 1.2) + (v.temp < 28 ? 0.08 : 0) + (v.temp > 42 ? 0.05 : 0)
      + (heartFn < 0.3 ? 0.02 : 0) + (b.ph < 7.05 || b.ph > 7.7 ? 0.03 : 0) + (v.hr > 210 ? 0.05 : 0)
      + (body.shock > 0.5 ? body.shock * 0.12 : 0) + (v.glucose < 25 ? 0.02 : 0);
    if (body.forceArrhythmia) { risk = 1; body.forceArrhythmia = false; }
    if (body.rhythm === 'vfib') {
      body.vfibTime = (body.vfibTime || 0) + 1;
      if (e('electric') > 2 && chance(0.3)) setRhythm(body, 'sinus', 'The electric surge shocks the heart back into rhythm.');
      else if (e('resurrection') > 0.3) setRhythm(body, 'sinus', 'The heart restarts on its own.');
      else if (body.vfibTime > 35) setRhythm(body, 'asystole', 'The fibrillation fades to a flat line. ASYSTOLE.');
    } else if (body.rhythm === 'asystole') {
      if (e('resurrection') > 0.3 || (e('electric') > 3 && chance(0.1))) setRhythm(body, 'sinus', 'The heart jolts back to life.');
    } else {
      if (heartFn <= 0.02) setRhythm(body, 'asystole', 'The heart has stopped.');
      else if (chance(risk)) setRhythm(body, 'vfib', 'VENTRICULAR FIBRILLATION! The heart is quivering, not pumping.');
      else if (body.rhythm === 'afib') { if (risk < 0.01 && chance(0.08)) body.rhythm = 'sinus'; }
      else if (risk > 0 && chance(risk * 2.5)) { body.rhythm = 'afib'; pushEvent(body, 'Atrial fibrillation: the heartbeat turns irregular.', 'warn'); }
    }
  }
  const pumping = body.rhythm !== 'vfib' && body.rhythm !== 'asystole';
  if (pumping) {
    v.hr = approach(v.hr, hr, 0.6, dt);
    if (body.rhythm !== 'afib') body.rhythm = v.hr > 100 ? 'tachy' : v.hr < 55 ? 'brady' : 'sinus';
  } else v.hr = 0;

  const rhythmF = body.rhythm === 'afib' ? 0.8 : pumping ? 1 : 0;
  const h = v.hr;
  const rateF = h < 30 ? (h / 30) * 0.45 : h < 60 ? 0.45 + (h - 30) / 30 * 0.45 : h <= 150 ? (h / 72) ** 0.45 : (150 / 72) ** 0.45 * clamp(1 - (h - 150) / 200, 0.2, 1);
  const bvF = clamp(v.bloodVolume / 100, 0, 1.1);
  const tone = clamp(1 + sat(e('stimulant'), 0.6, 3) + sat(e('fear'), 0.15, 1.5) + sat(e('rage'), 0.15, 1.5) + e('cold') * 0.05 - sat(e('sedative'), 0.3, 2)
    - sat(e('analgesic'), 0.1, 3) - e('heat') * 0.04 - e('intoxication') * 0.04 + (v.stress - 20) * 0.002 + e('coagulant') * 0.03 + e('heavy') * 0.02
    - (v.hydration < 40 ? (40 - v.hydration) * 0.004 : 0), 0.3, 2.2);
  const mapT = 92 * heartFn ** 0.6 * rhythmF * rateF * bvF ** 1.3 * tone;
  v.map = approach(v.map, mapT, 0.9, dt);
  const pp = 40 * heartFn ** 0.5 * rhythmF * Math.min(1, bvF) * (1 + e('stimulant') * 0.1);
  v.sys = v.map + pp * 2 / 3;
  v.dia = Math.max(0, v.map - pp / 3);
  body.perfusion = smoothstep(18, 62, v.map);
  body.arrestTime = rhythmF === 0 ? body.arrestTime + dt : 0;
  if (h > 190) damageTissue(body.organs.heart, 0.004 * (h - 190) * dt);
  if (body.size > 2) damageTissue(body.organs.heart, (body.size - 2) * 0.05 * dt);
}

function setRhythm(body, r, text) {
  const prev = body.rhythm;
  body.rhythm = r;
  if (r !== 'vfib') body.vfibTime = 0;
  if (text) pushEvent(body, text, r === 'sinus' ? 'good' : 'critical');
  if ((prev === 'vfib' || prev === 'asystole') && r === 'sinus') body.vitals.hr = 60;
}

function stepResp(body, E, env, dt) {
  const v = body.vitals, b = body.blood;
  const e = (k) => E[k] || 0;
  const stem = regionFn(body, 'brainstem');
  const depress = 1 - Math.exp(-(e('sedative') * 0.14 + e('analgesic') * 0.08 + e('intoxication') * 0.05 + (v.consciousness < 15 ? 0.15 : 0)));
  let drive = stem * (1 - depress) + e('stimulant') * 0.05 + body.exertion * 0.9 + e('fear') * 0.25
    + Math.max(0, 93 - v.spo2) * 0.015 + Math.max(0, 7.35 - b.ph) * 2;
  drive *= 1 - clamp(e('paralysis') * 0.3, 0, 1);
  if (body.seizure > 0) drive *= 0.4;
  if (stem < 0.05) drive = 0;
  const rrT = clamp(14 * drive + e('timeDilation') * 4, 0, 60);
  v.rr = approach(v.rr, rrT, 0.6, dt);
  const lungFn = (organFn(body, 'lungL') + organFn(body, 'lungR')) / 2;
  let envO2 = clamp(env.oxygen / 21, 0, 3);
  if (body.mutations.includes('gills')) envO2 = Math.max(envO2, 0.8);
  const vent = clamp(v.rr / 14, 0, 2.2);
  const o2 = vent * lungFn * envO2 * (1 + e('oxygenation') * 0.6);
  const spo2T = clamp(100 * (1 - Math.exp(-4.1 * o2)) + e('oxygenation'), 0, 100);
  v.spo2 = approach(v.spo2, spo2T, 0.35, dt);
  const anemia = clamp(b.rbc / 4.5, 0, 1);
  body.tissueO2 = clamp((v.spo2 / 100) * anemia * body.perfusion * (1 - clamp(e('asphyxiant') * 0.3, 0, 0.98)), 0, 1.2);
}

function stepBrain(body, E, dt) {
  const v = body.vitals, n = body.neuro;
  const e = (k) => E[k] || 0;
  const o = body.tissueO2;
  if (o < 0.55) {
    const protect = v.temp < 32 ? 0.35 : 1;
    const rate = ((0.55 - o) / 0.55) * 1.4 * protect * dt;
    damageTissue(body.organs.brain, rate);
    for (const [k, r] of Object.entries(body.brain)) damageTissue(r, rate * (k === 'hippocampus' ? 1.3 : k === 'brainstem' ? 0.6 : 1));
  }
  // seizures
  let p = Math.max(0, (n.glutamate - n.gaba - 40) / 60) * 0.3 + Math.max(0, e('neurotoxin') - 1.2) * 0.08
    + (v.glucose < 35 ? 0.1 : 0) + (v.temp > 41.5 ? 0.1 : 0) + Math.max(0, e('stimulant') - 3.2) * 0.1
    + Math.max(0, e('electric') - 1.8) * 0.1 + (body.organs.brain.health < 30 ? 0.01 : 0)
    + (body.symptoms.seizure ? 0.06 : 0) + (body.blood.mana > 130 ? 0.05 : 0);
  if (body.seizure <= 0 && chance(p * dt)) {
    body.seizure = rand(6, 14);
    pushEvent(body, `SEIZURE. ${body.name} is convulsing.`, 'critical');
    pushFlash(body, 'seizure', {});
  }
  if (body.seizure > 0) {
    body.seizure -= dt;
    for (const m of Object.values(body.muscles)) m.fatigue = clamp(m.fatigue + 3 * dt, 0, 100);
    if (body.seizure > 0 && body.seizureLong) damageTissue(body.organs.brain, 0.05 * dt);
    if (body.seizure <= 0) pushEvent(body, 'The seizure subsides.', 'info');
  }
  // sleep
  const wantSleep = n.melatonin > 78 || e('sleep') > 1.2 || (body.wantSleep && n.melatonin > 52);
  if (!body.sleeping && wantSleep && e('fear') < 1 && v.pain < 50) {
    body.sleeping = true; body.wantSleep = false;
    pushEvent(body, `${body.name} falls asleep.`, 'info');
  } else if (body.sleeping) {
    const stay = n.melatonin > 60 || e('sleep') > 0.8;
    const forced = body.wakeRequest && e('sleep') < 1.5 && n.melatonin < 85;
    if (!stay || forced || v.pain > 60 || e('fear') > 1.5) {
      body.sleeping = false;
      pushEvent(body, `${body.name} wakes up.`, 'info');
    }
  }
  body.wakeRequest = false;
  // consciousness
  const brainF = clamp(organFn(body, 'brain') * 1.1, 0, 1) * (0.5 + 0.5 * regionFn(body, 'brainstem'));
  let c = 100 * brainF;
  c *= smoothstep(0.3, 0.72, o);
  c *= smoothstep(22, 55, v.glucose) * (v.glucose > 450 ? clamp(1 - (v.glucose - 450) / 350, 0, 1) : 1);
  c -= e('sedative') * 20 + e('intoxication') * 7 + e('analgesic') * 3 + e('sleep') * 10;
  c += e('stimulant') * 5;
  if (v.temp < 33) c -= (33 - v.temp) * 9;
  if (v.temp > 41) c -= (v.temp - 41) * 18;
  if (v.pain > 85) c -= (v.pain - 85) * 1.5;
  const phDev = Math.abs(body.blood.ph - 7.4);
  if (phDev > 0.15) c -= (phDev - 0.15) * 150;
  if (body.blood.toxins > 50) c -= (body.blood.toxins - 50) * 0.8;
  if (body.blood.mana > 120) c -= body.blood.mana - 120;
  if (body.seizure > 0) c = Math.min(c, 15);
  if (body.sleeping) c = Math.min(c, 18);
  v.consciousness = approach(v.consciousness, clamp(c, 0, 100), 0.7, dt);
  for (const [k, r] of Object.entries(body.brain)) r.activity = clamp(regionActivity(body, E, k), 0, 100);
}

function regionActivity(body, E, k) {
  const e = (x) => E[x] || 0;
  const c = body.vitals.consciousness / 100;
  const h = body.brain[k].health / 100;
  const base = 50 * h * (0.3 + 0.7 * c);
  switch (k) {
    case 'frontal': return base * (1 + e('intellect') * 0.3 - e('intoxication') * 0.3 + e('stimulant') * 0.1);
    case 'motor': return base * (1 + body.exertion * 0.8 + (body.seizure > 0 ? 1 : 0));
    case 'sensory': return base + body.vitals.pain * 0.4;
    case 'temporal': return base * (1 + e('hallucinogen') * 0.2 + e('telepathy') * 0.3);
    case 'occipital': return base * (1 + e('hallucinogen') * 0.6) * (1 - e('blindness') * 0.4);
    case 'broca': return base * (1 + (body.speaking ? 0.6 : 0) + e('truth') * 0.2);
    case 'hippocampus': return base * (1 + e('intellect') * 0.3 - e('amnesia') * 0.4);
    case 'amygdala': return 30 * h + e('fear') * 30 + e('rage') * 30 + body.vitals.stress * 0.3;
    case 'cerebellum': return base * (1 + body.exertion * 0.5 - e('intoxication') * 0.3);
    case 'brainstem': return 60 * h;
    default: return base;
  }
}

function stepThermo(body, E, env, dt) {
  const v = body.vitals, T = body.transform;
  const e = (k) => E[k] || 0;
  let target = 37 + e('heat') * 2.5 - e('cold') * 3 + (env.temp - 22) * 0.055 + body.burning * 4 + body.exertion * 0.8 + e('stimulant') * 0.3;
  if (T.vampire >= 1) target -= 3;
  target -= T.ghost * 6;
  const reg = organFn(body, 'brain') * clamp(v.hydration / 60, 0, 1);
  if (target > 35 && target < 39.5) target = 37 + (target - 37) * (1 - 0.45 * reg);
  if (v.temp < 36 && v.consciousness > 30 && e('paralysis') < 1) target += 0.8;
  const rate = 0.08 + (e('heat') + e('cold')) * 0.05 + body.burning * 0.1;
  v.temp = approach(v.temp, target, rate, dt);
  // burning
  if (body.burning > 0) {
    const resist = (body.mutations.includes('scales') ? 0.4 : 1) * (1 - clamp(T.metal + T.stone + T.crystal, 0, 1));
    damageTissue(body.organs.skin, 2.5 * body.burning * resist * dt);
    for (const m of Object.values(body.muscles)) damageTissue(m, 0.3 * body.burning * resist * dt);
    body.burns = clamp(body.burns + 0.02 * body.burning * resist * dt, 0, 1);
    body.hurt += 6 * body.burning * resist * dt;
    body.burning = Math.max(0, body.burning - (0.035 + (body.wet > 0.3 ? 0.5 : 0) + (env.oxygen < 10 ? 0.5 : 0) + e('cold') * 0.1) * dt);
    if (body.burning === 0) pushEvent(body, 'The flames die out.', 'info');
  }
  if (body.wet > 0) body.wet = Math.max(0, body.wet - 0.03 * dt);
  // heat and cold injury
  if (v.temp > 40) {
    const d = (v.temp - 40) ** 1.5 * 0.12 * dt;
    damageTissue(body.organs.brain, d);
    for (const r of Object.values(body.brain)) damageTissue(r, d * 0.8);
    for (const o of Object.values(body.organs)) damageTissue(o, d * 0.4);
  }
  if (v.temp < 30) for (const o of Object.values(body.organs)) damageTissue(o, (30 - v.temp) * 0.02 * dt);
  if (e('heat') > 2.5) for (const o of Object.values(body.organs)) damageTissue(o, (e('heat') - 2.5) * 0.15 * dt);
  if (e('cold') > 1.5) body.frost = clamp(body.frost + 0.01 * (e('cold') - 1.5) * dt, 0, 1);
  if (v.temp < 12 && e('cold') > 3) {
    body.stasis = 'cryo';
    body.sleeping = false;
    pushEvent(body, 'CRYOSTASIS. The subject has frozen solid, every process suspended.', 'mutation');
    pushFlash(body, 'freeze', {});
  }
}

function stepMetabolic(body, E, env, dt) {
  const v = body.vitals, b = body.blood;
  const e = (k) => E[k] || 0;
  const pancreas = organFn(body, 'pancreas'), liver = organFn(body, 'liver');
  const kidney = (organFn(body, 'kidneyL') + organFn(body, 'kidneyR')) / 2;
  const consume = 0.04 + body.exertion * 0.3 + e('regeneration') * 0.35 + e('timeDilation') * 0.1 + (body.seizure > 0 ? 0.6 : 0) + Math.max(0, v.temp - 38) * 0.05;
  const produce = e('nutrition') * 5 + e('stimulant') * 0.4 + e('photosynthesis') * 0.6 * (env.light ?? 1);
  const insulin = e('hypoglycemic') * 4.5;
  let regulate = (90 - v.glucose) * 0.04 * pancreas;
  if (v.glucose < 90) regulate *= liver;
  v.glucose = clamp(v.glucose + (produce - consume - insulin + regulate) * dt, 5, 900);
  if (v.glucose < 20) damageTissue(body.organs.brain, 0.3 * dt);
  body.hunger = clamp((body.hunger || 0) + (consume - 0.04) * 0.2 * dt - e('nutrition') * dt, 0, 100);

  const loss = 0.002 + body.exertion * 0.03 + Math.max(0, v.temp - 37.6) * 0.05 + e('dehydration') * 0.7 + e('intoxication') * 0.02 + (v.glucose > 250 ? 0.03 : 0);
  v.hydration = clamp(v.hydration + (e('hydration') * 0.9 - loss) * dt, 0, 100);
  if (v.hydration < 15) { damageTissue(body.organs.kidneyL, 0.05 * dt); damageTissue(body.organs.kidneyR, 0.05 * dt); damageTissue(body.organs.brain, 0.02 * dt); }

  const addT = e('poison') * 1.4 + (e('hepatotoxin') + e('nephrotoxin')) * 0.25 + e('necrotic') * 0.3 + Math.max(0, 0.4 - kidney) * 0.15 + Math.max(0, 0.3 - liver) * 0.1 + e('radiation') * 0.05;
  const clear = b.toxins * (0.012 * liver + 0.01 * kidney) + e('antidote') * 2.5 + (body.transform.crystal >= 1 ? b.toxins * 0.05 : 0);
  b.toxins = clamp(b.toxins + (addT - clear) * dt, 0, 100);
  if (b.toxins > 25) {
    const d = (b.toxins - 25) * 0.004 * dt;
    for (const o of Object.values(body.organs)) damageTissue(o, d);
    damageTissue(body.organs.liver, d * 1.5);
    damageTissue(body.organs.kidneyL, d); damageTissue(body.organs.kidneyR, d);
  }
  const phT = 7.4 - Math.max(0, 0.9 - body.tissueO2) * 0.5 - Math.max(0, 0.5 - kidney) * 0.25 - b.toxins * 0.0012
    - (v.glucose > 350 ? (v.glucose - 350) * 0.0006 : 0) + Math.max(0, v.rr - 22) * 0.004 - Math.max(0, 8 - v.rr) * 0.01;
  b.ph = approach(b.ph, clamp(phT, 6.6, 7.9), 0.08, dt);
  b.bac = approach(b.bac, e('intoxication') * 0.075, 0.5, dt);
}

function stepBlood(body, E, dt) {
  const v = body.vitals, b = body.blood;
  const e = (k) => E[k] || 0;
  const marrow = clamp(1 - b.radiation / 6, 0.05, 1);
  b.rbc = approach(b.rbc, 4.8 * marrow, 0.004 + e('healing') * 0.01 + e('regeneration') * 0.02, dt);
  const wbcT = 7 * (1 + infectionLoad(body) * 0.6 + e('immuneBoost') * 0.5 - e('immuneSuppress') * 0.35) * marrow;
  b.wbc = approach(b.wbc, clamp(wbcT, 0.2, 40), 0.03, dt);
  b.platelets = approach(b.platelets, 250 * marrow * (0.7 + 0.3 * organFn(body, 'liver')), 0.02, dt);
  b.clotRisk = clamp(0.1 + e('coagulant') * 0.25 - e('anticoagulant') * 0.2 + (v.hydration < 50 ? (50 - v.hydration) * 0.004 : 0)
    + e('stimulant') * 0.03 + (b.platelets > 450 ? 0.1 : 0) + (body.size > 2 ? 0.05 : 0), 0, 1);
  const clot = 0.05 * clamp(b.platelets / 250, 0, 1.5) * clamp(1 - e('anticoagulant') * 0.4, 0.05, 1.5) * (1 + e('coagulant') * 0.5);
  body.bleeding = Math.max(0, body.bleeding - clot * dt);
  const total = body.bleeding + e('hemorrhage') * 0.5 + Math.max(0, e('anticoagulant') - 1.5) * 0.15 + (b.platelets < 40 ? 0.1 : 0) + (body.symptoms.nosebleed ? 0.03 : 0);
  body.bleedRate = total;
  const refill = (0.015 + e('healing') * 0.12 + e('regeneration') * 0.1 + e('hydration') * 0.08) * (v.hydration > 30 ? 1 : 0.2);
  v.bloodVolume = clamp(v.bloodVolume + (refill - total) * dt, 0, 100);
}

function stepToxic(body, E, dt) {
  const e = (k) => E[k] || 0;
  const o = body.organs;
  let dmg = 0;
  const hit = (t, amt) => { if (amt > 0) { damageTissue(t, amt); dmg += amt; } };
  const nt = e('neurotoxin');
  if (nt > 0) {
    for (const n of Object.values(body.nerves)) hit(n, nt * 0.6 * dt);
    for (const [k, r] of Object.entries(body.brain)) hit(r, nt * (k === 'motor' || k === 'cerebellum' ? 0.3 : 0.18) * dt);
    hit(o.brain, nt * 0.12 * dt);
  }
  hit(o.heart, e('cardiotoxin') * 0.8 * dt);
  hit(o.liver, e('hepatotoxin') * dt);
  hit(o.kidneyL, e('nephrotoxin') * 0.9 * dt); hit(o.kidneyR, e('nephrotoxin') * 0.9 * dt);
  hit(o.stomach, e('poison') * 0.2 * dt); hit(o.liver, e('poison') * 0.3 * dt);
  const nec = e('necrotic');
  if (nec > 0) {
    for (const x of Object.values(o)) hit(x, nec * 0.12 * dt);
    hit(o.skin, nec * 0.4 * dt);
    for (const m of Object.values(body.muscles)) hit(m, nec * 0.15 * dt);
  }
  hit(o.eyes, e('blindness') * 1.2 * dt); hit(body.brain.occipital, e('blindness') * 0.3 * dt);
  const rad = e('radiation');
  if (rad > 0) {
    body.blood.radiation += rad * 0.1 * dt;
    if (rad > 4) { hit(o.brain, (rad - 4) * 0.25 * dt); for (const n of Object.values(body.nerves)) hit(n, (rad - 4) * 0.1 * dt); }
    if (rad > 2) hit(o.skin, (rad - 2) * 0.2 * dt);
  }
  const el = e('electric');
  if (el > 2) hit(o.heart, (el - 2) * 0.3 * dt);
  if (el > 3) hit(o.skin, (el - 3) * 0.5 * dt);
  if (el > 1.2 && chance(0.4 * dt)) pushFlash(body, 'spark', {});
  const ex = e('explosive');
  if (ex > 0.3 && chance(0.06 * ex * dt)) detonate(body, ex, 'Internal detonation!');
  if (body.painSpike) { body.hurt += body.painSpike; body.painSpike = 0; }
  body.hurt += dmg * 1.6;
}

function stepRestore(body, E, dt) {
  const e = (k) => E[k] || 0;
  const heal = (t, amt) => { t.health = clamp(t.health + amt, 0, 100); };
  const he = e('healing'), rg = e('regeneration'), res = e('resurrection');
  // natural recovery
  for (const [k, o] of Object.entries(body.organs)) {
    heal(o, (k === 'liver' ? 0.05 : k === 'brain' ? 0.003 : 0.015) * dt);
    o.inflammation = Math.max(0, o.inflammation - 0.5 * dt);
  }
  if (!body.burning) heal(body.organs.skin, 0.02 * dt);
  for (const m of Object.values(body.muscles)) heal(m, 0.03 * dt);
  for (const n of Object.values(body.nerves)) heal(n, 0.005 * dt);
  for (const r of Object.values(body.brain)) heal(r, 0.002 * dt);
  if (he > 0) {
    for (const [k, o] of Object.entries(body.organs)) { heal(o, he * (k === 'brain' ? 0.3 : k === 'skin' ? 1.2 : 1) * dt); o.inflammation = Math.max(0, o.inflammation - 2 * he * dt); }
    for (const m of Object.values(body.muscles)) heal(m, he * dt);
    for (const n of Object.values(body.nerves)) heal(n, he * 0.25 * dt);
    for (const b of Object.values(body.bones)) heal(b, he * 0.3 * dt);
    body.burns = Math.max(0, body.burns - 0.02 * he * dt);
    body.frost = Math.max(0, body.frost - 0.02 * he * dt);
  }
  if (rg > 0) {
    for (const [id, b] of Object.entries(body.bones)) {
      heal(b, rg * 1.5 * dt);
      if (b.fractured && b.health >= 85) { b.fractured = false; pushEvent(body, `The ${boneName(id)} knits back together.`, 'good'); }
    }
    for (const n of Object.values(body.nerves)) heal(n, rg * dt);
    for (const r of Object.values(body.brain)) heal(r, rg * 0.6 * dt);
    for (const o of Object.values(body.organs)) heal(o, rg * 0.6 * dt);
    for (const m of Object.values(body.muscles)) heal(m, rg * 0.8 * dt);
    body.burns = Math.max(0, body.burns - 0.03 * rg * dt);
    body.frost = Math.max(0, body.frost - 0.03 * rg * dt);
  }
  if (res > 0) {
    for (const o of Object.values(body.organs)) heal(o, res * 0.3 * dt);
  }
  const gr = e('geneRepair');
  if (gr > 0) {
    body.blood.radiation = Math.max(0, body.blood.radiation - gr * 0.08 * dt);
    if (body.mutations.length && chance(0.04 * gr * dt)) {
      const m = body.mutations.splice(Math.floor(Math.random() * body.mutations.length), 1)[0];
      pushEvent(body, `Gene repair reverses the ${MUTATIONS[m].name.toLowerCase()} mutation.`, 'good');
    }
  }
  body.blood.radiation = Math.max(0, body.blood.radiation - 0.0015 * dt);
}

const boneName = (id) => ({ skull: 'skull', spine: 'spine', ribs: 'ribs', pelvis: 'pelvis' }[id] || id.replace(/L$/, ' (left)').replace(/R$/, ' (right)').replace('forearm', 'forearm').replace('humerus', 'humerus').replace('femur', 'femur').replace('shin', 'shin').replace('hand', 'hand').replace('foot', 'foot'));

function stepMuscles(body, E, dt) {
  const e = (k) => E[k] || 0;
  for (const [k, m] of Object.entries(body.muscles)) {
    const exert = body.exertion * (k === 'legL' || k === 'legR' || k === 'core' ? 1 : 0.6);
    m.fatigue = clamp(m.fatigue + (exert * 4 * (1 - clamp(e('endurance') * 0.3, 0, 0.9)) + e('fatigue') * 2) * dt, 0, 100);
    const rec = (1.5 + e('endurance') + (body.sleeping ? 3 : 0)) * (1 - body.exertion) * (body.vitals.glucose > 60 ? 1 : 0.3);
    m.fatigue = Math.max(0, m.fatigue - rec * dt);
    m.spasm = clamp(e('spasm') * 0.5 + Math.max(0, e('electric') - 0.5) * 0.4 + (body.symptoms.twitch ? 0.3 : 0) + (body.symptoms.stiffness ? 0.2 : 0) + (body.neuro.acetylcholine > 80 ? 0.3 : 0), 0, 1);
    m.mass = clamp(m.mass + e('muscleGrowth') * 0.004 * dt - e('weakness') * 0.0005 * dt - (body.age > 70 ? 0.0004 * dt : 0), 0.4, 3.5);
  }
}

function stepBones(body, E, env, dt) {
  const e = (k) => E[k] || 0;
  const elastic = body.transform.elastic >= 0.5;
  const load = body.size * (1 + e('heavy') * 0.4) * (env.gravity ?? 1);
  for (const [id, b] of Object.entries(body.bones)) {
    b.density = clamp(b.density + (e('boneHardening') * 0.012 - e('boneSoftening') * 0.012 - (body.age > 65 ? 0.0003 * (body.age - 65) / 10 : 0)) * dt, 0.15, 4);
    if (!b.fractured) b.health = clamp(b.health + 0.01 * dt, 0, 100);
    if (load > 1.8 && ['femurL', 'femurR', 'shinL', 'shinR', 'spine', 'pelvis', 'footL', 'footR'].includes(id)) {
      b.health = clamp(b.health - (load - 1.8) * 0.25 / b.density * dt, 0, 100);
      if (b.health < 20 && !b.fractured && !elastic) fractureBone(body, id, 'buckles under the subject\'s own weight');
    }
    if (elastic && b.fractured) { b.fractured = false; b.health = Math.max(b.health, 60); }
  }
}

export function fractureBone(body, id, why) {
  const b = body.bones[id];
  if (!b || b.fractured || body.transform.elastic >= 0.5) return false;
  b.fractured = true;
  b.health = Math.min(b.health, 15);
  body.bleeding += 0.05;
  body.hurt = (body.hurt || 0) + 45;
  pushEvent(body, `FRACTURE: the ${boneName(id)} ${why || 'snaps'}.`, 'critical');
  pushFlash(body, 'fracture', { bone: id });
  if (id === 'skull') damageTissue(body.organs.brain, 12);
  if (id === 'spine') { damageTissue(body.nerves.spinal, 45); pushEvent(body, 'The spinal cord is damaged.', 'critical'); }
  if (id === 'ribs' && chance(0.3)) { damageTissue(body.organs[chance(0.5) ? 'lungL' : 'lungR'], 20); pushEvent(body, 'A broken rib punctures a lung.', 'critical'); }
  return true;
}

// force: 1 = an ordinary landing. Returns list of fractured bone ids.
export function applyImpact(body, boneIds, force, why) {
  const T = body.transform;
  if (T.elastic >= 0.5 || T.ghost >= 1 || body.gone) return [];
  const broken = [];
  for (const id of boneIds) {
    const b = body.bones[id];
    if (!b) continue;
    const thr = 2.4 * b.density * Math.sqrt(Math.max(0.05, b.health / 100)) * (1 + T.metal * 2 + T.stone * 3 + T.gold * 1.5) * (T.crystal >= 1 ? 0.5 : 1) * (body.mutations.includes('scales') ? 1.2 : 1);
    if (force > thr) { if (fractureBone(body, id, why)) broken.push(id); }
    else if (force > thr * 0.5) b.health = clamp(b.health - (force - thr * 0.5) * 6, 0, 100);
  }
  body.hurt = (body.hurt || 0) + Math.max(0, force - 1) * 8;
  return broken;
}

function stepMorph(body, E, dt) {
  const e = (k) => E[k] || 0;
  const T = body.transform;
  let sizeT = clamp(1 + e('growth') * 0.25 - e('shrink') * 0.2, 0.15, 4.5);
  if (body.age < 16) sizeT *= 0.55 + (body.age / 16) * 0.45;
  if (T.werewolf >= 1) sizeT *= 1.12;
  const before = body.size;
  body.size = approach(body.size, sizeT, 0.3, dt);
  if (before < 1.5 && body.size >= 1.5) pushEvent(body, `${body.name} is growing. Now ${Math.round(body.size * 175)} cm tall.`, 'mutation');
  if (before > 0.6 && body.size <= 0.6) pushEvent(body, `${body.name} has shrunk to ${Math.round(body.size * 175)} cm.`, 'mutation');
  const ageBefore = body.age;
  body.age = clamp(body.age + (e('aging') * 0.8 - e('youth') * 0.8 + e('timeDilation') * 0.03) * dt, 6, 160);
  for (const mark of [16, 60, 80, 100, 120]) {
    if (ageBefore < mark && body.age >= mark) pushEvent(body, `${body.name} has aged to ${mark}.`, 'mutation');
    if (ageBefore > mark && body.age <= mark) pushEvent(body, `${body.name} has grown younger: ${mark} years old.`, 'mutation');
  }
  if (body.age > 100) for (const o of Object.values(body.organs)) damageTissue(o, 0.05 * (body.age - 100) / 10 * dt);
  if (body.age >= 135) killBody(body, 'Extreme old age');
  const b = body.blood;
  b.mana = clamp(b.mana + (e('mana') * 4 - (b.mana > 0 ? 1.2 : 0)) * dt, 0, 300);
  if (b.mana > 180) for (const n of Object.values(body.nerves)) damageTissue(n, (b.mana - 180) * 0.02 * dt);
  const pMut = e('mutagen') * 0.03 + e('radiation') * 0.004;
  if (pMut > 0 && chance(pMut * dt)) {
    const pool = Object.keys(MUTATIONS).filter((m) => !body.mutations.includes(m));
    if (pool.length) grantMutation(body, pick(pool));
    else damageTissue(pick(Object.values(body.organs)), 10);
  }
  if (e('teleport') > 0.2 && chance(0.15 * e('teleport') * dt)) body.teleportRequest = true;
}

function stepImmune(body, E, dt) {
  const e = (k) => E[k] || 0;
  body.immuneDrain = Math.max(0, (body.immuneDrain || 0) - 0.2 * dt);
  let t = 70 * Math.sqrt(body.blood.wbc / 7) * (0.75 + 0.25 * organFn(body, 'spleen')) + e('immuneBoost') * 12 - e('immuneSuppress') * 18
    - Math.max(0, body.vitals.stress - 60) * 0.2 - body.immuneDrain;
  if (body.age > 70) t -= (body.age - 70) * 0.3;
  body.immune = approach(body.immune, clamp(t, 0, 150), 0.2, dt);
}

function deriveSymptoms(body, E, S) {
  const e = (k) => E[k] || 0;
  const v = body.vitals, b = body.blood, T = body.transform;
  const set = (k, s) => { if (s > 0) S[k] = Math.max(S[k] || 0, clamp(s, 0, 1)); };
  const lungs = (body.organs.lungL.health + body.organs.lungR.health) / 2;
  set('nausea', e('nausea') * 0.6 + Math.max(0, b.toxins - 35) / 40 + Math.max(0, e('intoxication') - 1.8) * 0.4 + Math.max(0, e('hallucinogen') - 2) * 0.2 + (b.radiation > 2 ? 0.4 : 0));
  if ((S.nausea || 0) > 0.55) set('vomit', S.nausea);
  set('shiver', (36 - v.temp) / 2);
  set('sweat', (v.temp - 37.8) / 1.5 + Math.max(0, e('stimulant') - 1) * 0.3 + (v.glucose < 60 ? 0.6 : 0) + Math.max(0, e('fear') - 1) * 0.3);
  set('tremor', Math.max(0, e('stimulant') - 1.5) * 0.4 + (v.glucose < 60 ? 0.6 : 0) + Math.max(0, e('fear') - 1) * 0.4 + e('neurotoxin') * 0.4 + (body.age > 85 ? 0.4 : 0) + (v.temp < 35.5 ? 0.3 : 0));
  set('cough', (70 - lungs) / 40);
  set('wheeze', (50 - lungs) / 30);
  const legBroken = ['femurL', 'femurR', 'shinL', 'shinR', 'footL', 'footR'].some((id) => body.bones[id].fractured);
  set('limp', legBroken ? 1 : Math.max(0, 50 - Math.min(body.muscles.legL.health, body.muscles.legR.health)) / 30);
  set('chestPain', (55 - body.organs.heart.health) / 30 + (v.hr > 180 ? 0.5 : 0));
  set('headache', (v.map - 135) / 20 + (80 - body.organs.brain.health) / 30 + Math.max(0, e('stimulant') - 2) * 0.3 + (v.hydration < 40 ? 0.4 : 0));
  set('cyanosis', (88 - v.spo2) / 15);
  set('pallor', (80 - v.bloodVolume) / 20 + (62 - v.map) / 20 + (T.vampire >= 1 ? 1 : 0));
  set('flushed', (v.temp - 38.3) / 1.5 + Math.max(0, e('intoxication') - 0.6) * 0.5 + Math.max(0, e('heat') - 0.8) * 0.4 + Math.max(0, e('love') - 0.8) * 0.5 + e('asphyxiant') * 0.3);
  set('jaundice', (50 - body.organs.liver.health) / 25);
  set('twitch', Math.max(0, e('spasm') - 0.2) + Math.max(0, e('electric') - 0.8) * 0.5);
  set('confusion', (v.glucose < 55 ? 0.7 : 0) + (v.spo2 < 82 ? 0.6 : 0) + (v.temp > 40 ? 0.5 : 0) + Math.max(0, e('hallucinogen') - 1.5) * 0.4 + Math.max(0, e('intoxication') - 1.6) * 0.4 + Math.max(0, e('amnesia') - 1) * 0.5);
  set('rash', e('allergen') * 1.2);
  set('itch', e('allergen') * 1.2);
  set('stiffness', (T.stone - 0.2) * 1.5 + (T.metal - 0.5) + (T.gold - 0.3));
  set('glowEyes', (e('mana') > 1 ? 1 : 0) + (T.vampire >= 1 ? 1 : 0) + (T.werewolf >= 1 ? 1 : 0) + (T.divine > 0.5 ? 1 : 0));
  set('laugh', e('laughter') * 0.8);
  set('dance', (e('euphoria') - 2) * 0.5);
  set('howl', T.werewolf >= 1 ? 0.6 : 0);
  set('insomnia', (e('stimulant') - 2) * 0.5);
  set('drowsy', e('sleep') * 0.6 + (body.neuro.melatonin - 70) / 20);
  set('hunger', (e('regeneration') - 1.5) * 0.5 + (v.glucose < 70 ? 0.6 : 0));
  set('thirst', (45 - v.hydration) / 20);
  set('nosebleed', (v.map > 170 ? 0.7 : 0) + (b.platelets < 50 ? 0.7 : 0) + Math.max(0, e('anticoagulant') - 2) * 0.4);
  set('paranoia', Math.max(0, e('fear') - 1.2) * 0.5 + Math.max(0, e('hallucinogen') - 2) * 0.3);
  set('aggression', Math.max(0, e('rage') - 1) * 0.6);
  set('fever', (v.temp - 38.2) / 1.5);
  set('drool', (T.werewolf >= 1 ? 0.5 : 0));
  set('hiccup', Math.max(0, e('intoxication') - 1.2) * 0.3);
  set('delirium', (v.temp > 40.5 ? 0.6 : 0) + Math.max(0, e('hallucinogen') - 3) * 0.3 + (b.toxins > 60 ? 0.5 : 0));
}

function stepSymptoms(body, S, dt) {
  if (S.nosebleed) body.bleeding += 0.002 * dt;
  if (S.aggression) body.aggro = S.aggression;
}

function stepPain(body, E, S, dt) {
  const v = body.vitals, e = (k) => E[k] || 0;
  let fractures = 0;
  for (const b of Object.values(body.bones)) if (b.fractured) fractures++;
  let inflam = 0;
  for (const o of Object.values(body.organs)) inflam += o.inflammation;
  const sym = (S.headache || 0) * 15 + (S.chestPain || 0) * 35 + (S.stiffness || 0) * 10 + (S.boils || 0) * 10 + (S.rash || 0) * 5
    + (S.itch || 0) * 4 + (S.nausea || 0) * 6 + body.frost * 30;
  let spasm = 0;
  for (const m of Object.values(body.muscles)) spasm += m.spasm;
  const raw = (body.hurt || 0) + fractures * 18 + body.burns * 40 + body.burning * 50 + sym + inflam * 0.02 + spasm * 3;
  const nerves = Object.values(body.nerves).reduce((a, n) => a + n.health, 0) / 600;
  const sens = regionFn(body, 'sensory') * nerves * (1 - e('analgesic') / (1 + e('analgesic'))) * clamp(1 - (body.neuro.endorphin - 50) / 150, 0.2, 1.3);
  let target = clamp(raw * sens, 0, 100);
  if (v.consciousness < 10) target *= 0.2;
  v.pain = approach(v.pain, target, 1, dt);
  const hallu = e('hallucinogen') + (S.delirium || 0);
  body.hallucination = hallu;
  const stressT = 20 + v.pain * 0.45 + e('fear') * 25 + e('rage') * 15 + (body.neuro.norepinephrine - 50) * 0.4 - e('calm') * 20 - e('euphoria') * 8 + hallu * 6;
  v.stress = approach(v.stress, clamp(stressT, 0, 100), 0.25, dt);
}

function stepDeathCheck(body, E) {
  if (!body.alive) return;
  if (body.organs.brain.health <= 0.5 || body.brain.brainstem.health <= 0.5) {
    killBody(body, deathCause(body, E));
  }
}

function deathCause(body, E) {
  const v = body.vitals, e = (k) => E[k] || 0;
  if (body.organs.heart.health <= 1) return 'Heart destroyed';
  if (e('asphyxiant') > 2) return 'Cellular asphyxiation';
  if (v.temp > 42.5) return 'Hyperthermia';
  if (v.temp < 26) return 'Hypothermia';
  if (v.bloodVolume < 45) return 'Exsanguination';
  if (body.arrestTime > 10) return body.vfibTime > 0 ? 'Cardiac arrest (ventricular fibrillation)' : 'Cardiac arrest';
  if (v.spo2 < 60) return e('sedative') > 2.5 ? 'Respiratory depression (overdose)' : 'Respiratory failure';
  if (v.glucose < 25) return 'Hypoglycemic coma';
  if (body.blood.toxins > 85) return 'Systemic poisoning';
  if (body.blood.radiation > 8) return 'Acute radiation syndrome';
  if (e('neurotoxin') > 1) return 'Neurotoxic brain injury';
  return 'Brain death';
}

// ---------------------------------------------------------------------------
function stepDead(body, E, env, dt) {
  const v = body.vitals;
  body.deadTime += dt;
  v.hr = 0; v.rr = 0; v.consciousness = 0; v.pain = 0;
  v.map = approach(v.map, 0, 0.8, dt); v.sys = v.map * 1.05; v.dia = v.map * 0.9;
  v.spo2 = approach(v.spo2, 0, 0.15, dt);
  v.temp = approach(v.temp, env.temp, 0.004, dt);
  body.tissueO2 = 0;
  body.perfusion = 0;
  if (body.burning > 0) { damageTissue(body.organs.skin, 2 * body.burning * dt); body.burning = Math.max(0, body.burning - 0.035 * dt); }
  const e = (k) => E[k] || 0;
  body.transform.zombie = clamp(body.transform.zombie + e('undeath') * 0.05 * dt, 0, 1.2);
  if (body.reanimate > 0) {
    body.reanimate -= dt;
    if (body.reanimate <= 0) riseUndead(body);
  } else if ((body.transform.zombie >= 0.6 || e('undeath') > 0.8) && body.deadTime > 3) {
    riseUndead(body);
  } else if (e('resurrection') >= 0.6) {
    reviveBody(body, 'A surge of life floods the corpse.');
  } else if (e('electric') >= 3 && body.deadTime < 60 && body.organs.heart.health > 10 && body.organs.brain.health > 5 && chance(0.2 * dt)) {
    reviveBody(body, 'Galvanic shock restarts the heart. IT\'S ALIVE!');
  }
}

function riseUndead(body) {
  body.undead = true;
  body.transform.zombie = Math.max(1, body.transform.zombie);
  body.deathCause = body.deathCause || 'Unknown';
  body.organs.brain.health = Math.max(body.organs.brain.health, 40);
  body.brain.brainstem.health = Math.max(body.brain.brainstem.health, 30);
  body.brain.motor.health = Math.max(body.brain.motor.health, 40);
  pushEvent(body, `${body.name} RISES AGAIN. The subject is undead.`, 'mutation');
  pushFlash(body, 'rise', {});
}

function stepUndead(body, E, env, dt) {
  const v = body.vitals, e = (k) => E[k] || 0;
  v.hr = 0; v.rr = 0; v.map = 0; v.sys = 0; v.dia = 0;
  v.spo2 = approach(v.spo2, 0, 0.3, dt);
  v.temp = approach(v.temp, env.temp, 0.01, dt);
  v.consciousness = 35; v.pain = 0;
  body.tissueO2 = 0; body.perfusion = 0;
  body.rhythm = 'asystole';
  damageTissue(body.organs.brain, 0.02 * dt);
  const holy = e('purify') * 3 + e('healing') * 1 + e('regeneration') * 0.5 + e('divinity') * 3;
  if (holy > 0) {
    for (const o of Object.values(body.organs)) damageTissue(o, holy * dt);
    if (chance(dt)) pushEvent(body, 'The undead flesh smokes and blisters.', 'warn');
  }
  if (e('resurrection') >= 1) { reviveBody(body, 'True resurrection burns the undeath away.'); return; }
  stepThermo(body, E, env, dt);
  stepMuscles(body, E, dt);
  stepToxic(body, E, dt);
  if (body.organs.brain.health <= 0.5) killBody(body, 'Undead brain destroyed');
}

function stepStasis(body, E, env, dt) {
  const v = body.vitals, e = (k) => E[k] || 0;
  if (body.stasis === 'cryo') {
    const target = env.temp + e('heat') * 20 + body.burning * 30;
    v.temp = approach(v.temp, target, 0.004 + e('heat') * 0.05 + body.burning * 0.05, dt);
    if (e('cold') > 3) v.temp = Math.min(v.temp, 10);
    if (v.temp > 14) {
      body.stasis = null;
      pushEvent(body, 'The subject thaws out of cryostasis.', 'good');
      for (let i = 0; i < 3; i++) damageTissue(pick(Object.values(body.organs)), rand(4, 14));
      pushEvent(body, 'Ice crystals have damaged some tissue.', 'warn');
    }
  } else {
    stepTransforms(body, E, dt);
    const meter = body.stasis === 'gold' ? body.transform.gold : body.transform.stone;
    if (meter < 0.95) {
      const was = body.stasis;
      body.stasis = null;
      pushEvent(body, was === 'gold' ? 'The gold flakes away. The subject breathes again.' : 'The stone crust cracks and falls away. The subject breathes again.', 'good');
    }
  }
}

// ---------------------------------------------------------------------------
export function reviveBody(body, text) {
  if (body.gone) return false;
  body.alive = true; body.undead = false; body.deathCause = null; body.deadTime = 0;
  body.rhythm = 'sinus'; body.arrestTime = 0; body.vfibTime = 0; body.reanimate = 0;
  body.stasis = null;
  body.organs.brain.health = Math.max(body.organs.brain.health, 35);
  for (const r of Object.values(body.brain)) r.health = Math.max(r.health, 30);
  body.organs.heart.health = Math.max(body.organs.heart.health, 45);
  for (const o of Object.values(body.organs)) o.health = Math.max(o.health, 30);
  const v = body.vitals;
  v.bloodVolume = Math.max(v.bloodVolume, 70);
  v.spo2 = Math.max(v.spo2, 85); v.map = Math.max(v.map, 70); v.hr = 90;
  v.temp = clamp(v.temp, 35, 39); v.consciousness = 30; v.glucose = Math.max(v.glucose, 70);
  body.blood.toxins = Math.min(body.blood.toxins, 40);
  body.transform.zombie = 0;
  body.bleeding = Math.min(body.bleeding, 0.1);
  pushEvent(body, text || `${body.name} gasps back to life!`, 'good');
  pushFlash(body, 'revive', {});
  return true;
}

// --- sandbox medical tools -------------------------------------------------------
export function defibrillate(body) {
  if (body.gone) return 'There is nothing left to shock.';
  body.shock = 1.5;
  pushFlash(body, 'defib', {});
  if (body.undead) { damageTissue(body.organs.skin, 5); return 'The corpse jerks. It is still undead.'; }
  if (!body.alive) {
    if (body.deadTime < 90 && body.organs.brain.health > 0 && body.organs.heart.health > 10 && chance(0.35)) {
      reviveBody(body, 'CLEAR! The defibrillator restarts the heart.');
      return 'Shock delivered — return of spontaneous circulation!';
    }
    return 'Shock delivered. No response.';
  }
  if (body.rhythm === 'vfib' && chance(0.5 + 0.4 * organFn(body, 'heart'))) { setRhythm(body, 'sinus', 'CLEAR! Defibrillation restores sinus rhythm.'); return 'Shock delivered — rhythm restored.'; }
  if (body.rhythm === 'vfib' || body.rhythm === 'asystole') return 'Shock delivered. Still no organised rhythm.';
  body.hurt = (body.hurt || 0) + 40;
  if (chance(0.15)) setRhythm(body, 'vfib', 'Shocking a beating heart threw it into fibrillation!');
  return 'Shock delivered to a beating heart. That hurt.';
}

export function stabilize(body) {
  if (!body.alive || body.gone) return 'Only living subjects can be stabilised.';
  const v = body.vitals;
  v.bloodVolume = Math.max(v.bloodVolume, 85); v.hydration = Math.max(v.hydration, 75);
  v.glucose = clamp(v.glucose, 80, 140); v.spo2 = Math.max(v.spo2, 94);
  v.temp = clamp(v.temp, 35.5, 38.5); body.blood.ph = 7.4; body.bleeding = 0; body.burning = 0;
  body.blood.toxins *= 0.5; body.seizure = 0;
  if (body.rhythm === 'vfib' || body.rhythm === 'asystole') setRhythm(body, 'sinus', null);
  pushEvent(body, 'Emergency stabilisation: fluids, oxygen, glucose, pressure support.', 'good');
  return 'Subject stabilised.';
}

export function dialysis(body) {
  if (body.gone) return 'No subject.';
  body.doses = [];
  body.blood.toxins = 0; body.blood.bac = 0; body.blood.mana = 0;
  pushEvent(body, 'Dialysis and chelation: every substance flushed from the bloodstream.', 'good');
  return 'Bloodstream flushed.';
}

export function fullRestore(body) {
  if (body.gone) return 'There is nothing left to restore. Grow a new subject.';
  for (const g of [body.organs, body.brain, body.nerves, body.muscles]) for (const t of Object.values(g)) { t.health = 100; if ('inflammation' in t) t.inflammation = 0; if ('fatigue' in t) { t.fatigue = 0; t.spasm = 0; } }
  for (const b of Object.values(body.bones)) { b.health = 100; b.fractured = false; }
  for (const k of Object.keys(body.transform)) body.transform[k] = 0;
  body.stasis = null; body.mutations = []; body.diseases = []; body.doses = [];
  body.burns = 0; body.frost = 0; body.burning = 0; body.bleeding = 0; body.seizure = 0;
  body.size = 1; body.age = 30;
  Object.assign(body.blood, { rbc: 4.8, wbc: 7, platelets: 250, ph: 7.4, toxins: 0, radiation: 0, mana: 0, bac: 0 });
  Object.assign(body.vitals, { hr: 72, map: 90, sys: 118, dia: 76, rr: 14, spo2: 98, temp: 37, glucose: 92, consciousness: 100, pain: 0, stress: 20, hydration: 90, bloodVolume: 100 });
  for (const k of Object.keys(body.neuro)) body.neuro[k] = 50;
  for (const m of Object.values(body.muscles)) m.mass = 1;
  for (const b of Object.values(body.bones)) b.density = 1;
  if (!body.alive || body.undead) reviveBody(body, 'Full restoration: the subject is made whole.');
  else pushEvent(body, 'Full restoration: every tissue repaired, every change undone.', 'good');
  body.rhythm = 'sinus';
  return 'Subject fully restored.';
}

// ---------------------------------------------------------------------------
// Capabilities: the numbers behaviour, rendering and the monitor read.
// ---------------------------------------------------------------------------
export function deriveCapabilities(body, E, env) {
  const e = (k) => E[k] || 0;
  const v = body.vitals, T = body.transform, S = body.symptoms;
  const fn = (id) => regionFn(body, id);
  const alive = body.alive && !body.stasis;
  const cons = v.consciousness / 100;
  const hallu = body.hallucination || 0;
  const nerve = (id) => body.nerves[id].health / 100;
  const motor = fn('motor');
  const spinal = nerve('spinal');
  const muscleStrength = (g, nerveF) => {
    const m = body.muscles[g];
    const para = clamp(e('paralysis') * 0.3 + T.stone * 0.8 + T.gold * 0.8, 0, 1);
    return m.mass * (m.health / 100) * (1 - m.fatigue / 140) * nerveF * (1 + e('strength') * 0.45 - e('weakness') * 0.35 + e('rage') * 0.15 + e('stimulant') * 0.04) * (1 - para) * (body.age > 60 ? 1 - (body.age - 60) / 120 : 1) * (body.age < 16 ? 0.5 + body.age / 32 : 1);
  };
  const armL = muscleStrength('armL', nerve('armL') * Math.sqrt(spinal) * motor);
  const armR = muscleStrength('armR', nerve('armR') * Math.sqrt(spinal) * motor);
  const legL = muscleStrength('legL', nerve('legL') * spinal * motor);
  const legR = muscleStrength('legR', nerve('legR') * spinal * motor);
  const core = muscleStrength('core', spinal * motor);
  const legBroken = (s) => body.bones['femur' + s].fractured || body.bones['shin' + s].fractured || body.bones['foot' + s].fractured;
  const armBroken = (s) => body.bones['humerus' + s].fractured || body.bones['forearm' + s].fractured || body.bones['hand' + s].fractured;
  const fatigue = avgFatigue(body);
  const heavy = e('heavy');
  const coordination = clamp(fn('cerebellum') * (1 - e('intoxication') * 0.22 - e('sedative') * 0.12 - e('hallucinogen') * 0.06 - Math.max(0, e('stimulant') - 2) * 0.1 - fatigue / 300 - (S.tremor || 0) * 0.15 - (S.stiffness || 0) * 0.2 - (S.confusion || 0) * 0.1) + (body.mutations.includes('tail') ? 0.12 : 0), 0, 1.25);
  const legStrength = (legBroken('L') ? 0.15 : legL) * 0.5 + (legBroken('R') ? 0.15 : legR) * 0.5;
  const armStrength = (armBroken('L') ? 0.1 : armL) * 0.5 + (armBroken('R') ? 0.1 : armR) * 0.5;
  const obedienceBase = fn('frontal') * (1 - e('rage') * 0.3) * (1 - e('intoxication') * 0.1) * (1 + e('love') * 0.3 + e('calm') * 0.1) * (1 - hallu * 0.1)
    * (T.werewolf >= 1 ? 0.35 : 1) * (1 - (S.aggression || 0) * 0.3) * (1 - (S.confusion || 0) * 0.3);
  const glowColor = T.divine > 0.3 ? '#ffe9a0' : T.crystal > 0.5 ? '#9ff5ea' : body.blood.mana > 40 ? '#c08bff' : (body.lastGlowColor || '#fff6c2');
  body.cap = {
    alive,
    conscious: alive && v.consciousness > 25 && !body.sleeping,
    hearing: alive ? clamp(fn('temporal') * (body.mutations.includes('antennae') ? 1.25 : 1) * smoothstep(20, 45, v.consciousness), 0, 1.3) : 0,
    comprehension: clamp(Math.sqrt(fn('temporal') * fn('frontal')) * (1 - e('amnesia') * 0.25) * (1 - hallu * 0.15) * (1 - e('intoxication') * 0.12) * (1 - (S.confusion || 0) * 0.35), 0, 1),
    obedience: clamp(obedienceBase, 0, 1.3),
    memory: clamp(fn('hippocampus') * (1 - e('amnesia') * 0.4), 0, 1),
    coordination,
    vision: clamp(organFn(body, 'eyes') * fn('occipital') * (1 - e('blindness') * 0.5) + (body.mutations.includes('thirdEye') ? 0.2 : 0), 0, 1.3),
    speech: clamp(fn('broca') * smoothstep(15, 50, v.consciousness) * (1 - e('intoxication') * 0.2) * (1 - e('paralysis') * 0.25), 0, 1),
    iq: Math.round(clamp(100 * ((fn('frontal') + fn('hippocampus') + fn('temporal')) / 3) * (1 + e('intellect') * 0.28) * Math.sqrt(Math.max(0.05, cons))
      - e('intoxication') * 12 - hallu * 8 - e('amnesia') * 10 + (body.mutations.includes('thirdEye') ? 5 : 0) - (T.zombie >= 1 ? 60 : 0), 0, 400)),
    mood: clamp((body.neuro.dopamine + body.neuro.serotonin - 100) * 1.2 + e('euphoria') * 20 - v.pain * 0.4 - e('fear') * 20 + e('love') * 10, -100, 100),
    armL: armBroken('L') ? 0.1 : armL, armR: armBroken('R') ? 0.1 : armR, legL: legBroken('L') ? 0.15 : legL, legR: legBroken('R') ? 0.15 : legR, core,
    armStrength, legStrength,
    strength: (armStrength + legStrength + core) / 3,
    legBrokenL: legBroken('L'), legBrokenR: legBroken('R'), armBrokenL: armBroken('L'), armBrokenR: armBroken('R'),
    speed: clamp(Math.sqrt(Math.max(0, legStrength)) * (1 + e('haste') * 0.35 - e('slow') * 0.3 + e('timeDilation') * 0.4) * (T.werewolf >= 1 ? 1.5 : 1)
      * (1 - T.stone) * (0.4 + 0.6 * coordination) * clamp(1 - fatigue / 160, 0.2, 1) * (1 - (S.limp || 0) * 0.4) / Math.sqrt(1 + heavy * 0.5), 0, 5),
    reflexMs: Math.round(clamp(180 / body.conductivity / (1 + e('haste') * 0.3 + e('timeDilation') * 0.3), 60, 3000)),
    stamina: 100 - fatigue,
    levitation: e('levitation'),
    heavy,
    gravity: env.gravity ?? 1,
    weightKg: Math.round(75 * body.size ** 3 * (1 + heavy * 0.5) * (1 + T.gold * 1.5 + T.metal * 0.6 + T.stone * 1.2)),
    heightCm: Math.round(175 * body.size),
    invisibility: clamp(e('invisibility') * 0.5, 0, 0.95),
    glow: clamp(e('glow') * 0.4 + (e('radiation') > 1 ? 0.2 : 0), 0, 1.5),
    glowColor,
    aggression: e('rage') + (T.werewolf >= 1 ? 1 : 0) + (body.undead ? 1 : 0) + (S.aggression || 0),
    fear: e('fear') + (S.paranoia || 0) * 0.5,
    hallucination: hallu,
    euphoria: e('euphoria') + e('laughter') * 0.3,
    drunk: e('intoxication'),
    love: e('love'),
    elastic: T.elastic,
    telepathy: e('telepathy') + (body.mutations.includes('thirdEye') ? 0.2 : 0),
    truth: e('truth'),
    helium: e('helium'),
    fireBreath: e('fireBreath'),
    mana: body.blood.mana,
  };
}
