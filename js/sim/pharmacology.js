// Getting a mixture into (or onto) the subject, and what happens to it there.
import { MUTATIONS, MUSCLES } from '../data/vocab.js';
import { clamp, pick, rand, uid, chance } from '../util.js';
import { organFn, pushEvent, pushFlash, damageTissue, killBody } from './body.js';
import { infect } from './diseases.js';

const NEURO = new Set(['stimulant', 'sedative', 'analgesic', 'euphoria', 'hallucinogen', 'intoxication', 'intellect',
  'amnesia', 'rage', 'fear', 'calm', 'sleep', 'love', 'laughter', 'truth', 'telepathy', 'neurotoxin', 'paralysis', 'spasm']);
const SURFACE = new Set(['heat', 'cold', 'electric', 'purify', 'glow', 'petrify', 'gilding', 'metallize', 'crystallize',
  'corrosive', 'invisibility', 'photosynthesis', 'elastic']);

export const ROUTES = {
  oral:     { name: 'Drink', short: 'Drink',            icon: '🥤', verb: 'drinks',  ka: 0.12, bio: 0.75, infect: 0.7, desc: 'Swallowed. Slow onset; the liver sees it first; the stomach takes any burns.' },
  iv:       { name: 'IV Injection', short: 'IV',     icon: '💉', verb: 'is injected with', ka: Infinity, bio: 1, infect: 1.2, desc: 'Straight into a vein. Instant, full strength. Solids and gases can embolise.' },
  im:       { name: 'Intramuscular', short: 'IM shot',    icon: '🎯', verb: 'takes an intramuscular shot of', ka: 0.06, bio: 0.9, infect: 1, site: true, desc: 'Into a chosen muscle. Moderate onset; local damage stays in that muscle.' },
  inhale:   { name: 'Inhale', short: 'Inhale',           icon: '🌬️', verb: 'inhales', ka: 0.6, bio: 0.8, infect: 1, desc: 'Nebulised into the lungs. Very fast onset; the lungs take any burns.' },
  topical:  { name: 'Apply to Skin', short: 'Skin',    icon: '🧴', verb: 'has skin painted with', ka: 0.03, bio: 0.3, infect: 0.3, site: true, desc: 'Rubbed into skin. Slow, weak systemic effect; surface effects act strongly.' },
  eye:      { name: 'Eye Drops', short: 'Eye drops',        icon: '👁️', verb: 'gets eye drops of', ka: 0.25, bio: 0.2, infect: 0.6, desc: 'Into the eyes. Fast to the brain; the eyes take any damage.' },
  splash:   { name: 'Splash', short: 'Splash',           icon: '💦', verb: 'is splashed with', ka: 0.02, bio: 0.08, infect: 0.2, desc: 'Thrown at the subject. Mostly external: fire ignites, holy water burns the unholy.' },
  spinal:   { name: 'Spinal Injection', short: 'Spinal', icon: '🦴', verb: 'receives a spinal injection of', ka: 0.8, bio: 1, infect: 1.3, neuro: 2.2, desc: 'Into the spinal canal. Nervous-system effects ×2.2. Corrosives here paralyse.' },
  cranial:  { name: 'Intracranial', short: 'Brain',     icon: '🧠', verb: 'has injected directly into the brain:', ka: 2, bio: 1, infect: 1.5, neuro: 3, desc: 'Straight into brain tissue. Nervous-system effects ×3. Extremely risky.' },
  fumigate: { name: 'Fumigate Chamber', short: 'Fumigate', icon: '🌫️', verb: 'breathes chamber air laced with', ka: 0.015, bio: 0.5, infect: 0.8, desc: 'Fills the chamber with vapour. Slow, steady exposure for about a minute.' },
};

export const SITES = {
  armL: 'Left arm', armR: 'Right arm', legL: 'Left leg', legR: 'Right leg', chest: 'Chest', core: 'Abdomen', neck: 'Neck',
};

function siteTissues(body, route, site) {
  switch (route) {
    case 'oral': return [[body.organs.stomach, 1], [body.organs.intestines, 0.3]];
    case 'iv': return [[body.organs.heart, 0.25]];
    case 'im': return [[body.muscles[site] || body.muscles.armL, 1]];
    case 'inhale': case 'fumigate': return [[body.organs.lungL, 1], [body.organs.lungR, 1]];
    case 'topical': return [[body.organs.skin, 0.6], [body.muscles[site] || body.muscles.chest, 0.3]];
    case 'eye': return [[body.organs.eyes, 1]];
    case 'splash': return [[body.organs.skin, 1]];
    case 'spinal': return [[body.nerves.spinal, 1]];
    case 'cranial': return [[body.organs.brain, 0.6], [body.brain[pick(Object.keys(body.brain))], 1]];
    default: return [];
  }
}

