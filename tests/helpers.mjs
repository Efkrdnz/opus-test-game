// Shared helpers for the headless simulation tests.
import { createBody } from '../js/sim/body.js';
import { stepBody, DEFAULT_ENV, SIM_STEP } from '../js/sim/physiology.js';
import { brewMixture } from '../js/sim/mixer.js';
import { administer } from '../js/sim/pharmacology.js';
import { SUBSTANCES } from '../js/data/substances.js';
import { RECIPES } from '../js/data/recipes.js';

export const INDEX = Object.fromEntries(SUBSTANCES.map((s) => [s.id, s]));

// Deterministic Math.random for reproducible tests.
export function seedRandom(seed = 12345) {
  let s = seed >>> 0;
  const orig = Math.random;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return () => { Math.random = orig; };
}

export function brew(ings, proc = {}) {
  const r = brewMixture(ings.map(([id, ml]) => ({ id, ml })), { temp: null, stir: 'gentle', time: 'minute', treatments: [], ...proc }, INDEX, RECIPES);
  if (!r.ok) throw new Error(`brew failed: ${r.error}`);
  return r.mixture;
}

export function subject() { return createBody(); }

export function run(body, seconds, env = DEFAULT_ENV) {
  const n = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < n; i++) stepBody(body, env, SIM_STEP);
  return body;
}

export function give(body, ings, route, ml, proc) {
  const m = brew(ings, proc);
  administer(body, m, route, ml, 'armL', DEFAULT_ENV);
  return m;
}
