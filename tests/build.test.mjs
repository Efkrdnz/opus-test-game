import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../scripts/build.mjs';

test('the game bundles into one script with no name collisions', () => {
  const { code, modules } = bundle();
  assert.ok(modules >= 20, `bundled ${modules} modules`);
  assert.ok(!/^\s*import\s/m.test(code), 'no import statements left');
  assert.ok(!/^export\s/m.test(code), 'no export statements left');
  assert.doesNotThrow(() => new Function(code.replace('(() => {', '(() => { return;')), 'bundle parses as JavaScript');
});
