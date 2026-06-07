// Unit tests for colour-mode degradation in src/ansi.ts. tc() reads cfg.colorMode
// live, so resetConfigForTest() (which re-reads SL_COLOR_MODE) lets us exercise each
// mode in one process — previously only reachable end-to-end through the bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetConfigForTest } from '../../src/config';
import { tc, bg } from '../../src/ansi';

function withColorMode(mode: string, fn: () => void): void {
  const prev = process.env.SL_COLOR_MODE;
  process.env.SL_COLOR_MODE = mode;
  resetConfigForTest();
  try { fn(); } finally {
    if (prev === undefined) delete process.env.SL_COLOR_MODE; else process.env.SL_COLOR_MODE = prev;
    resetConfigForTest();
  }
}

test('tc emits a 24-bit escape in truecolor', () => {
  withColorMode('truecolor', () => assert.equal(tc(10, 20, 30), '\x1b[38;2;10;20;30m'));
});

test('tc emits nothing in mono', () => {
  withColorMode('mono', () => {
    assert.equal(tc(10, 20, 30), '');
    assert.equal(bg(10, 20, 30), '');
  });
});

test('tc quantizes to the 256-cube', () => {
  withColorMode('256', () => {
    assert.equal(tc(255, 0, 0), '\x1b[38;5;196m');   // pure red → cube index 196
    assert.match(tc(123, 200, 50), /^\x1b\[38;5;\d+m$/);
  });
});

test('tc quantizes to a 16-colour SGR', () => {
  withColorMode('16', () => {
    assert.equal(tc(255, 0, 0), '\x1b[91m');         // bright red
    assert.match(tc(20, 20, 20), /^\x1b\[\d+m$/);
  });
});