const SITE_NAMES = {
  oral: 'stomach', iv: 'veins', im: 'muscle', inhale: 'lungs', fumigate: 'lungs', topical: 'skin', eye: 'eyes', splash: 'skin', spinal: 'spinal cord', cranial: 'brain',
};

/**
 * Administer `ml` of a mixture to the subject by `route`.
 * Returns the created dose (or null if the subject is gone).
 */
export function administer(body, mixture, route, ml, site = 'armL', env = null) {
  const R = ROUTES[route];
  if (!R || body.gone) return null;
  ml = Math.max(0.5, ml);
  const vf = Math.sqrt(ml / 10);
  const siteName = route === 'im' || route === 'topical' ? (SITES[site] || 'arm').toLowerCase() : SITE_NAMES[route];
  pushEvent(body, `${body.name} ${R.verb} ${Math.round(ml)} ml of ${mixture.name}.`, 'dose');
  pushFlash(body, 'dose', { route, color: mixture.color, site, glow: mixture.glowColor });

  // Antimatter: any contact at all is the end.
  if (mixture.antimatter) {
    pushEvent(body, 'Antimatter contacts ordinary matter. Total annihilation.', 'death');
    pushFlash(body, 'annihilate', {});
    killBody(body, 'Annihilated by antimatter', { gone: true });
    return null;
  }

  const tissues = siteTissues(body, route, site);
  const hit = (amount, why) => {
    if (amount <= 0.5) return;
    for (const [t, w] of tissues) damageTissue(t, amount * w);
    body.painSpike = (body.painSpike || 0) + amount * 0.8;
    pushEvent(body, why, amount > 30 ? 'critical' : 'warn');
  };

  // --- contact temperature ---------------------------------------------------
  const T = mixture.temperature;
  const external = route === 'splash' || route === 'topical';
  if (T > 58) {
    const dmg = Math.min(100, (T - 55) * 0.45 * vf * (external ? 0.7 : 1));
    hit(dmg, T > 900 ? `The ${T}°C mixture incinerates the ${siteName}!` : `Scalding ${T}°C liquid burns the ${siteName}.`);
    if (external) body.burns = clamp(body.burns + dmg / 80, 0, 1);
    if (external && (T > 250 || (mixture.tags.fire || 0) > 0.15)) { body.burning = 1; pushEvent(body, `${body.name} catches fire!`, 'critical'); }
  } else if (T < 0) {
    const dmg = Math.min(100, -T * 0.16 * vf * (external ? 0.6 : 1));
    if (route === 'oral' && T < -150) {
      hit(dmg + 35 * vf, 'The cryogenic liquid boils violently in the stomach. The stomach wall ruptures.');
      body.bleeding += 0.4 * vf;
    } else hit(dmg, `The ${T}°C mixture freezes the ${siteName}.`);
    if (external) body.frost = clamp(body.frost + dmg / 60, 0, 1);
  }
  if (external && body.burning > 0 && T < 60 && mixture.state !== 'plasma' && !(mixture.tags.fire > 0.1)) {
    body.burning = 0; body.wet = 1; pushEvent(body, 'The flames are doused.', 'good');
  }
  if (external) body.wet = Math.max(body.wet, mixture.state === 'liquid' ? 1 : 0.3);

  // --- pH --------------------------------------------------------------------------
  const acid = mixture.ph < 3 ? (3 - mixture.ph) : 0;
  const alk = mixture.ph > 11 ? (mixture.ph - 11) : 0;
  if (acid || alk) {
    hit((acid + alk) * 7 * vf, `The ${acid ? 'acid' : 'caustic alkali'} (pH ${mixture.ph}) eats into the ${siteName}.`);
    if (route === 'iv') { body.blood.ph = clamp(body.blood.ph + (alk - acid) * ml / 250, 6.5, 8); body.blood.rbc = Math.max(0.5, body.blood.rbc - (acid + alk) * ml / 60); }
  }

  // --- embolism ------------------------------------------------------------------------
  if ((route === 'iv' || route === 'spinal' || route === 'cranial')) {
    if (mixture.state === 'gas' && chance(clamp(ml / 40, 0.15, 0.9))) {
      pushEvent(body, 'Air embolism! A gas bubble lodges in the circulation.', 'critical');
      const region = pick(['frontal', 'motor', 'temporal', 'cerebellum', 'brainstem']);
      damageTissue(body.brain[region], 25 * vf);
      body.forceArrhythmia = chance(0.4);
    } else if ((mixture.state === 'powder' || mixture.state === 'crystal' || mixture.state === 'solid') && chance(clamp(ml / 30, 0.2, 0.95))) {
      pushEvent(body, 'Particulate embolism! Undissolved solids clog the lung capillaries.', 'critical');
      damageTissue(body.organs.lungL, 18 * vf); damageTissue(body.organs.lungR, 18 * vf);
      if (chance(0.35)) damageTissue(body.brain[pick(Object.keys(body.brain))], 20);
    }
  }

  // --- immediate detonation -----------------------------------------------------------
  const boom = (mixture.effects.explosive || 0) * ml / 10;
  if (boom > 0.4 && chance(clamp(boom * 0.35 + (1 - mixture.stability) * 0.5, 0, 0.95))) {
    detonate(body, boom, `${mixture.name} detonates on contact!`);
  }

  // --- external special exposures ---------------------------------------------------
  if (route === 'splash') {
    const e = mixture.effects;
    if ((e.electric || 0) * ml / 10 > 0.8) { body.shock = (body.shock || 0) + (e.electric * ml / 10); pushEvent(body, 'The charged liquid arcs across the skin!', 'warn'); }
    if ((e.purify || 0) > 0.3 && (body.undead || body.transform.vampire > 0.5 || body.transform.zombie > 0.3)) {
      for (const o of Object.values(body.organs)) damageTissue(o, e.purify * ml / 10 * 8);
      pushEvent(body, 'Holy liquid sizzles on unholy flesh!', 'critical');
      pushFlash(body, 'holy', {});
    }
  }

  // --- infections and mutations --------------------------------------------------------
  for (const [d, p] of Object.entries(mixture.infections || {})) {
    const pp = 1 - (1 - clamp(p, 0, 0.999)) ** (ml / 10 * R.infect);
    if (chance(pp)) infect(body, d, mixture.name);
  }
  for (const [g, p] of Object.entries(mixture.grants || {})) {
    const pp = 1 - (1 - clamp(p, 0, 0.999)) ** (ml / 10);
    if (chance(pp)) grantMutation(body, g);
  }

  // --- the dose itself ---------------------------------------------------------------------
  const effects = {};
  for (const [e, v] of Object.entries(mixture.effects)) {
    let m = v * ml / 10;
    if (R.neuro && NEURO.has(e)) m *= R.neuro;
    if ((route === 'splash' || route === 'topical') && SURFACE.has(e)) m *= route === 'splash' ? 4 : 2.5;
    if (route === 'eye' && (e === 'blindness' || e === 'hallucinogen')) m *= 2;
    if (e === 'explosive' && boom > 0.4) m *= 0.5;
    effects[e] = m;
  }
  if (route === 'splash' || route === 'topical') {
    // surface effects hit the skin directly: bypass slow absorption for them
  }
  const dose = {
    id: uid('dose'), name: mixture.name, color: mixture.color, route, site, ml,
    depot: R.ka === Infinity ? 0 : 1,
    plasma: R.ka === Infinity ? 1 : 0,
    surface: route === 'splash' || route === 'topical' ? 1 : 0,
    ka: (R.ka === Infinity ? 0 : R.ka) * (mixture.absorb || 1),
    bio: R.bio,
    halfLife: Math.max(5, mixture.halfLife || 60),
    effects,
    bad: mixture.toxicity > mixture.potency * 0.5,
    t: 0,
  };
  // IV of scalding/cryogenic liquid also shifts core temperature a little
  if (route === 'iv' || route === 'cranial' || route === 'spinal') {
    if (T > 45) dose.effects.heat = (dose.effects.heat || 0) + (T - 45) / 300 * ml / 10;
    if (T < 10) dose.effects.cold = (dose.effects.cold || 0) + (10 - T) / 150 * ml / 10;
  }
  body.doses.push(dose);
  if (route === 'fumigate') pushFlash(body, 'fog', { color: mixture.color, duration: 70 });
  return dose;
}

