import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBSTANCES } from '../js/data/substances.js';
import { RECIPES } from '../js/data/recipes.js';
import { DISEASES } from '../js/data/diseases.js';
import { SPEECH } from '../js/data/speech.js';
import {
  TAGS, EFFECTS, SYMPTOMS, STATS, DISEASE_IDS, DISEASE_KINDS, DRAIN_KEYS, TRANSFORMS, MUTATIONS,
  ORGANS, BRAIN_REGIONS, NERVE_REGIONS, MUSCLES, BONES, CATEGORIES, STATES,
} from '../js/data/vocab.js';
import { TREATMENTS, STIR_MODES, BREW_TIMES } from '../js/sim/mixer.js';

test('substances reference only declared vocabulary', () => {
  const ids = new Set();
  for (const s of SUBSTANCES) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.ok(CATEGORIES[s.category], `${s.id} category`);
    assert.ok(STATES.includes(s.state), `${s.id} state`);
    for (const t of s.tags) assert.ok(TAGS[t], `${s.id} tag ${t}`);
    for (const e of Object.keys(s.effects)) assert.ok(EFFECTS[e], `${s.id} effect ${e}`);
    for (const d of Object.keys(s.infections || {})) assert.ok(DISEASE_IDS.includes(d), `${s.id} disease ${d}`);
    for (const m of Object.keys(s.grants || {})) assert.ok(MUTATIONS[m], `${s.id} mutation ${m}`);
    for (const k of ['name', 'icon', 'color', 'desc', 'halfLife', 'stability', 'temperature', 'ph', 'rarity']) assert.notEqual(s[k], undefined, `${s.id} missing ${k}`);
  }
  assert.ok(SUBSTANCES.length >= 100, 'at least 100 substances');
});

test('every category is stocked and every effect is obtainable', () => {
  for (const c of Object.keys(CATEGORIES)) assert.ok(SUBSTANCES.some((s) => s.category === c), `category ${c} empty`);
  const used = new Set(SUBSTANCES.flatMap((s) => Object.keys(s.effects)));
  for (const e of Object.keys(EFFECTS)) assert.ok(used.has(e), `effect ${e} never produced by any substance`);
});

test('recipes use real ingredients and valid processes', () => {
  const ids = new Set(SUBSTANCES.map((s) => s.id));
  for (const r of RECIPES) {
    for (const i of r.ingredients) assert.ok(ids.has(i), `${r.id} ingredient ${i}`);
    for (const e of Object.keys(r.bonusEffects)) assert.ok(EFFECTS[e], `${r.id} effect ${e}`);
    const p = r.process || {};
    for (const t of p.treatments || []) assert.ok(TREATMENTS[t], `${r.id} treatment ${t}`);
    if (p.stir) assert.ok(STIR_MODES[p.stir], `${r.id} stir ${p.stir}`);
    if (p.time) assert.ok(BREW_TIMES[p.time], `${r.id} time ${p.time}`);
    if (p.minTemp !== undefined && p.maxTemp !== undefined) assert.ok(p.minTemp <= p.maxTemp, `${r.id} temperature window`);
    assert.ok(r.hint && r.desc, `${r.id} needs hint and desc`);
  }
});

test('diseases are complete and well-formed', () => {
  const okDamage = (k) => ORGANS[k] || ['lungs', 'kidneys', 'nerves', 'muscles', 'bones'].includes(k)
    || (k.startsWith('brain.') && BRAIN_REGIONS[k.slice(6)]) || (k.startsWith('nerve.') && NERVE_REGIONS[k.slice(6)])
    || (k.startsWith('muscle.') && MUSCLES[k.slice(7)]) || (k.startsWith('bone.') && BONES[k.slice(5)]);
  for (const id of DISEASE_IDS) assert.ok(DISEASES[id], `missing disease ${id}`);
  for (const [id, d] of Object.entries(DISEASES)) {
    assert.ok(DISEASE_IDS.includes(id), `undeclared disease ${id}`);
    assert.ok(DISEASE_KINDS.includes(d.kind), `${id} kind`);
    assert.equal(d.stages[0].at, 0, `${id} first stage`);
    for (const e of Object.keys(d.cures)) assert.ok(EFFECTS[e], `${id} cure ${e}`);
    for (const t of d.triggers || []) {
      if (t.stat) assert.ok(STATS[t.stat], `${id} trigger stat ${t.stat}`);
      if (t.effect) assert.ok(EFFECTS[t.effect], `${id} trigger effect ${t.effect}`);
    }
    for (const s of d.stages) {
      for (const e of Object.keys(s.effects || {})) assert.ok(EFFECTS[e], `${id} stage effect ${e}`);
      for (const y of s.symptoms || []) assert.ok(SYMPTOMS[y], `${id} symptom ${y}`);
      for (const k of Object.keys(s.damage || {})) assert.ok(okDamage(k), `${id} damage key ${k}`);
      for (const k of Object.keys(s.drain || {})) assert.ok(DRAIN_KEYS.includes(k), `${id} drain ${k}`);
    }
    if (d.outcome.type === 'transform') assert.ok(TRANSFORMS[d.outcome.transform], `${id} transform`);
  }
});

test('speech covers every mood the behaviour system asks for', () => {
  const keys = 'idle happy pain critical sick nausea fear rage calm euphoric hallucinating drunk sleepy smart dumb amnesia love laughter truth thoughts cold hot burning frozen giant tiny levitating invisible glowing ghost stone crystal metal gold elastic divine mana time teleport mutated werewolf vampire zombie chaos strong fast weak blind obey refuse confused unable revived greet monologue photosynthesis fireBreath paralyzed bleeding radiation heavy'.split(' ');
  for (const k of keys) assert.ok(Array.isArray(SPEECH[k]) && SPEECH[k].length >= 5, `speech ${k}`);
});
