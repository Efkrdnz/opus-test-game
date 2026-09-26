// Behaviour: what the homunculus does — commanded actions, involuntary actions,
// movement physics and speech. DOM-free; the renderer turns this into a pose.
import { SPEECH } from '../data/speech.js';
import { clamp, chance, pick, rand, randInt, approach } from '../util.js';
import { pushEvent, pushFlash } from './body.js';
import { applyImpact } from './physiology.js';
import { purgeStomach } from './pharmacology.js';

export const WORLD_HALF = 2.5; // metres from centre to wall

export const COMMANDS = {
  walk:     { name: 'Walk',      key: 'W', test: 'Gait speed' },
  run:      { name: 'Run',       key: 'R', test: 'Sprint speed' },
  jump:     { name: 'Jump',      key: 'J', test: 'Jump height' },
  sit:      { name: 'Sit',       key: 'S' },
  stand:    { name: 'Stand',     key: 'U' },
  crouch:   { name: 'Crouch',    key: 'C' },
  wave:     { name: 'Wave',      key: 'V' },
  dance:    { name: 'Dance',     key: 'D', test: 'Coordination' },
  lift:     { name: 'Lift',      key: 'L', test: 'Strength' },
  punch:    { name: 'Punch',     key: 'P', test: 'Punch force' },
  kick:     { name: 'Kick',      key: 'K', test: 'Kick force' },
  flex:     { name: 'Flex',      key: 'F' },
  balance:  { name: 'Balance',   key: 'B', test: 'Balance time' },
  speak:    { name: 'Speak',     key: 'T', test: 'Speech' },
  think:    { name: 'Solve',     key: 'Q', test: 'Cognition' },
  backflip: { name: 'Backflip',  key: 'X', test: 'Agility' },
  sing:     { name: 'Sing',      key: 'G' },
  stretch:  { name: 'Stretch',   key: 'E' },
  sleep:    { name: 'Sleep',     key: 'Z' },
  wake:     { name: 'Wake up',   key: 'A' },
  come:     { name: 'Come here', key: 'H' },
  left:     { name: 'Go left',   key: '←' },
  right:    { name: 'Go right',  key: '→' },
  stop:     { name: 'Stop',      key: '.' },
};

const SYNONYMS = {
  walk: ['walk', 'move', 'go', 'stroll'], run: ['run', 'sprint', 'dash'], jump: ['jump', 'hop', 'leap'],
  sit: ['sit', 'sit down'], stand: ['stand', 'stand up', 'get up', 'rise'], crouch: ['crouch', 'squat', 'duck'],
  wave: ['wave', 'hello', 'hi'], dance: ['dance', 'boogie'], lift: ['lift', 'deadlift', 'weights', 'press'],
  punch: ['punch', 'hit', 'box', 'strike'], kick: ['kick'], flex: ['flex', 'pose', 'muscles'],
  balance: ['balance', 'one leg'], speak: ['speak', 'talk', 'say something', 'tell me'], think: ['think', 'solve', 'math', 'puzzle', 'calculate'],
  backflip: ['backflip', 'flip', 'somersault'], sing: ['sing', 'song'], stretch: ['stretch', 'yoga'],
  sleep: ['sleep', 'nap', 'lie down', 'rest'], wake: ['wake', 'wake up'], come: ['come', 'come here', 'center', 'centre'],
  left: ['left', 'go left'], right: ['right', 'go right'], stop: ['stop', 'halt', 'freeze', 'stay'],
};

export const BASELINES = {
  'Gait speed': 1.3, 'Sprint speed': 5.5, 'Jump height': 0.45, 'Strength': 95, 'Punch force': 1400, 'Kick force': 2600,
  'Balance time': 25, 'Cognition': 100, 'Agility': 1, 'Coordination': 70, 'Speech': 100,
};

export function parseCommand(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const say = t.match(/^(say|repeat)\s+(.+)$/);
  if (say) return { cmd: 'say', arg: text.trim().slice(say[1].length).trim() };
  for (const [cmd, words] of Object.entries(SYNONYMS)) {
    for (const w of words) if (t === w || t.startsWith(w + ' ')) {
      if (cmd === 'walk' && /left/.test(t)) return { cmd: 'left' };
      if (cmd === 'walk' && /right/.test(t)) return { cmd: 'right' };
      return { cmd };
    }
  }
  for (const [cmd, words] of Object.entries(SYNONYMS)) for (const w of words) if (t.includes(w)) return { cmd };
  return { cmd: 'unknown', arg: text };
}

export function createActor() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, yaw: 0, facing: 0,
    action: 'idle', t: 0, data: {}, commanded: false,
    posture: 'stand', // stand | sit | crouch | lie
    lie: 0, lieDir: 1,
    speech: null, chatterT: rand(4, 8), thoughtT: rand(3, 6),
    props: { stool: 0, barbell: 0, bag: 0, bagSide: 1, bagHit: 0 },
    liftKg: 60,
    auto: {}, // cooldowns for involuntary actions
    teleportFx: 0,
    airborne: false, peakY: 0,
    fallStart: 0,
    hover: 0,
    wobble: 0,
    shake: 0,
    time: 0,
  };
}

// ---------------------------------------------------------------------------
// speech
// ---------------------------------------------------------------------------
const GARBLE = ['blorf', 'mnah', 'grbl', 'fnord', 'wubba', 'glarp', 'hnng', 'skree', 'plib', 'zorp'];

