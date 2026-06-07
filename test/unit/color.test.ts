// Unit tests for src/color.ts — pure integer colour math. Spot-checks the primary
// colours at the cube corners plus interpolation/clamping, which the themes and
// shimmers all build on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hsv, cmapSample, shiftHue, hueRgb } from '../../src/color';

test('hsv hits the primary corners', () => {
  assert.deepEqual(hsv(0, 100, 100), [255, 0, 0]);
  assert.deepEqual(hsv(120, 100, 100), [0, 255, 0]);
  assert.deepEqual(hsv(240, 100, 100), [0, 0, 255]);
  assert.deepEqual(hsv(0, 0, 100), [255, 255, 255]); // no saturation → white
  assert.deepEqual(hsv(0, 0, 0), [0, 0, 0]);
});

test('hsv wraps hue modulo 360', () => {
  assert.deepEqual(hsv(360, 100, 100), hsv(0, 100, 100));
});

test('cmapSample interpolates and clamps to 0..100', () => {
  const stops = [[0, 0, 0], [255, 255, 255]] as [number, number, number][];
  assert.deepEqual(cmapSample(stops, 0), [0, 0, 0]);
  assert.deepEqual(cmapSample(stops, 100), [255, 255, 255]);
  assert.deepEqual(cmapSample(stops, 50), [128, 128, 128]);
  assert.deepEqual(cmapSample(stops, 200), [255, 255, 255]); // clamp high
  assert.deepEqual(cmapSample(stops, -50), [0, 0, 0]);       // clamp low
});

test('shiftHue rotates red toward green/blue', () => {
  assert.deepEqual(shiftHue([255, 0, 0], 0), [255, 0, 0]);
  assert.deepEqual(shiftHue([255, 0, 0], 120), [0, 255, 0]);
  assert.deepEqual(shiftHue([255, 0, 0], 240), [0, 0, 255]);
});

test('hueRgb: mix 0 is saturated, mix 100 is white', () => {
  assert.deepEqual(hueRgb(0, 0), [255, 0, 0]);
  assert.deepEqual(hueRgb(120, 0), [0, 255, 0]);
  assert.deepEqual(hueRgb(0, 100), [255, 255, 255]);
  assert.deepEqual(hueRgb(0, 50), [255, 127, 127]); // half toward white
});
