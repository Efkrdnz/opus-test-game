import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brewMixture } from '../js/sim/mixer.js';
import { RECIPES } from '../js/data/recipes.js';
import { INDEX, brew, seedRandom } from './helpers.mjs';

test('empty flask cannot be brewed', () => {
  const r = brewMixture([], { temp: null, stir: 'gentle', time: 'minute', treatments: [] }, INDEX, RECIPES);
  assert.equal(r.ok, false);
});

test('effects are concentration-weighted', () => {
  const pure = brew([['caffeine', 10]]);
  const diluted = brew([['caffeine', 10], ['saline', 30]]);
  assert.ok(diluted.effects.stimulant < pure.effects.stimulant * 0.35, 'diluting 1:4 should cut stimulant to about a quarter');
  assert.equal(diluted.volume, 40);
});

test('acid and alkali neutralise and warm', () => {
  const acid = brew([['sulfuric_acid', 10]]);
  const lye = brew([['sodium_hydroxide', 10]]);
  const m = brew([['sulfuric_acid', 10], ['sodium_hydroxide', 10]]);
  assert.ok(m.ph > acid.ph && m.ph < lye.ph, `pH ${m.ph} should lie between ${acid.ph} and ${lye.ph}`);
  assert.ok(m.temperature > Math.max(acid.temperature, lye.temperature), 'neutralisation releases heat');
  assert.ok(m.reactions.some((r) => r.name === 'Neutralization'));
  // a titrated amount lands near neutral
  const t = brew([['sulfuric_acid', 30], ['sodium_hydroxide', 9.5]]);
  assert.ok(t.ph > 1.5 && t.ph < 12.5, `titrated pH ${t.ph}`);
});

test('fire and ice cancel out', () => {
  const m = brew([['fire_essence', 10], ['frost_shard', 10]]);
  assert.ok(m.reactions.some((r) => r.name === 'Thermal Annihilation'));
  assert.ok(!((m.effects.heat || 0) > 0.5 && (m.effects.cold || 0) > 0.5), 'heat and cold should not both survive at strength');
});

test('burner sterilises pathogen cultures', () => {
  const cold = brew([['influenza_culture', 10]]);
  const boiled = brew([['influenza_culture', 10]], { temp: 150 });
  assert.ok(Object.keys(cold.infections).length > 0);
  assert.equal(Object.keys(boiled.infections).length, 0);
});

test('antimatter without containment annihilates the bench; with it, it does not', () => {
  const restore = seedRandom(7);
  try {
    const bad = brewMixture([{ id: 'antimatter', ml: 5 }], { temp: null, stir: 'gentle', time: 'minute', treatments: [] }, INDEX, RECIPES);
    assert.equal(bad.exploded, true);
    const ok = brewMixture([{ id: 'antimatter', ml: 5 }], { temp: null, stir: 'none', time: 'minute', treatments: ['contain'] }, INDEX, RECIPES);
    assert.equal(ok.ok, true);
    assert.ok(ok.mixture.antimatter);
  } finally { restore(); }
});

test('every named recipe can actually be brewed', () => {
  const restore = seedRandom(99);
  const orig = Math.random;
  Math.random = () => 0.999; // no stray explosions for this check
  try {
    for (const r of RECIPES) {
      const p = r.process || {};
      let temp = null;
      if (p.minTemp !== undefined && p.maxTemp !== undefined) temp = Math.round((p.minTemp + p.maxTemp) / 2);
      else if (p.minTemp !== undefined) temp = p.minTemp + 10;
      else if (p.maxTemp !== undefined) temp = Math.min(p.maxTemp - 5, 20);
      const res = brewMixture(r.ingredients.map((id) => ({ id, ml: 10 })), {
        temp, stir: p.stir || 'gentle', time: p.time || 'minute', treatments: [...(p.treatments || []), 'contain'],
      }, INDEX, RECIPES);
      assert.ok(res.ok, `${r.id} failed to brew: ${res.error}`);
      assert.equal(res.mixture.recipe, r.id, `${r.id} brewed as ${res.mixture.recipe}`);
    }
  } finally { Math.random = orig; restore(); }
});