export function grantMutation(body, id) {
  if (!MUTATIONS[id] || body.mutations.includes(id)) return false;
  body.mutations.push(id);
  pushEvent(body, `MUTATION: ${body.name} develops ${MUTATIONS[id].name.toLowerCase()}!`, 'mutation');
  pushFlash(body, 'mutation', { id });
  return true;
}

export function detonate(body, power, text) {
  pushEvent(body, text || 'Internal detonation!', 'critical');
  pushFlash(body, 'explosion', { power });
  const organs = Object.values(body.organs);
  for (let i = 0; i < Math.ceil(power * 2); i++) damageTissue(pick(organs), rand(10, 30) * power);
  for (const b of Object.values(body.bones)) if (chance(0.15 * power)) { b.health = Math.max(0, b.health - 45); b.fractured = true; }
  body.bleeding += 1.5 * power;
  body.painSpike = (body.painSpike || 0) + 60 * power;
  body.knockback = (body.knockback || 0) + power;
  if (power > 4) killBody(body, 'Blown apart', { gone: power > 7 });
  for (const d of body.doses) if (d.effects.explosive) d.effects.explosive = 0;
}

// Advance every active dose; accumulate their effects into E.
export function processDoses(body, E, dt) {
  const liver = organFn(body, 'liver');
  const kidney = (organFn(body, 'kidneyL') + organFn(body, 'kidneyR')) / 2;
  const clearance = body.alive || body.undead ? 0.3 + 0.4 * liver + 0.3 * kidney : 0.05;
  const gut = 0.3 + 0.7 * organFn(body, 'intestines');
  const antidote = body.effects.antidote || 0;
  const keep = [];
  for (const d of body.doses) {
    d.t += dt;
    if (d.depot > 0) {
      const ka = d.ka * (d.route === 'oral' ? gut : 1);
      const moved = d.depot * (1 - Math.exp(-ka * dt));
      d.depot -= moved;
      d.plasma += moved * d.bio;
    }
    const ke = (Math.LN2 / d.halfLife) * clearance * (d.bad ? 1 + antidote * 1.5 : 1);
    d.plasma *= Math.exp(-ke * dt);
    if (d.surface > 0) d.surface *= Math.exp(-dt / 20);
    for (const [e, v] of Object.entries(d.effects)) {
      if (d.surface > 0 && LOCAL_ONLY.has(e)) {
        // heat, cold, acid and current on the skin act locally, not systemically
        E[e] = (E[e] || 0) + v * d.plasma;
        const local = v * d.surface * 0.35;
        if (local > 0.05) surfaceContact(body, e, local, dt);
        continue;
      }
      const level = SURFACE.has(e) && d.surface > 0 ? Math.max(d.plasma, d.surface * 0.35) : d.plasma;
      E[e] = (E[e] || 0) + v * level;
    }
    // local corrosion while the dose sits at its site
    const corr = d.effects.corrosive || 0;
    if (corr > 0) {
      const local = corr * (d.depot + 0.3 * d.plasma) * 1.4 * dt;
      for (const [t, w] of siteTissues(body, d.route, d.site)) damageTissue(t, local * w);
    }
    if (d.depot > 0.01 || d.plasma > 0.008 || d.surface > 0.05) keep.push(d);
  }
  body.doses = keep;
}

