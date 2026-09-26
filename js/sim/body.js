// The homunculus: complete physiological state of the test subject.
import { ORGANS, BRAIN_REGIONS, NERVE_REGIONS, MUSCLES, BONES, TRANSFORMS } from '../data/vocab.js';
import { Ring, clamp } from '../util.js';

export const NEURO_KEYS = ['dopamine', 'serotonin', 'norepinephrine', 'gaba', 'glutamate', 'acetylcholine', 'endorphin', 'melatonin'];
export const HISTORY_KEYS = ['hr', 'sys', 'dia', 'spo2', 'rr', 'temp', 'glucose', 'consciousness'];

const SUBJECT_NAMES = ['H-01', 'H-07', 'H-13', 'H-22', 'H-31', 'H-42', 'H-58', 'H-66', 'H-77', 'H-89', 'H-93'];
let subjectCounter = 0;

function tissueMap(ids, extra) {
  const out = {};
  for (const id of Object.keys(ids)) out[id] = { health: 100, ...(extra ? extra() : {}) };
  return out;
}

export function createBody(name) {
  subjectCounter++;
  const body = {
    name: name || `Subject ${SUBJECT_NAMES[(subjectCounter - 1) % SUBJECT_NAMES.length]}`,
    generation: subjectCounter,
    alive: true,
    undead: false,           // reanimated corpse
    gone: false,             // body no longer exists (annihilated, erased, ascended)
    deathCause: null,
    deadTime: 0,
    stasis: null,            // 'stone' | 'cryo' | null : processes frozen
    time: 0,                 // sim seconds alive in the chamber
    age: 30,
    size: 1,
    vitals: {
      hr: 72, sys: 118, dia: 76, map: 90, rr: 14, spo2: 98, temp: 37.0, glucose: 92,
      consciousness: 100, pain: 0, stress: 20, hydration: 90, bloodVolume: 100,
    },
    rhythm: 'sinus',         // sinus | tachy | brady | afib | vfib | asystole
    arrestTime: 0,
    organs: tissueMap(ORGANS, () => ({ inflammation: 0 })),
    brain: tissueMap(BRAIN_REGIONS, () => ({ activity: 50 })),
    nerves: tissueMap(NERVE_REGIONS),
    muscles: tissueMap(MUSCLES, () => ({ fatigue: 0, mass: 1, spasm: 0 })),
    bones: tissueMap(BONES, () => ({ fractured: false, density: 1 })),
    neuro: Object.fromEntries(NEURO_KEYS.map((k) => [k, 50])),
    conductivity: 1,
    blood: {
      rbc: 4.8, wbc: 7, platelets: 250, ph: 7.4, toxins: 0, radiation: 0, mana: 0,
      bac: 0, clotRisk: 0.1, color: '#9e1b2c',
    },
    immune: 70,
    diseases: [],            // { id, progress, stage, time, incubating }
    immunities: {},
    cooldowns: {},           // diseaseId -> seconds before it can trigger again
    mutations: [],
    transform: Object.fromEntries(Object.keys(TRANSFORMS).map((k) => [k, 0])),
    doses: [],
    effects: {},             // effectId -> current intensity (recomputed every tick)
    symptoms: {},            // symptomId -> strength (recomputed every tick)
    burning: 0,              // external flames 0..1
    wet: 0,
    burns: 0,                // cumulative burn marks 0..1 (visual)
    frost: 0,                // frostbite marks 0..1
    bleeding: 0,             // % blood volume lost per second
    seizure: 0,              // seconds of seizure remaining
    sleeping: false,
    exertion: 0,             // 0..1 set by behaviour (current physical activity)
    glowColor: '#fff6c2',
    hallucination: 0,
    hunger: 0,
    // derived each tick (see physiology.deriveCapabilities)
    cap: {},
    history: Object.fromEntries(HISTORY_KEYS.map((k) => [k, new Ring(600)])),
    events: [],              // queued log events {text, level} drained by the UI
    flashes: [],             // queued visual FX requests drained by the renderer
    measurements: [],        // command test results
  };
  return body;
}

