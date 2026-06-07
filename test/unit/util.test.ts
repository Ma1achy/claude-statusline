// Unit tests for the pure helpers in src/util.ts — imported directly from source
// via tsx, no bundle. These lock the C-truncation / positive-modulo semantics the
// rest of the colour/format math relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idiv, mod, env } from '../../src/util';

test('idiv truncates toward zero (C-like)', () => {
  assert.equal(idiv(7, 2), 3);
  assert.equal(idiv(-7, 2), -3); // toward zero, not -4
  assert.equal(idiv(255 * 50, 100), 127);
  assert.equal(idiv(0, 5), 0);
});

test('mod is always positive', () => {
  assert.equal(mod(7, 360), 7);
  assert.equal(mod(360, 360), 0);
  assert.equal(mod(-30, 360), 330);
  assert.equal(mod(-1, 3), 2);
});

test('env returns default when unset or empty', () => {
  const k = 'SL_UNIT_TEST_VAR_XYZ';
  delete process.env[k];
  assert.equal(env(k, 'fallback'), 'fallback');
  process.env[k] = '';
  assert.equal(env(k, 'fallback'), 'fallback');
  process.env[k] = 'set';
  assert.equal(env(k, 'fallback'), 'set');
  delete process.env[k];
});
