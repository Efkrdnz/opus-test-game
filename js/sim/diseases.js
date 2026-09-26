// Disease engine: infection, staging, progression, cures and outcomes.
import { DISEASES } from '../data/diseases.js';
import { pushEvent, pushFlash, resolveTissues, damageTissue, getStat, killBody } from './body.js';
import { clamp, chance } from '../util.js';

const INFECTIOUS = new Set(['viral', 'bacterial', 'fungal', 'parasitic']);

export function infect(body, id, source) {
  const def = DISEASES[id];
  if (!def || body.gone) return false;
  if (!body.alive && !body.undead) return false;
  if (body.immunities[id]) {
    pushEvent(body, `${body.name} is immune to ${def.name}.`, 'info');
    return false;
  }
  const existing = body.diseases.find((x) => x.id === id);
  if (existing) {
    existing.progress = Math.min(1, existing.progress + 0.05);
    return false;
  }
  body.diseases.push({ id, progress: 0, incubation: def.incubation || 0, stage: -1, time: 0, source: source || null });
  pushEvent(body, `${body.name} has contracted ${def.name}${source && source !== 'spontaneous' ? ` (from ${source})` : ''}.`, 'disease');
  return true;
}

export function stageIndex(def, progress) {
  let idx = 0;
  for (let i = 0; i < def.stages.length; i++) if (progress >= def.stages[i].at) idx = i;
  return idx;
}

export function infectionLoad(body) {
  let n = 0;
  for (const inst of body.diseases) {
    const def = DISEASES[inst.id];
    if (def && INFECTIOUS.has(def.kind) && inst.incubation <= 0) n += 0.5 + inst.progress;
  }
  return n;
}

// Add current stage effects/symptoms and apply stage damage.
export function applyDiseases(body, E, symptoms, dt) {
  for (const inst of body.diseases) {
    const def = DISEASES[inst.id];
    if (!def) continue;
    inst.time += dt;
    if (inst.incubation > 0) { inst.incubation -= dt; continue; }
    const idx = stageIndex(def, inst.progress);
    const stage = def.stages[idx];
    if (idx !== inst.stage) {
      inst.stage = idx;
      pushEvent(body, `${def.name} — ${stage.name}. ${stage.note || ''}`.trim(), 'disease');
    }
    for (const [e, v] of Object.entries(stage.effects || {})) E[e] = (E[e] || 0) + v;
    for (const s of stage.symptoms || []) symptoms[s] = Math.max(symptoms[s] || 0, 1);
    for (const [k, rate] of Object.entries(stage.damage || {})) {
      for (const t of resolveTissues(body, k)) damageTissue(t, rate * dt);
    }
    for (const [k, rate] of Object.entries(stage.drain || {})) drainStat(body, k, rate * dt);
  }
}

function drainStat(body, key, amt) {
  const v = body.vitals, b = body.blood;
  switch (key) {
    case 'bloodVolume': v.bloodVolume = clamp(v.bloodVolume - amt, 0, 110); break;
    case 'hydration': v.hydration = clamp(v.hydration - amt, 0, 100); break;
    case 'glucose': v.glucose = clamp(v.glucose - amt, 5, 900); break;
    case 'rbc': b.rbc = clamp(b.rbc - amt, 0.3, 8); break;
    case 'wbc': b.wbc = clamp(b.wbc - amt, 0.1, 60); break;
    case 'platelets': b.platelets = clamp(b.platelets - amt, 5, 900); break;
    case 'immune': body.immuneDrain = (body.immuneDrain || 0) + amt; break;
    case 'mana': b.mana = clamp(b.mana - amt, 0, 300); break;
    case 'stamina': for (const m of Object.values(body.muscles)) m.fatigue = clamp(m.fatigue + amt, 0, 100); break;
    default: break;
  }
}

export function progressDiseases(body, E, dt) {
  const survivors = [];
  for (const inst of body.diseases) {
    const def = DISEASES[inst.id];
    if (!def) continue;
    const zombieType = def.outcome.type === 'transform' && def.outcome.transform === 'zombie';
    if (!body.alive && !body.undead && !zombieType) continue; // dies with the host
    if (inst.incubation > 0) { survivors.push(inst); continue; }
    const immuneFactor = clamp(body.immune / 100, 0, 1.5);
    const natural = (1 - immuneFactor * (def.immuneResist || 0) * 1.5) / Math.max(1, def.duration);
    let cure = 0;
    for (const [e, power] of Object.entries(def.cures || {})) cure += power * (E[e] || 0) * 0.02;
    inst.progress += (natural - cure) * dt;
    if (inst.progress <= 0 && inst.time > 4) {
      if (INFECTIOUS.has(def.kind) || def.immunityAfter && def.kind !== 'environmental') {
        if (INFECTIOUS.has(def.kind)) body.immunities[inst.id] = true;
      }
      pushEvent(body, `${body.name} is cured of ${def.name}.`, 'good');
      body.cooldowns[inst.id] = 45;
      continue;
    }
    inst.progress = clamp(inst.progress, 0, 1);
    if (inst.progress >= 1) {
      const o = def.outcome;
      if (o.type === 'chronic') { survivors.push(inst); continue; }
      if (o.type === 'recover') {
        if (INFECTIOUS.has(def.kind)) body.immunities[inst.id] = true;
        pushEvent(body, `${body.name} has recovered from ${def.name}.`, 'good');
        body.cooldowns[inst.id] = 45;
        continue;
      }
      if (o.type === 'death') { killBody(body, o.cause || `Succumbed to ${def.name}`); continue; }
      if (o.type === 'erase') { killBody(body, o.cause || 'Erased from existence', { gone: true, kind: 'erased' }); continue; }
      if (o.type === 'ascend') { killBody(body, o.cause || 'Ascended', { gone: true, kind: 'ascended' }); continue; }
      if (o.type === 'transform') {
        const t = o.transform;
        if (t === 'zombie') {
          body.transform.zombie = 1;
          if (body.alive) killBody(body, `Killed by ${def.name}`);
          body.reanimate = 4;
        } else {
          body.transform[t] = 1;
          pushEvent(body, `${def.name} has run its course: ${body.name} is transformed.`, 'mutation');
          pushFlash(body, 'transform', { id: t });
        }
        continue;
      }
    }
    survivors.push(inst);
  }
  body.diseases = survivors;
}

// Spontaneous onset (checked once per second).
export function checkTriggers(body, E) {
  if (!body.alive) return;
  for (const k of Object.keys(body.cooldowns)) if ((body.cooldowns[k] -= 1) <= 0) delete body.cooldowns[k];
  for (const [id, def] of Object.entries(DISEASES)) {
    if (!def.triggers || !def.triggers.length) continue;
    if (body.diseases.some((d) => d.id === id)) continue;
    if (body.immunities[id] || body.cooldowns[id]) continue;
    for (const t of def.triggers) {
      const v = t.stat ? getStat(body, t.stat) : (E[t.effect] || 0);
      const ok = t.op === '<' ? v < t.value : v > t.value;
      if (ok && chance(t.chance === undefined ? 0.1 : t.chance)) { infect(body, id, 'spontaneous'); break; }
    }
  }
}

export function cureAllDiseases(body) {
  body.diseases = [];
}

export function diseaseDef(id) { return DISEASES[id]; }