// Average health of a set of tissues
export const avgHealth = (map, keys) => {
  const ks = keys || Object.keys(map);
  let s = 0;
  for (const k of ks) s += map[k].health;
  return s / ks.length;
};

export const organFn = (body, id) => {
  const o = body.organs[id];
  return clamp(o.health / 100, 0, 1) * (1 - clamp(o.inflammation, 0, 100) / 250);
};

export const regionFn = (body, id) => clamp(body.brain[id].health / 100, 0, 1) * clamp(body.organs.brain.health / 100 + 0.25, 0, 1);

export function getStat(body, key) {
  const v = body.vitals, b = body.blood;
  switch (key) {
    case 'radiation': return b.radiation;
    case 'temp': return v.temp;
    case 'glucose': return v.glucose;
    case 'toxins': return b.toxins;
    case 'bloodVolume': return v.bloodVolume;
    case 'spo2': return v.spo2;
    case 'map': return v.map;
    case 'hr': return v.hr;
    case 'clotRisk': return b.clotRisk;
    case 'mana': return b.mana;
    case 'immune': return body.immune;
    case 'hydration': return v.hydration;
    case 'stress': return v.stress;
    case 'bac': return b.bac;
    case 'age': return body.age;
    case 'size': return body.size;
    case 'pain': return v.pain;
    case 'consciousness': return v.consciousness;
    case 'fatigue': return avgFatigue(body);
    case 'wbc': return b.wbc;
    case 'rbc': return b.rbc;
    case 'heart': return body.organs.heart.health;
    case 'liver': return body.organs.liver.health;
    case 'kidneys': return (body.organs.kidneyL.health + body.organs.kidneyR.health) / 2;
    case 'lungs': return (body.organs.lungL.health + body.organs.lungR.health) / 2;
    case 'brain': return body.organs.brain.health;
    case 'skin': return body.organs.skin.health;
    case 'deadTime': return body.alive ? 0 : body.deadTime;
    default:
      if (key in body.neuro) return body.neuro[key];
      return 0;
  }
}

export function avgFatigue(body) {
  let s = 0, n = 0;
  for (const m of Object.values(body.muscles)) { s += m.fatigue; n++; }
  return s / n;
}

export function pushEvent(body, text, level = 'info') {
  body.events.push({ text, level, t: body.time });
}

export function pushFlash(body, kind, data = {}) {
  body.flashes.push({ kind, ...data });
}

// Resolve a damage key (see vocab.js) to a list of [tissueObject, label].
export function resolveTissues(body, key) {
  if (body.organs[key]) return [body.organs[key]];
  if (key === 'lungs') return [body.organs.lungL, body.organs.lungR];
  if (key === 'kidneys') return [body.organs.kidneyL, body.organs.kidneyR];
  if (key === 'nerves') return Object.values(body.nerves);
  if (key === 'muscles') return Object.values(body.muscles);
  if (key === 'bones') return Object.values(body.bones);
  const dot = key.indexOf('.');
  if (dot > 0) {
    const group = key.slice(0, dot), id = key.slice(dot + 1);
    const map = group === 'brain' ? body.brain : group === 'nerve' ? body.nerves : group === 'muscle' ? body.muscles : group === 'bone' ? body.bones : null;
    if (map && map[id]) return [map[id]];
  }
  return [];
}

export function damageTissue(t, amount) {
  t.health = clamp(t.health - amount, 0, 100);
}

export function killBody(body, cause, opts = {}) {
  if (!body.alive && !body.undead && !opts.gone) return;
  const wasUndead = body.undead;
  body.alive = false;
  body.undead = false;
  body.deathCause = wasUndead ? `${cause} (laid to rest)` : cause;
  body.deadTime = 0;
  body.sleeping = false;
  body.seizure = 0;
  body.rhythm = 'asystole';
  if (opts.gone) { body.gone = true; body.goneKind = opts.kind || 'annihilated'; }
  pushEvent(body, `${body.name} has died. Cause: ${body.deathCause}.`, 'death');
  pushFlash(body, 'death', { gone: !!opts.gone, kind: opts.kind });
}
