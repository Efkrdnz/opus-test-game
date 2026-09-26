// The alchemy bench: turns a list of ingredients + process settings into a Mixture.
import { EFFECTS } from '../data/vocab.js';
import { blendColors, clamp, uid, pick, rand } from '../util.js';

export const TREATMENTS = {
  distill:    { name: 'Distill',     icon: '⚗️', desc: 'Concentrates the mixture: half the volume, stronger effects. Gases boil away.' },
  centrifuge: { name: 'Centrifuge',  icon: '🌀', desc: 'Separates layers: the strongest effect is purified, faint traces are discarded.' },
  filter:     { name: 'Filter',      icon: '🧻', desc: 'Strains out solids, some toxicity and most pathogens.' },
  irradiate:  { name: 'Irradiate',   icon: '☢️', desc: 'Bombards with gamma rays: sterilises, but adds radiation and mutagenic potential.' },
  electrify:  { name: 'Electrify',   icon: '⚡', desc: 'Runs a current through it. Activates machines; can spark life into dead matter.' },
  enchant:    { name: 'Enchant',     icon: '✨', desc: 'Infuses mana. Mythical and arcane ingredients grow stronger.' },
  bless:      { name: 'Bless',       icon: '🕊️', desc: 'Sanctifies the mixture. Adds purity, weakens the unholy.' },
  curse:      { name: 'Curse',       icon: '💀', desc: 'Profanes the mixture. Adds necrosis, strengthens death and shadow.' },
  moonlight:  { name: 'Moonlight',   icon: '🌕', desc: 'Leaves it under a full moon. Beasts and dreams stir.' },
  carbonate:  { name: 'Carbonate',   icon: '🫧', desc: 'Adds fizz. Absorbed faster, slightly giddy.' },
  contain:    { name: 'Magnetic Containment', icon: '🧲', desc: 'Suspends the mixture in a magnetic field. Almost nothing can explode in here.' },
  quantum:    { name: 'Quantum Entangle', icon: '🎲', desc: 'Entangles the mixture with a random universe. Effects get shuffled.' },
};

export const STIR_MODES = {
  none:     { name: 'Unstirred', potency: 0.85, risk: 0.5 },
  gentle:   { name: 'Gentle',    potency: 1.0,  risk: 0.8 },
  vigorous: { name: 'Vigorous',  potency: 1.05, risk: 1.3 },
  vortex:   { name: 'Vortex',    potency: 1.1,  risk: 1.8 },
};

export const BREW_TIMES = {
  instant: { name: 'Instant',  potency: 0.9 },
  minute:  { name: '1 minute', potency: 1.0 },
  hour:    { name: '1 hour',   potency: 1.05 },
  day:     { name: '1 day',    potency: 1.1 },
  year:    { name: '1 year',   potency: 1.15 },
};

export const VESSEL_CAPACITY = 500;

const NAMED_COLORS = [
  ['Crimson', '#b0182c'], ['Scarlet', '#e8321e'], ['Amber', '#e89a1a'], ['Golden', '#e8c31a'],
  ['Lime', '#9fe81a'], ['Emerald', '#1ab85a'], ['Teal', '#1aa8a0'], ['Azure', '#1a8ae8'],
  ['Cobalt', '#1a3ab8'], ['Violet', '#7a2ae8'], ['Magenta', '#d81ab0'], ['Rose', '#f07aa8'],
  ['Ivory', '#f0ead8'], ['Ashen', '#8a8a8a'], ['Obsidian', '#1e1a24'], ['Umber', '#6a4a2a'],
  ['Pearl', '#e8f0f8'], ['Jade', '#5ab88a'], ['Rust', '#a0481e'], ['Bruised', '#4a2a5a'],
];

