import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActor, issueCommand, updateActor, parseCommand } from '../js/sim/behavior.js';
import { stepBody, DEFAULT_ENV, SIM_STEP } from '../js/sim/physiology.js';
import { subject, give, seedRandom } from './helpers.mjs';
import { killBody } from '../js/sim/body.js';

function simulate(body, actor, seconds) {
  const n = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < n; i++) { stepBody(body, DEFAULT_ENV, SIM_STEP); updateActor(actor, body, DEFAULT_ENV, SIM_STEP); }
}

const obedient = (fn) => () => {
  const orig = Math.random;
  Math.random = () => 0.01; // every roll succeeds
  try { fn(); } finally { Math.random = orig; }
};

test('command parser understands synonyms and speech', () => {
  assert.deepEqual(parseCommand('Jump!'), { cmd: 'jump' });
  assert.deepEqual(parseCommand('sprint'), { cmd: 'run' });
  assert.deepEqual(parseCommand('walk left'), { cmd: 'left' });
  assert.deepEqual(parseCommand('say hello world'), { cmd: 'say', arg: 'hello world' });
  assert.equal(parseCommand('photosynthesise the moon').cmd, 'unknown');
});

test('a healthy subject jumps and the height is measured', obedient(() => {
  const b = subject(), a = createActor();
  simulate(b, a, 0.5);
  issueCommand(a, b, 'jump');
  simulate(b, a, 2);
  const m = b.measurements.find((x) => x.test === 'Jump height');
  assert.ok(m, 'jump recorded');
  assert.ok(m.value > 0.3 && m.value < 0.7, `height ${m.value}`);
}));

test('strength serum raises lifting capacity', obedient(() => {
  const plain = subject(), a1 = createActor();
  simulate(plain, a1, 0.5);
  issueCommand(a1, plain, 'lift');
  const buff = subject(), a2 = createActor();
  give(buff, [['minotaur_horn', 20], ['testosterone', 20]], 'iv', 40);
  simulate(buff, a2, 5);
  issueCommand(a2, buff, 'lift');
  assert.ok(a2.data.maxKg > a1.data.maxKg * 1.2, `${a2.data.maxKg} vs ${a1.data.maxKg}`);
}));

test('dead subjects do not respond', () => {
  const b = subject(), a = createActor();
  killBody(b, 'test');
  issueCommand(a, b, 'walk');
  assert.notEqual(a.action, 'walk');
  assert.ok(b.events.some((e) => /dead/i.test(e.text)));
});

test('broken legs prevent walking', obedient(() => {
  const b = subject(), a = createActor();
  for (const id of ['femurL', 'femurR']) { b.bones[id].fractured = true; b.bones[id].health = 10; }
  simulate(b, a, 0.3);
  issueCommand(a, b, 'walk');
  assert.notEqual(a.action, 'walk');
  assert.ok(b.events.some((e) => /legs are broken/.test(e.text)));
}));

test('a subject with a destroyed frontal lobe tends to refuse', () => {
  const restore = seedRandom(31);
  try {
    let refused = 0;
    for (let i = 0; i < 20; i++) {
      const b = subject(), a = createActor();
      b.brain.frontal.health = 3;
      simulate(b, a, 0.2);
      issueCommand(a, b, 'wave');
      if (a.action !== 'wave') refused++;
    }
    assert.ok(refused >= 12, `refused ${refused}/20`);
  } finally { restore(); }
});

test('every command runs without throwing', obedient(() => {
  const b = subject(), a = createActor();
  for (const cmd of ['walk', 'run', 'jump', 'sit', 'stand', 'crouch', 'wave', 'dance', 'lift', 'punch', 'kick', 'flex', 'balance', 'speak', 'think', 'backflip', 'sing', 'stretch', 'sleep', 'wake', 'come', 'left', 'right', 'stop']) {
    issueCommand(a, b, cmd);
    simulate(b, a, 1.5);
  }
  issueCommand(a, b, 'say', 'testing');
  simulate(b, a, 1);
  assert.ok(b.measurements.length > 3);
}));
