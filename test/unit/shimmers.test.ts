// Unit tests for the shimmer strategies. They're pure functions of (sx, ctx) — no
// cfg/theme globals — so they unit-test directly, which the giant inline switch
// they replaced could not. Spot-checks lock representative crest/brightness math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUE_SHIMMERS, BRIGHT_SHIMMERS, type ShimmerCtx } from '../../src/anim/shimmers';

const tri = (x: number): number => { const m = ((Math.round(x) % 200) + 200) % 200; return m < 100 ? m : 200 - m; };
function ctx(over: Partial<ShimmerCtx> = {}): ShimmerCtx {
  return { t: 0, speed: 10, wrap: 2800, glow: 240, waveHue: 60, posc: 0, hglob: 0, filled: 14, event: false, tri, ...over };
}

test('breathe returns the global hue offset verbatim', () => {
  assert.equal(HUE_SHIMMERS.breathe(0, ctx({ hglob: 42 })), 42);
});

test('wave peaks at the crest and is zero far away', () => {
  assert.equal(HUE_SHIMMERS.wave(10, ctx({ posc: 10, waveHue: 60 })), 60); // torus 0 → full waveHue
  assert.equal(HUE_SHIMMERS.wave(600, ctx({ posc: 10, waveHue: 60 })), 0); // >450 away → 0
});

test('aurora aliases drift (same strategy)', () => {
  assert.equal(HUE_SHIMMERS.aurora, HUE_SHIMMERS.drift);
});

test('flash brightens only on the event tick', () => {
  assert.equal(BRIGHT_SHIMMERS.flash(0, ctx({ event: true })), 175);
  assert.equal(BRIGHT_SHIMMERS.flash(0, ctx({ event: false })), 100);
});

test('ripple rings the fill edge on update, dims otherwise', () => {
  assert.equal(BRIGHT_SHIMMERS.ripple(1400, ctx({ event: true, filled: 14 })), 175); // |1400-1400|<250
  assert.equal(BRIGHT_SHIMMERS.ripple(0, ctx({ event: true, filled: 14 })), 88);      // far from edge
  assert.equal(BRIGHT_SHIMMERS.ripple(1400, ctx({ event: false, filled: 14 })), 88);  // no event
});