function colorName(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let best = NAMED_COLORS[0][0], bd = Infinity;
  for (const [name, h] of NAMED_COLORS) {
    const m = parseInt(h.slice(1), 16);
    const d = (r - ((m >> 16) & 255)) ** 2 + (g - ((m >> 8) & 255)) ** 2 + (b - (m & 255)) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

const STATE_NOUNS = {
  liquid: ['Draught', 'Tincture', 'Tonic', 'Elixir', 'Philtre', 'Solution'],
  powder: ['Powder', 'Dust', 'Grounds'],
  gas: ['Vapour', 'Fume', 'Miasma'],
  crystal: ['Crystals', 'Salts', 'Shards'],
  plasma: ['Plasma', 'Flux'],
  ethereal: ['Essence', 'Spirit', 'Wisp'],
  goo: ['Ooze', 'Gel', 'Sludge', 'Slurry'],
  solid: ['Lump', 'Paste', 'Brick'],
};

// ---------------------------------------------------------------------------
// Reaction rules. Each looks at the working mix and may change it.
// `w(tag)` = volume fraction of ingredients carrying that tag.
// ---------------------------------------------------------------------------
const REACTIONS = [
  {
    name: 'Thermal Annihilation',
    test: (m) => m.w('fire') > 0.05 && m.w('ice') > 0.05,
    run: (m) => {
      const cancel = Math.min(m.E.heat || 0, m.E.cold || 0);
      m.E.heat = (m.E.heat || 0) - cancel; m.E.cold = (m.E.cold || 0) - cancel;
      m.stability -= 0.1;
      return 'Fire and ice cancel each other out in a hiss of steam.';
    },
  },
  {
    name: 'Quenching',
    test: (m) => m.w('fire') > 0.05 && m.w('water') > 0.15 && m.w('ice') < 0.05,
    run: (m) => { if (m.E.heat) m.E.heat *= 0.6; m.temp = Math.min(m.temp, 100); return 'Water quenches the flames; the flask steams.'; },
  },
  {
    name: 'Violent Hydrolysis',
    test: (m) => m.has('sodium_metal') && m.w('water') > 0.05,
    run: (m) => {
      m.stability -= 0.45; m.temp += 250; m.E.explosive = (m.E.explosive || 0) + 1.5; m.E.corrosive = (m.E.corrosive || 0) + 0.8;
      return 'The alkali metal meets water and erupts. Hydrogen fire and caustic spray.';
    },
  },
  {
    name: 'Neutralization',
    test: (m) => m.acidPower > 0.002 && m.basePower > 0.002,
    run: (m) => {
      const heat = Math.min(m.acidPower, m.basePower);
      m.temp += clamp(heat * 400, 5, 80);
      if (m.E.corrosive) m.E.corrosive *= 0.3;
      return 'Acid meets alkali. The mixture neutralises and warms, fizzing into salt water.';
    },
  },
  {
    name: 'Life–Death Paradox',
    test: (m) => m.w('life') > 0.08 && m.w('death') > 0.08,
    run: (m) => {
      const life = m.w('life'), death = m.w('death');
      if (death > life) {
        m.E.undeath = (m.E.undeath || 0) + (death - life) * 3 + 0.4;
        if (m.E.healing) m.E.healing *= 0.4;
        return 'Death overwhelms life. The mixture twitches on its own. Something undead stirs within.';
      }
      if (m.E.necrotic) m.E.necrotic *= 0.3;
      m.E.resurrection = (m.E.resurrection || 0) + (life - death) * 1.5 + 0.2;
      return 'Life triumphs over death. A faint heartbeat pulses through the flask.';
    },
  },
  {
    name: 'Twilight Fusion',
    test: (m) => m.w('light') > 0.08 && m.w('shadow') > 0.08,
    run: (m) => {
      m.E.invisibility = (m.E.invisibility || 0) + 1.2 * Math.min(m.w('light'), m.w('shadow')) * 4;
      if (m.E.glow) m.E.glow *= 0.3;
      return 'Light and shadow braid together. The flask seems to vanish from sight.';
    },
  },
  {
    name: 'Sanctity Clash',
    test: (m) => m.w('holy') > 0.05 && m.w('unholy') > 0.05,
    run: (m) => {
      const c = Math.min(m.E.purify || 0, m.E.necrotic || 0);
      m.E.purify = (m.E.purify || 0) - c * 0.8; m.E.necrotic = (m.E.necrotic || 0) - c * 0.8;
      m.stability -= 0.15; m.E.glow = (m.E.glow || 0) + 0.6;
      return 'Holy and unholy clash in a flash of white light. Both weaken.';
    },
  },
  {
    name: 'Arcane Collapse',
    test: (m) => m.w('arcane') > 0.08 && m.w('void') > 0.08,
    run: (m) => {
      m.E.mana = (m.E.mana || 0) * 0.3; m.stability -= 0.2;
      m.E.ethereal = (m.E.ethereal || 0) + 0.6; m.E.teleport = (m.E.teleport || 0) + 0.4;
      return 'The void swallows the mana. Space inside the flask folds.';
    },
  },
  {
    name: 'Conduction',
    test: (m) => m.w('lightning') > 0.05 && (m.w('water') > 0.1 || m.w('metal') > 0.1),
    run: (m) => { m.E.electric = (m.E.electric || 0) * 1.5 + 0.2; return 'The charge races through the conductive mix. Sparks dance on the surface.'; },
  },
  {
    name: 'Nanite Activation',
    test: (m) => m.w('tech') > 0.05 && (m.w('lightning') > 0.03 || m.treat('electrify')),
    run: (m) => { m.scaleTag('tech', 2); return 'The nanites wake up and begin swarming in formation.'; },
  },
  {
    name: 'Galvanic Reanimation',
    test: (m) => m.treat('electrify') && m.w('life') > 0.05 && (m.w('death') > 0.03 || m.w('blood') > 0.05),
    run: (m) => { m.E.resurrection = (m.E.resurrection || 0) + 1.2; return 'Lightning courses through life and blood. It\'s alive!'; },
  },
  {
    name: 'Mutagenic Cascade',
    test: (m) => m.w('radioactive') > 0.03 && (m.E.mutagen || 0) > 0.1,
    run: (m) => { m.E.mutagen *= 2; m.E.radiation = (m.E.radiation || 0) * 1.2; return 'Radiation catalyses the mutagen. The liquid bubbles and changes colour on its own.'; },
  },
  {
    name: 'Temporal Paradox',
    test: (m) => m.w('time') > 0.05 && (m.w('void') > 0.05 || m.w('chaos') > 0.05),
    run: (m) => {
      m.E.chaos = (m.E.chaos || 0) + 1; m.E.aging = (m.E.aging || 0) + rand(-0.5, 0.8); m.E.youth = (m.E.youth || 0) + rand(-0.3, 0.8);
      m.stability -= 0.2;
      return 'The mixture is somehow both finished and not yet started. A temporal paradox.';
    },
  },
  {
    name: 'Venom Neutralization',
    test: (m) => m.w('venom') > 0.03 && (m.w('antidote') > 0.05 || m.has('unicorn_horn')),
    run: (m) => {
      for (const k of ['neurotoxin', 'cardiotoxin', 'hemorrhage', 'poison', 'paralysis', 'petrify']) if (m.E[k]) m.E[k] *= 0.25;
      return 'The antidote binds the venom. Its bite is drawn.';
    },
  },
  {
    name: 'Deadly Synergy',
    test: (m) => m.w('alcohol') > 0.05 && (m.w('sedative') > 0.03 || m.w('opioid') > 0.03),
    run: (m) => { if (m.E.sedative) m.E.sedative *= 1.6; return 'Alcohol potentiates the sedatives. A dangerously strong combination.'; },
  },
  {
    name: 'Speedball',
    test: (m) => m.w('stimulant') > 0.03 && (m.w('sedative') > 0.03 || m.w('opioid') > 0.03),
    run: (m) => { m.E.cardiotoxin = (m.E.cardiotoxin || 0) + 0.4; return 'Uppers and downers fight each other. The heart will pay for it.'; },
  },
  {
    name: 'Size Oscillation',
    test: (m) => (m.E.growth || 0) > 0.2 && (m.E.shrink || 0) > 0.2,
    run: (m) => { m.E.chaos = (m.E.chaos || 0) + 0.5; return 'Growth and shrinking pull against each other. The subject will pulse in size.'; },
  },
  {
    name: 'Cosmic Resonance',
    test: (m) => m.w('cosmic') > 0.1,
    run: (m) => { m.scaleAll(1 + m.w('cosmic') * 0.5); return 'Starlight resonates through every ingredient, amplifying them all.'; },
  },
  {
    name: 'Fermentation',
    test: (m) => m.time === 'day' || m.time === 'year' ? (m.w('sugar') > 0.05 || m.w('nature') > 0.1) : false,
    run: (m) => {
      m.E.intoxication = (m.E.intoxication || 0) + (m.time === 'year' ? 1.6 : 0.8) * Math.max(m.w('sugar'), m.w('nature'));
      return 'Left to sit, the sugars ferment. The mixture is now alcoholic.';
    },
  },
  {
    name: 'Radioactive Decay',
    test: (m) => m.time === 'year' && m.w('radioactive') > 0.03,
    run: (m) => { if (m.E.radiation) m.E.radiation *= 0.7; return 'A year of decay has weakened the isotopes.'; },
  },
  {
    name: 'Crystallization',
    test: (m) => m.w('crystal') > 0.1 && m.temp < -20,
    run: (m) => { m.E.crystallize = (m.E.crystallize || 0) + 0.5; m.state = 'crystal'; return 'The cold forces the solution to crystallise into glittering shards.'; },
  },
  {
    name: 'Dragonfire',
    test: (m) => m.w('fire') > 0.1 && m.w('beast') > 0.05 && m.temp > 150,
    run: (m) => { m.E.fireBreath = (m.E.fireBreath || 0) + 0.8; return 'The beast essence takes the fire into itself. The flask breathes flame.'; },
  },
  {
    name: 'Blood Pact',
    test: (m) => m.w('blood') > 0.1 && m.w('unholy') > 0.05,
    run: (m) => { m.E.vampirism = (m.E.vampirism || 0) + 0.8; return 'The blood darkens and thickens. It hungers.'; },
  },
  {
    name: 'Psychic Bloom',
    test: (m) => m.w('psychic') > 0.05 && (m.w('psychedelic') > 0.03 || m.w('dream') > 0.05),
    run: (m) => { m.E.telepathy = (m.E.telepathy || 0) + 0.8; return 'Thoughts start leaking out of the flask as faint whispers.'; },
  },
];

// Recipe matching ---------------------------------------------------------
function recipeMatches(recipe, present, ctx) {
  for (const id of recipe.ingredients) if (!present.has(id)) return false;
  const p = recipe.process;
  if (!p) return true;
  if (p.minTemp !== undefined && ctx.temp < p.minTemp) return false;
  if (p.maxTemp !== undefined && ctx.temp > p.maxTemp) return false;
  if (p.stir && ctx.stir !== p.stir) return false;
  if (p.time && ctx.time !== p.time) return false;
  if (p.treatments) for (const t of p.treatments) if (!ctx.treatments.includes(t)) return false;
  return true;
}

/**
 * Brew a mixture.
 * @param {Array<{id:string, ml:number}>} ingredients
 * @param {{temp:number|null, stir:string, time:string, treatments:string[]}} process
 * @param {Object<string,object>} substanceIndex id -> substance
 * @param {Array} recipes
 */
export function brewMixture(ingredients, process, substanceIndex, recipes) {
  const log = [];
  const items = ingredients.filter((i) => i.ml > 0 && substanceIndex[i.id]).map((i) => ({ ...i, s: substanceIndex[i.id] }));
  const total = items.reduce((a, i) => a + i.ml, 0);
  if (!items.length || total <= 0) return { ok: false, error: 'The flask is empty. Add at least one ingredient.' };
  const treatments = process.treatments || [];
  const stir = process.stir || 'gentle';
  const time = process.time || 'minute';

  // --- base blend ---------------------------------------------------------------
  const frac = (i) => i.ml / total;
  const tagW = {};
  for (const i of items) for (const t of i.s.tags) tagW[t] = (tagW[t] || 0) + frac(i);

  // catalysts
  const amp = (target) => {
    let f = 1;
    for (const c of items) {
      if (!c.s.amplify || c === target) continue;
      if (c.s.amplifyTag && !target.s.tags.includes(c.s.amplifyTag)) continue;
      f *= 1 + (c.s.amplify - 1) * Math.min(1, frac(c) * 6);
    }
    return f;
  };

  const E = {};
  const infections = {};
  const grants = {};
  const contributions = new Map(); // item -> {effectId: value}
  for (const i of items) {
    const f = frac(i) * amp(i);
    const c = {};
    for (const [e, v] of Object.entries(i.s.effects)) { c[e] = v * f; E[e] = (E[e] || 0) + v * f; }
    contributions.set(i, c);
    for (const [d, p] of Object.entries(i.s.infections || {})) infections[d] = (infections[d] || 0) + p * frac(i);
    for (const [g, p] of Object.entries(i.s.grants || {})) grants[g] = (grants[g] || 0) + p * frac(i);
  }

  let temp = process.temp === null || process.temp === undefined
    ? items.reduce((a, i) => a + i.s.temperature * frac(i), 0)
    : process.temp;
  // clamp natural temperature of mixing extremes (plasma cools into the rest)
  if (process.temp === null || process.temp === undefined) temp = clamp(temp, -200, 5000);

  // pH via H+/OH- balance
  let h = 0, oh = 0, acidPower = 0, basePower = 0;
  for (const i of items) {
    const ph = i.s.ph;
    h += frac(i) * 10 ** -ph; oh += frac(i) * 10 ** (ph - 14);
    if (ph < 5) acidPower += frac(i) * (5 - ph) / 5;
    if (ph > 9) basePower += frac(i) * (ph - 9) / 5;
  }
  const net = h - oh;
  let ph = Math.abs(net) < 1e-7 ? 7 : net > 0 ? -Math.log10(net) : 14 + Math.log10(-net);
  ph = clamp(ph, 0, 14);

  const weightedStab = items.reduce((a, i) => a + i.s.stability * frac(i), 0);
  const minStab = Math.min(...items.filter((i) => frac(i) > 0.02).map((i) => i.s.stability));
  let stability = weightedStab * 0.6 + minStab * 0.4;
  const halfLife = items.reduce((a, i) => a + i.s.halfLife * frac(i), 0);

  // dominant state
  const stateW = {};
  for (const i of items) stateW[i.s.state] = (stateW[i.s.state] || 0) + frac(i);
  let state = Object.entries(stateW).sort((a, b) => b[1] - a[1])[0][0];

  const color = blendColors(items.map((i) => [i.s.color, i.ml]));
  const glowList = items.filter((i) => i.s.glowColor).map((i) => [i.s.glowColor, i.ml]);
  let glowColor = glowList.length ? blendColors(glowList) : null;
  let volume = total;
  let absorb = 1;

  const present = new Set(items.map((i) => i.id));
  const m = {
    E, temp, stability, state, time, acidPower, basePower,
    w: (t) => tagW[t] || 0,
    has: (id) => present.has(id),
    treat: (t) => treatments.includes(t),
    scaleAll: (f) => { for (const k in E) E[k] *= f; },
    scaleTag: (tag, f) => {
      for (const i of items) {
        if (!i.s.tags.includes(tag)) continue;
        for (const [e, v] of Object.entries(contributions.get(i))) E[e] += v * (f - 1);
      }
    },
  };

  // --- heat processing --------------------------------------------------------------
  if (m.temp > 70) {
    const organic = ['life', 'beast', 'blood', 'nature'];
    for (const i of items) {
      if (!i.s.tags.some((t) => organic.includes(t))) continue;
      const f = m.temp > 300 ? 0.4 : 0.7;
      for (const [e, v] of Object.entries(contributions.get(i))) E[e] -= v * (1 - f);
    }
    const kill = m.temp > 120 ? 0 : 0.3;
    let sterilised = false;
    for (const d in infections) { if (infections[d] > 0) sterilised = true; infections[d] *= kill; }
    log.push(`Heated to ${Math.round(m.temp)}°C. Organic compounds partially denature${sterilised ? '; pathogens are ' + (kill === 0 ? 'sterilised' : 'mostly killed') : ''}.`);
    if (m.temp > 200 && m.w('fire') > 0) { m.scaleTag('fire', 1.25); }
  }
  if (m.temp < -50) {
    m.scaleTag('ice', 1.2);
    log.push(`Chilled to ${Math.round(m.temp)}°C. Cold-aspected ingredients sharpen.`);
  }

  // --- stir & time -----------------------------------------------------------------
  m.scaleAll(STIR_MODES[stir].potency * BREW_TIMES[time].potency);
  if (time === 'hour' || time === 'day' || time === 'year') {
    const loss = time === 'hour' ? 0.3 : time === 'day' ? 0.6 : 0.9;
    for (const i of items) {
      if (i.s.state !== 'gas' && !i.s.tags.includes('volatile')) continue;
      for (const [e, v] of Object.entries(contributions.get(i))) E[e] -= v * loss;
      volume -= i.ml * loss;
    }
  }
  if (time === 'year') {
    for (const d in infections) infections[d] *= 0.2;
    m.stability = Math.min(1, m.stability + 0.1);
  }

  // --- treatments -------------------------------------------------------------------
  const add = (e, v) => { E[e] = (E[e] || 0) + v; };
  if (m.treat('distill')) {
    for (const i of items) if (i.s.state === 'gas') for (const [e, v] of Object.entries(contributions.get(i))) E[e] -= v * 0.6;
    m.scaleAll(1.5); volume *= 0.5; m.stability -= 0.05; state = state === 'powder' || state === 'solid' ? 'liquid' : state;
    log.push('Distilled: volume halved, effects concentrated.');
  }
  if (m.treat('centrifuge')) {
    const entries = Object.entries(E).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length) {
      E[entries[0][0]] *= 1.35;
      for (const [e, v] of entries.slice(1)) if (v < 0.15) E[e] = 0; else E[e] *= 0.9;
    }
    log.push('Centrifuged: the dominant compound is purified, traces discarded.');
  }
  if (m.treat('filter')) {
    for (const [e, v] of Object.entries(E)) if (EFFECTS[e]?.bad) E[e] = v * 0.8;
    for (const d in infections) infections[d] *= 0.3;
    for (const i of items) if (i.s.state === 'powder' || i.s.state === 'solid') for (const [e, v] of Object.entries(contributions.get(i))) E[e] -= v * 0.4;
    log.push('Filtered: solids and most microbes removed.');
  }
  if (m.treat('irradiate')) {
    add('radiation', 0.5); add('mutagen', 0.3); m.scaleTag('radioactive', 1.3);
    for (const d in infections) infections[d] *= 0.2;
    log.push('Irradiated: sterile, but faintly radioactive now.');
  }
  if (m.treat('electrify')) { add('electric', 0.5); m.stability -= 0.1; log.push('Electrified: the mixture hums with current.'); }
  if (m.treat('enchant')) {
    add('mana', 0.6); add('glow', 0.2); m.scaleTag('arcane', 1.3);
    for (const i of items) if (i.s.category === 'mythical') for (const [e, v] of Object.entries(contributions.get(i))) E[e] += v * 0.3;
    glowColor = glowColor || '#b36bff';
    log.push('Enchanted: arcane energy saturates the mixture.');
  }
  if (m.treat('bless')) {
    add('purify', 0.8); m.scaleTag('holy', 1.3);
    for (const k of ['undeath', 'necrotic', 'vampirism', 'lycanthropy']) if (E[k]) E[k] *= 0.3;
    m.scaleTag('unholy', 0.5);
    log.push('Blessed: the mixture glows with a faint warm light.');
  }
  if (m.treat('curse')) {
    add('necrotic', 0.5); add('undeath', 0.2); m.scaleTag('unholy', 1.3); m.scaleTag('death', 1.3);
    if (E.healing) E.healing *= 0.6;
    add(pick(['fear', 'weakness', 'nausea', 'amnesia', 'blindness']), 0.4);
    log.push('Cursed: the mixture darkens and something whispers from inside.');
  }
  if (m.treat('moonlight')) {
    if (E.lycanthropy) E.lycanthropy *= 2;
    if (m.w('beast') > 0) add('lycanthropy', 0.3);
    m.scaleTag('dream', 1.3); m.scaleTag('shadow', 1.2); add('glow', 0.15); add('sleep', 0.2);
    glowColor = glowColor || '#dfe8ff';
    log.push('Moonlit: silver light settles into the liquid.');
  }
  if (m.treat('carbonate')) { absorb = 1.6; add('euphoria', 0.1); if (state === 'powder') state = 'liquid'; log.push('Carbonated: fizzy, and it will hit faster.'); }
  if (m.treat('quantum')) {
    const keys = Object.keys(E).filter((k) => E[k] > 0.05);
    const vals = keys.map((k) => E[k]).sort(() => Math.random() - 0.5);
    keys.forEach((k, i) => { E[k] = vals[i]; });
    add('chaos', 0.8); add('teleport', 0.3); m.stability -= 0.15;
    log.push('Quantum-entangled: effects reshuffled across realities.');
  }

  // --- reactions ------------------------------------------------------------------------
  const reactions = [];
  for (const r of REACTIONS) {
    if (!r.test(m)) continue;
    const text = r.run(m);
    reactions.push({ name: r.name, text });
  }

  // --- recipes ---------------------------------------------------------------------------
  let recipe = null;
  const ctx = { temp: m.temp, stir, time, treatments };
  for (const r of recipes || []) {
    if (!recipeMatches(r, present, ctx)) continue;
    if (!recipe || r.ingredients.length > recipe.ingredients.length) recipe = r;
  }
  let finalColor = color;
  if (recipe) {
    for (const [e, v] of Object.entries(recipe.bonusEffects)) add(e, v);
    if (recipe.color) finalColor = recipe.color;
    if (recipe.stability !== undefined) m.stability = recipe.stability;
  }

  // containment last so nothing undoes it
  stability = clamp(m.stability, 0, 1);
  if (m.treat('contain')) stability = Math.max(stability, 0.95);
  temp = m.temp;
  if (m.state !== state && m.state === 'crystal') state = 'crystal';

  // physical state from temperature (only when the burner forces a temperature;
  // at their natural temperature ingredients keep their own states)
  const heated = process.temp !== null && process.temp !== undefined;
  if (temp >= 3000) state = 'plasma';
  else if (heated && temp > 150 && state === 'liquid') state = 'gas';
  else if (heated && temp < -30 && (state === 'liquid' || state === 'goo')) state = 'solid';

  // clean effects
  for (const k of Object.keys(E)) { E[k] = Math.round(E[k] * 1000) / 1000; if (E[k] <= 0.01) delete E[k]; }
  for (const k of Object.keys(infections)) if (infections[k] < 0.005) delete infections[k];
  for (const k of Object.keys(grants)) if (grants[k] < 0.005) delete grants[k];
  if (E.glow && !glowColor) glowColor = finalColor;

  // --- explosion check ---------------------------------------------------------------
  const hasAntimatter = items.some((i) => i.s.tags.includes('antimatter'));
  let explode = false;
  let explodeText = '';
  if (hasAntimatter && !m.treat('contain')) {
    explode = true; explodeText = 'ANNIHILATION. Antimatter touched the flask walls. The bench is gone.';
  } else {
    const instab = Math.max(0, 0.55 - stability) / 0.55;
    const tf = temp > 100 ? 1 + (temp - 100) / 400 : 1;
    const risk = instab * instab * STIR_MODES[stir].risk * tf * (m.treat('electrify') ? 1.4 : 1) * (m.treat('contain') ? 0.02 : 1);
    if (Math.random() < risk) {
      explode = true;
      explodeText = `The unstable mixture detonates${stir === 'vortex' || stir === 'vigorous' ? ' under the stirring' : temp > 100 ? ' from the heat' : ''}!`;
    }
  }
  if (explode) {
    return { ok: false, exploded: true, error: explodeText, severity: clamp(volume / 100 * (1 - stability) + (hasAntimatter ? 5 : 0), 0.3, 6), log, reactions };
  }

  // --- derived stats & name ---------------------------------------------------------
  let toxicity = 0, potency = 0;
  for (const [e, v] of Object.entries(E)) { potency += v; if (EFFECTS[e]?.bad) toxicity += v; }
  const hazards = [];
  if (stability < 0.35) hazards.push('Volatile');
  if (ph < 3) hazards.push('Strong acid');
  if (ph > 11) hazards.push('Caustic');
  if (temp > 60) hazards.push('Scalding');
  if (temp < -10) hazards.push('Cryogenic');
  if (Object.keys(infections).length) hazards.push('Biohazard');
  if ((E.radiation || 0) > 0.2) hazards.push('Radioactive');
  if (hasAntimatter) hazards.push('Antimatter');
  if (toxicity > 3) hazards.push('Lethal');

  const name = recipe ? recipe.name : generateName({ E, state, temp, stability, color: finalColor, toxicity });
  return {
    ok: true,
    log,
    reactions,
    mixture: {
      id: uid('mix'),
      name,
      recipe: recipe ? recipe.id : null,
      recipeDesc: recipe ? recipe.desc : null,
      color: finalColor,
      glowColor,
      state,
      volume: Math.round(volume),
      temperature: Math.round(temp),
      ph: Math.round(ph * 10) / 10,
      stability: Math.round(stability * 100) / 100,
      halfLife: Math.round(halfLife),
      effects: E,
      infections,
      grants,
      tags: tagW,
      antimatter: hasAntimatter,
      absorb,
      toxicity: Math.round(toxicity * 100) / 100,
      potency: Math.round(potency * 100) / 100,
      hazards,
      ingredients: items.map((i) => ({ id: i.id, ml: i.ml })),
      process: { temp: process.temp, stir, time, treatments: [...treatments] },
      reactions,
    },
  };
}

function generateName({ E, state, temp, stability, color, toxicity }) {
  const top = Object.entries(E).sort((a, b) => b[1] - a[1]);
  const adj = [];
  if (stability < 0.3) adj.push('Volatile');
  else if (temp > 90) adj.push('Boiling');
  else if (temp < -10) adj.push('Frozen');
  else if (toxicity > 4) adj.push('Deadly');
  else if ((E.glow || 0) > 0.5) adj.push('Glowing');
  else if ((E.chaos || 0) > 0.5) adj.push('Unstable');
  else if ((E.mana || 0) > 0.8) adj.push('Enchanted');
  const nouns = STATE_NOUNS[state] || STATE_NOUNS.liquid;
  const noun = nouns[Math.floor((Object.keys(E).length * 7 + Math.round(temp)) % nouns.length + nouns.length) % nouns.length];
  const of = top.length ? ` of ${EFFECTS[top[0][0]]?.name || top[0][0]}` : '';
  return `${adj.length ? adj[0] + ' ' : ''}${colorName(color)} ${noun}${of}`;
}
