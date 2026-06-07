// Unit tests for src/insight.ts — derived signals (sparkline, ETA, median, weather).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparkline, etaMinutes, median, weatherWord } from '../../src/insight';

test('sparkline maps 0..100 to 8 block levels, empty → ""', () => {
  assert.equal(sparkline([]), '');
  assert.equal(sparkline([0]), '▁');
  assert.equal(sparkline([100]), '█');
  assert.equal(sparkline([50]), '▅');
  assert.equal(sparkline([150]), '█'); // clamp high
  assert.equal(sparkline([-10]), '▁'); // clamp low
});

test('sparkline keeps only the last `width` values', () => {
  assert.equal(sparkline([0, 0, 100, 100], 2).length, 2);
  assert.equal(sparkline([0, 100], 2), '▁█');
});

test('etaMinutes returns minutes on an upward trend, else -1', () => {
  assert.equal(etaMinutes([], 100, 50), -1);                          // no samples
  assert.equal(etaMinutes([[0, 0], [1, 10]], 100, 10), -1);          // <3 points
  // linear +10%/min over 3 samples, target 100 from cur 20 → 8 min
  assert.equal(etaMinutes([[0, 0], [60000, 10], [120000, 20]], 100, 20), 8);
  // flat/declining trend → -1
  assert.equal(etaMinutes([[0, 50], [60000, 50], [120000, 50]], 100, 50), -1);
  assert.equal(etaMinutes([[0, 50], [60000, 40], [120000, 30]], 100, 30), -1);
});

test('etaMinutes returns -1 once current already meets target', () => {
  assert.equal(etaMinutes([[0, 0], [60000, 50], [120000, 100]], 100, 100), -1);
});

test('median handles empty, odd, and even lengths', () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('weatherWord bands by pressure, compacting once at/over target', () => {
  assert.equal(weatherWord(10, 0), 'clear');
  assert.equal(weatherWord(40, 0), 'breezy');
  assert.equal(weatherWord(70, 0), 'dense');
  assert.equal(weatherWord(90, 0), 'stormy');
  assert.equal(weatherWord(80, 80), 'compacting');
  assert.equal(weatherWord(90, 95), 'stormy'); // below target → not compacting
});