export function voice(body, text) {
  const cap = body.cap, E = body.effects;
  let out = text;
  if (cap.speech < 0.35) out = out.split(' ').map((w) => (chance(0.6 - cap.speech) ? pick(GARBLE) : w)).join(' ');
  if ((E.intoxication || 0) > 0.8) out = out.replace(/s/g, 'sh').replace(/S/g, 'Sh') + (chance(0.4) ? ' *hic*' : '');
  if (cap.fear > 1.2 || body.vitals.temp < 35) out = out.replace(/^(\w)/, '$1-$1-$1');
  if ((E.laughter || 0) > 0.6) out += chance(0.5) ? ' hahaha' : ' *giggle*';
  if (body.transform.werewolf >= 1) out = out.split(' ').map((w) => (chance(0.4) ? 'GRRR' : w)).join(' ');
  if (body.vitals.consciousness < 45) out = out.toLowerCase().replace(/[.!?]*$/, '...');
  return out;
}

function lineFor(key) {
  const arr = SPEECH[key] || SPEECH.idle;
  return pick(arr);
}

export function say(actor, body, keyOrText, opts = {}) {
  if (!body.alive && !body.undead) return;
  if (body.stasis) return;
  let text = opts.raw ? keyOrText : lineFor(keyOrText);
  if (opts.cmd) text = text.replace(/\{cmd\}/g, opts.cmd);
  if (body.undead && !opts.thought) text = lineFor('zombie');
  if (!opts.thought) text = voice(body, text);
  actor.speech = {
    text, t: 0, dur: opts.dur || clamp(1.6 + text.length * 0.06, 2, 6),
    kind: opts.thought ? 'think' : 'say',
    helium: (body.cap.helium || 0) > 0.4,
  };
  if (!opts.thought) body.speaking = true;
}