const LOCAL_ONLY = new Set(['heat', 'cold', 'electric', 'corrosive']);

function surfaceContact(body, e, x, dt) {
  const skin = body.organs.skin;
  const armor = (body.mutations.includes('scales') ? 0.5 : 1) * (1 - clamp(body.transform.metal + body.transform.stone, 0, 0.9));
  if (e === 'heat') {
    damageTissue(skin, x * 0.6 * armor * dt);
    body.burns = clamp(body.burns + x * 0.004 * armor * dt, 0, 1);
    body.hurt = (body.hurt || 0) + x * 2 * armor * dt;
    body.skinHeat = x;
    if (x > 2.5 && body.burning < 0.5 && body.wet < 0.3) { body.burning = 1; pushEvent(body, `${body.name} catches fire!`, 'critical'); }
  } else if (e === 'cold') {
    damageTissue(skin, x * 0.4 * armor * dt);
    body.frost = clamp(body.frost + x * 0.005 * dt, 0, 1);
    body.skinCold = x;
  } else if (e === 'corrosive') {
    damageTissue(skin, x * 1.2 * armor * dt);
    body.hurt = (body.hurt || 0) + x * 3 * dt;
  } else if (e === 'electric') {
    body.shock = Math.max(body.shock || 0, x * 0.5);
  }
}

// Vomiting empties unabsorbed oral doses.
export function purgeStomach(body) {
  let purged = false;
  for (const d of body.doses) if (d.route === 'oral' && d.depot > 0.05) { d.depot *= 0.4; purged = true; }
  return purged;
}

export const MUSCLE_SITES = Object.keys(MUSCLES);
