import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subject, run, give, seedRandom } from './helpers.mjs';
import { defibrillate, fullRestore, DEFAULT_ENV } from '../js/sim/physiology.js';
import { infect } from '../js/sim/diseases.js';

const withSeed = (fn) => () => { const restore = seedRandom(4242); try { fn(); } finally { restore(); } };

test('an untouched subject stays stable for ten minutes', withSeed(() => {
  const b = run(subject(), 600);
  const v = b.vitals;
  assert.ok(b.alive);
  assert.ok(v.hr > 60 && v.hr < 85, `hr ${v.hr}`);
  assert.ok(v.map > 80 && v.map < 100, `map ${v.map}`);
  assert.ok(v.spo2 > 95, `spo2 ${v.spo2}`);
  assert.ok(Math.abs(v.temp - 37) < 0.3, `temp ${v.temp}`);
  assert.ok(v.consciousness > 95);
  assert.equal(b.diseases.length, 0);
}));

test('caffeine raises heart rate and blood pressure', withSeed(() => {
  const b = subject();
  give(b, [['caffeine', 10], ['saline', 20]], 'iv', 30);
  run(b, 20);
  assert.ok(b.vitals.hr > 95, `hr ${b.vitals.hr}`);
  assert.ok(b.vitals.map > 100, `map ${b.vitals.map}`);
  assert.ok(b.alive);
}));

test('cyanide kills by cellular asphyxiation while SpO2 stays normal', withSeed(() => {
  const b = subject();
  give(b, [['potassium_cyanide', 10], ['saline', 20]], 'iv', 30);
  run(b, 20);
  assert.ok(b.vitals.spo2 > 92, 'pulse oximetry is fooled by cyanide');
  assert.ok(b.vitals.consciousness < 30, 'but the subject is already unconscious');
  run(b, 150);
  assert.equal(b.alive, false);
  assert.match(b.deathCause, /asphyxiation|arrest/i);
}));

test('an opioid overdose depresses breathing', withSeed(() => {
  const b = subject();
  give(b, [['morphine', 30]], 'iv', 30);
  run(b, 30);
  assert.ok(b.vitals.rr < 10, `rr ${b.vitals.rr}`);
  assert.ok(b.vitals.consciousness < 40);
}));

test('oral doses absorb slower than intravenous ones', withSeed(() => {
  const a = subject(), b = subject();
  give(a, [['caffeine', 20]], 'iv', 20);
  give(b, [['caffeine', 20]], 'oral', 20);
  run(a, 3); run(b, 3);
  assert.ok((a.effects.stimulant || 0) > (b.effects.stimulant || 0) * 2);
}));

test('drinking boiling liquid burns the stomach', withSeed(() => {
  const b = subject();
  give(b, [['spring_water', 30]], 'oral', 30, { temp: 100 });
  assert.ok(b.organs.stomach.health < 90, `stomach ${b.organs.stomach.health}`);
}));

test('healing repairs damaged organs', withSeed(() => {
  const b = subject();
  b.organs.liver.health = 30;
  b.organs.heart.health = 50;
  give(b, [['troll_sweat', 30]], 'iv', 30);
  run(b, 40);
  assert.ok(b.organs.liver.health > 60, `liver ${b.organs.liver.health}`);
}));

test('defibrillation converts ventricular fibrillation', withSeed(() => {
  const b = subject();
  b.rhythm = 'vfib';
  let ok = false;
  for (let i = 0; i < 6 && !ok; i++) { defibrillate(b); ok = b.rhythm === 'sinus'; }
  assert.ok(ok, 'rhythm restored within a few shocks');
}));

test('medusa scale petrifies the subject into stasis', withSeed(() => {
  const b = subject();
  give(b, [['medusa_scale', 30]], 'iv', 30);
  run(b, 90);
  assert.equal(b.stasis, 'stone');
}));

test('the zombie plague kills and reanimates', withSeed(() => {
  const b = subject();
  infect(b, 'zombie_plague', 'test');
  run(b, 900);
  assert.equal(b.alive, false);
  assert.equal(b.undead, true);
}));

test('growth hormone makes the subject larger', withSeed(() => {
  const b = subject();
  give(b, [['growth_hormone', 30]], 'iv', 30);
  run(b, 15);
  assert.ok(b.size > 1.2, `size ${b.size}`);
}));

test('extreme cold induces cryostasis and the subject can thaw', withSeed(() => {
  const b = subject();
  give(b, [['liquid_nitrogen', 40], ['frost_shard', 20]], 'iv', 60);
  run(b, 60, { ...DEFAULT_ENV, temp: -60 });
  assert.equal(b.stasis, 'cryo');
  run(b, 600, { ...DEFAULT_ENV, temp: 40 });
  assert.equal(b.stasis, null);
}));

test('full restore undoes death', withSeed(() => {
  const b = subject();
  give(b, [['potassium_cyanide', 20]], 'iv', 20);
  run(b, 200);
  assert.equal(b.alive, false);
  fullRestore(b);
  run(b, 10);
  assert.equal(b.alive, true);
  assert.equal(b.doses.length, 0);
}));

test('antimatter contact annihilates the subject', withSeed(() => {
  const b = subject();
  give(b, [['antimatter', 1]], 'oral', 1, { treatments: ['contain'] });
  assert.equal(b.gone, true);
}));