export function moodKey(body) {
  const E = body.effects, T = body.transform, cap = body.cap, v = body.vitals;
  const e = (k) => E[k] || 0;
  if (body.undead) return 'zombie';
  if (T.werewolf >= 1) return 'werewolf';
  if (T.vampire >= 1) return 'vampire';
  if (T.ghost > 0.6) return 'ghost';
  if (T.stone > 0.3) return 'stone';
  if (T.gold > 0.3) return 'gold';
  if (T.crystal > 0.5) return 'crystal';
  if (T.metal > 0.5) return 'metal';
  if (T.elastic > 0.5) return 'elastic';
  if (T.divine > 0.5) return 'divine';
  if (v.bloodVolume < 55 || v.spo2 < 80 || body.organs.heart.health < 30 || body.organs.brain.health < 40) return 'critical';
  if (body.burning > 0.2) return 'burning';
  if (v.temp < 34.5) return 'cold';
  if (v.temp > 39.3) return 'hot';
  if (e('fear') > 1) return 'fear';
  if (e('rage') > 1) return 'rage';
  if (body.hallucination > 1) return 'hallucinating';
  if (e('intoxication') > 1) return 'drunk';
  if (e('love') > 0.8) return 'love';
  if (e('laughter') > 0.8) return 'laughter';
  if (e('euphoria') > 1.2) return 'euphoric';
  if (e('truth') > 0.8) return 'truth';
  if (v.pain > 50) return 'pain';
  if (body.symptoms.nausea > 0.5) return 'nausea';
  if (body.bleedRate > 0.3) return 'bleeding';
  if (body.blood.radiation > 1) return 'radiation';
  if (e('paralysis') > 1) return 'paralyzed';
  if (cap.vision < 0.3) return 'blind';
  if (body.diseases.some((d) => d.incubation <= 0)) return 'sick';
  if (body.size > 1.5) return 'giant';
  if (body.size < 0.6) return 'tiny';
  if (cap.levitation > 0.5) return 'levitating';
  if (cap.invisibility > 0.5) return 'invisible';
  if (e('fireBreath') > 0.5) return 'fireBreath';
  if (e('photosynthesis') > 0.5) return 'photosynthesis';
  if (cap.glow > 0.5) return 'glowing';
  if (body.blood.mana > 60) return 'mana';
  if (e('timeDilation') > 0.5) return 'time';
  if (e('chaos') > 0.5) return 'chaos';
  if (e('teleport') > 0.5) return 'teleport';
  if (e('heavy') > 1) return 'heavy';
  if (body.mutations.length) return 'mutated';
  if (e('intellect') > 1) return 'smart';
  if (e('amnesia') > 0.8) return 'amnesia';
  if (cap.iq < 60) return 'dumb';
  if (e('strength') > 1) return 'strong';
  if (e('haste') > 1) return 'fast';
  if (e('weakness') > 1) return 'weak';
  if (body.neuro.melatonin > 68 || e('sleep') > 0.6) return 'sleepy';
  if (e('calm') > 1) return 'calm';
  if (cap.mood > 30) return 'happy';
  return 'idle';
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------
function measure(body, test, value, unit, note) {
  const base = BASELINES[test];
  body.measurements.push({ test, value, unit, note: note || '', base, t: body.time });
  if (body.measurements.length > 200) body.measurements.shift();
  const pct = base ? Math.round((value / base) * 100) : null;
  pushEvent(body, `TEST ${test}: ${typeof value === 'number' ? +value.toFixed(2) : value} ${unit}${pct !== null ? ` (${pct}% of baseline)` : ''}${note ? ' — ' + note : ''}`, 'test');
}

function setAction(actor, action, data = {}, commanded = false) {
  actor.action = action;
  actor.t = 0;
  actor.data = data;
  actor.commanded = commanded;
}

function canWalk(body) {
  const c = body.cap;
  if (c.legBrokenL && c.legBrokenR) return 'both legs are broken';
  if (c.legStrength < 0.12) return (body.effects.paralysis || 0) > 1 ? 'the legs are paralysed' : 'the legs are too weak';
  if (body.transform.stone > 0.8 || body.transform.gold > 0.8) return 'the body is too stiff';
  return null;
}

function canUseArms(body) {
  const c = body.cap;
  if (c.armBrokenL && c.armBrokenR) return 'both arms are broken';
  if (c.armStrength < 0.1) return 'the arms will not respond';
  return null;
}

export function issueCommand(actor, body, cmdIn, arg) {
  const def = COMMANDS[cmdIn];
  const label = def ? def.name : cmdIn === 'say' ? `say "${arg}"` : cmdIn;
  if (body.gone) { pushEvent(body, 'There is no subject left to command.', 'warn'); return; }
  pushEvent(body, `COMMAND: "${label}"`, 'command');
  if (cmdIn === 'unknown') { say(actor, body, 'confused', { cmd: arg }); pushEvent(body, `The subject does not know the command "${arg}".`, 'info'); return; }
  if (!body.alive && !body.undead) { pushEvent(body, 'No response. The subject is dead.', 'info'); return; }
  if (body.stasis) { pushEvent(body, `No response. The subject is ${body.stasis === 'cryo' ? 'frozen solid' : body.stasis === 'gold' ? 'solid gold' : 'solid stone'}.`, 'info'); return; }
  if (body.undead) {
    if (['walk', 'come', 'left', 'right', 'run'].includes(cmdIn) && chance(0.5)) {
      startCommand(actor, body, cmdIn === 'run' ? 'walk' : cmdIn, arg);
      pushEvent(body, 'The undead subject lurches in roughly the right direction.', 'info');
    } else { say(actor, body, 'zombie'); pushEvent(body, 'The undead subject ignores you and moans.', 'info'); }
    return;
  }
  if (body.seizure > 0) { pushEvent(body, 'No response: the subject is having a seizure.', 'warn'); return; }
  if (body.sleeping) {
    if (cmdIn === 'wake' || chance(0.25)) {
      body.wakeRequest = true;
      pushEvent(body, 'You rouse the sleeping subject.', 'info');
      if (cmdIn === 'wake') return;
    } else { pushEvent(body, 'The subject is asleep. (Try "Wake up".)', 'info'); return; }
  }
  const c = body.cap;
  if (body.vitals.consciousness < 30) { pushEvent(body, 'No response: the subject is barely conscious.', 'warn'); return; }
  if (cmdIn === 'wake') { say(actor, body, 'obey', { cmd: 'Wake up' }); pushEvent(body, 'The subject is already awake.', 'info'); return; }
  if (!chance(clamp(c.hearing * 1.1, 0.02, 1))) { pushEvent(body, 'The subject does not seem to hear you.', 'info'); actor.data.hmm = 1; return; }
  // understanding
  let cmd = cmdIn;
  const telepathy = (c.telepathy || 0) > 0.6;
  if (!telepathy && !chance(0.25 + 0.75 * c.comprehension)) {
    const others = Object.keys(COMMANDS).filter((k) => k !== cmdIn && !['wake', 'stop', 'sleep'].includes(k));
    cmd = pick(others);
    say(actor, body, 'confused', { cmd: label });
    pushEvent(body, `The subject misunderstands and tries to ${COMMANDS[cmd].name.toLowerCase()} instead.`, 'warn');
  } else if (telepathy && chance(0.5)) {
    say(actor, body, 'thoughts', { thought: true });
    pushEvent(body, 'Telepathy: the subject anticipated the command before you finished it.', 'info');
  }
  // willingness
  const E = body.effects;
  if (cmd !== 'stop') {
    const willing = clamp(c.obedience * 1.05 + (E.love || 0) * 0.2, 0.02, 1);
    if (!chance(willing)) {
      if (c.aggression > 1) { say(actor, body, 'rage'); pushEvent(body, 'The subject snarls and refuses.', 'warn'); setAction(actor, 'rage', { dur: 3 }); }
      else if (c.fear > 1) { say(actor, body, 'fear'); pushEvent(body, 'The subject is too frightened to comply.', 'warn'); setAction(actor, 'cower', { dur: 4 }); }
      else { say(actor, body, 'refuse', { cmd: label }); pushEvent(body, 'The subject refuses.', 'warn'); }
      return;
    }
  }
  startCommand(actor, body, cmd, arg);
}

function startCommand(actor, body, cmd, arg) {
  const c = body.cap;
  const label = COMMANDS[cmd] ? COMMANDS[cmd].name : cmd;
  const unable = (why) => { say(actor, body, 'unable', { cmd: label }); pushEvent(body, `The subject tries, but ${why}.`, 'warn'); };
  // stand up first if needed
  const legs = ['walk', 'run', 'jump', 'dance', 'kick', 'balance', 'come', 'left', 'right', 'backflip', 'lift'];
  if (legs.includes(cmd)) { const why = canWalk(body); if (why) { unable(why); return; } }
  if (['lift', 'punch', 'wave', 'flex'].includes(cmd)) { const why = canUseArms(body); if (why) { unable(why); return; } }
  if (cmd !== 'say' && cmd !== 'speak' && cmd !== 'think' && cmd !== 'sing') actor.posture = 'stand';
  if (!['speak', 'think', 'sing', 'say'].includes(cmd) && chance(0.4)) say(actor, body, 'obey', { cmd: label });
  switch (cmd) {
    case 'walk': setAction(actor, 'walk', { target: pickTarget(actor), start: actor.x, speedMul: 1 }, true); break;
    case 'run': setAction(actor, 'run', { legs: 0, target: actor.x > 0 ? -WORLD_HALF + 0.3 : WORLD_HALF - 0.3, start: actor.x, dist: 0, peak: 0 }, true); break;
    case 'come': setAction(actor, 'walk', { target: 0, start: actor.x, speedMul: 1 }, true); break;
    case 'left': setAction(actor, 'walk', { target: -WORLD_HALF + 0.4, start: actor.x, speedMul: 1 }, true); break;
    case 'right': setAction(actor, 'walk', { target: WORLD_HALF - 0.4, start: actor.x, speedMul: 1 }, true); break;
    case 'jump': setAction(actor, 'jump', { phase: 'crouch' }, true); break;
    case 'backflip': setAction(actor, 'backflip', { phase: 'crouch' }, true); break;
    case 'sit': actor.posture = 'sit'; setAction(actor, 'sit', {}, true); break;
    case 'crouch': actor.posture = 'crouch'; setAction(actor, 'crouch', {}, true); break;
    case 'stand': case 'stop': actor.posture = 'stand'; setAction(actor, 'idle', {}, false); if (cmd === 'stand') say(actor, body, 'obey', { cmd: label }); break;
    case 'wave': setAction(actor, 'wave', { dur: 3, arm: c.armBrokenL ? 'R' : c.armBrokenR ? 'L' : pick(['L', 'R']) }, true); break;
    case 'dance': {
      const quality = clamp(c.coordination * 70 + (body.effects.euphoria || 0) * 10 + (c.stamina - 50) * 0.2, 0, 150);
      setAction(actor, 'dance', { dur: 6, quality }, true);
      measure(body, 'Coordination', Math.round(quality), 'pts', quality > 90 ? 'show-stopping' : quality > 60 ? 'competent' : quality > 30 ? 'awkward' : 'barely upright');
      break;
    }
    case 'lift': {
      const maxKg = 95 * Math.max(0, c.armStrength) ** 0.6 * Math.max(0, c.legStrength) ** 0.4 * body.size ** 2 * (body.mutations.includes('extraArms') ? 1.5 : 1) / Math.max(0.3, body.cap.gravity);
      setAction(actor, 'lift', { kg: actor.liftKg, maxKg, success: maxKg >= actor.liftKg }, true);
      break;
    }
    case 'punch': {
      const force = 1400 * Math.max(0, c.armStrength) * body.size ** 2 * (body.mutations.includes('claws') ? 1.3 : 1) * (1 + (body.effects.haste || 0) * 0.15);
      actor.props.bagSide = actor.x > 1.2 ? -1 : 1;
      setAction(actor, 'punch', { force, hits: 0, arm: 'R' }, true);
      break;
    }
    case 'kick': {
      const force = 2600 * Math.max(0, c.legStrength) * body.size ** 2 * (1 + (body.effects.haste || 0) * 0.15);
      actor.props.bagSide = actor.x > 1.2 ? -1 : 1;
      setAction(actor, 'kick', { force, hits: 0 }, true);
      break;
    }
    case 'flex': setAction(actor, 'flex', { dur: 3.2 }, true); break;
    case 'stretch': setAction(actor, 'stretch', { dur: 4 }, true); break;
    case 'balance': {
      const time = clamp(28 * c.coordination ** 2.2 * (body.cap.vision > 0.5 ? 1 : 0.5) * (c.legBrokenL || c.legBrokenR ? 0.2 : 1), 0.3, 120);
      setAction(actor, 'balance', { time, dur: Math.min(time, 7) }, true);
      break;
    }
    case 'speak': {
      const key = (body.effects.truth || 0) > 0.6 ? 'truth' : chance(0.5) ? 'monologue' : moodKey(body);
      say(actor, body, key, { dur: 5 });
      setAction(actor, 'talk', { dur: 3 }, true);
      measure(body, 'Speech', Math.round(clamp(body.cap.speech * 100, 0, 100)), '% clarity', body.cap.speech < 0.4 ? 'garbled' : body.cap.speech < 0.8 ? 'slurred' : 'clear');
      break;
    }
    case 'say': {
      say(actor, body, arg || '...', { raw: true });
      setAction(actor, 'talk', { dur: 2.5 }, true);
      break;
    }
    case 'sing': {
      const notes = ['♪ la la laaa ♪', '♫ do re mi ♫', '♪ ooh-ooh ♪', '♫ tra la la ♫'];
      say(actor, body, pick(notes), { raw: true });
      setAction(actor, 'sing', { dur: 4 }, true);
      break;
    }
    case 'think': {
      const a = randInt(3, 12), b = randInt(3, 12);
      const iq = body.cap.iq;
      const correct = chance(clamp((iq - 30) / 90, 0.02, 0.99));
      const answer = correct ? a * b : a * b + pick([-3, -1, 1, 2, 7, 10, -12]) * (chance(0.2) ? 10 : 1);
      const delay = clamp(0.8 + (130 - iq) / 25, 0.5, 8);
      setAction(actor, 'think', { a, b, answer, correct, delay, dur: delay + 2.5, answered: false }, true);
      say(actor, body, `${a} × ${b} = ?`, { raw: true, thought: true, dur: delay });
      break;
    }
    case 'sleep': {
      if ((body.effects.stimulant || 0) > 2) { say(actor, body, 'unable', { cmd: label }); pushEvent(body, 'The subject is far too wired to sleep.', 'warn'); return; }
      body.wantSleep = true; actor.posture = 'lie'; setAction(actor, 'lieDown', {}, true);
      break;
    }
    default: break;
  }
}

function pickTarget(actor) {
  let t = rand(-WORLD_HALF + 0.5, WORLD_HALF - 0.5);
  if (Math.abs(t - actor.x) < 1.2) t = actor.x > 0 ? actor.x - 1.8 : actor.x + 1.8;
  return clamp(t, -WORLD_HALF + 0.4, WORLD_HALF - 0.4);
}

// ---------------------------------------------------------------------------
// per-frame update
// ---------------------------------------------------------------------------
const HIGH_PRIORITY = new Set(['dead', 'stasis', 'seizure', 'collapsed', 'sleeping', 'fall', 'annihilated']);

export function updateActor(actor, body, env, dt) {
  actor.time += dt;
  actor.t += dt;
  body.speaking = false;
  if (actor.speech) { actor.speech.t += dt; if (actor.speech.t > actor.speech.dur) actor.speech = null; else if (actor.speech.kind === 'say') body.speaking = true; }
  actor.teleportFx = Math.max(0, actor.teleportFx - dt);
  actor.shake = Math.max(0, actor.shake - dt * 2);
  const cap = body.cap;
  const E = body.effects;
  const S = body.symptoms;

  if (body.gone) { actor.action = 'annihilated'; return; }

  // --- involuntary state overrides -------------------------------------------------------
  const alive = body.alive;
  let forced = null;
  if (!alive && !body.undead) forced = 'dead';
  else if (body.stasis) forced = 'stasis';
  else if (body.seizure > 0) forced = 'seizure';
  else if (!body.undead && body.vitals.consciousness < 22 && !body.sleeping) forced = 'collapsed';
  else if (body.sleeping) forced = 'sleeping';
  if (forced) {
    if (forced === 'dead') actor.wasDead = true;
    if (actor.action !== forced && !(forced === 'collapsed' && actor.action === 'fall')) {
      if ((forced === 'collapsed' || forced === 'dead') && actor.lie < 0.5 && actor.y < 0.05 && actor.action !== 'fall') {
        // falling over
        if (cap.levitation < 0.4) applyImpact(body, [pick(['skull', 'ribs', 'handL', 'handR', 'pelvis'])], 1.2 / Math.max(0.5, body.bones.skull.density), 'cracks in the fall');
        pushFlash(body, 'thud', {});
      }
      setAction(actor, forced, {}, false);
      actor.speech = forced === 'sleeping' ? actor.speech : null;
    }
    actor.posture = forced === 'stasis' ? actor.posture : 'lie';
    if (forced === 'seizure') actor.posture = 'lie';
    if (forced === 'stasis') actor.posture = actor.posture === 'lie' ? 'lie' : 'stand';
  } else if (HIGH_PRIORITY.has(actor.action)) {
    // recovered from an involuntary state
    if (actor.action !== 'fall') {
      setAction(actor, 'getUp', { dur: 1.4 }, false);
      if (body.undead) say(actor, body, 'zombie');
      else if (actor.wasDead) say(actor, body, 'revived');
      actor.wasDead = false;
    }
  }

  // --- teleport -------------------------------------------------------------------
  if (body.teleportRequest) {
    body.teleportRequest = false;
    if (!body.stasis && (alive || body.undead)) {
      actor.x = rand(-WORLD_HALF + 0.4, WORLD_HALF - 0.4);
      actor.teleportFx = 0.6;
      pushFlash(body, 'teleport', {});
      if (chance(0.3)) say(actor, body, 'teleport');
    }
  }

  // --- action logic ------------------------------------------------------------------
  body.exertion = 0;
  const a = actor.action;
  const d = actor.data;
  const walkSpeed = 1.3 * cap.speed * (body.undead ? 0.35 : 1);
  const dirTo = (tx) => Math.sign(tx - actor.x) || 1;
  const stumbleCheck = (mult) => {
    const p = Math.max(0, 1 - cap.coordination) ** 2 * 1.2 * mult + (S.limp ? 0.05 : 0);
    if (chance(p * dt) && cap.levitation < 0.4 && body.transform.elastic < 0.5) {
      pushEvent(body, `${body.name} stumbles and falls.`, 'warn');
      applyImpact(body, [pick(['handL', 'handR', 'forearmL', 'forearmR', 'skull', 'pelvis'])], rand(0.6, 1.6), 'breaks in the fall');
      setAction(actor, 'fall', { dur: 1.8 }, false);
      return true;
    }
    return false;
  };

  switch (a) {
    case 'idle': {
      actor.facing = approach(actor.facing, 0, 3, dt);
      autonomous(actor, body, env, dt);
      break;
    }
    case 'walk': case 'run': case 'flee': case 'shamble': {
      const running = a === 'run' || a === 'flee';
      const sp = running ? 4.2 * cap.speed * (a === 'flee' ? 1.1 : 1) : walkSpeed * (d.speedMul || 1);
      const dir = dirTo(d.target);
      actor.facing = approach(actor.facing, dir, 6, dt);
      actor.x += dir * sp * dt;
      body.exertion = running ? 0.8 : 0.25;
      d.dist = (d.dist || 0) + sp * dt;
      d.peak = Math.max(d.peak || 0, sp);
      if (a === 'run' && Math.abs(actor.x - d.target) < 0.15) {
        d.legs = (d.legs || 0) + 1;
        if (d.legs >= 2 || actor.t > 7) { finishMove(actor, body, a, d); break; }
        d.target = d.target > 0 ? -WORLD_HALF + 0.3 : WORLD_HALF - 0.3;
      } else if (a !== 'run' && (Math.abs(actor.x - d.target) < 0.08 || actor.t > 12)) { finishMove(actor, body, a, d); break; }
      if (Math.abs(actor.x) >= WORLD_HALF) { actor.x = clamp(actor.x, -WORLD_HALF, WORLD_HALF); finishMove(actor, body, a, d); break; }
      if (sp < 0.05 && actor.t > 2) { finishMove(actor, body, a, d); break; }
      if (!body.undead) stumbleCheck(running ? 2 : 1);
      break;
    }
    case 'jump': case 'backflip': {
      const flip = a === 'backflip';
      if (d.phase === 'crouch') {
        body.exertion = 0.5;
        if (actor.t > 0.38) {
          const legPower = Math.max(0, cap.legStrength) * (1 + (E.haste || 0) * 0.1);
          const h = clamp(0.45 * legPower * (body.transform.elastic > 0.5 ? 1.8 : 1) * (body.mutations.includes('wings') ? 2.2 : 1) / (1 + (E.heavy || 0) * 0.5) / Math.max(0.1, env.gravity), 0, 12);
          actor.vy = Math.sqrt(2 * 9.81 * Math.max(0.1, env.gravity) * h);
          actor.y = 0.001;
          d.phase = 'air'; d.predicted = h; actor.peakY = 0; d.airT = 0;
          d.success = !flip || (legPower > 0.8 && chance(clamp(cap.coordination * 0.9, 0.05, 0.97)));
        }
      } else if (d.phase === 'air') {
        d.airT += dt;
        body.exertion = 0.4;
        if (actor.y <= 0 && d.airT > 0.05) {
          d.phase = 'land'; actor.t = 0;
          if (flip) {
            if (d.success) { measure(body, 'Agility', 1, 'backflip', 'stuck the landing'); say(actor, body, 'happy'); }
            else {
              measure(body, 'Agility', 0, 'backflip', 'crash landing');
              applyImpact(body, ['skull', 'spine'], rand(1.2, 2.8), 'hits the floor first');
              setAction(actor, 'fall', { dur: 2.2 }, false);
              pushEvent(body, `${body.name} lands on its head.`, 'warn');
            }
          } else if (!d.measured) {
            d.measured = true;
            measure(body, 'Jump height', actor.peakY, 'm', actor.peakY > 1.2 ? 'astonishing' : actor.peakY < 0.1 ? 'barely left the ground' : '');
          }
        }
      } else if (d.phase === 'land') {
        if (actor.t > 0.35) setAction(actor, 'idle');
      }
      break;
    }
    case 'sit': case 'crouch': case 'lying': {
      if (a === 'sit') actor.facing = approach(actor.facing, actor.x > 1.5 ? -0.8 : 0.8, 4, dt);
      autonomous(actor, body, env, dt, true);
      break;
    }
    case 'lieDown': {
      if (actor.t > 1) setAction(actor, 'lying', {}, true);
      break;
    }
    case 'lift': {
      body.exertion = d.success ? 0.7 : 1;
      if (actor.t > 1.2 && !d.reported) {
        d.reported = true;
        if (d.success) {
          measure(body, 'Strength', Math.round(d.maxKg), 'kg max', `lifted ${d.kg} kg`);
          if (chance(0.4)) say(actor, body, 'strong');
        } else {
          measure(body, 'Strength', Math.round(d.maxKg), 'kg max', `failed ${d.kg} kg`);
          say(actor, body, 'weak');
          if (d.kg > d.maxKg * 1.6) {
            pushEvent(body, 'The weight is far too heavy. Something gives.', 'warn');
            applyImpact(body, [pick(['spine', 'humerusL', 'humerusR', 'forearmL', 'forearmR'])], d.kg / Math.max(1, d.maxKg) * 1.2, 'gives way under the load');
            for (const g of ['armL', 'armR', 'core']) body.muscles[g].health = Math.max(0, body.muscles[g].health - rand(5, 15));
          }
        }
      }
      if (actor.t > 3.6) setAction(actor, 'idle');
      break;
    }
    case 'punch': case 'kick': {
      body.exertion = 0.6;
      const period = a === 'punch' ? 0.55 : 0.8;
      const hitsWanted = a === 'punch' ? 3 : 2;
      const k = Math.floor(actor.t / period);
      if (k > d.hits && d.hits < hitsWanted) {
        d.hits = k;
        actor.props.bagHit = 1;
        const force = d.force * rand(0.9, 1.08);
        if (d.hits === 1) measure(body, a === 'punch' ? 'Punch force' : 'Kick force', Math.round(force), 'N', force > 5000 ? 'the bag nearly tears off' : '');
        const bone = a === 'punch' ? pick(['handL', 'handR']) : pick(['footL', 'footR', 'shinL', 'shinR']);
        applyImpact(body, [bone], force / (a === 'punch' ? 1100 : 2400) * 0.9 / Math.max(0.3, body.bones[bone].density), 'breaks on impact');
      }
      if (actor.t > period * (hitsWanted + 0.6)) setAction(actor, 'idle');
      break;
    }
    case 'balance': {
      body.exertion = 0.15;
      actor.wobble = (1 - clamp(cap.coordination, 0, 1)) * 0.6 + 0.04;
      if (actor.t >= d.dur) {
        measure(body, 'Balance time', d.time, 's', d.time < 3 ? 'toppled almost instantly' : d.time > 40 ? 'rock steady' : '');
        if (d.time < d.dur + 0.5 && d.time < 7) { setAction(actor, 'fall', { dur: 1.5, soft: true }, false); }
        else setAction(actor, 'idle');
      }
      break;
    }
    case 'think': {
      if (!d.answered && actor.t >= d.delay) {
        d.answered = true;
        say(actor, body, `${d.a} × ${d.b} = ${d.answer}${d.correct && cap.iq > 170 ? '. Also, I solved P vs NP.' : ''}`, { raw: true, dur: 3 });
        measure(body, 'Cognition', cap.iq, 'IQ est.', `${d.correct ? 'correct' : 'wrong'} in ${d.delay.toFixed(1)} s`);
      }
      if (actor.t > d.dur) setAction(actor, 'idle');
      break;
    }
    case 'dance': body.exertion = 0.55; if (!stumbleCheck(0.8) && actor.t > d.dur) setAction(actor, 'idle'); break;
    case 'getUp': if (actor.t > (d.dur || 1.2)) { actor.posture = 'stand'; setAction(actor, 'idle'); } break;
    case 'fall': if (actor.t > (d.dur || 1.6)) { setAction(actor, 'getUp', { dur: 1.2 }); } break;
    case 'dead': case 'stasis': case 'collapsed': case 'seizure': break;
    case 'sleeping': if (chance(0.1 * dt)) pushFlash(body, 'zzz', {}); break;
    case 'rage': {
      body.exertion = 0.5;
      if (chance(1.5 * dt)) { actor.props.bagHit = 0; }
      if (actor.t > (d.dur || 3)) setAction(actor, 'idle');
      break;
    }
    default: {
      if (d.dur !== undefined && actor.t > d.dur) {
        if (actor.posture === 'sit') setAction(actor, 'sit'); else if (actor.posture === 'crouch') setAction(actor, 'crouch'); else setAction(actor, 'idle');
      }
      if (a === 'vomit' && !d.done && actor.t > 0.8) {
        d.done = true;
        const purged = purgeStomach(body);
        body.vitals.hydration = Math.max(0, body.vitals.hydration - 2);
        pushFlash(body, 'vomit', {});
        pushEvent(body, `${body.name} vomits${purged ? ', bringing up part of what it drank' : ''}.`, 'warn');
      }
      if (a === 'breathFire' && !d.done && actor.t > 0.5) { d.done = true; pushFlash(body, 'fireBreath', {}); }
      if (a === 'flee') body.exertion = 0.8;
      break;
    }
  }

  // memory lapses during long commanded actions
  if (actor.commanded && ['walk', 'run', 'dance', 'balance'].includes(actor.action) && chance((1 - cap.memory) * 0.25 * dt)) {
    say(actor, body, 'amnesia');
    pushEvent(body, 'The subject forgets what it was doing.', 'warn');
    setAction(actor, 'idle');
  }

  // --- posture/lie blend ------------------------------------------------------------------
  const lying = ['dead', 'collapsed', 'sleeping', 'seizure', 'fall', 'lying', 'lieDown'].includes(actor.action)
    || (actor.action === 'stasis' && actor.posture === 'lie');
  actor.lie = approach(actor.lie, lying ? 1 : 0, lying ? (actor.action === 'lieDown' ? 3 : 6) : 3, dt);
  if (actor.action === 'getUp') actor.lie = approach(actor.lie, 0, 2.5, dt);

  // --- props ---------------------------------------------------------------------------------
  const P = actor.props;
  P.stool = approach(P.stool, actor.action === 'sit' || (actor.posture === 'sit' && actor.action !== 'walk') ? 1 : 0, 6, dt);
  P.barbell = approach(P.barbell, actor.action === 'lift' ? 1 : 0, 6, dt);
  P.bag = approach(P.bag, actor.action === 'punch' || actor.action === 'kick' ? 1 : 0, 5, dt);
  P.bagHit = Math.max(0, P.bagHit - dt * 3);

  // --- vertical physics -------------------------------------------------------------------------
  physics(actor, body, env, dt);

  // --- chatter ---------------------------------------------------------------------------------
  actor.chatterT -= dt;
  if (actor.chatterT <= 0) {
    actor.chatterT = rand(9, 18);
    if ((alive || body.undead) && !body.stasis && !body.sleeping && body.vitals.consciousness > 45 && !actor.speech) {
      say(actor, body, moodKey(body));
    }
  }
  if ((cap.telepathy || 0) > 0.5 && alive && !actor.speech) {
    actor.thoughtT -= dt;
    if (actor.thoughtT <= 0) { actor.thoughtT = rand(5, 10); say(actor, body, 'thoughts', { thought: true }); }
  }
}

function finishMove(actor, body, a, d) {
  if (a === 'walk' && actor.commanded) {
    const dist = Math.abs(actor.x - d.start);
    if (dist > 0.4 && actor.t > 0.2) measure(body, 'Gait speed', dist / actor.t, 'm/s', body.symptoms.limp ? 'limping' : '');
  }
  if (a === 'run' && actor.commanded) measure(body, 'Sprint speed', d.dist / Math.max(0.1, actor.t), 'm/s', `${Math.round(body.cap.stamina)}% stamina left`);
  actor.action = 'idle'; actor.t = 0; actor.data = {}; actor.commanded = false;
}

function physics(actor, body, env, dt) {
  const cap = body.cap;
  const lev = cap.levitation || 0;
  const g = 9.81 * Math.max(0, env.gravity) * (1 + (body.effects.heavy || 0) * 0.5);
  const canFloat = (body.alive || body.undead) && lev > 0.4 && !body.stasis;
  actor.hover = canFloat ? Math.min(2, (lev - 0.4) * 1.1) : 0;
  const flying = actor.action === 'jump' || actor.action === 'backflip';
  if (actor.hover > 0.02 && !flying) {
    actor.vy += ((actor.hover + Math.sin(actor.time * 1.7) * 0.06 - actor.y) * 8 - actor.vy * 3) * dt;
    actor.y += actor.vy * dt;
    if (actor.y < 0) { actor.y = 0; actor.vy = 0; }
    actor.airborne = actor.y > 0.05;
    actor.peakY = Math.max(actor.peakY, actor.y);
    return;
  }
  if (actor.y > 0 || actor.vy > 0) {
    if (!actor.airborne) { actor.airborne = true; actor.peakY = actor.y; }
    actor.vy -= g * (canFloat ? 0.3 : 1) * dt;
    actor.y += actor.vy * dt;
    actor.peakY = Math.max(actor.peakY, actor.y);
    if (actor.y <= 0) {
      const impactV = -actor.vy;
      actor.y = 0;
      if (body.transform.elastic >= 0.5 && impactV > 1.5) {
        actor.vy = impactV * 0.65;
        actor.y = 0.001;
        pushFlash(body, 'boing', {});
        return;
      }
      actor.vy = 0;
      actor.airborne = false;
      const absorb = 0.5 + 0.5 * clamp(cap.legStrength, 0, 2);
      const force = (impactV / 3.1) ** 2 / absorb;
      if (force > 1.4 && (body.alive || body.undead)) {
        const broken = applyImpact(body, ['footL', 'footR', 'shinL', 'shinR', 'femurL', 'femurR'].filter(() => chance(0.5)), force, 'snaps on landing');
        actor.shake = Math.min(1, force / 4);
        if (broken.length) setAction(actor, 'fall', { dur: 2 }, false);
      }
      if (force > 0.8) pushFlash(body, 'thud', { force });
    }
  } else {
    actor.airborne = false;
  }
}

// Involuntary behaviour when nothing else is going on.
function autonomous(actor, body, env, dt, seated = false) {
  const E = body.effects, S = body.symptoms, cap = body.cap;
  const cd = actor.auto;
  for (const k of Object.keys(cd)) cd[k] -= dt;
  const ready = (k, min, max) => { if ((cd[k] || 0) > 0) return false; cd[k] = rand(min, max); return true; };
  const doAct = (action, dur, extra = {}) => { setAction(actor, action, { dur, ...extra }, false); };
  if (body.undead) {
    if (ready('shamble', 3, 7)) setAction(actor, 'shamble', { target: rand(-WORLD_HALF + 0.5, WORLD_HALF - 0.5) }, false);
    if (ready('moan', 5, 10)) say(actor, body, 'zombie');
    return;
  }
  if (cap.fear > 1.3 && ready('flee', 2, 5)) {
    if (chance(0.5) && !seated && !canWalk(body)) { setAction(actor, 'flee', { target: actor.x > 0 ? -WORLD_HALF + 0.3 : WORLD_HALF - 0.3 }, false); }
    else doAct('cower', 3);
    return;
  }
  if (cap.aggression > 1.2 && ready('rage', 3, 7)) { doAct('rage', 3); if (chance(0.5)) say(actor, body, 'rage'); return; }
  if (S.vomit && ready('vomit', 5, 12) && chance(S.vomit)) { doAct('vomit', 1.8); return; }
  if (S.seizure && ready('seizeSym', 20, 40)) { body.seizure = rand(4, 8); return; }
  if (S.dance && ready('dance', 6, 12) && !seated && !canWalk(body)) { doAct('dance', 5, { quality: 60 }); return; }
  if ((S.laugh || (E.laughter || 0) > 0.6) && ready('laugh', 4, 9)) { doAct('laugh', 2.5); say(actor, body, 'laughter'); return; }
  if (cap.hallucination > 1 && ready('swat', 3, 7)) { doAct('swat', 2.5); if (chance(0.4)) say(actor, body, 'hallucinating'); return; }
  if (S.cough && ready('cough', 3, 9) && chance(S.cough)) { doAct('cough', 1.2); return; }
  if (S.wheeze && ready('wheeze', 5, 10)) { doAct('cough', 1.4); return; }
  if (S.sneeze && ready('sneeze', 5, 12)) { doAct('sneeze', 1.3); pushFlash(body, 'sneeze', {}); return; }
  if (S.hiccup && ready('hiccup', 2, 5)) { doAct('hiccup', 0.6); return; }
  if (S.chestPain && ready('chest', 6, 12) && chance(S.chestPain)) { doAct('clutchChest', 3); return; }
  if (S.headache && ready('head', 7, 14) && chance(S.headache)) { doAct('holdHead', 2.5); return; }
  if ((S.itch || S.rash) && ready('itch', 4, 9)) { doAct('scratch', 2.2); return; }
  if (S.howl && ready('howl', 8, 16)) { doAct('howl', 2.5); say(actor, body, 'AWOOOOOOO!', { raw: true }); pushFlash(body, 'howl', {}); return; }
  if ((E.fireBreath || 0) > 0.4 && ready('fire', 5, 11)) { doAct('breathFire', 1.6); return; }
  if (S.hydrophobia && ready('hydro', 10, 20)) { doAct('cower', 2); return; }
  if (!seated && (E.euphoria || 0) > 1.5 && ready('happyDance', 8, 16)) { doAct('dance', 4, { quality: 70 }); return; }
  if (!seated && cap.love > 0.8 && ready('love', 6, 12)) { doAct('blowKiss', 2); pushFlash(body, 'hearts', {}); return; }
  if (!seated && ready('wander', 6, 14) && chance(0.35) && cap.speed > 0.2 && !body.sleeping && !canWalk(body)) {
    setAction(actor, 'walk', { target: rand(-1.6, 1.6), start: actor.x, speedMul: 0.6 }, false);
    return;
  }
  if (!seated && ready('fidget', 4, 9)) { doAct(pick(['lookAround', 'shiftWeight', 'lookAround', 'scratchHead']), 2.2); }
}
