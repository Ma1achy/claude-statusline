// Unit tests for src/format.ts — number/time formatting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtK, fmtCountdown } from '../../src/format';

test('fmtK abbreviates thousands and millions (truncating)', () => {
  assert.equal(fmtK(0), '0');
  assert.equal(fmtK(999), '999');
  assert.equal(fmtK(1000), '1k');
  assert.equal(fmtK(1999), '1k'); // truncates, not rounds
  assert.equal(fmtK(1000000), '1M');
  assert.equal(fmtK(2500000), '2M');
});

test('fmtCountdown formats days/hours/minutes', () => {
  assert.equal(fmtCountdown(30), '0m');
  assert.equal(fmtCountdown(90), '1m');
  assert.equal(fmtCountdown(3600), '1h 0m');
  assert.equal(fmtCountdown(3661), '1h 1m');
  assert.equal(fmtCountdown(86400), '1d 0h');
  assert.equal(fmtCountdown(90000), '1d 1h');
});
